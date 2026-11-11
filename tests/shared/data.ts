import { ObjectId } from "mongodb"

import type { CategoryType } from "@/lib/category"
import type { Currency } from "@/lib/currency"
import { localDateToUTCMidnight, normalizeToUTCMidnight } from "@/lib/date"
import { toDecimal128 } from "@/lib/db"
import type {
  Category,
  DBBudget,
  DBCategory,
  DBExchangeRate,
  DBGoal,
  DBRecurringTransaction,
  DBTransaction,
  DBUser,
  RecurringTransaction,
  Session,
  Transaction,
  User,
} from "@/lib/definitions"

export const mockDBUser: DBUser = {
  _id: new ObjectId("68f712e4cda4897217a05a1c"),
  name: "Test User",
  email: "testuser@gmail.com",
  emailVerified: true,
  image: undefined,
  createdAt: new Date("2025-09-19T11:27:41.038Z"),
  updatedAt: new Date("2025-09-19T12:50:48.129Z"),
  username: "testuser",
  displayUsername: "testuser",
  locale: "vi-VN",
  currency: "VND",
  twoFactorEnabled: false,
  banned: false,
  role: "user",
}

export const mockUser: User = {
  ...mockDBUser,
  id: mockDBUser._id.toString(),
}

export const mockSession: Session = {
  id: "session-1",
  userId: mockUser.id,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  token: "raw-secret-token-123",
  createdAt: new Date(),
  updatedAt: new Date(),
  ipAddress: "127.0.0.1",
  userAgent: "Mozilla/5.0 Test Browser",
}

export const mockDBAnotherUser: DBUser = {
  _id: new ObjectId("690d2cdc200d6a719f9a438e"),
  name: "Another User",
  email: "anotheruser@gmail.com",
  emailVerified: true,
  image: undefined,
  createdAt: new Date("2025-10-01T08:00:00.000Z"),
  updatedAt: new Date("2025-10-01T08:00:00.000Z"),
  username: "anotheruser",
  displayUsername: "anotheruser",
  locale: "en-US",
  currency: "USD",
  twoFactorEnabled: false,
  banned: false,
  role: "user",
}

export const mockAnotherUser: User = {
  ...mockDBAnotherUser,
  id: mockDBAnotherUser._id.toString(),
}

export const mockDBAdminUser: DBUser = {
  _id: new ObjectId("68f712e4cda4897217a05a99"),
  name: "Admin User",
  email: "admin@example.com",
  emailVerified: true,
  image: undefined,
  createdAt: new Date("2025-09-19T11:27:41.038Z"),
  updatedAt: new Date("2025-09-19T12:50:48.129Z"),
  username: "admin",
  displayUsername: "admin",
  locale: "en-US",
  currency: "USD",
  twoFactorEnabled: false,
  banned: false,
  role: "admin",
}

export const mockAdminUser: User = {
  ...mockDBAdminUser,
  id: mockDBAdminUser._id.toString(),
}

export const mockDBBannedUser: DBUser = {
  _id: new ObjectId("690d2cdc200d6a719f9a438f"),
  name: "Banned User",
  email: "banned@gmail.com",
  emailVerified: false,
  image: undefined,
  createdAt: new Date("2025-10-01T08:00:00.000Z"),
  updatedAt: new Date("2025-10-01T08:00:00.000Z"),
  username: "banneduser",
  displayUsername: "banneduser",
  locale: "en-US",
  currency: "USD",
  twoFactorEnabled: false,
  banned: true,
  banReason: "Spam activity",
  role: "user",
}

export const mockBannedUser: User = {
  ...mockDBBannedUser,
  id: mockDBBannedUser._id.toString(),
}

export const mockUsers: User[] = [
  mockUser,
  mockAnotherUser,
  mockAdminUser,
  mockBannedUser,
]

export const mockDBTransaction: DBTransaction = {
  _id: new ObjectId("68f73357357d93dcbaae8106"),
  userId: mockDBUser._id,
  type: "outflow" as CategoryType,
  categoryKey: "food_beverage",
  amount: toDecimal128("50000"),
  currency: "VND",
  description: "hamburger",
  date: localDateToUTCMidnight(new Date("2024-01-15")),
}

export const mockDBCustomCategory: DBCategory = {
  _id: new ObjectId("68f732914e63e5aa249cc173"),
  userId: mockDBUser._id,
  type: "outflow" as CategoryType,
  label: "Entertainment",
  description: "Movies and games",
}

export const mockDBBudget: DBBudget = {
  _id: new ObjectId("68f795d4bdcc3c9a30717988"),
  userId: mockDBUser._id,
  categoryKey: "food_beverage",
  allocatedAmount: toDecimal128("1000000"),
  currency: "VND",
  startDate: localDateToUTCMidnight(new Date("2024-01-01")),
  endDate: localDateToUTCMidnight(new Date("2024-01-31")),
}

export const mockDBGoal: DBGoal = {
  _id: new ObjectId("68f896e5cda4897217a05a2d"),
  userId: mockDBUser._id,
  categoryKey: "salary_bonus",
  name: "buy a motorbike",
  targetAmount: toDecimal128("50000000"),
  currency: "VND",
  startDate: localDateToUTCMidnight(new Date("2024-01-01")),
  endDate: localDateToUTCMidnight(new Date("2024-12-31")),
}

export const mockDBRecurringTransaction: DBRecurringTransaction = {
  _id: new ObjectId("68f896e5cda4897217a05a3e"),
  userId: mockDBUser._id,
  type: "inflow" as CategoryType,
  categoryKey: "salary_bonus",
  amount: toDecimal128("5000000"),
  currency: "VND",
  description: "Monthly Salary",
  frequency: "monthly",
  randomEveryXDays: undefined,
  startDate: localDateToUTCMidnight(new Date("2024-01-01")),
  endDate: localDateToUTCMidnight(new Date("2024-12-31")),
  lastGeneratedDate: undefined,
}

export const mockDBExchangeRates: DBExchangeRate[] = [
  {
    _id: new ObjectId("68f800001234567890abcde1"),
    date: normalizeToUTCMidnight(new Date("2024-01-15T23:59:59Z")),
    rates: {
      CNY: toDecimal128("7.0"),
      JPY: toDecimal128("150.0"),
      KRW: toDecimal128("1300.0"),
      VND: toDecimal128("25000.0"),
    },
  },
  {
    _id: new ObjectId("68f800001234567890abcde2"),
    date: normalizeToUTCMidnight(new Date("2024-01-25T23:59:59Z")),
    rates: {
      CNY: toDecimal128("7.1"),
      JPY: toDecimal128("151.0"),
      KRW: toDecimal128("1310.0"),
      VND: toDecimal128("25100.0"),
    },
  },
  {
    _id: new ObjectId("68f800001234567890abcde3"),
    date: normalizeToUTCMidnight(new Date("2024-02-20T23:59:59Z")),
    rates: {
      CNY: toDecimal128("7.2"),
      JPY: toDecimal128("152.0"),
      KRW: toDecimal128("1320.0"),
      VND: toDecimal128("25200.0"),
    },
  },
]

export const mockValidTransactionValues = {
  type: "inflow" as CategoryType,
  categoryKey: "business_freelance",
  currency: "VND" as Currency,
  amount: "2500000",
  description: "freelance project payment",
  date: localDateToUTCMidnight(new Date("2024-02-05")),
}

export const mockValidCategoryValues = {
  // categoryKey: auto generated
  type: "inflow" as CategoryType,
  label: "Salary",
  description: "Monthly job inflow",
}

export const mockValidBudgetValues = {
  categoryKey: "food_beverage",
  currency: "VND" as Currency,
  allocatedAmount: "1000000",
  startDate: localDateToUTCMidnight(new Date("2024-01-01")),
  endDate: localDateToUTCMidnight(new Date("2024-01-31")),
}

export const mockValidGoalValues = {
  categoryKey: "salary_bonus",
  currency: "VND" as Currency,
  name: "buy a motorbike",
  targetAmount: "50000000",
  startDate: localDateToUTCMidnight(new Date("2024-01-01")),
  endDate: localDateToUTCMidnight(new Date("2024-12-31")),
}

export const mockValidRecurringTransactionValues = {
  type: "inflow" as CategoryType,
  categoryKey: "business_freelance",
  currency: "VND" as Currency,
  amount: "2500000",
  description: "Freelance project payment",
  frequency: "monthly" as const,
  randomEveryXDays: undefined,
  startDate: localDateToUTCMidnight(new Date("2024-07-01")),
  endDate: localDateToUTCMidnight(new Date("2024-12-31")),
}

export const mockTransactions: Transaction[] = [
  {
    _id: "1",
    userId: "68f712e4cda4897217a05a1c",
    type: "inflow",
    amount: "1000",
    currency: "VND",
    description: "Salary",
    categoryKey: "salary_bonus",
    date: new Date("2024-01-15"),
  },
  {
    _id: "2",
    userId: "68f712e4cda4897217a05a1c",
    type: "outflow",
    amount: "200",
    currency: "VND",
    description: "Groceries",
    categoryKey: "food_beverage",
    date: new Date("2024-01-16"),
  },
  {
    _id: "3",
    userId: "68f712e4cda4897217a05a1c",
    type: "inflow",
    amount: "500",
    currency: "VND",
    description: "Freelance",
    categoryKey: "business_freelance",
    date: new Date("2024-01-20"),
  },
  {
    _id: "4",
    userId: "68f712e4cda4897217a05a1c",
    type: "outflow",
    amount: "100",
    currency: "VND",
    description: "Transport",
    categoryKey: "transportation",
    date: new Date("2024-01-22"),
  },
  {
    _id: "5",
    userId: "68f712e4cda4897217a05a1c",
    type: "outflow",
    amount: "300",
    currency: "VND",
    description: "Rent",
    categoryKey: "housing",
    date: new Date("2024-01-25"),
  },
  {
    _id: "6",
    userId: "68f712e4cda4897217a05a1c",
    type: "outflow",
    amount: "500000",
    currency: "VND",
    description: "Food outflow",
    categoryKey: "food_beverage",
    date: new Date("2024-02-15"),
  },
  {
    _id: "7",
    userId: "68f712e4cda4897217a05a1c",
    type: "outflow",
    amount: "400000",
    currency: "VND",
    description: "Transport outflow",
    categoryKey: "transportation",
    date: new Date("2024-03-20"),
  },
  {
    _id: "8",
    userId: "68f712e4cda4897217a05a1c",
    type: "outflow",
    amount: "2100000",
    currency: "VND",
    description: "Housing outflow",
    categoryKey: "housing",
    date: new Date("2024-04-10"),
  },
  {
    _id: "9",
    userId: "68f712e4cda4897217a05a1c",
    type: "inflow",
    amount: "1000000",
    currency: "VND",
    description: "Salary",
    categoryKey: "salary_bonus",
    date: new Date("2025-01-10"),
  },
]

export const mockCustomCategories: Category[] = [
  {
    _id: "1",
    userId: "68f712e4cda4897217a05a1c",
    type: "inflow",
    label: "Freelance Work",
    description: "Custom freelance category",
  },
  {
    _id: "2",
    userId: "68f712e4cda4897217a05a1c",
    type: "outflow",
    label: "Restaurant",
    description: "Custom food category",
  },
  {
    _id: "3",
    userId: "68f712e4cda4897217a05a1c",
    type: "outflow",
    label: "Taxi",
    description: "Custom transport category",
  },
]

export const mockRecurringTransactions: RecurringTransaction[] = [
  {
    _id: "1",
    userId: "68f712e4cda4897217a05a1c",
    type: "inflow",
    categoryKey: "salary_bonus",
    amount: "5000000",
    currency: "VND",
    description: "Monthly Salary",
    frequency: "monthly",
    randomEveryXDays: undefined,
    startDate: new Date("2024-01-01"),
    endDate: new Date("2024-12-31"),
    lastGeneratedDate: undefined,
  },
  {
    _id: "2",
    userId: "68f712e4cda4897217a05a1c",
    type: "outflow",
    categoryKey: "food_beverage",
    amount: "500000",
    currency: "VND",
    description: "Weekly Groceries",
    frequency: "weekly",
    randomEveryXDays: undefined,
    startDate: new Date("2024-01-15"),
    endDate: new Date("2024-06-30"),
    lastGeneratedDate: undefined,
  },
  {
    _id: "3",
    userId: "68f712e4cda4897217a05a1c",
    type: "outflow",
    categoryKey: "transportation",
    amount: "200000",
    currency: "VND",
    description: "Monthly Transport Pass",
    frequency: "monthly",
    startDate: new Date("2024-02-01"),
    endDate: undefined,
  },
  {
    _id: "4",
    userId: "68f712e4cda4897217a05a1c",
    type: "outflow",
    categoryKey: "housing",
    amount: "3000000",
    currency: "VND",
    description: "Rent Payment",
    frequency: "monthly",
    randomEveryXDays: undefined,
    startDate: new Date("2024-03-01"),
    endDate: new Date("2024-03-31"),
    lastGeneratedDate: undefined,
  },
  {
    _id: "5",
    userId: "68f712e4cda4897217a05a1c",
    type: "inflow",
    categoryKey: "business_freelance",
    amount: "2000000",
    currency: "VND",
    description: "Freelance Project",
    frequency: "bi-weekly",
    randomEveryXDays: undefined,
    startDate: new Date("2023-12-01"),
    endDate: new Date("2023-12-31"),
    lastGeneratedDate: undefined,
  },
  {
    _id: "6",
    userId: "68f712e4cda4897217a05a1c",
    type: "outflow",
    categoryKey: "food_beverage",
    amount: "100000",
    currency: "VND",
    description: "Daily Coffee",
    frequency: "daily",
    randomEveryXDays: undefined,
    startDate: new Date("2024-01-10"),
    endDate: new Date("2024-06-30"),
    lastGeneratedDate: undefined,
  },
  {
    _id: "7",
    userId: "68f712e4cda4897217a05a1c",
    type: "outflow",
    categoryKey: "transportation",
    amount: "50000",
    currency: "VND",
    description: "Random Taxi Rides",
    frequency: "random",
    randomEveryXDays: 3,
    startDate: new Date("2024-04-01"),
    endDate: undefined,
    lastGeneratedDate: undefined,
  },
  {
    _id: "8",
    userId: "68f712e4cda4897217a05a1c",
    type: "outflow",
    categoryKey: "housing",
    amount: "1000000",
    currency: "VND",
    description: "Winter cross-year heating",
    frequency: "monthly",
    randomEveryXDays: undefined,
    startDate: new Date("2023-11-01"),
    endDate: new Date("2024-06-30"),
    lastGeneratedDate: undefined,
  },
]
