import { mockTransactions } from "@/tests/shared/data"
import { convertAmountWithRates, formatCurrency } from "@/lib/currency"
import { getUniqueDateRangeYears, getUniqueYears } from "@/lib/date"
import {
  getBalanceColorClass,
  getFlowColorClass,
  getRollupHealthClass,
  getSafeCallbackUrl,
  getScheduleStatusClass,
  isUserBanned,
  searchWithMiniSearch,
} from "@/lib/utils"

describe("Utils", () => {
  describe("formatCurrency", () => {
    it("should format currency in VND", () => {
      const result = formatCurrency("1000000", "vi-VN", "VND")
      expect(result).toContain("1.000.000")
      expect(result).toContain("₫")
    })

    it("should handle zero amount", () => {
      const result = formatCurrency("0", "vi-VN", "VND")
      expect(result).toContain("0")
      expect(result).toContain("₫")
    })

    it("should handle negative amount", () => {
      const result = formatCurrency("-500000", "vi-VN", "VND")
      expect(result).toContain("-500.000")
      expect(result).toContain("₫")
    })

    it("should handle decimal amounts", () => {
      const result = formatCurrency("1234567.89", "vi-VN", "VND")
      expect(result).toContain("1.234.568")
      expect(result).toContain("₫")
    })

    it("should handle large amounts", () => {
      const result = formatCurrency("1000000000", "vi-VN", "VND")
      expect(result).toContain("1.000.000.000")
      expect(result).toContain("₫")
    })

    it("should preserve precision for amounts exceeding 15 digits without float truncation", () => {
      const result = formatCurrency("1234567890123456.78", "en-US", "USD")
      expect(result).toBe("$1,234,567,890,123,456.78")
    })

    it("should safely fallback to zero for invalid, null, undefined, or empty values", () => {
      expect(formatCurrency("", "en-US", "USD")).toBe("$0.00")
      expect(formatCurrency("   ", "en-US", "USD")).toBe("$0.00")
      expect(formatCurrency("invalid-number", "en-US", "USD")).toBe("$0.00")
      expect(formatCurrency(null, "en-US", "USD")).toBe("$0.00")
      expect(formatCurrency(undefined, "en-US", "USD")).toBe("$0.00")
      expect(formatCurrency(Number.NaN, "en-US", "USD")).toBe("$0.00")
    })

    it("should handle numeric types directly", () => {
      expect(formatCurrency(1500, "en-US", "USD")).toBe("$1,500.00")
      expect(formatCurrency(0, "en-US", "USD")).toBe("$0.00")
      expect(formatCurrency(-50, "en-US", "USD")).toBe("-$50.00")
    })
  })

  describe("getUniqueYears", () => {
    it("should return unique years sorted descending", () => {
      const result = getUniqueYears(mockTransactions)
      expect(result).toEqual([2025, 2024])
    })

    it("should return empty array for empty transactions", () => {
      const result = getUniqueYears([])
      expect(result).toEqual([])
    })

    it("should handle single year", () => {
      const singleYear = mockTransactions.slice(1, 3)
      const result = getUniqueYears(singleYear)
      expect(result).toEqual([2024])
    })

    it("should extract UTC years consistently without timezone shifts", () => {
      const utcTransactions = [
        {
          ...mockTransactions[0],
          date: new Date("2024-01-01T00:00:00.000Z"),
        },
      ]
      const result = getUniqueYears(utcTransactions)
      expect(result).toEqual([2024])
    })
  })

  describe("getUniqueDateRangeYears", () => {
    it("should return unique years from date ranges sorted descending", () => {
      const items = [
        {
          startDate: "2024-01-01T00:00:00.000Z",
          endDate: "2025-12-31T00:00:00.000Z",
        },
        {
          startDate: new Date("2026-05-01T00:00:00.000Z"),
          endDate: new Date("2026-10-01T00:00:00.000Z"),
        },
        {
          startDate: "2025-01-01T00:00:00.000Z",
          endDate: "2025-06-01T00:00:00.000Z",
        },
      ]
      const result = getUniqueDateRangeYears(items)
      expect(result).toEqual([2026, 2025, 2024])
    })

    it("should handle items with undefined or null endDate", () => {
      const items = [
        { startDate: "2026-01-01T00:00:00.000Z", endDate: undefined },
        { startDate: "2023-01-01T00:00:00.000Z", endDate: null },
      ]
      const result = getUniqueDateRangeYears(items)
      expect(result).toEqual([2026, 2023])
    })

    it("should return empty array for empty items", () => {
      const result = getUniqueDateRangeYears([])
      expect(result).toEqual([])
    })

    it("should ignore invalid dates", () => {
      const items = [
        { startDate: "invalid-date", endDate: "another-invalid-date" },
        { startDate: "2025-01-01T00:00:00.000Z", endDate: "invalid" },
      ]
      const result = getUniqueDateRangeYears(items)
      expect(result).toEqual([2025])
    })
  })

  describe("getSafeCallbackUrl", () => {
    it("should return valid relative route", () => {
      expect(getSafeCallbackUrl("/transactions")).toBe("/transactions")
      expect(getSafeCallbackUrl("/budgets?month=01")).toBe("/budgets?month=01")
      expect(getSafeCallbackUrl("/home#section")).toBe("/home#section")
    })

    it("should fallback when url is null or undefined or empty", () => {
      expect(getSafeCallbackUrl(null)).toBe("/home")
      expect(getSafeCallbackUrl(undefined)).toBe("/home")
      expect(getSafeCallbackUrl("")).toBe("/home")
      expect(getSafeCallbackUrl(null, "/settings")).toBe("/settings")
    })

    it("should reject absolute URLs with schemes to prevent Open Redirect", () => {
      expect(getSafeCallbackUrl("https://evil.com")).toBe("/home")
      expect(getSafeCallbackUrl("http://evil.com")).toBe("/home")
      expect(getSafeCallbackUrl("javascript:alert(1)")).toBe("/home")
      expect(getSafeCallbackUrl("data:text/html,test")).toBe("/home")
    })

    it("should reject protocol-relative URLs", () => {
      expect(getSafeCallbackUrl("//evil.com")).toBe("/home")
      expect(getSafeCallbackUrl("//evil.com/login")).toBe("/home")
    })

    it("should reject backslash bypasses", () => {
      expect(getSafeCallbackUrl("/\\evil.com")).toBe("/home")
      expect(getSafeCallbackUrl("/evil.com\\test")).toBe("/home")
    })
  })

  describe("convertAmountWithRates", () => {
    const mockRates = {
      USD: "1",
      VND: "25000",
      EUR: "0.92",
    }

    it("should return original amount when from and to currencies are identical", () => {
      const result = convertAmountWithRates(100, "USD", "USD", mockRates)
      expect(result.toString()).toBe("100")
    })

    it("should return original amount when rates is undefined", () => {
      const result = convertAmountWithRates(100, "USD", "VND", undefined)
      expect(result.toString()).toBe("100")
    })

    it("should return original amount when currency is missing in rates", () => {
      const result = convertAmountWithRates(
        100,
        "USD",
        "JPY" as never,
        mockRates as never
      )
      expect(result.toString()).toBe("100")
    })

    it("should convert currency correctly", () => {
      // 100 USD to VND = 100 * 25000 = 2500000
      const result = convertAmountWithRates(100, "USD", "VND", mockRates)
      expect(result.toString()).toBe("2500000")

      // 25000 VND to USD = 25000 / 25000 = 1
      const resultUSD = convertAmountWithRates(25000, "VND", "USD", mockRates)
      expect(resultUSD.toString()).toBe("1")
    })

    it("should correctly convert when USD rate is omitted from rates map (default to 1)", () => {
      const ratesWithoutUSD = {
        VND: "25000",
      }
      const resultUSDToVND = convertAmountWithRates(
        100,
        "USD",
        "VND",
        ratesWithoutUSD
      )
      expect(resultUSDToVND.toString()).toBe("2500000")

      const resultVNDToUSD = convertAmountWithRates(
        25000,
        "VND",
        "USD",
        ratesWithoutUSD
      )
      expect(resultVNDToUSD.toString()).toBe("1")
    })

    it("should handle zero or negative rate defensively without throwing Division by zero", () => {
      const zeroFromRates = {
        USD: "1",
        VND: "0",
      }
      expect(() =>
        convertAmountWithRates(100, "VND", "USD", zeroFromRates)
      ).not.toThrow()
      const zeroFromResult = convertAmountWithRates(
        100,
        "VND",
        "USD",
        zeroFromRates
      )
      expect(zeroFromResult.toString()).toBe("100")

      const zeroToRates = {
        USD: "0",
        VND: "25000",
      }
      expect(() =>
        convertAmountWithRates(100, "VND", "USD", zeroToRates)
      ).not.toThrow()
      const zeroToResult = convertAmountWithRates(
        100,
        "VND",
        "USD",
        zeroToRates
      )
      expect(zeroToResult.toString()).toBe("100")

      const negativeRates = {
        USD: "1",
        VND: "-25000",
      }
      expect(() =>
        convertAmountWithRates(100, "VND", "USD", negativeRates)
      ).not.toThrow()
      const negResult = convertAmountWithRates(100, "VND", "USD", negativeRates)
      expect(negResult.toString()).toBe("100")
    })
  })

  describe("isUserBanned", () => {
    const fixedNow = new Date("2026-06-15T12:00:00Z")

    it("should return false when user is null, undefined, or not banned", () => {
      expect(isUserBanned(null, fixedNow)).toBe(false)
      expect(isUserBanned(undefined, fixedNow)).toBe(false)
      expect(isUserBanned({ banned: false }, fixedNow)).toBe(false)
      expect(isUserBanned({ banned: null }, fixedNow)).toBe(false)
      expect(isUserBanned({ banned: undefined }, fixedNow)).toBe(false)
    })

    it("should return true when user is permanently banned (no banExpires)", () => {
      expect(isUserBanned({ banned: true }, fixedNow)).toBe(true)
      expect(isUserBanned({ banned: true, banExpires: null }, fixedNow)).toBe(
        true
      )
      expect(
        isUserBanned({ banned: true, banExpires: undefined }, fixedNow)
      ).toBe(true)
    })

    it("should return true when temporary ban is active (banExpires in future)", () => {
      const futureDate = new Date("2026-06-15T13:00:00Z")
      expect(
        isUserBanned({ banned: true, banExpires: futureDate }, fixedNow)
      ).toBe(true)
      expect(
        isUserBanned(
          { banned: true, banExpires: futureDate.toISOString() },
          fixedNow
        )
      ).toBe(true)
    })

    it("should return false when temporary ban has expired (banExpires in past)", () => {
      const pastDate = new Date("2026-06-15T11:00:00Z")
      expect(
        isUserBanned({ banned: true, banExpires: pastDate }, fixedNow)
      ).toBe(false)
      expect(
        isUserBanned(
          { banned: true, banExpires: pastDate.toISOString() },
          fixedNow
        )
      ).toBe(false)
    })

    it("should return false when banExpires equals now", () => {
      expect(
        isUserBanned({ banned: true, banExpires: fixedNow }, fixedNow)
      ).toBe(false)
    })

    it("should return true when banExpires is invalid date", () => {
      expect(
        isUserBanned({ banned: true, banExpires: "invalid-date" }, fixedNow)
      ).toBe(true)
    })
  })

  describe("getFlowColorClass", () => {
    it("should return text-green for inflow", () => {
      expect(getFlowColorClass("inflow")).toBe("text-green")
    })

    it("should return text-red for outflow", () => {
      expect(getFlowColorClass("outflow")).toBe("text-red")
    })

    it("should return empty string for undefined or null or other values", () => {
      expect(getFlowColorClass(undefined)).toBe("")
      expect(getFlowColorClass(null)).toBe("")
      expect(getFlowColorClass("")).toBe("")
    })
  })

  describe("getBalanceColorClass", () => {
    it("should return text-green for positive values", () => {
      expect(getBalanceColorClass(100)).toBe("text-green")
      expect(getBalanceColorClass("50000")).toBe("text-green")
    })

    it("should return text-red for negative values", () => {
      expect(getBalanceColorClass(-100)).toBe("text-red")
      expect(getBalanceColorClass("-50000")).toBe("text-red")
    })

    it("should return empty string for zero, invalid, or empty values", () => {
      expect(getBalanceColorClass(0)).toBe("")
      expect(getBalanceColorClass("0")).toBe("")
      expect(getBalanceColorClass(null)).toBe("")
      expect(getBalanceColorClass(undefined)).toBe("")
      expect(getBalanceColorClass("invalid")).toBe("")
    })
  })

  describe("getRollupHealthClass & getScheduleStatusClass", () => {
    it("should map RollupHealth states to progress color CSS classes", () => {
      expect(getRollupHealthClass("unstarted")).toBe("progress-gray")
      expect(getRollupHealthClass("on_track")).toBe("progress-green")
      expect(getRollupHealthClass("warning")).toBe("progress-yellow")
      expect(getRollupHealthClass("exceeded")).toBe("progress-red")
    })

    it("should map ScheduleStatus states to badge CSS classes", () => {
      expect(getScheduleStatusClass("expired")).toBe("badge-red")
      expect(getScheduleStatusClass("active")).toBe("badge-green")
      expect(getScheduleStatusClass("upcoming")).toBe("badge-yellow")
    })
  })

  describe("searchWithMiniSearch", () => {
    const sampleDocs = [
      { _id: "doc-1", id: "custom-1", title: "Monthly Salary Bonus" },
      { _id: "doc-2", id: "custom-2", title: "Emergency Rainy Day Fund" },
    ]

    it("should return all document IDs when searchTerm is empty or whitespace", () => {
      expect(searchWithMiniSearch(sampleDocs, "", ["title"])).toEqual(
        new Set(["doc-1", "doc-2"])
      )
      expect(searchWithMiniSearch(sampleDocs, "   ", ["title"])).toEqual(
        new Set(["doc-1", "doc-2"])
      )
    })

    it("should match documents using prefix and multi-word AND semantics", () => {
      expect(searchWithMiniSearch(sampleDocs, "emerg", ["title"])).toEqual(
        new Set(["doc-2"])
      )
      expect(
        searchWithMiniSearch(sampleDocs, "fund emergency", ["title"])
      ).toEqual(new Set(["doc-2"]))
      expect(
        searchWithMiniSearch(sampleDocs, "salary emergency", ["title"])
      ).toEqual(new Set())
    })

    it("should support custom idField", () => {
      expect(
        searchWithMiniSearch(sampleDocs, "salary", ["title"], "id")
      ).toEqual(new Set(["custom-1"]))
    })
  })
})
