import Decimal from "decimal.js"
import * as z from "zod"

import { CATEGORY_TYPES } from "@/lib/category"
import { CURRENCIES, CURRENCY_CONFIG } from "@/lib/currency"
import { normalizeToUTCMidnight, parseToUTCMidnight } from "@/lib/date"
import { ASSIGNABLE_ROLES } from "@/lib/role"
import type { SchemaMessages } from "@/schemas/messages"

export function buildSchemas(messages: SchemaMessages) {
  const basePasswordSchema = () =>
    z
      .string()
      .min(1, { message: messages.passwordRequired })
      .regex(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$/, {
        message: messages.passwordFormat,
      })

  const baseUsernameSchema = () =>
    z
      .string()
      .min(3, { message: messages.usernameMinLength })
      .max(30, { message: messages.usernameMaxLength })
      .regex(/^[a-zA-Z0-9_.]+$/, {
        message: messages.usernameFormat,
      })

  const baseAmount = () =>
    z
      .string()
      .min(1, { message: messages.amountRequired })
      .regex(/^\d+(\.\d{1,2})?$/, {
        message: messages.amountInvalidNumber,
      })
      .refine(
        (val) => {
          try {
            return new Decimal(val).gte("0.01")
          } catch {
            return false
          }
        },
        { message: messages.amountMin }
      )
      .refine(
        (val) => {
          try {
            return new Decimal(val).lte("1_000_000_000_000")
          } catch {
            return false
          }
        },
        { message: messages.amountMax }
      )
      .transform((val) => new Decimal(val).toString())

  const validateAmountForCurrency = (
    currency: (typeof CURRENCIES)[number],
    amount: string,
    fieldPath: string,
    ctx: z.RefinementCtx
  ) => {
    const decimals = CURRENCY_CONFIG[currency].decimals
    try {
      const dec = new Decimal(amount)
      if (decimals === 0) {
        if (!dec.isInteger()) {
          ctx.addIssue({
            path: [fieldPath],
            message: messages.amountInvalidNumber,
            code: "custom",
          })
          return
        }
        if (dec.lt(1)) {
          ctx.addIssue({
            path: [fieldPath],
            message: messages.amountMin,
            code: "custom",
          })
        }
      } else if (dec.decimalPlaces() > decimals) {
        ctx.addIssue({
          path: [fieldPath],
          message: messages.amountInvalidNumber,
          code: "custom",
        })
      }
    } catch {
      // Handled by baseAmount
    }
  }

  const baseDateSchema = (requiredMessage: string) =>
    z
      .date({ message: requiredMessage })
      .transform((date) => parseToUTCMidnight(date) ?? date)

  const baseOptionalDateSchema = () =>
    z
      .date()
      .transform((date) => parseToUTCMidnight(date) ?? date)
      .optional()

  const baseCategoryKeySchema = () =>
    z
      .string()
      .min(1, { message: messages.categoryRequired })
      .transform((val) =>
        /^[0-9a-fA-F]{24}$/.test(val) ? val.toLowerCase() : val
      )

  const createSignInSchema = () =>
    z.object({
      username: z.string().min(1, { message: messages.usernameRequired }),
      password: basePasswordSchema(),
    })

  const createPasswordSchema = () =>
    z
      .object({
        currentPassword: z
          .string()
          .min(1, { message: messages.currentPasswordRequired }),
        newPassword: basePasswordSchema(),
        confirmPassword: z
          .string()
          .min(1, { message: messages.newPasswordRequired }),
        revokeOtherSessions: z.boolean(),
      })
      .superRefine((data, ctx) => {
        if (data.newPassword !== data.confirmPassword) {
          ctx.addIssue({
            path: ["confirmPassword"],
            message: messages.passwordsDoNotMatch,
            code: "custom",
          })
        }
      })

  const createTwoFactorPasswordSchema = () =>
    z.object({
      password: basePasswordSchema(),
    })

  const createTwoFactorCodeSchema = () =>
    z.object({
      code: z
        .string()
        .min(6, {
          message: messages.authenticatorCodeRequired,
        })
        .max(10, { message: messages.codeMaxLength })
        .regex(/^\d+$/, {
          message: messages.codeDigitsOnly,
        }),
      trustDevice: z.boolean().optional(),
    })

  const createNameSchema = () =>
    z.object({
      name: z
        .string()
        .min(1, { message: messages.nameRequired })
        .max(100, { message: messages.nameMaxLength })
        .regex(/^[\p{L}\s'-]+$/u, {
          message: messages.nameLettersOnly,
        }),
    })

  const createUsernameSchema = () =>
    z.object({
      username: baseUsernameSchema(),
    })

  const createTransactionSchema = () =>
    z
      .object({
        type: z.enum(CATEGORY_TYPES, {
          message: messages.transactionTypeRequired,
        }),
        categoryKey: baseCategoryKeySchema(),
        currency: z.enum(CURRENCIES, {
          message: messages.currencyRequired,
        }),
        amount: baseAmount(),
        description: z
          .string()
          .trim()
          .min(1, {
            message: messages.descriptionRequired,
          })
          .max(200, {
            message: messages.descriptionMaxLength,
          }),
        date: baseDateSchema(messages.dateRequired).refine(
          (date) => {
            // Allow up to UTC+14 (e.g., Kiribati / Line Islands) so users in the easternmost
            // timezones recording transactions on their local "today" are not falsely flagged as future dates.
            const maxAllowedMidnight = normalizeToUTCMidnight(
              new Date(Date.now() + 14 * 60 * 60 * 1000)
            )
            return date.getTime() <= maxAllowedMidnight.getTime()
          },
          {
            message: messages.dateCannotBeInFuture,
          }
        ),
      })
      .superRefine((data, ctx) => {
        validateAmountForCurrency(data.currency, data.amount, "amount", ctx)
      })

  const createCategorySchema = () =>
    z.object({
      type: z.enum(CATEGORY_TYPES, {
        message: messages.typeRequired,
      }),
      label: z
        .string()
        .trim()
        .min(1, { message: messages.categoryNameRequired })
        .max(50, {
          message: messages.categoryNameMaxLength,
        }),
      description: z
        .string()
        .trim()
        .min(1, { message: messages.descriptionRequired })
        .max(200, {
          message: messages.descriptionMaxLength,
        }),
    })

  const createBudgetSchema = () =>
    z
      .object({
        categoryKey: baseCategoryKeySchema(),
        currency: z.enum(CURRENCIES, {
          message: messages.currencyRequired,
        }),
        allocatedAmount: baseAmount(),
        startDate: baseDateSchema(messages.startDateRequired),
        endDate: baseDateSchema(messages.endDateRequired),
      })
      .superRefine((data, ctx) => {
        validateAmountForCurrency(
          data.currency,
          data.allocatedAmount,
          "allocatedAmount",
          ctx
        )
        if (data.endDate <= data.startDate) {
          ctx.addIssue({
            path: ["endDate"],
            message: messages.endDateAfterStartDate,
            code: "custom",
          })
        }
      })

  const createGoalSchema = () =>
    z
      .object({
        name: z
          .string()
          .trim()
          .min(1, { message: messages.goalNameRequired })
          .max(100, {
            message: messages.goalNameMaxLength,
          }),
        categoryKey: baseCategoryKeySchema(),
        currency: z.enum(CURRENCIES, {
          message: messages.currencyRequired,
        }),
        targetAmount: baseAmount(),
        startDate: baseDateSchema(messages.startDateRequired),
        endDate: baseDateSchema(messages.endDateRequired),
      })
      .superRefine((data, ctx) => {
        validateAmountForCurrency(
          data.currency,
          data.targetAmount,
          "targetAmount",
          ctx
        )
        if (data.endDate <= data.startDate) {
          ctx.addIssue({
            path: ["endDate"],
            message: messages.endDateAfterStartDate,
            code: "custom",
          })
        }
      })

  const createRecurringTransactionSchema = () =>
    z
      .object({
        type: z.enum(CATEGORY_TYPES, {
          message: messages.typeRequired,
        }),
        categoryKey: baseCategoryKeySchema(),
        currency: z.enum(CURRENCIES, {
          message: messages.currencyRequired,
        }),
        amount: baseAmount(),
        description: z
          .string()
          .trim()
          .min(1, {
            message: messages.descriptionRequired,
          })
          .max(200, {
            message: messages.descriptionMaxLength,
          }),
        frequency: z.enum(
          [
            "daily",
            "weekly",
            "bi-weekly",
            "monthly",
            "quarterly",
            "yearly",
            "random",
          ],
          {
            message: messages.frequencyRequired,
          }
        ),
        randomEveryXDays: z
          .number()
          .min(1, {
            message: messages.randomDaysRequired,
          })
          .max(365, {
            message: messages.randomDaysMax,
          })
          .optional(),
        startDate: baseDateSchema(messages.startDateRequired),
        endDate: baseOptionalDateSchema(),
      })
      .superRefine((data, ctx) => {
        validateAmountForCurrency(data.currency, data.amount, "amount", ctx)

        // Allow down to UTC-12 (Anywhere on Earth / AoE) so users in westernmost
        // timezones (e.g., UTC-8 to UTC-12) starting "today" in local evening are not falsely rejected as past dates.
        const minAllowedMidnight = normalizeToUTCMidnight(
          new Date(Date.now() + -12 * 60 * 60 * 1000)
        )
        if (data.startDate.getTime() < minAllowedMidnight.getTime()) {
          ctx.addIssue({
            path: ["startDate"],
            message: messages.startDateMustBeInFuture,
            code: "custom",
          })
        }

        if (data.frequency === "random" && !data.randomEveryXDays) {
          ctx.addIssue({
            path: ["randomEveryXDays"],
            message: messages.randomDaysRequired,
            code: "custom",
          })
        }

        if (data.endDate && data.endDate <= data.startDate) {
          ctx.addIssue({
            path: ["endDate"],
            message: messages.endDateAfterStartDate,
            code: "custom",
          })
        }
      })

  const createAdminUserSchema = () =>
    z.object({
      email: z.email({ message: messages.emailInvalid }),
      password: basePasswordSchema(),
      name: z
        .string()
        .min(1, { message: messages.nameRequired })
        .max(100, { message: messages.nameMaxLength }),
      username: baseUsernameSchema(),
      role: z.enum(ASSIGNABLE_ROLES, {
        message: messages.roleRequired,
      }),
    })

  const createAdminPasswordSchema = createTwoFactorPasswordSchema

  const createAdminBanSchema = () =>
    z.object({
      banReason: z
        .string()
        .min(1)
        .max(200, { message: messages.banReasonMaxLength })
        .optional(),
      duration: z.string().min(1, { message: messages.durationRequired }),
    })

  return {
    createSignInSchema,
    createPasswordSchema,
    createTwoFactorPasswordSchema,
    createTwoFactorCodeSchema,
    createNameSchema,
    createUsernameSchema,
    createTransactionSchema,
    createCategorySchema,
    createBudgetSchema,
    createGoalSchema,
    createRecurringTransactionSchema,
    createAdminUserSchema,
    createAdminPasswordSchema,
    createAdminBanSchema,
  }
}
