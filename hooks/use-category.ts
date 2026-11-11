"use client"

import { useExtracted } from "next-intl"

import { usePageCategories } from "@/contexts/page-data-context"
import { getCategoryType } from "@/lib/category"
import type {
  CategoryConfig,
  CategoryKey,
  CategoryType,
  PredefinedCategoryKey,
} from "@/lib/category"

export function useCategory() {
  const t = useExtracted()
  const customCategories = usePageCategories()

  const CATEGORY_CONFIG: CategoryConfig = {
    // Inflows
    salary_bonus: {
      label: t("Salary & Bonus"),
      description: t(
        "Base salary, performance bonus, holiday bonus, allowances, etc."
      ),
    },
    business_freelance: {
      label: t("Business & Freelance"),
      description: t(
        "Sales revenue, services, freelance, short-term contracts, etc."
      ),
    },
    investment_passive: {
      label: t("Investment & Passive"),
      description: t(
        "Savings interest, dividends, bonds interest, rental, royalties, etc."
      ),
    },
    gift_support: {
      label: t("Gifts & Support"),
      description: t("Cash gifts, family support, celebration money, etc."),
    },
    debt_collection: {
      label: t("Debt Collection"),
      description: t("Borrowing money, collecting debt, loans received, etc."),
    },
    other_inflow: {
      label: t("Other Inflows"),
      description: t(
        "Refunds, selling used items, prizes, unexpected amounts, etc."
      ),
    },

    // Outflows
    food_beverage: {
      label: t("Food & Beverage"),
      description: t(
        "Groceries, markets, restaurants, cafes, breakfast/lunch/dinner, etc."
      ),
    },
    transportation: {
      label: t("Transportation"),
      description: t("Fuel, bus/grab, vehicle maintenance, parking fees, etc."),
    },
    personal_care: {
      label: t("Personal Care"),
      description: t(
        "Haircut, manicure, spa, massage, hair dye, skincare, etc."
      ),
    },
    shopping: {
      label: t("Shopping"),
      description: t(
        "Clothes, shoes, cosmetics, accessories, electronics, household items, etc."
      ),
    },
    family_support: {
      label: t("Family Support"),
      description: t(
        "Money for parents, support for siblings, relatives, etc."
      ),
    },
    housing: {
      label: t("Housing & Utilities"),
      description: t(
        "Rent, electricity, water, gas, internet, phone, management fees, etc."
      ),
    },
    healthcare_insurance: {
      label: t("Healthcare & Insurance"),
      description: t("Medical visits, medicine, health/life insurance, etc."),
    },
    education_development: {
      label: t("Education & Development"),
      description: t(
        "Tuition, books, online/offline courses, certificates, seminars, etc."
      ),
    },
    entertainment_leisure: {
      label: t("Entertainment & Leisure"),
      description: t("Travel, movies, music, games, gym, hobbies, etc."),
    },
    social_gifts: {
      label: t("Social & Gifts"),
      description: t(
        "Weddings, funerals, birthdays, gifts for friends, gatherings, etc."
      ),
    },
    savings_investment: {
      label: t("Savings & Investment"),
      description: t(
        "Savings, stocks, funds, real estate, crypto, emergency fund, etc."
      ),
    },
    debt_payment: {
      label: t("Debt Payment"),
      description: t("Bank loan payments, credit cards, personal debts, etc."),
    },
    other_outflow: {
      label: t("Other Outflows"),
      description: t(
        "Unexpected repairs, fines, losses, unidentified outflows, etc."
      ),
    },
  } as const

  const categories = [
    ...(customCategories?.map((c) => ({
      key: c._id,
      label: c.label,
      description: c.description,
      type: c.type,
    })) ?? []),

    ...Object.entries(CATEGORY_CONFIG).map(([key, value]) => ({
      key,
      ...value,
      type: getCategoryType(key as PredefinedCategoryKey),
    })),
  ]

  const getCategoryLabel = (key: CategoryKey): string => {
    return categories.find((c) => c.key === key)?.label ?? ""
  }

  const getCategoryDescription = (key: CategoryKey): string => {
    return categories.find((c) => c.key === key)?.description ?? ""
  }

  const getCategoriesByType = (type: CategoryType) => {
    return categories.filter((c) => c.type === type)
  }

  return {
    getCategoryLabel,
    getCategoryDescription,
    getCategoriesByType,
  }
}
