# vozix Domain Glossary

Core domain vocabulary and ubiquitous language for personal finance tracking in vozix.

## Language

### Schedules & Occurrences

**Recurring Schedule**:
A template defining financial parameters (amount, category, flow type, frequency, date boundaries) used to generate recurring transactions automatically over time.
_Avoid_: Recurring transaction, subscription, cron rule

**Occurrence**:
A concrete transaction produced from a recurring schedule representing a scheduled due date.
_Avoid_: Generated transaction, schedule instance, recurring item

**Schedule Status**:
The lifecycle state of a recurring schedule or financial window (`upcoming`, `active`, `expired`).

- `upcoming`: The schedule's start date has not yet arrived relative to current date.
- `active`: The schedule is within its active date window (startDate <= current date <= endDate or no endDate).
- `expired`: The schedule's end date has passed.
  _Avoid_: Inactive status, recurring status, active flag

### Currency & Valuation

**Base Currency**:
The system standard reference currency (USD) against which all exchange rates and currency conversions are pegged.
_Avoid_: Primary currency, default currency

**Exchange Rate**:
The relative conversion ratio between a foreign currency and the base currency for a specific UTC date.
_Avoid_: FX quote, currency price, conversion multiplier

**Rate Provider**:
An external source that supplies historical and current exchange rate data.
_Avoid_: Currency API, rate service

**Rate Synchronization**:
The process of fetching missing exchange rates from a rate provider, persisting them, and updating the missing rates queue.
_Avoid_: Rate scraping, FX polling, rate sync cron

**Nearest-Rate Interpolation**:
The heuristic algorithm that resolves the chronologically closest available exchange rate when an exact calendar date snapshot is missing.
_Avoid_: Rate fuzzy matching, date snapping, rate estimation

### Financial Valuation & Performance

**Financial Valuation**:
The point-in-time calculation of realized cash flows and progress percentages against a financial schedule (budget allocation or savings goal) across normalized date windows and currencies.
_Avoid_: Budget calculation, goal stats, spending analysis

**Rollup Health**:
A discrete domain classification of financial progress relative to target thresholds (`unstarted`, `on_track`, `warning`, `exceeded`).

- **Budgets (spending vs allocation)**:
  - `unstarted`: No converted outflow transactions in date window.
  - `on_track`: Spent < 75% of allocated amount.
  - `warning`: Spent 75% to < 100% of allocated amount.
  - `exceeded`: Spent >= 100% of allocated amount.
- **Goals (savings vs target)**:
  - `unstarted`: No converted inflow transactions in date window.
  - `on_track`: Accumulated >= 100% of target amount (target achieved / on track).
  - `warning`: Accumulated 75% to < 100% of target amount (approaching target).
  - `exceeded`: Accumulated < 75% of target amount (behind target).
    _Avoid_: Progress color, budget status, bar style
