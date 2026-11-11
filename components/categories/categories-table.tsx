"use client"

import { useState } from "react"
import { MoreVerticalIcon, TagIcon } from "lucide-react"
import { useExtracted } from "next-intl"

import { CategoryForm } from "@/components/categories/category-form"
import { DeleteCategory } from "@/components/categories/delete-category"
import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Category } from "@/lib/definitions"

interface CategoriesTableProps {
  filteredCategories: Category[]
  isTotalEmpty?: boolean
}

export function CategoriesTable({
  filteredCategories,
  isTotalEmpty,
}: CategoriesTableProps) {
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  )
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false)
  const t = useExtracted()

  return (
    <>
      <Card>
        <CardContent>
          {filteredCategories.length === 0 ? (
            <EmptyState
              icon={<TagIcon />}
              title={t("No categories found")}
              description={
                isTotalEmpty
                  ? t("You haven't created any custom categories yet.")
                  : t("No categories found matching your filters.")
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:text-center">
                  <TableHead>{t("Category Name")}</TableHead>
                  <TableHead>{t("Description")}</TableHead>
                  <TableHead>{t("Type")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCategories.map((category) => (
                  <TableRow key={category._id} className="[&>td]:text-center">
                    <TableCell className="min-w-38 wrap-anywhere whitespace-normal">
                      {category.label}
                    </TableCell>
                    <TableCell className="max-w-md min-w-52 wrap-anywhere whitespace-normal">
                      {category.description}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          category.type === "inflow"
                            ? "badge-green"
                            : "badge-red"
                        }
                      >
                        {category.type === "inflow"
                          ? t("Inflow")
                          : t("Outflow")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVerticalIcon />
                            <span className="sr-only">{t("Open menu")}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedCategory(category)
                              setIsEditOpen(true)
                            }}
                          >
                            {t("Edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => {
                              setSelectedCategory(category)
                              setIsDeleteOpen(true)
                            }}
                          >
                            {t("Delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedCategory && (
        <>
          <CategoryForm
            key={selectedCategory._id + "CategoryForm"}
            category={selectedCategory}
            isOpen={isEditOpen}
            setIsOpen={setIsEditOpen}
          />
          <DeleteCategory
            key={selectedCategory._id + "DeleteCategory"}
            categoryId={selectedCategory._id}
            isOpen={isDeleteOpen}
            setIsOpen={setIsDeleteOpen}
          />
        </>
      )}
    </>
  )
}
