import type { Locale } from "@/i18n/config"
import type { Transaction } from "@/lib/definitions"

export type DateParts = {
  year: number
  month: number
  day: number
}

/**
 * Formats numeric date components into a "YYYY-MM-DD" string with 2-digit zero-padding.
 */
export function formatDateParts(
  year: number,
  month: number,
  day: number
): string {
  const m = String(month).padStart(2, "0")
  const d = String(day).padStart(2, "0")
  return `${year}-${m}-${d}`
}

/**
 * Extracts and validates year, month (1-12), and day (1-31) from a string.
 * Supports "YYYY-MM-DD" and ISO strings like "YYYY-MM-DDTHH:mm:ss.sssZ".
 * Validates real calendar dates (rejects roll-over dates such as Feb 30 or Apr 31).
 */
export function parseDateParts(val: string): DateParts | null {
  if (!val || typeof val !== "string") return null

  const cleanValue = val.includes("T") ? val.split("T")[0] : val
  const match = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    isNaN(probe.getTime()) ||
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

/**
 * Serializes a local Date object into a "YYYY-MM-DD" string using its local calendar components.
 */
export function serializeLocalDate(date: Date): string {
  return formatDateParts(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  )
}

/**
 * Serializes a Date or string into a "YYYY-MM-DD" string using its UTC calendar components.
 * Guarantees zero timezone offset shifts across any client timezone.
 */
export function serializeUTCDate(date: Date | string): string {
  if (typeof date === "string") {
    const parts = parseDateParts(date)
    if (parts) {
      return formatDateParts(parts.year, parts.month, parts.day)
    }
  }
  const d = typeof date === "string" ? new Date(date) : date
  return formatDateParts(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate()
  )
}

/**
 * Normalizes a Date or string to UTC Midnight (00:00:00.000Z), preserving its UTC calendar date.
 */
export function normalizeToUTCMidnight(date: Date | string): Date {
  const d = typeof date === "string" ? new Date(date) : date
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Converts a client's local Date (from DatePicker with local hours) to a UTC Midnight Date.
 */
export function localDateToUTCMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
}

/**
 * Converts a Date or string into a UTC Midnight Date.
 * Handles strings (YYYY-MM-DD or ISO) and Date objects.
 */
export function parseToUTCMidnight(val: unknown): Date | null {
  if (!val) return null

  if (typeof val === "string") {
    if (/^(\d{4})-(\d{2})-(\d{2})/.test(val)) {
      const parts = parseDateParts(val)
      if (!parts) return null
      return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    }
    const d = new Date(val)
    if (isNaN(d.getTime())) return null
    return normalizeToUTCMidnight(d)
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null
    if (
      val.getUTCHours() === 0 &&
      val.getUTCMinutes() === 0 &&
      val.getUTCSeconds() === 0 &&
      val.getUTCMilliseconds() === 0
    ) {
      return val
    }
    if (typeof window !== "undefined") {
      return localDateToUTCMidnight(val)
    }
    return normalizeToUTCMidnight(val)
  }

  return null
}

/**
 * Converts a UTC Midnight Date (or ISO string from DB) into a local Date for DatePickers.
 */
export function parseToLocalDate(
  val: Date | string | undefined | null
): Date | undefined {
  if (!val) return undefined

  if (typeof val === "string") {
    const parts = parseDateParts(val)
    if (parts) {
      const date = new Date(parts.year, parts.month - 1, parts.day)
      return isNaN(date.getTime()) ? undefined : date
    }
  }

  const d = typeof val === "string" ? new Date(val) : val
  if (isNaN(d.getTime())) return undefined
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * Gets the total number of days in the specified month (1-indexed month: 1=Jan, 2=Feb, etc.).
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Clamps a day of month to the maximum days available in that month (handles leap years).
 */
export function clampDayToMonth(
  year: number,
  month: number,
  day: number
): number {
  return Math.min(day, getDaysInMonth(year, month))
}

/**
 * Adds an integer number of days to a Date based on UTC (86,400,000 ms per day).
 */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000)
}

/**
 * Checks if two dates represent the exact same UTC calendar day.
 */
export function isSameUTCDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

/**
 * Formats a Date or string into a localized string (e.g. "Thứ 2, 15/01/2024" or "Mon, 01/15/2024").
 * Automatically renders with timeZone: "UTC" if the date is UTC Midnight.
 */
export function formatDate(
  date: Date | string | undefined | null,
  locale: Locale,
  timeZone?: string
): string {
  if (!date) return ""

  const d = typeof date === "string" ? new Date(date) : date
  if (isNaN(d.getTime())) return ""

  const isUTCMidnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0

  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: isUTCMidnight ? "UTC" : timeZone,
  }).format(d)
}

/**
 * Normalizes today's calendar date in the specified timezone to UTC midnight.
 */
export function getTodayInTimezone(timeZone?: string): Date {
  if (!timeZone) return localDateToUTCMidnight(new Date())

  try {
    // "en-CA" formats as ISO 8601 (YYYY-MM-DD),
    // ensuring reliable parsing of year, month, and day.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
    const [year, month, day] = parts.split("-").map(Number)
    return new Date(Date.UTC(year, month - 1, day))
  } catch {
    return localDateToUTCMidnight(new Date())
  }
}

/**
 * Returns true if the date range overlaps with the given month and/or year.
 */
export function isDateRangeOverlapping(
  start: Date,
  end: Date | null | undefined,
  filterMonth: number | null,
  filterYear: number | null
): boolean {
  if (filterYear && filterMonth) {
    const filterStart = new Date(Date.UTC(filterYear, filterMonth - 1, 1))
    const filterEnd = new Date(Date.UTC(filterYear, filterMonth, 1) - 1)

    return (
      start.getTime() <= filterEnd.getTime() &&
      (!end || end.getTime() >= filterStart.getTime())
    )
  }

  if (filterYear) {
    const filterStart = new Date(Date.UTC(filterYear, 0, 1))
    const filterEnd = new Date(Date.UTC(filterYear + 1, 0, 1) - 1)

    return (
      start.getTime() <= filterEnd.getTime() &&
      (!end || end.getTime() >= filterStart.getTime())
    )
  }

  if (filterMonth) {
    if (!end) return true

    const durationMonths =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth())
    if (durationMonths >= 11) return true

    const startM = start.getUTCMonth() + 1
    const endM = end.getUTCMonth() + 1

    if (startM <= endM) {
      return filterMonth >= startM && filterMonth <= endM
    }

    return filterMonth >= startM || filterMonth <= endM
  }

  return true
}

export function getUniqueYears(transactions: Transaction[]): number[] {
  return Array.from(
    new Set(transactions.map((t) => new Date(t.date).getUTCFullYear()))
  ).sort((a, b) => b - a)
}

type DateRangeItem = {
  startDate: Date | string
  endDate?: Date | string | null
}

export function getUniqueDateRangeYears(items: DateRangeItem[]): number[] {
  return Array.from(
    new Set(
      items.flatMap((item) => {
        const years: number[] = []
        if (item.startDate) {
          const startYear = new Date(item.startDate).getUTCFullYear()
          if (!isNaN(startYear)) years.push(startYear)
        }
        if (item.endDate) {
          const endYear = new Date(item.endDate).getUTCFullYear()
          if (!isNaN(endYear)) years.push(endYear)
        }
        return years
      })
    )
  ).sort((a, b) => b - a)
}
