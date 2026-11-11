import { ObjectId } from "mongodb"
import { z } from "zod"

import {
  mockAuthenticatedAdmin,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from "@/tests/backend/mocks/session.mock"
import { mockUser } from "@/tests/shared/data"
import { resolveResourceTag, runDomainMutation } from "@/lib/action-handler"
import { triggerRateLimit } from "@/lib/rate-limit"

// Mock next/cache
const mockUpdateTag = vi.fn()
vi.mock("next/cache", () => ({
  updateTag: (tag: string) => mockUpdateTag(tag),
  cacheTag: vi.fn(),
}))

// Mock next/server after
const mockAfter = vi.fn((fn: () => Promise<void>) => fn())
vi.mock("next/server", () => ({
  after: (fn: () => Promise<void>) => mockAfter(fn),
}))

// Mock category check
const mockIsValidCategory = vi.fn()
vi.mock("@/lib/category-engine", () => ({
  CategoryEngine: {
    isValidCategory: (...args: unknown[]) => mockIsValidCategory(...args),
  },
  isValidCategory: (...args: unknown[]) => mockIsValidCategory(...args),
}))

describe("runDomainMutation Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticatedUser()
    mockIsValidCategory.mockResolvedValue(true)
  })

  describe("resolveResourceTag", () => {
    it("should resolve standard domain resources to user tags", () => {
      expect(resolveResourceTag("transactions", "u1")).toBe("transactions-u1")
      expect(resolveResourceTag("budgets", "u1")).toBe("budgets-u1")
      expect(resolveResourceTag("goals", "u1")).toBe("goals-u1")
      expect(resolveResourceTag("categories", "u1")).toBe("categories-u1")
      expect(resolveResourceTag("recurring", "u1")).toBe(
        "recurringTransactions-u1"
      )
      expect(resolveResourceTag("recurringTransactions", "u1")).toBe(
        "recurringTransactions-u1"
      )
      expect(resolveResourceTag("admin", "u1")).toBe("admin-users")
      expect(resolveResourceTag("custom-tag", "u1")).toBe("custom-tag")
    })
  })

  describe("validateId", () => {
    it("should reject invalid MongoDB ObjectId before schema parsing", async () => {
      const result = await runDomainMutation({
        rawInput: "not-an-object-id",
        validateId: {
          id: "not-an-object-id",
          message: "Invalid budget ID!",
        },
        rateLimit: { domain: "test", preset: "NORMAL" },
        successMessage: "Success",
        execute: vi.fn(),
      })

      expect(result.error).toBe("Invalid budget ID!")
      expect(result.success).toBeUndefined()
    })

    it("should accept validateId as string shorthand and fallback to default message", async () => {
      const result = await runDomainMutation({
        rawInput: {},
        validateId: "not-an-id",
        rateLimit: { domain: "test", preset: "NORMAL" },
        execute: vi.fn(),
      })

      expect(result.error).toBe("Invalid ID!")
    })

    it("should proceed when ObjectId is valid", async () => {
      const validId = new ObjectId().toString()
      const mockExec = vi.fn().mockResolvedValue(undefined)

      const result = await runDomainMutation({
        rawInput: validId,
        validateId: { id: validId },
        rateLimit: { domain: "test", preset: "NORMAL" },
        successMessage: "Created",
        execute: mockExec,
      })

      expect(result.success).toBe("Created")
      expect(mockExec).toHaveBeenCalled()
    })
  })

  describe("Schema Validation", () => {
    it("should reject input when schema validation fails", async () => {
      const schema = z.object({ amount: z.number().positive() })
      const result = await runDomainMutation({
        rawInput: { amount: -5 },
        schema: () => schema,
        rateLimit: { domain: "test", preset: "NORMAL" },
        successMessage: "Success",
        execute: vi.fn(),
      })

      expect(result.error).toBe("Invalid data!")
    })

    it("should pass validated input to execute handler", async () => {
      const schema = z.object({ id: z.string(), label: z.string().min(2) })
      const mockExec = vi.fn().mockResolvedValue(undefined)

      const result = await runDomainMutation({
        rawInput: { id: "123", label: "Food" },
        schema: () => schema,
        rateLimit: { domain: "test", preset: "NORMAL" },
        successMessage: "Updated",
        execute: mockExec,
      })

      expect(result.success).toBe("Updated")
      expect(mockExec).toHaveBeenCalledWith(
        expect.objectContaining({ input: { id: "123", label: "Food" } })
      )
    })
  })

  describe("Session & Admin Authorization", () => {
    it("should return access denied error when unauthenticated", async () => {
      mockUnauthenticatedUser()

      const result = await runDomainMutation({
        rawInput: {},
        rateLimit: { domain: "test", preset: "NORMAL" },
        successMessage: "Success",
        execute: vi.fn(),
      })

      expect(result.error).toBe(
        "Access denied! Please refresh the page and try again."
      )
    })

    it("should return access denied when admin role is required but user is normal", async () => {
      mockAuthenticatedUser() // regular user, not admin

      const result = await runDomainMutation({
        rawInput: {},
        requireAdmin: true,
        rateLimit: { domain: "test", preset: "NORMAL" },
        successMessage: "Success",
        execute: vi.fn(),
      })

      expect(result.error).toBe("Access denied! Admin privileges required.")
    })

    it("should allow execution when admin role is required and user is admin", async () => {
      mockAuthenticatedAdmin()

      const mockExec = vi.fn().mockResolvedValue(undefined)
      const result = await runDomainMutation({
        rawInput: {},
        requireAdmin: true,
        rateLimit: { domain: "test", preset: "NORMAL" },
        successMessage: "Admin Success",
        execute: mockExec,
      })

      expect(result.success).toBe("Admin Success")
      expect(mockExec).toHaveBeenCalled()
    })
  })

  describe("Rate Limiting", () => {
    it("should return rate limit error when limit is exceeded", async () => {
      mockAuthenticatedUser()
      await triggerRateLimit(`rate-test:${mockUser.id}`)

      const result = await runDomainMutation({
        rawInput: {},
        rateLimit: { domain: "rate-test", preset: "NORMAL" },
        successMessage: "Success",
        execute: vi.fn(),
      })

      expect(result.error).toBe(
        "Too many requests! Please slow down and try again later."
      )
    })
  })

  describe("Category Integrity Check", () => {
    it("should reject when categoryCheck returns invalid category", async () => {
      mockIsValidCategory.mockResolvedValue(false)

      const result = await runDomainMutation({
        rawInput: { categoryKey: "unknown" },
        categoryCheck: (input: { categoryKey: string }) => ({
          key: input.categoryKey,
          expectedType: "outflow",
        }),
        rateLimit: { domain: "cat-test", preset: "NORMAL" },
        successMessage: "Success",
        execute: vi.fn(),
      })

      expect(result.error).toBe("Invalid category!")
    })
  })

  describe("Execution & Invalidation & Background Tasks", () => {
    it("should invalidate specified cache tags on successful execution", async () => {
      const result = await runDomainMutation({
        rawInput: {},
        revalidate: ["budgets", "transactions"],
        rateLimit: { domain: "exec-test", preset: "NORMAL" },
        successMessage: "Budget created.",
        execute: vi.fn().mockResolvedValue(undefined),
      })

      expect(result.success).toBe("Budget created.")
      expect(mockUpdateTag).toHaveBeenCalledWith(`budgets-${mockUser.id}`)
      expect(mockUpdateTag).toHaveBeenCalledWith(`transactions-${mockUser.id}`)
    })

    it("should return explicit error if execute returns error object", async () => {
      const result = await runDomainMutation({
        rawInput: {},
        rateLimit: { domain: "exec-test", preset: "NORMAL" },
        successMessage: "Success",
        execute: async () => ({ error: "Custom domain validation failed." }),
      })

      expect(result.error).toBe("Custom domain validation failed.")
      expect(result.success).toBeUndefined()
      expect(mockUpdateTag).not.toHaveBeenCalled()
    })

    it("should trigger onSuccessAfter hook in next/server after()", async () => {
      const mockAfterHook = vi.fn().mockResolvedValue(undefined)

      const result = await runDomainMutation({
        rawInput: {},
        onSuccessAfter: mockAfterHook,
        rateLimit: { domain: "exec-test", preset: "NORMAL" },
        successMessage: "Success",
        execute: vi.fn().mockResolvedValue(undefined),
      })

      expect(result.success).toBe("Success")
      expect(mockAfter).toHaveBeenCalled()
      expect(mockAfterHook).toHaveBeenCalled()
    })

    it("should map duplicate key Mongo errors", async () => {
      const duplicateError = new Error("E11000 duplicate key error")
      // @ts-expect-error - simulating MongoServerError
      duplicateError.code = 11000
      Object.setPrototypeOf(
        duplicateError,
        (await import("mongodb")).MongoServerError.prototype
      )

      const result = await runDomainMutation({
        rawInput: {},
        duplicateKeyMessage: "This schedule already exists!",
        rateLimit: { domain: "exec-test", preset: "NORMAL" },
        successMessage: "Success",
        execute: vi.fn().mockRejectedValue(duplicateError),
      })

      expect(result.error).toBe("This schedule already exists!")
    })

    it("should return default translated messages when messages are omitted", async () => {
      // Test default success message
      const successResult = await runDomainMutation({
        rawInput: {},
        rateLimit: { domain: "exec-test", preset: "NORMAL" },
        execute: vi.fn().mockResolvedValue(undefined),
      })
      expect(successResult.success).toBe("Operation completed successfully.")

      // Test default duplicate key message
      const duplicateError = new Error("E11000 duplicate key error")
      // @ts-expect-error - simulating MongoServerError
      duplicateError.code = 11000
      Object.setPrototypeOf(
        duplicateError,
        (await import("mongodb")).MongoServerError.prototype
      )

      const duplicateResult = await runDomainMutation({
        rawInput: {},
        rateLimit: { domain: "exec-test", preset: "NORMAL" },
        execute: vi.fn().mockRejectedValue(duplicateError),
      })
      expect(duplicateResult.error).toBe("This item already exists!")

      // Test default fallback error message
      const genericError = new Error("Something went wrong")
      const fallbackResult = await runDomainMutation({
        rawInput: {},
        rateLimit: { domain: "exec-test", preset: "NORMAL" },
        execute: vi.fn().mockRejectedValue(genericError),
      })
      expect(fallbackResult.error).toBe(
        "Failed to complete action! Please try again later."
      )
    })

    it("should resolve configured validation, success, duplicate-key, and fallback messages when provided", async () => {
      // Configured validation message via validateId
      const invalidResult = await runDomainMutation({
        rawInput: "bad-id",
        validateId: {
          id: "bad-id",
          message: "Invalid budget ID!",
        },
        rateLimit: { domain: "exec-test", preset: "NORMAL" },
        execute: vi.fn(),
      })
      expect(invalidResult.error).toBe("Invalid budget ID!")

      // Configured success message resolver
      const successRes = await runDomainMutation({
        rawInput: {},
        rateLimit: { domain: "exec-test", preset: "NORMAL" },
        successMessage: "Custom success message",
        execute: vi.fn().mockResolvedValue(undefined),
      })
      expect(successRes.success).toBe("Custom success message")

      // Configured duplicate key message resolver
      const duplicateError = new Error("E11000 duplicate key error")
      // @ts-expect-error - simulating MongoServerError
      duplicateError.code = 11000
      Object.setPrototypeOf(
        duplicateError,
        (await import("mongodb")).MongoServerError.prototype
      )
      const duplicateRes = await runDomainMutation({
        rawInput: {},
        rateLimit: { domain: "exec-test", preset: "NORMAL" },
        duplicateKeyMessage: "Custom duplicate message",
        execute: vi.fn().mockRejectedValue(duplicateError),
      })
      expect(duplicateRes.error).toBe("Custom duplicate message")

      // Configured fallback error message resolver
      const genericError = new Error("Generic failure")
      const fallbackRes = await runDomainMutation({
        rawInput: {},
        rateLimit: { domain: "exec-test", preset: "NORMAL" },
        fallbackErrorMessage: "Custom fallback error",
        execute: vi.fn().mockRejectedValue(genericError),
      })
      expect(fallbackRes.error).toBe("Custom fallback error")
    })

    it("should provide ActionContext without t to execute callback", async () => {
      let receivedCtx: unknown
      await runDomainMutation({
        rawInput: {},
        rateLimit: { domain: "exec-test", preset: "NORMAL" },
        execute: async (ctx) => {
          receivedCtx = ctx
        },
      })

      expect(receivedCtx).toHaveProperty("input")
      expect(receivedCtx).toHaveProperty("user")
      expect(receivedCtx).toHaveProperty("session")
      expect(receivedCtx).not.toHaveProperty("t")
    })
  })
})
