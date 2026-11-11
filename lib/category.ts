export const CATEGORY_TYPES = ["inflow", "outflow"] as const
export type CategoryType = (typeof CATEGORY_TYPES)[number]

const INFLOW_CATEGORIES_KEY = [
  "salary_bonus",
  "business_freelance",
  "investment_passive",
  "gift_support",
  "debt_collection",
  "other_inflow",
] as const

const OUTFLOW_CATEGORIES_KEY = [
  "food_beverage",
  "transportation",
  "personal_care",
  "shopping",
  "family_support",
  "housing",
  "healthcare_insurance",
  "education_development",
  "entertainment_leisure",
  "social_gifts",
  "savings_investment",
  "debt_payment",
  "other_outflow",
] as const

export const ALL_PREDEFINED_CATEGORIES_KEY = [
  ...INFLOW_CATEGORIES_KEY,
  ...OUTFLOW_CATEGORIES_KEY,
] as const
export type PredefinedCategoryKey =
  (typeof ALL_PREDEFINED_CATEGORIES_KEY)[number]
export type CategoryKey = PredefinedCategoryKey | string

export type CategoryConfig = {
  [K in CategoryKey]: {
    label: string
    description: string
  }
}

export function isPredefinedCategoryKey(
  key: string
): key is PredefinedCategoryKey {
  return (ALL_PREDEFINED_CATEGORIES_KEY as readonly string[]).includes(key)
}

export function getCategoryType(key: PredefinedCategoryKey): CategoryType
export function getCategoryType(key: CategoryKey): CategoryType | undefined
export function getCategoryType(key: CategoryKey): CategoryType | undefined {
  if ((INFLOW_CATEGORIES_KEY as readonly string[]).includes(key)) {
    return "inflow"
  }
  if ((OUTFLOW_CATEGORIES_KEY as readonly string[]).includes(key)) {
    return "outflow"
  }
  return undefined
}
