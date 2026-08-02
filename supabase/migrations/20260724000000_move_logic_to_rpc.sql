-- ============================================================
-- Migration: Move Frontend Business Logic to PostgreSQL RPCs
-- Date: 2026-07-24
-- ============================================================
-- This migration moves three heavy computations from the React
-- frontend into Postgres RPC functions, following the
-- "Thick Database" architecture already in use for dashboard,
-- sales, purchases, and accounting.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. get_low_stock_products
--    Replaces: computeLowStockProducts() in dashboard/hooks/index.ts
--    Purpose: Return products where stock <= min_stock_level
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_low_stock_products(
    p_company_id UUID,
    p_branch_id  UUID DEFAULT NULL
)
RETURNS TABLE (
    id           UUID,
    name_ar      TEXT,
    quantity     NUMERIC,
    min_quantity NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.name_ar,
        COALESCE(SUM(ps.quantity), 0)                        AS quantity,
        COALESCE(NULLIF(p.min_stock_level, 0)::NUMERIC, 5)   AS min_quantity
    FROM products p
    LEFT JOIN product_stock ps ON ps.product_id = p.id
        AND (p_branch_id IS NULL OR ps.warehouse_id IN (
            SELECT id FROM warehouses WHERE branch_id = p_branch_id
        ))
    WHERE p.company_id = p_company_id
      AND p.status = 'active'
    GROUP BY p.id, p.name_ar, p.min_stock_level
    HAVING COALESCE(SUM(ps.quantity), 0) <= COALESCE(NULLIF(p.min_stock_level, 0)::NUMERIC, 5)
    ORDER BY quantity ASC
    LIMIT 50;
END;
$$;

COMMENT ON FUNCTION get_low_stock_products(UUID, UUID) IS
'Returns products whose current stock is at or below their minimum stock level.
Replaces the JS computeLowStockProducts() helper in the React frontend.';

GRANT EXECUTE ON FUNCTION get_low_stock_products(UUID, UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 2. get_expense_categories_summary (REMOVED - redefined in migration 20260802000001)
--    Replaced by: public.get_expense_categories_summary(
--      p_company_id uuid, p_date_from date DEFAULT NULL,
--      p_date_to date DEFAULT NULL, p_branch_id uuid DEFAULT NULL
--    ) RETURNS TABLE(name text, value numeric, color text)
-- ────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS get_expense_categories_summary(UUID, DATE, DATE, UUID);


-- ────────────────────────────────────────────────────────────
-- 2. get_monthly_performance (REMOVED - redefined in migration 20260802000005)
--    Replaced by: public.get_monthly_performance(
--      p_company_id uuid, p_year integer DEFAULT NULL,
--      p_month integer DEFAULT NULL
--    ) RETURNS TABLE(year integer, month integer, total_sales numeric,
--                    total_expenses numeric, net_profit numeric, invoice_count integer)
-- ────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS get_monthly_performance(UUID, INT, UUID);
