import "server-only"

import { revalidateTag } from "next/cache"
import Decimal from "decimal.js"
import { Decimal128 } from "mongodb"

import { serverEnv } from "@/env/server"
import {
  getExchangeRatesCollection,
  getMissingExchangeRatesCollection,
  getTransactionsCollection,
} from "@/lib/collections"
import { convertAmountWithRates, CURRENCIES } from "@/lib/currency"
import type { Currency } from "@/lib/currency"
import { normalizeToUTCMidnight } from "@/lib/date"
import { withTransaction } from "@/lib/db"
import type {
  DBExchangeRate,
  ExchangeRate,
  RatesMap,
  Transaction,
} from "@/lib/definitions"

export {
  convertAmountWithRates,
  resolveTransactionAmount,
} from "@/lib/currency"

export interface ExchangeRateProvider {
  fetchRates(dateStr: string): Promise<Record<string, number>>
}

type CurrencyApiRateItem = {
  code: string
  value: number
}

type CurrencyApiResponse = {
  meta: {
    last_updated_at: string
  }
  data: Record<string, CurrencyApiRateItem>
}

export class CurrencyApiAdapter implements ExchangeRateProvider {
  async fetchRates(dateStr: string): Promise<Record<string, number>> {
    const apiUrl = `https://api.currencyapi.com/v3/historical?currencies=${CURRENCIES.join(",")}&date=${dateStr}`

    try {
      const response = await fetch(apiUrl, {
        headers: { apikey: serverEnv.CURRENCY_API_SECRET },
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) {
        throw new Error(
          `Currency API returned status ${response.status} for date ${dateStr}`
        )
      }

      const result = (await response.json()) as CurrencyApiResponse
      return Object.fromEntries(
        Object.entries(result.data).map(([code, item]) => [code, item.value])
      )
    } catch (error) {
      throw new Error(
        `Failed to fetch currency rates for date ${dateStr}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

export class InMemoryExchangeRateAdapter implements ExchangeRateProvider {
  constructor(
    private ratesByDate: Record<string, Record<string, number>> = {}
  ) {}

  setRates(dateStr: string, rates: Record<string, number>) {
    this.ratesByDate[dateStr] = rates
  }

  async fetchRates(dateStr: string): Promise<Record<string, number>> {
    const rates = this.ratesByDate[dateStr]
    if (!rates) {
      throw new Error(
        `Failed to fetch currency rates for date ${dateStr}: No rates configured in mock adapter`
      )
    }
    return rates
  }
}

function isValidRate(rate: unknown): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0
}

export const defaultExchangeRateProvider: ExchangeRateProvider =
  new CurrencyApiAdapter()

export async function ensureExchangeRateForDate(
  date: Date,
  provider: ExchangeRateProvider = defaultExchangeRateProvider
): Promise<void> {
  const normalizedDate = normalizeToUTCMidnight(date)
  const collection = await getExchangeRatesCollection()
  const existing = await collection.findOne({ date: normalizedDate })

  const nonUSDCurrencies = CURRENCIES.filter((c) => c !== "USD")
  const missingCurrencies = nonUSDCurrencies.filter(
    (curr) => !existing?.rates || existing.rates[curr] === undefined
  )

  if (missingCurrencies.length === 0) return

  const dateStr = normalizedDate.toISOString().split("T")[0]
  const fetchedRates = await provider.fetchRates(dateStr)

  const missingFromFetched = missingCurrencies.filter(
    (curr) => !isValidRate(fetchedRates[curr])
  )
  if (missingFromFetched.length > 0) {
    throw new Error(
      `Exchange rate provider missing currencies [${missingFromFetched.join(", ")}] for date ${dateStr}`
    )
  }

  const updateFields: Record<string, Decimal128> = {}
  for (const [curr, rateVal] of Object.entries(fetchedRates)) {
    if (curr === "USD") continue
    if (!isValidRate(rateVal)) continue
    updateFields[`rates.${curr}`] = Decimal128.fromString(rateVal.toString())
  }

  if (Object.keys(updateFields).length > 0) {
    await collection.updateOne(
      { date: normalizedDate },
      { $set: updateFields },
      { upsert: true }
    )
  }
}

export async function enqueueMissingExchangeRateDate(
  date: Date,
  error?: unknown,
  incrementRetry: boolean = false
): Promise<void> {
  const collection = await getMissingExchangeRatesCollection()
  const normalizedDate = normalizeToUTCMidnight(date)

  await collection.updateOne(
    { date: normalizedDate },
    {
      $setOnInsert: {
        createdAt: new Date(),
        ...(incrementRetry ? {} : { retryCount: 0 }),
      },
      ...(incrementRetry ? { $inc: { retryCount: 1 } } : {}),
      $set: {
        ...(error !== undefined
          ? {
              lastError:
                error instanceof Error ? error.message : String(error ?? ""),
            }
          : {}),
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  )
}

export async function fetchCandidateExchangeRates(
  minDate: Date,
  maxDate: Date
): Promise<ExchangeRate[]> {
  const collection = await getExchangeRatesCollection()

  const [inRangeRates, priorRate, afterRate] = await Promise.all([
    collection
      .find({ date: { $gte: minDate, $lte: maxDate } })
      .sort({ date: 1 })
      .toArray(),
    collection.findOne({ date: { $lte: minDate } }, { sort: { date: -1 } }),
    collection.findOne({ date: { $gte: maxDate } }, { sort: { date: 1 } }),
  ])

  let rawRates: DBExchangeRate[] = [
    ...(priorRate ? [priorRate] : []),
    ...inRangeRates,
    ...(afterRate ? [afterRate] : []),
  ]

  if (rawRates.length === 0) {
    const latestDoc = await collection.findOne({}, { sort: { date: -1 } })
    if (latestDoc) {
      rawRates = [latestDoc]
    }
  }

  const uniqueDocs = Array.from(
    new Map(rawRates.map((doc) => [doc.date.getTime(), doc])).values()
  ).sort((a, b) => a.date.getTime() - b.date.getTime())

  return uniqueDocs.map((doc) => {
    const rates: RatesMap = { USD: new Decimal("1") }
    for (const [curr, val] of Object.entries(doc.rates ?? {})) {
      if (val) rates[curr] = new Decimal(val.toString())
    }
    return {
      ...doc,
      _id: doc._id.toString(),
      rates,
    } as ExchangeRate
  })
}

export function findNearestRate(
  rates: ExchangeRate[],
  txTime: number
): ExchangeRate {
  let low = 0
  let high = rates.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const midTime = rates[mid].date.getTime()
    if (midTime === txTime) return rates[mid]
    if (midTime < txTime) low = mid + 1
    else high = mid - 1
  }

  if (high < 0) return rates[0]
  if (low >= rates.length) return rates[rates.length - 1]

  const diffHigh = Math.abs(rates[high].date.getTime() - txTime)
  const diffLow = Math.abs(rates[low].date.getTime() - txTime)

  return diffHigh <= diffLow ? rates[high] : rates[low]
}

export async function convertTransactionsToCurrency(
  transactions: Transaction[],
  targetCurrency: Currency
): Promise<Transaction[]> {
  if (transactions.length === 0) return transactions

  let minTimestamp = Infinity
  let maxTimestamp = -Infinity
  const timestamps: number[] = []
  for (let i = 0; i < transactions.length; i++) {
    const time = normalizeToUTCMidnight(
      new Date(transactions[i].date)
    ).getTime()
    timestamps.push(time)
    if (time < minTimestamp) minTimestamp = time
    if (time > maxTimestamp) maxTimestamp = time
  }
  const minDate = new Date(minTimestamp)
  const maxDate = new Date(maxTimestamp)

  const rates = await fetchCandidateExchangeRates(minDate, maxDate)
  if (rates.length === 0) return transactions

  return transactions.map((transaction, idx) => {
    let nearestRate = findNearestRate(rates, timestamps[idx])

    if (transaction.currency === targetCurrency) {
      const stringifiedRates = Object.fromEntries(
        Object.entries(nearestRate.rates ?? {}).map(([curr, dec]) => [
          curr,
          dec.toString(),
        ])
      ) as Record<Currency, string>

      return {
        ...transaction,
        originalAmount: transaction.originalAmount ?? transaction.amount,
        originalCurrency: transaction.originalCurrency ?? transaction.currency,
        rates: transaction.rates ?? stringifiedRates,
      }
    }

    let rateFromVal = nearestRate.rates?.[transaction.currency]
    let rateToVal = nearestRate.rates?.[targetCurrency]

    if ((!rateFromVal || !rateToVal) && rates.length > 1) {
      const fallbackRate = rates.find(
        (r) => r.rates?.[transaction.currency] && r.rates?.[targetCurrency]
      )
      if (fallbackRate) {
        nearestRate = fallbackRate
        rateFromVal = fallbackRate.rates?.[transaction.currency]
        rateToVal = fallbackRate.rates?.[targetCurrency]
      }
    }

    const stringifiedRates = Object.fromEntries(
      Object.entries(nearestRate.rates ?? {}).map(([curr, dec]) => [
        curr,
        dec.toString(),
      ])
    ) as Record<Currency, string>

    if (!rateFromVal || !rateToVal) {
      return {
        ...transaction,
        originalAmount: transaction.originalAmount ?? transaction.amount,
        originalCurrency: transaction.originalCurrency ?? transaction.currency,
        rates: transaction.rates ?? stringifiedRates,
      }
    }

    const convertedAmount = convertAmountWithRates(
      new Decimal(transaction.amount),
      transaction.currency,
      targetCurrency,
      nearestRate.rates
    )

    return {
      ...transaction,
      amount: convertedAmount.toString(),
      currency: targetCurrency,
      originalAmount: transaction.originalAmount ?? transaction.amount,
      originalCurrency: transaction.originalCurrency ?? transaction.currency,
      rates: stringifiedRates,
    }
  })
}

export type QueueSyncResult = {
  success: boolean
  checkedCount: number
  missingCount: number
  batchCount: number
  syncedCount: number
  remainingCount: number
  errors: { date: string; error: string }[]
  timestamp: string
}

export type ReconcileQueueOptions = {
  maxDatesPerRun?: number
  provider?: ExchangeRateProvider
}

export const currencyEngine = {
  ensureExchangeRateForDate,
  enqueueMissingExchangeRateDate,
  convertTransactionsToCurrency,
  fetchCandidateExchangeRates,
  findNearestRate,
  reconcileMissingRatesQueue,
}

const MAX_QUEUE_RETRIES = 6

type MissingRatesCollection = Awaited<
  ReturnType<typeof getMissingExchangeRatesCollection>
>

async function markExhaustedRetriesAsFailed(
  collection: MissingRatesCollection
): Promise<void> {
  await withTransaction(async (session) => {
    await collection.updateMany(
      { retryCount: { $gte: MAX_QUEUE_RETRIES }, status: { $ne: "failed" } },
      { $set: { status: "failed", failedAt: new Date() } },
      { session }
    )
  })
}

function buildQueueResult(
  overrides: Partial<QueueSyncResult> = {}
): QueueSyncResult {
  return {
    success: true,
    checkedCount: 0,
    missingCount: 0,
    batchCount: 0,
    syncedCount: 0,
    remainingCount: 0,
    errors: [],
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Reconciles missing exchange rates from the queue:
 * - Checks queued dates from missing rates queue up to retry limit
 * - Syncs missing rates from provider
 * - Invalidates transactions cache for affected users
 * - Updates failure status for exhausted retries
 */
export async function reconcileMissingRatesQueue(
  options: ReconcileQueueOptions = {}
): Promise<QueueSyncResult> {
  const { maxDatesPerRun = 5, provider = defaultExchangeRateProvider } = options

  const [missingRatesCollection, exchangeRatesCollection] = await Promise.all([
    getMissingExchangeRatesCollection(),
    getExchangeRatesCollection(),
  ])

  // Check if there are any unfailed queued records at all
  const hasQueuedDocs = await missingRatesCollection.findOne({
    status: { $ne: "failed" },
  })

  if (!hasQueuedDocs) {
    return buildQueueResult()
  }

  // Mark any exhausted retries across the queue as failed
  const hasExhaustedRetries = await missingRatesCollection.findOne({
    retryCount: { $gte: MAX_QUEUE_RETRIES },
    status: { $ne: "failed" },
  })

  if (hasExhaustedRetries) {
    await markExhaustedRetriesAsFailed(missingRatesCollection)
  }

  // Fetch up to maxDatesPerRun retryable records
  const retryableDocs = await missingRatesCollection
    .find({
      status: { $ne: "failed" },
      $or: [
        { retryCount: { $lt: MAX_QUEUE_RETRIES } },
        { retryCount: { $exists: false } },
      ],
    })
    .sort({ createdAt: 1 })
    .limit(maxDatesPerRun)
    .toArray()

  if (retryableDocs.length === 0) {
    const remainingCount = await missingRatesCollection.countDocuments({
      status: { $ne: "failed" },
    })
    return buildQueueResult({ remainingCount })
  }

  const datesToCheck = new Set<number>()

  for (const doc of retryableDocs) {
    datesToCheck.add(normalizeToUTCMidnight(new Date(doc.date)).getTime())
  }

  const nonUSDCurrencies = CURRENCIES.filter((c) => c !== "USD")
  const checkDateObjs = Array.from(datesToCheck).map((ms) => new Date(ms))

  const existingRates = await exchangeRatesCollection
    .find({
      date: { $in: checkDateObjs },
    })
    .toArray()

  const existingMap = new Map(
    existingRates.map((r) => [r.date.getTime(), r.rates])
  )

  const missingDates: Date[] = []
  const resolvedDates: Date[] = []
  for (const ms of datesToCheck) {
    const rates = existingMap.get(ms)
    const isMissing =
      !rates || nonUSDCurrencies.some((c) => rates[c] === undefined)
    if (isMissing) {
      missingDates.push(new Date(ms))
    } else {
      resolvedDates.push(new Date(ms))
    }
  }

  // Clean up any queued records whose exchange rates are already fully resolved
  if (resolvedDates.length > 0) {
    await withTransaction(async (session) => {
      await missingRatesCollection.deleteMany(
        { date: { $in: resolvedDates } },
        { session }
      )
    })
  }

  missingDates.sort((a, b) => a.getTime() - b.getTime())

  let syncedCount = 0
  const successfullySyncedDates: Date[] = []
  const errors: { date: string; error: string }[] = []

  type SyncItemResult =
    | { success: true; date: Date }
    | { success: false; date: Date; error: string }

  const syncResults = await Promise.allSettled(
    missingDates.map(async (d): Promise<SyncItemResult> => {
      try {
        await currencyEngine.ensureExchangeRateForDate(d, provider)
        await missingRatesCollection.deleteOne({ date: d })
        return { success: true, date: d }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : String(error ?? "")
        await currencyEngine.enqueueMissingExchangeRateDate(d, error, true)
        return {
          success: false,
          date: d,
          error: errorMsg,
        }
      }
    })
  )

  for (let i = 0; i < syncResults.length; i++) {
    const res = syncResults[i]
    const dateStr = missingDates[i].toISOString().split("T")[0] as string
    if (res.status === "fulfilled") {
      if (res.value.success) {
        syncedCount++
        successfullySyncedDates.push(res.value.date)
      } else {
        errors.push({
          date: dateStr,
          error: res.value.error,
        })
      }
    } else {
      const errorMsg =
        res.reason instanceof Error
          ? res.reason.message
          : String(res.reason ?? "")
      errors.push({
        date: dateStr,
        error: errorMsg,
      })
    }
  }

  // Invalidate transactions cache for all users having transactions on synced dates
  if (successfullySyncedDates.length > 0) {
    const transactionsCollection = await getTransactionsCollection()
    const affectedTransactions = await transactionsCollection
      .find(
        { date: { $in: successfullySyncedDates } },
        { projection: { userId: 1 } }
      )
      .toArray()

    const affectedUserIds = new Set<string>()
    for (const tx of affectedTransactions) {
      if (tx.userId) {
        affectedUserIds.add(tx.userId.toString())
      }
    }
    for (const userId of affectedUserIds) {
      revalidateTag(`transactions-${userId}`, { expire: 0 })
    }
  }

  // Mark any dates that just reached retryCount >= MAX_QUEUE_RETRIES as failed
  if (errors.length > 0) {
    await markExhaustedRetriesAsFailed(missingRatesCollection)
  }

  const remainingCount = await missingRatesCollection.countDocuments({
    status: { $ne: "failed" },
  })

  return buildQueueResult({
    checkedCount: datesToCheck.size,
    missingCount: missingDates.length,
    batchCount: missingDates.length,
    syncedCount,
    remainingCount,
    errors,
  })
}
