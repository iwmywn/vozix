import type { Locale } from "@/i18n/config"
import {
  addDays,
  clampDayToMonth,
  formatDate,
  formatDateParts,
  getDaysInMonth,
  getTodayInTimezone,
  isSameUTCDate,
  localDateToUTCMidnight,
  normalizeToUTCMidnight,
  parseDateParts,
  parseToLocalDate,
  parseToUTCMidnight,
  serializeLocalDate,
  serializeUTCDate,
} from "@/lib/date"

describe("lib/date.ts Unified Date Module", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe("formatDateParts", () => {
    it("should format date parts with 2-digit zero padding", () => {
      expect(formatDateParts(2026, 3, 5)).toBe("2026-03-05")
      expect(formatDateParts(2026, 12, 31)).toBe("2026-12-31")
    })
  })

  describe("parseDateParts", () => {
    it("should extract parts from valid YYYY-MM-DD strings", () => {
      const parts = parseDateParts("2026-09-11")
      expect(parts).toEqual({ year: 2026, month: 9, day: 11 })
    })

    it("should extract parts from ISO strings containing time", () => {
      const parts = parseDateParts("2026-09-11T14:30:00.000Z")
      expect(parts).toEqual({ year: 2026, month: 9, day: 11 })
    })

    it("should reject non-existent calendar dates", () => {
      expect(parseDateParts("2026-02-30")).toBeNull()
      expect(parseDateParts("2026-04-31")).toBeNull()
      expect(parseDateParts("2026-02-29")).toBeNull() // 2026 is not a leap year
      expect(parseDateParts("2026-13-01")).toBeNull()
      expect(parseDateParts("2026-00-10")).toBeNull()
    })

    it("should accept valid leap day", () => {
      expect(parseDateParts("2024-02-29")).toEqual({
        year: 2024,
        month: 2,
        day: 29,
      })
    })

    it("should return null for malformed or empty inputs", () => {
      expect(parseDateParts("")).toBeNull()
      expect(parseDateParts("invalid")).toBeNull()
      expect(parseDateParts("2026-9-1")).toBeNull()
      expect(parseDateParts("11-09-2026")).toBeNull()
      expect(parseDateParts(null as unknown as string)).toBeNull()
    })
  })

  describe("serializeLocalDate", () => {
    it("should serialize local Date into YYYY-MM-DD", () => {
      const local = new Date(2026, 8, 11) // September is 8
      expect(serializeLocalDate(local)).toBe("2026-09-11")
    })
  })

  describe("serializeUTCDate", () => {
    it("should serialize UTC Date into YYYY-MM-DD regardless of local timezone", () => {
      const utcDate = new Date("2026-03-15T00:00:00.000Z")
      expect(serializeUTCDate(utcDate)).toBe("2026-03-15")
    })

    it("should serialize ISO string into YYYY-MM-DD", () => {
      expect(serializeUTCDate("2026-12-31T00:00:00.000Z")).toBe("2026-12-31")
    })
  })

  describe("normalizeToUTCMidnight", () => {
    it("should normalize Date instance with time to UTC Midnight", () => {
      const d = new Date("2026-05-20T19:30:45.123Z")
      const normalized = normalizeToUTCMidnight(d)
      expect(normalized.toISOString()).toBe("2026-05-20T00:00:00.000Z")
    })

    it("should normalize string date to UTC Midnight", () => {
      const normalized = normalizeToUTCMidnight("2026-05-20T19:30:45.123Z")
      expect(normalized.toISOString()).toBe("2026-05-20T00:00:00.000Z")
    })

    it("should preserve already UTC Midnight date", () => {
      const d = new Date("2026-05-20T00:00:00.000Z")
      expect(normalizeToUTCMidnight(d).toISOString()).toBe(
        "2026-05-20T00:00:00.000Z"
      )
    })
  })

  describe("localDateToUTCMidnight", () => {
    it("should convert local date to UTC midnight of local calendar day", () => {
      const local = new Date(2026, 2, 15, 14, 0, 0) // March 15, 2026 local
      const utc = localDateToUTCMidnight(local)
      expect(utc.getUTCFullYear()).toBe(2026)
      expect(utc.getUTCMonth()).toBe(2)
      expect(utc.getUTCDate()).toBe(15)
      expect(utc.getUTCHours()).toBe(0)
    })
  })

  describe("parseToUTCMidnight", () => {
    it("should parse string date to UTC Midnight", () => {
      const result = parseToUTCMidnight("2026-07-04")
      expect(result?.toISOString()).toBe("2026-07-04T00:00:00.000Z")
    })

    it("should parse ISO date with time to UTC Midnight", () => {
      const result = parseToUTCMidnight("2026-07-04T22:15:00.000Z")
      expect(result?.toISOString()).toBe("2026-07-04T00:00:00.000Z")
    })

    it("should preserve already UTC Midnight Date object", () => {
      const date = new Date("2026-09-30T00:00:00.000Z")
      const result = parseToUTCMidnight(date)
      expect(result).toBe(date)
      expect(result?.toISOString()).toBe("2026-09-30T00:00:00.000Z")
    })

    it("should normalize Date object with time on server without timezone shift", () => {
      const date = new Date("2026-09-30T16:00:00.000Z")
      const result = parseToUTCMidnight(date)
      expect(result?.toISOString()).toBe("2026-09-30T00:00:00.000Z")
    })

    it("should return null for invalid date inputs", () => {
      expect(parseToUTCMidnight("invalid")).toBeNull()
      expect(parseToUTCMidnight("2026-02-30")).toBeNull()
      expect(parseToUTCMidnight(new Date("invalid"))).toBeNull()
      expect(parseToUTCMidnight(null)).toBeNull()
      expect(parseToUTCMidnight(undefined)).toBeNull()
    })
  })

  describe("parseToLocalDate", () => {
    it("should convert UTC Midnight date to local Date", () => {
      const utc = new Date("2026-03-15T00:00:00.000Z")
      const local = parseToLocalDate(utc)
      expect(local?.getFullYear()).toBe(2026)
      expect(local?.getMonth()).toBe(2)
      expect(local?.getDate()).toBe(15)
    })

    it("should convert UTC string date to local Date", () => {
      const local = parseToLocalDate("2026-03-15")
      expect(local?.getFullYear()).toBe(2026)
      expect(local?.getMonth()).toBe(2)
      expect(local?.getDate()).toBe(15)
    })

    it("should return undefined for invalid or empty inputs", () => {
      expect(parseToLocalDate(null)).toBeUndefined()
      expect(parseToLocalDate(undefined)).toBeUndefined()
      expect(parseToLocalDate("invalid")).toBeUndefined()
    })
  })

  describe("Date Math: getDaysInMonth, clampDayToMonth, addDays, isSameUTCDate", () => {
    it("should return correct days in month including leap year", () => {
      expect(getDaysInMonth(2026, 1)).toBe(31) // Jan
      expect(getDaysInMonth(2026, 2)).toBe(28) // Feb non-leap
      expect(getDaysInMonth(2024, 2)).toBe(29) // Feb leap
      expect(getDaysInMonth(2026, 4)).toBe(30) // Apr
    })

    it("should clamp day to maximum days of month", () => {
      expect(clampDayToMonth(2026, 2, 31)).toBe(28)
      expect(clampDayToMonth(2024, 2, 31)).toBe(29)
      expect(clampDayToMonth(2026, 1, 15)).toBe(15)
    })

    it("should add days accurately", () => {
      const base = new Date("2026-01-30T00:00:00.000Z")
      expect(addDays(base, 1).toISOString()).toBe("2026-01-31T00:00:00.000Z")
      expect(addDays(base, 2).toISOString()).toBe("2026-02-01T00:00:00.000Z")
      expect(addDays(base, -1).toISOString()).toBe("2026-01-29T00:00:00.000Z")
    })

    it("should compare same UTC dates", () => {
      const a = new Date("2026-03-15T00:00:00.000Z")
      const b = new Date("2026-03-15T18:00:00.000Z")
      const c = new Date("2026-03-16T00:00:00.000Z")
      expect(isSameUTCDate(a, b)).toBe(true)
      expect(isSameUTCDate(a, c)).toBe(false)
    })
  })

  describe("formatDate", () => {
    it("should format UTC Midnight date using timeZone: UTC", () => {
      const utcDate = new Date("2024-01-15T00:00:00.000Z")
      expect(formatDate(utcDate, "vi" as Locale)).toMatch(
        /^(Thứ 2|Th 2), 15\/01\/2024$/
      )
      expect(formatDate(utcDate, "en" as Locale)).toBe("Mon, 01/15/2024")
    })

    it("should format string date safely", () => {
      expect(formatDate("2024-01-15T00:00:00.000Z", "en" as Locale)).toBe(
        "Mon, 01/15/2024"
      )
    })

    it("should return empty string for null, undefined, or invalid", () => {
      expect(formatDate(null, "en" as Locale)).toBe("")
      expect(formatDate(undefined, "en" as Locale)).toBe("")
      expect(formatDate("invalid", "en" as Locale)).toBe("")
    })
  })

  describe("getTodayInTimezone", () => {
    it("should return localDateToUTCMidnight when timeZone is not provided", () => {
      const fixedNow = new Date("2026-10-01T12:00:00.000Z")
      vi.useFakeTimers()
      vi.setSystemTime(fixedNow)

      const result = getTodayInTimezone()
      expect(result.toISOString()).toBe(
        localDateToUTCMidnight(fixedNow).toISOString()
      )
    })

    it("should correctly resolve calendar date across different timezones", () => {
      // 23:30 UTC on Oct 1 -> Oct 1 in UTC, but Oct 2 in Tokyo (UTC+9)
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-10-01T23:30:00.000Z"))

      const utcToday = getTodayInTimezone("UTC")
      expect(utcToday.toISOString()).toBe("2026-10-01T00:00:00.000Z")

      const tokyoToday = getTodayInTimezone("Asia/Tokyo")
      expect(tokyoToday.toISOString()).toBe("2026-10-02T00:00:00.000Z")
    })

    it("should correctly resolve date behind UTC for negative timezone offsets", () => {
      // 01:30 UTC on Oct 1 -> Oct 1 in UTC, but Sep 30 in New York (EDT, UTC-4)
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-10-01T01:30:00.000Z"))

      const nyToday = getTodayInTimezone("America/New_York")
      expect(nyToday.toISOString()).toBe("2026-09-30T00:00:00.000Z")
    })

    it("should fallback to localDateToUTCMidnight if timezone is invalid", () => {
      const fixedNow = new Date("2026-10-01T12:00:00.000Z")
      vi.useFakeTimers()
      vi.setSystemTime(fixedNow)

      const result = getTodayInTimezone("Invalid/Timezone")
      expect(result.toISOString()).toBe(
        localDateToUTCMidnight(fixedNow).toISOString()
      )
    })
  })
})
