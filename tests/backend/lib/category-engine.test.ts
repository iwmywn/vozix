import { ObjectId } from "mongodb"

import {
  insertTestBudget,
  insertTestCategory,
  insertTestGoal,
  insertTestRecurringTransaction,
  insertTestTransaction,
} from "@/tests/backend/helpers/database"
import {
  mockDBAnotherUser,
  mockDBBudget,
  mockDBCustomCategory,
  mockDBGoal,
  mockDBRecurringTransaction,
  mockDBTransaction,
  mockDBUser,
} from "@/tests/shared/data"
import { CategoryEngine } from "@/lib/category-engine"
import { getCategoriesCollection } from "@/lib/collections"
import { withTransaction } from "@/lib/db"

describe("CategoryEngine", () => {
  describe("isValidCategory", () => {
    it("should return true for valid predefined categories with matching type", async () => {
      expect(
        await CategoryEngine.isValidCategory(
          mockDBUser._id.toString(),
          "salary_bonus",
          "inflow"
        )
      ).toBe(true)
      expect(
        await CategoryEngine.isValidCategory(
          mockDBUser._id.toString(),
          "food_beverage",
          "outflow"
        )
      ).toBe(true)
      expect(
        await CategoryEngine.isValidCategory(
          mockDBUser._id.toString(),
          "salary_bonus"
        )
      ).toBe(true)
    })

    it("should return false for predefined categories with mismatched type", async () => {
      expect(
        await CategoryEngine.isValidCategory(
          mockDBUser._id.toString(),
          "salary_bonus",
          "outflow"
        )
      ).toBe(false)
      expect(
        await CategoryEngine.isValidCategory(
          mockDBUser._id.toString(),
          "food_beverage",
          "inflow"
        )
      ).toBe(false)
    })

    it("should resolve predefined categories without database setup or valid ObjectId userId", async () => {
      expect(
        await CategoryEngine.isValidCategory(
          "non-object-id-user",
          "food_beverage"
        )
      ).toBe(true)
    })

    it("should return false for invalid format, uppercase predefined names, or non-existent key", async () => {
      expect(
        await CategoryEngine.isValidCategory(
          mockDBUser._id.toString(),
          "FOOD_BEVERAGE"
        )
      ).toBe(false)
      expect(
        await CategoryEngine.isValidCategory(
          mockDBUser._id.toString(),
          "non_existent_key"
        )
      ).toBe(false)
      expect(
        await CategoryEngine.isValidCategory(mockDBUser._id.toString(), "12345")
      ).toBe(false)
      expect(
        await CategoryEngine.isValidCategory(mockDBUser._id.toString(), "")
      ).toBe(false)
    })

    it("should return true for valid custom category matching user and type", async () => {
      await insertTestCategory(mockDBCustomCategory)
      expect(
        await CategoryEngine.isValidCategory(
          mockDBUser._id.toString(),
          mockDBCustomCategory._id.toString(),
          "outflow"
        )
      ).toBe(true)
      expect(
        await CategoryEngine.isValidCategory(
          mockDBUser._id.toString(),
          mockDBCustomCategory._id.toString()
        )
      ).toBe(true)
    })

    it("should return false for custom category owned by another user", async () => {
      await insertTestCategory({
        ...mockDBCustomCategory,
        userId: mockDBAnotherUser._id,
      })
      expect(
        await CategoryEngine.isValidCategory(
          mockDBUser._id.toString(),
          mockDBCustomCategory._id.toString()
        )
      ).toBe(false)
    })

    it("should return false for custom category with mismatched type", async () => {
      await insertTestCategory(mockDBCustomCategory)
      expect(
        await CategoryEngine.isValidCategory(
          mockDBUser._id.toString(),
          mockDBCustomCategory._id.toString(),
          "inflow"
        )
      ).toBe(false)
    })
  })

  describe("resolveCategory & getCategoryCatalog", () => {
    it("should resolve predefined category details", async () => {
      const resolved = await CategoryEngine.resolveCategory(
        mockDBUser._id.toString(),
        "salary_bonus"
      )
      expect(resolved).toEqual({
        key: "salary_bonus",
        type: "inflow",
        isPredefined: true,
      })
    })

    it("should resolve custom category details", async () => {
      await insertTestCategory(mockDBCustomCategory)
      const resolved = await CategoryEngine.resolveCategory(
        mockDBUser._id.toString(),
        mockDBCustomCategory._id.toString()
      )
      expect(resolved).toEqual({
        key: mockDBCustomCategory._id.toString(),
        label: mockDBCustomCategory.label,
        description: mockDBCustomCategory.description,
        type: mockDBCustomCategory.type,
        isPredefined: false,
      })
    })

    it("should return null for non-existent category key", async () => {
      expect(
        await CategoryEngine.resolveCategory(
          mockDBUser._id.toString(),
          "invalid_key"
        )
      ).toBeNull()
      expect(
        await CategoryEngine.resolveCategory(
          mockDBUser._id.toString(),
          new ObjectId().toString()
        )
      ).toBeNull()
    })

    it("should return unified category catalog with both predefined and custom categories", async () => {
      await insertTestCategory(mockDBCustomCategory)
      const catalog = await CategoryEngine.getCategoryCatalog(
        mockDBUser._id.toString()
      )

      expect(catalog.length).toBeGreaterThanOrEqual(20)
      const predefinedEntry = catalog.find((c) => c.key === "food_beverage")
      expect(predefinedEntry?.isPredefined).toBe(true)
      expect(predefinedEntry?.type).toBe("outflow")

      const customEntry = catalog.find(
        (c) => c.key === mockDBCustomCategory._id.toString()
      )
      expect(customEntry?.isPredefined).toBe(false)
      expect(customEntry?.label).toBe(mockDBCustomCategory.label)
    })
  })

  describe("getCategoryUsage", () => {
    it("should return inUse=false when no entities reference the category", async () => {
      const categoryId = new ObjectId().toString()
      const usage = await CategoryEngine.getCategoryUsage(
        mockDBUser._id.toString(),
        categoryId
      )

      expect(usage.inUse).toBe(false)
      expect(usage.transactionCount).toBe(0)
      expect(usage.budgetCount).toBe(0)
      expect(usage.goalCount).toBe(0)
      expect(usage.recurringTransactionCount).toBe(0)
    })

    it("should detect when transactions, budgets, goals, or recurring schedules reference the category", async () => {
      const cat1 = new ObjectId().toString()
      const cat2 = new ObjectId().toString()
      const cat3 = new ObjectId().toString()
      const cat4 = new ObjectId().toString()

      await Promise.all([
        insertTestTransaction({
          ...mockDBTransaction,
          categoryKey: cat1,
        }),
        insertTestBudget({
          ...mockDBBudget,
          categoryKey: cat2,
        }),
        insertTestGoal({
          ...mockDBGoal,
          categoryKey: cat3,
        }),
        insertTestRecurringTransaction({
          ...mockDBRecurringTransaction,
          categoryKey: cat4,
        }),
      ])

      const usage1 = await CategoryEngine.getCategoryUsage(
        mockDBUser._id.toString(),
        cat1
      )
      const usage2 = await CategoryEngine.getCategoryUsage(
        mockDBUser._id.toString(),
        cat2
      )
      const usage3 = await CategoryEngine.getCategoryUsage(
        mockDBUser._id.toString(),
        cat3
      )
      const usage4 = await CategoryEngine.getCategoryUsage(
        mockDBUser._id.toString(),
        cat4
      )

      expect(usage1.inUse).toBe(true)
      expect(usage1.transactionCount).toBe(1)

      expect(usage2.inUse).toBe(true)
      expect(usage2.budgetCount).toBe(1)

      expect(usage3.inUse).toBe(true)
      expect(usage3.goalCount).toBe(1)

      expect(usage4.inUse).toBe(true)
      expect(usage4.recurringTransactionCount).toBe(1)
    })
  })

  describe("createCustomCategory", () => {
    it("should insert a custom category with correct attributes", async () => {
      const { categoryId } = await CategoryEngine.createCustomCategory(
        mockDBUser._id.toString(),
        {
          type: "inflow",
          label: "Bonus Project",
          description: "Freelance bonus",
        }
      )

      expect(ObjectId.isValid(categoryId)).toBe(true)

      const categoriesCollection = await getCategoriesCollection()
      const doc = await categoriesCollection.findOne({
        _id: new ObjectId(categoryId),
      })

      expect(doc).not.toBeNull()
      expect(doc?.type).toBe("inflow")
      expect(doc?.label).toBe("Bonus Project")
      expect(doc?.description).toBe("Freelance bonus")
      expect(doc?.userId.toString()).toBe(mockDBUser._id.toString())
    })
  })

  describe("updateCustomCategory", () => {
    it("should update label and description when type matches", async () => {
      await insertTestCategory(mockDBCustomCategory)

      const result = await CategoryEngine.updateCustomCategory(
        mockDBUser._id.toString(),
        mockDBCustomCategory._id.toString(),
        {
          type: "outflow",
          label: "Updated Entertainment",
          description: "Updated description",
        }
      )

      expect(result.success).toBe(true)

      const categoriesCollection = await getCategoriesCollection()
      const updated = await categoriesCollection.findOne({
        _id: mockDBCustomCategory._id,
      })

      expect(updated?.label).toBe("Updated Entertainment")
      expect(updated?.description).toBe("Updated description")
    })

    it("should return type_immutable error when trying to alter category type", async () => {
      await insertTestCategory(mockDBCustomCategory)

      const result = await CategoryEngine.updateCustomCategory(
        mockDBUser._id.toString(),
        mockDBCustomCategory._id.toString(),
        {
          type: "inflow",
          label: "Mismatched",
          description: "Trying to switch to inflow",
        }
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe("type_immutable")
    })

    it("should return not_found when category belongs to another user", async () => {
      await insertTestCategory(mockDBCustomCategory)

      const result = await CategoryEngine.updateCustomCategory(
        mockDBAnotherUser._id.toString(),
        mockDBCustomCategory._id.toString(),
        {
          type: "outflow",
          label: "Hijack Attempt",
          description: "Should fail",
        }
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe("not_found")
    })
  })

  describe("deleteCustomCategory", () => {
    it("should return not_found for invalid or non-existent category id", async () => {
      const invalidResult = await CategoryEngine.deleteCustomCategory(
        mockDBUser._id.toString(),
        "invalid-id"
      )
      expect(invalidResult.success).toBe(false)
      expect(invalidResult.error).toBe("not_found")

      const nonExistentResult = await CategoryEngine.deleteCustomCategory(
        mockDBUser._id.toString(),
        new ObjectId().toString()
      )
      expect(nonExistentResult.success).toBe(false)
      expect(nonExistentResult.error).toBe("not_found")
    })

    it("should prevent deletion when category is referenced by transactions", async () => {
      await insertTestCategory(mockDBCustomCategory)
      await insertTestTransaction({
        ...mockDBTransaction,
        categoryKey: mockDBCustomCategory._id.toString(),
      })

      const result = await CategoryEngine.deleteCustomCategory(
        mockDBUser._id.toString(),
        mockDBCustomCategory._id.toString()
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe("in_use")
      if (result.error === "in_use") {
        expect(result.blockingEntity).toBe("transactions")
        expect(result.blockingCount).toBe(1)
      }
    })

    it("should prevent deletion when category is referenced by budgets", async () => {
      const category = {
        ...mockDBCustomCategory,
        _id: new ObjectId("691ac8c4fb168bfba59615c8"),
      }
      await insertTestCategory(category)
      await insertTestBudget({
        ...mockDBBudget,
        categoryKey: category._id.toString(),
      })

      const result = await CategoryEngine.deleteCustomCategory(
        mockDBUser._id.toString(),
        category._id.toString()
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe("in_use")
      if (result.error === "in_use") {
        expect(result.blockingEntity).toBe("budgets")
        expect(result.blockingCount).toBe(1)
      }
    })

    it("should prevent deletion when category is referenced by goals", async () => {
      const category = {
        ...mockDBCustomCategory,
        _id: new ObjectId("691ac8cd3cf60fa9f018a37c"),
      }
      await insertTestCategory(category)
      await insertTestGoal({
        ...mockDBGoal,
        categoryKey: category._id.toString(),
      })

      const result = await CategoryEngine.deleteCustomCategory(
        mockDBUser._id.toString(),
        category._id.toString()
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe("in_use")
      if (result.error === "in_use") {
        expect(result.blockingEntity).toBe("goals")
        expect(result.blockingCount).toBe(1)
      }
    })

    it("should prevent deletion when category is referenced by recurring transactions", async () => {
      const category = {
        ...mockDBCustomCategory,
        _id: new ObjectId("691da72dc1d54fad20174ab6"),
      }
      await insertTestCategory(category)
      await insertTestRecurringTransaction({
        ...mockDBRecurringTransaction,
        categoryKey: category._id.toString(),
      })

      const result = await CategoryEngine.deleteCustomCategory(
        mockDBUser._id.toString(),
        category._id.toString()
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe("in_use")
      if (result.error === "in_use") {
        expect(result.blockingEntity).toBe("recurringTransactions")
        expect(result.blockingCount).toBe(1)
      }
    })

    it("should prevent deletion when category is referenced with uppercase categoryKey in transactions", async () => {
      const category = {
        ...mockDBCustomCategory,
        _id: new ObjectId("691da72dc1d54fad20174ab7"),
      }
      await insertTestCategory(category)
      await insertTestTransaction({
        ...mockDBTransaction,
        categoryKey: category._id.toString().toUpperCase(),
      })

      const result = await CategoryEngine.deleteCustomCategory(
        mockDBUser._id.toString(),
        category._id.toString()
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe("in_use")
      if (result.error === "in_use") {
        expect(result.blockingEntity).toBe("transactions")
        expect(result.blockingCount).toBe(1)
      }
    })

    it("should successfully delete an unreferenced custom category atomically", async () => {
      await insertTestCategory(mockDBCustomCategory)

      const result = await CategoryEngine.deleteCustomCategory(
        mockDBUser._id.toString(),
        mockDBCustomCategory._id.toString()
      )

      expect(result.success).toBe(true)

      const categoriesCollection = await getCategoriesCollection()
      const deletedDoc = await categoriesCollection.findOne({
        _id: mockDBCustomCategory._id,
      })

      expect(deletedDoc).toBeNull()
    })

    it("should successfully execute deletion within a supplied transaction session", async () => {
      await insertTestCategory(mockDBCustomCategory)

      const result = await withTransaction(async (dbSession) => {
        return CategoryEngine.deleteCustomCategory(
          mockDBUser._id.toString(),
          mockDBCustomCategory._id.toString(),
          dbSession
        )
      })

      expect(result.success).toBe(true)

      const categoriesCollection = await getCategoriesCollection()
      const deletedDoc = await categoriesCollection.findOne({
        _id: mockDBCustomCategory._id,
      })

      expect(deletedDoc).toBeNull()
    })
  })

  describe("getCachedCustomCategories", () => {
    it("should return all custom categories mapped with string ids", async () => {
      await insertTestCategory(mockDBCustomCategory)

      const categories = await CategoryEngine.getCachedCustomCategories(
        mockDBUser._id.toString()
      )

      expect(categories.length).toBeGreaterThanOrEqual(1)
      const found = categories.find(
        (c) => c._id === mockDBCustomCategory._id.toString()
      )
      expect(found).toBeDefined()
      expect(found?.label).toBe(mockDBCustomCategory.label)
      expect(typeof found?._id).toBe("string")
      expect(typeof found?.userId).toBe("string")
    })
  })
})
