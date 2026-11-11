import { insertTestExchangeRates } from "@/tests/backend/helpers/database"
import { mockDBExchangeRates, mockTransactions } from "@/tests/shared/data"
import {
  getExchangeRatesCollection,
  getMissingExchangeRatesCollection,
} from "@/lib/collections"
import {
  convertTransactionsToCurrency,
  ensureExchangeRateForDate,
} from "@/lib/currency-engine"
import { normalizeToUTCMidnight } from "@/lib/date"
import { toDecimal128 } from "@/lib/db"
import type { Transaction } from "@/lib/definitions"

describe("convertTransactionsToCurrency", () => {
  describe("Empty transactions", () => {
    it("should return empty array when given empty transactions array", async () => {
      const result = await convertTransactionsToCurrency([], "USD")
      expect(result).toEqual([])
    })
  })

  describe("No exchange rates available", () => {
    it("should return original transactions when no exchange rates are in database", async () => {
      const result = await convertTransactionsToCurrency(
        mockTransactions,
        "USD"
      )

      expect(result).toEqual(mockTransactions)
    })
  })

  describe("Currency conversion", () => {
    beforeEach(async () => {
      await insertTestExchangeRates(mockDBExchangeRates)
    })

    it("should convert VND to USD using the correct exchange rate", async () => {
      const transactions: Transaction[] = [
        {
          ...mockTransactions[0],
          // 1000 VND
        },
      ]

      const result = await convertTransactionsToCurrency(transactions, "USD")

      expect(result).toHaveLength(1)
      expect(result[0].currency).toBe("USD")
      expect(result[0].amount).toBe("0.04")
    })

    it("should convert USD to VND using the correct exchange rate", async () => {
      const transactions: Transaction[] = [
        {
          ...mockTransactions[1],
          // 200 USD
          currency: "USD",
          date: new Date("2024-01-15"),
        },
      ]

      const result = await convertTransactionsToCurrency(transactions, "VND")

      expect(result).toHaveLength(1)
      expect(result[0].currency).toBe("VND")
      expect(result[0].amount).toBe("5000000")
    })

    it("should convert JPY to CNY through USD", async () => {
      const transactions: Transaction[] = [
        {
          ...mockTransactions[2],
          // 500 JPY
          currency: "JPY",
          date: new Date("2024-01-25"),
        },
      ]

      const result = await convertTransactionsToCurrency(transactions, "CNY")

      expect(result).toHaveLength(1)
      expect(result[0].currency).toBe("CNY")
      expect(result[0].amount).toBe("23.509933774834437086")
    })

    it("should handle same currency conversion (no conversion needed)", async () => {
      const transactions: Transaction[] = [
        {
          ...mockTransactions[5],
          // 500000 VND
        },
      ]

      const result = await convertTransactionsToCurrency(transactions, "VND")

      expect(result).toHaveLength(1)
      expect(result[0].currency).toBe("VND")
      expect(result[0].amount).toBe("500000")
    })
  })

  describe("Multiple transactions with different dates", () => {
    beforeEach(async () => {
      await insertTestExchangeRates(mockDBExchangeRates)
    })

    it("should use correct exchange rates based on transaction dates", async () => {
      const transactions: Transaction[] = [
        {
          ...mockTransactions[6],
          // 400000 VND
        },
        {
          ...mockTransactions[7],
          // 2100000 VND
          date: new Date("2024-01-25"),
        },
      ]

      const result = await convertTransactionsToCurrency(transactions, "USD")

      expect(result).toHaveLength(2)
      expect(result.every((tx) => tx.currency === "USD")).toBe(true)
      expect(result[0].amount).toBe("15.873015873015873016")
      expect(result[1].amount).toBe("83.665338645418326693")
    })

    it("should maintain original transaction order", async () => {
      const transactions: Transaction[] = [
        {
          ...mockTransactions[0],
        },
        {
          ...mockTransactions[1],
        },
        {
          ...mockTransactions[2],
        },
      ]

      const result = await convertTransactionsToCurrency(transactions, "VND")

      expect(result).toHaveLength(3)
      expect(result[0]._id).toBe("1")
      expect(result[1]._id).toBe("2")
      expect(result[2]._id).toBe("3")
    })
  })

  describe("Multiple currencies in single batch", () => {
    beforeEach(async () => {
      await insertTestExchangeRates(mockDBExchangeRates)
    })

    it("should convert transactions with different source currencies to same target", async () => {
      const transactions: Transaction[] = [
        {
          ...mockTransactions[0],
          // 1000 VND
        },
        {
          ...mockTransactions[1],
          // 200 USD
          currency: "USD",
          date: new Date("2024-01-25"),
        },
        {
          ...mockTransactions[2],
          // 500 CNY
          currency: "CNY",
          date: new Date("2024-01-25"),
        },
        {
          ...mockTransactions[3],
          // 100 JPY
          currency: "JPY",
          date: new Date("2024-02-20"),
        },
        {
          ...mockTransactions[4],
          // 300 KRW
          currency: "KRW",
          date: new Date("2024-02-20"),
        },
      ]
      const result = await convertTransactionsToCurrency(transactions, "VND")

      expect(result).toHaveLength(5)
      expect(result.every((tx) => tx.currency === "VND")).toBe(true)

      expect(result[0].amount).toBe("1000")
      expect(result[1].amount).toBe("5020000")
      expect(result[2].amount).toBe("1767605.6338028169014")
      expect(result[3].amount).toBe("16578.947368421052632")
      expect(result[4].amount).toBe("5727.2727272727272728")
    })
  })

  describe("Edge cases", () => {
    beforeEach(async () => {
      await insertTestExchangeRates(mockDBExchangeRates)
    })

    it("should handle decimal amounts", async () => {
      const transactions: Transaction[] = [
        {
          ...mockTransactions[1],
          amount: "234.56",
          currency: "USD",
          date: new Date("2024-01-15"),
        },
      ]

      const result = await convertTransactionsToCurrency(transactions, "VND")

      expect(result).toHaveLength(1)
      expect(result[0].currency).toBe("VND")
      expect(result[0].amount).toBe("5864000")
    })

    it("should handle very large amounts", async () => {
      const transactions: Transaction[] = [
        {
          ...mockTransactions[0],
          amount: "1000000000",
        },
      ]

      const result = await convertTransactionsToCurrency(transactions, "USD")

      expect(result).toHaveLength(1)
      expect(result[0].currency).toBe("USD")
      expect(result[0].amount).toBe("40000")
    })

    it("should preserve all transaction properties except amount and currency", async () => {
      const transactions: Transaction[] = [
        {
          ...mockTransactions[1],
          currency: "USD",
          date: new Date("2024-01-15"),
        },
      ]

      const result = await convertTransactionsToCurrency(transactions, "VND")

      expect(result).toHaveLength(1)
      expect(result[0]._id).toBe("2")
      expect(result[0].userId).toBe("68f712e4cda4897217a05a1c")
      expect(result[0].type).toBe("outflow")
      expect(result[0].categoryKey).toBe("food_beverage")
      expect(result[0].description).toBe("Groceries")
      expect(result[0].date).toEqual(transactions[0].date)
      expect(result[0].currency).toBe("VND")
      expect(result[0].amount).toBe("5000000")
    })

    it("should convert transaction using nearest previous rate when transaction date is after all rates in database", async () => {
      // Transaction date is 2024-03-01, but mockExchangeRates only has up to 2024-02-20 (VND: 25200)
      const transactions: Transaction[] = [
        {
          ...mockTransactions[0],
          amount: "25200",
          currency: "VND",
          date: new Date("2024-03-01"),
        },
      ]

      const result = await convertTransactionsToCurrency(transactions, "USD")

      expect(result).toHaveLength(1)
      expect(result[0].currency).toBe("USD")
      expect(result[0].amount).toBe("1")
      expect(result[0].rates?.VND).toBe("25200")
    })

    it("should convert transaction using nearest future rate when transaction date is before all rates in database", async () => {
      // Transaction date is 2024-01-01, but mockExchangeRates starts from 2024-01-15 (VND: 25000)
      const transactions: Transaction[] = [
        {
          ...mockTransactions[0],
          amount: "25000",
          currency: "VND",
          date: new Date("2024-01-01"),
        },
      ]

      const result = await convertTransactionsToCurrency(transactions, "USD")

      expect(result).toHaveLength(1)
      expect(result[0].currency).toBe("USD")
      expect(result[0].amount).toBe("1")
      expect(result[0].rates?.VND).toBe("25000")
    })

    it("should pick the closer future date when closer to future than previous rate", async () => {
      // 2024-01-24 is 1 day away from 2024-01-25 (VND: 25100) and 9 days away from 2024-01-15 (VND: 25000)
      const transactions: Transaction[] = [
        {
          ...mockTransactions[0],
          amount: "25100",
          currency: "VND",
          date: new Date("2024-01-24"),
        },
      ]

      const result = await convertTransactionsToCurrency(transactions, "USD")

      expect(result).toHaveLength(1)
      expect(result[0].currency).toBe("USD")
      expect(result[0].amount).toBe("1")
      expect(result[0].rates?.VND).toBe("25100")
    })

    it("should pick the closer previous date when closer to previous than future rate", async () => {
      // 2024-01-16 is 1 day away from 2024-01-15 (VND: 25000) and 9 days away from 2024-01-25 (VND: 25100)
      const transactions: Transaction[] = [
        {
          ...mockTransactions[0],
          amount: "25000",
          currency: "VND",
          date: new Date("2024-01-16"),
        },
      ]

      const result = await convertTransactionsToCurrency(transactions, "USD")

      expect(result).toHaveLength(1)
      expect(result[0].currency).toBe("USD")
      expect(result[0].amount).toBe("1")
      expect(result[0].rates?.VND).toBe("25000")
    })

    it("should independently assign the closest rate to each transaction in a batch", async () => {
      // Tx1 on 2024-01-16 (closest to 2024-01-15, VND: 25000)
      // Tx2 on 2024-01-24 (closest to 2024-01-25, VND: 25100)
      const transactions: Transaction[] = [
        {
          ...mockTransactions[0],
          _id: "tx-1",
          amount: "25000",
          currency: "VND",
          date: new Date("2024-01-16"),
        },
        {
          ...mockTransactions[1],
          _id: "tx-2",
          amount: "25100",
          currency: "VND",
          date: new Date("2024-01-24"),
        },
      ]

      const result = await convertTransactionsToCurrency(transactions, "USD")

      expect(result).toHaveLength(2)
      expect(result[0]._id).toBe("tx-1")
      expect(result[0].rates?.VND).toBe("25000")
      expect(result[0].amount).toBe("1")

      expect(result[1]._id).toBe("tx-2")
      expect(result[1].rates?.VND).toBe("25100")
      expect(result[1].amount).toBe("1")
    })
  })
})

describe("ensureExchangeRateForDate", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should not call fetch when exchange rate already exists with all currencies", async () => {
    await insertTestExchangeRates(mockDBExchangeRates)
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    await ensureExchangeRateForDate(mockDBExchangeRates[0].date)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("should fetch rates from Currency API and insert into database when date does not exist", async () => {
    const testDate = new Date("2024-03-10T00:00:00Z")
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

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockRatesResponse,
    } as Response)

    await ensureExchangeRateForDate(testDate)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://api.currencyapi.com/v3/historical"),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    )

    const collection = await getExchangeRatesCollection()
    const saved = await collection.findOne({
      date: normalizeToUTCMidnight(testDate),
    })

    expect(saved).not.toBeNull()
    expect(saved?.rates.VND?.toString()).toBe("24600")
    expect(saved?.rates.CNY?.toString()).toBe("7.18")
  })

  it("should fetch missing currencies and update document when partial rates exist", async () => {
    const testDate = normalizeToUTCMidnight(new Date("2024-04-10T00:00:00Z"))
    const collection = await getExchangeRatesCollection()
    await collection.insertOne({
      date: testDate,
      rates: {
        CNY: toDecimal128("7.18"),
        JPY: toDecimal128("147.2"),
        KRW: toDecimal128("1320.5"),
        // VND is missing
      },
    })

    const mockRatesResponse = {
      meta: { last_updated_at: "2024-04-10T23:59:59Z" },
      data: {
        CNY: { code: "CNY", value: 7.18 },
        JPY: { code: "JPY", value: 147.2 },
        KRW: { code: "KRW", value: 1320.5 },
        USD: { code: "USD", value: 1 },
        VND: { code: "VND", value: 24700 },
      },
    }

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockRatesResponse,
    } as Response)

    await ensureExchangeRateForDate(testDate)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://api.currencyapi.com/v3/historical"),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    )

    const updated = await collection.findOne({ date: testDate })
    expect(updated?.rates.VND?.toString()).toBe("24700")
    expect(updated?.rates.CNY?.toString()).toBe("7.18")
  })

  it("should throw error when Currency API returns non-ok status and throwOnError is true", async () => {
    const testDate = new Date("2024-05-10T00:00:00Z")

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    await expect(
      ensureExchangeRateForDate(testDate, { throwOnError: true })
    ).rejects.toThrow("Currency API returned status 500")
  })

  it("should automatically enqueue missing rate date when Currency API returns non-ok status by default", async () => {
    const testDate = new Date("2024-05-11T00:00:00Z")

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    const result = await ensureExchangeRateForDate(testDate)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Currency API returned status 500")

    const missingRatesCollection = await getMissingExchangeRatesCollection()
    const doc = await missingRatesCollection.findOne({ date: testDate })
    expect(doc).toBeDefined()
    expect(doc?.lastError).toContain("Currency API returned status 500")
  })

  it("should automatically enqueue missing rate date when network request times out or rejects", async () => {
    const testDate = new Date("2024-05-12T00:00:00Z")

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network timeout: connection timed out after 5000ms")
    )

    const result = await ensureExchangeRateForDate(testDate)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Network timeout")

    const missingRatesCollection = await getMissingExchangeRatesCollection()
    const doc = await missingRatesCollection.findOne({ date: testDate })
    expect(doc).toBeDefined()
    expect(doc?.lastError).toContain("Network timeout")
  })

  it("should handle exchange rate documents with null or undefined rates defensively", async () => {
    const collection = await getExchangeRatesCollection()
    // Insert document with null rates
    await collection.insertOne({
      date: new Date("2024-06-01T00:00:00Z"),
      rates: null as never,
    })

    const transactions: Transaction[] = [
      {
        ...mockTransactions[0],
        currency: "USD",
        amount: "50",
        date: new Date("2024-06-01T00:00:00Z"),
      },
    ]

    // Should not throw TypeError: Cannot convert undefined or null to object
    await expect(
      convertTransactionsToCurrency(transactions, "USD")
    ).resolves.not.toThrow()
  })

  it("should handle large transaction arrays without RangeError call stack exceeded", async () => {
    // Array of 100,000 transactions would exceed call stack if Math.min(...timestamps) is used
    const count = 100_000
    const tx = mockTransactions[0]
    const largeTransactions: Transaction[] = Array.from(
      { length: count },
      (_, i) => ({
        ...tx,
        _id: `large-tx-${i}`,
        currency: "USD",
        amount: "10",
        date: new Date("2024-01-01T00:00:00Z"),
      })
    )

    await expect(
      convertTransactionsToCurrency(largeTransactions, "USD")
    ).resolves.not.toThrow()
  })
})
