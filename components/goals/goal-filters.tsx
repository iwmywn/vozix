"use client"

import { useMemo, useState } from "react"
import { cn } from "cn"
import { SearchIcon, XIcon } from "lucide-react"
import { useExtracted, useTimeZone } from "next-intl"

import { GoalsTable } from "@/components/goals/goals-table"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useGoals } from "@/contexts/goals-context"
import { useTransactions } from "@/contexts/transactions-context"
import { useCategory } from "@/hooks/use-category"
import { useMonths } from "@/hooks/use-months"
import type { CategoryKey } from "@/lib/category"
import { getUniqueDateRangeYears } from "@/lib/date"
import type { ScheduleStatus } from "@/lib/definitions"
import { FinancialRollupEngine } from "@/lib/valuation-engine"
import type { RollupHealth } from "@/lib/valuation-engine"

export function GoalFilters() {
  const { goals } = useGoals()
  const { transactions } = useTransactions()
  const [searchTerm, setSearchTerm] = useState<string>("")
  const [filterMonth, setFilterMonth] = useState<string>("all")
  const [filterYear, setFilterYear] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<"all" | ScheduleStatus>(
    "all"
  )
  const [filterHealth, setFilterHealth] = useState<"all" | RollupHealth>("all")
  const [filterCategoryKey, setFilterCategoryKey] = useState<
    "all" | CategoryKey
  >("all")
  const t = useExtracted()
  const timeZone = useTimeZone()
  const { getCategoriesByType } = useCategory()

  const allMonths = useMonths()
  const allYears = getUniqueDateRangeYears(goals)

  const hasActiveFilters =
    searchTerm !== "" ||
    filterMonth !== "all" ||
    filterYear !== "all" ||
    filterStatus !== "all" ||
    filterHealth !== "all" ||
    filterCategoryKey !== "all"

  const handleResetFilters = () => {
    setSearchTerm("")
    setFilterMonth("all")
    setFilterYear("all")
    setFilterStatus("all")
    setFilterHealth("all")
    setFilterCategoryKey("all")
  }

  const engine = useMemo(
    () => new FinancialRollupEngine(transactions, { timeZone }),
    [transactions, timeZone]
  )

  const valuations = useMemo(
    () =>
      engine.evaluateGoals(goals, {
        searchTerm,
        filterMonth,
        filterYear,
        filterStatus,
        filterHealth,
        filterCategoryKey,
      }),
    [
      engine,
      goals,
      searchTerm,
      filterMonth,
      filterYear,
      filterStatus,
      filterHealth,
      filterCategoryKey,
    ]
  )

  return (
    <>
      <Card>
        <CardContent>
          <div
            className={cn(
              "grid gap-3 md:grid-cols-[1fr_1fr] md:grid-rows-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr] lg:grid-rows-2 2xl:grid-cols-[1fr_1fr_1fr_1fr_1fr] 2xl:grid-rows-2",
              hasActiveFilters &&
                "md:grid-rows-3 lg:grid-rows-2 2xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
            )}
          >
            <InputGroup
              className={cn(
                "col-span-full",
                searchTerm !== "" && "border-primary"
              )}
            >
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder={t("Search goals...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    onClick={() => setSearchTerm("")}
                  >
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>

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
                {getCategoriesByType("inflow").map((category) => (
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
                  <SelectItem value="on_track">{t("Good (≥ 100%)")}</SelectItem>
                  <SelectItem value="warning">{t("Low (75-100%)")}</SelectItem>
                  <SelectItem value="exceeded">
                    {t("Warning (< 75%)")}
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

      <GoalsTable valuations={valuations} />
    </>
  )
}
