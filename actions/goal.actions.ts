"use server"

import { cacheTag } from "next/cache"
import { ObjectId } from "mongodb"
import { getExtracted } from "next-intl/server"
import { z } from "zod"

import { runDomainMutation } from "@/lib/action-handler"
import { getGoalsCollection } from "@/lib/collections"
import { toDecimal128 } from "@/lib/db"
import type { ActionResponse, Goal } from "@/lib/definitions"
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit"
import { getSchemas } from "@/schemas/server"
import type { GoalFormValues } from "@/schemas/types"

import { getSession } from "./session.actions"

export async function createGoal(
  values: GoalFormValues
): Promise<ActionResponse> {
  const t = await getExtracted()

  return runDomainMutation({
    rawInput: values,
    schema: async () => (await getSchemas()).createGoalSchema(),
    rateLimit: { domain: "goal", preset: RATE_LIMIT_PRESETS.NORMAL },
    categoryCheck: (input) => ({
      key: input.categoryKey,
      expectedType: "inflow",
    }),
    revalidate: ["goals"],
    successMessage: t("Goal has been created."),
    duplicateKeyMessage: t("This goal already exists!"),
    fallbackErrorMessage: t("Failed to create goal! Please try again later."),
    execute: async ({ input, user }) => {
      const goalsCollection = await getGoalsCollection()

      await goalsCollection.insertOne({
        userId: new ObjectId(user.id),
        categoryKey: input.categoryKey,
        name: input.name,
        targetAmount: toDecimal128(input.targetAmount),
        currency: input.currency,
        startDate: input.startDate,
        endDate: input.endDate,
      })
    },
  })
}

export async function updateGoal(
  id: string,
  values: GoalFormValues
): Promise<ActionResponse> {
  const t = await getExtracted()

  return runDomainMutation({
    rawInput: { id, values },
    validateId: {
      id,
      message: t("Invalid goal ID!"),
    },
    schema: async () => {
      const { createGoalSchema } = await getSchemas()
      return z.object({
        id: z.string(),
        values: createGoalSchema(),
      })
    },
    rateLimit: { domain: "goal", preset: RATE_LIMIT_PRESETS.NORMAL },
    categoryCheck: (input) => ({
      key: input.values.categoryKey,
      expectedType: "inflow",
    }),
    revalidate: ["goals"],
    successMessage: t("Goal has been updated."),
    duplicateKeyMessage: t("This goal already exists!"),
    fallbackErrorMessage: t("Failed to update goal! Please try again later."),
    execute: async ({ input, user }) => {
      const goalsCollection = await getGoalsCollection()
      const result = await goalsCollection.updateOne(
        { _id: new ObjectId(input.id), userId: new ObjectId(user.id) },
        {
          $set: {
            categoryKey: input.values.categoryKey,
            name: input.values.name,
            targetAmount: toDecimal128(input.values.targetAmount),
            currency: input.values.currency,
            startDate: input.values.startDate,
            endDate: input.values.endDate,
          },
        }
      )

      if (result.matchedCount === 0) {
        return {
          error: t("Goal not found or you don't have permission to edit!"),
        }
      }
    },
  })
}

export async function deleteGoal(id: string): Promise<ActionResponse> {
  const t = await getExtracted()

  return runDomainMutation<string>({
    rawInput: id,
    validateId: {
      id,
      message: t("Invalid goal ID!"),
    },
    rateLimit: { domain: "goal", preset: RATE_LIMIT_PRESETS.MODERATE },
    revalidate: ["goals"],
    successMessage: t("Goal has been deleted."),
    fallbackErrorMessage: t("Failed to delete goal! Please try again later."),
    execute: async ({ input: goalId, user }) => {
      const goalsCollection = await getGoalsCollection()
      const result = await goalsCollection.deleteOne({
        _id: new ObjectId(goalId),
        userId: new ObjectId(user.id),
      })

      if (result.deletedCount === 0) {
        return {
          error: t("Goal not found or you don't have permission to delete!"),
        }
      }
    },
  })
}

export async function getGoals(): Promise<{
  error?: string
  goals?: Goal[]
}> {
  const { error, user, session } = await getSession()

  if (!user || !session) {
    return { error }
  }

  return getCachedGoals(user.id)
}

async function getCachedGoals(userId: string) {
  "use cache: private"
  cacheTag(`goals-${userId}`)

  const t = await getExtracted()

  try {
    const goalsCollection = await getGoalsCollection()
    const goals = await goalsCollection
      .find({ userId: new ObjectId(userId) })
      .sort({ startDate: -1, _id: -1 })
      .toArray()

    return {
      goals: goals.map((goal) => ({
        ...goal,
        _id: goal._id.toString(),
        userId: goal.userId.toString(),
        targetAmount: goal.targetAmount.toString(),
      })) as Goal[],
    }
  } catch (error) {
    console.error("Error fetching goals:", error)
    return {
      error: t("Failed to load goals! Please try again later."),
    }
  }
}
