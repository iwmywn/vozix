"use client"

import { useState } from "react"
import { MoreVerticalIcon, RepeatIcon } from "lucide-react"
import { useExtracted } from "next-intl"

import { EmptyState } from "@/components/empty-state"
import { DeleteRecurringTransaction } from "@/components/recurring-transactions/delete-recurring-transaction"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCategory } from "@/hooks/use-category"
import { useFormatCurrency } from "@/hooks/use-format-currency"
import { useFormatDate } from "@/hooks/use-format-date"
import type { RecurringTransaction, ScheduleStatus } from "@/lib/definitions"
import type { EvaluatedRecurringSchedule } from "@/lib/recurring"
import { getScheduleStatusClass } from "@/lib/utils"

interface RecurringTableProps {
  evaluatedSchedules: EvaluatedRecurringSchedule[]
  isTotalEmpty?: boolean
}

export function RecurringTransactionsTable({
  evaluatedSchedules,
  isTotalEmpty,
}: RecurringTableProps) {
  const [selectedRecurring, setSelectedRecurring] =
    useState<RecurringTransaction | null>(null)
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false)
  const t = useExtracted()
  const { getCategoryLabel, getCategoryDescription } = useCategory()
  const formatDate = useFormatDate()
  const formatCurrency = useFormatCurrency()

  const statusLabels: Record<ScheduleStatus, string> = {
    expired: t("Expired"),
    upcoming: t("Upcoming"),
    active: t("Active"),
  }

  const getFrequencyLabel = (frequency: RecurringTransaction["frequency"]) => {
    switch (frequency) {
      case "daily":
        return t("Daily")
      case "weekly":
        return t("Weekly")
      case "bi-weekly":
        return t("Bi-Weekly")
      case "monthly":
        return t("Monthly")
      case "quarterly":
        return t("Quarterly")
      case "yearly":
        return t("Yearly")
      case "random":
        return t("Random")
      default:
        return frequency
    }
  }

  return (
    <>
      <Card>
        <CardContent>
          {evaluatedSchedules.length === 0 ? (
            <EmptyState
              icon={<RepeatIcon />}
              title={t("No recurring transactions found")}
              description={
                isTotalEmpty
                  ? t("You haven't created any recurring transactions yet.")
                  : t("No recurring transactions found matching your filters.")
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:text-center">
                  <TableHead>{t("Start Date")}</TableHead>
                  <TableHead>{t("End Date")}</TableHead>
                  <TableHead>{t("Description")}</TableHead>
                  <TableHead>{t("Type")}</TableHead>
                  <TableHead>{t("Category")}</TableHead>
                  <TableHead>{t("Amount")}</TableHead>
                  <TableHead>{t("Frequency")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evaluatedSchedules.map(
                  ({ schedule, status, nextOccurrenceDate }) => (
                    <TableRow key={schedule._id} className="[&>td]:text-center">
                      <TableCell>{formatDate(schedule.startDate)}</TableCell>
                      <TableCell>
                        {schedule.endDate
                          ? formatDate(schedule.endDate)
                          : t("No end date")}
                      </TableCell>
                      <TableCell>{schedule.description}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            schedule.type === "inflow"
                              ? "badge-green"
                              : "badge-red"
                          }
                        >
                          {schedule.type === "inflow"
                            ? t("Inflow")
                            : t("Outflow")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline">
                              {getCategoryLabel(schedule.categoryKey)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {getCategoryDescription(schedule.categoryKey)}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {formatCurrency(schedule.amount, schedule.currency)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span>{getFrequencyLabel(schedule.frequency)}</span>
                          {schedule.frequency === "random" ? (
                            <span className="text-xs text-secondary">
                              {t("Every {days} days", {
                                days:
                                  schedule.randomEveryXDays?.toString() ?? "—",
                              })}
                            </span>
                          ) : null}
                          {status !== "expired" && nextOccurrenceDate ? (
                            <span className="text-xs text-secondary">
                              {t("Next: {date}", {
                                date: formatDate(nextOccurrenceDate),
                              })}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getScheduleStatusClass(status)}>
                          {statusLabels[status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVerticalIcon />
                              <span className="sr-only">{t("Open menu")}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => {
                                setSelectedRecurring(schedule)
                                setIsDeleteOpen(true)
                              }}
                            >
                              {t("Delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedRecurring && (
        <DeleteRecurringTransaction
          key={selectedRecurring._id + "DeleteRecurringTransaction"}
          recurringId={selectedRecurring._id}
          isOpen={isDeleteOpen}
          setIsOpen={setIsDeleteOpen}
        />
      )}
    </>
  )
}
