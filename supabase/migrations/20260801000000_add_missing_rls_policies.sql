-- ============================================================
-- Migration: Add Missing RLS Policies for Remaining Tables
-- Date: 2026-08-01
-- ============================================================
-- This migration adds RLS policies to tables that were missed
-- in the previous migration (20260730000001).
-- It also adds a policy preventing users from changing their role.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- PURCHASES / PURCHASE INVOICES TABLE
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchases_select" ON public.purchases;
CREATE POLICY "purchases_select" ON public.purchases
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "purchases_insert" ON public.purchases;
CREATE POLICY "purchases_insert" ON public.purchases
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "purchases_update" ON public.purchases;
CREATE POLICY "purchases_update" ON public.purchases
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (company_id = public.get_user_company_id());

-- ────────────────────────────────────────────────────────────
-- PURCHASE ITEMS TABLE
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_items_select" ON public.purchase_items;
CREATE POLICY "purchase_items_select" ON public.purchase_items
    FOR SELECT
    TO authenticated
    USING (true); -- Filtered via parent purchase

DROP POLICY IF EXISTS "purchase_items_insert" ON public.purchase_items;
CREATE POLICY "purchase_items_insert" ON public.purchase_items
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- RETURNS TABLE
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "returns_select" ON public.returns;
CREATE POLICY "returns_select" ON public.returns
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "returns_insert" ON public.returns;
CREATE POLICY "returns_insert" ON public.returns
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "returns_update" ON public.returns;
CREATE POLICY "returns_update" ON public.returns
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (company_id = public.get_user_company_id());

-- ────────────────────────────────────────────────────────────
-- BONDS TABLE
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.bonds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bonds_select" ON public.bonds;
CREATE POLICY "bonds_select" ON public.bonds
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "bonds_insert" ON public.bonds;
CREATE POLICY "bonds_insert" ON public.bonds
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.get_user_role() IN ('admin', 'manager', 'accountant')
    );

-- ────────────────────────────────────────────────────────────
-- STOCK MOVEMENTS TABLE
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_movements_select" ON public.stock_movements;
CREATE POLICY "stock_movements_select" ON public.stock_movements
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "stock_movements_insert" ON public.stock_movements;
CREATE POLICY "stock_movements_insert" ON public.stock_movements
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.user_is_admin_or_manager()
    );

-- ────────────────────────────────────────────────────────────
-- TRANSFERS TABLE
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transfers_select" ON public.transfers;
CREATE POLICY "transfers_select" ON public.transfers
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "transfers_insert" ON public.transfers;
CREATE POLICY "transfers_insert" ON public.transfers
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.user_is_admin_or_manager()
    );

-- ────────────────────────────────────────────────────────────
-- AUDIT SESSIONS TABLE
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.audit_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_sessions_select" ON public.audit_sessions;
CREATE POLICY "audit_sessions_select" ON public.audit_sessions
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "audit_sessions_insert" ON public.audit_sessions;
CREATE POLICY "audit_sessions_insert" ON public.audit_sessions
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "audit_sessions_update" ON public.audit_sessions;
CREATE POLICY "audit_sessions_update" ON public.audit_sessions
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (company_id = public.get_user_company_id());

-- ────────────────────────────────────────────────────────────
-- AUDIT ITEMS TABLE
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.audit_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_items_select" ON public.audit_items;
CREATE POLICY "audit_items_select" ON public.audit_items
    FOR SELECT
    TO authenticated
    USING (true); -- Filtered via parent audit_session

DROP POLICY IF EXISTS "audit_items_insert" ON public.audit_items;
CREATE POLICY "audit_items_insert" ON public.audit_items
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "audit_items_update" ON public.audit_items;
CREATE POLICY "audit_items_update" ON public.audit_items
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- CASHBOXES TABLE
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.cashboxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cashboxes_select" ON public.cashboxes;
CREATE POLICY "cashboxes_select" ON public.cashboxes
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "cashboxes_insert" ON public.cashboxes;
CREATE POLICY "cashboxes_insert" ON public.cashboxes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.user_is_admin_or_manager()
    );

DROP POLICY IF EXISTS "cashboxes_update" ON public.cashboxes;
CREATE POLICY "cashboxes_update" ON public.cashboxes
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.user_is_admin_or_manager()
    );

-- ────────────────────────────────────────────────────────────
-- PAYMENT ALLOCATIONS TABLE
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_allocations_select" ON public.payment_allocations;
CREATE POLICY "payment_allocations_select" ON public.payment_allocations
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "payment_allocations_insert" ON public.payment_allocations;
CREATE POLICY "payment_allocations_insert" ON public.payment_allocations
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = public.get_user_company_id());

-- ────────────────────────────────────────────────────────────
-- QUOTATIONS TABLE
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotations_select" ON public.quotations;
CREATE POLICY "quotations_select" ON public.quotations
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "quotations_insert" ON public.quotations;
CREATE POLICY "quotations_insert" ON public.quotations
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "quotations_update" ON public.quotations;
CREATE POLICY "quotations_update" ON public.quotations
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (company_id = public.get_user_company_id());

-- ────────────────────────────────────────────────────────────
-- PREVENT USER ROLE CHANGES (Security Fix)
-- Users should NOT be able to change their own role
-- Only admins (via a SECURITY DEFINER RPC) should manage roles
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_profiles_prevent_role_change" ON public.user_profiles;
CREATE POLICY "user_profiles_prevent_role_change" ON public.user_profiles
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND (
            -- Prevent role change via direct update
            role = (SELECT role FROM public.user_profiles WHERE id = auth.uid())
            -- Allow admin to change roles via RPC only (SECURITY DEFINER bypasses this policy)
        )
    );

-- ────────────────────────────────────────────────────────────
-- RPC: check_permission — server-side permission check
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_permission(
    p_resource TEXT,
    p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM public.user_profiles WHERE id = auth.uid();

    RETURN public.has_role_permission(user_role, p_resource, p_action);
END;
$$;

-- Helper: role-permission mapping
CREATE OR REPLACE FUNCTION public.has_role_permission(
    p_role TEXT,
    p_resource TEXT,
    p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Admin has full access
    IF p_role = 'admin' THEN
        RETURN TRUE;
    END IF;

    -- Manager: full access except delete
    IF p_role = 'manager' THEN
        RETURN p_action <> 'delete';
    END IF;

    -- Accountant: read/write accounting, read others
    IF p_role = 'accountant' THEN
        IF p_resource IN ('accounting', 'expenses') THEN
            RETURN p_action IN ('create', 'read', 'update');
        END IF;
        RETURN p_action = 'read';
    END IF;

    -- Sales: create/read sales and customers, read inventory
    IF p_role = 'sales' THEN
        IF p_resource IN ('sales', 'customers') THEN
            RETURN p_action IN ('create', 'read');
        END IF;
        IF p_resource = 'inventory' THEN
            RETURN p_action = 'read';
        END IF;
        RETURN FALSE;
    END IF;

    -- Viewer: read only
    IF p_role = 'viewer' THEN
        RETURN p_action = 'read';
    END IF;

    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_permission(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_permission(TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.check_permission(TEXT, TEXT) IS 'Server-side permission check. Returns true if the authenticated user has the specified permission on the resource.';
COMMENT ON FUNCTION public.has_role_permission(TEXT, TEXT, TEXT) IS 'Helper function mapping role + resource + action to a boolean permission result.';