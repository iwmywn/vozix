"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { MoreVerticalIcon, PiggyBankIcon } from "lucide-react"
import { useExtracted } from "next-intl"

import { BudgetForm } from "@/components/budgets/budget-form"
import { DeleteBudget } from "@/components/budgets/delete-budget"
import { EmptyState } from "@/components/empty-state"
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
import { useBudgets } from "@/contexts/budgets-context"
import { useCategory } from "@/hooks/use-category"
import { useFormatCurrency } from "@/hooks/use-format-currency"
import { useFormatDate } from "@/hooks/use-format-date"
import type { Budget } from "@/lib/definitions"
import { buildTransactionsHref } from "@/lib/filters"
import { getRollupHealthClass, getScheduleStatusClass } from "@/lib/utils"
import type { BudgetValuation } from "@/lib/valuation-engine"

interface BudgetsTableProps {
  valuations: BudgetValuation[]
}

export function BudgetsTable({ valuations }: BudgetsTableProps) {
  const { budgets } = useBudgets()
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null)
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
              icon={<PiggyBankIcon />}
              title={t("No budgets found")}
              description={
                budgets.length === 0
                  ? t("You haven't created any budgets yet.")
                  : t("No budgets found matching your filters.")
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
                    <TableHead>{t("Category")}</TableHead>
                    <TableHead>{t("Amount")}</TableHead>
                    <TableHead>{t("Spent")}</TableHead>
                    <TableHead>{t("Balance")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead>{t("Progress")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {valuations.map((valuation) => (
                    <TableRow
                      key={valuation.budget._id}
                      className="[&>td]:text-center"
                    >
                      <TableCell>
                        {formatDate(valuation.budget.startDate)}
                      </TableCell>
                      <TableCell>
                        {formatDate(valuation.budget.endDate)}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline">
                              {getCategoryLabel(valuation.budget.categoryKey)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {getCategoryDescription(
                              valuation.budget.categoryKey
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {formatCurrency(
                          valuation.budget.allocatedAmount,
                          valuation.budget.currency
                        )}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(
                          valuation.spent.toString(),
                          valuation.budget.currency
                        )}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(
                          valuation.remaining.toString(),
                          valuation.budget.currency
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
                                      from: valuation.budget.startDate,
                                      to: valuation.budget.endDate,
                                    },
                                    dateMode: "utc",
                                    filterType: "outflow",
                                    filterCategoryKey:
                                      valuation.budget.categoryKey,
                                  })}
                                >
                                  {t("View")}
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedBudget(valuation.budget)
                                setIsEditOpen(true)
                              }}
                            >
                              {t("Edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => {
                                setSelectedBudget(valuation.budget)
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

      {selectedBudget && (
        <>
          <BudgetForm
            key={selectedBudget._id + "BudgetForm"}
            budget={selectedBudget}
            isOpen={isEditOpen}
            setIsOpen={setIsEditOpen}
          />
          <DeleteBudget
            key={selectedBudget._id + "DeleteBudget"}
            budgetId={selectedBudget._id}
            isOpen={isDeleteOpen}
            setIsOpen={setIsDeleteOpen}
          />
        </>
      )}
    </>
  )
}
