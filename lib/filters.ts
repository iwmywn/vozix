import { localDateToUTCMidnight } from "@/lib/date"
import type { Category, Transaction, User } from "@/lib/definitions"
import { isUserBanned, searchWithMiniSearch } from "@/lib/utils"

type Filters = {
  searchTerm?: string
  selectedDate?: Date | null
  dateRange?: {
    from?: Date | null
    to?: Date | null
  }
  filterMonth?: string
  filterYear?: string
  filterType?: string
  filterCategoryKey?: string
  filterStatus?: string
  filterRole?: string
}

export function filterTransactions(
  transactions: Transaction[],
  filters: Filters
): Transaction[] {
  const {
    searchTerm = "",
    selectedDate,
    dateRange = {},
    filterMonth = "all",
    filterYear = "all",
    filterType = "all",
    filterCategoryKey = "all",
  } = filters

  const parsedMonth = filterMonth === "all" ? null : parseInt(filterMonth)
  const parsedYear = filterYear === "all" ? null : parseInt(filterYear)

  const matchingIds = searchTerm
    ? searchWithMiniSearch(transactions, searchTerm, ["description"])
    : null

  const selectedDateUTC = selectedDate
    ? localDateToUTCMidnight(selectedDate)
    : null
  const fromUTC = dateRange.from ? localDateToUTCMidnight(dateRange.from) : null
  const toUTC = dateRange.to ? localDateToUTCMidnight(dateRange.to) : null

  return transactions.filter((transaction) => {
    const matchesSearch = matchingIds ? matchingIds.has(transaction._id) : true

    const transactionDateOnly = new Date(transaction.date)

    const matchesSelectedDate = selectedDateUTC
      ? transactionDateOnly.getTime() === selectedDateUTC.getTime()
      : true

    const matchesDateRange =
      (!fromUTC || transactionDateOnly.getTime() >= fromUTC.getTime()) &&
      (!toUTC || transactionDateOnly.getTime() <= toUTC.getTime())

    const matchesMonth =
      !parsedMonth || transactionDateOnly.getUTCMonth() + 1 === parsedMonth

    const matchesYear =
      !parsedYear || transactionDateOnly.getUTCFullYear() === parsedYear

    const matchesType = filterType === "all" || transaction.type === filterType

    const matchesCategory =
      filterCategoryKey === "all" ||
      transaction.categoryKey === filterCategoryKey

    return (
      matchesSearch &&
      matchesSelectedDate &&
      matchesDateRange &&
      matchesMonth &&
      matchesYear &&
      matchesType &&
      matchesCategory
    )
  })
}

export function filterCustomCategories(
  categories: Category[],
  filters: Filters
): Category[] {
  const { searchTerm = "", filterType = "all" } = filters

  const matchingIds = searchTerm
    ? searchWithMiniSearch(categories, searchTerm, ["label"])
    : null

  return categories.filter((category) => {
    const matchesType = filterType === "all" || category.type === filterType

    const matchesSearch = matchingIds ? matchingIds.has(category._id) : true

    return matchesType && matchesSearch
  })
}

export function filterUsers(users: User[], filters: Filters): User[] {
  const { searchTerm = "", filterRole = "all", filterStatus = "all" } = filters

  const matchingIds = searchTerm
    ? searchWithMiniSearch(
        users,
        searchTerm,
        ["name", "email", "username"],
        "id"
      )
    : null

  const now = new Date()

  return users.filter((user) => {
    const matchesSearch = matchingIds ? matchingIds.has(user.id) : true

    const matchesRole = filterRole === "all" || user.role === filterRole

    const banned = isUserBanned(user, now)

    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "active" && !banned) ||
      (filterStatus === "banned" && banned)

    return matchesSearch && matchesRole && matchesStatus
  })
}
