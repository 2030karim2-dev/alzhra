# Al-Zahra Smart ERP — Comprehensive Front-End Audit Report

**Date:** 2026-08-01  
**Audited By:** Automated Static Analysis + Manual Code Review  
**Scope:** Full front-end source (`src/`) — Landing Interface ↔ App Interface cohesion, security, UX flows, state management, i18n, visual consistency  
**Project:** `alzhra100` · Supabase `zzthamxjxnxzzpswllid` · PostgreSQL 17.6 · React + Vite + Zustand + TanStack Query

---

## Executive Summary

The codebase demonstrates solid architectural foundations: well-structured feature modules, a layered error boundary system, RTL/LTR awareness, offline-first patterns, and a performant lazy-loading strategy. However, a series of critical gaps in interface cohesion, security, and i18n completeness undermine the production-readiness of the system. The two primary interfaces — the **Landing Page** and the **App (Dashboard + Features)** — operate on partially disconnected theme, font, and state systems, creating visible seams in the user journey.

**Severity counts:**  
🔴 Critical: **18** | 🟠 High: **14** | 🟡 Medium: **22** | 🔵 Low/Info: **9**

---

## 1. Interface Cohesion — Landing vs App

### 1.1 🔴 Dual Theme Architecture with No Shared Contract

The Landing Page uses `data-theme-scope="landing"` and hardcodes `bg-white dark:bg-slate-950` Tailwind classes, while the App uses `data-theme-scope="app"` with CSS custom properties (`var(--app-bg)`, `var(--app-surface)`, etc.). These two systems run independently with no shared design token bridge.

**Consequence:** A user who selects a "Sand" or "Midnight" theme preset in the App will see the Landing Page continue to render in default Tailwind colors. The theme toggle in `LandingHeader` only switches `light/dark` via `useThemeStore`, but the Landing Page does not consume `var(--app-bg)` or any theme preset variables — it uses raw Tailwind dark mode utilities (`dark:bg-slate-900`). Conversely, the App cannot be affected by `[data-theme-scope="landing"]` CSS overrides.

**File:** `LandingPage.tsx:33`, `MainLayout.tsx:89`, `src/index.css:120–191`

**Fix:** Either (a) extend the CSS token system to cover landing classes, or (b) explicitly document that the landing page intentionally uses a fixed "dark-marketing" theme and add a comment explaining the deliberate split. Currently there is no documentation and the behavior appears unintentional.

---

### 1.2 🔴 Font System Mismatch Between Interfaces

The Landing Page uses `font-sans` (system font via Tailwind) on its root element. The App uses `font-cairo` (imported Google Font) via `MainLayout.tsx:89`. `index.css` defines `font-family: 'Cairo', 'Tajawal', sans-serif` as the base, but this is overridden by `font-sans` on the landing wrapper.

**Consequence:** Arabic text on the Landing Page renders in the system sans-serif font (Arial/Helvetica on most systems) rather than Cairo/Tajawal, producing noticeably different Arabic letter spacing and weight compared to the App.

**File:** `LandingPage.tsx:33`, `MainLayout.tsx:89`, `src/index.css:1–10`

---

### 1.3 🔴 Version Number Inconsistency

`constants.ts` exports `APP_VERSION = '1.0.0'` while `SettingsPage.tsx` sidebar footer hardcodes the display as `v2.0`. These values will diverge further as releases continue.

**Fix:** Use `APP_VERSION` from `constants.ts` everywhere. Consider reading from `package.json` via `import.meta.env.VITE_APP_VERSION` for a single source of truth.

**Files:** `src/core/constants.ts`, `src/features/settings/SettingsPage.tsx`

---

### 1.4 🟠 Inconsistent App Logo — `Car` Icon as Brand Identity

Both interfaces (Landing + App) use the `Car` icon from lucide-react as the application logo — in `LandingHeader.tsx`, `SidebarLogo.tsx`, and `Header.tsx`. The `Car` icon is a generic automobile silhouette with no visual distinctiveness.

**Consequence:** The app cannot be branded, favicon, OG images, and print headers all lack a real logo. Any white-labeling or brand update requires hunting 4+ files.

**Fix:** Create a single `BrandLogo` component that renders an inline SVG or `<img>` tag, replacing all `Car` icon usages.

---

### 1.5 🟠 Navigation Items "Prices" — Dead Link on Landing

`LandingHeader.tsx` defines a nav item `{ label: 'الأسعار', action: () => {} }`. Clicking it does nothing. This presents users with a broken navigation item on the public-facing landing page.

**File:** `LandingHeader.tsx:24`

**Fix:** Either implement a pricing section or remove the nav item.

---

## 2. Authentication Flow Gaps

### 2.1 🔴 `AuthGuard` Redirects to `/login` but `/login` Redirects to `/welcome`

`AuthGuard` redirects unauthenticated users to `ROUTES.AUTH.LOGIN` which is `/login`. The routes file maps `/login` to `<Navigate to={ROUTES.AUTH.LANDING} replace />`. This creates a redirect chain: `/` → `/login` → `/welcome`.

**Consequence:** Users who navigate directly to a deep link (e.g., `/inventory`) while unauthenticated will bounce through an extra redirect before reaching the login form. While functionally correct, the double redirect is unnecessary and creates a brief visual flash on slow connections.

**Files:** `AuthGuard.tsx:20`, `routes.tsx:66`

**Fix:** Change `AuthGuard` to redirect directly to `ROUTES.AUTH.LANDING` (`/welcome`).

---

### 2.2 🔴 `UpdatePasswordPage` Wrapped in `GuestGuard` — Breaks Password Reset Flow

`UpdatePasswordPage` is wrapped in `GuestGuard`. When a user clicks the password reset link in their email, Supabase redirects them back to the app with a session token. If the user was previously authenticated (e.g., they're logged in on another tab), `GuestGuard` will redirect them away from the Update Password page before they can complete the reset.

**File:** `routes.tsx:69`

**Fix:** Remove `GuestGuard` from `UpdatePasswordPage` and instead check inside the page that the URL contains a valid recovery token.

---

### 2.3 🟠 `resetPasswordForEmail` Lacks `redirectTo` — Email Links May Break

`authApi.resetPasswordForEmail` calls `supabase.auth.resetPasswordForEmail(email)` without passing a `redirectTo` option. The password reset email will use the **Site URL** configured in Supabase dashboard settings, which may not point to `/#/update-password` (the HashRouter path). If the Site URL is set to production but the user is on a staging/dev environment, the reset link won't work.

**File:** `src/features/auth/api.ts:~170`

**Fix:**
```ts
resetPasswordForEmail: async (email: string) =>
  supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/#/update-password`,
  }),
```

---

### 2.4 🟠 "Remember Me" Checkbox is Non-Functional

`LoginPage.tsx` renders a "Remember Me" checkbox bound to `rememberMe` state, but this state is **never passed** to the `login()` call. The checkbox has no effect on session persistence.

**File:** `LoginPage.tsx:13–14, ~60`

**Fix:** Either pass `rememberMe` to `authApi.signInWithPassword` to control session persistence, or remove the checkbox.

---

### 2.5 🟠 `LoginCredentials` Type Uses `pass` Field — Inconsistency

`types.ts` defines `LoginCredentials.pass` but all actual login calls use `password`. The `LoginCredentials` interface appears unused and will mislead developers who consume it.

**File:** `src/features/auth/types.ts:20`

---

## 3. Routing & Navigation Defects

### 3.1 🔴 Global Search Always Routes to `/inventory`

The header search bar hardcodes the search destination to `/inventory?search=...` regardless of which page the user is on. Searching from Accounting, Sales, or Reports routes users away to the Inventory page unexpectedly.

**File:** `Header.tsx:23–26`

**Fix:** Implement a true global search or, at minimum, update the placeholder text to indicate it only searches products.

---

### 3.2 🟠 Dead Component: `HeaderSearch.tsx`

`src/ui/layout/header/HeaderSearch.tsx` exists as a standalone component but is imported nowhere. It duplicates search logic that is already inline in `Header.tsx`. The orphaned file hardcodes an Arabic placeholder and will confuse future developers.

**Fix:** Delete `HeaderSearch.tsx`.

---

### 3.3 🟠 `ROUTES` Constant Not Used by UI Layer

`paths.ts` exports a `ROUTES` object for compile-time route safety, but `SidebarNav.tsx`, `Header.tsx`, `HeaderActions.tsx`, and `SidebarFooter.tsx` all use raw string literals (`'/settings'`, `'/inventory'`). A route path change requires manually updating every occurrence.

**Fix:** Replace raw string literals with `ROUTES.DASHBOARD.*` references throughout. Enforce via an ESLint rule banning string literals that match route patterns.

---

### 3.4 🟠 `AICommandCenter` Rendered as a Route and as a Floating Button Simultaneously

`routes.tsx` defines `/ai-center` as a route that renders `<AICommandCenter isOpen={true} onClose={() => {}} />` inline. Simultaneously, `AIChatButton` in `App.tsx` renders `AICommandCenter` as an overlay panel. These are two independent instances — state is not shared, and navigating to `/ai-center` shows the component embedded in the layout while the floating button may also be rendered.

**File:** `routes.tsx:127–130`, `App.tsx:31`, `AIChatButton.tsx`

---

### 3.5 🟠 `/vehicles` Uses Raw String — Not in `ROUTES`

`routes.tsx:115` defines the vehicles route as raw string `"/vehicles"`. `ROUTES.DASHBOARD` has no `VEHICLES` key. This route will be missed in any automated navigation analysis.

**File:** `routes.tsx:115`

---

### 3.6 🟠 Mobile Bottom Navigation Shows Only 4 Items

`MainLayout.tsx:81–86` defines a mobile bottom nav with 4 items: Dashboard, POS, Sales, Inventory. The remaining 15+ modules are only accessible via the mobile sidebar, which requires an extra tap. On small screens, users cannot reach Accounting, Purchases, Reports, or Settings without opening the drawer.

**Fix:** Consider a "More" overflow item on the mobile nav or a configurable quick-access bar.

---

## 4. Security Vulnerabilities

### 4.1 🔴 Auth Session Stored in `localStorage` — XSS Exposure

`supabaseClient.ts` configures Supabase auth with `storage: localStorage` and key `'alz_auth_session'`. This exposes the session token to any XSS payload. For a financial ERP system, this is a significant risk.

**Fix:** Use `sessionStorage` for single-tab sessions, or configure Supabase with `cookieOptions` and an SSR adapter for httpOnly cookie-based sessions. At minimum, ensure CSP headers are configured on the hosting platform to block inline scripts.

---

### 4.2 🔴 Mock Supabase Client Silently Authenticates in Misconfigured Environments

`supabaseClient.ts` defines a `createMockClient()` that returns a fake client where `signInWithPassword` resolves with `{ data: null, error: null }` — simulating a successful login with no verification. If `VITE_SUPABASE_URL` is unset or invalid in a non-dev environment (e.g., a misconfigured staging deployment), the mock client activates and all auth calls silently succeed.

**Fix:** The mock should only be active when `import.meta.env.DEV === true`. Add an explicit runtime guard:
```ts
if (!import.meta.env.DEV) {
  throw new Error('FATAL: Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}
```

---

### 4.3 🔴 `isOwner` Guard is Client-Side Only

`constants.ts` defines `isOwner: true` on the Settings menu item. `SidebarNav.tsx` hides this item from non-owner roles. However, the settings **route** (`/settings`) has no server-side protection and is accessible by direct URL navigation regardless of role. Any user can navigate to `/#/settings` directly.

**Consequence:** Non-owner users can access company settings, invite users, manage financial configurations, and view sensitive data.

**Fix:** Add role validation inside `SettingsPage.tsx` and its sub-sections, or create a `RoleGuard` HOC that wraps the route and redirects unauthorized users.

---

### 4.4 🔴 Integration Settings Persisted to `localStorage` Unencrypted

`settingsStore.ts` persists all settings including the `integration` section to `localStorage` under `'alzhra-settings'`. If `integration` stores webhook URLs, API keys, or third-party credentials, these are exposed to any JavaScript running on the page (XSS).

**Fix:** Exclude sensitive sections from `partialize`:
```ts
partialize: (state) => ({
  localization: state.localization,
  appearance: state.appearance,
  // Do NOT persist: integration, financial (may contain bank details)
})
```

---

### 4.5 🔴 `POSPage`: `useAuthStore.getState()` Called Inside `useCallback`

`POSPage.tsx` calls `useAuthStore.getState()` inside a `useCallback` to get `company_id`. This bypasses React's reactivity system — if the user's session is refreshed and `company_id` changes, the cached callback will use a stale value. Any barcode scan after a token refresh may use the wrong company scope.

**Fix:** Destructure `user` at the component level: `const { user } = useAuthStore();`

---

### 4.6 🔴 Empty `company_id` Passed to Search Service in POS

`handleSearchSelect` and `handleViewDetails` in `POSPage.tsx` call `buildProductFromSearchResult(result, '')` with a hardcoded empty string for `company_id`. If `company_id` is used downstream for RLS filtering, this could either bypass row-level security (returning all company data) or silently return no data (empty company scope).

**File:** `POSPage.tsx`

---

### 4.7 🟠 `isValidSupabaseUrl` Does Not Check HTTPS Protocol

The URL validation function in `supabaseClient.ts` checks only that the hostname ends with `.supabase.co`. A URL like `http://intercept.supabase.co` would pass this check. All Supabase traffic must use HTTPS.

**Fix:** Add `parsed.protocol === 'https:'` to the validation.

---

### 4.8 🟠 `STORAGE_KEYS.AUTH_TOKEN` Conflicts with Supabase Session Key

`constants.ts` defines `STORAGE_KEYS.AUTH_TOKEN = 'auth_token'` while `supabaseClient.ts` uses `storageKey: 'alz_auth_session'`. If any legacy code writes a JWT to `'auth_token'`, it will not be cleaned up by the auth store's logout (which only clears `'alz_auth_session'`). Stale tokens may persist across sessions.

---

### 4.9 🟠 `notificationService` Uses `console.error` for Health Check Failures

`notificationService.checkSystemHealth` catches errors with `console.error("Health Check Failed", error)`. In production, `console.error` is not suppressed (only `console.log` and `console.debug` are disabled in `index.tsx`). This leaks error details (potentially including DB error messages or stack traces) to the browser console in production.

**Fix:** Replace with `logger.error(...)`.

---

## 5. i18n Coverage Failures

### 5.1 🔴 Landing Page: Zero `t()` Usage on User-Facing Strings

All five landing page components (`LandingHeader`, `HeroSection`, `CTASection`, `FeaturesSection`, `HowItWorksSection`) import `useTranslation` but only extract `dir` (text direction). Every headline, subtitle, button label, stat counter label, feature card title, and nav item is hardcoded in Arabic. The landing page is not localizable.

**Affected components:** `LandingHeader.tsx`, `HeroSection.tsx`, `CTASection.tsx`, `FeaturesSection.tsx`, `HowItWorksSection.tsx`, `LandingFooter.tsx`

---

### 5.2 🔴 RegisterPage Success State: Hardcoded Arabic Strings

The registration success view in `RegisterPage.tsx` contains hardcoded Arabic strings:
- `"تم إنشاء الحساب بنجاح!"`
- `"تم تسجيل حسابك في النظام."`
- `"الانتقال لصفحة الدخول"`

These are not run through `t()` and break i18n for non-Arabic locales.

---

### 5.3 🔴 `HeaderActions.tsx`: Profile Dropdown Items Hardcoded

Three dropdown menu items in the user profile dropdown are hardcoded Arabic strings that bypass `t()`:
- `"الملف الشخصي"` (line ~214)
- `"إعدادات المنشأة"` (line ~221)
- `"تسجيل الخروج"` (line ~231)

---

### 5.4 🔴 `SettingsPage.tsx`: Mixed i18n — Some Keys Through `t()`, Most Hardcoded

The `menuGroups` array uses `t()` for some `label` fields but hardcodes others. Group titles (`'عام'`, `'مالي ومحاسبي'`) and all `desc` fields are hardcoded Arabic. This creates an inconsistent i18n surface where some strings are translatable and others are not.

---

### 5.5 🟠 `UpdatePasswordPage.tsx`: Hardcoded Toast Message

`"كلمتا المرور غير متطابقتين"` is passed directly to `showToast()` rather than via `t()`.

**File:** `UpdatePasswordPage.tsx`

---

### 5.6 🟠 `SidebarLogo.tsx`: Fragile String Extraction

`t('app_subtitle').split(' ').slice(2).join(' ')` — this relies on the subtitle translation having at least 3 space-separated words. If the English subtitle is `"Smart ERP"` (2 words), `slice(2)` returns an empty array and the logo subtitle disappears silently.

**File:** `SidebarLogo.tsx:26`

---

### 5.7 🟠 `useTranslation.ts`: `t()` Fallback Silently Shows Translation Keys

`dictionary[key] || key` — when a key is missing from the loaded dictionary, the raw key (`"company_profile"`, `"fiscal_years"`) is shown to the user. There is no DEV-mode warning, making untranslated keys difficult to detect during development.

**Fix:** Add a warning in DEV:
```ts
if (import.meta.env.DEV && !dictionary[key]) {
  console.warn(`[i18n] Missing translation key: "${key}"`);
}
```

---

### 5.8 🟠 `useTranslation.ts`: `replace()` Only Replaces First Occurrence

`translation.replace(`{{${rKey}}}`, ...)` uses a string (not a regex) — only replaces the first occurrence of the placeholder. If the same `{{key}}` appears multiple times in a translation string, only the first instance is substituted.

**Fix:** Use `new RegExp(`\{\{${rKey}\}\}`, 'g')` instead.

---

## 6. Visual Consistency Issues

### 6.1 🔴 `ForgotPasswordPage` and `UpdatePasswordPage`: No Dark Mode Styling

Both pages use only light mode classes (`bg-gray-50`, `bg-white`, `rounded-2xl`). Unlike `LoginPage.tsx` and `RegisterPage.tsx` which include `dark:bg-slate-950` / `dark:bg-slate-900`, the forgot/update password pages have no dark mode variants. Users who arrive at these pages in dark mode see a fully white, unthemed layout.

**Files:** `ForgotPasswordPage.tsx:17`, `UpdatePasswordPage.tsx:16`

---

### 6.2 🔴 `LandingHeader.tsx`: LTR-Only Hover Underline in RTL Layout

The navigation link underline effect uses `left-0 w-0 group-hover:w-full`. In RTL mode the underline grows from the wrong end (left-to-right instead of right-to-left), creating a broken animation.

**Fix:** Use `inset-x-auto` with `scaleX` transform:
```tsx
<span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 origin-right scale-x-0 group-hover:scale-x-100 rtl:origin-left transition-transform duration-300" />
```

---

### 6.3 🔴 `HeroSection.tsx`: `position: fixed` Background Blobs Bleed Through All Sections

The animated gradient blobs in `HeroSection` use `className="fixed inset-0 ..."`. Being `fixed`, they cover the entire viewport regardless of scroll position, bleeding visually through FeaturesSection, HowItWorksSection, and CTASection.

**File:** `HeroSection.tsx:18–37`

**Fix:** Change to `absolute` and contain them within the hero section's `overflow-hidden` boundary, or use a separate `fixed` background layer scoped to the landing page only.

---

### 6.4 🔴 `SettingsPage.tsx`: Active Menu Item Contrast Mismatch Between Light/Dark Modes

Active menu item: `bg-slate-900 text-white` in light mode vs. `dark:bg-blue-600/20 dark:text-blue-400` in dark mode. The light mode active state is a nearly black background with white text (high contrast, heavy feel), while dark mode shows a translucent blue with colored text (subtle). These are visually inconsistent design choices.

---

### 6.5 🔴 z-index Conflict: `AIChatButton` FAB Overlaps Toasts

`AIChatButton` FAB has `z-[9998]`. `FeedbackToast` has `z-[100]`. The AI button is always positioned at `bottom-20 md:bottom-6 left-6` while toasts are at `bottom-20 md:bottom-6 left-1/2`. On mobile, the FAB and toasts share the same bottom-left area, and the FAB will always render on top of any toast, blocking the toast's close button.

**Fix:** Align z-indices: either elevate toast container to `z-[9999]` or lower the FAB to `z-[150]` and set toast to `z-[160]`.

---

### 6.6 🟠 `Sidebar.tsx`: Mixed CSS Variable and Tailwind Dark Mode for Borders

`Sidebar.tsx:72` uses `dark:border-slate-800` directly while surrounding borders use `border-[var(--app-border)]`. This means the nav area divider always uses `slate-800` in dark mode regardless of the active theme preset (e.g., "Ocean" theme may define a different dark border color via `--app-border`).

---

### 6.7 🟠 `FeedbackToast.tsx`: Progress Bar `absolute` Positioning Has No `relative` Parent

The toast progress bar at the bottom of each toast card uses `absolute bottom-0 left-4 right-4`. The parent `<div>` with the toast content does not have `relative` class, so the bar positions relative to the nearest positioned ancestor — the fixed toast container — rather than the individual card. This can cause the bar to span across multiple toasts or outside the card boundary.

**File:** `FeedbackToast.tsx:19`

**Fix:** Add `relative` to the toast card wrapper div.

---

### 6.8 🟠 `SidebarNav`: Hover Direction Shift Only Applied to Non-Active Items

`!isActive && (dir === 'rtl' ? 'hover:-translate-x-1' : 'hover:translate-x-1')` — the hover nudge animation correctly respects RTL direction, but active items have no hover animation at all. This inconsistency means active items feel "dead" on hover.

---

### 6.9 🟠 `text-[7px]` / `text-[8px]` Usage Fails WCAG Minimum Size

Multiple components use sub-9px text that fails WCAG 2.1 minimum legibility guidelines. Identified locations:
- `SidebarLogo.tsx:26` — `text-[8px]`
- `Sidebar.tsx:106` — `text-[8px]`
- `HeaderActions.tsx` — `text-[8px]` on sync badge
- `MainLayout.tsx:172` — `text-[8px]` on mobile nav labels
- `FeedbackToast.tsx` — `text-[10px]` on technical details

While 10px may be acceptable for supplementary labels in some design systems, 7–8px is below any reasonable accessibility threshold.

---

### 6.10 🟠 `CTASection`: Auth Tab Underline Animation Incorrect in RTL

The animated underline in the Login/Register tab panel uses `animate={{ [dir === 'rtl' ? 'right' : 'left']: authTab === 'login' ? '0%' : '50%' }}`. This produces a non-standard framer-motion animate key (`'right'` or `'left'`) that will not animate smoothly as these are not valid framer-motion layout properties. The indicator may jump instead of slide.

**Fix:** Use a consistent `x` transform: `animate={{ x: authTab === 'login' ? '0%' : '100%' }}` with the element starting at `left-0` in LTR or `right-0` in RTL.

---

## 7. State Management Issues

### 7.1 🔴 Ctrl+K Conflict: Two Simultaneous Handlers

Both `AIChatButton.tsx` and `useSystemInitialization.ts` independently register `keydown` listeners for `Ctrl+K`. On the same keypress, both handlers fire: one opens the AI Command Center overlay and the other opens the Command Palette. The user sees both interfaces open simultaneously (or one immediately overrides the other depending on render order).

**Files:** `AIChatButton.tsx:14–22`, `useSystemInitialization.ts:~85–90`

**Fix:** Remove the `Ctrl+K` listener from `useSystemInitialization` (Command Palette). Keep only the `AIChatButton` handler. If the Command Palette needs a shortcut, assign it a different key (e.g., `Ctrl+P` or `Ctrl+/`).

---

### 7.2 🔴 `POSPage`: Direct `useSalesStore.setState()` Bypasses Action Layer

`onResume` handler calls `useSalesStore.setState({ items: draft.items, ... })` directly, bypassing any Zustand middleware (devtools, logging). This mutation is invisible to Redux DevTools and cannot be traced in the action history, making debugging session resumes difficult.

**Fix:** Add an explicit `resumeSession(draft)` action to `useSalesStore` and call that instead.

---

### 7.3 🟠 `SettingsPage.tsx`: `menuGroups` Creates Unstable Reference — Breaks Memoization

`menuGroups` is defined as a plain array inside the component body (not memoized). `filteredGroups` uses `useMemo([menuGroups, searchQuery])`. Since `menuGroups` is recreated on every render, the `useMemo` for `filteredGroups` recomputes on every render regardless of `searchQuery` changes — defeating the memoization entirely.

**Fix:** Wrap `menuGroups` in `useMemo` with `[t]` as its dependency.

---

### 7.4 🟠 `useRealtimeSync`: Realtime Channel Stored on `window` Global

`useRealtimeSync` stores Supabase realtime channels on `window.__ALZ_CHANNELS__`. This is a global mutable object that bypasses React's state and effect cleanup system. In multi-tab scenarios or after hot-module replacement (HMR), stale channels may accumulate without cleanup, causing duplicate data update handlers.

**Fix:** Use a module-level `Map` (singleton) instead of polluting the `window` object.

---

### 7.5 🟠 `settingsStore.ts`: No Server Sync Mechanism

All settings mutations (bank accounts, financial settings, integration settings) operate only on local Zustand state. There is no `supabase.from('...').upsert(...)` call in the store. If settings are supposed to persist to the database, they will be lost on device change or incognito mode. If they are intentionally local-only, this creates a divergence between different devices/users in the same company.

---

### 7.6 🟠 `notificationService`: `addNotification` Called From a Service Module

`notificationService.checkSystemHealth` calls `useNotificationStore.getState().addNotification(...)` from a non-component service module. While this pattern works, it creates a tight coupling between the service layer and a React store. Repeated health checks (every 10 min) will add notifications without deduplication — after 2+ checks, the same low-stock alert may appear multiple times.

**Fix:** Add deduplication logic based on `companyId + type + title` before calling `addNotification`.

---

## 8. API Integration Issues

### 8.1 🟠 `dashboardApi`: All 6 RPCs Use `as any` Type Casts

`dashboard/api/index.ts` casts both request params and response data with `as any` throughout. If any Supabase TypeScript types are generated (from `supabase gen types`), these casts suppress any type errors that would catch mismatched parameter names or missing required fields.

---

### 8.2 🟠 `authApi.getProfile`: Falls Back to `role: 'viewer'` on Profile Fetch Failure

In `store.ts:152–163`, if the profile fetch fails but a session exists, the user is created with `role: 'viewer'`. This means a temporary network failure during login could grant a user who should be `owner` or `admin` reduced permissions until the next app reload. The default role should match the user's actual role or show an error state.

---

### 8.3 🟠 `CustomerSegmentation` Receives Hardcoded Empty `companyId=""`

`DashboardPage.tsx:212` renders `<CustomerSegmentation companyId="" />`. Any API calls inside `CustomerSegmentation` that use `companyId` for RLS filtering will either return no data (empty company) or may bypass company scoping if the backend doesn't reject empty strings.

**Fix:** Pass the actual `user.company_id` from the auth store.

---

### 8.4 🟡 `supabaseClient.ts`: Abort Listeners Not Cleaned Up With `{ once: true }`

Abort event listeners on `AbortSignal` are registered without `{ once: true }` in some code paths. For long-lived `AbortController` objects, multiple listeners can stack up on repeated calls, creating memory leaks in Suspense-heavy routes.

---

## 9. Performance Issues

### 9.1 🟠 Route Prefetching Deferred to 30 Seconds — May Be Too Long on Slow Connections

`App.tsx:18` delays `prefetchCriticalRoutes()` by 30 seconds. On slow 3G connections where initial load takes 10–15 seconds, critical route prefetching may not complete before the user tries to navigate, causing lazy-load delays.

---

### 9.2 🟡 `SalesFlowChart` and `RevenueExpensesChart` Lazy-Loaded Without Data Dependency

These widgets are lazy-loaded but pass no data as props (they likely re-fetch internally). If they share data already fetched by `useDashboardMetrics`, this causes duplicate network requests. The dashboard data fetching strategy should be reviewed for request deduplication.

---

## 10. Accessibility

### 10.1 🟠 Missing `aria-live` on Toast Container

`FeedbackToast` renders dynamically appearing toasts but has no `aria-live="polite"` on the container. Screen readers will not announce new toasts to visually impaired users.

**Fix:** Add `aria-live="polite" aria-atomic="false"` to the toast container div.

---

### 10.2 🟠 Mobile Bottom Navigation Has No `role="navigation"` or `aria-label`

`MainLayout.tsx:153` renders a `<nav>` element for the mobile bottom bar but without an `aria-label`. With multiple navigation landmarks on the page (sidebar also has `<nav>`), screen readers cannot distinguish between them.

**Fix:** Add `aria-label="Mobile navigation"` (or equivalent Arabic translation).

---

### 10.3 🟡 `CommandPalette`: Mutable `let currentIndex` Inside Render

A `let currentIndex = -1` variable is mutated inside the JSX rendering loop. This is not idiomatic React and can cause subtle ordering bugs if React renders components out of order (e.g., concurrent mode). Use a flat array index instead:
```tsx
filteredActions.map((action, index) => ...)
```

---

## 11. Summary Priority Matrix

| # | Severity | Category | Issue | Files |
|---|----------|----------|-------|-------|
| 1 | 🔴 | Security | Auth session in `localStorage` (XSS-exposed) | `supabaseClient.ts` |
| 2 | 🔴 | Security | Mock client silently authenticates in misconfigured env | `supabaseClient.ts` |
| 3 | 🔴 | Security | `isOwner` is client-side only — Settings route unprotected | `SidebarNav.tsx`, `routes.tsx` |
| 4 | 🔴 | Security | Integration settings persisted to `localStorage` | `settingsStore.ts` |
| 5 | 🔴 | Security | `useAuthStore.getState()` in `useCallback` — stale `company_id` | `POSPage.tsx` |
| 6 | 🔴 | Security | Empty `company_id` passed to search — RLS bypass risk | `POSPage.tsx` |
| 7 | 🔴 | Auth | `UpdatePasswordPage` in `GuestGuard` breaks password reset | `routes.tsx` |
| 8 | 🔴 | Auth | Double redirect: `AuthGuard → /login → /welcome` | `AuthGuard.tsx`, `routes.tsx` |
| 9 | 🔴 | State | Ctrl+K conflict: AI panel + Command Palette both open | `AIChatButton.tsx`, `useSystemInitialization.ts` |
| 10 | 🔴 | State | Direct `setState()` in POS bypasses action layer | `POSPage.tsx` |
| 11 | 🔴 | i18n | Landing page: 0% string coverage through `t()` | All `landing/` components |
| 12 | 🔴 | Visual | `ForgotPasswordPage` + `UpdatePasswordPage` missing dark mode | Both auth pages |
| 13 | 🔴 | Visual | Fixed blobs in `HeroSection` bleed through all sections | `HeroSection.tsx` |
| 14 | 🔴 | Cohesion | Dual theme system — landing uses Tailwind dark, app uses CSS vars | `LandingPage.tsx`, `MainLayout.tsx` |
| 15 | 🔴 | Cohesion | Font mismatch: `font-sans` (landing) vs `font-cairo` (app) | `LandingPage.tsx`, `MainLayout.tsx` |
| 16 | 🔴 | Cohesion | APP_VERSION `1.0.0` vs hardcoded `v2.0` — out of sync | `constants.ts`, `SettingsPage.tsx` |
| 17 | 🔴 | i18n | `HeaderActions` profile dropdown hardcoded Arabic | `HeaderActions.tsx` |
| 18 | 🔴 | i18n | `SettingsPage` mixed i18n — most labels hardcoded | `SettingsPage.tsx` |
| 19 | 🟠 | Security | `resetPasswordForEmail` lacks `redirectTo` | `auth/api.ts` |
| 20 | 🟠 | Security | `isValidSupabaseUrl` missing HTTPS check | `supabaseClient.ts` |
| 21 | 🟠 | Auth | "Remember Me" checkbox non-functional | `LoginPage.tsx` |
| 22 | 🟠 | Routing | Global search hardcoded to `/inventory` | `Header.tsx` |
| 23 | 🟠 | Routing | Dead component `HeaderSearch.tsx` never imported | `header/HeaderSearch.tsx` |
| 24 | 🟠 | Routing | Landing nav item "Prices" is a no-op | `LandingHeader.tsx` |
| 25 | 🟠 | Visual | LTR-only hover underline in RTL landing header | `LandingHeader.tsx` |
| 26 | 🟠 | Visual | z-index conflict: FAB overlaps toasts | `AIChatButton.tsx`, `FeedbackToast.tsx` |
| 27 | 🟠 | Visual | Progress bar in toast has no `relative` parent | `FeedbackToast.tsx` |
| 28 | 🟠 | State | `menuGroups` not memoized — breaks `filteredGroups` | `SettingsPage.tsx` |
| 29 | 🟠 | State | Realtime channel stored on `window` global | `useRealtimeSync.ts` |
| 30 | 🟠 | State | Settings store has no server sync mechanism | `settingsStore.ts` |
| 31 | 🟠 | API | `CustomerSegmentation` receives empty `companyId=""` | `DashboardPage.tsx` |
| 32 | 🟠 | Cohesion | App logo uses generic `Car` icon — no real brand asset | Multiple files |

---

## 12. Recommended Remediation Order

### Immediate (Block Production)
1. Fix `UpdatePasswordPage` → remove from `GuestGuard`
2. Fix Ctrl+K conflict → assign separate shortcuts
3. Fix `CustomerSegmentation companyId=""` → wire real value
4. Fix toast progress bar `relative` parent
5. Fix `resetPasswordForEmail` → add `redirectTo`
6. Fix `isValidSupabaseUrl` → add HTTPS check
7. Synchronize `APP_VERSION` — single source of truth

### Sprint 1 (Security Hardening)
8. Add `RoleGuard` to `/settings` route
9. Exclude `integration` from `settingsStore` persistence
10. Replace `useAuthStore.getState()` in POS with component-level hook
11. Fix POS `company_id` empty string
12. Add `createMockClient` DEV-only guard

### Sprint 2 (i18n Completion)
13. Pass all landing page strings through `t()`
14. Complete `HeaderActions` profile dropdown i18n
15. Complete `SettingsPage` menuGroups i18n
16. Fix `useTranslation.t()` regex replacement and DEV warnings

### Sprint 3 (Visual Polish)
17. Add dark mode to `ForgotPasswordPage` and `UpdatePasswordPage`
18. Fix `HeroSection` fixed blobs → scoped to section
19. Fix LTR-only hover underlines in `LandingHeader`
20. Align z-index hierarchy (FAB, toasts, modals)
21. Replace `Car` icon with a real `BrandLogo` component
22. Fix font system: unify `font-cairo` across both interfaces

---

*Report generated from static analysis of `src/` at commit HEAD. All findings are based on code review without runtime execution.*
