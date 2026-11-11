"use client"

import { useMemo, useState } from "react"
import { AlertCircleIcon, MoreVerticalIcon, WalletIcon } from "lucide-react"
import { useExtracted } from "next-intl"

import { EmptyState } from "@/components/empty-state"
import { DeleteTransaction } from "@/components/transactions/delete-transaction"
import { ExportButton } from "@/components/transactions/export-button"
import { TransactionForm } from "@/components/transactions/transaction-form"
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
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
import { useUser } from "@/contexts/user-context"
import { useCategory } from "@/hooks/use-category"
import { useFormatCurrency } from "@/hooks/use-format-currency"
import { useFormatDate } from "@/hooks/use-format-date"
import type { Transaction } from "@/lib/definitions"
import { getFlowColorClass } from "@/lib/utils"

const ITEMS_PER_PAGE = 10

interface TransactionsTableProps {
  filteredTransactions: Transaction[]
  filterKey?: string
  isTotalEmpty?: boolean
}

export function TransactionsTable({
  filteredTransactions,
  filterKey,
  isTotalEmpty,
}: TransactionsTableProps) {
  const { user } = useUser()
  const t = useExtracted()
  const { getCategoryLabel, getCategoryDescription } = useCategory()
  const formatDate = useFormatDate()
  const formatCurrency = useFormatCurrency()
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null)
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false)
  const [isCurrentPage, setIsCurrentPage] = useState<number>(1)
  const [prevFilterKey, setPrevFilterKey] = useState<string | undefined>(
    filterKey
  )

  const totalPages =
    Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE) || 1

  if (filterKey !== undefined && prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey)
    setIsCurrentPage(1)
  } else if (isCurrentPage > totalPages) {
    setIsCurrentPage(totalPages)
  }

  const activePage = Math.min(Math.max(isCurrentPage, 1), totalPages)

  const startIndex = (activePage - 1) * ITEMS_PER_PAGE
  const paginatedTransactions = filteredTransactions.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  )

  const hasUnconverted = useMemo(
    () =>
      filteredTransactions.some(
        (transaction) => transaction.currency !== user.currency
      ),
    [filteredTransactions, user.currency]
  )

  return (
    <>
      <Card>
        <CardContent>
          {filteredTransactions.length === 0 ? (
            <EmptyState
              icon={<WalletIcon />}
              title={t("No transactions found")}
              description={
                isTotalEmpty
                  ? t("You haven't created any transactions yet.")
                  : t("No transactions found matching your filters.")
              }
            />
          ) : (
            <div className="flex h-full flex-col gap-3">
              <UnconvertedTransactionsAlert hasUnconverted={hasUnconverted} />
              <Table>
                <TableHeader>
                  <TableRow className="[&>th]:text-center">
                    <TableHead>{t("Date")}</TableHead>
                    <TableHead>{t("Description")}</TableHead>
                    <TableHead>{t("Type")}</TableHead>
                    <TableHead>{t("Category")}</TableHead>
                    <TableHead>{t("Amount")}</TableHead>
                    <TableHead>
                      <ExportButton
                        filteredTransactions={filteredTransactions}
                      />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTransactions.map((transaction) => (
                    <TableRow
                      key={transaction._id.toString()}
                      className="[&>td]:text-center"
                    >
                      <TableCell>{formatDate(transaction.date)}</TableCell>
                      <TableCell className="max-w-md min-w-52 wrap-anywhere whitespace-normal">
                        {transaction.description}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            transaction.type === "inflow"
                              ? "badge-green"
                              : "badge-red"
                          }
                        >
                          {transaction.type === "inflow"
                            ? t("Inflow")
                            : t("Outflow")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline">
                              {getCategoryLabel(transaction.categoryKey)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {getCategoryDescription(transaction.categoryKey)}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="min-w-38 wrap-anywhere whitespace-normal">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className={getFlowColorClass(transaction.type)}>
                            {transaction.type === "inflow" ? "+" : "-"}
                            {formatCurrency(
                              transaction.amount,
                              transaction.currency
                            )}
                          </span>
                          {transaction.currency !== user.currency && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-help items-center text-yellow hover:opacity-80">
                                  <AlertCircleIcon className="size-4 shrink-0" />
                                  <span className="sr-only">
                                    {t("Exchange rate pending")}
                                  </span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t("Exchange rate pending")}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
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
                              onClick={() => {
                                setSelectedTransaction(transaction)
                                setIsEditOpen(true)
                              }}
                            >
                              {t("Edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => {
                                setSelectedTransaction(transaction)
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

              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        if (activePage > 1) {
                          setIsCurrentPage(activePage - 1)
                        }
                      }}
                      aria-disabled={activePage <= 1}
                      tabIndex={activePage <= 1 ? -1 : undefined}
                      className={
                        activePage <= 1
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        if (activePage < totalPages) {
                          setIsCurrentPage(activePage + 1)
                        }
                      }}
                      aria-disabled={activePage >= totalPages}
                      tabIndex={activePage >= totalPages ? -1 : undefined}
                      className={
                        activePage >= totalPages
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTransaction && (
        <>
          <TransactionForm
            key={selectedTransaction._id + "TransactionForm"}
            transaction={selectedTransaction}
            isOpen={isEditOpen}
            setIsOpen={setIsEditOpen}
          />
          <DeleteTransaction
            key={selectedTransaction._id + "DeleteTransaction"}
            transactionId={selectedTransaction._id}
            isOpen={isDeleteOpen}
            setIsOpen={setIsDeleteOpen}
          />
        </>
      )}
    </>
  )
}
