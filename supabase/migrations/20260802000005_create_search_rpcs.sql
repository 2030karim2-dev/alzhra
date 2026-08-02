-- Migration: Search RPCs
-- search_inventory, get_popular_products, get_monthly_performance

-- 1. Search Inventory (advanced product search with ILIKE and normalized Arabic)
DROP FUNCTION IF EXISTS public.search_inventory(text, uuid);
CREATE OR REPLACE FUNCTION public.search_inventory(
  p_company_id uuid,
  p_query text DEFAULT '',
  p_limit integer DEFAULT 50
) RETURNS TABLE(
  id uuid,
  name_ar text,
  sku text,
  part_number text,
  brand text,
  sale_price numeric,
  cost_price numeric,
  barcode text,
  category_name text,
  total_stock numeric,
  min_stock_level integer,
  status text,
  image_url text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  IF p_query = '' OR p_query IS NULL THEN
    RETURN QUERY
    SELECT 
      p.id, p.name_ar, p.sku, p.part_number, p.brand,
      p.sale_price, p.cost_price, p.barcode,
      pc.name as category_name,
      COALESCE(SUM(ps.quantity), 0) as total_stock,
      p.min_stock_level, p.status, p.image_url
    FROM public.products p
    LEFT JOIN public.product_categories pc ON pc.id = p.category_id
    LEFT JOIN public.product_stock ps ON ps.product_id = p.id AND ps.company_id = p.company_id
    WHERE p.company_id = p_company_id AND p.deleted_at IS NULL AND p.status = 'active'
    GROUP BY p.id, p.name_ar, p.sku, p.part_number, p.brand, p.sale_price, p.cost_price,
             p.barcode, pc.name, p.min_stock_level, p.status, p.image_url
    ORDER BY p.updated_at DESC
    LIMIT p_limit;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    p.id, p.name_ar, p.sku, p.part_number, p.brand,
    p.sale_price, p.cost_price, p.barcode,
    pc.name as category_name,
    COALESCE(SUM(ps.quantity), 0) as total_stock,
    p.min_stock_level, p.status, p.image_url
  FROM public.products p
  LEFT JOIN public.product_categories pc ON pc.id = p.category_id
  LEFT JOIN public.product_stock ps ON ps.product_id = p.id AND ps.company_id = p.company_id
  WHERE p.company_id = p_company_id
    AND p.deleted_at IS NULL
    AND p.status = 'active'
    AND (
      p.name_ar ILIKE '%' || p_query || '%'
      OR p.sku ILIKE '%' || p_query || '%'
      OR p.part_number ILIKE '%' || p_query || '%'
      OR p.barcode ILIKE '%' || p_query || '%'
      OR p.alternative_numbers ILIKE '%' || p_query || '%'
      OR p.brand ILIKE '%' || p_query || '%'
      OR p.global_search_text ILIKE '%' || p_query || '%'
    )
  GROUP BY p.id, p.name_ar, p.sku, p.part_number, p.brand, p.sale_price, p.cost_price,
           p.barcode, pc.name, p.min_stock_level, p.status, p.image_url
  ORDER BY p.updated_at DESC
  LIMIT p_limit;
END;
$$;


-- 2. Get Popular Products (for POS default view)
CREATE OR REPLACE FUNCTION public.get_popular_products(
  p_company_id uuid,
  p_limit integer DEFAULT 20
) RETURNS TABLE(
  id uuid,
  name_ar text,
  sku text,
  part_number text,
  brand text,
  sale_price numeric,
  cost_price numeric,
  barcode text,
  category_name text,
  total_stock numeric,
  min_stock_level integer,
  status text,
  image_url text,
  sales_count bigint
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  RETURN QUERY
  SELECT 
    p.id, p.name_ar, p.sku, p.part_number, p.brand,
    p.sale_price, p.cost_price, p.barcode,
    pc.name as category_name,
    COALESCE(SUM(ps.quantity), 0) as total_stock,
    p.min_stock_level, p.status, p.image_url,
    COUNT(ii.id) as sales_count
  FROM public.products p
  LEFT JOIN public.invoice_items ii ON ii.product_id = p.id
  LEFT JOIN public.invoices i ON i.id = ii.invoice_id
    AND i.type = 'sale' AND i.status IN ('posted', 'paid', 'partially_paid') AND i.deleted_at IS NULL
  LEFT JOIN public.product_categories pc ON pc.id = p.category_id
  LEFT JOIN public.product_stock ps ON ps.product_id = p.id AND ps.company_id = p.company_id
  WHERE p.company_id = p_company_id
    AND p.deleted_at IS NULL
    AND p.status = 'active'
  GROUP BY p.id, p.name_ar, p.sku, p.part_number, p.brand, p.sale_price, p.cost_price,
           p.barcode, pc.name, p.min_stock_level, p.status, p.image_url
  ORDER BY sales_count DESC, p.updated_at DESC
  LIMIT p_limit;
END;
$$;


-- 3. Monthly Performance
DROP FUNCTION IF EXISTS get_monthly_performance(UUID, INT, UUID);
CREATE OR REPLACE FUNCTION public.get_monthly_performance(
  p_company_id uuid,
  p_year integer DEFAULT NULL,
  p_month integer DEFAULT NULL
) RETURNS TABLE(
  year integer,
  month integer,
  total_sales numeric,
  total_expenses numeric,
  net_profit numeric,
  invoice_count integer
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_year integer := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::integer);
  v_month integer := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::integer);
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  RETURN QUERY
  SELECT 
    EXTRACT(YEAR FROM i.issue_date)::integer,
    EXTRACT(MONTH FROM i.issue_date)::integer,
    COALESCE(SUM(i.total_amount), 0) as total_sales,
    COALESCE((SELECT SUM(e.amount) FROM public.expenses e
      WHERE e.company_id = p_company_id AND e.status = 'posted' AND e.deleted_at IS NULL
      AND EXTRACT(YEAR FROM e.expense_date)::integer = v_year
      AND EXTRACT(MONTH FROM e.expense_date)::integer = v_month), 0) as total_expenses,
    COALESCE(SUM(i.total_amount), 0) - COALESCE((SELECT SUM(e.amount) FROM public.expenses e
      WHERE e.company_id = p_company_id AND e.status = 'posted' AND e.deleted_at IS NULL
      AND EXTRACT(YEAR FROM e.expense_date)::integer = v_year
      AND EXTRACT(MONTH FROM e.expense_date)::integer = v_month), 0) as net_profit,
    COUNT(i.id) as invoice_count
  FROM public.invoices i
  WHERE i.company_id = p_company_id
    AND i.type = 'sale'
    AND i.status IN ('posted', 'paid', 'partially_paid')
    AND i.deleted_at IS NULL
    AND EXTRACT(YEAR FROM i.issue_date)::integer = v_year
    AND EXTRACT(MONTH FROM i.issue_date)::integer = v_month
  GROUP BY EXTRACT(YEAR FROM i.issue_date)::integer, EXTRACT(MONTH FROM i.issue_date)::integer;
END;
$$;
