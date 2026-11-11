import {
  mockCustomCategories,
  mockTransactions,
  mockUsers,
} from "@/tests/shared/data"
import { isDateRangeOverlapping } from "@/lib/date"
import type { User } from "@/lib/definitions"
import {
  applyTemporalFilterChange,
  applyTransactionFilterChange,
  buildTransactionsCSVExport,
  buildTransactionsHref,
  filterCustomCategories,
  filterTransactions,
  filterUsers,
  getTransactionFilterKey,
  hasActiveTemporalFilters,
  hasActiveTransactionFilters,
  parseAsLocalDate,
} from "@/lib/filters"
import type { FlowTypeFilter, TransactionFilterState } from "@/lib/filters"

describe("Filters", () => {
  describe("isDateRangeOverlapping", () => {
    it("should return true when filter is empty", () => {
      expect(
        isDateRangeOverlapping(
          new Date("2024-01-01"),
          new Date("2024-12-31"),
          null,
          null
        )
      ).toBe(true)
    })

    it("should properly overlap cross-year ranges (e.g. Nov 2023 to Mar 2024)", () => {
      const start = new Date("2023-11-01T00:00:00Z")
      const end = new Date("2024-03-31T00:00:00Z")

      // Jan 2024 -> Overlaps
      expect(isDateRangeOverlapping(start, end, 1, 2024)).toBe(true)

      // Dec 2023 -> Overlaps
      expect(isDateRangeOverlapping(start, end, 12, 2023)).toBe(true)

      // Apr 2024 -> NOT overlap
      expect(isDateRangeOverlapping(start, end, 4, 2024)).toBe(false)

      // Oct 2023 -> NOT overlap
      expect(isDateRangeOverlapping(start, end, 10, 2023)).toBe(false)
    })

    it("should correctly handle filtering by ONLY month for cross-year", () => {
      const start = new Date("2023-11-01T00:00:00Z")
      const end = new Date("2024-03-31T00:00:00Z")

      // Month = 1 (Jan) spans
      expect(isDateRangeOverlapping(start, end, 1, null)).toBe(true)

      // Month = 12 (Dec) spans
      expect(isDateRangeOverlapping(start, end, 12, null)).toBe(true)

      // Month = 2 (Feb) spans
      expect(isDateRangeOverlapping(start, end, 2, null)).toBe(true)

      // Month = 4 (Apr) does NOT span
      expect(isDateRangeOverlapping(start, end, 4, null)).toBe(false)

      // Month = 11 (Nov) spans
      expect(isDateRangeOverlapping(start, end, 11, null)).toBe(true)
    })

    it("should correctly handle infinite end dates", () => {
      const start = new Date("2024-04-01T00:00:00Z")
      const end = null

      // Month = 1 (Jan), Year = null -> infinite, eventually hits Jan
      expect(isDateRangeOverlapping(start, end, 1, null)).toBe(true)

      // Month = 1, Year = 2024 -> Only active after Apr 2024. Jan 2024 is FALSE!
      expect(isDateRangeOverlapping(start, end, 1, 2024)).toBe(false)

      // Month = 5, Year = 2024 -> Active
      expect(isDateRangeOverlapping(start, end, 5, 2024)).toBe(true)

      // Month = 1, Year = 2025 -> Active!
      expect(isDateRangeOverlapping(start, end, 1, 2025)).toBe(true)
    })

    it("should correctly handle filtering by ONLY year (filterMonth is null)", () => {
      const start = new Date("2024-03-01T00:00:00Z")
      const end = new Date("2024-06-30T00:00:00Z")

      // Range in 2024
      expect(isDateRangeOverlapping(start, end, null, 2024)).toBe(true)
      // Filter year is 2023 (ended before)
      expect(isDateRangeOverlapping(start, end, null, 2023)).toBe(false)
      // Filter year is 2025 (starts after)
      expect(isDateRangeOverlapping(start, end, null, 2025)).toBe(false)

      // Multi-year range (2023 to 2025) spans 2024
      const multiYearStart = new Date("2023-06-01T00:00:00Z")
      const multiYearEnd = new Date("2025-06-01T00:00:00Z")
      expect(
        isDateRangeOverlapping(multiYearStart, multiYearEnd, null, 2024)
      ).toBe(true)

      // Infinite end date
      expect(isDateRangeOverlapping(start, null, null, 2024)).toBe(true)
      expect(
        isDateRangeOverlapping(
          new Date("2025-01-01T00:00:00Z"),
          null,
          null,
          2024
        )
      ).toBe(false)
    })

    it("should correctly handle filtering by ONLY month for same-year ranges (startM <= endM)", () => {
      const start = new Date("2024-03-01T00:00:00Z")
      const end = new Date("2024-06-30T00:00:00Z")

      // Month 3 (start), Month 4 (middle), Month 6 (end) -> overlap
      expect(isDateRangeOverlapping(start, end, 3, null)).toBe(true)
      expect(isDateRangeOverlapping(start, end, 4, null)).toBe(true)
      expect(isDateRangeOverlapping(start, end, 6, null)).toBe(true)

      // Month 2 (before), Month 7 (after) -> do NOT overlap
      expect(isDateRangeOverlapping(start, end, 2, null)).toBe(false)
      expect(isDateRangeOverlapping(start, end, 7, null)).toBe(false)
    })

    it("should return true for any month when range duration is at least 11 months", () => {
      const start = new Date("2023-01-01T00:00:00Z")
      const end = new Date("2024-01-01T00:00:00Z")

      expect(isDateRangeOverlapping(start, end, 7, null)).toBe(true)
      expect(isDateRangeOverlapping(start, end, 12, null)).toBe(true)
    })

    it("should return false when range starts after or ends before the filtered month and year", () => {
      const start = new Date("2024-03-01T00:00:00Z")
      const end = new Date("2024-03-31T00:00:00Z")

      // Filter is Feb 2024 (range starts after Feb)
      expect(isDateRangeOverlapping(start, end, 2, 2024)).toBe(false)

      const startJan = new Date("2024-01-01T00:00:00Z")
      const endJan = new Date("2024-01-31T00:00:00Z")

      // Filter is Feb 2024 (range ended before Feb)
      expect(isDateRangeOverlapping(startJan, endJan, 2, 2024)).toBe(false)
    })
  })

  describe("filterTransactions", () => {
    it("should filter by search term", () => {
      const result = filterTransactions(mockTransactions, {
        searchTerm: "salary",
      })

      expect(result).toHaveLength(2)
      expect(result[0].description).toBe("Salary")
    })

    it("should filter by transaction type", () => {
      const result = filterTransactions(mockTransactions, {
        filterType: "inflow",
      })

      expect(result).toHaveLength(3)
      expect(result.every((t) => t.type === "inflow")).toBe(true)
    })

    it("should filter by category key", () => {
      const result = filterTransactions(mockTransactions, {
        filterCategoryKey: "food_beverage",
      })

      expect(result).toHaveLength(2)
      expect(result[0].categoryKey).toBe("food_beverage")
    })

    it("should filter by month", () => {
      const result = filterTransactions(mockTransactions, {
        filterMonth: "1",
      })

      expect(result).toHaveLength(6)
      expect(result.every((t) => new Date(t.date).getMonth() === 0)).toBe(true)
      expect(result.map((t) => t._id)).toEqual(["1", "2", "3", "4", "5", "9"])
    })

    it("should filter by year", () => {
      const result = filterTransactions(mockTransactions, {
        filterYear: "2024",
      })

      expect(result).toHaveLength(8)
      expect(result.every((t) => new Date(t.date).getFullYear() === 2024)).toBe(
        true
      )
    })

    it("should filter by selected date", () => {
      const selectedDate = new Date("2024-01-20")
      const result = filterTransactions(mockTransactions, {
        selectedDate,
      })

      expect(result).toHaveLength(1)
      expect(result[0]._id).toBe("3")
    })

    it("should filter by date range", () => {
      const result = filterTransactions(mockTransactions, {
        dateRange: {
          from: new Date("2024-01-20"),
          to: new Date("2024-01-25"),
        },
      })

      expect(result).toHaveLength(3)
      expect(result.map((t) => t._id)).toEqual(["3", "4", "5"])
    })

    it("should combine multiple filters", () => {
      const result = filterTransactions(mockTransactions, {
        searchTerm: "freelance",
        filterType: "inflow",
        filterYear: "2024",
      })

      expect(result).toHaveLength(1)
      expect(result[0]._id).toBe("3")
    })

    it("should return all transactions when no filters applied", () => {
      const result = filterTransactions(mockTransactions, {})

      expect(result).toHaveLength(9)
    })

    it("should handle empty transactions array", () => {
      const result = filterTransactions([], {
        searchTerm: "test",
      })

      expect(result).toEqual([])
    })

    it("should handle case insensitive search", () => {
      const result = filterTransactions(mockTransactions, {
        searchTerm: "SALARY",
      })

      expect(result).toHaveLength(2)
      expect(result[0].description).toBe("Salary")
    })

    it("should handle partial search matches", () => {
      const result = filterTransactions(mockTransactions, {
        searchTerm: "freel",
      })

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe("Freelance")
    })

    it("should handle date range with only from date", () => {
      const result = filterTransactions(mockTransactions, {
        dateRange: {
          from: new Date("2024-01-20"),
        },
      })

      expect(result).toHaveLength(7)
      expect(result.map((t) => t._id)).toEqual([
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
      ])
    })

    it("should handle date range with only to date", () => {
      const result = filterTransactions(mockTransactions, {
        dateRange: {
          to: new Date("2024-01-20"),
        },
      })

      expect(result).toHaveLength(3)
      expect(result.map((t) => t._id)).toEqual(["1", "2", "3"])
    })

    it("should handle filterType 'all'", () => {
      const result = filterTransactions(mockTransactions, { filterType: "all" })
      expect(result).toHaveLength(mockTransactions.length)
    })

    it("should handle filterCategoryKey 'all'", () => {
      const result = filterTransactions(mockTransactions, {
        filterCategoryKey: "all",
      })
      expect(result).toHaveLength(mockTransactions.length)
    })

    it("should handle filterMonth 'all'", () => {
      const result = filterTransactions(mockTransactions, {
        filterMonth: "all",
      })
      expect(result).toHaveLength(mockTransactions.length)
    })

    it("should handle filterYear 'all'", () => {
      const result = filterTransactions(mockTransactions, {
        filterYear: "all",
      })
      expect(result).toHaveLength(mockTransactions.length)
    })

    it("should return all transactions when searchTerm is whitespace only", () => {
      const result = filterTransactions(mockTransactions, { searchTerm: "   " })
      expect(result).toHaveLength(mockTransactions.length)
    })

    it("should return empty array when searchTerm does not match any transaction", () => {
      const result = filterTransactions(mockTransactions, {
        searchTerm: "nonexistent-query",
      })
      expect(result).toEqual([])
    })

    it("should handle dateRange with undefined or null from/to", () => {
      const result = filterTransactions(mockTransactions, {
        dateRange: { from: null, to: null },
      })
      expect(result).toHaveLength(mockTransactions.length)
    })

    it("should return empty array when selectedDate does not match any transaction", () => {
      const result = filterTransactions(mockTransactions, {
        selectedDate: new Date("1990-01-01"),
      })
      expect(result).toEqual([])
    })
  })

  describe("filterCustomCategories", () => {
    it("should filter by search term", () => {
      const result = filterCustomCategories(mockCustomCategories, {
        searchTerm: "freelance",
      })

      expect(result).toHaveLength(1)
      expect(result[0].label).toBe("Freelance Work")
    })

    it("should filter by type", () => {
      const result = filterCustomCategories(mockCustomCategories, {
        filterType: "outflow",
      })

      expect(result).toHaveLength(2)
      expect(result.every((c) => c.type === "outflow")).toBe(true)
    })

    it("should combine search and type filters", () => {
      const result = filterCustomCategories(mockCustomCategories, {
        searchTerm: "restaurant",
        filterType: "outflow",
      })

      expect(result).toHaveLength(1)
      expect(result[0].label).toBe("Restaurant")
    })

    it("should return all categories when no filters applied", () => {
      const result = filterCustomCategories(mockCustomCategories, {})

      expect(result).toHaveLength(3)
    })

    it("should handle empty categories array", () => {
      const result = filterCustomCategories([], {
        searchTerm: "test",
      })

      expect(result).toEqual([])
    })

    it("should handle case insensitive search", () => {
      const result = filterCustomCategories(mockCustomCategories, {
        searchTerm: "RESTAURANT",
      })

      expect(result).toHaveLength(1)
      expect(result[0].label).toBe("Restaurant")
    })

    it("should handle partial search matches", () => {
      const result = filterCustomCategories(mockCustomCategories, {
        searchTerm: "tax",
      })

      expect(result).toHaveLength(1)
      expect(result[0].label).toBe("Taxi")
    })

    it("should return empty array when no matches found", () => {
      const result = filterCustomCategories(mockCustomCategories, {
        searchTerm: "nonexistent",
      })

      expect(result).toEqual([])
    })

    it("should handle filterType 'all'", () => {
      const result = filterCustomCategories(mockCustomCategories, {
        filterType: "all",
      })
      expect(result).toHaveLength(mockCustomCategories.length)
    })

    it("should return all categories when searchTerm is whitespace only", () => {
      const result = filterCustomCategories(mockCustomCategories, {
        searchTerm: "   ",
      })
      expect(result).toHaveLength(mockCustomCategories.length)
    })
  })

  describe("filterUsers", () => {
    it("should return all users when filters are default", () => {
      const result = filterUsers(mockUsers, {})
      expect(result).toHaveLength(4)
    })

    it("should search users by name", () => {
      const result = filterUsers(mockUsers, { searchTerm: "Test User" })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(mockUsers[0].id)
    })

    it("should search users by email", () => {
      const result = filterUsers(mockUsers, {
        searchTerm: "anotheruser@gmail.com",
      })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(mockUsers[1].id)
    })

    it("should search users by username", () => {
      const result = filterUsers(mockUsers, { searchTerm: "admin" })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(mockUsers[2].id)
    })

    it("should filter users by role", () => {
      const adminResult = filterUsers(mockUsers, { filterRole: "admin" })
      expect(adminResult).toHaveLength(1)
      expect(adminResult[0].id).toBe(mockUsers[2].id)

      const userResult = filterUsers(mockUsers, { filterRole: "user" })
      expect(userResult).toHaveLength(3)
    })

    it("should filter users by status", () => {
      const activeResult = filterUsers(mockUsers, { filterStatus: "active" })
      expect(activeResult).toHaveLength(3)

      const bannedResult = filterUsers(mockUsers, { filterStatus: "banned" })
      expect(bannedResult).toHaveLength(1)
      expect(bannedResult[0].id).toBe(mockUsers[3].id)
    })

    it("should combine search, role, and status filters", () => {
      const result = filterUsers(mockUsers, {
        searchTerm: "Admin",
        filterRole: "admin",
        filterStatus: "active",
      })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(mockUsers[2].id)
    })

    it("should return empty array when no matches found", () => {
      const result = filterUsers(mockUsers, { searchTerm: "nonexistent" })
      expect(result).toHaveLength(0)
    })

    it("should handle filterRole 'all'", () => {
      const result = filterUsers(mockUsers, { filterRole: "all" })
      expect(result).toHaveLength(mockUsers.length)
    })

    it("should handle filterStatus 'all'", () => {
      const result = filterUsers(mockUsers, { filterStatus: "all" })
      expect(result).toHaveLength(mockUsers.length)
    })

    it("should handle empty users array", () => {
      const result = filterUsers([], { searchTerm: "test" })
      expect(result).toEqual([])
    })

    it("should handle case insensitive search", () => {
      const result = filterUsers(mockUsers, { searchTerm: "ADMIN" })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(mockUsers[2].id)
    })

    it("should handle partial search matches", () => {
      const result = filterUsers(mockUsers, { searchTerm: "another" })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(mockUsers[1].id)
    })

    it("should return all users when searchTerm is whitespace only", () => {
      const result = filterUsers(mockUsers, { searchTerm: "   " })
      expect(result).toHaveLength(mockUsers.length)
    })

    it("should treat user with banned: undefined as active", () => {
      const userWithUndefinedBanned: User = {
        ...mockUsers[0],
        id: "user-undefined-banned",
        banned: undefined,
      }
      const result = filterUsers([userWithUndefinedBanned], {
        filterStatus: "active",
      })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("user-undefined-banned")

      const bannedResult = filterUsers([userWithUndefinedBanned], {
        filterStatus: "banned",
      })
      expect(bannedResult).toHaveLength(0)
    })

    it("should treat user with expired temporary ban as active", () => {
      const userWithExpiredBan: User = {
        ...mockUsers[0],
        id: "user-expired-ban",
        banned: true,
        banExpires: new Date(Date.now() - 3600 * 1000), // 1 hour ago
      }

      const activeResult = filterUsers([userWithExpiredBan], {
        filterStatus: "active",
      })
      expect(activeResult).toHaveLength(1)
      expect(activeResult[0].id).toBe("user-expired-ban")

      const bannedResult = filterUsers([userWithExpiredBan], {
        filterStatus: "banned",
      })
      expect(bannedResult).toHaveLength(0)
    })

    it("should treat user with active temporary ban as banned", () => {
      const userWithActiveBan: User = {
        ...mockUsers[0],
        id: "user-active-ban",
        banned: true,
        banExpires: new Date(Date.now() + 3600 * 1000), // 1 hour in future
      }

      const activeResult = filterUsers([userWithActiveBan], {
        filterStatus: "active",
      })
      expect(activeResult).toHaveLength(0)

      const bannedResult = filterUsers([userWithActiveBan], {
        filterStatus: "banned",
      })
      expect(bannedResult).toHaveLength(1)
      expect(bannedResult[0].id).toBe("user-active-ban")
    })

    it("should treat user as banned when provided current timestamp is before ban expiration", () => {
      const userWithBanAt1230: User = {
        ...mockUsers[0],
        id: "user-ban-1230",
        banned: true,
        banExpires: new Date("2026-06-15T12:30:00Z"),
      }

      expect(
        filterUsers([userWithBanAt1230], {
          filterStatus: "banned",
          now: new Date("2026-06-15T12:00:00Z"),
        })
      ).toHaveLength(1)
    })

    it("should exclude user from banned filter when provided current timestamp is after ban expiration", () => {
      const userWithBanAt1230: User = {
        ...mockUsers[0],
        id: "user-ban-1230",
        banned: true,
        banExpires: new Date("2026-06-15T12:30:00Z"),
      }

      expect(
        filterUsers([userWithBanAt1230], {
          filterStatus: "banned",
          now: new Date("2026-06-15T13:00:00Z"),
        })
      ).toHaveLength(0)
    })
  })

  describe("Temporal & Transaction Filter State Machine", () => {
    const jan10 = new Date(2026, 0, 10)
    const jan20 = new Date(2026, 0, 20)
    const jan25 = new Date(2026, 0, 25)

    it("should clear dateRange, filterMonth, and filterYear when selecting a single date", () => {
      const next = applyTemporalFilterChange(
        {
          selectedDate: undefined,
          dateRange: { from: jan10, to: jan20 },
          filterMonth: "1",
          filterYear: "2026",
        },
        { type: "selectDate", date: jan25 }
      )

      expect(next).toEqual({
        selectedDate: jan25,
        dateRange: { from: undefined, to: undefined },
        filterMonth: "all",
        filterYear: "all",
        completed: false,
      })
    })

    it("should preserve existing end date and clear mutually exclusive filters when selecting a start date earlier than end date", () => {
      const next = applyTemporalFilterChange(
        {
          selectedDate: jan25,
          dateRange: { from: undefined, to: jan20 },
          filterMonth: "1",
          filterYear: "2026",
        },
        { type: "selectRangeFrom", date: jan10 }
      )

      expect(next).toEqual({
        selectedDate: undefined,
        dateRange: { from: jan10, to: jan20 },
        filterMonth: "all",
        filterYear: "all",
        completed: false,
      })
    })

    it("should clear existing end date and mutually exclusive filters when selecting a new start date later than end date", () => {
      const next = applyTemporalFilterChange(
        {
          selectedDate: jan10,
          dateRange: { from: jan10, to: jan20 },
          filterMonth: "3",
          filterYear: "2026",
        },
        { type: "selectRangeFrom", date: jan25 }
      )

      expect(next).toEqual({
        selectedDate: undefined,
        dateRange: { from: jan25, to: undefined },
        filterMonth: "all",
        filterYear: "all",
        completed: false,
      })
    })

    it("should clear existing end date when start date is deselected", () => {
      const next = applyTemporalFilterChange(
        {
          selectedDate: undefined,
          dateRange: { from: jan10, to: jan20 },
          filterMonth: "all",
          filterYear: "all",
        },
        { type: "selectRangeFrom", date: undefined }
      )

      expect(next).toEqual({
        selectedDate: undefined,
        dateRange: { from: undefined, to: undefined },
        filterMonth: "all",
        filterYear: "all",
        completed: false,
      })
    })

    it("should set start date and clear mutually exclusive filters without completing range when selecting end date while start date is unset", () => {
      const next = applyTemporalFilterChange(
        {
          selectedDate: jan10,
          dateRange: { from: undefined, to: undefined },
          filterMonth: "2",
          filterYear: "2026",
        },
        { type: "selectRangeTo", date: jan20 }
      )

      expect(next).toEqual({
        selectedDate: undefined,
        dateRange: { from: jan20, to: undefined },
        filterMonth: "all",
        filterYear: "all",
        completed: false,
      })
    })

    it("should automatically swap start and end dates and clear other temporal filters when selected end date is earlier than start date", () => {
      const next = applyTemporalFilterChange(
        {
          selectedDate: jan25,
          dateRange: { from: jan20, to: undefined },
          filterMonth: "5",
          filterYear: "2026",
        },
        { type: "selectRangeTo", date: jan10 }
      )

      expect(next).toEqual({
        selectedDate: undefined,
        dateRange: { from: jan10, to: jan20 },
        filterMonth: "all",
        filterYear: "all",
        completed: true,
      })
    })

    it("should complete range and clear other temporal filters when selected end date is on or after start date", () => {
      const next = applyTemporalFilterChange(
        {
          selectedDate: jan25,
          dateRange: { from: jan10, to: undefined },
          filterMonth: "5",
          filterYear: "2026",
        },
        { type: "selectRangeTo", date: jan20 }
      )

      expect(next).toEqual({
        selectedDate: undefined,
        dateRange: { from: jan10, to: jan20 },
        filterMonth: "all",
        filterYear: "all",
        completed: true,
      })
    })

    it("should ignore undefined end date without mutating current filter state", () => {
      const initial = {
        selectedDate: jan10,
        dateRange: { from: jan10, to: undefined },
        filterMonth: "2",
        filterYear: "2026",
      }
      const next = applyTemporalFilterChange(initial, {
        type: "selectRangeTo",
        date: undefined,
      })

      expect(next).toEqual({
        ...initial,
        completed: false,
      })
    })

    it("should clear selectedDate and dateRange when selecting a specific month while preserving filterYear", () => {
      const next = applyTemporalFilterChange(
        {
          selectedDate: jan10,
          dateRange: { from: jan10, to: jan20 },
          filterMonth: "all",
          filterYear: "2026",
        },
        { type: "selectMonth", month: "4" }
      )

      expect(next).toEqual({
        selectedDate: undefined,
        dateRange: { from: undefined, to: undefined },
        filterMonth: "4",
        filterYear: "2026",
        completed: false,
      })
    })

    it("should preserve selectedDate and dateRange when setting month back to 'all'", () => {
      const next = applyTemporalFilterChange(
        {
          selectedDate: jan10,
          dateRange: { from: undefined, to: undefined },
          filterMonth: "4",
          filterYear: "2026",
        },
        { type: "selectMonth", month: "all" }
      )

      expect(next.selectedDate).toBe(jan10)
      expect(next.filterMonth).toBe("all")
      expect(next.filterYear).toBe("2026")
    })

    it("should clear selectedDate and dateRange when selecting a specific year while preserving filterMonth", () => {
      const next = applyTemporalFilterChange(
        {
          selectedDate: jan10,
          dateRange: { from: jan10, to: jan20 },
          filterMonth: "4",
          filterYear: "all",
        },
        { type: "selectYear", year: "2026" }
      )

      expect(next).toEqual({
        selectedDate: undefined,
        dateRange: { from: undefined, to: undefined },
        filterMonth: "4",
        filterYear: "2026",
        completed: false,
      })
    })

    it("should reset all temporal filters on reset action", () => {
      const next = applyTemporalFilterChange(
        {
          selectedDate: jan10,
          dateRange: { from: jan10, to: jan20 },
          filterMonth: "4",
          filterYear: "2026",
        },
        { type: "reset" }
      )

      expect(next).toEqual({
        selectedDate: undefined,
        dateRange: { from: undefined, to: undefined },
        filterMonth: "all",
        filterYear: "all",
        completed: false,
      })
    })

    it("should reset incompatible category key to 'all' when flow type changes", () => {
      const next = applyTransactionFilterChange(
        {
          searchTerm: "bonus",
          selectedDate: jan10,
          filterType: "outflow",
          filterCategoryKey: "food_beverage",
        },
        {
          type: "selectType",
          filterType: "inflow",
          allowedCategoryKeys: ["salary_bonus", "allowance"],
        }
      )

      expect(next.filterType).toBe("inflow")
      expect(next.filterCategoryKey).toBe("all")
      expect(next.searchTerm).toBe("bonus")
      expect(next.selectedDate).toBe(jan10)
    })

    it("should preserve compatible category key when flow type changes", () => {
      const next = applyTransactionFilterChange(
        {
          filterType: "inflow",
          filterCategoryKey: "salary_bonus",
        },
        {
          type: "selectType",
          filterType: "inflow",
          allowedCategoryKeys: ["salary_bonus", "allowance"],
        }
      )

      expect(next.filterCategoryKey).toBe("salary_bonus")
    })

    it("should preserve category key when flow type changes to 'all'", () => {
      const next = applyTransactionFilterChange(
        {
          filterType: "outflow",
          filterCategoryKey: "food_beverage",
        },
        {
          type: "selectType",
          filterType: "all",
        }
      )

      expect(next.filterCategoryKey).toBe("food_beverage")
    })

    it("should update category filter when selecting a category", () => {
      const next = applyTransactionFilterChange(
        {
          searchTerm: "bonus",
          filterType: "inflow",
          filterCategoryKey: "all",
        },
        {
          type: "selectCategory",
          filterCategoryKey: "salary_bonus",
        }
      )

      expect(next.filterCategoryKey).toBe("salary_bonus")
    })

    it("should update search term when changing search query", () => {
      const next = applyTransactionFilterChange(
        {
          searchTerm: "bonus",
          filterType: "inflow",
          filterCategoryKey: "salary_bonus",
        },
        {
          type: "changeSearch",
          searchTerm: "monthly",
        }
      )

      expect(next.searchTerm).toBe("monthly")
    })

    it("should reset all transaction and temporal filters on reset action", () => {
      const next = applyTransactionFilterChange(
        {
          searchTerm: "monthly",
          selectedDate: jan10,
          dateRange: { from: jan10, to: jan20 },
          filterMonth: "4",
          filterYear: "2026",
          filterType: "inflow",
          filterCategoryKey: "salary_bonus",
        },
        { type: "reset" }
      )

      expect(next).toEqual({
        searchTerm: "",
        selectedDate: undefined,
        dateRange: { from: undefined, to: undefined },
        filterMonth: "all",
        filterYear: "all",
        filterType: "all",
        filterCategoryKey: "all",
        completed: false,
      })
    })

    it("should report no active temporal filters when all fields are default", () => {
      expect(
        hasActiveTemporalFilters({
          selectedDate: undefined,
          dateRange: { from: undefined, to: undefined },
          filterMonth: "all",
          filterYear: "all",
        })
      ).toBe(false)
    })

    it("should report active temporal filters when a single date is selected", () => {
      expect(hasActiveTemporalFilters({ selectedDate: jan10 })).toBe(true)
    })

    it("should report active temporal filters when a date range start is selected", () => {
      expect(hasActiveTemporalFilters({ dateRange: { from: jan10 } })).toBe(
        true
      )
    })

    it("should report active temporal filters when a specific month is selected", () => {
      expect(hasActiveTemporalFilters({ filterMonth: "3" })).toBe(true)
    })

    it("should report active temporal filters when a specific year is selected", () => {
      expect(hasActiveTemporalFilters({ filterYear: "2026" })).toBe(true)
    })

    it("should report no active transaction filters when all fields are default", () => {
      expect(hasActiveTransactionFilters({})).toBe(false)
    })

    it("should report active transaction filters when search term is non-empty", () => {
      expect(hasActiveTransactionFilters({ searchTerm: "coffee" })).toBe(true)
    })

    it("should report active transaction filters when flow type is not 'all'", () => {
      expect(hasActiveTransactionFilters({ filterType: "outflow" })).toBe(true)
    })

    it("should report active transaction filters when category key is not 'all'", () => {
      expect(
        hasActiveTransactionFilters({ filterCategoryKey: "food_beverage" })
      ).toBe(true)
    })

    it("should build deterministic pagination reset key from active filter state", () => {
      expect(
        getTransactionFilterKey({
          searchTerm: "lunch",
          selectedDate: jan10,
          dateRange: { from: undefined, to: undefined },
          filterMonth: "all",
          filterYear: "2026",
          filterType: "outflow",
          filterCategoryKey: "food_beverage",
        })
      ).toBe("lunch_2026-01-10___all_2026_outflow_food_beverage")
    })
  })

  describe("Drill-Down URL Builder & Query Parser Round-Trip", () => {
    const parseHrefToFilterState = (href: string): TransactionFilterState => {
      const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : ""
      const params = new URLSearchParams(query)
      const dateRaw = params.get("date")
      const fromRaw = params.get("from")
      const toRaw = params.get("to")
      const typeRaw = params.get("type")
      const filterType: FlowTypeFilter =
        typeRaw === "inflow" || typeRaw === "outflow" ? typeRaw : "all"
      return {
        searchTerm: params.get("search") ?? "",
        selectedDate: dateRaw
          ? (parseAsLocalDate.parse(dateRaw) ?? undefined)
          : undefined,
        dateRange: {
          from: fromRaw
            ? (parseAsLocalDate.parse(fromRaw) ?? undefined)
            : undefined,
          to: toRaw ? (parseAsLocalDate.parse(toRaw) ?? undefined) : undefined,
        },
        filterMonth: params.get("month") ?? "all",
        filterYear: params.get("year") ?? "all",
        filterType,
        filterCategoryKey: params.get("category") ?? "all",
      }
    }

    it("should construct canonical budget drill-down URL from UTC dates and round-trip to matching transactions", () => {
      const href = buildTransactionsHref({
        dateRange: {
          from: new Date("2024-01-01T00:00:00.000Z"),
          to: new Date("2024-02-29T00:00:00.000Z"),
        },
        dateMode: "utc",
        filterType: "outflow",
        filterCategoryKey: "food_beverage",
      })

      expect(href).toBe(
        "/transactions?from=2024-01-01&to=2024-02-29&type=outflow&category=food_beverage"
      )

      const parsedFilters = parseHrefToFilterState(href)
      const matching = filterTransactions(mockTransactions, parsedFilters)

      expect(matching).toHaveLength(2)
      expect(matching.map((t) => t._id)).toEqual(["2", "6"])
    })

    it("should construct canonical goal drill-down URL with open-ended end date without throwing", () => {
      const href = buildTransactionsHref({
        dateRange: {
          from: new Date("2024-01-20T00:00:00.000Z"),
          to: undefined,
        },
        dateMode: "utc",
        filterType: "inflow",
        filterCategoryKey: "business_freelance",
      })

      expect(href).toBe(
        "/transactions?from=2024-01-20&type=inflow&category=business_freelance"
      )

      const parsedFilters = parseHrefToFilterState(href)
      const matching = filterTransactions(mockTransactions, parsedFilters)

      expect(matching).toHaveLength(1)
      expect(matching[0]._id).toBe("3")
    })

    it("should construct statistics drill-down URL with local date range and round-trip to matching transactions", () => {
      const hrefWithRange = buildTransactionsHref({
        dateRange: {
          from: new Date(2024, 0, 20),
          to: new Date(2024, 0, 25),
        },
        filterType: "outflow",
        filterCategoryKey: "transportation",
      })

      expect(hrefWithRange).toBe(
        "/transactions?from=2024-01-20&to=2024-01-25&type=outflow&category=transportation"
      )

      const matchingRange = filterTransactions(
        mockTransactions,
        parseHrefToFilterState(hrefWithRange)
      )
      expect(matchingRange.map((t) => t._id)).toEqual(["4"])
    })

    it("should construct statistics drill-down URL with month and year filters and round-trip to matching transactions", () => {
      const hrefWithMonthYear = buildTransactionsHref({
        filterMonth: "1",
        filterYear: "2024",
        filterType: "inflow",
        filterCategoryKey: "salary_bonus",
      })

      expect(hrefWithMonthYear).toBe(
        "/transactions?month=1&year=2024&type=inflow&category=salary_bonus"
      )

      const matchingMonthYear = filterTransactions(
        mockTransactions,
        parseHrefToFilterState(hrefWithMonthYear)
      )
      expect(matchingMonthYear.map((t) => t._id)).toEqual(["1"])
    })

    it("should construct statistics drill-down URL with single local date and round-trip to matching transactions", () => {
      const hrefWithSingleDate = buildTransactionsHref({
        selectedDate: new Date(2024, 0, 20),
        filterType: "inflow",
        filterCategoryKey: "business_freelance",
      })

      expect(hrefWithSingleDate).toBe(
        "/transactions?date=2024-01-20&type=inflow&category=business_freelance"
      )

      const matchingSingleDate = filterTransactions(
        mockTransactions,
        parseHrefToFilterState(hrefWithSingleDate)
      )
      expect(matchingSingleDate.map((t) => t._id)).toEqual(["3"])
    })

    it("should return bare /transactions when no active filters are provided", () => {
      expect(
        buildTransactionsHref({
          filterMonth: "all",
          filterYear: "all",
          filterType: "all",
          filterCategoryKey: "all",
        })
      ).toBe("/transactions")
    })

    it("should parse YYYY-MM-DD string into local midnight date", () => {
      expect(parseAsLocalDate.parse("2026-08-24")).toEqual(
        new Date(2026, 7, 24)
      )
    })

    it("should parse ISO timestamp string into local midnight date", () => {
      expect(parseAsLocalDate.parse("2026-08-24T15:30:00.000Z")).toEqual(
        new Date(2026, 7, 24)
      )
    })

    it("should return null when parsing malformed date string", () => {
      expect(parseAsLocalDate.parse("invalid")).toBeNull()
    })

    it("should return null when parsing impossible calendar date", () => {
      expect(parseAsLocalDate.parse("2026-02-30")).toBeNull()
    })

    it("should return null when parsing empty date string", () => {
      expect(parseAsLocalDate.parse("")).toBeNull()
    })

    it("should serialize local date to YYYY-MM-DD string", () => {
      const d1 = new Date(2026, 7, 24, 0, 0, 0)
      expect(parseAsLocalDate.serialize(d1)).toBe("2026-08-24")
    })

    it("should treat two dates on the same local calendar day as equal", () => {
      const d1 = new Date(2026, 7, 24, 0, 0, 0)
      const d2 = new Date(2026, 7, 24, 18, 0, 0)
      expect(parseAsLocalDate.eq(d1, d2)).toBe(true)
    })

    it("should treat two dates on different local calendar days as unequal", () => {
      const d1 = new Date(2026, 7, 24, 0, 0, 0)
      const d3 = new Date(2026, 7, 25, 0, 0, 0)
      expect(parseAsLocalDate.eq(d1, d3)).toBe(false)
    })
  })

  describe("Pure Transaction CSV Export & Formula Sanitization", () => {
    const csvOptions = {
      labels: {
        headers: {
          date: "Date",
          type: "Type",
          category: "Category",
          amount: "Amount",
          currency: "Currency",
          originalAmount: "Original Amount",
          originalCurrency: "Original Currency",
          description: "Description",
        },
        inflow: "Inflow",
        outflow: "Outflow",
        from: "From",
        to: "To",
        filenamePrefix: "Transactions",
      },
      formatDate: (d: Date) => d.toISOString().slice(0, 10),
      getCategoryLabel: (key: string) => `Label:${key}`,
    }

    it("should neutralize all formula trigger characters (=, +, -, @, tab, CR) and escape double quotes in exported CSV rows", () => {
      const formulaCases = [
        "=SUM(A1:A10)",
        "+12345",
        "-100",
        "@SUM",
        "\tCMD",
        "\rCMD",
        'Dinner "with" friends',
      ]

      const transactions = formulaCases.map((description, idx) => ({
        ...mockTransactions[0],
        _id: `csv-${idx}`,
        date: new Date("2026-03-15T00:00:00.000Z"),
        description,
      }))

      const result = buildTransactionsCSVExport(transactions, csvOptions)
      const lines = result.csvContent.split("\n")

      expect(lines[1]).toContain('"\'=SUM(A1:A10)"')
      expect(lines[2]).toContain('"\'+12345"')
      expect(lines[3]).toContain('"\'-100"')
      expect(lines[4]).toContain('"\'@SUM"')
      expect(lines[5]).toContain('"\'\tCMD"')
      expect(lines[6]).toContain('"\'\rCMD"')
      expect(lines[7]).toContain('"Dinner ""with"" friends"')
    })

    it("should build CSV content and single-date filename when exporting 1 transaction", () => {
      const single = [
        {
          ...mockTransactions[0],
          date: new Date("2026-03-15T00:00:00.000Z"),
          description: '=HYPERLINK("http://evil.com")',
          originalAmount: "40",
          originalCurrency: "USD" as const,
        },
      ]

      const result = buildTransactionsCSVExport(single, csvOptions)

      expect(result.filename).toBe("transactions_2026-03-15.csv")
      const lines = result.csvContent.split("\n")
      expect(lines).toHaveLength(2)
      expect(lines[0]).toBe(
        '"Date","Type","Category","Amount","Currency","Original Amount","Original Currency","Description"'
      )
      expect(lines[1]).toBe(
        '"2026-03-15","Inflow","Label:salary_bonus","1000","VND","40","USD","\'=HYPERLINK(""http://evil.com"")"'
      )
    })

    it("should build CSV content with fallback originalAmount/originalCurrency and min-max date span filename for multiple transactions", () => {
      const multiple = [
        {
          ...mockTransactions[1],
          date: new Date("2026-05-20T00:00:00.000Z"),
          originalAmount: undefined,
          originalCurrency: undefined,
        },
        {
          ...mockTransactions[0],
          date: new Date("2026-01-05T00:00:00.000Z"),
          originalAmount: undefined,
          originalCurrency: undefined,
        },
      ]

      const result = buildTransactionsCSVExport(multiple, {
        ...csvOptions,
        formatDate: (d: Date | string) => {
          const date = typeof d === "string" ? new Date(d) : d
          // Include slashes and spaces to verify filename sanitization
          return `Mon, ${date.toISOString().slice(0, 10).replace(/-/g, "/")}`
        },
      })

      expect(result.filename).toBe(
        "transactions_from_mon,_2026_01_05_to_mon,_2026_05_20.csv"
      )
      const lines = result.csvContent.split("\n")
      expect(lines).toHaveLength(3)
      expect(lines[1]).toBe(
        '"Mon, 2026/05/20","Outflow","Label:food_beverage","200","VND","200","VND","Groceries"'
      )
      expect(lines[2]).toBe(
        '"Mon, 2026/01/05","Inflow","Label:salary_bonus","1000","VND","1000","VND","Salary"'
      )
    })
  })
})
