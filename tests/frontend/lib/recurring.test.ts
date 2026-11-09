import { vi } from "vitest"

import {
  mockDBRecurringTransaction,
  mockRecurringTransactions,
} from "@/tests/shared/data"
import {
  addMonthsClamped,
  evaluateRecurringSchedule,
  evaluateRecurringSchedules,
  getDueOccurrences,
  getNextOccurrence,
  resolveScheduleBoundaries,
  stepNextDate,
} from "@/lib/recurring"
import type {
  ScheduleEvaluationFilters,
  ScheduleEvaluationOptions,
} from "@/lib/recurring"

describe("Recurring Domain Module", () => {
  describe("Pure Date Calculations", () => {
    it("should clamp day to month end when adding months across shorter months", () => {
      // Jan 31 + 1 month -> Feb 29 (in leap year 2024)
      const jan31 = new Date(Date.UTC(2024, 0, 31))
      const feb29 = addMonthsClamped(jan31, 1, 31)
      expect(feb29.getUTCFullYear()).toBe(2024)
      expect(feb29.getUTCMonth()).toBe(1) // Feb
      expect(feb29.getUTCDate()).toBe(29)

      // Jan 31 2023 + 1 month -> Feb 28 (non-leap year)
      const jan31NonLeap = new Date(Date.UTC(2023, 0, 31))
      const feb28 = addMonthsClamped(jan31NonLeap, 1, 31)
      expect(feb28.getUTCFullYear()).toBe(2023)
      expect(feb28.getUTCMonth()).toBe(1)
      expect(feb28.getUTCDate()).toBe(28)
    })

    it("should advance dates according to frequency", () => {
      const base = new Date(Date.UTC(2024, 0, 15))

      expect(stepNextDate(base, "daily", base).toISOString().slice(0, 10)).toBe(
        "2024-01-16"
      )
      expect(
        stepNextDate(base, "weekly", base).toISOString().slice(0, 10)
      ).toBe("2024-01-22")
      expect(
        stepNextDate(base, "bi-weekly", base).toISOString().slice(0, 10)
      ).toBe("2024-01-29")
      expect(
        stepNextDate(base, "monthly", base).toISOString().slice(0, 10)
      ).toBe("2024-02-15")
      expect(
        stepNextDate(base, "quarterly", base).toISOString().slice(0, 10)
      ).toBe("2024-04-15")
      expect(
        stepNextDate(base, "yearly", base).toISOString().slice(0, 10)
      ).toBe("2025-01-15")
      expect(
        stepNextDate(base, "random", base, 5).toISOString().slice(0, 10)
      ).toBe("2024-01-20")
    })

    it("should return null for getNextOccurrence when schedule has expired", () => {
      const expiredRec = {
        ...mockRecurringTransactions[0],
        startDate: new Date("2023-01-01T00:00:00Z"),
        endDate: new Date("2023-06-01T00:00:00Z"),
      }
      const asOfDate = new Date("2024-01-01T00:00:00Z")
      expect(getNextOccurrence(expiredRec, asOfDate)).toBeNull()
    })

    it("should return all due occurrences up to asOfDate", () => {
      const rec = {
        ...mockRecurringTransactions[0],
        frequency: "monthly" as const,
        startDate: new Date("2024-01-15T00:00:00Z"),
        endDate: new Date("2024-05-15T00:00:00Z"),
        lastGeneratedDate: undefined,
      }
      const dueDates = getDueOccurrences(rec, new Date("2024-03-20T00:00:00Z"))
      expect(dueDates.map((d) => d.toISOString().slice(0, 10))).toEqual([
        "2024-01-15",
        "2024-02-15",
        "2024-03-15",
      ])
    })
  })

  describe("resolveScheduleBoundaries", () => {
    const todayUTC = new Date("2026-06-15T00:00:00.000Z")

    it("should resolve upcoming status when startDate is in the future", () => {
      const boundaries = resolveScheduleBoundaries(
        "2026-07-01",
        "2026-08-01",
        todayUTC
      )
      expect(boundaries.status).toBe("upcoming")
      expect(boundaries.startDateOnly.toISOString()).toBe(
        "2026-07-01T00:00:00.000Z"
      )
      expect(boundaries.endDateOnly?.toISOString()).toBe(
        "2026-08-01T00:00:00.000Z"
      )
    })

    it("should resolve active status when today is between startDate and endDate", () => {
      const boundaries = resolveScheduleBoundaries(
        "2026-06-01",
        "2026-06-30",
        todayUTC
      )
      expect(boundaries.status).toBe("active")
      expect(boundaries.startDateOnly.toISOString()).toBe(
        "2026-06-01T00:00:00.000Z"
      )
      expect(boundaries.endDateOnly?.toISOString()).toBe(
        "2026-06-30T00:00:00.000Z"
      )
    })

    it("should resolve active status when schedule has no endDate and startDate is past/today", () => {
      const boundaries = resolveScheduleBoundaries("2026-06-15", null, todayUTC)
      expect(boundaries.status).toBe("active")
      expect(boundaries.startDateOnly.toISOString()).toBe(
        "2026-06-15T00:00:00.000Z"
      )
      expect(boundaries.endDateOnly).toBeNull()
    })

    it("should resolve expired status when today is past endDate", () => {
      const boundaries = resolveScheduleBoundaries(
        "2026-01-01",
        "2026-05-31",
        todayUTC
      )
      expect(boundaries.status).toBe("expired")
      expect(boundaries.startDateOnly.toISOString()).toBe(
        "2026-01-01T00:00:00.000Z"
      )
      expect(boundaries.endDateOnly?.toISOString()).toBe(
        "2026-05-31T00:00:00.000Z"
      )
    })
  })

  describe("evaluateRecurringSchedule", () => {
    it("should classify schedule as upcoming when startDate > todayUTC", () => {
      const today = new Date("2024-04-15T00:00:00Z")
      const upcomingRec = {
        ...mockRecurringTransactions[0],
        startDate: new Date("2024-05-01T00:00:00Z"),
      }
      const result = evaluateRecurringSchedule(upcomingRec, { asOfDate: today })
      expect(result.status).toBe("upcoming")
      expect(result.nextOccurrenceDate?.toISOString().slice(0, 10)).toBe(
        "2024-05-01"
      )
      expect(result.occurrences).toHaveLength(0)
    })

    it("should classify schedule as expired when todayUTC > endDate", () => {
      const today = new Date("2024-04-15T00:00:00Z")
      const expiredRec = {
        ...mockRecurringTransactions[0],
        startDate: new Date("2023-01-01T00:00:00Z"),
        endDate: new Date("2024-01-01T00:00:00Z"),
      }
      const result = evaluateRecurringSchedule(expiredRec, { asOfDate: today })
      expect(result.status).toBe("expired")
      expect(result.nextOccurrenceDate).toBeNull()
      expect(result.occurrences.length).toBeGreaterThan(0)
    })

    it("should classify schedule as active when within range", () => {
      const today = new Date("2024-04-15T00:00:00Z")
      const activeRec = {
        ...mockRecurringTransactions[0],
        startDate: new Date("2024-01-01T00:00:00Z"),
        endDate: new Date("2024-12-31T00:00:00Z"),
      }
      const result = evaluateRecurringSchedule(activeRec, { asOfDate: today })
      expect(result.status).toBe("active")
      expect(result.nextOccurrenceDate).not.toBeNull()
      expect(result.occurrences.length).toBeGreaterThan(0)
    })

    it("should evaluate single schedule with options and return EvaluatedRecurringSchedule", () => {
      const fixedToday = new Date("2024-04-15T00:00:00.000Z")
      const activeSchedule = mockRecurringTransactions[0]
      const evaluated = evaluateRecurringSchedule(activeSchedule, {
        asOfDate: fixedToday,
      })
      expect(evaluated.schedule).toBe(activeSchedule)
      expect(evaluated.status).toBe("active")
      expect(evaluated.nextOccurrenceDate).not.toBeNull()
      expect(evaluated.occurrences.length).toBeGreaterThan(0)

      const expiredSchedule = mockRecurringTransactions[3]
      const evaluatedExpired = evaluateRecurringSchedule(expiredSchedule, {
        asOfDate: fixedToday,
      })
      expect(evaluatedExpired.schedule).toBe(expiredSchedule)
      expect(evaluatedExpired.status).toBe("expired")
      expect(evaluatedExpired.nextOccurrenceDate).toBeNull()
      expect(evaluatedExpired.occurrences.length).toBeGreaterThan(0)
    })

    it("should shift status between upcoming and active across timezone boundaries", () => {
      vi.useFakeTimers()
      try {
        // Freeze time at 2024-04-14 20:00:00 UTC
        vi.setSystemTime(new Date("2024-04-14T20:00:00Z"))

        const boundarySchedule = {
          ...mockRecurringTransactions[0],
          startDate: new Date("2024-04-15T00:00:00Z"),
          endDate: new Date("2024-04-30T00:00:00Z"),
        }

        // In UTC, 2024-04-14 20:00 is April 14 -> upcoming
        const utcResult = evaluateRecurringSchedule(boundarySchedule, {
          timeZone: "UTC",
        })
        expect(utcResult.status).toBe("upcoming")

        // In Asia/Bangkok (+07:00), 2024-04-14 20:00 UTC is 2024-04-15 03:00 -> active
        const bkkResult = evaluateRecurringSchedule(boundarySchedule, {
          timeZone: "Asia/Bangkok",
        })
        expect(bkkResult.status).toBe("active")
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe("evaluateRecurringSchedules", () => {
    const fixedToday = new Date("2024-04-15T00:00:00.000Z")

    it("should return both filteredSchedules and chronologically sorted upcomingOccurrences", () => {
      const { filteredSchedules, upcomingOccurrences } =
        evaluateRecurringSchedules(
          mockRecurringTransactions,
          {},
          { asOfDate: fixedToday }
        )

      expect(filteredSchedules).toHaveLength(8)
      expect(filteredSchedules[0]).toHaveProperty("schedule")
      expect(filteredSchedules[0]).toHaveProperty("status")
      expect(filteredSchedules[0]).toHaveProperty("nextOccurrenceDate")
      expect(filteredSchedules[0]).toHaveProperty("occurrences")

      expect(upcomingOccurrences.length).toBeGreaterThan(0)
      for (let i = 1; i < upcomingOccurrences.length; i++) {
        expect(upcomingOccurrences[i].date.getTime()).toBeGreaterThanOrEqual(
          upcomingOccurrences[i - 1].date.getTime()
        )
      }
    })

    it("should filter by search term", () => {
      const { filteredSchedules } = evaluateRecurringSchedules(
        mockRecurringTransactions,
        { searchTerm: "salary" },
        { asOfDate: fixedToday }
      )

      expect(filteredSchedules).toHaveLength(1)
      expect(filteredSchedules[0].schedule.description).toBe("Monthly Salary")
    })

    it("should handle case-insensitive and partial search matches", () => {
      const { filteredSchedules } = evaluateRecurringSchedules(
        mockRecurringTransactions,
        { searchTerm: "GROCER" },
        { asOfDate: fixedToday }
      )

      expect(filteredSchedules).toHaveLength(1)
      expect(filteredSchedules[0].schedule.description).toBe("Weekly Groceries")
    })

    it("should filter by transaction type", () => {
      const { filteredSchedules } = evaluateRecurringSchedules(
        mockRecurringTransactions,
        { filterType: "inflow" },
        { asOfDate: fixedToday }
      )

      expect(filteredSchedules).toHaveLength(2)
      expect(filteredSchedules.every((r) => r.schedule.type === "inflow")).toBe(
        true
      )
      expect(filteredSchedules.map((r) => r.schedule._id)).toEqual(["1", "5"])
    })

    it("should filter by category key", () => {
      const { filteredSchedules } = evaluateRecurringSchedules(
        mockRecurringTransactions,
        { filterCategoryKey: "food_beverage" },
        { asOfDate: fixedToday }
      )

      expect(filteredSchedules).toHaveLength(2)
      expect(
        filteredSchedules.every(
          (r) => r.schedule.categoryKey === "food_beverage"
        )
      ).toBe(true)
      expect(filteredSchedules.map((r) => r.schedule._id)).toEqual(["2", "6"])
    })

    it("should filter by status - active", () => {
      const { filteredSchedules, upcomingOccurrences } =
        evaluateRecurringSchedules(
          mockRecurringTransactions,
          { filterStatus: "active" },
          { asOfDate: fixedToday }
        )

      expect(filteredSchedules).toHaveLength(6)
      expect(filteredSchedules.every((r) => r.status === "active")).toBe(true)
      expect(filteredSchedules.map((r) => r.schedule._id)).toEqual([
        "1",
        "2",
        "3",
        "6",
        "7",
        "8",
      ])
      expect(upcomingOccurrences.length).toBe(6)
    })

    it("should filter by status - expired", () => {
      const { filteredSchedules, upcomingOccurrences } =
        evaluateRecurringSchedules(
          mockRecurringTransactions,
          { filterStatus: "expired" },
          { asOfDate: fixedToday }
        )
      expect(filteredSchedules).toHaveLength(2)
      expect(filteredSchedules.every((r) => r.status === "expired")).toBe(true)
      expect(filteredSchedules.map((r) => r.schedule._id)).toEqual(["4", "5"])
      // Expired schedules short-circuit nextOccurrenceDate to null and have no upcoming occurrences
      expect(
        filteredSchedules.every((r) => r.nextOccurrenceDate === null)
      ).toBe(true)
      expect(upcomingOccurrences).toHaveLength(0)
    })

    it("should filter by status - upcoming and exclude upcoming schedules from upcomingOccurrences", () => {
      const upcomingRec = {
        ...mockRecurringTransactions[0],
        _id: "upcoming-1",
        startDate: new Date("2099-01-01"),
        endDate: new Date("2099-12-31"),
      }
      const list = [...mockRecurringTransactions, upcomingRec]
      const { filteredSchedules, upcomingOccurrences } =
        evaluateRecurringSchedules(
          list,
          { filterStatus: "upcoming" },
          { asOfDate: fixedToday }
        )

      expect(filteredSchedules).toHaveLength(1)
      expect(filteredSchedules[0].schedule._id).toBe("upcoming-1")
      expect(filteredSchedules[0].status).toBe("upcoming")
      // Upcoming schedules have start date in future, so they are not active and cannot yield upcomingOccurrences
      expect(upcomingOccurrences).toHaveLength(0)
    })

    it("should filter by month and year", () => {
      const { filteredSchedules: resultsMonth } = evaluateRecurringSchedules(
        mockRecurringTransactions,
        { filterMonth: "1" },
        { asOfDate: fixedToday }
      )
      expect(resultsMonth.map((r) => r.schedule._id)).toEqual([
        "1",
        "2",
        "3",
        "6",
        "7",
        "8",
      ])

      const { filteredSchedules: resultsYear } = evaluateRecurringSchedules(
        mockRecurringTransactions,
        { filterYear: "2024" },
        { asOfDate: fixedToday }
      )
      expect(resultsYear.map((r) => r.schedule._id)).toEqual([
        "1",
        "2",
        "3",
        "4",
        "6",
        "7",
        "8",
      ])
    })

    it("should respect timezone option parity when filtering active schedules", () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date("2024-04-14T20:00:00Z"))

        const boundarySchedule = {
          ...mockRecurringTransactions[0],
          _id: "tz-boundary-1",
          startDate: new Date("2024-04-15T00:00:00Z"),
          endDate: new Date("2024-04-30T00:00:00Z"),
        }

        const list = [boundarySchedule]

        // In UTC, April 14 is before April 15 start date -> upcoming, not active
        const { filteredSchedules: utcActive } = evaluateRecurringSchedules(
          list,
          { filterStatus: "active" },
          { timeZone: "UTC" }
        )
        expect(utcActive).toHaveLength(0)

        // In Asia/Bangkok (+07:00), it is April 15 -> active
        const { filteredSchedules: bkkActive } = evaluateRecurringSchedules(
          list,
          { filterStatus: "active" },
          { timeZone: "Asia/Bangkok" }
        )
        expect(bkkActive).toHaveLength(1)
        expect(bkkActive[0].schedule._id).toBe("tz-boundary-1")
      } finally {
        vi.useRealTimers()
      }
    })

    it("should combine multiple filters", () => {
      const { filteredSchedules } = evaluateRecurringSchedules(
        mockRecurringTransactions,
        {
          searchTerm: "monthly",
          filterType: "inflow",
          filterStatus: "active",
        },
        { asOfDate: fixedToday }
      )

      expect(filteredSchedules).toHaveLength(1)
      expect(filteredSchedules[0].schedule._id).toBe("1")
      expect(filteredSchedules[0].schedule.description).toBe("Monthly Salary")
      expect(filteredSchedules[0].status).toBe("active")
    })

    it("should return empty results for empty schedules", () => {
      const { filteredSchedules, upcomingOccurrences } =
        evaluateRecurringSchedules([], { searchTerm: "test" })
      expect(filteredSchedules).toEqual([])
      expect(upcomingOccurrences).toEqual([])
    })

    describe("Date Boundaries", () => {
      const boundaryToday = new Date("2026-06-15T12:00:00Z")
      const recurringList = [
        {
          _id: "rec-active-no-end",
          userId: "user-1",
          type: "outflow" as const,
          categoryKey: "food_beverage" as const,
          amount: "50000",
          currency: "VND" as const,
          description: "Lunch subscription",
          frequency: "daily" as const,
          startDate: new Date("2026-06-01T00:00:00Z"),
        },
        {
          _id: "rec-active-ending-today",
          userId: "user-1",
          type: "outflow" as const,
          categoryKey: "housing_utilities" as const,
          amount: "100000",
          currency: "VND" as const,
          description: "Internet bill",
          frequency: "monthly" as const,
          startDate: new Date("2026-01-15T00:00:00Z"),
          endDate: new Date("2026-06-15T00:00:00Z"), // Ends today
        },
        {
          _id: "rec-expired-yesterday",
          userId: "user-1",
          type: "inflow" as const,
          categoryKey: "salary_bonus" as const,
          amount: "5000000",
          currency: "VND" as const,
          description: "Contract salary",
          frequency: "monthly" as const,
          startDate: new Date("2026-01-01T00:00:00Z"),
          endDate: new Date("2026-06-14T00:00:00Z"), // Ended yesterday
        },
      ]

      it("should consider a recurring schedule ending today as active and not expired", () => {
        const { filteredSchedules: activeOnly } = evaluateRecurringSchedules(
          recurringList,
          { filterStatus: "active" },
          { asOfDate: boundaryToday }
        )
        expect(activeOnly.map((r) => r.schedule._id)).toEqual([
          "rec-active-no-end",
          "rec-active-ending-today",
        ])

        const { filteredSchedules: expiredOnly } = evaluateRecurringSchedules(
          recurringList,
          { filterStatus: "expired" },
          { asOfDate: boundaryToday }
        )
        expect(expiredOnly.map((r) => r.schedule._id)).toEqual([
          "rec-expired-yesterday",
        ])
      })

      it("should filter recurring schedules by type and category", () => {
        const { filteredSchedules: inflowOnly } = evaluateRecurringSchedules(
          recurringList,
          { filterType: "inflow" },
          { asOfDate: boundaryToday }
        )
        expect(inflowOnly.map((r) => r.schedule._id)).toEqual([
          "rec-expired-yesterday",
        ])

        const { filteredSchedules: foodOnly } = evaluateRecurringSchedules(
          recurringList,
          { filterCategoryKey: "food_beverage" },
          { asOfDate: boundaryToday }
        )
        expect(foodOnly.map((r) => r.schedule._id)).toEqual([
          "rec-active-no-end",
        ])
      })

      it("should respect asOfDate to prevent timezone mismatch", () => {
        // If today is June 16, rec-active-ending-today (ends June 15) should be expired
        const customToday = new Date("2026-06-16T00:00:00Z")
        const { filteredSchedules: result } = evaluateRecurringSchedules(
          recurringList,
          { filterStatus: "active" },
          { asOfDate: customToday }
        )
        expect(result.map((r) => r.schedule._id)).toEqual(["rec-active-no-end"])
      })

      it("should evaluate DBRecurringTransaction preserving database types in both single and list evaluation", () => {
        const fixedAsOf = new Date("2024-06-01T00:00:00Z")

        // Single item evaluation preserves DBRecurringTransaction
        const single = evaluateRecurringSchedule(mockDBRecurringTransaction, {
          asOfDate: fixedAsOf,
        })
        expect(single.schedule._id.toHexString()).toBe(
          "68f896e5cda4897217a05a3e"
        )
        expect(single.status).toBe("active")
        expect(single.nextOccurrenceDate).toBeInstanceOf(Date)
        expect(single.occurrences.length).toBeGreaterThan(0)

        // List evaluation preserves generic DBRecurringTransaction
        const { filteredSchedules: list } = evaluateRecurringSchedules(
          [mockDBRecurringTransaction],
          { filterStatus: "active" },
          { asOfDate: fixedAsOf }
        )
        expect(list).toHaveLength(1)
        expect(list[0].schedule._id.toHexString()).toBe(
          "68f896e5cda4897217a05a3e"
        )
        expect(list[0].schedule.amount.toString()).toBe("5000000")
        expect(list[0].status).toBe("active")
        expect(list[0].nextOccurrenceDate).toBeInstanceOf(Date)
        expect(list[0].occurrences.length).toBeGreaterThan(0)
      })

      it("should support search filtering on DBRecurringTransaction with ObjectId", () => {
        const fixedAsOf = new Date("2024-06-01T00:00:00Z")
        const { filteredSchedules: matched } = evaluateRecurringSchedules(
          [mockDBRecurringTransaction],
          { searchTerm: "Monthly" },
          { asOfDate: fixedAsOf }
        )
        expect(matched).toHaveLength(1)
        expect(matched[0].schedule._id.toHexString()).toBe(
          "68f896e5cda4897217a05a3e"
        )

        const { filteredSchedules: unmatched } = evaluateRecurringSchedules(
          [mockDBRecurringTransaction],
          { searchTerm: "NonExistentTerm" },
          { asOfDate: fixedAsOf }
        )
        expect(unmatched).toHaveLength(0)
      })

      it("should default timeZone to UTC and asOfDate to today when options are omitted", () => {
        vi.useFakeTimers()
        try {
          vi.setSystemTime(new Date("2026-06-15T12:00:00Z"))

          const schedule = {
            ...mockRecurringTransactions[0],
            frequency: "daily" as const,
            startDate: new Date("2026-06-01T00:00:00Z"),
            endDate: new Date("2026-06-30T00:00:00Z"),
          }

          const single = evaluateRecurringSchedule(schedule)
          expect(single.status).toBe("active")
          expect(single.nextOccurrenceDate).toBeInstanceOf(Date)
          expect(single.occurrences.length).toBeGreaterThan(0)

          const { filteredSchedules: list } = evaluateRecurringSchedules([
            schedule,
          ])
          expect(list).toHaveLength(1)
          expect(list[0].status).toBe("active")
          expect(list[0].nextOccurrenceDate).toBeInstanceOf(Date)
          expect(list[0].occurrences.length).toBeGreaterThan(0)
        } finally {
          vi.useRealTimers()
        }
      })

      it("should accept typed ScheduleEvaluationOptions and ScheduleEvaluationFilters", () => {
        const filters: ScheduleEvaluationFilters = {
          filterStatus: "active",
          searchTerm: "Salary",
          filterType: "inflow",
          filterCategoryKey: "salary_bonus",
        }
        const options: ScheduleEvaluationOptions = {
          timeZone: "Asia/Ho_Chi_Minh",
          asOfDate: new Date("2024-06-15T00:00:00Z"),
        }
        const results = evaluateRecurringSchedules(
          mockRecurringTransactions,
          filters,
          options
        )
        expect(results.filteredSchedules.length).toBeGreaterThan(0)
        for (const item of results.filteredSchedules) {
          expect(item.status).toBe("active")
          expect(item.schedule.type).toBe("inflow")
          expect(item.schedule.categoryKey).toBe("salary_bonus")
        }
        expect(results.upcomingOccurrences.length).toBeGreaterThan(0)
        for (const occ of results.upcomingOccurrences) {
          expect(occ.schedule.type).toBe("inflow")
          expect(occ.date).toBeInstanceOf(Date)
        }
      })
    })
  })
})
