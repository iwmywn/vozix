import type { CategoryKey, CategoryType } from "@/lib/category"
import {
  addDays,
  clampDayToMonth,
  getTodayInTimezone,
  isDateRangeOverlapping,
  normalizeToUTCMidnight,
} from "@/lib/date"
import type {
  DBRecurringTransaction,
  RecurringTransaction,
  ScheduleStatus,
} from "@/lib/definitions"
import { searchWithMiniSearch } from "@/lib/utils"

export type RecurringScheduleRecord =
  | DBRecurringTransaction
  | RecurringTransaction

export interface ScheduleBoundaries {
  startDateOnly: Date
  endDateOnly: Date | null
  status: ScheduleStatus
}

export interface EvaluatedRecurringSchedule<
  T extends RecurringScheduleRecord = RecurringTransaction,
> {
  schedule: T
  status: ScheduleStatus
  nextOccurrenceDate: Date | null
  occurrences: Date[]
}

export interface UpcomingOccurrence<
  T extends RecurringScheduleRecord = RecurringTransaction,
> {
  schedule: T
  date: Date
}

export interface EvaluatedSchedulesResult<
  T extends RecurringScheduleRecord = RecurringTransaction,
> {
  filteredSchedules: EvaluatedRecurringSchedule<T>[]
  upcomingOccurrences: UpcomingOccurrence<T>[]
}

export interface ScheduleEvaluationFilters {
  searchTerm?: string
  filterMonth?: string
  filterYear?: string
  filterType?: CategoryType | "all"
  filterCategoryKey?: CategoryKey | "all"
  filterStatus?: ScheduleStatus | "all"
}

export interface ScheduleEvaluationOptions {
  timeZone?: string
  asOfDate?: Date
}

export function addMonthsClamped(
  currentUTC: Date,
  months: number,
  targetDay: number
): Date {
  const nextMonth = currentUTC.getUTCMonth() + months
  const targetYear = currentUTC.getUTCFullYear() + Math.floor(nextMonth / 12)
  const targetMonthIndex = ((nextMonth % 12) + 12) % 12
  return new Date(
    Date.UTC(
      targetYear,
      targetMonthIndex,
      clampDayToMonth(targetYear, targetMonthIndex + 1, targetDay)
    )
  )
}

export function stepNextDate(
  currentUTC: Date,
  frequency: DBRecurringTransaction["frequency"],
  startDateUTC: Date,
  randomEveryXDays?: number
): Date {
  const targetDay = startDateUTC.getUTCDate()
  switch (frequency) {
    case "daily":
      return addDays(currentUTC, 1)

    case "weekly":
      return addDays(currentUTC, 7)

    case "bi-weekly":
      return addDays(currentUTC, 14)

    case "monthly":
      return addMonthsClamped(currentUTC, 1, targetDay)

    case "quarterly":
      return addMonthsClamped(currentUTC, 3, targetDay)

    case "yearly":
      return addMonthsClamped(currentUTC, 12, targetDay)

    case "random": {
      const days =
        typeof randomEveryXDays === "number" && randomEveryXDays >= 1
          ? randomEveryXDays
          : 1
      return addDays(currentUTC, days)
    }
  }
}

/**
 * Calculates the next occurrence date for a recurring schedule after its last generated date.
 * Returns null if the schedule has ended or the next candidate exceeds endDate.
 */
export function getNextOccurrence(
  rec: RecurringScheduleRecord,
  asOfDate: Date = normalizeToUTCMidnight(new Date())
): Date | null {
  const asOfDateUTC = normalizeToUTCMidnight(asOfDate)
  const startUTC = normalizeToUTCMidnight(new Date(rec.startDate))
  const endUTC = rec.endDate
    ? normalizeToUTCMidnight(new Date(rec.endDate))
    : null

  let candidate = rec.lastGeneratedDate
    ? stepNextDate(
        normalizeToUTCMidnight(new Date(rec.lastGeneratedDate)),
        rec.frequency,
        startUTC,
        rec.randomEveryXDays
      )
    : startUTC

  while (candidate.getTime() < asOfDateUTC.getTime()) {
    const next = stepNextDate(
      candidate,
      rec.frequency,
      startUTC,
      rec.randomEveryXDays
    )
    if (next.getTime() <= candidate.getTime()) {
      break
    }
    candidate = next
  }

  if (endUTC && candidate.getTime() > endUTC.getTime()) {
    return null
  }

  return candidate
}

/**
 * Calculates all due occurrence dates for a recurring schedule up to today/asOfDate.
 */
export function getDueOccurrences(
  rec: RecurringScheduleRecord,
  asOfDate: Date = normalizeToUTCMidnight(new Date())
): Date[] {
  const asOfDateUTC = normalizeToUTCMidnight(asOfDate)
  const startUTC = normalizeToUTCMidnight(new Date(rec.startDate))
  const endUTC = rec.endDate
    ? normalizeToUTCMidnight(new Date(rec.endDate))
    : null

  const effectiveEndUTC = endUTC && endUTC < asOfDateUTC ? endUTC : asOfDateUTC
  const dueDates: Date[] = []

  let candidate = rec.lastGeneratedDate
    ? stepNextDate(
        normalizeToUTCMidnight(new Date(rec.lastGeneratedDate)),
        rec.frequency,
        startUTC,
        rec.randomEveryXDays
      )
    : startUTC

  while (candidate.getTime() <= effectiveEndUTC.getTime()) {
    dueDates.push(candidate)

    const next = stepNextDate(
      candidate,
      rec.frequency,
      startUTC,
      rec.randomEveryXDays
    )
    if (next.getTime() <= candidate.getTime()) {
      break
    }
    candidate = next
  }

  return dueDates
}

/**
 * Resolves reference UTC midnight date from ScheduleEvaluationOptions.
 * Defaults to UTC timezone when none is specified.
 */
function resolveAsOfDate(options?: ScheduleEvaluationOptions): Date {
  if (options?.asOfDate) {
    return normalizeToUTCMidnight(options.asOfDate)
  }
  return getTodayInTimezone(options?.timeZone ?? "UTC")
}

/**
 * Normalizes schedule boundaries to UTC midnight and resolves domain ScheduleStatus
 * relative to the reference UTC midnight date.
 */
export function resolveScheduleBoundaries(
  startDate: Date | string,
  endDate: Date | string | null | undefined,
  asOfDate: Date = normalizeToUTCMidnight(new Date())
): ScheduleBoundaries {
  const asOfDateUTC = normalizeToUTCMidnight(asOfDate)
  const startDateOnly = normalizeToUTCMidnight(new Date(startDate))
  const endDateOnly = endDate ? normalizeToUTCMidnight(new Date(endDate)) : null

  let status: ScheduleStatus = "active"
  if (startDateOnly.getTime() > asOfDateUTC.getTime()) {
    status = "upcoming"
  } else if (endDateOnly && asOfDateUTC.getTime() > endDateOnly.getTime()) {
    status = "expired"
  }

  return { startDateOnly, endDateOnly, status }
}

/**
 * Evaluates a single recurring schedule against pre-resolved boundaries,
 * avoiding duplicate boundary calculations in batch evaluations.
 */
function evaluateScheduleWithBoundaries<
  T extends RecurringScheduleRecord = RecurringTransaction,
>(
  schedule: T,
  asOfDateUTC: Date,
  boundaries: ScheduleBoundaries
): EvaluatedRecurringSchedule<T> {
  const { status } = boundaries
  const nextOccurrenceDate =
    status === "expired" ? null : getNextOccurrence(schedule, asOfDateUTC)
  const occurrences = getDueOccurrences(schedule, asOfDateUTC)

  return {
    schedule,
    status,
    nextOccurrenceDate,
    occurrences,
  }
}

/**
 * Evaluates the domain status and next occurrence date for a single recurring schedule.
 * Supports independent timezone resolution and short-circuits next occurrence calculation
 * when the schedule is expired (occurrences still include historical due dates).
 */
export function evaluateRecurringSchedule<
  T extends RecurringScheduleRecord = RecurringTransaction,
>(
  schedule: T,
  options?: ScheduleEvaluationOptions
): EvaluatedRecurringSchedule<T> {
  const asOfDateUTC = resolveAsOfDate(options)
  const boundaries = resolveScheduleBoundaries(
    schedule.startDate,
    schedule.endDate,
    asOfDateUTC
  )
  return evaluateScheduleWithBoundaries(schedule, asOfDateUTC, boundaries)
}

/**
 * Deep evaluation and single-pass filtering for recurring schedules.
 * Encapsulates timezone parity, full-text search, multi-criteria filtering,
 * schedule status lifecycle, and projected occurrence resolution.
 * Returns both filtered schedules and chronologically sorted upcoming occurrences.
 */
export function evaluateRecurringSchedules<
  T extends RecurringScheduleRecord = RecurringTransaction,
>(
  schedules: T[],
  filters?: ScheduleEvaluationFilters,
  options?: ScheduleEvaluationOptions
): EvaluatedSchedulesResult<T> {
  const asOfDateUTC = resolveAsOfDate(options)

  const parsedMonth =
    !filters?.filterMonth || filters.filterMonth === "all"
      ? null
      : parseInt(filters.filterMonth, 10)

  const parsedYear =
    !filters?.filterYear || filters.filterYear === "all"
      ? null
      : parseInt(filters.filterYear, 10)

  const matchingIds = filters?.searchTerm?.trim()
    ? searchWithMiniSearch(schedules, filters.searchTerm, ["description"])
    : null

  const filteredSchedules: EvaluatedRecurringSchedule<T>[] = []

  for (const schedule of schedules) {
    if (matchingIds && !matchingIds.has(String(schedule._id))) {
      continue
    }

    if (
      filters?.filterType &&
      filters.filterType !== "all" &&
      schedule.type !== filters.filterType
    ) {
      continue
    }

    if (
      filters?.filterCategoryKey &&
      filters.filterCategoryKey !== "all" &&
      schedule.categoryKey !== filters.filterCategoryKey
    ) {
      continue
    }

    const boundaries = resolveScheduleBoundaries(
      schedule.startDate,
      schedule.endDate,
      asOfDateUTC
    )

    if (
      !isDateRangeOverlapping(
        boundaries.startDateOnly,
        boundaries.endDateOnly,
        parsedMonth,
        parsedYear
      )
    ) {
      continue
    }

    if (filters?.filterStatus && filters.filterStatus !== "all") {
      if (boundaries.status !== filters.filterStatus) {
        continue
      }
    }

    filteredSchedules.push(
      evaluateScheduleWithBoundaries(schedule, asOfDateUTC, boundaries)
    )
  }

  const upcomingOccurrences: UpcomingOccurrence<T>[] = filteredSchedules
    .filter(
      (
        item
      ): item is EvaluatedRecurringSchedule<T> & { nextOccurrenceDate: Date } =>
        item.status === "active" && item.nextOccurrenceDate !== null
    )
    .map((item) => ({
      schedule: item.schedule,
      date: item.nextOccurrenceDate,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  return {
    filteredSchedules,
    upcomingOccurrences,
  }
}
