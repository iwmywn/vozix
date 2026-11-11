"use client"

import type { Route } from "next"
import Link from "next/link"
import { MoreVerticalIcon, WalletIcon } from "lucide-react"
import { useExtracted } from "next-intl"

import { EmptyState } from "@/components/empty-state"
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
import { buildTransactionsHref } from "@/lib/filters"
import type { TemporalFilterState } from "@/lib/filters"
import { getFlowColorClass } from "@/lib/utils"
import type { CategoryRollupValuation } from "@/lib/valuation-engine"

interface StatisticsTableProps {
  valuations: CategoryRollupValuation[]
  hasUnconverted?: boolean
  filterStates?: TemporalFilterState
  isTotalEmpty?: boolean
}

export function StatisticsTable({
  valuations,
  hasUnconverted = false,
  filterStates,
  isTotalEmpty,
}: StatisticsTableProps) {
  const t = useExtracted()
  const { getCategoryLabel, getCategoryDescription } = useCategory()
  const formatCurrency = useFormatCurrency()

  const getTransactionsHref = (valuation: CategoryRollupValuation): Route =>
    buildTransactionsHref({
      ...filterStates,
      filterType: valuation.type,
      filterCategoryKey: valuation.categoryKey,
    })

  return (
    <Card>
      <CardContent>
        {valuations.length === 0 ? (
          <EmptyState
            icon={<WalletIcon />}
            title={t("No transactions found")}
            description={
              isTotalEmpty
                ? t("You haven't created any transactions yet.")
                : hasUnconverted
                  ? t("Exchange rate pending")
                  : t("No transactions found matching your filters.")
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:text-center">
                <TableHead>{t("Category")}</TableHead>
                <TableHead>{t("Type")}</TableHead>
                <TableHead>{t("Transaction Count")}</TableHead>
                <TableHead>{t("Total Amount")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {valuations.map((valuation) => (
                <TableRow
                  key={valuation.categoryKey}
                  className="[&>td]:text-center"
                >
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline">
                          {getCategoryLabel(valuation.categoryKey)}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {getCategoryDescription(valuation.categoryKey)}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        valuation.type === "inflow"
                          ? "badge-green"
                          : "badge-red"
                      }
                    >
                      {valuation.type === "inflow" ? t("Inflow") : t("Outflow")}
                    </Badge>
                  </TableCell>
                  <TableCell>{valuation.count}</TableCell>
                  <TableCell>
                    <span className={getFlowColorClass(valuation.type)}>
                      {valuation.type === "inflow" ? "+" : "-"}
                      {formatCurrency(valuation.total.toString())}
                    </span>
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
                        <DropdownMenuItem asChild>
                          <Link href={getTransactionsHref(valuation)}>
                            {t("View")}
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
