"use client"

import * as React from "react"

import type {
  Budget,
  Category,
  Goal,
  RecurringTransaction,
  Transaction,
} from "@/lib/definitions"

export interface PageData {
  transactions?: Transaction[]
  customCategories?: Category[]
  budgets?: Budget[]
  goals?: Goal[]
  recurringTransactions?: RecurringTransaction[]
}

export const PageDataContext = React.createContext<PageData | null>(null)

export function usePageData(): PageData {
  const context = React.useContext(PageDataContext)
  if (!context) {
    throw new Error("usePageData must be used within a PageDataProvider")
  }
  return context
}

export function usePageTransactions(): Transaction[] {
  const data = usePageData()
  return data.transactions ?? []
}

export function usePageCategories(): Category[] {
  const data = usePageData()
  return data.customCategories ?? []
}

export function usePageBudgets(): Budget[] {
  const data = usePageData()
  return data.budgets ?? []
}

export function usePageGoals(): Goal[] {
  const data = usePageData()
  return data.goals ?? []
}

export function usePageRecurring(): RecurringTransaction[] {
  const data = usePageData()
  return data.recurringTransactions ?? []
}
