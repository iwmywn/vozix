import type { NextRequest } from "next/server"

import { verifyCronAuth } from "@/lib/cron"
import { ensureExchangeRateForDate } from "@/lib/currency-engine"
import { processDueRecurringTransactions } from "@/lib/recurring-engine"

// Vercel Cron Jobs only trigger HTTP GET requests.
// [See official docs](https://vercel.com/docs/cron-jobs#how-cron-jobs-work)

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!verifyCronAuth(authHeader)) {
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    const summary = await processDueRecurringTransactions({
      onOccurrencesCreated: async (dates) => {
        await Promise.allSettled(dates.map((d) => ensureExchangeRateForDate(d)))
      },
    })

    const hasErrors = summary.errors.length > 0
    if (hasErrors) {
      console.error("RECURRING TRANSACTIONS CRON ERRORS:", summary.errors)
    }

    return Response.json(
      {
        success: !hasErrors,
        created: summary.createdCount,
        createdIds: summary.createdIds,
        skippedCount: summary.skippedCount,
        skippedReason: summary.skippedReason,
        errors: summary.errors,
        timestamp: summary.timestamp,
      },
      { status: hasErrors ? 500 : 200 }
    )
  } catch (error) {
    console.error("RECURRING TRANSACTIONS CRON ERROR:", error)
    return new Response("Recurring transactions cron failed", { status: 500 })
  }
}
