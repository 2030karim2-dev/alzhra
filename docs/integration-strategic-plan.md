# Strategic Integration Plan: Achieving 100% Front-End / Back-End Cohesion

**Project:** Al-Zahra Smart ERP  
**Current Integration Score:** ~68%  
**Target:** 100%  
**Timeframe:** 6 phases over 14 weeks  
**Date:** 2026-08-01

---

## Executive Vision

Achieve a **closed-loop data system** where every front-end operation is type-safe, observable, consistent with the database, resilient to network failures, and synchronized in real-time — without a single `as any` cast, untyped RPC call, or unhandled error path.

---

## Phase 1: Type Safety — Eliminate All `as any` Casts (Weeks 1–2)

**Current:** 46 unsafe casts across 97 DB operations (47%).  
**Target:** 0 unsafe casts.

### 1.1 Supabase Type Generator Integration

Replace the manually maintained `database.types.ts` with automated generation:

```bash
# Add to package.json scripts
"db:types": "supabase gen types typescript --project-id zzthamxjxnxzzpswllid --schema public > src/core/database.types.ts"
```

**CI Integration** — Add to `quality-gate.yml`:

```yaml
- name: Check database types are up-to-date
  run: |
    npm run db:types
    if ! git diff --exit-code src/core/database.types.ts; then
      echo "❌ Database types are stale. Run 'npm run db:types' and commit."
      exit 1
    fi
```

### 1.2 Enforce Typed Supabase Client via ESLint

Create `.eslint/rules/no-supabase-any.cjs`:

```js
module.exports = {
  meta: { type: 'problem', docs: { description: 'Ban as any on supabase calls' } },
  create(context) {
    return {
      TSTypeAssertion(node) {
        if (node.typeAnnotation.type === 'TSAnyKeyword') {
          const source = context.sourceCode.getText(node);
          // Match supabase.rpc() as any, supabase.from() as any, etc.
          if (/\bsupabase\b/.test(source)) {
            context.report({
              node,
              message: 'Do not cast supabase calls with "as any". Use proper Database types from supabase-helpers.ts instead.',
            });
          }
        }
      },
    };
  },
};
```

### 1.3 Adopt `TableRow<T>` Helpers Across All Features

The project already has `src/core/types/supabase-helpers.ts` with `TableRow<'invoices'>` — but features like `Inventory`, `Accounting`, and `Dashboard` ignore them and redeclare interfaces manually.

**Action:** Replace all manual domain interfaces with derived types:

```
Before:  interface Product { id: string; name_ar: string; sale_price: number }
After:   type Product = TableRow<'products'>;
         type ProductWithStock = Product & { product_stock: TableRow<'product_stock'>[] };
```

**Count of interfaces to replace:** ~64 domain types across 5 modules.

### 1.4 Typed RPC Wrapper

Create a typed RPC layer that eliminates the `as any` pattern entirely:

```ts
// src/core/lib/typed-rpc.ts
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../database.types';

type RpcName = keyof Database['public']['Functions'];

export function createTypedRpc() {
  return <N extends RpcName>(name: N) => {
    type Fn = Database['public']['Functions'][N];
    type Args = Fn['Args'];
    type Returns = Fn['Returns'];

    return {
      call: (args: Args) =>
        supabase.rpc(name as string, args as Record<string, unknown>)
          .returns<Returns>() as Promise<{ data: Returns | null; error: Error | null }>,
    };
  };
}

// Usage:
const rpc = createTypedRpc();
const { data } = await rpc('commit_sales_invoice').call({
  p_company_id: companyId,
  p_invoice_data: { /* fully typed */ },
});
```

---

## Phase 2: API Design — Standardized RPC-First Architecture (Weeks 3–4)

**Current:** 68 `supabase.from()` calls vs 28 `supabase.rpc()` calls.  
**Target:** 80% of mutations via RPC, 20% via direct `from()` for reads only.

### 2.1 RPC Coverage Matrix

Map every front-end mutation to a backend RPC. Current gaps:

| Mutation | Current Method | Target RPC |
|----------|---------------|------------|
| Bulk stock adjust | `from('inventory_transactions').insert()` | `bulk_adjust_stock` ✅ (exists, unused) |
| Supplier approval | `from('prc_suppliers').update()` | `api_v1_prc_submit_supplier_approval` ✅ (exists, unused) |
| Supplier score | Local JS calculation | `api_v1_prc_update_supplier_scores` ✅ (exists, unused) |
| Price bulk update | `from('products').update()` loop | `bulk_update_product_prices` ✅ (exists, unused) |
| Stock transfer | `from('product_stock').update()` x2 | `process_stock_transfer` ✅ (exists, used once) |

**Action:** Audit all 57 unused RPCs in the database and map to front-end operations.

### 2.2 Standardized API Response Envelope

Wrap every RPC and `from()` call in a consistent envelope. The existing `ApiResult<T>` in `supabase-helpers.ts` is a start but is not enforced:

```ts
// src/core/lib/api-envelope.ts
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: unknown;
    severity: 'validation' | 'business' | 'system' | 'permission';
  } | null;
  meta?: {
    duration: number;
    retryCount: number;
    source: 'cache' | 'network' | 'offline';
  };
}

// All API functions must return ApiResponse<T>
```

### 2.3 read / write Separation

Enforce an architectural pattern where:

- **Queries (reads)** → `supabase.from().select()` + PostgREST filters
- **Mutations (writes)** → `supabase.rpc()` with SECURITY DEFINER

Why RPC for mutations:
- Business logic stays in the database (triggers, validations, journal entries)
- Atomic transactions across multiple tables
- `SECURITY DEFINER` prevents RLS bypass during complex operations
- Single round-trip instead of N

### 2.4 Deprecation Schedule

| Week | Action |
|------|--------|
| 3 | Replace `from().insert()` on products, invoices, journals with RPC |
| 4 | Remove all remaining `from().insert()` and `from().delete()` |
| 5 | Remove all remaining `from().update()` except simple flag toggles |

---

## Phase 3: Real-Time Synchronization Protocol (Weeks 5–6)

**Current:** Single `global-sync-{companyId}` channel with 5s throttle.  
**Target:** Scoped channels with optimistic updates + conflict resolution.

### 3.1 Channel Architecture Overhaul

Replace the single-channel-all-tables approach with domain-scoped channels:

```ts
const SYNC_CHANNELS = {
  sales: { channel: `sales-${companyId}`, tables: ['invoices', 'invoice_items', 'payments'] },
  inventory: { channel: `inventory-${companyId}`, tables: ['products', 'product_stock', 'warehouses'] },
  accounting: { channel: `acc-${companyId}`, tables: ['accounts', 'journal_entries', 'journal_entry_lines'] },
  parties: { channel: `parties-${companyId}`, tables: ['parties', 'customer_tags'] },
  settings: { channel: `settings-${companyId}`, tables: ['companies', 'fiscal_years', 'exchange_rates'] },
} as const;
```

### 3.2 Optimistic Update + Rollback Pattern

Standard mutation hook that all features must use:

```ts
// src/core/hooks/useTypedMutation.ts
export function useTypedMutation<TData, TVariables>(
  options: {
    mutationFn: (vars: TVariables) => Promise<ApiResponse<TData>>;
    queryKey: string[];
    optimisticUpdate?: (vars: TVariables) => void;
    rollback?: () => void;
    invalidatePresets: InvalidationPreset[];
  }
) {
  return useMutation({
    mutationFn: options.mutationFn,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: options.queryKey });
      const previous = queryClient.getQueryData(options.queryKey);
      options.optimisticUpdate?.(vars);
      return { rollback: () => queryClient.setQueryData(options.queryKey, previous) };
    },
    onError: (err, vars, context) => {
      context?.rollback();
      options.rollback?.();
      useFeedbackStore.getState().showToast(err.message, 'error');
    },
    onSettled: () => {
      options.invalidatePresets.forEach(p => invalidateByPreset(queryClient, p));
    },
  });
}
```

### 3.3 Conflict Resolution Strategy

For concurrent edits (two users modifying the same invoice):

```ts
interface ConflictResolution {
  strategy: 'last-write-wins' | 'first-write-wins' | 'merge' | 'manual';
  mergeFn?: (local: unknown, remote: unknown) => unknown;
}

// RPC returns conflict info
type MutationResult = 
  | { status: 'applied'; data: unknown }
  | { status: 'conflict'; localVersion: number; serverVersion: number; serverData: unknown };
```

### 3.4 Remove `window.__ALZ_CHANNELS__` Anti-Pattern

Replace global `Map` with a module-level singleton:

```ts
// src/core/realtime/channel-registry.ts
import { SupabaseClient } from '@supabase/supabase-js';

class ChannelRegistry {
  private channels = new Map<string, ReturnType<SupabaseClient['channel']>>();
  
  getOrCreate(key: string, factory: () => ReturnType<SupabaseClient['channel']>) {
    if (!this.channels.has(key)) {
      this.channels.set(key, factory());
    }
    return this.channels.get(key)!;
  }
  
  remove(key: string) { this.channels.get(key)?.unsubscribe(); this.channels.delete(key); }
  
  /** Clean up channels for stale subscriptions (e.g., company switch) */
  removeByPrefix(prefix: string) {
    for (const [key] of this.channels) {
      if (key.startsWith(prefix)) this.remove(key);
    }
  }
}

export const channelRegistry = new ChannelRegistry();
```

---

## Phase 4: Error Handling & Resilience (Weeks 7–8)

**Current:** 4 different error patterns, `console.error` leaks to production.  
**Target:** Single unified error pipeline.

### 4.1 Error Classification Hierarchy

```ts
// src/core/errors/types.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public severity: 'validation' | 'business' | 'system' | 'permission',
    public httpStatus?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, code: string, public originalError: unknown) {
    super(message, code, 'system', 500);
    this.name = 'DatabaseError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public fields: Record<string, string[]>) {
    super(message, 'VALIDATION_ERROR', 'validation', 422);
    this.name = 'ValidationError';
  }
}

export class PermissionError extends AppError {
  constructor(message: string, code: string = 'FORBIDDEN') {
    super(message, code, 'permission', 403);
    this.name = 'PermissionError';
  }
}
```

### 4.2 Unified Error Handler

```ts
// src/core/errors/handler.ts
export function parseSupabaseError(error: any): AppError {
  // Supabase auth errors
  if (error?.name === 'AuthSessionMissingError')
    return new PermissionError('انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى', 'SESSION_EXPIRED');

  // RLS / permission violations
  if (error?.message?.includes('permission denied') || error?.code === '42501')
    return new PermissionError('ليس لديك صلاحية لهذه العملية', 'RLS_DENIED');

  // Tenant violation
  if (error?.message?.includes('tenant_violation'))
    return new PermissionError('انتهاك نطاق الصلاحية: لا يمكن الوصول لهذه البيانات', 'TENANT_VIOLATION');

  // Rate limit
  if (error?.message?.includes('rate_limit'))
    return new AppError('تجاوزت الحد المسموح من الطلبات، يرجى الانتظار', 'RATE_LIMIT', 'system', 429);

  // Network / timeout
  if (error?.name === 'TimeoutError' || error?.code === 'TIMEOUT')
    return new AppError('تعذر الاتصال بالخادم، يرجى التحقق من اتصالك', 'NETWORK_TIMEOUT', 'system', 0);

  // Business logic (RPC returns validation)
  if (error?.message?.includes('Insufficient stock'))
    return new ValidationError(error.message, {});

  // Fallback — generic
  return new AppError(
    'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً',
    'UNKNOWN',
    'system',
    error?.status || 500,
    import.meta.env.DEV ? error : undefined
  );
}
```

### 4.3 Remove `console.error` from All Non-Test Files

Replace with `logger.error()`. Add ESLint rule:

```jsonc
{
  "rules": {
    "no-console": ["error", { "allow": ["warn", "error"] }],
    // Ban console.error specifically in production code
    "src/rules/no-console-error": "error"
  }
}
```

### 4.4 Fix Production Error Masking

The current `index.tsx` `window.fetch` override replaces error messages with a generic Arabic string for ALL Supabase errors. This breaks debugging and prevents users from seeing meaningful validation messages.

**Fix:** Only mask `system` severity errors, pass through `validation` and `business` errors:

```ts
if (appError.severity === 'validation' || appError.severity === 'business') {
  // Pass through — user needs to see this
  return response;
}
// Only mask system errors
data.message = "حدث خطأ غير متوقع أثناء معالجة البيانات، المرجو المحاولة لاحقاً.";
```

---

## Phase 5: Testing & Automation (Weeks 9–11)

**Current:** Unit test coverage threshold 70%, E2E tests exist for PRs only.  
**Target:** 90%+ coverage on API layer, nightly E2E, contract tests.

### 5.1 Testing Pyramid for Integration

```
         ╱╲
        ╱ E2E ╲           ← 5 critical user journeys (create invoice, purchase, payment, journal, transfer)
       ╱────────╲
      ╱ Integration ╲     ← 30+ tests: API layer → mock Supabase, test RPC calls
     ╱──────────────╲
    ╱   Unit Tests    ╲    ← All hooks, stores, services: ≥90% coverage
   ╱──────────────────╲
  ╱   Type-Level Tests  ╲  ← Compile-time: ensure database.types.ts covers all used columns
 ╱──────────────────────╲
```

### 5.2 API Contract Tests

Ensure every Supabase call matches the actual database schema:

```ts
// src/test/contracts/api-contracts.test.ts
import { describe, it } from 'vitest';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../core/database.types';

// Compile-time only — these fail to build if the DB schema changes
type _TableCheck = Database['public']['Tables']['invoices']['Row'] extends {
  id: string; company_id: string; type: string; total_amount: number; status: string
} ? true : never;

describe('API contracts compile', () => {
  it('invoices table matches expected shape', () => {
    // This is a compile-time test: if the type assertion fails, TypeScript errors
    const _assertion: _TableCheck = true;
    expect(_assertion).toBe(true);
  });
});
```

### 5.3 Mock Supabase Factory

The existing `src/test/mocks/supabase.ts` needs to be made type-safe:

```ts
// src/test/mocks/create-mock-supabase.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../core/database.types';
import type { DeepMockProxy } from 'vitest-mock-extended';

export type MockSupabase = DeepMockProxy<ReturnType<typeof createClient<Database>>>;

export function createMockSupabase(): MockSupabase {
  // ... returns fully typed mock with all tables, RPCs
}
```

### 5.4 E2E Integration Tests (Playwright)

Add Supabase-aware E2E tests that verify real integration:

```ts
// e2e/integration/create-sale-flow.spec.ts
test('full sale lifecycle: create → commit → verify journal', async ({ page }) => {
  // 1. Login
  await page.goto('/#/welcome');
  await page.fill('[data-testid="email"]', 'test@company.com');
  await page.fill('[data-testid="password"]', 'test-password');
  await page.click('[data-testid="login-btn"]');

  // 2. Navigate to POS
  await page.click('[data-testid="nav-pos"]');

  // 3. Create sale
  await page.click('[data-testid="add-product"]');
  // ...

  // 4. Verify via Supabase admin API that the invoice was created
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('*, journal_entries(*)')
    .eq('invoice_number', expectedNumber)
    .single();

  expect(invoice).toBeTruthy();
  expect(invoice.journal_entries).toHaveLength(1);
  expect(invoice.journal_entries[0].status).toBe('posted');
});
```

### 5.5 CI Integration Enhancements

```yaml
# Add to quality-gate.yml
integration-tests:
  name: Integration Tests (Supabase Branch)
  runs-on: ubuntu-latest
  services:
    supabase:
      image: supabase/postgres:15.6.1.116
      env:
        POSTGRES_PASSWORD: postgres
      ports:
        - 54322:5432
  steps:
    - name: Apply migrations to test DB
      run: |
        for f in supabase/migrations/*.sql; do
          psql "postgresql://postgres:postgres@localhost:54322/postgres" -f "$f"
        done
    - name: Run integration tests
      run: npm run test:integration
      env:
        VITE_SUPABASE_URL: http://localhost:54322
        VITE_SUPABASE_ANON_KEY: test-anon-key
```

---

## Phase 6: Data Consistency & (Week 12)

**Current:** Settings store has no server sync; partial offline resilience.  
**Target:** All mutations either sync to Supabase or queue in IndexedDB with conflict resolution.

### 6.1 Offline-First Data Layer

Standardize every mutation to follow this flow:

```mermaid
flowchart TD
    UserAction --> Validate[Zod Schema Validation]
    Validate -->|Fail| ReturnError[Return ValidationError]
    Validate -->|Pass| CheckOffline{Is Online?}
    CheckOffline -->|Yes| Send[Send to Supabase RPC]
    CheckOffline -->|No| Queue[Queue in IndexedDB]
    Send -->|Success| Invalidate[Invalidate Cache]
    Send -->|Error| Retry{Retry Count < 3?}
    Retry -->|Yes| Send
    Retry -->|No| Queue
    Queue -->|Reconnect| DequeueAll
    DequeueAll -->|For Each| Send
    Send -->|All Success| ClearQueue[Clear IndexedDB Queue]
```

### 6.2 Settings Synchronization

The `settingsStore.ts` currently persists only to `localStorage` with no server sync:

```ts
// src/features/settings/sync-service.ts
export const settingsSyncService = {
  async sync(section: string, data: unknown): Promise<ApiResponse<void>> {
    const rpc = createTypedRpc();
    
    switch (section) {
      case 'localization':
        return rpc('upsert_company_settings').call({
          p_company_id: getCompanyId(),
          p_settings: { localization: data },
        });
      case 'financial':
        return rpc('upsert_financial_settings').call({
          p_company_id: getCompanyId(),
          p_settings: data,
        });
      // ... each section maps to an RPC
    }
  },
  
  async pull(companyId: string): Promise<ApiResponse<CompanySettings>> {
    return rpc('get_company_settings').call({ p_company_id: companyId });
  },
};
```

### 6.3 Data Integrity Audits

Nightly cron job via Supabase scheduler:

```sql
-- supabase/migrations/20260801000001_integrity_audit.sql
SELECT * FROM public.check_invoice_journal_consistency(); 
-- Returns: invoices without matching journal entries, journals with unbalanced lines, etc.
```

Hook this into the front-end as a "Data Health" dashboard widget:

```ts
// src/features/dashboard/components/DataHealthWidget.tsx
const { data } = useQuery({
  queryKey: ['data-health', companyId],
  queryFn: () => supabase.rpc('get_integrity_report', { p_company_id: companyId }),
  refetchInterval: 5 * 60 * 1000, // every 5 minutes
});
```

---

## Phase 6b: Observability & Monitoring (Week 13)

### 6b.1 APM Integration for All API Calls

The existing `initAPM` in `useSystemInitialization.ts` is a good start. Extend it:

```ts
// src/core/apm/api-timing.ts
import { initAPM } from '../utils/initAPM';

export async function tracedQuery<T>(
  label: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    initAPM({ metrics: { [`api.${label}.duration_ms`]: performance.now() - start } });
    return result;
  } catch (error) {
    initAPM({ metrics: { [`api.${label}.error`]: 1 } });
    throw error;
  }
}

// Usage
const { data } = await tracedQuery('commit_sales_invoice', () =>
  rpc('commit_sales_invoice').call(args)
);
```

### 6b.2 Dashboard for Integration Health

```ts
// Admin dashboard component showing:
interface IntegrationHealthMetrics {
  totalApiCalls: number;
  errorRate: number;           // target: < 0.01%
  avgLatency: number;          // target: < 500ms
  p95Latency: number;
  staleCacheEntries: number;   // target: 0
  offlineQueueSize: number;    // target: 0
  asAnyCastCount: number;      // target: 0
  uncoveredRpcCount: number;   // target: 0
  realtimeLag: number;         // target: < 1s
}
```

---

## Implementation Roadmap

| Week | Phase | Key Deliverables | Success Metric |
|------|-------|-----------------|----------------|
| 1–2 | **Type Safety** | ESLint rule, 46 casts removed, typed RPC wrapper | `npm run scan:types` returns 0 `as any` |
| 3–4 | **API Design** | 80% conversions to RPC, ApiResponse<T> everywhere | Migration checklist: 52 `from().*` replaced |
| 5–6 | **Realtime** | Domain-scoped channels, optimistic update hook, channel registry | Zero conflicts in multi-user testing |
| 7–8 | **Error Handling** | Unified error hierarchy, parseSupabaseError, no console.error | Error coverage: every RPC call has typed error handling |
| 9–11 | **Testing** | Integration tests, API contract tests, E2E scenario tests | Coverage ≥ 90%, all E2E flows green |
| 12 | **Consistency** | Offline queue standard, settings sync, integrity audits | All 11 migrations valid, no orphaned records |
| 13 | **Observability** | APM traces, health dashboard, nightly reports | p95 < 500ms, error rate < 0.01% |
| 14 | **Hardening** | Security audit, penetration testing, final validation | Zero open CVEs, all RLS policies validated |

---

## Architecture Decision Records

### ADR-001: RPC-First for Mutations

**Context:** Direct `from().insert()` bypasses server-side business logic (journal auto-generation, stock validation, tenant checks).  
**Decision:** All CREATE, UPDATE, DELETE operations must go through `supabase.rpc()`. SELECT operations may use `from().select()` directly.  
**Consequence:** Requires maintaining RPC definitions for every mutation, but ensures atomic transactions and consistent business logic.

### ADR-002: Optimistic Updates with Rollback

**Context:** Network latency in APAC region (project in `ap-south-1`) averages 200–400ms.  
**Decision:** All mutations use the `useTypedMutation` hook that applies optimistic updates to the cache immediately, rolls back on error, and invalidates dependent queries on settle.  
**Consequence:** Users see instant UI feedback. Stale data window is limited to 5s (realtime throttle).

### ADR-003: Auto-Generated Types as Single Source of Truth

**Context:** Manual interfaces in `database.types.ts` drift from actual schema.  
**Decision:** Run `supabase gen types` on every migration commit. CI blocks if types are out of date. All feature types derive from `TableRow<T>` helpers.  
**Consequence:** No manual type maintenance. Compile-time detection of schema mismatches.

### ADR-004: Offline Queue Enforcement

**Context:** Users in Yemen and rural areas experience intermittent connectivity.  
**Decision:** Every mutation hook checks `navigator.onLine`. If offline, the action is serialized to IndexedDB via `syncStore` with full payload and mutation key. On reconnect, the queue replays in FIFO order.  
**Consequence:** Users can create invoices, payments, and journals offline. Queue clears on successful sync.

---

## Success Criteria

| # | Criterion | Current | Target | Measurement |
|---|-----------|---------|--------|-------------|
| 1 | `as any` casts in supabase calls | 46 | 0 | `npm run scan:types` |
| 2 | `console.error` in non-test code | ~8 | 0 | `grep -r console.error src/ --include="*.ts" --include="*.tsx"` |
| 3 | `from().insert()` / `.update()` / `.delete()` | 33 | 0 | Script count |
| 4 | RPC coverage (used / available) | 28 / 85 | 65 / 85 | `npm run scan:rpc-coverage` |
| 5 | Unit test coverage (lines) | 70% | 90% | `npm run coverage` |
| 6 | E2E integration flows | 0 | 5 | Playwright test count |
| 7 | Error handling uniformity | 4 patterns | 1 pattern | Code review |
| 8 | Realtime channel architecture | 1 global | 5 scoped | Runtime enum |
| 9 | Offline queue sync test | Manual | Automated | CI test suite |
| 10 | Settings server sync | 0% | 100% | Verify call count |

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Schema changes break front-end types | Medium | High | CI blocks stale types; `TableRow<T>` gives immediate error |
| RPC migration breaks existing functionality | Medium | Critical | Feature flags toggle old/new code; shadow-read comparison in staging |
| Offline queue grows unbounded | Low | Medium | Max queue size: 1000 items; oldest items evicted with warning toast |
| Realtime channel overload | Low | Medium | Throttle (5s) + domain channels distribute load |
| Developer resistance to `as any` ban | Medium | Low | ESLint auto-fix; PR review checklist; weekly migration sprint |

---

## Appendices

### A: Tooling Scripts

```jsonc
// package.json additions
{
  "scripts": {
    "db:types": "supabase gen types typescript --project-id zzthamxjxnxzzpswllid --schema public > src/core/database.types.ts",
    "scan:rpc-coverage": "tsx scripts/rpc-coverage-scanner.ts",
    "scan:any-casts": "tsx scripts/any-cast-scanner.ts",
    "check:integration-health": "tsx scripts/integration-health-check.ts"
  }
}
```

### B: Migration Checklist

```ts
// scripts/migrate-to-rpc.ts — validates RPC coverage per feature
interface MigrationStatus {
  feature: string;
  directQueries: number;  // from().insert() etc.
  rpcCalls: number;
  rpcToImplement: string[];
  casts: number;          // as any count
  status: 'pending' | 'in-progress' | 'complete';
}
```

### C: Daily Integration Scorecard

A CI-generated PR comment showing the integration score:

```
## 📊 Integration Health Score: 92% ▲ (+24% from last sprint)

| Metric | Value | Target |
|--------|-------|--------|
| Type safety | 95% | 100% |
| RPC coverage | 78% | 80% |
| Error uniformity | 100% | 100% |
| Offline resilience | 3/3 flows | 3/3 flows |
| Real-time lag | 1.2s avg | < 5s |
| Test coverage | 88% | 90% |

⚠️ 2 `as any` casts remaining in `accounting/api/`.
❌ 8 `from().insert()` calls not yet migrated to RPC.
```

---

*This plan was authored based on the comprehensive audit of 63 issues across 32 findings in the current codebase. The current integration score of ~68% is a quantitative metric derived from: type safety weight (25%) at 65%, API coverage (20%) at 60%, error handling (15%) at 70%, cache invalidation (15%) at 85%, realtime sync (10%) at 60%, offline resilience (10%) at 80%, and security (5%) at 50%.*