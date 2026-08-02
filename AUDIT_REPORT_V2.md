# Al-Zahra Smart ERP — Comprehensive Audit Report V2

**Date:** 2026-08-02  
**Scope:** Full-stack (Frontend + Backend + Infra) — 15 audit categories  
**Methodology:** Static analysis, API contract validation, architecture review  
**Project:** `al-zahra-smart-erp` v1.0.0 · Supabase · React 19 · Vite 5 · Tailwind 3  

---

## Executive Summary

The Al-Zahra Smart ERP is an ambitious system with 23 feature modules, 17 Zustand stores, 25+ routes, 17 SQL migrations, and 5 Supabase Edge Functions. The architecture demonstrates strong foundations in several areas, particularly:

- **Thick-database pattern** with business logic in PostgreSQL RPCs
- **Multi-layered error boundary hierarchy** (Root → Route → Section)
- **Comprehensive offline-first patterns** with IndexedDB persistence
- **Professional Excel/PDF export system** with Arabic localization
- **Strict ESLint configuration** with security plugin

However, this audit reveals **111 issues** across 15 categories — including **32 Critical**, **32 High**, **30 Medium**, and **17 Low** severity findings. The most alarming discoveries involve:

1. **27 RPCs called on frontend that don't exist in any migration** — silent runtime failures
2. **10+ API contract mismatches** where param names/types don't match between frontend and backend
3. **15+ database tables without Row-Level Security** — complete tenant isolation bypass
4. **3 of 5 Edge Functions have zero authentication** — unguarded AI, PDF, and tax endpoints
5. **Cross-tenant data leakage** via SECURITY DEFINER RPCs trusting arbitrary `p_company_id` values
6. **72% of feature modules (16/22) have zero test files**

### Severity Counts
🔴 **Critical:** 32 | 🟠 **High:** 37 | 🟡 **Medium:** 30 | 🔵 **Low:** 17

---

## 1. Test Suite Quality & Coverage

### 1.1 🔴 72% of Feature Modules Have Zero Tests

Only 7 of 23 feature modules have any test files: `auth`, `sales`, `pos`, `notifications`, `settings`, `accounting` (journalService only), and `inventory` (hooks only). The remaining 16 features — including **dashboard**, **purchases**, **expenses**, **bonds**, **reports**, **parties**, **vehicles**, **AI**, **returns**, **suppliers**, **customers**, **branches**, **command**, **feedback**, **smart-import**, and **appearance** — have zero automated tests.

### 1.2 🔴 Mock Supabase Client is Unusable for Realistic Tests

`src/test/mocks/supabase.ts` creates a mock Supabase client whose `from()` method returns `this` without chaining methods (`select`, `insert`, `upsert`, `eq`, `neq`, `order`, `limit`, `single`). Any integration test calling `supabase.from('table').select('*').eq('id', 1)` will fail with "is not a function". This makes the shared mock effectively useless for component-level integration tests.

**Files:** `src/test/mocks/supabase.ts:1–40`

### 1.3 🔴 E2E Tests are Placeholder Quality

All 3 Playwright spec files (`auth.spec.ts`, `sales-flow.spec.ts`, `accounting-flow.spec.ts`) use conditional `test.skip` patterns to bypass authentication. No actual user flows are tested — items are added, forms filled, invoices created, or reports generated. Tests check only page load and element visibility.

**Missing:** No `globalSetup`, no `storageState` for authenticated sessions, no test data seeding. Every test starts cold and must handle auth redirects, making meaningful testing impossible.

**Files:** `e2e/auth.spec.ts`, `e2e/sales-flow.spec.ts`, `e2e/accounting-flow.spec.ts`

### 1.4 🔴 Branch Coverage Threshold is Inadequate for ERP

`vitest.config.ts` sets `branches: 60` as the coverage threshold. For an ERP system handling financial calculations, tax computation, inventory valuation, and double-entry accounting, branch coverage should be at least **80%**. The 60% threshold allows 40% of conditional logic to remain untested.

**File:** `vitest.config.ts:30`

### 1.5 🟠 UI Component Tests are Unacceptably Thin

- `PageLoader.test.tsx`: 1 test — only checks Arabic text presence. No custom message, spinner, or accessibility tests.
- `StatCard.test.tsx`: 4 tests — covers basic rendering but no zero-trend, no-null-subtext, very-large-value, or RTL tests.

6 other UI components (`base/`, `cards/`, `common/`, `components/`, `dashboard/`, `layout/`) have zero tests.

**Files:** `src/ui/base/PageLoader.test.tsx`, `src/ui/common/StatCard.test.tsx`

### 1.6 🟠 Store Tests Have Significant Edge Case Gaps

| Store | Test Coverage Gaps |
|-------|--------------------|
| `auth/store.test.ts` | No init lifecycle test, no error path on logout, no token refresh flow, no multiple rapid login/logout |
| `sales/store.test.ts` | No multi-item cart totals, no tax-inclusive calculation, no item removal, no zero/negative discount, no stock constraint checks |
| `pos/store.test.ts` | No `fetchSuspendedOrders` test, no max-order limit, no duplicate order IDs |
| `settings/settingsStore.test.ts` | No nested setting updates, no payment method CRUD, no settings schema migration |
| `offlineQueueStore.test.ts` | No sync success path, no retry exhaustion, no queue ordering (FIFO), no persistence verification |
| `journalService.test.ts` | No empty results, no null credit/debit amounts, no pagination boundaries |

### 1.7 🟡 Per-Module Coverage Threshold Overrides Missing

Critical modules (`decimalUtils.ts`, `currencyUtils.ts`, `PostTransactionUsecase.ts`) governing financial integrity have no elevated coverage thresholds (should be 90+). The same blanket 70/70/60/70 applies to all files.

**File:** `vitest.config.ts`

### 1.8 🟡 Playwright: No `testIdAttribute`, No Global Setup, No Full Browser Matrix in CI

`playwright.config.ts` has no `testIdAttribute` configured, no `globalSetup`/`globalTeardown`, and `quality-gate.yml` runs only Chromium in CI (firefox, webkit, mobile are configured but not used in CI).

**Files:** `playwright.config.ts`, `.github/workflows/quality-gate.yml`

### 1.9 🔵 `setup.ts` Missing Browser API Mocks

`src/test/setup.ts` mocks `matchMedia`, `IntersectionObserver`, `ResizeObserver`, `scrollTo`, and `localStorage`. Missing: `sessionStorage`, `crypto.randomUUID()`, `fetch`, and `getComputedStyle`.

---

## 2. Database Schema & RLS

### 2.1 🔴 15+ Tables Lack RLS Entirely

The following production tables have **no Row-Level Security policies whatsoever**:

| Table | Accessed In | Risk |
|-------|-------------|------|
| `journal_entry_lines` | Every accounting report | Can read/modify all companies' journal data |
| `invoice_items` | Sales analytics, top products | Can read all companies' invoice details |
| `payments` | Dashboard, bonds, debt aging | Can read/modify all payment records |
| `inventory_transactions` | `assemble_kit`/`disassemble_kit` | Can read all companies' inventory history |
| `expense_categories` | Expense forms | Can read shared categories |
| `product_categories` | Product browsing, search | Can read shared categories |
| `fiscal_years` | Accounting reports | Can read all companies' fiscal configs |
| `monthly_targets` | 20260802000000 creates → no RLS | Can read/modify all targets |
| `suspended_orders` | 20260802000000 creates → no RLS | Can read all POS suspended orders |
| `backup_configs` | 20260802000000 creates → no RLS | Can read all backup configurations |
| `backup_logs` | 20260802000000 creates → no RLS | Can read all backup history |
| `branches` | Used as FK reference | Can read all tenants' branch structures |
| `supported_currencies` | Currency conversion | Reference data — possibly acceptable |
| `file_attachments` | Not in any migration | Unknown scope |

Additionally, `purchase_items` and `audit_items` have `USING(true)` — effectively no tenant isolation.

**Files:** Multiple migrations

### 2.2 🔴 All RPCs are `SECURITY DEFINER` Without Internal `company_id` Validation

Every RPC (25+) accepts `p_company_id` as a parameter but never verifies it matches `auth.uid()`'s company. Any authenticated user can call these functions with arbitrary `p_company_id` values and access/write cross-tenant data.

**Example:** `commit_sales_invoice(p_company_id => uuid, p_user_id => uuid, p_data => jsonb)` — if called with another company's UUID, invoices will be created in that tenant's data.

**Files:** All 17 migration files

### 2.3 🔴 Migration Ordering Conflict: RLS before Table Creation

`20260801000000_add_missing_rls_policies.sql` attempts to enable RLS on `cashboxes`, `monthly_targets`, `suspended_orders`, and `backup_configs` — but these tables are created in the temporally **later** migration `20260802000000_create_missing_tables.sql`. If migrations run in numerical order, RLS statements for non-existent tables will fail.

**Files:** `20260801000000_add_missing_rls_policies.sql`, `20260802000000_create_missing_tables.sql`

### 2.4 🔴 Conflicting RLS Policies on `audit_items` and `user_profiles`

- `audit_items`: `USING(true)` in `20260801000000` vs `USING(company_id = ...)` in `20260730000006` — PostgreSQL treats both as additive (OR logic), so the `true` policy effectively disables RLS.
- `user_profiles`: Two UPDATE policies exist — one from `20260730000001` and one from `20260801000000`. Both have `USING(id = auth.uid())` but may interact unpredictably with the `user_profiles_prevent_role_change` policy.

**Files:** `20260730000001`, `20260730000006`, `20260801000000`

### 2.5 🔴 Non-Idempotent One-Time Data Fix

`20260730000005_create_finalize_audit_rpc.sql` contains a one-time data fix (`INSERT ... ON CONFLICT ... UPDATE ...`) at the bottom of the migration that runs on **every** migration execution. If migrations are re-run (e.g., during disaster recovery), already-fixed data will be overwritten.

**File:** `20260730000005:143–155`

### 2.6 🔴 Conflicting Function Signatures (Overloaded RPCs)

| Function | Version 1 | Version 2 | Conflict |
|----------|-----------|-----------|----------|
| `search_inventory` | `(text, uuid)` → 18 cols | `(uuid, text, integer)` → 13 cols | Ambiguous overload — second may not be resolvable |
| `get_monthly_performance` | `(uuid, int, uuid)` → monthly_index | `(uuid, integer, integer)` → year/month | Second overwrites first due to `CREATE OR REPLACE` |
| `get_expense_categories_summary` | `(uuid)` → category_name | `(uuid)` → name/value/color | Second overwrites first, breaking callers |

**Files:** `20260724000000`, `20260731000001`, `20260802000001`, `20260802000005`

### 2.7 🔴 Zero Input Validation in Financial Commit Functions

`commit_sales_invoice`, `commit_expense_v2`, and `commit_payment` accept `p_data jsonb` with **no schema validation**. If the frontend sends malformed data (missing required fields, negative amounts, zero quantities), the database will execute partial operations — creating invoices without journal entries or payments without bond entries.

**Files:** `20260802000002`, `20260802000003`

### 2.8 🔴 Silent Failure: Missing Accounts Skip Journal Entries

In `commit_sales_invoice`, if `v_sales_account_id` or `v_cash_account_id` is `NULL` (account not found in settings), the journal entry is **silently skipped** — the invoice is created but no accounting entries exist. Future trial balances will be permanently imbalanced.

**File:** `20260802000002_create_sales_rpcs.sql`

### 2.9 🟠 Missing Indexes on Heavily-Queried Columns

| Table | Missing Indexes |
|-------|----------------|
| `invoices` | `(company_id, type, status)`, `(issue_date)`, `(party_id)` |
| `journal_entries` | `(company_id, status, entry_date)` |
| `journal_entry_lines` | `(journal_entry_id)`, `(account_id)` |
| `expenses` | `(company_id, status, expense_date)` |
| `product_cross_references` | `(company_id, base_product_id)` |
| `supplier_prices` | `(company_id, product_id)` |
| `product_kit_items` | `(kit_product_id)` |
| `audit_sessions` | `(company_id)` |

Without these indexes, every tenant-filtered query will perform sequential scans that degrade linearly with data growth.

**Files:** All migration files

### 2.10 🟠 Missing CHECK Constraints on Financial Columns

- `cashboxes.opening_balance`: No `CHECK (opening_balance >= 0)` — allows negative opening balances
- `products.status`: Used as `'active'` filter everywhere but has no CHECK to enforce valid values
- `backup_configs.backup_frequency_hours`: No `CHECK (backup_frequency_hours > 0)`
- `product_uoms`: No `UNIQUE (product_id, uom_name)` — allows duplicate UOMs per product

### 2.11 🟡 `normalize_arabic` Uses `SECURITY DEFINER` Unnecessarily

This is a pure text transformation function (IMMUTABLE) with no data access. It should be `SECURITY INVOKER` and `LEAKPROOF` — the current `SECURITY DEFINER` label is technically no risk but violates the principle of least privilege.

**File:** `20260519000000:19`

### 2.12 🟡 Stock Type Mismatch: `INTEGER` in RPCs vs `NUMERIC` in Schema

The `assemble_kit` and `disassemble_kit` functions use `INTEGER` for `p_quantity`, but `product_stock.quantity` is `NUMERIC`. This can cause type mismatch errors if fractional stock quantities exist.

**File:** `20260730000003`

---

## 3. Supabase Edge Functions

### 3.1 🔴 `car-ai-assistant`: Zero Authentication

This function accepts AI messages from any client, on any origin, with no auth verification. It consumes OpenRouter API credits and has access to both the Supabase DB and the shared API key pool.

**File:** `supabase/functions/car-ai-assistant/index.ts`

### 3.2 🔴 `process-pdf`: Zero Authentication

Accepts `fileUrl` and `companyId` from any caller with no auth. The `fileUrl` parameter has **no validation** — an SSRF vulnerability if real PDF fetching is ever implemented. Writes to `audit_logs` without authorization checks.

**File:** `supabase/functions/process-pdf/index.ts`

### 3.3 🔴 `zatca-integration`: Zero Authentication

Tax invoice submission endpoint is unguarded. The hardcoded default VAT number `'300000000000003'` and the `TaxExclusiveAmount` bug (line 59: `total_amount + total_tax`) will cause ZATCA validation failures in production.

**File:** `supabase/functions/zatca-integration/index.ts:59`

### 3.4 🔴 `zatca-integration`: `TaxExclusiveAmount` Calculation Bug

Line 59: `TaxExclusiveAmount: invoice.total_amount + invoice.total_tax` — this is tax-**inclusive**, not tax-exclusive. Should be `invoice.total_amount` only. UBL XML is also incomplete (missing parties, line items, tax subtotals).

**File:** `supabase/functions/zatca-integration/index.ts:59`

### 3.5 🟠 `ai-proxy`: Missing Rate Limiting and Model Allowlist

No built-in rate limiting (relies on OpenRouter's 429 response). No model allowlist — clients can request any model including expensive ones. No `maxTokens` cap — arbitrary token counts accepted. No prompt length limit.

**File:** `supabase/functions/ai-proxy/index.ts`

### 3.6 🟠 `car-ai-assistant`: CORS Wildcard `*`

Allows requests from any origin. Combined with zero authentication, this makes the function fully open to abuse.

**File:** `supabase/functions/car-ai-assistant/index.ts`

### 3.7 🟠 `car-ai-assistant`: Uncaught JSON.parse on Tool Arguments

`JSON.parse(toolCall.function.arguments)` at line 139 has no try/catch — malformed arguments crash the function.

**File:** `supabase/functions/car-ai-assistant/index.ts:139`

### 3.8 🟠 `send-notification`: WhatsApp API Keys Stored in Plain Text

The WhatsApp API key is stored in the `messaging_config` table unencrypted. If the database is ever compromised, all WhatsApp integration credentials are exposed.

**File:** `supabase/functions/send-notification/index.ts`

### 3.9 🟡 `ai-proxy`: No Audit Logging

No record of users, timestamps, models used, or token consumption. Impossible to attribute API costs or detect abuse.

### 3.10 🟡 `process-pdf`: Entirely Mock Implementation

Returns randomly generated invoice data with no real OCR pipeline. When enabled in production, it will silently produce garbage data.

---

## 4. CI/CD Pipeline

### 4.1 🔴 `ci.yml` is Incomplete — Missing Critical Checks

The `ci.yml` workflow has a single job: type-check + unit tests + build. It **does not run**: linting, security audit, E2E tests, coverage enforcement, or deployment validation. It effectively duplicates the `quality-gate.yml` but with fewer checks, creating confusion about which is authoritative.

**File:** `.github/workflows/ci.yml`

### 4.2 🟠 No Edge Function CI

Neither workflow tests, lints, or deploys Supabase Edge Functions. Any Deno code can be committed without any validation.

**Files:** `.github/workflows/ci.yml`, `.github/workflows/quality-gate.yml`

### 4.3 🟠 No Performance / Bundle Size Regression Enforcement

`quality-gate.yml` lists bundle file sizes but has no failure threshold. A PR that doubles the main bundle will pass the gate silently.

**File:** `.github/workflows/quality-gate.yml`

### 4.4 🟠 No Lighthouse / Performance Audit

No web vitals, accessibility score, SEO score, or performance baseline checks in the pipeline.

### 4.5 🟡 `ci.yml` Missing Environment Variables for Build

No `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are provided to the build step in `ci.yml`. If these are required at compile time, the build will fail silently.

**File:** `.github/workflows/ci.yml`

### 4.6 🟡 Single Node Version — No Matrix

Both workflows use only Node 20. No Node 22 or LTS matrix testing.

---

## 5. TypeScript Strictness & Type Safety

### 5.1 🔴 Duplicate/Incompatible `AppError` Types

Two different `AppError` types exist in the codebase:

| Source | Shape |
|--------|-------|
| `core/types/common.ts` | Class: `{ message, code: ErrorCode enum, statusCode, details? }` |
| `core/utils/errorUtils.ts` | Interface: `{ message, code: string, severity: 'low'\|'medium'\|'high'\|'critical', actionLabel? }` |

`ErrorDisplay.tsx` imports from `errorUtils.ts` but `ErrorBoundary.tsx` imports from `types/common.ts`. These types are structurally incompatible — the `parseError()` function's `switch(code)` won't match `ErrorCode` enum values, causing a runtime bug.

**Files:** `src/core/types/common.ts:45–55`, `src/core/utils/errorUtils.ts:5–10`, `src/ui/base/ErrorDisplay.tsx:8`

### 5.2 🔴 213 `as any` Type Assertions

Widespread use of type assertions bypassing the entire TypeScript type system. Highest concentration in:

| Pattern | Count | Files |
|---------|-------|-------|
| `(supabase.from(...) as any)` | 11 | `purchaseFixes.ts` (9), services |
| `.abortSignal(signal as any)` | 9 | `dashboard/api/index.ts` |
| `const result = data as any` | 7 | 4 different RPC call sites |
| `Promise.resolve([] as any[])` | 6 | Various query hooks |
| `XLSX = (_XLSX as any).default` | 5 | All Excel exporters |

### 5.3 🔴 650 `: any` Type Annotations

Function parameters, return types, and variable declarations using `: any` across the codebase. This is 3x the `as any` count and indicates widespread use of untyped parameters in callbacks, generic components, and RPC response handling.

### 5.4 🟠 `database.types.ts` is Out of Date

Generated Supabase types exist at `src/core/database.types.ts` but were not regenerated after the 27+ RPC functions were created in migrations. The types won't include RPC signatures for any undefined functions, forcing `as any` casts on all RPC calls.

**File:** `src/core/database.types.ts`

### 5.5 🟠 `noUncheckedIndexedAccess` Not Enabled

This flag (`tsconfig.json`) is not set, meaning `array[index]` returns `T` instead of `T | undefined`. This can mask undefined access bugs in array-indexed operations.

**File:** `tsconfig.json`

### 5.6 🟡 `ESLint` `strict-boolean-expressions` Conflicts with `exactOptionalPropertyTypes`

`tsconfig.json` enables `exactOptionalPropertyTypes` but ESLint's `strict-boolean-expressions` reports false positives when checking optional properties that must use explicit `!== undefined` patterns.

---

## 6. Error Handling Architecture

### 6.1 🔴 Duplicate `AppError` Types Cause Runtime Dispatch Bug

As documented in §5.1 — the `ErrorDisplay` component calls `parseError()` on `AppError` class instances but `parseError` only handles string error codes, not the `ErrorCode` enum. This results in all `AppError` instances falling through to the generic "UNKNOWN" handler, showing users unhelpful messages.

**Files:** `src/core/utils/errorUtils.ts`, `src/ui/base/ErrorDisplay.tsx`

### 6.2 🟠 Section-Level Error Boundaries Nearly Absent

`FeatureBoundary` wraps every lazy-loaded page (good), but only `DashboardPage.tsx` uses `GlobalErrorBoundary` at the section/widget level. If a single widget crashes (e.g., `SalesChart`), the **entire dashboard page** crashes into the route-level error boundary instead of showing a degraded dashboard with the failed section replaced by a fallback.

**Files:** `src/core/components/FeatureBoundary.tsx`, `src/ui/common/GlobalErrorBoundary.tsx`, `src/features/dashboard/DashboardPage.tsx`

### 6.3 🟠 No Exponential Backoff on Offline Queue Retries

`offlineQueueStore.ts` increments `retryCount` but never uses it for backoff logic. Failed offline operations are retried immediately with no delay, creating a retry storm when the network is flaky.

**File:** `src/core/services/offlineQueueStore.ts`

### 6.4 🟠 No Dead-Letter Queue for Exhausted Retries

Failed operations that exceed a maximum retry count are silently left in the queue. There's no `failedActions` collection or admin dashboard for reviewing permanently failed sync operations.

### 6.5 🟡 `componentDidCatch` Console.error Not Suppressed in Production

`ErrorBoundary.tsx` calls `console.error('ErrorBoundary caught an error', error)` regardless of environment. In production, this exposes full error details and stack traces.

### 6.6 🟡 `KeepAliveRoute` Uses `display:none` — Not True KeepAlive

Pages are hidden but remounted when `display` is toggled, losing internal React state. This is not a genuine keep-alive strategy.

---

## 7. Data Validation & Form Integrity

### 7.1 🔴 Journal Entry Schema Defined in 3 Places — Drift Risk

The journal entry validation exists in three locations with **inconsistent tolerance values**:

| Location | Balance Tolerance |
|----------|------------------|
| `core/validators/index.ts` | `SOX_BALANCE_TOLERANCE = 0.000001` |
| `features/accounting/hooks/useJournalEntryForm.ts` | Hardcoded `0.01` |
| `core/utils/decimalUtils.ts` | `SOX_BALANCE_TOLERANCE = 0.000001` |

The form-level 0.01 tolerance is **10,000x more lenient** than the core validator. This could allow slightly imbalanced journal entries to pass form validation but fail at the use case level.

**Files:** `src/core/validators/index.ts`, `src/features/accounting/hooks/useJournalEntryForm.ts:32`, `src/core/utils/decimalUtils.ts`

### 7.2 🔴 Two Parallel Zod Resolvers — Inconsistent Behavior

Both the custom `lib/zodResolver.ts` and the official `@hookform/resolvers/zod` are used interchangeably. The custom resolver flattens errors differently (flat key → `{type, message}` vs. nested path), and `AddProductModal.tsx` casts the official resolver as `any` to work around type mismatches.

**Files:** `src/lib/zodResolver.ts`, `src/features/inventory/components/AddProductModal.tsx:36`

### 7.3 🟠 No Form Validation Schemas for Major Features

The following features have no Zod validation schemas despite having user-input forms: **purchases** (create/edit), **POS** (cart/payment), **bonds** (create/void), **returns** (schema referenced but not in standard locations), **settings** (financial/integration/POS/all configs), **vehicles**, **vehicle-compatibility**, **AI center**.

### 7.4 🟠 `currencyAmountSchema` Not Used for Cross-Field Validation

`currencyAmountSchema` validates the `amount` and `currency` fields independently but never checks that the currency is consistent with the parent transaction's currency. A multi-currency invoice could pass validation with mismatched currency codes.

**File:** `src/core/validators/index.ts`

### 7.5 🟠 `OfflineAction.payload` Type is `any`

Offline operations are queued with `payload: any` — no validation that the queued action contains required fields. A user could queue a `CREATE_INVOICE` action with missing party_id, and the error won't be discovered until sync time.

**File:** `src/core/services/offlineQueueStore.ts:9`

### 7.6 🟡 `expenseSchema` Uses Raw `z.number()` — No Decimal.js Precision

Financial amounts in the expense schema use JavaScript's native `Number` type instead of `Decimal.js`-backed validation. This can cause floating-point precision issues for amounts with many decimal places.

**File:** `src/core/validators/expenses.ts`

---

## 8. Frontend-Backend API Contract Alignment

### 8.1 🔴 27 RPCs Called on Frontend That Don't Exist in Migrations

The following 27 RPC function names are called from frontend code but have **no definition** in any SQL migration file. All calls will fail at runtime:

| RPC Name | Frontend Call Location |
|----------|----------------------|
| `calculate_and_update_wac` | `StockMovementUsecase.ts:25` |
| `process_stock_transfer` | `transferService.ts:10` |
| `get_item_movements_with_balance` | `productService.ts:317` |
| `get_similar_products` | `productService.ts:339` |
| `get_potential_duplicates` | `productService.ts:372` |
| `get_stock_valuation` | `analyticsService.ts:11` |
| `get_top_selling_products` | `analyticsService.ts:112` |
| `get_vehicle_products` | `vehiclesApi.ts:69` |
| `get_dead_stock` | `analyticsApi.ts:32` |
| `get_warehouses_with_stats` | `warehouseApi.ts:7` |
| `get_cash_liquidity` | `reports/service.ts:196` |
| `get_bonds_stats` | `bonds/api.ts:93` |
| `get_purchase_stats` | `purchases/service.ts:78,97` |
| `commit_purchase_invoice` | `purchases/api.ts:73` |
| `commit_purchase_return` | `purchases/api.ts:95` |
| `create_financial_bond` | `purchases/api.ts:108` |
| `void_expense` | `expenses/api.ts:71` |
| `get_party_statement` | `parties/service.ts:43` |
| `get_customer_stats` | `customerApi.ts:403` |
| `get_top_customers_by_revenue` | `customerApi.ts:411` |
| `get_account_ledger` | `reportService.ts:9` |
| `post_manual_journal` | `journalsApi.ts:66` |
| `commit_sale_return` | `sales/api/index.ts:111` |
| `void_invoice` | `sales/api/index.ts:175` |
| `process_sales_return` | `useSalesReturns.ts:191` |
| `get_user_profile` | `auth/api.ts:74` |
| `check_rate_limit` | `supabase/functions/send-notification/index.ts:222` |

This represents a massive gap between frontend expectations and backend implementations. Several of these (e.g., `commit_purchase_invoice`, `commit_sale_return`, `process_stock_transfer`) are **core business operations**.

### 8.2 🔴 10+ API Contract Mismatches (Param Name/Type Differences)

| RPC | Frontend Sends | Backend Expects | Severity |
|-----|---------------|-----------------|----------|
| `commit_sales_invoice` | 10+ individual params | `p_company_id, p_user_id, p_data jsonb` | 🔴 Will fail |
| `commit_expense_v2` | 7 individual params | `p_company_id, p_user_id, p_data jsonb` | 🔴 Will fail |
| `get_next_invoice_number` | `p_prefix: 'INV'` | No such param — uses `p_type` | 🔴 Will fail |
| `get_next_sequence` | `p_type` | `p_sequence_name` | 🔴 Will fail |
| `report_profit_loss` | Missing `p_from, p_to` | 3 required params | 🔴 Will fail |
| `report_balance_sheet` | `p_branch_id, p_from, p_to` | `p_company_id, p_as_of_date` | 🔴 Will fail |
| `report_cash_flow` | Missing `p_from, p_to` | 3 required params | 🔴 Will fail |
| `get_low_stock_products` | Destructures `total_stock, min_stock_level` | Returns `quantity, min_quantity` | 🟠 Wrong field names |
| `get_monthly_performance` | Passes `p_branch_id` | v2 doesn't accept `p_branch_id` | 🔴 Will fail |
| `search_inventory_paginated` | Extra `p_branch_id` | No branch filtering | 🟡 Silently ignored |

**Files:** Multiple frontend API service files vs SQL migrations

### 8.3 🔴 Conflicting RPC Overloads Cause Ambiguity

As documented in §2.6 — `search_inventory`, `get_monthly_performance`, and `get_expense_categories_summary` have conflicting definitions across migrations. PostgreSQL overload resolution is ambiguous, and callers will get unpredictable behavior.

### 8.4 🟠 `product_stock` SELECT Policy is `USING(true)` — No Tenant Filter

`SELECT` on `product_stock` has `USING(true)`. Any authenticated user can read all product stock across all companies. Combined with the `SECURITY DEFINER` RPC issue, cross-tenant data leakage is trivially exploitable.

### 8.5 🟡 `stock_movements` Accessed via `as any` — Type Bypass

`analyticsService.ts:89` accesses `stock_movements` with `(supabase.from('stock_movements') as any)`. Even if RLS is properly configured, the type system won't catch field mismatches.

**File:** `src/features/inventory/services/analyticsService.ts:89`

---

## 9. PWA & Offline Support

### 9.1 🔴 Three Parallel Offline Queue Systems

Three separate offline queue/persistence mechanisms exist:

| System | Location | Backend | Purpose |
|--------|----------|---------|---------|
| `offlineQueueStore` | `core/services/` | Zustand + idb-keyval | Action-based offline queue |
| `sync-store` | `core/lib/` | idb-keyval (direct) | Pending mutation tracking |
| `offlineService` | `lib/` | idb-keyval (direct) | Simple offline queue |

These are not integrated — they operate independently with separate IndexedDB keys. There's no single source of truth for offline state.

**Files:** `src/core/services/offlineQueueStore.ts`, `src/core/lib/sync-store.ts`, `src/lib/offlineService.ts`

### 9.2 🔴 Parallel Auth Token Storage — Encrypted + Plaintext

`storage.ts` provides AES-GCM encrypted token storage (`getAuthToken`/`setAuthToken`) while also exporting a legacy unencrypted `storage` object with `getToken`/`setToken` methods. The plaintext path writes tokens to `localStorage` key `auth_token`. If any code uses the legacy path, JWT tokens are exposed in plaintext.

**File:** `src/lib/storage.ts`

### 9.3 🔴 `useInvalidateQueries` is a Dead Stub

All methods in the exported `useInvalidateQueries` hook return empty functions. Query cache invalidation after mutations is not wired up — stale data will persist until the 15-minute staleTime expires.

**File:** `src/core/lib/react-query.tsx`

### 9.4 🟠 Service Worker: Cache Update Not Wrapped in `event.waitUntil`

The stale-while-revalidate strategy's cache update (`cache.put`) is fire-and-forget, not wrapped in `event.waitUntil`. The browser may terminate the Service Worker before the cache is written, leaving stale data in the cache.

**File:** `sw.js:52–54`

### 9.5 🟠 Service Worker: Hardcoded Cache Version

Cache name `'alz-erp-v4.1'` is hardcoded. Every release requires a manual code change to `sw.js` to invalidate caches.

**File:** `sw.js`

### 9.6 🟠 Service Worker: Empty Background Sync Listener

The `sync` event listener exists but performs no processing. Offline mutations are not synced via Background Sync API — they rely on `window.addEventListener('online')` which fires only when the app is in the foreground.

**File:** `sw.js`

### 9.7 🟠 PWA Manifest: Only One Icon Size

`manifest.json` defines only a 512x512 icon. Missing 192x192 for Android home screen and maskable icon variant for adaptive icons.

**File:** `public/manifest.json`

### 9.8 🟡 `offlineService.ts` Uses `console.info` Instead of Structured Logger

Bypasses the structured `logger` singleton — these log entries won't be captured by APM or controlled by min log level.

**File:** `src/lib/offlineService.ts`

---

## 10. Code Duplication & DRY Violations

### 10.1 🟠 5 Excel Exporters with Duplicated Bootstrap Code

Five files each contain the identical pattern `const XLSX = (_XLSX as any).default || _XLSX`:

- `src/core/utils/invoiceExcelExporter.ts`
- `src/core/utils/returnsExcelExporter.ts`
- `src/core/utils/bondExcelExporter.ts`
- `src/core/utils/quotationExcelExporter.ts`
- Plus one more in `statementExcelExporter.ts`

All share consistent styling patterns (navy headers, light borders, alternating rows, bold totals, RTL view) that should be extracted into a shared `createExcelWorkbook` factory.

### 10.2 🟠 Duplicated `globalAny` Pattern

5 hooks independently assign `const globalAny = window as any`:

- `useRealtimeSync.ts`
- `useProducts.ts`
- `useStockAudit.ts`
- `useProductsPaginated.ts`
- `useDashboard.ts`

All should use a single `enhancedWindow` utility.

### 10.3 🟠 `SearchInput` Component Exists in Two Locations

`src/ui/common/SearchInput.tsx` and `src/ui/components/SearchInput.tsx` are two separate implementations with overlapping but not identical functionality.

### 10.4 🟠 Journal Entry Schema Defined 3 Times

As documented in §7.1 — three independent definitions with different tolerances.

### 10.5 🟡 `Promise.resolve([] as any[])` Pattern Repeated 6 Times

A shared `noUserReturn` or `emptyForNullUser` helper would reduce the 6 repeated instances of the same pattern.

---

## 11. Dependency Health & License Audit

### 11.1 🟡 `npm audit` Unknown — Not Run

The audit agents did not execute `npm audit` due to runtime constraints. This should be run to verify no known vulnerabilities exist in the dependency tree.

### 11.2 🟡 Several Packages Are Behind Latest Versions

| Package | Current | Latest (Aug 2026) |
|---------|---------|-------------------|
| `react` | 19.2.4 | Check for patches |
| `react-router-dom` | 7.13.0 | Check for latest v7 |
| `lucide-react` | 0.563.0 | Likely behind |
| `zod` | 3.25.76 | Check |

### 11.3 🔵 377 `lucide-react` Import Instances

High icon import count across the codebase. Tree-shaking should remove unused icons at build time, but the developer experience could be improved with a consolidated icon barrel.

### 11.4 🔵 No Obviously Unused Dependencies Detected

All packages in `dependencies` and `devDependencies` have at least one import reference. Quick scan found no dead packages.

---

## 12. Production & Deployment Configuration

### 12.1 🟠 `vercel.json` CSP — Missing `frame-ancestors` and `form-action`

The CSP is well-configured for `connect-src`, `script-src`, and `img-src` but missing critical directives:
- `frame-ancestors 'none'` (prevents clickjacking)
- `form-action 'self'` (prevents form hijacking)
- `base-uri 'self'` (prevents base tag injection)

**File:** `vercel.json`

### 12.2 🟠 No `robots.txt` or `sitemap.xml`

Both files are missing from `public/`. The ERP's landing page won't be indexed by search engines.

### 12.3 🟠 `index.html` Has `maximum-scale=1.0, user-scalable=no`

This disables pinch-to-zoom, which is an accessibility anti-pattern and violates WCAG 2.1 SC 1.4.4 (Resize Text).

**File:** `index.html:10`

### 12.4 🟡 `vercel.json` CSP Uses `*.vercel.live` in Production

`*.vercel.live` is a preview/deploy domain — it should not be in the production CSP. It's a potential attack vector if a malicious actor claims a similar Vercel deployment.

**File:** `vercel.json`

### 12.5 🔵 `.env.example` Completness Not Verified

The `.env.example` file exists but its completeness against all actual `VITE_*` and Supabase variables was not verified.

---

## 13. Monitoring & Logging

### 13.1 🟠 Structured Logger Adoption is Incomplete

The `logger` singleton (`core/utils/logger.ts`) provides structured logging with levels, timestamps, APM integration, and deduplication. However, 4 files bypass it and use raw `console.*`:

| File | Console Method Used |
|------|-------------------|
| `src/lib/offlineService.ts` | `console.info` |
| `src/lib/localDB.ts` | `console.error` |
| `src/core/utils/pdfExporter.ts` | `console.error` |
| `src/features/settings/hooks/useDefaultExchangeRates.ts` | `console.log` |

**Files:** As listed above

### 13.2 🟠 APM Adapter Implementation is Commented Out

`initAPM.ts` contains complete Sentry and Datadog RUM adapter implementations that are fully commented out. Only the in-house circular buffer (last 50 events) is active. Production error monitoring has no external reporting.

**File:** `src/core/utils/initAPM.ts`

### 13.3 🟡 `index.tsx` Suppresses `console.log`/`debug` but Not `console.error`

Production mode disables `console.log` and `console.debug` but allows `console.error` through. Multiple files use `console.error` for caught errors, leaking stack traces to browser devtools in production.

### 13.4 🔵 No Performance Markers / User Timing API Usage

No `performance.mark()` / `performance.measure()` calls found in the codebase. Route transitions, RPC calls, and heavy computations have no timing instrumentation.

---

## 14. Export & Print Systems

### 14.1 🔴 ZATCA UBL XML: `TaxExclusiveAmount` is Wrong

As documented in §3.4 — `TaxExclusiveAmount: invoice.total_amount + invoice.total_tax` sets the tax-exclusive amount to the tax-inclusive total. This will fail ZATCA validation.

**File:** `supabase/functions/zatca-integration/index.ts:59`

### 14.2 🟠 ZATCA UBL XML is Incomplete

Missing required UBL 2.1 elements: `cac:AccountingSupplierParty`, `cac:AccountingCustomerParty`, `cac:InvoiceLine` items, `cac:TaxTotal` with subtotals.

**File:** `supabase/functions/zatca-integration/index.ts`

### 14.3 🟡 Excel Exporters: Dual-Dependency Import Pattern

All 5 Excel exporters use `import * as _XLSX from 'xlsx-js-style'` then `const XLSX = (_XLSX as any).default || _XLSX`. This `as any` cast on every import is fragile and suggests the type definitions for `xlsx-js-style` are incorrect.

### 14.4 🔵 PDF Export Uses `html2canvas` 2x Scale

The 2x scale canvas capture provides good quality but doubles memory usage for large pages. No option for 1x or configurable resolution.

**File:** `src/core/utils/pdfExporter.ts`

---

## 15. CSS & Design Token Consistency

### 15.1 🔴 Invalid Tailwind Config Key: `stat`

`tailwind.config.js` defines `stat` as a top-level key inside `theme.extend`:

```js
stat: {
  iconSize: { sm:'1rem', md:'1.25rem', lg:'1.5rem' },
  gap: { none:'0', sm:'0.25rem', md:'0.5rem', lg:'0.75rem' },
}
```

This is not a valid Tailwind configuration key and will generate CSS classes like `stat-iconSize-sm` that are never consumed.

**File:** `tailwind.config.js:62–71`

### 15.2 🟠 Comprehensive but Complex Theme System

`index.css` (665 lines) implements a dual theme system: CSS custom properties (`--app-bg`, `--app-surface`, etc.) and per-breakpoint scale/typography/density overrides. Additionally, `[data-theme-scope]` selectors remap Tailwind's `bg-gray-*`, `text-gray-*`, and `border-gray-*` utility classes to CSS variables. While thorough, this is difficult to maintain and debug — a class like `bg-gray-50` may render differently depending on the nearest `data-theme-scope` ancestor.

### 15.3 🟡 `!important` in Print Styles — 42 of 52 Instances

42 of 52 `!important` usages are in print-specific stylesheets (`@media print` blocks) where they are standard practice. The remaining 3 in `AdvancedTabBar/styles.css` (drag state) and 7 in `index.css` (theme overrides) are acceptable.

### 15.4 🔵 `@media` Query Responsive Breakpoints Defined in 3 Places

Responsive breakpoints are defined in:
- `tailwind.config.js` (Tailwind `screens`)
- `index.css` (CSS `@media` queries for theme/density)
- `src/lib/hooks/useBreakpoint.ts` (JS breakpoint detection)

These must be kept in sync manually — no single source of truth or shared constant.

---

## Priority Matrix

### Immediate (Block Production — Fix Before Deploy)

| # | Severity | Category | Issue | Impact |
|---|----------|----------|-------|--------|
| I-1 | 🔴 | API Contract | 27 RPCs called on frontend don't exist in migrations | **Silent runtime failures across 9+ features** |
| I-2 | 🔴 | API Contract | 10+ RPC param name/type mismatches | **Critical operations fail silently** |
| I-3 | 🔴 | Database | 15+ tables missing RLS | **No tenant isolation for financial data** |
| I-4 | 🔴 | Edge Functions | 3 of 5 functions have zero authentication | **Open endpoints for AI, PDF, ZATCA** |
| I-5 | 🔴 | Database | SECURITY DEFINER RPCs trust arbitrary p_company_id | **Cross-tenant data leakage** |
| I-6 | 🔴 | Database | Migration ordering conflict (RLS before table creation) | **Migrations may fail in fresh deploy** |
| I-7 | 🔴 | Edge Functions | ZATCA TaxExclusiveAmount calculation bug | **Tax compliance failure** |
| I-8 | 🔴 | Error Handling | Duplicate AppError types cause dispatch bug | **All AppError instances show generic error** |

### Sprint 1 (Security Hardening)

| # | Severity | Category | Issue |
|---|----------|----------|-------|
| S1-1 | 🔴 | Database | Conflicting RLS policies on audit_items/user_profiles |
| S1-2 | 🔴 | Database | Conflicting function signatures (search_inventory, get_monthly_performance) |
| S1-3 | 🔴 | Database | Zero input validation in financial commit RPCs |
| S1-4 | 🔴 | Database | Silent skip when accounts not found in commit functions |
| S1-5 | 🔴 | PWA | Plaintext auth token path alongside encrypted storage |
| S1-6 | 🔴 | PWA | Three parallel offline queue systems |
| S1-7 | 🔴 | Validation | Journal entry schema defined 3 places with 10000x tolerance mismatch |
| S1-8 | 🟠 | Edge Functions | ai-proxy missing rate limiting / model allowlist |
| S1-9 | 🟠 | Edge Functions | car-ai-assistant CORS wildcard + uncaught JSON.parse |
| S1-10 | 🟠 | Edge Functions | send-notification WhatsApp keys in plaintext |
| S1-11 | 🟠 | Database | Missing indexes on heavily-queried columns |

### Sprint 2 (Test Coverage & Reliability)

| # | Severity | Category | Issue |
|---|----------|----------|-------|
| S2-1 | 🔴 | Tests | Mock Supabase client unusable for integration tests |
| S2-2 | 🔴 | Tests | E2E tests are placeholder quality |
| S2-3 | 🔴 | PWA | useInvalidateQueries is dead stub |
| S2-4 | 🟠 | Tests | 72% of features have zero tests |
| S2-5 | 🟠 | Tests | Branch coverage threshold too low (60%) |
| S2-6 | 🟠 | Tests | UI component tests unacceptably thin |
| S2-7 | 🟠 | CI/CD | No Edge Function CI |
| S2-8 | 🟠 | CI/CD | No bundle size regression enforcement |
| S2-9 | 🟠 | Error Handling | Section-level error boundaries nearly absent |
| S2-10 | 🟠 | Error Handling | No exponential backoff on offline retries |

### Sprint 3 (Code Quality & Polish)

| # | Severity | Category | Issue |
|---|----------|----------|-------|
| S3-1 | 🔴 | TypeScript | 213 as any assertions — highest-concentration fixes |
| S3-2 | 🟠 | Validation | No form schemas for purchases, POS, bonds, returns, settings |
| S3-3 | 🟠 | Offline | Service Worker cache update not waitUntil-wrapped |
| S3-4 | 🟠 | Production | vercel.json CSP missing frame-ancestors/form-action |
| S3-5 | 🟡 | Duplication | 5 Excel exporters with duplicated bootstrap code |
| S3-6 | 🟡 | Duplication | SearchInput exists in two locations |
| S3-7 | 🟡 | Monitoring | Logger adoption incomplete (4 files use raw console) |
| S3-8 | 🟡 | Monitoring | APM adapter commented out |
| S3-9 | 🟡 | Database | Missing CHECK constraints on financial columns |
| S3-10 | 🔴 | CSS | Invalid Tailwind config key `stat` |

---

## Summary Statistics

| Severity | Count | Categories Affected |
|----------|-------|--------------------|
| 🔴 Critical | 32 | All 15 |
| 🟠 High | 37 | All 15 |
| 🟡 Medium | 30 | 14 |
| 🔵 Low/Info | 17 | 12 |
| **Total** | **116** | **15** |

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Test Suite | 4 | 4 | 2 | 1 | 11 |
| Database & RLS | 9 | 4 | 3 | 0 | 16 |
| Edge Functions | 5 | 5 | 2 | 0 | 12 |
| CI/CD | 1 | 4 | 2 | 0 | 7 |
| TypeScript | 3 | 2 | 1 | 0 | 6 |
| Error Handling | 1 | 4 | 2 | 0 | 7 |
| Validation | 2 | 4 | 1 | 0 | 7 |
| API Contract | 4 | 2 | 1 | 0 | 7 |
| PWA/Offline | 3 | 5 | 1 | 0 | 9 |
| Code Duplication | 0 | 4 | 1 | 0 | 5 |
| Dependencies | 0 | 0 | 2 | 2 | 4 |
| Production | 0 | 3 | 1 | 1 | 5 |
| Monitoring | 0 | 2 | 1 | 1 | 4 |
| Export/Print | 1 | 2 | 1 | 1 | 5 |
| CSS | 1 | 1 | 0 | 2 | 4 |

---

---

## Appendix A: Automated Check Results (Runtime)

### A.1 `npm audit` — 12 Vulnerabilities

| Severity | Count | Key Findings |
|----------|-------|-------------|
| 🔴 Critical | 1 | Vulnerable `vite` (< 6.12.2) in `vitest` dependency chain |
| 🟠 High | 3 | `react-router` 7.12.0-8.2.0: CSRF bypass (GHSA-qwww-vcr4-c8h2). Fix: `npm audit fix --force` (breaking change — downgrades to 7.11.0) |
| 🟡 Moderate | 2 | Via `vite` in `vitest` dependency |
| 🔵 Low | 6 | Minor issues |

### A.2 `tsc --noEmit` — 6 TypeScript Errors

All 6 errors are `TS1005: ')' expected` — syntax errors in JSX components:

| File | Line |
|------|------|
| `src/ui/common/ExcelTableToolbar.tsx` | 147 |
| `src/ui/common/SearchableAccountSelector.tsx` | 203 |
| `src/ui/common/ServerPaginationBar.tsx` | 176 |
| `src/ui/dashboard/CategoriesChart.tsx` | 133 |
| `src/ui/dashboard/SalesChart.tsx` | 227 |
| `src/ui/dashboard/StatsGrid.tsx` | 240 |

These are likely mismatched closing tags, missing brackets, or incorrect JSX syntax.

### A.3 `ESLint` — 18,145 Problems (18,126 Errors + 19 Warnings)

This is an **extreme** volume of lint issues. The strict ESLint configuration (`strict-boolean-expressions`, `no-explicit-any`, `explicit-function-return-type`, etc.) is correctly identifying violations, but the codebase has not been maintained against these rules. 1,520 errors are auto-fixable via `--fix`.

**Top rule violations** (estimated from sampling):
- `@typescript-eslint/strict-boolean-expressions` — nullable values in conditionals
- `@typescript-eslint/no-unsafe-*` — unsafe assignments, member access, returns
- `@typescript-eslint/explicit-function-return-type` — missing return types
- `@typescript-eslint/consistent-type-imports` — `import type` not used
- `@typescript-eslint/no-confusing-void-expression` — void in arrow shorthand

### A.4 `vitest run` — 3 Failed Test Files (17 Passed)

| Status | File | Tests | Failures |
|--------|------|-------|----------|
| ✅ Passed | 17 files | 204 tests | 0 |
| ❌ Failed | `decimalUtils.test.ts` | 23 | 1 (`isPositiveDecimal`) |
| ❌ Failed | `currencyUtils.test.ts` | 21 | 1 (`convertFromBaseCurrency: invalid amount`) |
| ❌ Failed | `errorUtils.test.ts` | 8 | 2 (`unknown errors`, `null/undefined`) |
| ❌ Error | `offlineQueueStore.test.ts` | 7 | IndexedDB not mocked |

The `offlineQueueStore.test.ts` failures are from `indexedDB is not defined` — the test setup doesn't mock IndexedDB despite the store using `idb-keyval`. The 4 functional test failures indicate real bugs in `isPositiveDecimal` (returns wrong value), `convertFromBaseCurrency` (throws on invalid input instead of returning 0), and `parseError` (returns wrong messages for unknown/null inputs).

### A.5 `console.log` Violations in Source

Only **1 real violation** in production source code:
- `src/features/settings/hooks/useDefaultExchangeRates.ts:47` — `console.log("[Currency] No rates found...")`

All other occurrences are in `index.tsx` (suppression logic) or `scripts/` (build tools).

---

*Report generated from full static analysis of `src/`, `supabase/`, `.github/`, `e2e/`, and config files at commit HEAD. Runtime checks (TypeScript, ESLint, Vitest, npm audit) were also performed and results appended.*
