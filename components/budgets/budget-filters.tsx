"use client"

import { useMemo, useState } from "react"
import { cn } from "cn"
import { useExtracted, useTimeZone } from "next-intl"

import { BudgetsTable } from "@/components/budgets/budgets-table"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useBudgets } from "@/contexts/budgets-context"
import { useTransactions } from "@/contexts/transactions-context"
import { useCategory } from "@/hooks/use-category"
import { useMonths } from "@/hooks/use-months"
import type { CategoryKey } from "@/lib/category"
import { getUniqueDateRangeYears } from "@/lib/date"
import type { ScheduleStatus } from "@/lib/definitions"
import { FinancialRollupEngine } from "@/lib/valuation-engine"
import type { RollupHealth } from "@/lib/valuation-engine"

export function BudgetFilters() {
  const { budgets } = useBudgets()
  const { transactions } = useTransactions()
  const [filterMonth, setFilterMonth] = useState<string>("all")
  const [filterYear, setFilterYear] = useState<string>("all")
  const [filterCategoryKey, setFilterCategoryKey] = useState<
    "all" | CategoryKey
  >("all")
  const [filterHealth, setFilterHealth] = useState<"all" | RollupHealth>("all")
  const [filterStatus, setFilterStatus] = useState<"all" | ScheduleStatus>(
    "all"
  )
  const t = useExtracted()
  const timeZone = useTimeZone()
  const { getCategoriesByType } = useCategory()

  const allMonths = useMonths()
  const allYears = getUniqueDateRangeYears(budgets)

  const hasActiveFilters =
    filterMonth !== "all" ||
    filterYear !== "all" ||
    filterCategoryKey !== "all" ||
    filterHealth !== "all" ||
    filterStatus !== "all"

  const handleResetFilters = () => {
    setFilterMonth("all")
    setFilterYear("all")
    setFilterCategoryKey("all")
    setFilterHealth("all")
    setFilterStatus("all")
  }

  const engine = useMemo(
    () => new FinancialRollupEngine(transactions, { timeZone }),
    [transactions, timeZone]
  )

  const valuations = useMemo(
    () =>
      engine.evaluateBudgets(budgets, {
        filterMonth,
        filterYear,
        filterCategoryKey,
        filterHealth,
        filterStatus,
      }),
    [
      engine,
      budgets,
      filterMonth,
      filterYear,
      filterCategoryKey,
      filterHealth,
      filterStatus,
    ]
  )

  return (
    <>
      <Card>
        <CardContent>
          <div
            className={cn(
              "grid gap-3 md:grid-cols-[1fr_1fr] md:grid-rows-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr] lg:grid-rows-1 2xl:grid-cols-[1fr_1fr_1fr_1fr_1fr] 2xl:grid-rows-1",
              hasActiveFilters &&
                "md:grid-rows-2 lg:grid-rows-1 2xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
            )}
          >
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger
                className={cn(
                  "w-full",
                  filterMonth !== "all" && "border-primary"
                )}
              >
                <SelectValue placeholder={t("Month")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("All Months")}</SelectItem>
                  <SelectSeparator />
                  {allMonths.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger
                className={cn(
                  "w-full",
                  filterYear !== "all" && "border-primary"
                )}
              >
                <SelectValue placeholder={t("Year")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("All Years")}</SelectItem>
                  <SelectSeparator />
                  {allYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              value={filterCategoryKey}
              onValueChange={setFilterCategoryKey}
            >
              <SelectTrigger
                className={cn(
                  "w-full",
                  filterCategoryKey !== "all" && "border-primary"
                )}
              >
                <SelectValue placeholder={t("Category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All Categories")}</SelectItem>
                <SelectSeparator />
                {getCategoriesByType("outflow").map((category) => (
                  <SelectItem key={category.key} value={category.key}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filterHealth}
              onValueChange={(value: "all" | RollupHealth) =>
                setFilterHealth(value)
              }
            >
              <SelectTrigger
                className={cn(
                  "w-full",
                  filterHealth !== "all" && "border-primary"
                )}
              >
                <SelectValue placeholder={t("Progress")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("All Progress")}</SelectItem>
                  <SelectSeparator />
                  <SelectItem value="unstarted">
                    {t("No Transactions")}
                  </SelectItem>
                  <SelectItem value="on_track">{t("Good (< 75%)")}</SelectItem>
                  <SelectItem value="warning">
                    {t("Warning (75-100%)")}
                  </SelectItem>
                  <SelectItem value="exceeded">
                    {t("Exceeded (≥ 100%)")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              value={filterStatus}
              onValueChange={(value: "all" | ScheduleStatus) =>
                setFilterStatus(value)
              }
            >
              <SelectTrigger
                className={cn(
                  "w-full",
                  filterStatus !== "all" && "border-primary"
                )}
              >
                <SelectValue placeholder={t("Status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("All Statuses")}</SelectItem>
                  <SelectSeparator />
                  <SelectItem value="active">{t("Active")}</SelectItem>
                  <SelectItem value="upcoming">{t("Upcoming")}</SelectItem>
                  <SelectItem value="expired">{t("Expired")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="outline"
                onClick={handleResetFilters}
                className="col-span-full 2xl:col-auto"
              >
                {t("Reset")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <BudgetsTable valuations={valuations} />
    </>
  )
}
