import "server-only"

import { cacheTag } from "next/cache"
import { ObjectId } from "mongodb"
import type { ClientSession } from "mongodb"

import {
  ALL_PREDEFINED_CATEGORIES_KEY,
  getCategoryType,
  isPredefinedCategoryKey,
} from "@/lib/category"
import type { CategoryType } from "@/lib/category"
import {
  getBudgetsCollection,
  getCategoriesCollection,
  getGoalsCollection,
  getRecurringTransactionsCollection,
  getTransactionsCollection,
} from "@/lib/collections"
import { withTransaction } from "@/lib/db"
import type { Category } from "@/lib/definitions"

export type CategoryUsageCounts = {
  transactionCount: number
  budgetCount: number
  goalCount: number
  recurringTransactionCount: number
}

export type CategoryUsageSummary = CategoryUsageCounts & {
  inUse: boolean
}

export type CategoryDeletionResult =
  | {
      success: true
      error?: never
      counts?: never
      blockingEntity?: never
      blockingCount?: never
    }
  | {
      success: false
      error: "not_found"
      counts?: never
      blockingEntity?: never
      blockingCount?: never
    }
  | {
      success: false
      error: "in_use"
      counts: CategoryUsageCounts
      blockingEntity:
        | "transactions"
        | "budgets"
        | "goals"
        | "recurringTransactions"
      blockingCount: number
    }

export type CreateCategoryInput = {
  type: CategoryType
  label: string
  description: string
}

export type UpdateCategoryInput = CreateCategoryInput

export type CategoryUpdateResult =
  | { success: true; error?: never }
  | { success: false; error: "not_found" | "type_immutable" }

export type CatalogCategory = {
  key: string
  label?: string
  description?: string
  type: CategoryType
  isPredefined: boolean
}

/**
 * Validates whether a category key exists and optionally matches the expected flow type.
 * Supports both system predefined categories and user-scoped custom categories.
 */
export async function isValidCategory(
  userId: string,
  categoryKey: string,
  expectedType?: CategoryType
): Promise<boolean> {
  const category = await resolveCategory(userId, categoryKey)
  if (!category) {
    return false
  }

  if (expectedType && category.type !== expectedType) {
    return false
  }

  return true
}

/**
 * Resolves category details by identifier, unified across predefined and user custom categories.
 * Predefined categories resolve purely in memory without hitting the database.
 * Custom categories are looked up from the user's cached category list.
 */
export async function resolveCategory(
  userId: string,
  categoryKey: string
): Promise<CatalogCategory | null> {
  if (isPredefinedCategoryKey(categoryKey)) {
    const type = getCategoryType(categoryKey)
    return type
      ? {
          key: categoryKey,
          type,
          isPredefined: true,
        }
      : null
  }

  if (!ObjectId.isValid(categoryKey) || !ObjectId.isValid(userId)) {
    return null
  }

  const customCategories = await getCachedCustomCategories(userId)
  const normalizedKey = new ObjectId(categoryKey).toHexString()
  const custom = customCategories.find((c) => c._id === normalizedKey)

  if (!custom) {
    return null
  }

  return {
    key: custom._id,
    label: custom.label,
    description: custom.description,
    type: custom.type,
    isPredefined: false,
  }
}

/**
 * Returns a unified category catalog combining predefined categories and user custom categories.
 */
export async function getCategoryCatalog(
  userId: string
): Promise<CatalogCategory[]> {
  const customCategories = await getCachedCustomCategories(userId)

  const predefined: CatalogCategory[] = ALL_PREDEFINED_CATEGORIES_KEY.map(
    (key) => ({
      key,
      type: getCategoryType(key)!,
      isPredefined: true,
    })
  )

  const custom: CatalogCategory[] = customCategories.map((c) => ({
    key: c._id,
    label: c.label,
    description: c.description,
    type: c.type,
    isPredefined: false,
  }))

  return [...predefined, ...custom]
}

/**
 * Inspects all entity collections to check if a category is currently referenced.
 */
export async function getCategoryUsage(
  userId: string,
  categoryId: string,
  session?: ClientSession
): Promise<CategoryUsageSummary> {
  const [
    transactionsCollection,
    budgetsCollection,
    goalsCollection,
    recurringTransactionsCollection,
  ] = await Promise.all([
    getTransactionsCollection(),
    getBudgetsCollection(),
    getGoalsCollection(),
    getRecurringTransactionsCollection(),
  ])

  if (!ObjectId.isValid(userId)) {
    return {
      inUse: false,
      transactionCount: 0,
      budgetCount: 0,
      goalCount: 0,
      recurringTransactionCount: 0,
    }
  }

  const userObjectId = new ObjectId(userId)
  const normalizedCategoryId = ObjectId.isValid(categoryId)
    ? new ObjectId(categoryId).toHexString()
    : categoryId

  const filter = {
    userId: userObjectId,
    categoryKey: normalizedCategoryId,
  }

  let transactionCount: number
  let budgetCount: number
  let goalCount: number
  let recurringTransactionCount: number

  if (session) {
    // MongoDB ClientSession wire protocol requires sequential operation execution
    transactionCount = await transactionsCollection.countDocuments(filter, {
      session,
    })
    budgetCount = await budgetsCollection.countDocuments(filter, { session })
    goalCount = await goalsCollection.countDocuments(filter, { session })
    recurringTransactionCount =
      await recurringTransactionsCollection.countDocuments(filter, { session })
  } else {
    ;[transactionCount, budgetCount, goalCount, recurringTransactionCount] =
      await Promise.all([
        transactionsCollection.countDocuments(filter),
        budgetsCollection.countDocuments(filter),
        goalsCollection.countDocuments(filter),
        recurringTransactionsCollection.countDocuments(filter),
      ])
  }

  const inUse =
    transactionCount > 0 ||
    budgetCount > 0 ||
    goalCount > 0 ||
    recurringTransactionCount > 0

  return {
    inUse,
    transactionCount,
    budgetCount,
    goalCount,
    recurringTransactionCount,
  }
}

/**
 * Core internal execution for deleting an unreferenced custom category.
 */
async function executeDeleteCustomCategory(
  userId: string,
  categoryId: string,
  session?: ClientSession
): Promise<CategoryDeletionResult> {
  if (!ObjectId.isValid(categoryId)) {
    return { success: false, error: "not_found" }
  }

  const normalizedCategoryId = new ObjectId(categoryId).toHexString()
  const categoryObjectId = new ObjectId(normalizedCategoryId)

  const categoriesCollection = await getCategoriesCollection()
  const existingCategory = await categoriesCollection.findOne(
    {
      _id: categoryObjectId,
      userId: new ObjectId(userId),
    },
    { session }
  )

  if (!existingCategory) {
    return { success: false, error: "not_found" }
  }

  const usage = await getCategoryUsage(userId, normalizedCategoryId, session)

  const blockingChecks: Array<{
    entity: "transactions" | "budgets" | "goals" | "recurringTransactions"
    count: number
  }> = [
    { entity: "transactions", count: usage.transactionCount },
    { entity: "budgets", count: usage.budgetCount },
    { entity: "goals", count: usage.goalCount },
    { entity: "recurringTransactions", count: usage.recurringTransactionCount },
  ]

  for (const check of blockingChecks) {
    if (check.count > 0) {
      return {
        success: false,
        error: "in_use",
        counts: usage,
        blockingEntity: check.entity,
        blockingCount: check.count,
      }
    }
  }

  await categoriesCollection.deleteOne(
    {
      _id: categoryObjectId,
      userId: new ObjectId(userId),
    },
    { session }
  )

  return { success: true }
}

/**
 * Atomically verifies referential integrity and deletes an unreferenced custom category.
 * Automatically wraps execution in an atomic database transaction if no session is provided.
 */
export async function deleteCustomCategory(
  userId: string,
  categoryId: string,
  session?: ClientSession
): Promise<CategoryDeletionResult> {
  if (session) {
    return executeDeleteCustomCategory(userId, categoryId, session)
  }

  return withTransaction((dbSession) =>
    executeDeleteCustomCategory(userId, categoryId, dbSession)
  )
}

/**
 * Creates a custom category record scoped to the authenticated user.
 */
export async function createCustomCategory(
  userId: string,
  input: CreateCategoryInput,
  session?: ClientSession
): Promise<{ categoryId: string }> {
  const categoriesCollection = await getCategoriesCollection()

  const insertResult = await categoriesCollection.insertOne(
    {
      userId: new ObjectId(userId),
      type: input.type,
      label: input.label,
      description: input.description,
    },
    { session }
  )

  return { categoryId: insertResult.insertedId.toString() }
}

/**
 * Updates a custom category record while preserving the immutability of its flow type.
 */
export async function updateCustomCategory(
  userId: string,
  categoryId: string,
  input: UpdateCategoryInput,
  session?: ClientSession
): Promise<CategoryUpdateResult> {
  if (!ObjectId.isValid(categoryId)) {
    return { success: false, error: "not_found" }
  }

  const categoriesCollection = await getCategoriesCollection()

  const result = await categoriesCollection.updateOne(
    {
      _id: new ObjectId(categoryId),
      userId: new ObjectId(userId),
      type: input.type,
    },
    {
      $set: {
        label: input.label,
        description: input.description,
      },
    },
    { session }
  )

  if (result.matchedCount === 0) {
    const existingCategory = await categoriesCollection.findOne(
      {
        _id: new ObjectId(categoryId),
        userId: new ObjectId(userId),
      },
      { projection: { type: 1 }, session }
    )

    if (existingCategory && existingCategory.type !== input.type) {
      return { success: false, error: "type_immutable" }
    }

    return { success: false, error: "not_found" }
  }

  return { success: true }
}

/**
 * Retrieves cached custom categories for a user, sorted descending by creation id.
 */
export async function getCachedCustomCategories(
  userId: string
): Promise<Category[]> {
  "use cache: private"
  cacheTag(`categories-${userId}`)

  const categoriesCollection = await getCategoriesCollection()
  const categories = await categoriesCollection
    .find({ userId: new ObjectId(userId) })
    .sort({ _id: -1 })
    .toArray()

  return categories.map((category) => ({
    ...category,
    _id: category._id.toString(),
    userId: category.userId.toString(),
  })) as Category[]
}

/**
 * Unified CategoryEngine domain facade.
 * Callers interact with all category capabilities through this single seam.
 */
export const CategoryEngine = {
  isValidCategory,
  resolveCategory,
  getCategoryCatalog,
  getCategoryUsage,
  deleteCustomCategory,
  createCustomCategory,
  updateCustomCategory,
  getCachedCustomCategories,
}
