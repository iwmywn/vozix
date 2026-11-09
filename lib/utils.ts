import type { Route } from "next"
import Decimal from "decimal.js"
import MiniSearch from "minisearch"

import type { ScheduleStatus } from "@/lib/definitions"
import type { RollupHealth } from "@/lib/valuation-engine"
import { DEFAULT_SIGNIN_REDIRECT } from "@/routes"

export function searchWithMiniSearch<T extends Record<string, unknown>>(
  documents: T[],
  searchTerm: string,
  fields: string[],
  idField: string = "_id"
): Set<string> {
  const normalizedSearchTerm = searchTerm.trim()

  if (!normalizedSearchTerm) {
    return new Set(documents.map((doc) => String(doc[idField])))
  }

  const miniSearch = new MiniSearch({
    idField,
    fields,
    storeFields: [idField],
    searchOptions: {
      prefix: true,
      combineWith: "AND",
    },
  })

  miniSearch.addAll(documents)

  const results = miniSearch.search(normalizedSearchTerm)

  return new Set(results.map((result) => String(result[idField])))
}

export function getRollupHealthClass(health: RollupHealth): string {
  switch (health) {
    case "unstarted":
      return "progress-gray"
    case "on_track":
      return "progress-green"
    case "warning":
      return "progress-yellow"
    case "exceeded":
      return "progress-red"
  }
}

export function getScheduleStatusClass(status: ScheduleStatus): string {
  switch (status) {
    case "expired":
      return "badge-red"
    case "active":
      return "badge-green"
    case "upcoming":
      return "badge-yellow"
  }
}

export function getFlowColorClass(
  type?: "inflow" | "outflow" | string | null
): string {
  if (type === "inflow") return "text-green"
  if (type === "outflow") return "text-red"
  return ""
}

export function getBalanceColorClass(balance?: Decimal.Value | null): string {
  if (balance === undefined || balance === null || balance === "") return ""
  try {
    const dec = new Decimal(balance)
    if (dec.greaterThan(0)) return "text-green"
    if (dec.lessThan(0)) return "text-red"
  } catch {
    return ""
  }
  return ""
}

export function getSafeCallbackUrl(
  url: string | null | undefined,
  fallback: Route = DEFAULT_SIGNIN_REDIRECT
): Route {
  if (!url) return fallback

  if (
    url.startsWith("/") &&
    !url.startsWith("//") &&
    !url.includes("\\") &&
    !url.includes(":")
  ) {
    return url as Route
  }

  return fallback
}

export function isUserBanned(
  user:
    | {
        banned?: boolean | null
        banExpires?: Date | string | number | null
      }
    | null
    | undefined,
  now: Date = new Date()
): boolean {
  if (!user || !user.banned) return false
  if (!user.banExpires) return true
  const expireTime = new Date(user.banExpires).getTime()
  if (Number.isNaN(expireTime)) return true
  return expireTime > now.getTime()
}
