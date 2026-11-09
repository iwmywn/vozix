import Decimal from "decimal.js"

import type { CategoryKey } from "@/lib/category"
import { resolveTransactionAmount } from "@/lib/currency"
import type { Currency } from "@/lib/currency"
import {
  getTodayInTimezone,
  isDateRangeOverlapping,
  normalizeToUTCMidnight,
} from "@/lib/date"
import type {
  Budget,
  Goal,
  ScheduleStatus,
  Transaction,
} from "@/lib/definitions"
import { resolveScheduleBoundaries } from "@/lib/recurring"
import { searchWithMiniSearch } from "@/lib/utils"

export type RollupHealth = "unstarted" | "on_track" | "warning" | "exceeded"

export interface ValuationOptions {
  timeZone?: string
  asOfDate?: Date
  targetCurrency?: Currency
}

export interface BudgetValuation {
  budget: Budget
  allocated: Decimal
  spent: Decimal
  remaining: Decimal
  percentage: number
  status: ScheduleStatus
  health: RollupHealth
  unconvertedCount: number
  matchingTransactions: Transaction[]
}

export interface GoalValuation {
  goal: Goal
  target: Decimal
  accumulated: Decimal
  remaining: Decimal
  percentage: number
  status: ScheduleStatus
  health: RollupHealth
  unconvertedCount: number
  matchingTransactions: Transaction[]
}

export interface PeriodSummaryValuation {
  totalInflow: Decimal
  totalOutflow: Decimal
  balance: Decimal
  transactionCount: number
  inflowCount: number
  outflowCount: number
  unconvertedCount: number
}

export interface CategoryRollupValuation {
  categoryKey: CategoryKey
  count: number
  total: Decimal
  type: "inflow" | "outflow"
}

export interface QuickStatsValuation {
  currentMonthCount: number
  unconvertedCount: number
  highestTransaction: Transaction | null
  lowestTransaction: Transaction | null
  avgOutflow: Decimal | null
  savingsRate: Decimal | null
  popularCategory: CategoryKey[]
}

export interface ScheduleFilterCriteria {
  filterMonth?: string
  filterYear?: string
  filterCategoryKey?: "all" | CategoryKey
  filterHealth?: "all" | RollupHealth
  filterStatus?: "all" | ScheduleStatus
}

export type BudgetFilterCriteria = ScheduleFilterCriteria

export interface GoalFilterCriteria extends ScheduleFilterCriteria {
  searchTerm?: string
}

interface FinancialSchedule {
  _id: string
  categoryKey: CategoryKey
  startDate: Date | string
  endDate: Date | string
  currency: Currency
}

interface ValuationMatchable {
  status: ScheduleStatus
  health: RollupHealth
}

function parseScheduleFilters(filters?: ScheduleFilterCriteria) {
  return {
    parsedMonth:
      !filters?.filterMonth || filters.filterMonth === "all"
        ? null
        : parseInt(filters.filterMonth, 10),
    parsedYear:
      !filters?.filterYear || filters.filterYear === "all"
        ? null
        : parseInt(filters.filterYear, 10),
    expectedCategory:
      !filters?.filterCategoryKey || filters.filterCategoryKey === "all"
        ? null
        : filters.filterCategoryKey,
    expectedStatus:
      !filters?.filterStatus || filters.filterStatus === "all"
        ? null
        : filters.filterStatus,
    expectedHealth:
      filters?.filterHealth && filters.filterHealth !== "all"
        ? filters.filterHealth
        : null,
  }
}

function matchesScheduleCriteria(
  schedule: FinancialSchedule,
  criteria: ReturnType<typeof parseScheduleFilters>
): boolean {
  if (
    criteria.expectedCategory &&
    schedule.categoryKey !== criteria.expectedCategory
  ) {
    return false
  }

  if (criteria.parsedMonth !== null || criteria.parsedYear !== null) {
    const start = new Date(schedule.startDate)
    const end = new Date(schedule.endDate)
    if (
      !isDateRangeOverlapping(
        start,
        end,
        criteria.parsedMonth,
        criteria.parsedYear
      )
    ) {
      return false
    }
  }

  return true
}

function matchesScheduleValuation(
  valuation: ValuationMatchable,
  criteria: ReturnType<typeof parseScheduleFilters>
): boolean {
  if (criteria.expectedStatus && valuation.status !== criteria.expectedStatus) {
    return false
  }

  if (criteria.expectedHealth && valuation.health !== criteria.expectedHealth) {
    return false
  }

  return true
}

/**
 * Deep financial valuation and rollup engine.
 * Encapsulates date-windowing, multi-currency valuation, schedule tracking,
 * pure domain health states, and single-pass filtering with explicit timezone parity.
 */
export class FinancialRollupEngine {
  private readonly todayUTC: Date
  private readonly targetCurrency?: Currency

  constructor(
    private readonly transactions: Transaction[],
    options: ValuationOptions
  ) {
    this.todayUTC = options.asOfDate
      ? normalizeToUTCMidnight(options.asOfDate)
      : getTodayInTimezone(options.timeZone)
    this.targetCurrency = options.targetCurrency
  }

  private evaluateScheduleRollup(
    schedule: FinancialSchedule,
    expectedType: "inflow" | "outflow",
    scheduledAmountInput: string
  ) {
    const { startDateOnly, endDateOnly, status } = resolveScheduleBoundaries(
      schedule.startDate,
      schedule.endDate,
      this.todayUTC
    )
    const scheduleCurrency = schedule.currency

    let total = new Decimal(0)
    let unconvertedCount = 0
    const matchingTransactions: Transaction[] = []

    for (const t of this.transactions) {
      if (t.type !== expectedType || t.categoryKey !== schedule.categoryKey) {
        continue
      }

      const txDateOnly = normalizeToUTCMidnight(new Date(t.date))
      if (
        txDateOnly.getTime() < startDateOnly.getTime() ||
        (endDateOnly && txDateOnly.getTime() > endDateOnly.getTime())
      ) {
        continue
      }

      matchingTransactions.push(t)
      const amount = resolveTransactionAmount(t, scheduleCurrency)
      if (amount !== null) {
        total = total.plus(amount)
      } else {
        unconvertedCount++
      }
    }

    const scheduledAmount = new Decimal(scheduledAmountInput)
    const remaining = scheduledAmount.minus(total)
    const percentage = scheduledAmount.equals(0)
      ? 0
      : total.dividedBy(scheduledAmount).mul(100).toNumber()

    const convertedCount = matchingTransactions.length - unconvertedCount

    return {
      scheduledAmount,
      total,
      remaining,
      percentage,
      status,
      unconvertedCount,
      convertedCount,
      matchingTransactions,
    }
  }

  private evaluateSchedules<
    TSchedule extends FinancialSchedule,
    TValuation extends ValuationMatchable,
  >(
    schedules: TSchedule[],
    evaluate: (schedule: TSchedule) => TValuation,
    filters?: ScheduleFilterCriteria,
    matchingIds?: Set<string> | null
  ): TValuation[] {
    const criteria = parseScheduleFilters(filters)
    const results: TValuation[] = []

    for (const schedule of schedules) {
      if (matchingIds && !matchingIds.has(schedule._id)) {
        continue
      }

      if (!matchesScheduleCriteria(schedule, criteria)) {
        continue
      }

      const valuation = evaluate(schedule)

      if (!matchesScheduleValuation(valuation, criteria)) {
        continue
      }

      results.push(valuation)
    }

    return results
  }

  /**
   * Evaluates a single budget against realized outflow transactions.
   */
  evaluateBudget(budget: Budget): BudgetValuation {
    const {
      scheduledAmount: allocated,
      total: spent,
      remaining,
      percentage,
      status,
      unconvertedCount,
      convertedCount,
      matchingTransactions,
    } = this.evaluateScheduleRollup(budget, "outflow", budget.allocatedAmount)

    let health: RollupHealth
    if (convertedCount === 0) {
      health = "unstarted"
    } else if (percentage < 75) {
      health = "on_track"
    } else if (percentage < 100) {
      health = "warning"
    } else {
      health = "exceeded"
    }

    return {
      budget,
      allocated,
      spent,
      remaining,
      percentage,
      status,
      health,
      unconvertedCount,
      matchingTransactions,
    }
  }

  /**
   * Evaluates multiple budgets in a single pass with optional filtering criteria.
   */
  evaluateBudgets(
    budgets: Budget[],
    filters?: BudgetFilterCriteria
  ): BudgetValuation[] {
    return this.evaluateSchedules(
      budgets,
      (budget) => this.evaluateBudget(budget),
      filters
    )
  }

  /**
   * Evaluates a single savings goal against realized inflow transactions.
   */
  evaluateGoal(goal: Goal): GoalValuation {
    const {
      scheduledAmount: target,
      total: accumulated,
      remaining,
      percentage,
      status,
      unconvertedCount,
      convertedCount,
      matchingTransactions,
    } = this.evaluateScheduleRollup(goal, "inflow", goal.targetAmount)

    let health: RollupHealth
    if (convertedCount === 0) {
      health = "unstarted"
    } else if (percentage >= 100) {
      health = "on_track"
    } else if (percentage >= 75) {
      health = "warning"
    } else {
      health = "exceeded"
    }

    return {
      goal,
      target,
      accumulated,
      remaining,
      percentage,
      status,
      health,
      unconvertedCount,
      matchingTransactions,
    }
  }

  /**
   * Evaluates multiple goals in a single pass with optional filtering criteria.
   */
  evaluateGoals(goals: Goal[], filters?: GoalFilterCriteria): GoalValuation[] {
    const matchingGoalIds = filters?.searchTerm
      ? searchWithMiniSearch(goals, filters.searchTerm, ["name"])
      : null

    return this.evaluateSchedules(
      goals,
      (goal) => this.evaluateGoal(goal),
      filters,
      matchingGoalIds
    )
  }

  private resolveTransactions(transactions: Transaction[]): {
    resolved: { transaction: Transaction; amount: Decimal }[]
    unconvertedCount: number
  } {
    const resolved: { transaction: Transaction; amount: Decimal }[] = []
    let unconvertedCount = 0

    for (const transaction of transactions) {
      const amount = resolveTransactionAmount(transaction, this.targetCurrency)
      if (amount !== null) {
        resolved.push({ transaction, amount })
      } else {
        unconvertedCount++
      }
    }

    return { resolved, unconvertedCount }
  }

  private getCurrentMonthTransactions(): Transaction[] {
    const currentMonth = this.todayUTC.getUTCMonth()
    const currentYear = this.todayUTC.getUTCFullYear()

    return this.transactions.filter((t) => {
      const date = new Date(t.date)
      return (
        date.getUTCMonth() === currentMonth &&
        date.getUTCFullYear() === currentYear
      )
    })
  }

  private computePeriodSummary(resolvedTransactions: {
    resolved: { transaction: Transaction; amount: Decimal }[]
    unconvertedCount: number
  }): PeriodSummaryValuation {
    const { resolved, unconvertedCount } = resolvedTransactions
    let totalInflow = new Decimal(0)
    let totalOutflow = new Decimal(0)
    let inflowCount = 0
    let outflowCount = 0

    for (const { transaction, amount } of resolved) {
      if (transaction.type === "inflow") {
        totalInflow = totalInflow.plus(amount)
        inflowCount++
      } else if (transaction.type === "outflow") {
        totalOutflow = totalOutflow.plus(amount)
        outflowCount++
      }
    }

    return {
      totalInflow,
      totalOutflow,
      balance: totalInflow.minus(totalOutflow),
      transactionCount: resolved.length,
      inflowCount,
      outflowCount,
      unconvertedCount,
    }
  }

  /**
   * Evaluates period summary statistics (total inflow, outflow, balance, counts).
   */
  evaluatePeriodSummary(): PeriodSummaryValuation {
    return this.computePeriodSummary(
      this.resolveTransactions(this.transactions)
    )
  }

  /**
   * Evaluates summary statistics for transactions occurring in the current month.
   */
  evaluateCurrentMonthSummary(): PeriodSummaryValuation {
    return this.computePeriodSummary(
      this.resolveTransactions(this.getCurrentMonthTransactions())
    )
  }

  /**
   * Evaluates category-level rollup totals.
   */
  evaluateCategoryRollups(): CategoryRollupValuation[] {
    const { resolved } = this.resolveTransactions(this.transactions)
    const categoryMap = new Map<
      CategoryKey,
      { total: Decimal; count: number; type: "inflow" | "outflow" }
    >()

    for (const { transaction, amount } of resolved) {
      const existing = categoryMap.get(transaction.categoryKey)
      if (existing) {
        existing.total = existing.total.plus(amount)
        existing.count++
      } else {
        categoryMap.set(transaction.categoryKey, {
          total: amount,
          count: 1,
          type: transaction.type,
        })
      }
    }

    const results: CategoryRollupValuation[] = []
    for (const [categoryKey, data] of categoryMap.entries()) {
      results.push({
        categoryKey,
        count: data.count,
        total: data.total,
        type: data.type,
      })
    }

    return results.sort((a, b) => {
      if (b.total.greaterThan(a.total)) return 1
      if (b.total.lessThan(a.total)) return -1
      return 0
    })
  }

  /**
   * Evaluates month-to-date quick stats (highest, lowest, avg outflow, savings rate, popular categories).
   */
  evaluateQuickStats(): QuickStatsValuation {
    const monthTransactions = this.getCurrentMonthTransactions()
    const resolvedMonth = this.resolveTransactions(monthTransactions)
    const { resolved: currentMonthItems, unconvertedCount } = resolvedMonth

    const currentMonthCount = currentMonthItems.length
    if (currentMonthCount === 0) {
      return {
        currentMonthCount: 0,
        unconvertedCount,
        highestTransaction: null,
        lowestTransaction: null,
        avgOutflow: null,
        savingsRate: null,
        popularCategory: [],
      }
    }

    let highestItem = currentMonthItems[0]
    let lowestItem = currentMonthItems[0]
    const categorySums = new Map<CategoryKey, Decimal>()

    for (const item of currentMonthItems) {
      const { transaction, amount } = item

      if (amount.greaterThan(highestItem.amount)) {
        highestItem = item
      }
      if (amount.lessThan(lowestItem.amount)) {
        lowestItem = item
      }

      if (transaction.type === "outflow") {
        const currentSum =
          categorySums.get(transaction.categoryKey) ?? new Decimal(0)
        categorySums.set(transaction.categoryKey, currentSum.plus(amount))
      }
    }

    const { totalInflow, totalOutflow, outflowCount } =
      this.computePeriodSummary(resolvedMonth)

    const avgOutflow =
      outflowCount > 0 ? totalOutflow.dividedBy(outflowCount) : null

    const savingsRate = totalInflow.greaterThan(0)
      ? totalInflow
          .minus(totalOutflow)
          .dividedBy(totalInflow)
          .mul(100)
          .toDecimalPlaces(1)
      : totalOutflow.greaterThan(0)
        ? new Decimal(-100)
        : new Decimal(0)

    let maxTotal = new Decimal(0)
    for (const total of categorySums.values()) {
      if (total.greaterThan(maxTotal)) {
        maxTotal = total
      }
    }

    const popularCategory: CategoryKey[] = []
    if (maxTotal.greaterThan(0)) {
      for (const [key, total] of categorySums.entries()) {
        if (total.equals(maxTotal)) {
          popularCategory.push(key)
        }
      }
    }

    return {
      currentMonthCount,
      unconvertedCount,
      highestTransaction: highestItem.transaction,
      lowestTransaction: lowestItem.transaction,
      avgOutflow,
      savingsRate,
      popularCategory,
    }
  }
}
