-- ============================================================
-- Migration: Add RLS Policies to Remaining Tables + Fix Conflicting Policies
-- Date: 2026-08-02
-- ============================================================
-- This migration adds Row Level Security policies to all tables
-- that currently lack RLS, ensuring complete tenant isolation.
-- Also fixes conflicting policies on audit_items and purchase_items.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- FIX: AUDIT_ITEMS — conflicting policies
-- 20260730000006 had company-filtered policies but audit_items
-- has no direct company_id column. 20260801000000 replaced them
-- with USING(true). Replace with EXISTS-join to audit_sessions.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_items_select" ON public.audit_items;
CREATE POLICY "audit_items_select" ON public.audit_items
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.audit_sessions s
            WHERE s.id = audit_items.session_id
            AND s.company_id = public.get_user_company_id()
        )
    );

DROP POLICY IF EXISTS "audit_items_insert" ON public.audit_items;
CREATE POLICY "audit_items_insert" ON public.audit_items
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.audit_sessions s
            WHERE s.id = audit_items.session_id
            AND s.company_id = public.get_user_company_id()
            AND public.user_is_admin_or_manager()
        )
    );

DROP POLICY IF EXISTS "audit_items_update" ON public.audit_items;
CREATE POLICY "audit_items_update" ON public.audit_items
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.audit_sessions s
            WHERE s.id = audit_items.session_id
            AND s.company_id = public.get_user_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.audit_sessions s
            WHERE s.id = audit_items.session_id
            AND s.company_id = public.get_user_company_id()
            AND public.user_is_admin_or_manager()
        )
    );

DROP POLICY IF EXISTS "audit_items_delete" ON public.audit_items;
CREATE POLICY "audit_items_delete" ON public.audit_items
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.audit_sessions s
            WHERE s.id = audit_items.session_id
            AND s.company_id = public.get_user_company_id()
            AND public.get_user_role() = 'admin'
        )
    );

-- ────────────────────────────────────────────────────────────
-- FIX: PURCHASE_ITEMS — replace USING(true) with company filter
-- purchase_items references purchases which has company_id
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "purchase_items_select" ON public.purchase_items;
CREATE POLICY "purchase_items_select" ON public.purchase_items
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.purchases p
            WHERE p.id = purchase_items.purchase_id
            AND p.company_id = public.get_user_company_id()
        )
    );

DROP POLICY IF EXISTS "purchase_items_insert" ON public.purchase_items;
CREATE POLICY "purchase_items_insert" ON public.purchase_items
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.purchases p
            WHERE p.id = purchase_items.purchase_id
            AND p.company_id = public.get_user_company_id()
        )
    );

DROP POLICY IF EXISTS "purchase_items_update" ON public.purchase_items;
CREATE POLICY "purchase_items_update" ON public.purchase_items
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.purchases p
            WHERE p.id = purchase_items.purchase_id
            AND p.company_id = public.get_user_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.purchases p
            WHERE p.id = purchase_items.purchase_id
            AND p.company_id = public.get_user_company_id()
        )
    );

DROP POLICY IF EXISTS "purchase_items_delete" ON public.purchase_items;
CREATE POLICY "purchase_items_delete" ON public.purchase_items
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.purchases p
            WHERE p.id = purchase_items.purchase_id
            AND p.company_id = public.get_user_company_id()
            AND public.get_user_role() = 'admin'
        )
    );

-- ============================================================
-- JOURNAL_ENTRY_LINES TABLE (has direct company_id)
-- ============================================================
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journal_entry_lines_select" ON public.journal_entry_lines;
CREATE POLICY "journal_entry_lines_select" ON public.journal_entry_lines
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "journal_entry_lines_insert" ON public.journal_entry_lines;
CREATE POLICY "journal_entry_lines_insert" ON public.journal_entry_lines
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.get_user_role() IN ('admin', 'manager', 'accountant')
    );

DROP POLICY IF EXISTS "journal_entry_lines_update" ON public.journal_entry_lines;
CREATE POLICY "journal_entry_lines_update" ON public.journal_entry_lines
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.get_user_role() IN ('admin', 'manager', 'accountant')
    );

DROP POLICY IF EXISTS "journal_entry_lines_delete" ON public.journal_entry_lines;
CREATE POLICY "journal_entry_lines_delete" ON public.journal_entry_lines
    FOR DELETE
    TO authenticated
    USING (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );

-- ============================================================
-- INVOICE_ITEMS TABLE (has direct company_id)
-- ============================================================
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_select" ON public.invoice_items;
CREATE POLICY "invoice_items_select" ON public.invoice_items
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "invoice_items_insert" ON public.invoice_items;
CREATE POLICY "invoice_items_insert" ON public.invoice_items
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "invoice_items_update" ON public.invoice_items;
CREATE POLICY "invoice_items_update" ON public.invoice_items
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "invoice_items_delete" ON public.invoice_items;
CREATE POLICY "invoice_items_delete" ON public.invoice_items
    FOR DELETE
    TO authenticated
    USING (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );

-- ============================================================
-- PAYMENTS TABLE (has direct company_id)
-- ============================================================
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "payments_insert" ON public.payments;
CREATE POLICY "payments_insert" ON public.payments
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "payments_update" ON public.payments;
CREATE POLICY "payments_update" ON public.payments
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "payments_delete" ON public.payments;
CREATE POLICY "payments_delete" ON public.payments
    FOR DELETE
    TO authenticated
    USING (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );

-- ============================================================
-- INVENTORY_TRANSACTIONS TABLE (has direct company_id)
-- ============================================================
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_transactions_select" ON public.inventory_transactions;
CREATE POLICY "inventory_transactions_select" ON public.inventory_transactions
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "inventory_transactions_insert" ON public.inventory_transactions;
CREATE POLICY "inventory_transactions_insert" ON public.inventory_transactions
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "inventory_transactions_update" ON public.inventory_transactions;
CREATE POLICY "inventory_transactions_update" ON public.inventory_transactions
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "inventory_transactions_delete" ON public.inventory_transactions;
CREATE POLICY "inventory_transactions_delete" ON public.inventory_transactions
    FOR DELETE
    TO authenticated
    USING (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );

-- ============================================================
-- EXPENSE_CATEGORIES TABLE (has direct company_id)
-- ============================================================
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expense_categories_select" ON public.expense_categories;
CREATE POLICY "expense_categories_select" ON public.expense_categories
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "expense_categories_insert" ON public.expense_categories;
CREATE POLICY "expense_categories_insert" ON public.expense_categories
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.user_is_admin_or_manager()
    );

DROP POLICY IF EXISTS "expense_categories_update" ON public.expense_categories;
CREATE POLICY "expense_categories_update" ON public.expense_categories
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.user_is_admin_or_manager()
    );

DROP POLICY IF EXISTS "expense_categories_delete" ON public.expense_categories;
CREATE POLICY "expense_categories_delete" ON public.expense_categories
    FOR DELETE
    TO authenticated
    USING (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );

-- ============================================================
-- PRODUCT_CATEGORIES TABLE (has direct company_id)
-- ============================================================
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_categories_select" ON public.product_categories;
CREATE POLICY "product_categories_select" ON public.product_categories
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "product_categories_insert" ON public.product_categories;
CREATE POLICY "product_categories_insert" ON public.product_categories
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.user_is_admin_or_manager()
    );

DROP POLICY IF EXISTS "product_categories_update" ON public.product_categories;
CREATE POLICY "product_categories_update" ON public.product_categories
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.user_is_admin_or_manager()
    );

DROP POLICY IF EXISTS "product_categories_delete" ON public.product_categories;
CREATE POLICY "product_categories_delete" ON public.product_categories
    FOR DELETE
    TO authenticated
    USING (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );

-- ============================================================
-- FISCAL_YEARS TABLE (has direct company_id)
-- ============================================================
ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_years_select" ON public.fiscal_years;
CREATE POLICY "fiscal_years_select" ON public.fiscal_years
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "fiscal_years_insert" ON public.fiscal_years;
CREATE POLICY "fiscal_years_insert" ON public.fiscal_years
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.get_user_role() IN ('admin', 'accountant')
    );

DROP POLICY IF EXISTS "fiscal_years_update" ON public.fiscal_years;
CREATE POLICY "fiscal_years_update" ON public.fiscal_years
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.get_user_role() IN ('admin', 'accountant')
    );

DROP POLICY IF EXISTS "fiscal_years_delete" ON public.fiscal_years;
CREATE POLICY "fiscal_years_delete" ON public.fiscal_years
    FOR DELETE
    TO authenticated
    USING (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );

-- ============================================================
-- MONTHLY_TARGETS TABLE (has direct company_id)
-- ============================================================
ALTER TABLE public.monthly_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monthly_targets_select" ON public.monthly_targets;
CREATE POLICY "monthly_targets_select" ON public.monthly_targets
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "monthly_targets_insert" ON public.monthly_targets;
CREATE POLICY "monthly_targets_insert" ON public.monthly_targets
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.user_is_admin_or_manager()
    );

DROP POLICY IF EXISTS "monthly_targets_update" ON public.monthly_targets;
CREATE POLICY "monthly_targets_update" ON public.monthly_targets
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.user_is_admin_or_manager()
    );

DROP POLICY IF EXISTS "monthly_targets_delete" ON public.monthly_targets;
CREATE POLICY "monthly_targets_delete" ON public.monthly_targets
    FOR DELETE
    TO authenticated
    USING (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );

-- ============================================================
-- SUSPENDED_ORDERS TABLE (has direct company_id)
-- ============================================================
ALTER TABLE public.suspended_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suspended_orders_select" ON public.suspended_orders;
CREATE POLICY "suspended_orders_select" ON public.suspended_orders
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "suspended_orders_insert" ON public.suspended_orders;
CREATE POLICY "suspended_orders_insert" ON public.suspended_orders
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "suspended_orders_update" ON public.suspended_orders;
CREATE POLICY "suspended_orders_update" ON public.suspended_orders
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "suspended_orders_delete" ON public.suspended_orders;
CREATE POLICY "suspended_orders_delete" ON public.suspended_orders
    FOR DELETE
    TO authenticated
    USING (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );

-- ============================================================
-- BACKUP_CONFIGS TABLE (company_id is PK)
-- ============================================================
ALTER TABLE public.backup_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backup_configs_select" ON public.backup_configs;
CREATE POLICY "backup_configs_select" ON public.backup_configs
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "backup_configs_insert" ON public.backup_configs;
CREATE POLICY "backup_configs_insert" ON public.backup_configs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );

DROP POLICY IF EXISTS "backup_configs_update" ON public.backup_configs;
CREATE POLICY "backup_configs_update" ON public.backup_configs
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );

DROP POLICY IF EXISTS "backup_configs_delete" ON public.backup_configs;
CREATE POLICY "backup_configs_delete" ON public.backup_configs
    FOR DELETE
    TO authenticated
    USING (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );

-- ============================================================
-- BACKUP_LOGS TABLE (has direct company_id)
-- ============================================================
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backup_logs_select" ON public.backup_logs;
CREATE POLICY "backup_logs_select" ON public.backup_logs
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "backup_logs_insert" ON public.backup_logs;
CREATE POLICY "backup_logs_insert" ON public.backup_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "backup_logs_delete" ON public.backup_logs;
CREATE POLICY "backup_logs_delete" ON public.backup_logs
    FOR DELETE
    TO authenticated
    USING (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );

-- ============================================================
-- BRANCHES TABLE (has direct company_id)
-- ============================================================
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branches_select" ON public.branches;
CREATE POLICY "branches_select" ON public.branches
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "branches_insert" ON public.branches;
CREATE POLICY "branches_insert" ON public.branches
    FOR INSERT
    TO authenticated
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.user_is_admin_or_manager()
    );

DROP POLICY IF EXISTS "branches_update" ON public.branches;
CREATE POLICY "branches_update" ON public.branches
    FOR UPDATE
    TO authenticated
    USING (company_id = public.get_user_company_id())
    WITH CHECK (
        company_id = public.get_user_company_id()
        AND public.user_is_admin_or_manager()
    );

DROP POLICY IF EXISTS "branches_delete" ON public.branches;
CREATE POLICY "branches_delete" ON public.branches
    FOR DELETE
    TO authenticated
    USING (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );

-- ============================================================
-- FILE_ATTACHMENTS TABLE (if it exists)
-- ============================================================
ALTER TABLE IF EXISTS public.file_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "file_attachments_select" ON public.file_attachments;
CREATE POLICY "file_attachments_select" ON public.file_attachments
    FOR SELECT
    TO authenticated
    USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "file_attachments_insert" ON public.file_attachments;
CREATE POLICY "file_attachments_insert" ON public.file_attachments
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "file_attachments_delete" ON public.file_attachments;
CREATE POLICY "file_attachments_delete" ON public.file_attachments
    FOR DELETE
    TO authenticated
    USING (
        company_id = public.get_user_company_id()
        AND public.get_user_role() = 'admin'
    );
