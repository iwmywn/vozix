import * as React from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { renderWithProviders } from "@/tests/frontend/helpers/test-providers"
import { mockTransactions } from "@/tests/shared/data"
import { TransactionsTable } from "@/components/transactions/transactions-table"
import {
  PageDataContext,
  usePageBudgets,
  usePageCategories,
  usePageData,
  usePageGoals,
  usePageRecurring,
  usePageTransactions,
} from "@/contexts/page-data-context"
import type { PageData } from "@/contexts/page-data-context"

vi.mock("@/actions/transaction.actions", () => ({
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}))

function TestConsumer() {
  const data = usePageData()
  const transactions = usePageTransactions()
  const categories = usePageCategories()
  const budgets = usePageBudgets()
  const goals = usePageGoals()
  const recurring = usePageRecurring()

  return (
    <div>
      <span data-testid="tx-count">{transactions.length}</span>
      <span data-testid="cat-count">{categories.length}</span>
      <span data-testid="budget-count">{budgets.length}</span>
      <span data-testid="goal-count">{goals.length}</span>
      <span data-testid="rec-count">{recurring.length}</span>
      <span data-testid="has-data">{data ? "yes" : "no"}</span>
    </div>
  )
}

describe("PageDataContext and Accessor Hooks", () => {
  it("throws an error when usePageData is called outside of PageDataProvider", () => {
    // Suppress console.error for expected thrown error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<TestConsumer />)).toThrow(
      "usePageData must be used within a PageDataProvider"
    )
    spy.mockRestore()
  })

  it("provides hydrated domain datasets to consumer components", () => {
    const pageData: PageData = {
      transactions: mockTransactions,
      customCategories: [
        {
          _id: "cat_1",
          userId: "user_1",
          type: "outflow",
          label: "Coffee",
          description: "Morning coffee",
        },
      ],
      budgets: [],
      goals: [],
      recurringTransactions: [],
    }

    render(
      <PageDataContext.Provider value={pageData}>
        <TestConsumer />
      </PageDataContext.Provider>
    )

    expect(screen.getByTestId("tx-count").textContent).toBe(
      String(mockTransactions.length)
    )
    expect(screen.getByTestId("cat-count").textContent).toBe("1")
    expect(screen.getByTestId("budget-count").textContent).toBe("0")
    expect(screen.getByTestId("has-data").textContent).toBe("yes")
  })

  it("defaults undefined entity arrays to empty arrays in accessor hooks", () => {
    const pageData: PageData = {}

    render(
      <PageDataContext.Provider value={pageData}>
        <TestConsumer />
      </PageDataContext.Provider>
    )

    expect(screen.getByTestId("tx-count").textContent).toBe("0")
    expect(screen.getByTestId("cat-count").textContent).toBe("0")
    expect(screen.getByTestId("budget-count").textContent).toBe("0")
    expect(screen.getByTestId("goal-count").textContent).toBe("0")
    expect(screen.getByTestId("rec-count").textContent).toBe("0")
  })

  it("integrates seamlessly into renderWithProviders test helper", () => {
    renderWithProviders(<TestConsumer />, {
      pageData: {
        transactions: mockTransactions,
      },
    })

    expect(screen.getByTestId("tx-count").textContent).toBe(
      String(mockTransactions.length)
    )
  })

  describe("Decoupled Consumer Table Behavioral Integration", () => {
    it("renders uncreated empty-state message when isTotalEmpty is true", () => {
      renderWithProviders(
        <TransactionsTable filteredTransactions={[]} isTotalEmpty={true} />
      )

      expect(
        screen.getByText("You haven't created any transactions yet.")
      ).toBeInTheDocument()
    })

    it("renders filter mismatch empty-state message when isTotalEmpty is false but filteredTransactions is empty", () => {
      renderWithProviders(
        <TransactionsTable filteredTransactions={[]} isTotalEmpty={false} />
      )

      expect(
        screen.getByText("No transactions found matching your filters.")
      ).toBeInTheDocument()
    })

    it("renders table rows when filtered transactions are present without any context hook dependency", () => {
      renderWithProviders(
        <TransactionsTable
          filteredTransactions={[mockTransactions[0]]}
          isTotalEmpty={false}
        />
      )

      expect(
        screen.getByText(mockTransactions[0].description)
      ).toBeInTheDocument()
    })
  })
})
