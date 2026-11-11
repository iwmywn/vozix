import { GhostIcon } from "lucide-react"
import { getExtracted } from "next-intl/server"

import { getBudgets } from "@/actions/budget.actions"
import { getCustomCategories } from "@/actions/category.actions"
import { getGoals } from "@/actions/goal.actions"
import { getRecurringTransactions } from "@/actions/recurring.actions"
import { getTransactions } from "@/actions/transaction.actions"
import { EmptyState } from "@/components/empty-state"
import { PageDataContext } from "@/contexts/page-data-context"
import type { PageData } from "@/contexts/page-data-context"

type PageDataProviderProps = {
  children: React.ReactNode
  transactions?: boolean
  categories?: boolean
  budgets?: boolean
  goals?: boolean
  recurring?: boolean
}

export async function PageDataProvider({
  children,
  transactions,
  categories,
  budgets,
  goals,
  recurring,
}: PageDataProviderProps) {
  const t = await getExtracted()

  const [
    transactionsResult,
    categoriesResult,
    budgetsResult,
    goalsResult,
    recurringResult,
  ] = await Promise.all([
    transactions ? getTransactions() : Promise.resolve(null),
    categories ? getCustomCategories() : Promise.resolve(null),
    budgets ? getBudgets() : Promise.resolve(null),
    goals ? getGoals() : Promise.resolve(null),
    recurring ? getRecurringTransactions() : Promise.resolve(null),
  ])

  const Icon = <GhostIcon />
  const fallbackDescription = t("Please try again later.")

  if (transactions && !transactionsResult?.transactions) {
    return (
      <EmptyState
        className="mt-3"
        icon={Icon}
        title={t("Cannot fetch transactions data")}
        description={transactionsResult?.error ?? fallbackDescription}
      />
    )
  }

  if (categories && !categoriesResult?.customCategories) {
    return (
      <EmptyState
        className="mt-3"
        icon={Icon}
        title={t("Cannot fetch categories data")}
        description={categoriesResult?.error ?? fallbackDescription}
      />
    )
  }

  if (budgets && !budgetsResult?.budgets) {
    return (
      <EmptyState
        className="mt-3"
        icon={Icon}
        title={t("Cannot fetch budgets data")}
        description={budgetsResult?.error ?? fallbackDescription}
      />
    )
  }

  if (goals && !goalsResult?.goals) {
    return (
      <EmptyState
        className="mt-3"
        icon={Icon}
        title={t("Cannot fetch goals data")}
        description={goalsResult?.error ?? fallbackDescription}
      />
    )
  }

  if (recurring && !recurringResult?.recurringTransactions) {
    return (
      <EmptyState
        className="mt-3"
        icon={Icon}
        title={t("Cannot fetch recurring transactions data")}
        description={recurringResult?.error ?? fallbackDescription}
      />
    )
  }

  const pageData: PageData = {
    transactions: transactionsResult?.transactions,
    customCategories: categoriesResult?.customCategories,
    budgets: budgetsResult?.budgets,
    goals: goalsResult?.goals,
    recurringTransactions: recurringResult?.recurringTransactions,
  }

  return <PageDataContext value={pageData}>{children}</PageDataContext>
}
