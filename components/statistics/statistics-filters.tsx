"use client"

import { useMemo, useState } from "react"
import { cn } from "cn"
import { ChevronDownIcon } from "lucide-react"
import { useExtracted, useTimeZone } from "next-intl"

import { StatisticsSummary } from "@/components/statistics/statistics-summary"
import { StatisticsTable } from "@/components/statistics/statistics-table"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent } from "@/components/ui/card"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePageTransactions } from "@/contexts/page-data-context"
import { useUser } from "@/contexts/user-context"
import { useFormatDate } from "@/hooks/use-format-date"
import { useMonths } from "@/hooks/use-months"
import type { Currency } from "@/lib/currency"
import { getUniqueYears } from "@/lib/date"
import {
  applyTemporalFilterChange,
  filterTransactions,
  hasActiveTemporalFilters,
} from "@/lib/filters"
import type { TemporalFilterAction } from "@/lib/filters"
import { FinancialRollupEngine } from "@/lib/valuation-engine"

export function StatisticsFilters() {
  const transactions = usePageTransactions()
  const { user } = useUser()
  const t = useExtracted()
  const timeZone = useTimeZone()
  const formatDate = useFormatDate()
  const [isDatePickerOpen, setIsDatePickerOpen] = useState<boolean>(false)
  const [isDateRangeOpen, setIsDateRangeOpen] = useState<boolean>(false)
  const [temporalState, setTemporalState] = useState(() =>
    applyTemporalFilterChange({}, { type: "reset" })
  )
  const { selectedDate, dateRange, filterMonth, filterYear } = temporalState

  const allMonths = useMonths()
  const allYears = getUniqueYears(transactions)

  const hasActiveFilters = hasActiveTemporalFilters(temporalState)

  const commitTemporalTransition = (action: TemporalFilterAction) => {
    const nextState = applyTemporalFilterChange(temporalState, action)
    setTemporalState(nextState)
    if (nextState.completed) {
      setIsDateRangeOpen(false)
    }
  }

  const filteredTransactions = useMemo(
    () => filterTransactions(transactions, temporalState),
    [transactions, temporalState]
  )

  const engine = useMemo(
    () =>
      new FinancialRollupEngine(filteredTransactions, {
        targetCurrency: user.currency as Currency,
        timeZone,
      }),
    [filteredTransactions, user.currency, timeZone]
  )

  const summary = useMemo(() => engine.evaluatePeriodSummary(), [engine])
  const valuations = useMemo(() => engine.evaluateCategoryRollups(), [engine])

  return (
    <>
      <Card>
        <CardContent>
          <div
            className={cn(
              "grid grid-cols-1 gap-3 sm:grid-cols-2",
              hasActiveFilters
                ? "lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
                : "lg:grid-cols-[1fr_1fr_1fr_1fr]"
            )}
          >
            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-between font-normal",
                    selectedDate && "border-primary!"
                  )}
                >
                  {selectedDate ? formatDate(selectedDate) : t("Select Date")}
                  <ChevronDownIcon />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  autoFocus
                  mode="single"
                  selected={selectedDate}
                  captionLayout="dropdown"
                  onSelect={(date) => {
                    commitTemporalTransition({ type: "selectDate", date })
                    setIsDatePickerOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>

            <Popover open={isDateRangeOpen} onOpenChange={setIsDateRangeOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-between font-normal",
                    dateRange.from && "border-primary!"
                  )}
                >
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {formatDate(dateRange.from)} -{" "}
                        {formatDate(dateRange.to)}
                      </>
                    ) : (
                      formatDate(dateRange.from)
                    )
                  ) : (
                    t("Select Date Range")
                  )}
                  <ChevronDownIcon />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="flex flex-col pt-3 sm:flex-row">
                  <div>
                    <div className="text-center text-sm">{t("From")}</div>
                    <Calendar
                      autoFocus
                      mode="single"
                      selected={dateRange.from}
                      defaultMonth={dateRange.from}
                      captionLayout="dropdown"
                      onSelect={(date) =>
                        commitTemporalTransition({
                          type: "selectRangeFrom",
                          date,
                        })
                      }
                    />
                  </div>
                  <div>
                    <div className="text-center text-sm">{t("To")}</div>
                    <Calendar
                      autoFocus
                      mode="single"
                      selected={dateRange.to}
                      defaultMonth={dateRange.to}
                      captionLayout="dropdown"
                      onSelect={(date) =>
                        commitTemporalTransition({
                          type: "selectRangeTo",
                          date,
                        })
                      }
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Select
              value={filterMonth}
              onValueChange={(month) =>
                commitTemporalTransition({ type: "selectMonth", month })
              }
            >
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

            <Select
              value={filterYear}
              onValueChange={(year) =>
                commitTemporalTransition({ type: "selectYear", year })
              }
            >
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

            {hasActiveFilters && (
              <Button
                variant="outline"
                onClick={() => commitTemporalTransition({ type: "reset" })}
                className="sm:col-span-2 lg:col-span-1"
              >
                {t("Reset")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <StatisticsSummary summary={summary} />

      <StatisticsTable
        valuations={valuations}
        hasUnconverted={summary.unconvertedCount > 0}
        filterStates={temporalState}
        isTotalEmpty={transactions.length === 0}
      />
    </>
  )
}
