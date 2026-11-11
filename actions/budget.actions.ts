"use server"

import { cacheTag } from "next/cache"
import { ObjectId } from "mongodb"
import { getExtracted } from "next-intl/server"
import { z } from "zod"

import { runDomainMutation } from "@/lib/action-handler"
import { getBudgetsCollection } from "@/lib/collections"
import { toDecimal128 } from "@/lib/db"
import type { ActionResponse, Budget } from "@/lib/definitions"
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit"
import { getSchemas } from "@/schemas/server"
import type { BudgetFormValues } from "@/schemas/types"

import { getSession } from "./session.actions"

export async function createBudget(
  values: BudgetFormValues
): Promise<ActionResponse> {
  const t = await getExtracted()

  return runDomainMutation({
    rawInput: values,
    schema: async () => (await getSchemas()).createBudgetSchema(),
    rateLimit: { domain: "budget", preset: RATE_LIMIT_PRESETS.NORMAL },
    categoryCheck: (input) => ({
      key: input.categoryKey,
      expectedType: "outflow",
    }),
    revalidate: ["budgets"],
    successMessage: t("Budget has been created."),
    duplicateKeyMessage: t("This budget already exists!"),
    fallbackErrorMessage: t("Failed to create budget! Please try again later."),
    execute: async ({ input, user }) => {
      const budgetsCollection = await getBudgetsCollection()

      await budgetsCollection.insertOne({
        userId: new ObjectId(user.id),
        categoryKey: input.categoryKey,
        currency: input.currency,
        allocatedAmount: toDecimal128(input.allocatedAmount),
        startDate: input.startDate,
        endDate: input.endDate,
      })
    },
  })
}

export async function updateBudget(
  id: string,
  values: BudgetFormValues
): Promise<ActionResponse> {
  const t = await getExtracted()

  return runDomainMutation({
    rawInput: { id, values },
    validateId: {
      id,
      message: t("Invalid budget ID!"),
    },
    schema: async () => {
      const { createBudgetSchema } = await getSchemas()
      return z.object({
        id: z.string(),
        values: createBudgetSchema(),
      })
    },
    rateLimit: { domain: "budget", preset: RATE_LIMIT_PRESETS.NORMAL },
    categoryCheck: (input) => ({
      key: input.values.categoryKey,
      expectedType: "outflow",
    }),
    revalidate: ["budgets"],
    successMessage: t("Budget has been updated."),
    duplicateKeyMessage: t("This budget already exists!"),
    fallbackErrorMessage: t("Failed to update budget! Please try again later."),
    execute: async ({ input, user }) => {
      const budgetsCollection = await getBudgetsCollection()
      const result = await budgetsCollection.updateOne(
        { _id: new ObjectId(input.id), userId: new ObjectId(user.id) },
        {
          $set: {
            categoryKey: input.values.categoryKey,
            currency: input.values.currency,
            allocatedAmount: toDecimal128(input.values.allocatedAmount),
            startDate: input.values.startDate,
            endDate: input.values.endDate,
          },
        }
      )

      if (result.matchedCount === 0) {
        return {
          error: t("Budget not found or you don't have permission to edit!"),
        }
      }
    },
  })
}

export async function deleteBudget(id: string): Promise<ActionResponse> {
  const t = await getExtracted()

  return runDomainMutation<string>({
    rawInput: id,
    validateId: {
      id,
      message: t("Invalid budget ID!"),
    },
    rateLimit: { domain: "budget", preset: RATE_LIMIT_PRESETS.MODERATE },
    revalidate: ["budgets"],
    successMessage: t("Budget has been deleted."),
    fallbackErrorMessage: t("Failed to delete budget! Please try again later."),
    execute: async ({ input: budgetId, user }) => {
      const budgetsCollection = await getBudgetsCollection()
      const result = await budgetsCollection.deleteOne({
        _id: new ObjectId(budgetId),
        userId: new ObjectId(user.id),
      })

      if (result.deletedCount === 0) {
        return {
          error: t("Budget not found or you don't have permission to delete!"),
        }
      }
    },
  })
}

export async function getBudgets(): Promise<{
  error?: string
  budgets?: Budget[]
}> {
  const { error, user, session } = await getSession()

  if (!user || !session) {
    return { error }
  }

  return getCachedBudgets(user.id)
}

async function getCachedBudgets(userId: string) {
  "use cache: private"
  cacheTag(`budgets-${userId}`)

  const t = await getExtracted()

  try {
    const budgetsCollection = await getBudgetsCollection()
    const budgets = await budgetsCollection
      .find({ userId: new ObjectId(userId) })
      .sort({ startDate: -1, _id: -1 })
      .toArray()

    return {
      budgets: budgets.map((budget) => ({
        ...budget,
        _id: budget._id.toString(),
        userId: budget.userId.toString(),
        allocatedAmount: budget.allocatedAmount.toString(),
      })) as Budget[],
    }
  } catch (error) {
    console.error("Error fetching budgets:", error)
    return {
      error: t("Failed to load budgets! Please try again later."),
    }
  }
}
