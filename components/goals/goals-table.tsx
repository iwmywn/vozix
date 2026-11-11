"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { MoreVerticalIcon, TargetIcon } from "lucide-react"
import { useExtracted } from "next-intl"

import { EmptyState } from "@/components/empty-state"
import { DeleteGoal } from "@/components/goals/delete-goal"
import { GoalForm } from "@/components/goals/goal-form"
import { UnconvertedTransactionsAlert } from "@/components/transactions/unconverted-transactions-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
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
import type { Goal } from "@/lib/definitions"
import { buildTransactionsHref } from "@/lib/filters"
import { getRollupHealthClass, getScheduleStatusClass } from "@/lib/utils"
import type { GoalValuation } from "@/lib/valuation-engine"

interface GoalsTableProps {
  valuations: GoalValuation[]
  isTotalEmpty?: boolean
}

export function GoalsTable({ valuations, isTotalEmpty }: GoalsTableProps) {
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null)
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false)
  const t = useExtracted()
  const { getCategoryLabel, getCategoryDescription } = useCategory()
  const formatDate = useFormatDate()
  const formatCurrency = useFormatCurrency()

  const hasUnconverted = useMemo(
    () => valuations.some((valuation) => valuation.unconvertedCount > 0),
    [valuations]
  )

  return (
    <>
      <Card>
        <CardContent>
          {valuations.length === 0 ? (
            <EmptyState
              icon={<TargetIcon />}
              title={t("No goals found")}
              description={
                isTotalEmpty
                  ? t("You haven't created any goals yet.")
                  : t("No goals found matching your filters.")
              }
            />
          ) : (
            <div className="flex h-full flex-col gap-3">
              <UnconvertedTransactionsAlert hasUnconverted={hasUnconverted} />
              <Table>
                <TableHeader>
                  <TableRow className="[&>th]:text-center">
                    <TableHead>{t("Start Date")}</TableHead>
                    <TableHead>{t("End Date")}</TableHead>
                    <TableHead>{t("Goal Name")}</TableHead>
                    <TableHead>{t("Category")}</TableHead>
                    <TableHead>{t("Target Amount")}</TableHead>
                    <TableHead>{t("Accumulated")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead>{t("Progress")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {valuations.map((valuation) => (
                    <TableRow
                      key={valuation.goal._id}
                      className="[&>td]:text-center"
                    >
                      <TableCell>
                        {formatDate(valuation.goal.startDate)}
                      </TableCell>
                      <TableCell>
                        {formatDate(valuation.goal.endDate)}
                      </TableCell>
                      <TableCell>{valuation.goal.name}</TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline">
                              {getCategoryLabel(valuation.goal.categoryKey)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {getCategoryDescription(valuation.goal.categoryKey)}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {formatCurrency(
                          valuation.goal.targetAmount,
                          valuation.goal.currency
                        )}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(
                          valuation.accumulated.toString(),
                          valuation.goal.currency
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={getScheduleStatusClass(valuation.status)}
                        >
                          {valuation.status === "expired"
                            ? t("Expired")
                            : valuation.status === "active"
                              ? t("Active")
                              : t("Upcoming")}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-32">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Progress
                              value={Math.min(100, valuation.percentage)}
                              className={`flex-1 ${getRollupHealthClass(valuation.health)}`}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {valuation.percentage.toFixed(1)}%
                          </TooltipContent>
                        </Tooltip>
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
                            {valuation.matchingTransactions.length > 0 && (
                              <DropdownMenuItem asChild>
                                <Link
                                  href={buildTransactionsHref({
                                    dateRange: {
                                      from: valuation.goal.startDate,
                                      to: valuation.goal.endDate,
                                    },
                                    dateMode: "utc",
                                    filterType: "inflow",
                                    filterCategoryKey:
                                      valuation.goal.categoryKey,
                                  })}
                                >
                                  {t("View")}
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedGoal(valuation.goal)
                                setIsEditOpen(true)
                              }}
                            >
                              {t("Edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => {
                                setSelectedGoal(valuation.goal)
                                setIsDeleteOpen(true)
                              }}
                            >
                              {t("Delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedGoal && (
        <>
          <GoalForm
            key={selectedGoal._id + "GoalForm"}
            goal={selectedGoal}
            isOpen={isEditOpen}
            setIsOpen={setIsEditOpen}
          />
          <DeleteGoal
            key={selectedGoal._id + "DeleteGoal"}
            goalId={selectedGoal._id}
            isOpen={isDeleteOpen}
            setIsOpen={setIsDeleteOpen}
          />
        </>
      )}
    </>
  )
}
