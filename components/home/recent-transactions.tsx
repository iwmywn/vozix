"use client"

import { Fragment } from "react"
import { WalletIcon } from "lucide-react"
import { useExtracted } from "next-intl"

import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { usePageTransactions } from "@/contexts/page-data-context"
import { useCategory } from "@/hooks/use-category"
import { useFormatCurrency } from "@/hooks/use-format-currency"
import { useFormatDate } from "@/hooks/use-format-date"
import { getFlowColorClass } from "@/lib/utils"

export function RecentTransactions() {
  const transactions = usePageTransactions()
  const recentTransactions = transactions.slice(0, 10)
  const t = useExtracted()
  const { getCategoryLabel } = useCategory()
  const formatDate = useFormatDate()
  const formatCurrency = useFormatCurrency()

  return (
    <Card>
      <CardHeader className="sticky top-0 z-10 border-b">
        <CardTitle className="text-sm tracking-wider uppercase">
          {t("Recent Transactions")}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-90 space-y-3 overflow-y-auto md:max-h-none">
        {recentTransactions.length === 0 ? (
          <EmptyState
            className="h-full"
            icon={<WalletIcon />}
            title={t("No transactions found")}
            description={t("You haven't created any transactions yet.")}
          />
        ) : (
          recentTransactions.map((transaction, index) => (
            <Fragment key={transaction._id}>
              <div className="flex items-center justify-between py-1">
                <div className="flex max-w-2/4 items-center space-x-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          transaction.type === "inflow"
                            ? "badge-green"
                            : "badge-red"
                        }
                      >
                        {getCategoryLabel(transaction.categoryKey)}
                      </Badge>
                      <span className="text-[11px] text-secondary">
                        {formatDate(transaction.date)}
                      </span>
                    </div>
                    <div className="text-sm wrap-anywhere">
                      {transaction.description}
                    </div>
                  </div>
                </div>
                <div className="max-w-2/4 text-right">
                  <div
                    className={`text-sm wrap-anywhere ${getFlowColorClass(transaction.type)}`}
                  >
                    {transaction.type === "inflow" ? "+" : "-"}
                    {formatCurrency(transaction.amount, transaction.currency)}
                  </div>
                </div>
              </div>

              {index !== recentTransactions.length - 1 && <Separator />}
            </Fragment>
          ))
        )}
      </CardContent>
    </Card>
  )
}
