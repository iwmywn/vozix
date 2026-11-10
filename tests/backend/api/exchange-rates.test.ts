import { revalidateTag } from "next/cache"
import { NextRequest } from "next/server"
import { ObjectId } from "mongodb"

import {
  insertTestMissingExchangeRate,
  insertTestTransaction,
} from "@/tests/backend/helpers/database"
import { mockDBAnotherUser, mockDBUser } from "@/tests/shared/data"
import { toDecimal128 } from "@/actions/utils"
import { GET } from "@/app/api/(cronjobs)/exchange-rates/route"
import * as collections from "@/lib/collections"
import {
  getExchangeRatesCollection,
  getMissingExchangeRatesCollection,
} from "@/lib/collections"
import * as exchangeRatesActions from "@/lib/currency-engine"
import { addDays, normalizeToUTCMidnight } from "@/lib/date"

const cronSecret = "test-cron-secret"
const cronEndpoint = "http://localhost/api/exchange-rates"

describe("Exchange Rates Cron Job", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("Authorization", () => {
    it("should return 401 when authorization header is missing", async () => {
      const request = new NextRequest(cronEndpoint)
      const response = await GET(request)

      expect(response.status).toBe(401)
      expect(await response.text()).toBe("Unauthorized")
    })

    it("should return 401 when authorization header has invalid token", async () => {
      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: "Bearer wrong-secret",
        },
      })
      const response = await GET(request)

      expect(response.status).toBe(401)
      expect(await response.text()).toBe("Unauthorized")
    })

    it("should return 401 when authorization header format is invalid", async () => {
      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: "Basic some-credentials",
        },
      })
      const response = await GET(request)

      expect(response.status).toBe(401)
      expect(await response.text()).toBe("Unauthorized")
    })
  })

  describe("Cron execution", () => {
    it("should not fetch any rates when missing rates queue is empty", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")

      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
        },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const json = await response.json()
      expect(json.success).toBe(true)
      expect(json.checkedCount).toBe(0)
      expect(json.missingCount).toBe(0)
      expect(json.syncedCount).toBe(0)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it("should fetch missing rates for queued dates from missingExchangeRates", async () => {
      const pastDate = new Date("2024-01-15T00:00:00Z")
      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: pastDate,
        createdAt: new Date(),
        retryCount: 0,
      })

      const mockRatesResponse = {
        meta: { last_updated_at: "2024-01-15T23:59:59Z" },
        data: {
          CNY: { code: "CNY", value: 7.15 },
          JPY: { code: "JPY", value: 145.0 },
          KRW: { code: "KRW", value: 1300.0 },
          USD: { code: "USD", value: 1 },
          VND: { code: "VND", value: 24500 },
        },
      }

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockRatesResponse,
      } as Response)

      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
        },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const json = await response.json()
      expect(json.success).toBe(true)

      const exchangeRatesCollection = await getExchangeRatesCollection()
      const savedPast = await exchangeRatesCollection.findOne({
        date: pastDate,
      })

      expect(savedPast).not.toBeNull()
      expect(savedPast?.rates.VND?.toString()).toBe("24500")

      const missingRatesCollection = await getMissingExchangeRatesCollection()
      const inQueue = await missingRatesCollection.findOne({
        date: pastDate,
      })
      expect(inQueue).toBeNull()
    })

    it("should handle API failure gracefully without returning 500", async () => {
      const pastDate = new Date("2024-01-15T00:00:00Z")
      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: pastDate,
        createdAt: new Date(),
        retryCount: 0,
      })

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response)

      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
        },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const json = await response.json()
      expect(json.success).toBe(true)
      expect(json.errors.length).toBeGreaterThan(0)
    })

    it("should mark records that have failed after 6 retries as status failed without deleting them", async () => {
      const oldPoisonDate = new Date("1970-01-01T00:00:00Z")
      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: oldPoisonDate,
        createdAt: new Date(),
        retryCount: 6,
      })

      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
        },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const missingRatesCollection = await getMissingExchangeRatesCollection()
      const poisonDoc = await missingRatesCollection.findOne({
        date: oldPoisonDate,
      })
      expect(poisonDoc).not.toBeNull()
      expect(poisonDoc?.status).toBe("failed")
      expect(poisonDoc?.failedAt).toBeDefined()
    })

    it("should not increment retryCount when enqueueMissingExchangeRateDate is called multiple times for the same date", async () => {
      const testDate = new Date("2024-05-20T00:00:00Z")
      const { enqueueMissingExchangeRateDate } =
        await import("@/actions/exchange-rates.actions")

      // Simulate 6 transactions being added on the same date with missing rate
      for (let i = 0; i < 6; i++) {
        await enqueueMissingExchangeRateDate(
          testDate,
          new Error(`Error on tx ${i}`)
        )
      }

      const missingRatesCollection = await getMissingExchangeRatesCollection()
      const doc = await missingRatesCollection.findOne({
        date: normalizeToUTCMidnight(testDate),
      })

      expect(doc).not.toBeNull()
      expect(doc?.retryCount).toBe(0)
    })

    it("should increment retryCount by 1 when cron job fails to fetch rate", async () => {
      const testDate = new Date("2024-05-21T00:00:00Z")
      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: testDate,
        createdAt: new Date(),
        retryCount: 0,
      })

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response)

      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
        },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const missingRatesCollection = await getMissingExchangeRatesCollection()
      const doc = await missingRatesCollection.findOne({
        date: testDate,
      })

      expect(doc).not.toBeNull()
      expect(doc?.retryCount).toBe(1)
    })

    it("should invalidate transactions cache for affected users on synced dates", async () => {
      const now = new Date()
      const todayUTC = normalizeToUTCMidnight(now)
      const yesterdayUTC = addDays(todayUTC, -1)

      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: yesterdayUTC,
        createdAt: new Date(),
        retryCount: 0,
      })

      // Insert transactions for two different users on yesterdayUTC
      await insertTestTransaction({
        _id: new ObjectId(),
        userId: mockDBUser._id,
        type: "outflow",
        categoryKey: "food_beverage",
        amount: toDecimal128("100"),
        currency: "USD",
        description: "User 1 lunch",
        date: yesterdayUTC,
      })
      await insertTestTransaction({
        _id: new ObjectId(),
        userId: mockDBAnotherUser._id,
        type: "inflow",
        categoryKey: "salary_bonus",
        amount: toDecimal128("2000"),
        currency: "USD",
        description: "User 2 salary",
        date: yesterdayUTC,
      })

      const mockRatesResponse = {
        meta: { last_updated_at: "2024-03-10T23:59:59Z" },
        data: {
          CNY: { code: "CNY", value: 7.18 },
          JPY: { code: "JPY", value: 147.2 },
          KRW: { code: "KRW", value: 1320.5 },
          USD: { code: "USD", value: 1 },
          VND: { code: "VND", value: 24600 },
        },
      }

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockRatesResponse,
      } as Response)

      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
        },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      expect(revalidateTag).toHaveBeenCalledWith(
        `transactions-${mockDBUser._id}`,
        { expire: 0 }
      )
      expect(revalidateTag).toHaveBeenCalledWith(
        `transactions-${mockDBAnotherUser._id}`,
        { expire: 0 }
      )
    })

    it("should not call revalidateTag when no transactions exist on synced dates", async () => {
      const mockRatesResponse = {
        meta: { last_updated_at: "2024-03-10T23:59:59Z" },
        data: {
          CNY: { code: "CNY", value: 7.18 },
          JPY: { code: "JPY", value: 147.2 },
          KRW: { code: "KRW", value: 1320.5 },
          USD: { code: "USD", value: 1 },
          VND: { code: "VND", value: 24600 },
        },
      }

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockRatesResponse,
      } as Response)

      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
        },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it("should clean up queued dates from missingRatesCollection if exchange rates are already resolved", async () => {
      const pastDate = new Date("2024-01-10T00:00:00Z")
      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: pastDate,
        createdAt: new Date(),
        retryCount: 0,
      })

      // Insert complete exchange rates for pastDate in advance
      const exchangeRatesCollection = await getExchangeRatesCollection()
      await exchangeRatesCollection.insertOne({
        date: pastDate,
        rates: {
          CNY: toDecimal128("7.15"),
          JPY: toDecimal128("145.0"),
          KRW: toDecimal128("1300.0"),
          USD: toDecimal128("1"),
          VND: toDecimal128("24500"),
        },
      })

      const fetchSpy = vi.spyOn(globalThis, "fetch")

      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
        },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const json = await response.json()
      expect(json.success).toBe(true)
      expect(json.missingCount).toBe(0)
      expect(json.syncedCount).toBe(0)
      expect(fetchSpy).not.toHaveBeenCalled()

      // Verify pastDate was removed from missingRatesCollection
      const missingRatesCollection = await getMissingExchangeRatesCollection()
      const queued = await missingRatesCollection.findOne({ date: pastDate })
      expect(queued).toBeNull()
    })

    it("should detect and fetch partial exchange rates when a non-USD currency is missing", async () => {
      const pastDate = new Date("2024-02-15T00:00:00Z")
      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: pastDate,
        createdAt: new Date(),
        retryCount: 0,
      })

      // Insert incomplete exchange rates (missing VND)
      const exchangeRatesCollection = await getExchangeRatesCollection()
      await exchangeRatesCollection.insertOne({
        date: pastDate,
        rates: {
          CNY: toDecimal128("7.15"),
          JPY: toDecimal128("145.0"),
          KRW: toDecimal128("1300.0"),
          USD: toDecimal128("1"),
          // VND is missing
        },
      })

      const mockRatesResponse = {
        meta: { last_updated_at: "2024-02-15T23:59:59Z" },
        data: {
          CNY: { code: "CNY", value: 7.15 },
          JPY: { code: "JPY", value: 145.0 },
          KRW: { code: "KRW", value: 1300.0 },
          USD: { code: "USD", value: 1 },
          VND: { code: "VND", value: 24500 },
        },
      }

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockRatesResponse,
      } as Response)

      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
        },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const updated = await exchangeRatesCollection.findOne({ date: pastDate })
      expect(updated?.rates.VND?.toString()).toBe("24500")

      const missingRatesCollection = await getMissingExchangeRatesCollection()
      const queued = await missingRatesCollection.findOne({ date: pastDate })
      expect(queued).toBeNull()
    })

    it("should limit processing to MAX_DATES_PER_RUN (5 dates) and correctly report remainingCount", async () => {
      // Insert 7 missing rate dates
      for (let day = 1; day <= 7; day++) {
        const dayStr = String(day).padStart(2, "0")
        await insertTestMissingExchangeRate({
          _id: new ObjectId(),
          date: new Date(`2024-01-${dayStr}T00:00:00Z`),
          createdAt: new Date(`2024-01-${dayStr}T10:00:00Z`),
          retryCount: 0,
        })
      }

      const mockRatesResponse = {
        meta: { last_updated_at: "2024-01-01T23:59:59Z" },
        data: {
          CNY: { code: "CNY", value: 7.15 },
          JPY: { code: "JPY", value: 145.0 },
          KRW: { code: "KRW", value: 1300.0 },
          USD: { code: "USD", value: 1 },
          VND: { code: "VND", value: 24500 },
        },
      }

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockRatesResponse,
      } as Response)

      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
        },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const json = await response.json()
      expect(json.success).toBe(true)
      expect(json.batchCount).toBe(5)
      expect(json.syncedCount).toBe(5)
      expect(json.remainingCount).toBe(2)
    })

    it("should skip queued records that have status failed", async () => {
      const failedDate = new Date("2024-01-20T00:00:00Z")
      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: failedDate,
        createdAt: new Date(),
        retryCount: 6,
        status: "failed",
      })

      const fetchSpy = vi.spyOn(globalThis, "fetch")

      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
        },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const json = await response.json()
      expect(json.remainingCount).toBe(0)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it("should handle unexpected rejected promises in syncResults gracefully", async () => {
      const pastDate = new Date("2024-01-15T00:00:00Z")
      await insertTestMissingExchangeRate({
        _id: new ObjectId(),
        date: pastDate,
        createdAt: new Date(),
        retryCount: 0,
      })

      // Cause ensureExchangeRateForDate to throw and enqueueMissingExchangeRateDate
      //  to also throw (unhandled inside map)
      vi.spyOn(
        exchangeRatesActions.currencyEngine,
        "ensureExchangeRateForDate"
      ).mockRejectedValueOnce(new Error("API network failure"))
      vi.spyOn(
        exchangeRatesActions.currencyEngine,
        "enqueueMissingExchangeRateDate"
      ).mockRejectedValueOnce(new Error("Database write failure"))

      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
        },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const json = await response.json()
      expect(json.success).toBe(true)
      expect(json.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            error: "Database write failure",
          }),
        ])
      )
    })

    it("should return 500 when an unexpected top-level error occurs", async () => {
      vi.spyOn(
        collections,
        "getMissingExchangeRatesCollection"
      ).mockRejectedValueOnce(new Error("Mongo connection drop"))

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {})

      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
        },
      })

      const response = await GET(request)
      expect(response.status).toBe(500)
      expect(await response.text()).toBe("Exchange rates cron failed")
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "EXCHANGE RATES CRON ERROR:",
        expect.any(Error)
      )
    })
  })
})
