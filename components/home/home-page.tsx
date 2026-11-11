"use client"

import { useMemo, useState } from "react"
import { useExtracted, useTimeZone } from "next-intl"

import { QuickStats } from "@/components/home/quick-stats"
import { RecentTransactions } from "@/components/home/recent-transactions"
import { TransactionSummary } from "@/components/home/transaction-summary"
import { PageLayout } from "@/components/layout/page-layout"
import { TransactionForm } from "@/components/transactions/transaction-form"
import { Button } from "@/components/ui/button"
import { usePageTransactions } from "@/contexts/page-data-context"
import { useUser } from "@/contexts/user-context"
import type { Currency } from "@/lib/currency"
import { FinancialRollupEngine } from "@/lib/valuation-engine"

export default function HomePage() {
  const transactions = usePageTransactions()
  const { user } = useUser()
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const t = useExtracted()
  const timeZone = useTimeZone()

  const engine = useMemo(
    () =>
      new FinancialRollupEngine(transactions, {
        targetCurrency: user.currency as Currency,
        timeZone,
      }),
    [transactions, user.currency, timeZone]
  )

  const summary = useMemo(() => engine.evaluateCurrentMonthSummary(), [engine])
  const stats = useMemo(() => engine.evaluateQuickStats(), [engine])

  return (
    <>
      <PageLayout
        title={
          <>
            {t("Welcome back")}, {user.name}!
          </>
        }
        description={t(
          "Here's what's happening with your finances this month."
        )}
        action={<Button onClick={() => setIsOpen(true)}>{t("Add")}</Button>}
      >
        <TransactionSummary summary={summary} />

        <div className="grid gap-3 md:grid-cols-2">
          <RecentTransactions />
          <QuickStats stats={stats} />
        </div>
      </PageLayout>

      <TransactionForm isOpen={isOpen} setIsOpen={setIsOpen} />
    </>
  )
}
