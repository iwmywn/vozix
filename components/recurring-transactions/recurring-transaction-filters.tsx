"use client"

import { useMemo, useState } from "react"
import { cn } from "cn"
import { SearchIcon, XIcon } from "lucide-react"
import { useExtracted, useTimeZone } from "next-intl"

import { RecurringTransactionsTable } from "@/components/recurring-transactions/recurring-transactions-table"
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
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRecurring } from "@/contexts/recurring-context"
import { useCategory } from "@/hooks/use-category"
import { useMonths } from "@/hooks/use-months"
import type { CategoryKey, CategoryType } from "@/lib/category"
import { getUniqueDateRangeYears } from "@/lib/date"
import type { ScheduleStatus } from "@/lib/definitions"
import { evaluateRecurringSchedules } from "@/lib/recurring"

export function RecurringTransactionFilters() {
  const { recurringTransactions } = useRecurring()
  const [searchTerm, setSearchTerm] = useState<string>("")
  const [filterMonth, setFilterMonth] = useState<string>("all")
  const [filterYear, setFilterYear] = useState<string>("all")
  const [filterType, setFilterType] = useState<CategoryType | "all">("all")
  const [filterStatus, setFilterStatus] = useState<ScheduleStatus | "all">(
    "all"
  )
  const [filterCategoryKey, setFilterCategoryKey] = useState<
    CategoryKey | "all"
  >("all")
  const t = useExtracted()
  const timeZone = useTimeZone()
  const { getCategoriesByType } = useCategory()

  const allMonths = useMonths()
  const allYears = getUniqueDateRangeYears(recurringTransactions)

  const hasActiveFilters =
    searchTerm !== "" ||
    filterMonth !== "all" ||
    filterYear !== "all" ||
    filterType !== "all" ||
    filterStatus !== "all" ||
    filterCategoryKey !== "all"

  const handleResetFilters = () => {
    setSearchTerm("")
    setFilterMonth("all")
    setFilterYear("all")
    setFilterType("all")
    setFilterStatus("all")
    setFilterCategoryKey("all")
  }

  const { filteredSchedules } = useMemo(
    () =>
      evaluateRecurringSchedules(
        recurringTransactions,
        {
          searchTerm,
          filterMonth,
          filterYear,
          filterType,
          filterStatus,
          filterCategoryKey,
        },
        { timeZone }
      ),
    [
      recurringTransactions,
      searchTerm,
      filterMonth,
      filterYear,
      filterType,
      filterStatus,
      filterCategoryKey,
      timeZone,
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
                placeholder={t("Search recurring transactions...")}
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
              value={filterType}
              onValueChange={(val: CategoryType | "all") => setFilterType(val)}
            >
              <SelectTrigger
                className={cn(
                  "w-full",
                  filterType !== "all" && "border-primary"
                )}
              >
                <SelectValue placeholder={t("Type")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("All Types")}</SelectItem>
                  <SelectSeparator />
                  <SelectItem value="inflow">{t("Inflow")}</SelectItem>
                  <SelectItem value="outflow">{t("Outflow")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              value={filterCategoryKey}
              onValueChange={(val: CategoryKey | "all") =>
                setFilterCategoryKey(val)
              }
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
                <SelectGroup>
                  <SelectItem value="all">{t("All Categories")}</SelectItem>
                  <SelectSeparator />
                  <SelectLabel>{t("Inflow")}</SelectLabel>
                  {getCategoriesByType("inflow").map((category) => (
                    <SelectItem key={category.key} value={category.key}>
                      {category.label}
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                  <SelectLabel>{t("Outflow")}</SelectLabel>
                  {getCategoriesByType("outflow").map((category) => (
                    <SelectItem key={category.key} value={category.key}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              value={filterStatus}
              onValueChange={(value: ScheduleStatus | "all") =>
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

      <RecurringTransactionsTable evaluatedSchedules={filteredSchedules} />
    </>
  )
}
