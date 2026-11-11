import { NextRequest } from "next/server"

import { insertTestRecurringTransaction } from "@/tests/backend/helpers/database"
import { mockDBRecurringTransaction } from "@/tests/shared/data"
import { GET } from "@/app/api/(cronjobs)/recurring-transactions/route"
import { localDateToUTCMidnight } from "@/lib/date"
import type { DBRecurringTransaction } from "@/lib/definitions"
import * as recurringEngine from "@/lib/recurring-engine"

const cronSecret = "test-cron-secret"
const cronEndpoint = "http://localhost/api/recurring-transactions"

describe("Recurring Transactions Cron Route Adapter", () => {
  describe("Authorization", () => {
    it("should return 401 when authorization header is missing", async () => {
      const request = new NextRequest(cronEndpoint)
      const response = await GET(request)
      const text = await response.text()

      expect(response.status).toBe(401)
      expect(text).toBe("Unauthorized")
    })

    it("should return 401 when authorization header is invalid", async () => {
      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: "Bearer wrong-secret",
        },
      })
      const response = await GET(request)
      const text = await response.text()

      expect(response.status).toBe(401)
      expect(text).toBe("Unauthorized")
    })

    it("should return 401 when authorization header format is wrong", async () => {
      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Invalid ${cronSecret}`,
        },
      })
      const response = await GET(request)
      const text = await response.text()

      expect(response.status).toBe(401)
      expect(text).toBe("Unauthorized")
    })
  })

  describe("Delegation to RecurringEngine", () => {
    it("should return 200 with summary when authorization succeeds", async () => {
      const lastMonthUTC = localDateToUTCMidnight(new Date("2024-01-01"))

      const recurringTransaction: DBRecurringTransaction = {
        ...mockDBRecurringTransaction,
        frequency: "monthly",
        startDate: lastMonthUTC,
        lastGeneratedDate: lastMonthUTC,
      }
      await insertTestRecurringTransaction(recurringTransaction)

      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date("2024-02-01T12:00:00.000Z"))

        const request = new NextRequest(cronEndpoint, {
          headers: {
            authorization: `Bearer ${cronSecret}`,
          },
        })

        const response = await GET(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)
        expect(data.created).toBe(1)
        expect(data.createdIds).toHaveLength(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it("should safely complete and return 200 even when exchange rate provider fails during occurrence processing", async () => {
      const lastMonthUTC = localDateToUTCMidnight(new Date("2024-01-01"))

      const recurringTransaction: DBRecurringTransaction = {
        ...mockDBRecurringTransaction,
        frequency: "monthly",
        startDate: lastMonthUTC,
        lastGeneratedDate: lastMonthUTC,
      }
      await insertTestRecurringTransaction(recurringTransaction)

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response)

      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date("2024-02-01T12:00:00.000Z"))

        const request = new NextRequest(cronEndpoint, {
          headers: {
            authorization: `Bearer ${cronSecret}`,
          },
        })

        const response = await GET(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)
        expect(data.created).toBe(1)
        expect(data.createdIds).toHaveLength(1)
      } finally {
        vi.useRealTimers()
        fetchSpy.mockRestore()
      }
    })

    it("should return non-2xx status, log errors, and report success=false when summary.errors is nonempty", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {})
      const mockErrors = [{ id: "rec-fail-1", error: "Database lock timeout" }]

      vi.spyOn(
        recurringEngine,
        "processDueRecurringTransactions"
      ).mockResolvedValueOnce({
        success: true,
        createdCount: 2,
        createdIds: ["tx-1", "tx-2"],
        skippedCount: 1,
        skippedReason: [{ id: "rec-skip-1", reason: "notToday" }],
        affectedUserIds: ["user-1"],
        errors: mockErrors,
        timestamp: "2024-02-01T12:00:00.000Z",
      })

      const request = new NextRequest(cronEndpoint, {
        headers: {
          authorization: `Bearer ${cronSecret}`,
        },
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.errors).toEqual(mockErrors)
      expect(data.created).toBe(2)
      expect(data.createdIds).toEqual(["tx-1", "tx-2"])
      expect(data.skippedCount).toBe(1)
      expect(data.skippedReason).toEqual([
        { id: "rec-skip-1", reason: "notToday" },
      ])
      expect(data.timestamp).toBe("2024-02-01T12:00:00.000Z")
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "RECURRING TRANSACTIONS CRON ERRORS:",
        mockErrors
      )

      consoleErrorSpy.mockRestore()
    })
  })
})
