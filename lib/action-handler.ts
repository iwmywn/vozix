import "server-only"

import { updateTag } from "next/cache"
import { after } from "next/server"
import { ObjectId } from "mongodb"
import { getExtracted } from "next-intl/server"
import type { z } from "zod"

import { getSession } from "@/actions/session.actions"
import type { CategoryType } from "@/lib/category"
import { CategoryEngine } from "@/lib/category-engine"
import type { ActionResponse, Session, User } from "@/lib/definitions"
import { isDuplicateKeyError } from "@/lib/indexes"
import { isRateLimited, RATE_LIMIT_PRESETS } from "@/lib/rate-limit"
import type { RateLimitOptions, RateLimitPreset } from "@/lib/rate-limit"

export type DomainResource =
  | "transactions"
  | "budgets"
  | "goals"
  | "recurringTransactions"
  | "recurring"
  | "categories"
  | "admin"
  | "users"

export interface ActionContext<TParsed> {
  input: TParsed
  user: User
  session: Session
}

export type CategoryCheckResult =
  | {
      key: string
      expectedType?: CategoryType
    }
  | null
  | undefined

export interface RunMutationConfig<TParsed, TOutput = void> {
  /**
   * Raw input to be validated by the schema or passed to execute.
   */
  rawInput: unknown

  /**
   * Pre-validation of MongoDB ObjectIds.
   */
  validateId?:
    | string
    | (string | undefined)[]
    | {
        id: string | (string | undefined)[]
        message?: string
      }

  /**
   * Zod schema or async schema factory.
   */
  schema?: () => Promise<z.ZodType<TParsed>> | z.ZodType<TParsed>

  /**
   * Rate limiting domain identifier and preset limit.
   */
  rateLimit: {
    domain: string
    preset: RateLimitOptions | RateLimitPreset
    key?: (user: User, input?: TParsed) => string
  }

  /**
   * Whether admin privileges are required for this action.
   */
  requireAdmin?: boolean

  /**
   * Optional declarative category integrity check.
   */
  categoryCheck?: (input: TParsed, user: User) => CategoryCheckResult

  /**
   * Domain cache tags to invalidate on successful mutation.
   */
  revalidate?:
    | DomainResource[]
    | string[]
    | ((user: User, input: TParsed) => (DomainResource | string)[])

  /**
   * Optional background task executed via next/server after().
   */
  onSuccessAfter?: (ctx: ActionContext<TParsed>) => Promise<void> | void

  /**
   * Success message returned on completion.
   */
  successMessage?: ((input: TParsed) => Promise<string> | string) | string

  /**
   * Optional custom error message when MongoDB throws duplicate key (E11000).
   */
  duplicateKeyMessage?: (() => Promise<string> | string) | string

  /**
   * Fallback error message if execution throws an unhandled error.
   */
  fallbackErrorMessage?: (() => Promise<string> | string) | string

  /**
   * The core mutation effect.
   */
  execute: (
    ctx: ActionContext<TParsed>
  ) => Promise<TOutput | ActionResponse | void>
}

/**
 * Resolves a domain resource name or custom string to a cache tag.
 */
export function resolveResourceTag(
  resource: DomainResource | string,
  userId: string
): string {
  switch (resource) {
    case "transactions":
      return `transactions-${userId}`
    case "budgets":
      return `budgets-${userId}`
    case "goals":
      return `goals-${userId}`
    case "recurring":
    case "recurringTransactions":
      return `recurringTransactions-${userId}`
    case "categories":
      return `categories-${userId}`
    case "admin":
    case "users":
      return `admin-users`
    default:
      return resource.includes("${user.id}")
        ? resource.replace("${user.id}", userId)
        : resource
  }
}

/**
 * Deep domain mutation runner.
 * Directly executes the pipeline: session authentication, admin role checking, rate limiting,
 * argument and ObjectId validation, Zod schema validation, category integrity checks,
 * cache tag revalidation, background task execution (after), and standardized error mapping.
 *
 * Designed for standard Server Actions (`async function`) where `getExtracted()`
 * is called once in the outer function scope.
 */
export async function runDomainMutation<TParsed, TOutput = void>(
  config: RunMutationConfig<TParsed, TOutput>
): Promise<ActionResponse> {
  const t = await getExtracted()

  try {
    // 1. Validate ObjectId parameters if defined
    if (config.validateId) {
      let ids: (string | undefined)[]
      let validationMsg: string | undefined

      if (
        typeof config.validateId === "string" ||
        Array.isArray(config.validateId)
      ) {
        ids = Array.isArray(config.validateId)
          ? config.validateId
          : [config.validateId]
      } else {
        ids = Array.isArray(config.validateId.id)
          ? config.validateId.id
          : [config.validateId.id]
        validationMsg = config.validateId.message
      }

      for (const candidate of ids) {
        if (!candidate || !ObjectId.isValid(candidate)) {
          return { error: validationMsg ?? t("Invalid ID!") }
        }
      }
    }

    // 2. Validate input with Zod schema if defined
    let parsedData: TParsed
    if (config.schema) {
      const schema = await config.schema()
      const parseResult = schema.safeParse(config.rawInput)

      if (!parseResult.success) {
        return { error: t("Invalid data!") }
      }
      parsedData = parseResult.data
    } else {
      parsedData = config.rawInput as TParsed
    }

    // 3. Authenticate session & verify roles
    const sessionResult = await getSession(config.requireAdmin ?? false)
    if (!sessionResult.user || !sessionResult.session) {
      return { error: sessionResult.error }
    }
    const { user, session } = sessionResult

    // 4. Check rate limits
    const rateLimitKey = config.rateLimit.key
      ? config.rateLimit.key(user, parsedData)
      : `${config.rateLimit.domain}:${user.id}`

    const rateLimitOptions: RateLimitOptions =
      typeof config.rateLimit.preset === "string"
        ? RATE_LIMIT_PRESETS[config.rateLimit.preset]
        : config.rateLimit.preset

    if (await isRateLimited(rateLimitKey, rateLimitOptions)) {
      return {
        error: t("Too many requests! Please slow down and try again later."),
      }
    }

    // 5. Check category integrity if configured
    if (config.categoryCheck) {
      const check = config.categoryCheck(parsedData, user)
      if (check) {
        const isValid = await CategoryEngine.isValidCategory(
          user.id,
          check.key,
          check.expectedType
        )
        if (!isValid) {
          return { error: t("Invalid category!") }
        }
      }
    }

    const ctx: ActionContext<TParsed> = {
      input: parsedData,
      user,
      session,
    }

    // 6. Execute domain mutation
    const executionResult = await config.execute(ctx)

    // If execute explicitly returned an ActionResponse error or success, respect it
    if (
      executionResult &&
      typeof executionResult === "object" &&
      "error" in executionResult &&
      executionResult.error !== undefined
    ) {
      return { error: executionResult.error }
    }

    // 7. Revalidate cache tags
    if (config.revalidate) {
      const tags =
        typeof config.revalidate === "function"
          ? config.revalidate(user, parsedData)
          : config.revalidate

      for (const tag of tags) {
        updateTag(resolveResourceTag(tag, user.id))
      }
    }

    // 8. Run background task via next/server after() if provided
    if (config.onSuccessAfter) {
      try {
        const res = config.onSuccessAfter(ctx)
        if (res && typeof (res as Promise<void>).then === "function") {
          after(async () => {
            try {
              await res
            } catch (afterError) {
              console.error(
                "Error running post-mutation background hook:",
                afterError
              )
            }
          })
        }
      } catch (afterError) {
        console.error("Error running post-mutation hook:", afterError)
      }
    }

    // 9. Craft success response
    if (
      executionResult &&
      typeof executionResult === "object" &&
      "success" in executionResult &&
      typeof executionResult.success === "string"
    ) {
      return { success: executionResult.success }
    }

    let successMsg: string
    if (typeof config.successMessage === "function") {
      successMsg = await config.successMessage(parsedData)
    } else if (config.successMessage) {
      successMsg = config.successMessage
    } else {
      successMsg = t("Operation completed successfully.")
    }

    return { success: successMsg }
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      let duplicateMsg: string
      if (typeof config.duplicateKeyMessage === "function") {
        duplicateMsg = await config.duplicateKeyMessage()
      } else if (config.duplicateKeyMessage) {
        duplicateMsg = config.duplicateKeyMessage
      } else {
        duplicateMsg = t("This item already exists!")
      }
      return { error: duplicateMsg }
    }

    console.error(
      `Error in domain mutation (${config.rateLimit.domain}):`,
      error
    )

    let fallbackMsg: string
    if (typeof config.fallbackErrorMessage === "function") {
      fallbackMsg = await config.fallbackErrorMessage()
    } else if (config.fallbackErrorMessage) {
      fallbackMsg = config.fallbackErrorMessage
    } else {
      fallbackMsg = t("Failed to complete action! Please try again later.")
    }

    return { error: fallbackMsg }
  }
}
