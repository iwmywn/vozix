import "server-only"

import { revalidateTag } from "next/cache"

import { getActiveBanMongoFilter } from "@/actions/utils"
import {
  getRecurringTransactionsCollection,
  getTransactionsCollection,
  getUsersCollection,
} from "@/lib/collections"
import { normalizeToUTCMidnight } from "@/lib/date"
import { withTransaction } from "@/lib/db"
import type { DBRecurringTransaction } from "@/lib/definitions"
import { isDuplicateKeyError } from "@/lib/indexes"
import { getDueOccurrences, resolveScheduleBoundaries } from "@/lib/recurring"

export * from "@/lib/recurring"

export const DEFAULT_BATCH_SIZE = 5
export const DEFAULT_MAX_OCCURRENCES_PER_SCHEDULE = 100

export type RecurringRunSummary = {
  success: boolean
  createdCount: number
  createdIds: string[]
  skippedCount: number
  skippedReason: { id: string; reason: "notToday" | "existing" }[]
  affectedUserIds: string[]
  errors: { id: string; error: string }[]
  timestamp: string
}

export type ProcessRecurringOptions = {
  asOfDate?: Date
  batchSize?: number
  maxOccurrencesPerSchedule?: number
  onOccurrencesCreated?: (dates: Date[]) => Promise<void>
}

/**
 * Deep recurrence engine: encapsulates querying eligible schedules, excluding banned users,
 * batch processing, transactional occurrence insertion with deduplication, cache invalidation,
 * and per-schedule error isolation.
 */
export async function processDueRecurringTransactions(
  options: ProcessRecurringOptions = {}
): Promise<RecurringRunSummary> {
  const {
    asOfDate = new Date(),
    batchSize = DEFAULT_BATCH_SIZE,
    maxOccurrencesPerSchedule = DEFAULT_MAX_OCCURRENCES_PER_SCHEDULE,
    onOccurrencesCreated,
  } = options

  const [transactionsCollection, recurringCollection, usersCollection] =
    await Promise.all([
      getTransactionsCollection(),
      getRecurringTransactionsCollection(),
      getUsersCollection(),
    ])

  const todayUTC = normalizeToUTCMidnight(asOfDate)

  const bannedUsers = await usersCollection
    .find(getActiveBanMongoFilter(todayUTC), { projection: { _id: 1 } })
    .toArray()
  const bannedUserIds = bannedUsers.flatMap((u) => [u._id, u._id.toString()])

  /**
   * Query candidate recurring transactions to process:
   * - Exclude schedules belonging to banned users.
   * - Only process schedules whose start date has arrived (startDate <= todayUTC).
   * - Match active schedules (no endDate, endDate null, or endDate >= todayUTC).
   * - Match expired schedules that still have pending occurrences to backfill
   *   (lastGeneratedDate is unset/null or lastGeneratedDate < endDate).
   */
  const cursor = recurringCollection.find({
    ...(bannedUserIds.length > 0
      ? {
          userId: {
            $nin: bannedUserIds as unknown as DBRecurringTransaction["userId"][],
          },
        }
      : {}),
    startDate: { $lte: todayUTC },
    $or: [
      { endDate: { $exists: false } },
      { endDate: null as unknown as Date },
      { endDate: { $gte: todayUTC } },
      {
        $and: [
          { endDate: { $lt: todayUTC } },
          {
            $or: [
              { lastGeneratedDate: { $exists: false } },
              { lastGeneratedDate: null as unknown as Date },
              { $expr: { $lt: ["$lastGeneratedDate", "$endDate"] } },
            ],
          },
        ],
      },
    ],
  })

  const createdIds: string[] = []
  const skippedReason: { id: string; reason: "notToday" | "existing" }[] = []
  const affectedUserIds = new Set<string>()
  const datesToEnsure = new Set<number>()
  const errors: { id: string; error: string }[] = []

  let currentBatch: DBRecurringTransaction[] = []

  const processBatch = async (batch: DBRecurringTransaction[]) => {
    await Promise.all(
      batch.map(async (rec) => {
        try {
          const allDueDates = getDueOccurrences(rec, todayUTC)
          if (allDueDates.length === 0) {
            skippedReason.push({ id: rec._id.toString(), reason: "notToday" })
            const boundaries = resolveScheduleBoundaries(
              rec.startDate,
              rec.endDate,
              todayUTC
            )
            if (boundaries.status === "expired" && boundaries.endDateOnly) {
              await recurringCollection.updateOne(
                { _id: rec._id },
                {
                  $set: {
                    lastGeneratedDate: boundaries.endDateOnly,
                  },
                }
              )
              affectedUserIds.add(rec.userId.toString())
            }
            return
          }

          const effectiveLimit =
            typeof maxOccurrencesPerSchedule === "number" &&
            maxOccurrencesPerSchedule > 0
              ? maxOccurrencesPerSchedule
              : DEFAULT_MAX_OCCURRENCES_PER_SCHEDULE
          const dueDates = allDueDates.slice(0, effectiveLimit)

          let txResult: {
            skippedReason: { id: string; reason: "notToday" | "existing" }[]
            affectedUserIds: string[]
            scheduleCreatedIds: string[]
            scheduleDatesToEnsure: number[]
          }

          try {
            txResult = await withTransaction(async (dbSession) => {
              const attemptSkippedReason: {
                id: string
                reason: "notToday" | "existing"
              }[] = []
              const attemptAffectedUserIds: string[] = []
              const attemptCreatedIds: string[] = []
              const attemptDatesToEnsure: number[] = []

              const existingTxDocs = await transactionsCollection
                .find(
                  {
                    userId: rec.userId,
                    type: rec.type,
                    categoryKey: rec.categoryKey,
                    amount: rec.amount,
                    currency: rec.currency,
                    description: rec.description,
                    date: { $in: dueDates },
                  },
                  { session: dbSession }
                )
                .toArray()

              const existingDateSet = new Set(
                existingTxDocs.map((tx) => tx.date.getTime())
              )

              for (const targetDate of dueDates) {
                if (existingDateSet.has(targetDate.getTime())) {
                  attemptSkippedReason.push({
                    id: rec._id.toString(),
                    reason: "existing",
                  })
                  attemptAffectedUserIds.push(rec.userId.toString())
                }
              }

              const datesToInsert = dueDates.filter(
                (targetDate) => !existingDateSet.has(targetDate.getTime())
              )

              if (datesToInsert.length > 0) {
                const transactionDocs = datesToInsert.map((targetDate) => ({
                  userId: rec.userId,
                  type: rec.type,
                  categoryKey: rec.categoryKey,
                  amount: rec.amount,
                  currency: rec.currency,
                  description: rec.description,
                  date: targetDate,
                }))

                const insertResult = await transactionsCollection.insertMany(
                  transactionDocs,
                  { session: dbSession }
                )

                const insertedIds = Object.values(insertResult.insertedIds).map(
                  (id) => id.toString()
                )
                attemptCreatedIds.push(...insertedIds)
                for (const targetDate of datesToInsert) {
                  attemptDatesToEnsure.push(targetDate.getTime())
                }
              }

              const latestDate = dueDates[dueDates.length - 1]
              await recurringCollection.updateOne(
                { _id: rec._id },
                { $set: { lastGeneratedDate: latestDate } },
                { session: dbSession }
              )

              return {
                skippedReason: attemptSkippedReason,
                affectedUserIds: attemptAffectedUserIds,
                scheduleCreatedIds: attemptCreatedIds,
                scheduleDatesToEnsure: attemptDatesToEnsure,
              }
            })
          } catch (error) {
            if (isDuplicateKeyError(error)) {
              skippedReason.push({
                id: rec._id.toString(),
                reason: "existing",
              })
              affectedUserIds.add(rec.userId.toString())
              return
            }
            throw error
          }

          skippedReason.push(...txResult.skippedReason)
          for (const uid of txResult.affectedUserIds) {
            affectedUserIds.add(uid)
          }

          if (txResult.scheduleCreatedIds.length > 0) {
            createdIds.push(...txResult.scheduleCreatedIds)
            affectedUserIds.add(rec.userId.toString())
            for (const ms of txResult.scheduleDatesToEnsure) {
              datesToEnsure.add(ms)
            }
          }
        } catch (scheduleError) {
          const errorMsg =
            scheduleError instanceof Error
              ? scheduleError.message
              : String(scheduleError)
          errors.push({ id: rec._id.toString(), error: errorMsg })
        }
      })
    )
  }

  for await (const rec of cursor) {
    currentBatch.push(rec)
    if (currentBatch.length >= batchSize) {
      await processBatch(currentBatch)
      currentBatch = []
    }
  }

  if (currentBatch.length > 0) {
    await processBatch(currentBatch)
  }

  if (datesToEnsure.size > 0 && onOccurrencesCreated) {
    const dates = Array.from(datesToEnsure).map((ms) => new Date(ms))
    await onOccurrencesCreated(dates)
  }

  for (const userId of affectedUserIds) {
    revalidateTag(`transactions-${userId}`, { expire: 0 })
    revalidateTag(`recurringTransactions-${userId}`, { expire: 0 })
  }

  return {
    success: true,
    createdCount: createdIds.length,
    createdIds,
    skippedCount: skippedReason.length,
    skippedReason,
    affectedUserIds: Array.from(affectedUserIds),
    errors,
    timestamp: new Date().toISOString(),
  }
}
