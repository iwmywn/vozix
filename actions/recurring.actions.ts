"use server"

import { cacheTag } from "next/cache"
import { ObjectId } from "mongodb"
import { getExtracted } from "next-intl/server"

import { runDomainMutation } from "@/lib/action-handler"
import { getRecurringTransactionsCollection } from "@/lib/collections"
import { toDecimal128 } from "@/lib/db"
import type { ActionResponse, RecurringTransaction } from "@/lib/definitions"
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit"
import { getSchemas } from "@/schemas/server"
import type { RecurringTransactionFormValues } from "@/schemas/types"

import { getSession } from "./session.actions"

export async function createRecurringTransaction(
  values: RecurringTransactionFormValues
): Promise<ActionResponse> {
  const t = await getExtracted()

  return runDomainMutation({
    rawInput: values,
    schema: async () => (await getSchemas()).createRecurringTransactionSchema(),
    rateLimit: { domain: "recurring", preset: RATE_LIMIT_PRESETS.STRICT },
    categoryCheck: (input) => ({
      key: input.categoryKey,
      expectedType: input.type,
    }),
    revalidate: ["recurringTransactions"],
    successMessage: t("Recurring transaction has been created."),
    duplicateKeyMessage: t("This recurring transaction already exists!"),
    fallbackErrorMessage: t(
      "Failed to create recurring transaction! Please try again later."
    ),
    execute: async ({ input, user }) => {
      const recurringCollection = await getRecurringTransactionsCollection()

      await recurringCollection.insertOne({
        userId: new ObjectId(user.id),
        type: input.type,
        categoryKey: input.categoryKey,
        amount: toDecimal128(input.amount),
        currency: input.currency,
        description: input.description,
        frequency: input.frequency,
        randomEveryXDays: input.randomEveryXDays,
        startDate: input.startDate,
        endDate: input.endDate,
        lastGeneratedDate: undefined,
      })
    },
  })
}

export async function deleteRecurringTransaction(
  recurringId: string
): Promise<ActionResponse> {
  const t = await getExtracted()

  return runDomainMutation<string>({
    rawInput: recurringId,
    validateId: {
      id: recurringId,
      message: t("Invalid recurring transaction ID!"),
    },
    rateLimit: { domain: "recurring", preset: RATE_LIMIT_PRESETS.MODERATE },
    revalidate: ["recurringTransactions"],
    successMessage: t("Recurring transaction has been deleted."),
    fallbackErrorMessage: t(
      "Failed to delete recurring transaction! Please try again later."
    ),
    execute: async ({ input: recurringId, user }) => {
      const recurringCollection = await getRecurringTransactionsCollection()
      const result = await recurringCollection.deleteOne({
        _id: new ObjectId(recurringId),
        userId: new ObjectId(user.id),
      })

      if (result.deletedCount === 0) {
        return {
          error: t(
            "Recurring transaction not found or you don't have permission to delete!"
          ),
        }
      }
    },
  })
}

/**
 * Note: Updating existing recurring transactions is intentionally not supported
 * in order to preserve financial data integrity, schedule predictability, and audit consistency.
 * If modifications to schedule, amount, or frequency are needed, users should delete
 * the existing recurring schedule and create a new one.
 */
export async function getRecurringTransactions(): Promise<{
  error?: string
  recurringTransactions?: RecurringTransaction[]
}> {
  const { error, user, session } = await getSession()

  if (!user || !session) {
    return { error }
  }

  return getCachedRecurringTransactions(user.id)
}

async function getCachedRecurringTransactions(userId: string) {
  "use cache: private"
  cacheTag(`recurringTransactions-${userId}`)

  const t = await getExtracted()

  try {
    const recurringCollection = await getRecurringTransactionsCollection()
    const recurringTransactions = await recurringCollection
      .find({ userId: new ObjectId(userId) })
      .sort({ startDate: -1, _id: -1 })
      .toArray()

    return {
      recurringTransactions: recurringTransactions.map((recurring) => ({
        ...recurring,
        _id: recurring._id.toString(),
        userId: recurring.userId.toString(),
        amount: recurring.amount.toString(),
      })) as RecurringTransaction[],
    }
  } catch (error) {
    console.error("Error fetching recurring transactions:", error)
    return {
      error: t(
        "Failed to load recurring transactions! Please try again later."
      ),
    }
  }
}
