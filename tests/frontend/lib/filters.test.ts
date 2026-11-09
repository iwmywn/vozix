import {
  mockCustomCategories,
  mockTransactions,
  mockUsers,
} from "@/tests/shared/data"
import { isDateRangeOverlapping } from "@/lib/date"
import type { User } from "@/lib/definitions"
import {
  filterCustomCategories,
  filterTransactions,
  filterUsers,
} from "@/lib/filters"

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
  })
})
