"use server"

import { cacheTag } from "next/cache"
import { after } from "next/server"
import { ObjectId } from "mongodb"
import { getExtracted } from "next-intl/server"
import { z } from "zod"

import { runDomainMutation } from "@/lib/action-handler"
import { getTransactionsCollection } from "@/lib/collections"
import type { Currency } from "@/lib/currency"
import type { ActionResponse, Transaction } from "@/lib/definitions"
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit"
import { getSchemas } from "@/schemas/server"
import type { TransactionFormValues } from "@/schemas/types"

import {
  convertTransactionsToCurrency,
  ensureExchangeRateForDate,
} from "./exchange-rates.actions"
import { getSession } from "./session.actions"
import { toDecimal128 } from "./utils"

export async function createTransaction(
  values: TransactionFormValues
): Promise<ActionResponse> {
  const t = await getExtracted()

  return runDomainMutation({
    rawInput: values,
    schema: async () => (await getSchemas()).createTransactionSchema(),
    rateLimit: { domain: "transaction", preset: RATE_LIMIT_PRESETS.NORMAL },
    categoryCheck: (input) => ({
      key: input.categoryKey,
      expectedType: input.type,
    }),
    revalidate: ["transactions"],
    onSuccessAfter: ({ input }) => {
      after(async () => {
        await ensureExchangeRateForDate(input.date)
      })
    },
    successMessage: t("Transaction has been created."),
    duplicateKeyMessage: t(
      "This transaction already exists! Please merge transactions or add more details in the description."
    ),
    fallbackErrorMessage: t(
      "Failed to create transaction! Please try again later."
    ),
    execute: async ({ input, user }) => {
      const transactionsCollection = await getTransactionsCollection()

      await transactionsCollection.insertOne({
        userId: new ObjectId(user.id),
        type: input.type,
        categoryKey: input.categoryKey,
        amount: toDecimal128(input.amount),
        currency: input.currency,
        description: input.description,
        date: input.date,
      })
    },
  })
}

export async function updateTransaction(
  id: string,
  values: TransactionFormValues
): Promise<ActionResponse> {
  const t = await getExtracted()

  return runDomainMutation({
    rawInput: { id, values },
    validateId: {
      id,
      message: t("Invalid transaction ID!"),
    },
    schema: async () => {
      const { createTransactionSchema } = await getSchemas()
      return z.object({
        id: z.string(),
        values: createTransactionSchema(),
      })
    },
    rateLimit: { domain: "transaction", preset: RATE_LIMIT_PRESETS.NORMAL },
    categoryCheck: (input) => ({
      key: input.values.categoryKey,
      expectedType: input.values.type,
    }),
    revalidate: ["transactions"],
    onSuccessAfter: ({ input }) => {
      after(async () => {
        await ensureExchangeRateForDate(input.values.date)
      })
    },
    successMessage: t("Transaction has been updated."),
    duplicateKeyMessage: t(
      "This transaction already exists! Please merge transactions or add more details in the description."
    ),
    fallbackErrorMessage: t(
      "Failed to update transaction! Please try again later."
    ),
    execute: async ({ input, user }) => {
      const transactionsCollection = await getTransactionsCollection()

      const result = await transactionsCollection.updateOne(
        {
          _id: new ObjectId(input.id),
          userId: new ObjectId(user.id),
        },
        {
          $set: {
            type: input.values.type,
            categoryKey: input.values.categoryKey,
            amount: toDecimal128(input.values.amount),
            currency: input.values.currency,
            description: input.values.description,
            date: input.values.date,
          },
        }
      )

      if (result.matchedCount === 0) {
        return {
          error: t(
            "Transaction not found or you don't have permission to edit!"
          ),
        }
      }
    },
  })
}

export async function deleteTransaction(
  transactionId: string
): Promise<ActionResponse> {
  const t = await getExtracted()

  return runDomainMutation<string>({
    rawInput: transactionId,
    validateId: {
      id: transactionId,
      message: t("Invalid transaction ID!"),
    },
    rateLimit: { domain: "transaction", preset: RATE_LIMIT_PRESETS.MODERATE },
    revalidate: ["transactions"],
    successMessage: t("Transaction has been deleted."),
    fallbackErrorMessage: t(
      "Failed to delete transaction! Please try again later."
    ),
    execute: async ({ input: transactionId, user }) => {
      const transactionsCollection = await getTransactionsCollection()
      const result = await transactionsCollection.deleteOne({
        _id: new ObjectId(transactionId),
        userId: new ObjectId(user.id),
      })

      if (result.deletedCount === 0) {
        return {
          error: t(
            "Transaction not found or you don't have permission to delete!"
          ),
        }
      }
    },
  })
}

export async function getTransactions(): Promise<{
  error?: string
  transactions?: Transaction[]
}> {
  const { error, user, session } = await getSession()

  if (!user || !session) {
    return { error }
  }

  return getCachedTransactions(user.id, user.currency as Currency)
}

async function getCachedTransactions(userId: string, targetCurrency: Currency) {
  "use cache: private"
  cacheTag(`transactions-${userId}`)

  const t = await getExtracted()

  try {
    const transactionsCollection = await getTransactionsCollection()
    const transactions = await transactionsCollection
      .find({ userId: new ObjectId(userId) })
      .sort({ date: -1, _id: -1 })
      .toArray()
    const mapped = transactions.map((transaction) => ({
      ...transaction,
      _id: transaction._id.toString(),
      userId: transaction.userId.toString(),
      amount: transaction.amount.toString(),
    })) as Transaction[]
    const converted = await convertTransactionsToCurrency(
      mapped,
      targetCurrency
    )

    return {
      transactions: converted,
    }
  } catch (error) {
    console.error("Error fetching transactions:", error)
    return { error: t("Failed to load transactions! Please try again later.") }
  }
}
