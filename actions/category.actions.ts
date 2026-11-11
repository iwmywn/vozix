"use server"

import { getExtracted } from "next-intl/server"
import { z } from "zod"

import { runDomainMutation } from "@/lib/action-handler"
import { CategoryEngine } from "@/lib/category-engine"
import type { ActionResponse, Category } from "@/lib/definitions"
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit"
import { getSchemas } from "@/schemas/server"
import type { CategoryFormValues } from "@/schemas/types"

import { getSession } from "./session.actions"

export async function createCustomCategory(
  values: CategoryFormValues
): Promise<ActionResponse> {
  const t = await getExtracted()

  return runDomainMutation({
    rawInput: values,
    schema: async () => (await getSchemas()).createCategorySchema(),
    rateLimit: { domain: "category", preset: RATE_LIMIT_PRESETS.NORMAL },
    revalidate: ["categories"],
    successMessage: t("Category has been created."),
    duplicateKeyMessage: t("This category already exists!"),
    fallbackErrorMessage: t(
      "Failed to create category! Please try again later."
    ),
    execute: async ({ input, user }) => {
      await CategoryEngine.createCustomCategory(user.id, input)
    },
  })
}

export async function updateCustomCategory(
  id: string,
  values: CategoryFormValues
): Promise<ActionResponse> {
  const t = await getExtracted()

  return runDomainMutation({
    rawInput: { id, values },
    validateId: {
      id,
      message: t("Invalid category ID!"),
    },
    schema: async () => {
      const { createCategorySchema } = await getSchemas()
      return z.object({
        id: z.string(),
        values: createCategorySchema(),
      })
    },
    rateLimit: { domain: "category", preset: RATE_LIMIT_PRESETS.NORMAL },
    revalidate: ["categories"],
    successMessage: t("Category has been updated."),
    duplicateKeyMessage: t("This category already exists!"),
    fallbackErrorMessage: t(
      "Failed to update category! Please try again later."
    ),
    execute: async ({ input, user }) => {
      const result = await CategoryEngine.updateCustomCategory(
        user.id,
        input.id,
        input.values
      )

      if (!result.success) {
        if (result.error === "type_immutable") {
          return {
            error: t("Category type cannot be changed!"),
          }
        }

        return {
          error: t("Category not found or you don't have permission to edit!"),
        }
      }
    },
  })
}

export async function deleteCustomCategory(
  categoryId: string
): Promise<ActionResponse> {
  const t = await getExtracted()

  return runDomainMutation<string>({
    rawInput: categoryId,
    validateId: {
      id: categoryId,
      message: t("Invalid category ID!"),
    },
    rateLimit: { domain: "category", preset: RATE_LIMIT_PRESETS.STRICT },
    revalidate: ["categories"],
    successMessage: t("Category has been deleted."),
    fallbackErrorMessage: t(
      "Failed to delete category! Please try again later."
    ),
    execute: async ({ input: id, user }) => {
      const result = await CategoryEngine.deleteCustomCategory(user.id, id)

      if (!result.success) {
        if (result.error === "not_found") {
          return {
            error: t(
              "Category not found or you don't have permission to delete!"
            ),
          }
        }

        if (result.error === "in_use") {
          switch (result.blockingEntity) {
            case "transactions":
              return {
                error: t(
                  "Cannot delete category. There are {count} transactions using this category. Please delete those transactions first.",
                  { count: result.blockingCount.toString() }
                ),
              }
            case "budgets":
              return {
                error: t(
                  "Cannot delete category. There are {count} budgets using this category. Please delete those budgets first.",
                  { count: result.blockingCount.toString() }
                ),
              }
            case "goals":
              return {
                error: t(
                  "Cannot delete category. There are {count} goals using this category. Please delete those goals first.",
                  { count: result.blockingCount.toString() }
                ),
              }
            case "recurringTransactions":
              return {
                error: t(
                  "Cannot delete category. There are {count} recurring transactions using this category. Please delete those recurring transactions first.",
                  { count: result.blockingCount.toString() }
                ),
              }
          }
        }
      }
    },
  })
}

export async function getCustomCategories(): Promise<{
  error?: string
  customCategories?: Category[]
}> {
  const { error, user, session } = await getSession()

  if (!user || !session) {
    return { error }
  }

  const t = await getExtracted()

  try {
    const customCategories = await CategoryEngine.getCachedCustomCategories(
      user.id
    )
    return { customCategories }
  } catch (error) {
    console.error("Error fetching custom categories:", error)
    return {
      error: t("Failed to load custom categories! Please try again later."),
    }
  }
}
