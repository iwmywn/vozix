/**
 * Unified Transaction Query, Temporal Filter State, Drill-Down URL & CSV Export Module.
 *
 * Consolidates domain filter contracts, temporal and transaction filter state transitions,
 * local calendar URL query parsing, canonical `/transactions` drill-down link construction,
 * and pure transaction CSV export formatting behind a single deep in-process interface.
 */
import type { Route } from "next"
import { createParser } from "nuqs"

import type { CategoryType } from "@/lib/category"
import {
  localDateToUTCMidnight,
  parseDateParts,
  serializeLocalDate,
  serializeUTCDate,
} from "@/lib/date"
import type { Category, Transaction, User } from "@/lib/definitions"
import { isUserBanned, searchWithMiniSearch } from "@/lib/utils"

export type FlowTypeFilter = CategoryType | "all"

export type DateRangeFilter = {
  from?: Date | null
  to?: Date | null
}

export type TemporalFilterState = {
  selectedDate?: Date | null
  dateRange?: DateRangeFilter
  filterMonth?: string
  filterYear?: string
}

export type TransactionFilterState = TemporalFilterState & {
  searchTerm?: string
  filterType?: FlowTypeFilter
  filterCategoryKey?: string
}

export type CategoryFilterState = {
  searchTerm?: string
  filterType?: FlowTypeFilter
}

export type UserFilterState = {
  searchTerm?: string
  filterRole?: string
  filterStatus?: string
  now?: Date
}

export type TemporalFilterTransition = {
  selectedDate: Date | undefined
  dateRange: {
    from: Date | undefined
    to: Date | undefined
  }
  filterMonth: string
  filterYear: string
  completed: boolean
}

export type TemporalFilterAction =
  | { type: "selectDate"; date: Date | null | undefined }
  | { type: "selectRangeFrom"; date: Date | null | undefined }
  | { type: "selectRangeTo"; date: Date | null | undefined }
  | { type: "selectMonth"; month: string }
  | { type: "selectYear"; year: string }
  | { type: "reset" }

export type TransactionFilterTransition = TemporalFilterTransition & {
  searchTerm: string
  filterType: FlowTypeFilter
  filterCategoryKey: string
}

export type TransactionFilterAction =
  | TemporalFilterAction
  | { type: "changeSearch"; searchTerm: string }
  | {
      type: "selectType"
      filterType: FlowTypeFilter
      allowedCategoryKeys?: Iterable<string>
    }
  | { type: "selectCategory"; filterCategoryKey: string }

export const parseAsLocalDate = createParser({
  parse: (queryValue: string) => {
    const parts = parseDateParts(queryValue)
    if (!parts) return null
    const date = new Date(parts.year, parts.month - 1, parts.day)
    return isNaN(date.getTime()) ? null : date
  },
  serialize: serializeLocalDate,
  eq: (a: Date, b: Date) => serializeLocalDate(a) === serializeLocalDate(b),
})

type NormalizedTemporalFilterState = Omit<TemporalFilterTransition, "completed">

function normalizeTemporalState(
  current: TemporalFilterState
): NormalizedTemporalFilterState {
  return {
    selectedDate: current.selectedDate ?? undefined,
    dateRange: {
      from: current.dateRange?.from ?? undefined,
      to: current.dateRange?.to ?? undefined,
    },
    filterMonth: current.filterMonth ?? "all",
    filterYear: current.filterYear ?? "all",
  }
}

function applyPeriodSelectorChange(
  base: NormalizedTemporalFilterState,
  filterMonth: string,
  filterYear: string,
  isSpecificSelection: boolean
): TemporalFilterTransition {
  return {
    selectedDate: isSpecificSelection ? undefined : base.selectedDate,
    dateRange: isSpecificSelection
      ? { from: undefined, to: undefined }
      : base.dateRange,
    filterMonth,
    filterYear,
    completed: false,
  }
}

export function applyTemporalFilterChange(
  current: TemporalFilterState,
  action: TemporalFilterAction
): TemporalFilterTransition {
  const base = normalizeTemporalState(current)

  switch (action.type) {
    case "selectDate":
      return {
        selectedDate: action.date ?? undefined,
        dateRange: { from: undefined, to: undefined },
        filterMonth: "all",
        filterYear: "all",
        completed: false,
      }

    case "selectRangeFrom": {
      const nextFrom = action.date ?? undefined
      const currentTo = base.dateRange.to
      const nextTo =
        !nextFrom || (currentTo && nextFrom > currentTo) ? undefined : currentTo
      const hasRangeEndpoint = Boolean(nextFrom || nextTo)
      return {
        selectedDate: hasRangeEndpoint ? undefined : base.selectedDate,
        dateRange: { from: nextFrom, to: nextTo },
        filterMonth: hasRangeEndpoint ? "all" : base.filterMonth,
        filterYear: hasRangeEndpoint ? "all" : base.filterYear,
        completed: false,
      }
    }

    case "selectRangeTo": {
      const nextTo = action.date ?? undefined
      const currentFrom = base.dateRange.from
      if (!nextTo) {
        return {
          ...base,
          completed: false,
        }
      }
      if (!currentFrom) {
        return {
          selectedDate: undefined,
          dateRange: { from: nextTo, to: undefined },
          filterMonth: "all",
          filterYear: "all",
          completed: false,
        }
      }
      const [from, to] =
        nextTo < currentFrom ? [nextTo, currentFrom] : [currentFrom, nextTo]
      return {
        selectedDate: undefined,
        dateRange: { from, to },
        filterMonth: "all",
        filterYear: "all",
        completed: true,
      }
    }

    case "selectMonth": {
      const nextMonth = action.month || "all"
      return applyPeriodSelectorChange(
        base,
        nextMonth,
        base.filterYear,
        nextMonth !== "all"
      )
    }

    case "selectYear": {
      const nextYear = action.year || "all"
      return applyPeriodSelectorChange(
        base,
        base.filterMonth,
        nextYear,
        nextYear !== "all"
      )
    }

    case "reset":
      return {
        selectedDate: undefined,
        dateRange: { from: undefined, to: undefined },
        filterMonth: "all",
        filterYear: "all",
        completed: false,
      }
  }
}

function resolveCategoryFilterForType(
  filterType: FlowTypeFilter,
  filterCategoryKey: string,
  allowedCategoryKeys: Iterable<string>
): string {
  if (filterType === "all" || filterCategoryKey === "all") {
    return filterCategoryKey
  }
  const allowedSet = new Set(allowedCategoryKeys)
  return allowedSet.has(filterCategoryKey) ? filterCategoryKey : "all"
}

export function applyTransactionFilterChange(
  current: TransactionFilterState,
  action: TransactionFilterAction
): TransactionFilterTransition {
  const baseTemporal = normalizeTemporalState(current)
  const currentSearch = current.searchTerm ?? ""
  const currentType: FlowTypeFilter = current.filterType ?? "all"
  const currentCategory = current.filterCategoryKey ?? "all"

  switch (action.type) {
    case "changeSearch":
      return {
        ...baseTemporal,
        searchTerm: action.searchTerm,
        filterType: currentType,
        filterCategoryKey: currentCategory,
        completed: false,
      }

    case "selectType": {
      const nextCategory = resolveCategoryFilterForType(
        action.filterType,
        currentCategory,
        action.allowedCategoryKeys ?? []
      )
      return {
        ...baseTemporal,
        searchTerm: currentSearch,
        filterType: action.filterType,
        filterCategoryKey: nextCategory,
        completed: false,
      }
    }

    case "selectCategory":
      return {
        ...baseTemporal,
        searchTerm: currentSearch,
        filterType: currentType,
        filterCategoryKey: action.filterCategoryKey || "all",
        completed: false,
      }

    case "reset":
      return {
        ...applyTemporalFilterChange(current, action),
        searchTerm: "",
        filterType: "all",
        filterCategoryKey: "all",
      }

    default:
      return {
        ...applyTemporalFilterChange(current, action),
        searchTerm: currentSearch,
        filterType: currentType,
        filterCategoryKey: currentCategory,
      }
  }
}

export function hasActiveTemporalFilters(state: TemporalFilterState): boolean {
  return Boolean(
    state.selectedDate ||
    state.dateRange?.from ||
    state.dateRange?.to ||
    (state.filterMonth && state.filterMonth !== "all") ||
    (state.filterYear && state.filterYear !== "all")
  )
}

export function hasActiveTransactionFilters(
  state: TransactionFilterState
): boolean {
  return Boolean(
    (state.searchTerm && state.searchTerm !== "") ||
    hasActiveTemporalFilters(state) ||
    (state.filterType && state.filterType !== "all") ||
    (state.filterCategoryKey && state.filterCategoryKey !== "all")
  )
}

export function getTransactionFilterKey(state: TransactionFilterState): string {
  const search = state.searchTerm ?? ""
  const selectedDate = state.selectedDate
    ? serializeLocalDate(state.selectedDate)
    : ""
  const fromDate = state.dateRange?.from
    ? serializeLocalDate(state.dateRange.from)
    : ""
  const toDate = state.dateRange?.to
    ? serializeLocalDate(state.dateRange.to)
    : ""
  const month = state.filterMonth ?? "all"
  const year = state.filterYear ?? "all"
  const type = state.filterType ?? "all"
  const category = state.filterCategoryKey ?? "all"

  return `${search}_${selectedDate}_${fromDate}_${toDate}_${month}_${year}_${type}_${category}`
}

export type TransactionsHrefInput = Omit<
  TransactionFilterState,
  "selectedDate" | "dateRange"
> & {
  selectedDate?: Date | string | null
  dateRange?: {
    from?: Date | string | null
    to?: Date | string | null
  }
  dateMode?: "local" | "utc"
}

function serializeFilterEndpoint(
  date: Date | string,
  dateMode: "local" | "utc"
): string {
  if (dateMode === "utc" || typeof date === "string") {
    return serializeUTCDate(date)
  }
  return serializeLocalDate(date)
}

export function buildTransactionsHref(input: TransactionsHrefInput): Route {
  const params = new URLSearchParams()
  const dateMode = input.dateMode ?? "local"

  if (input.searchTerm && input.searchTerm !== "") {
    params.set("search", input.searchTerm)
  }

  if (input.selectedDate) {
    params.set("date", serializeFilterEndpoint(input.selectedDate, dateMode))
  }

  if (input.dateRange?.from) {
    params.set("from", serializeFilterEndpoint(input.dateRange.from, dateMode))
  }
  if (input.dateRange?.to) {
    params.set("to", serializeFilterEndpoint(input.dateRange.to, dateMode))
  }

  if (input.filterMonth && input.filterMonth !== "all") {
    params.set("month", input.filterMonth)
  }

  if (input.filterYear && input.filterYear !== "all") {
    params.set("year", input.filterYear)
  }

  if (input.filterType && input.filterType !== "all") {
    params.set("type", input.filterType)
  }

  if (input.filterCategoryKey && input.filterCategoryKey !== "all") {
    params.set("category", input.filterCategoryKey)
  }

  const query = params.toString()
  return (query ? `/transactions?${query}` : "/transactions") as Route
}

export function filterTransactions(
  transactions: Transaction[],
  filters: TransactionFilterState
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
  filters: CategoryFilterState
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

export function filterUsers(users: User[], filters: UserFilterState): User[] {
  const {
    searchTerm = "",
    filterRole = "all",
    filterStatus = "all",
    now = new Date(),
  } = filters

  const matchingIds = searchTerm
    ? searchWithMiniSearch(
        users,
        searchTerm,
        ["name", "email", "username"],
        "id"
      )
    : null

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

function sanitizeCSVField(value: string | number | null | undefined): string {
  let sanitized = String(value ?? "")
  if (/^[=+\-@\t\r]/.test(sanitized)) {
    sanitized = `'${sanitized}`
  }
  return `"${sanitized.replace(/"/g, '""')}"`
}

export type TransactionsCSVLabels = {
  headers: {
    date: string
    type: string
    category: string
    amount: string
    currency: string
    originalAmount: string
    originalCurrency: string
    description: string
  }
  inflow: string
  outflow: string
  from: string
  to: string
  filenamePrefix: string
}

export type TransactionsCSVExportOptions = {
  labels: TransactionsCSVLabels
  formatDate: (date: Date) => string
  getCategoryLabel: (categoryKey: string) => string
}

export type TransactionsCSVExportResult = {
  csvContent: string
  filename: string
}

export function buildTransactionsCSVExport(
  filteredTransactions: Transaction[],
  options: TransactionsCSVExportOptions
): TransactionsCSVExportResult {
  const { labels, formatDate, getCategoryLabel } = options
  const toDate = (value: Date | string) =>
    value instanceof Date ? value : new Date(value)

  const headers = [
    sanitizeCSVField(labels.headers.date),
    sanitizeCSVField(labels.headers.type),
    sanitizeCSVField(labels.headers.category),
    sanitizeCSVField(labels.headers.amount),
    sanitizeCSVField(labels.headers.currency),
    sanitizeCSVField(labels.headers.originalAmount),
    sanitizeCSVField(labels.headers.originalCurrency),
    sanitizeCSVField(labels.headers.description),
  ]

  const rows = filteredTransactions.map((ft) => [
    sanitizeCSVField(formatDate(toDate(ft.date))),
    sanitizeCSVField(ft.type === "inflow" ? labels.inflow : labels.outflow),
    sanitizeCSVField(getCategoryLabel(ft.categoryKey)),
    sanitizeCSVField(ft.amount.toString()),
    sanitizeCSVField(ft.currency),
    sanitizeCSVField((ft.originalAmount ?? ft.amount).toString()),
    sanitizeCSVField(ft.originalCurrency ?? ft.currency),
    sanitizeCSVField(ft.description),
  ])

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n")

  let dateStr = ""
  if (filteredTransactions.length === 1) {
    dateStr = formatDate(toDate(filteredTransactions[0].date))
  } else if (filteredTransactions.length > 1) {
    let minTime = Infinity
    let maxTime = -Infinity
    for (const tx of filteredTransactions) {
      const time = toDate(tx.date).getTime()
      if (time < minTime) minTime = time
      if (time > maxTime) maxTime = time
    }
    const fromDateStr = formatDate(new Date(minTime))
    const toDateStr = formatDate(new Date(maxTime))
    dateStr = `${labels.from}_${fromDateStr}_${labels.to}_${toDateStr}`
  }

  const filename = `${labels.filenamePrefix}_${dateStr}.csv`
    .replace(/[/\\?%*:|"<> ]+/g, "_")
    .toLowerCase()

  return { csvContent, filename }
}
