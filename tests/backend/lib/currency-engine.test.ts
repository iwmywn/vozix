import Decimal from "decimal.js"
import { ObjectId } from "mongodb"

import { insertTestMissingExchangeRate } from "@/tests/backend/helpers/database"
import {
  getExchangeRatesCollection,
  getMissingExchangeRatesCollection,
} from "@/lib/collections"
import {
  convertAmountWithRates,
  resolveTransactionAmount,
} from "@/lib/currency"
import {
  enqueueMissingExchangeRateDate,
  ensureExchangeRateForDate,
  findNearestRate,
  InMemoryExchangeRateAdapter,
  reconcileMissingRatesQueue,
} from "@/lib/currency-engine"
import type { ExchangeRate, Transaction } from "@/lib/definitions"

describe("CurrencyEngine", () => {
  describe("Pure Conversion Math (Isomorphic)", () => {
    it("should convert amount between currencies using USD peg", () => {
      const rates = {
        USD: 1,
        VND: 25000,
        JPY: 150,
      }

      // 100 JPY to VND: (100 / 150) * 25000 = 16666.666666666668
      const converted = convertAmountWithRates(100, "JPY", "VND", rates)
      expect(converted.toDecimalPlaces(0).toString()).toBe("16667")

      // Same currency returns original amount
      const same = convertAmountWithRates(100, "USD", "USD", rates)
      expect(same.toString()).toBe("100")
    })

    it("should resolve transaction amount using rates map on transaction", () => {
      const tx: Transaction = {
        _id: "tx-1",
        userId: "user-1",
        type: "outflow",
        categoryKey: "food_beverage",
        amount: "100",
        currency: "USD",
        originalAmount: "100",
        originalCurrency: "USD",
        description: "Dinner",
        date: new Date("2026-01-01"),
        rates: {
          USD: "1",
          VND: "25000",
          JPY: "150",
          CNY: "7",
          KRW: "1300",
        },
      }

      const inVND = resolveTransactionAmount(tx, "VND")
      expect(inVND?.toString()).toBe("2500000")

      const inUSD = resolveTransactionAmount(tx, "USD")
      expect(inUSD?.toString()).toBe("100")
    })
  })

  describe("ExchangeRateProvider Port & InMemory Adapter", () => {
    it("should sync missing rates using the injected InMemoryExchangeRateAdapter", async () => {
      const adapter = new InMemoryExchangeRateAdapter({
        "2026-05-01": {
          USD: 1,
          VND: 26000,
          JPY: 155,
          CNY: 7.2,
          KRW: 1350,
        },
      })

      const date = new Date("2026-05-01T00:00:00Z")
      await ensureExchangeRateForDate(date, adapter)

      const collection = await getExchangeRatesCollection()
      const savedDoc = await collection.findOne({ date })

      expect(savedDoc).toBeDefined()
      expect(savedDoc?.rates?.VND?.toString()).toBe("26000")
      expect(savedDoc?.rates?.JPY?.toString()).toBe("155")
    })

    it("should throw when InMemoryAdapter lacks rates for date", async () => {
      const adapter = new InMemoryExchangeRateAdapter()
      const date = new Date("2026-09-01T00:00:00Z")

      await expect(ensureExchangeRateForDate(date, adapter)).rejects.toThrow(
        /No rates configured/
      )
    })

    it("should throw when fetched rates are missing required currencies", async () => {
      const partialAdapter = new InMemoryExchangeRateAdapter({
        "2026-06-01": {
          USD: 1,
          VND: 26000,
          // missing JPY, CNY, KRW
        },
      })

      const date = new Date("2026-06-01T00:00:00Z")
      await expect(
        ensureExchangeRateForDate(date, partialAdapter)
      ).rejects.toThrow(/missing currencies/i)
    })

    it("should throw when fetched rates have invalid non-positive or non-finite rate values", async () => {
      const invalidAdapter = new InMemoryExchangeRateAdapter({
        "2026-06-02": {
          USD: 1,
          VND: -100,
          JPY: 0,
          CNY: Number.NaN,
          KRW: Number.POSITIVE_INFINITY,
        },
      })

      const date = new Date("2026-06-02T00:00:00Z")
      await expect(
        ensureExchangeRateForDate(date, invalidAdapter)
      ).rejects.toThrow(/missing currencies/i)
    })
  })

  describe("enqueueMissingExchangeRateDate", () => {
    it("should write lastError when error argument is provided", async () => {
      const date = new Date("2026-07-01T00:00:00Z")
      await enqueueMissingExchangeRateDate(date, new Error("API rate limit"))

      const collection = await getMissingExchangeRatesCollection()
      const doc = await collection.findOne({ date })
      expect(doc?.lastError).toBe("API rate limit")
    })

    it("should preserve existing lastError when called without an error argument", async () => {
      const date = new Date("2026-07-02T00:00:00Z")
      await enqueueMissingExchangeRateDate(date, new Error("Original failure"))

      const collection = await getMissingExchangeRatesCollection()
      const docBefore = await collection.findOne({ date })
      expect(docBefore?.lastError).toBe("Original failure")

      await enqueueMissingExchangeRateDate(date)

      const docAfter = await collection.findOne({ date })
      expect(docAfter?.lastError).toBe("Original failure")
      expect(docBefore?.updatedAt).toBeDefined()
      expect(docAfter?.updatedAt).toBeDefined()
      expect(docAfter!.updatedAt!.getTime()).toBeGreaterThanOrEqual(
        docBefore!.updatedAt!.getTime()
      )
    })
  })

  describe("findNearestRate (Interpolation)", () => {
    it("should binary search to closest rate by timestamp", () => {
      const rates: ExchangeRate[] = [
        {
          _id: "1",
          date: new Date("2026-01-01T00:00:00Z"),
          rates: { USD: new Decimal(1), VND: new Decimal(24000) },
        },
        {
          _id: "2",
          date: new Date("2026-01-10T00:00:00Z"),
          rates: { USD: new Decimal(1), VND: new Decimal(25000) },
        },
      ]

      const nearestToJan2 = findNearestRate(
        rates,
        new Date("2026-01-02T00:00:00Z").getTime()
      )
      expect(nearestToJan2._id).toBe("1")

      const nearestToJan9 = findNearestRate(
        rates,
        new Date("2026-01-09T00:00:00Z").getTime()
      )
      expect(nearestToJan9._id).toBe("2")
    })
  })

  describe("reconcileMissingRatesQueue", () => {
    it("should reconcile queued date using adapter and clear queue record", async () => {
      const pastDate = new Date("2026-04-10T00:00:00Z")
      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: pastDate,
        createdAt: new Date(),
      })

      const adapter = new InMemoryExchangeRateAdapter({
        "2026-04-10": {
          USD: 1,
          VND: 25500,
          JPY: 152,
          CNY: 7.1,
          KRW: 1320,
        },
      })

      const summary = await reconcileMissingRatesQueue({ provider: adapter })

      expect(summary.success).toBe(true)
      const missingCollection = await getMissingExchangeRatesCollection()
      const queued = await missingCollection.findOne({ date: pastDate })
      expect(queued).toBeNull()

      const exchangeCollection = await getExchangeRatesCollection()
      const resolved = await exchangeCollection.findOne({ date: pastDate })
      expect(resolved?.rates?.VND?.toString()).toBe("25500")
    })

    it("should retain queued record and increment retry when fetched rates lack required currencies", async () => {
      const pastDate = new Date("2026-04-15T00:00:00Z")
      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: pastDate,
        createdAt: new Date(),
        retryCount: 0,
      })

      const partialAdapter = new InMemoryExchangeRateAdapter({
        "2026-04-15": {
          USD: 1,
          VND: 25500,
          // missing JPY, CNY, KRW
        },
      })

      const summary = await reconcileMissingRatesQueue({
        provider: partialAdapter,
      })

      expect(summary.syncedCount).toBe(0)
      expect(summary.errors.length).toBeGreaterThan(0)

      const missingCollection = await getMissingExchangeRatesCollection()
      const queued = await missingCollection.findOne({ date: pastDate })
      expect(queued).not.toBeNull()
      expect(queued?.retryCount).toBe(1)
    })

    it("should return early when missing rates queue is empty without querying exchange rates or calling provider", async () => {
      const adapter = new InMemoryExchangeRateAdapter()
      const fetchSpy = vi.spyOn(adapter, "fetchRates")
      const exchangeRatesCollection = await getExchangeRatesCollection()
      const findSpy = vi.spyOn(exchangeRatesCollection, "find")
      const missingRatesCollection = await getMissingExchangeRatesCollection()
      const updateSpy = vi.spyOn(missingRatesCollection, "updateMany")
      const deleteSpy = vi.spyOn(missingRatesCollection, "deleteMany")

      const summary = await reconcileMissingRatesQueue({
        provider: adapter,
      })

      expect(summary.success).toBe(true)
      expect(summary.checkedCount).toBe(0)
      expect(summary.missingCount).toBe(0)
      expect(summary.batchCount).toBe(0)
      expect(summary.syncedCount).toBe(0)
      expect(summary.remainingCount).toBe(0)
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(findSpy).not.toHaveBeenCalled()
      expect(updateSpy).not.toHaveBeenCalled()
      expect(deleteSpy).not.toHaveBeenCalled()
    })

    it.each([
      {
        initialRetryCount: 0,
        expectedRetryCount: 0,
        description: "leaving remaining dates untouched",
      },
      {
        initialRetryCount: 3,
        expectedRetryCount: 3,
        description: "not incrementing retryCount for omitted queued dates",
      },
    ])(
      "should process oldest queued dates up to maxDatesPerRun ($description)",
      async ({ initialRetryCount, expectedRetryCount }) => {
        const olderDate = new Date("2024-01-01T00:00:00Z")
        const newerDate = new Date("2024-01-02T00:00:00Z")
        await insertTestMissingExchangeRate({
          _id: new ObjectId(),
          date: olderDate,
          createdAt: new Date("2024-01-01T00:00:00Z"),
          retryCount: 0,
        })
        await insertTestMissingExchangeRate({
          _id: new ObjectId(),
          date: newerDate,
          createdAt: new Date("2024-01-02T00:00:00Z"),
          retryCount: initialRetryCount,
        })

        const adapter = new InMemoryExchangeRateAdapter({
          [olderDate.toISOString().split("T")[0]]: {
            USD: 1,
            VND: 25000,
            JPY: 150,
            CNY: 7,
            KRW: 1300,
          },
        })

        const summary = await reconcileMissingRatesQueue({
          maxDatesPerRun: 1,
          provider: adapter,
        })

        expect(summary.batchCount).toBe(1)
        expect(summary.syncedCount).toBe(1)

        const missingCollection = await getMissingExchangeRatesCollection()
        const queuedDoc = await missingCollection.findOne({
          date: newerDate,
        })
        expect(queuedDoc).not.toBeNull()
        expect(queuedDoc?.retryCount).toBe(expectedRetryCount)
      }
    )

    it("should mark exhausted retries as failed without consuming batch slots for retryable dates", async () => {
      const exhaustedDate = new Date("2024-01-01T00:00:00Z")
      const retryableDate = new Date("2024-01-02T00:00:00Z")

      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: exhaustedDate,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        retryCount: 6,
      })
      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: retryableDate,
        createdAt: new Date("2024-01-02T00:00:00Z"),
        retryCount: 0,
      })

      const adapter = new InMemoryExchangeRateAdapter({
        "2024-01-02": {
          USD: 1,
          VND: 25000,
          JPY: 150,
          CNY: 7,
          KRW: 1300,
        },
      })

      const summary = await reconcileMissingRatesQueue({
        maxDatesPerRun: 1,
        provider: adapter,
      })

      expect(summary.batchCount).toBe(1)
      expect(summary.syncedCount).toBe(1)
      expect(summary.remainingCount).toBe(0)

      const missingCollection = await getMissingExchangeRatesCollection()
      const exhaustedDoc = await missingCollection.findOne({
        date: exhaustedDate,
      })
      expect(exhaustedDoc?.status).toBe("failed")

      const retryableDoc = await missingCollection.findOne({
        date: retryableDate,
      })
      expect(retryableDoc).toBeNull()
    })

    it("should mark exhausted retries as failed across the entire queue even beyond maxDatesPerRun", async () => {
      const retryableDate = new Date("2024-01-01T00:00:00Z")
      const exhaustedDate = new Date("2024-01-02T00:00:00Z")

      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: retryableDate,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        retryCount: 0,
      })
      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: exhaustedDate,
        createdAt: new Date("2024-01-02T00:00:00Z"),
        retryCount: 6,
      })

      const adapter = new InMemoryExchangeRateAdapter({
        "2024-01-01": {
          USD: 1,
          VND: 25000,
          JPY: 150,
          CNY: 7,
          KRW: 1300,
        },
      })

      const summary = await reconcileMissingRatesQueue({
        maxDatesPerRun: 1,
        provider: adapter,
      })

      expect(summary.batchCount).toBe(1)
      expect(summary.syncedCount).toBe(1)
      expect(summary.remainingCount).toBe(0)

      const missingCollection = await getMissingExchangeRatesCollection()
      const exhaustedDoc = await missingCollection.findOne({
        date: exhaustedDate,
      })
      expect(exhaustedDoc?.status).toBe("failed")
    })
  })
})
