-- ============================================================
-- Migration: Optimize Product Search (Fuzzy & Multi-Attribute)
-- Date: 2026-07-31
-- ============================================================

-- 1. Enable pg_trgm extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Add global_search_text column to products table
-- We use a regular text column and a trigger because GENERATED ALWAYS AS 
-- cannot easily be modified if the table definition changes, but since this is 
-- Postgres 12+, we CAN use GENERATED ALWAYS AS. Let's use it for simplicity.
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS global_search_text text GENERATED ALWAYS AS (
    COALESCE(name_ar, '') || ' ' || 
    COALESCE(sku, '') || ' ' || 
    COALESCE(part_number, '') || ' ' || 
    COALESCE(alternative_numbers, '') || ' ' || 
    COALESCE(size, '') || ' ' || 
    COALESCE(brand, '') || ' ' ||
    COALESCE(description, '') || ' ' ||
    COALESCE(specifications, '') || ' ' ||
    COALESCE(location, '') || ' ' ||
    COALESCE(barcode, '')
) STORED;

-- 3. Create a GIN index on global_search_text using gin_trgm_ops
CREATE INDEX IF NOT EXISTS idx_products_global_search 
ON public.products USING gin (global_search_text gin_trgm_ops);

-- 4. search_inventory RPC (REMOVED - redefined with better signature in migration 20260802000005)
-- The global_search_text column and gin_trgm index remain in place and
-- are used by the search_inventory redefinition in 20260802000005.
-- DROP FUNCTION IF EXISTS public.search_inventory(text, uuid);
