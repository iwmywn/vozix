"use client"

import { useTransition } from "react"
import { DownloadIcon } from "lucide-react"
import { useExtracted } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCategory } from "@/hooks/use-category"
import { useFormatDate } from "@/hooks/use-format-date"
import type { Transaction } from "@/lib/definitions"
import { buildTransactionsCSVExport } from "@/lib/filters"

interface ExportButtonProps {
  filteredTransactions: Transaction[]
}

export function ExportButton({ filteredTransactions }: ExportButtonProps) {
  const [isPending, startTransition] = useTransition()
  const t = useExtracted()
  const formatDate = useFormatDate()
  const { getCategoryLabel } = useCategory()

  function handleExport() {
    if (filteredTransactions.length === 0) {
      toast.error(t("No transactions found"))
      return
    }

    startTransition(() => {
      try {
        const { csvContent, filename } = buildTransactionsCSVExport(
          filteredTransactions,
          {
            labels: {
              headers: {
                date: t("Date"),
                type: t("Type"),
                category: t("Category"),
                amount: t("Amount"),
                currency: t("Currency"),
                originalAmount: t("Original Amount"),
                originalCurrency: t("Original Currency"),
                description: t("Description"),
              },
              inflow: t("Inflow"),
              outflow: t("Outflow"),
              from: t("From"),
              to: t("To"),
              filenamePrefix: t("transactions"),
            },
            formatDate,
            getCategoryLabel,
          }
        )

        // Add UTF-8 BOM for proper encoding in Excel
        const BOM = "\uFEFF"
        const blob = new Blob([BOM + csvContent], {
          type: "text/csv;charset=utf-8;",
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        toast.success(t("Export Transactions (CSV)") + " " + filename)
      } catch (error) {
        console.error("Error exporting CSV:", error)
        toast.error(t("Failed to export data! Please try again later."))
      }
    })
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleExport}
          disabled={isPending}
        >
          {isPending ? <Spinner /> : <DownloadIcon />}
          <span className="sr-only">
            {t("Export transactions with current filters applied.")}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {t("Export transactions with current filters applied.")}
      </TooltipContent>
    </Tooltip>
  )
}
