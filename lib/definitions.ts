import type Decimal from "decimal.js"
import type { Decimal128, ObjectId } from "mongodb"

import type { auth } from "@/lib/auth"
import type { CategoryKey, CategoryType } from "@/lib/category"
import type { Currency } from "@/lib/currency"

export type DBRatesMap = Partial<Record<Exclude<Currency, "USD">, Decimal128>> &
  Record<string, Decimal128>
export type RatesMap = Partial<Record<Currency, Decimal>> &
  Record<string, Decimal>

export type ActionResponse =
  | { error: string; success?: never }
  | { error?: never; success: string }

export type ScheduleStatus = "upcoming" | "active" | "expired"

export type AuthErrorCode = keyof (typeof auth)["$ERROR_CODES"]

export type DBUser = { _id: ObjectId } & Omit<User, "id">
export type User = typeof auth.$Infer.Session.user

export type Session = typeof auth.$Infer.Session.session

type ValidId = string | ObjectId
type ValidAmount = string | Decimal128

type BaseTransaction<Id extends ValidId, Amount extends ValidAmount> = {
  _id: Id
  userId: Id
  type: CategoryType
  categoryKey: CategoryKey
  // DB: the original amount and currency entered by the user.
  // Client: the amount converted to the user's global display currency setting.
  amount: Amount
  currency: Currency
  description: string
  date: Date
  // the following fields are appended on the client for currency conversion
  // and are NOT stored in the database.
  // They allow budgets/goals to convert amounts to their specific currencies
  // using historical daily rates.
  originalAmount?: Amount
  originalCurrency?: Currency
  rates?: Record<Currency, string>
}

type BaseCategory<Id extends ValidId> = {
  _id: Id
  userId: Id
  type: CategoryType
  label: string
  description: string
}

type BaseBudget<Id extends ValidId, Amount extends ValidAmount> = {
  _id: Id
  userId: Id
  categoryKey: CategoryKey
  allocatedAmount: Amount
  currency: Currency
  startDate: Date
  endDate: Date
}

type BaseGoal<Id extends ValidId, Amount extends ValidAmount> = {
  _id: Id
  userId: Id
  categoryKey: CategoryKey
  name: string
  targetAmount: Amount
  currency: Currency
  startDate: Date
  endDate: Date
}

type BaseRecurringTransaction<
  Id extends ValidId,
  Amount extends ValidAmount,
> = {
  _id: Id
  userId: Id
  type: CategoryType
  categoryKey: CategoryKey
  amount: Amount
  currency: Currency
  description: string
  frequency:
    | "daily"
    | "weekly"
    | "bi-weekly"
    | "monthly"
    | "quarterly"
    | "yearly"
    | "random"
  randomEveryXDays?: number
  startDate: Date
  endDate?: Date
  lastGeneratedDate?: Date
}

type BaseExchangeRate<
  Id extends ValidId,
  Rates extends RatesMap | DBRatesMap,
> = {
  _id: Id
  date: Date
  rates: Rates
}

type BaseMissingExchangeRate<Id extends ValidId> = {
  _id: Id
  date: Date
  createdAt: Date
  updatedAt?: Date
  retryCount?: number
  lastError?: string
  status?: "failed"
  failedAt?: Date
}

export type DBTransaction = BaseTransaction<ObjectId, Decimal128>
export type Transaction = BaseTransaction<string, string>

export type DBCategory = BaseCategory<ObjectId>
export type Category = BaseCategory<string>

export type DBBudget = BaseBudget<ObjectId, Decimal128>
export type Budget = BaseBudget<string, string>

export type DBGoal = BaseGoal<ObjectId, Decimal128>
export type Goal = BaseGoal<string, string>

export type DBRecurringTransaction = BaseRecurringTransaction<
  ObjectId,
  Decimal128
>
export type RecurringTransaction = BaseRecurringTransaction<string, string>

export type DBExchangeRate = BaseExchangeRate<ObjectId, DBRatesMap>
export type ExchangeRate = BaseExchangeRate<string, RatesMap>

export type DBMissingExchangeRate = BaseMissingExchangeRate<ObjectId>
