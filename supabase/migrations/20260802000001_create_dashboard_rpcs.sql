-- Migration: Dashboard RPCs (get_dashboard_summary, get_sales_chart_data, get_top_products_and_customers, get_expense_categories_summary)
-- These RPCs power the main dashboard page

-- 1. Dashboard Summary - aggregated financial KPIs
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS TABLE(
  total_sales numeric,
  total_purchases numeric,
  total_expenses numeric,
  receipt_bonds numeric,
  payment_bonds numeric,
  total_debts numeric,
  total_supplier_debts numeric,
  invoice_count bigint
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from date := COALESCE(p_date_from, (CURRENT_DATE - INTERVAL '30 days'));
  v_to date := COALESCE(p_date_to, CURRENT_DATE);
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  -- Total Sales (from invoices)
  SELECT COALESCE(SUM(
    CASE WHEN currency_code != 'SAR' AND exchange_rate > 0 THEN total_amount * exchange_rate
         ELSE total_amount END
  ), 0) INTO total_sales
  FROM public.invoices
  WHERE company_id = p_company_id
    AND type = 'sale'
    AND status IN ('posted', 'paid', 'partially_paid')
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND issue_date BETWEEN v_from AND v_to
    AND deleted_at IS NULL;

  -- Total Purchases (from invoices with type=purchase)
  SELECT COALESCE(SUM(
    CASE WHEN currency_code != 'SAR' AND exchange_rate > 0 THEN total_amount * exchange_rate
         ELSE total_amount END
  ), 0) INTO total_purchases
  FROM public.invoices
  WHERE company_id = p_company_id
    AND type = 'purchase'
    AND status IN ('posted', 'paid', 'partially_paid')
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND issue_date BETWEEN v_from AND v_to
    AND deleted_at IS NULL;

  -- Total Expenses
  SELECT COALESCE(SUM(
    CASE WHEN currency_code != 'SAR' AND exchange_rate > 0 THEN amount * exchange_rate
         ELSE amount END
  ), 0) INTO total_expenses
  FROM public.expenses
  WHERE company_id = p_company_id
    AND status = 'posted'
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND expense_date BETWEEN v_from AND v_to
    AND deleted_at IS NULL;

  -- Receipt Bonds
  SELECT COALESCE(SUM(
    CASE WHEN currency_code != 'SAR' AND exchange_rate > 0 THEN amount * exchange_rate
         ELSE amount END
  ), 0) INTO receipt_bonds
  FROM public.payments
  WHERE company_id = p_company_id
    AND type = 'receipt'
    AND status = 'posted'
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND payment_date BETWEEN v_from AND v_to
    AND deleted_at IS NULL;

  -- Payment Bonds (disbursements)
  SELECT COALESCE(SUM(
    CASE WHEN currency_code != 'SAR' AND exchange_rate > 0 THEN amount * exchange_rate
         ELSE amount END
  ), 0) INTO payment_bonds
  FROM public.payments
  WHERE company_id = p_company_id
    AND type = 'disbursement'
    AND status = 'posted'
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND payment_date BETWEEN v_from AND v_to
    AND deleted_at IS NULL;

  -- Total Customer Debts (unpaid invoices)
  SELECT COALESCE(SUM(
    CASE WHEN i.currency_code != 'SAR' AND i.exchange_rate > 0 
         THEN (i.total_amount - COALESCE(i.paid_amount, 0)) * i.exchange_rate
         ELSE (i.total_amount - COALESCE(i.paid_amount, 0)) END
  ), 0) INTO total_debts
  FROM public.invoices i
  WHERE i.company_id = p_company_id
    AND i.type = 'sale'
    AND i.status IN ('posted', 'partially_paid')
    AND i.deleted_at IS NULL;

  -- Total Supplier Debts (unpaid purchase invoices)
  SELECT COALESCE(SUM(
    CASE WHEN i.currency_code != 'SAR' AND i.exchange_rate > 0
         THEN (i.total_amount - COALESCE(i.paid_amount, 0)) * i.exchange_rate
         ELSE (i.total_amount - COALESCE(i.paid_amount, 0)) END
  ), 0) INTO total_supplier_debts
  FROM public.invoices i
  WHERE i.company_id = p_company_id
    AND i.type = 'purchase'
    AND i.status IN ('posted', 'partially_paid')
    AND i.deleted_at IS NULL;

  -- Invoice Count
  SELECT COUNT(*) INTO invoice_count
  FROM public.invoices
  WHERE company_id = p_company_id
    AND type = 'sale'
    AND status != 'void'
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND issue_date BETWEEN v_from AND v_to
    AND deleted_at IS NULL;

  RETURN NEXT;
END;
$$;


-- 2. Sales Chart Data - daily sales for the period
CREATE OR REPLACE FUNCTION public.get_sales_chart_data(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS TABLE(
  name text,
  value numeric,
  date date
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from date := COALESCE(p_date_from, (CURRENT_DATE - INTERVAL '30 days'));
  v_to date := COALESCE(p_date_to, CURRENT_DATE);
  v_day date;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  v_day := v_from;
  WHILE v_day <= v_to LOOP
    name := to_char(v_day, 'YYYY-MM-DD');
    date := v_day;
    
    SELECT COALESCE(SUM(
      CASE WHEN currency_code != 'SAR' AND exchange_rate > 0 THEN total_amount * exchange_rate
           ELSE total_amount END
    ), 0) INTO value
    FROM public.invoices
    WHERE company_id = p_company_id
      AND type = 'sale'
      AND status IN ('posted', 'paid', 'partially_paid')
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND issue_date = v_day
      AND deleted_at IS NULL;
    
    RETURN NEXT;
    v_day := v_day + INTERVAL '1 day';
  END LOOP;
END;
$$;


-- 3. Top Products and Customers
CREATE OR REPLACE FUNCTION public.get_top_products_and_customers(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5
) RETURNS TABLE(
  top_products jsonb,
  top_customers jsonb
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

  -- Top Products by quantity sold
  SELECT jsonb_agg(result) INTO top_products
  FROM (
    SELECT 
      p.name_ar as name,
      p.sku,
      SUM(ii.quantity) as total_quantity,
      SUM(ii.total) as total_revenue,
      p.sale_price as price,
      p.image_url
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    JOIN public.products p ON p.id = ii.product_id
    WHERE ii.company_id = p_company_id
      AND i.type = 'sale'
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
      AND i.deleted_at IS NULL
    GROUP BY p.id, p.name_ar, p.sku, p.sale_price, p.image_url
    ORDER BY total_revenue DESC
    LIMIT p_limit
  ) result;

  -- Top Customers by revenue
  SELECT jsonb_agg(result) INTO top_customers
  FROM (
    SELECT 
      pr.name,
      SUM(i.total_amount) as total_revenue,
      COUNT(i.id) as invoice_count,
      pr.phone,
      pr.email
    FROM public.invoices i
    JOIN public.parties pr ON pr.id = i.party_id
    WHERE i.company_id = p_company_id
      AND i.type = 'sale'
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
      AND i.deleted_at IS NULL
    GROUP BY pr.id, pr.name, pr.phone, pr.email
    ORDER BY total_revenue DESC
    LIMIT p_limit
  ) result;

  RETURN NEXT;
END;
$$;


-- 4. Expense Categories Summary
DROP FUNCTION IF EXISTS get_expense_categories_summary(UUID, DATE, DATE, UUID);
CREATE OR REPLACE FUNCTION public.get_expense_categories_summary(
  p_company_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
) RETURNS TABLE(
  name text,
  value numeric,
  color text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from date := COALESCE(p_date_from, (CURRENT_DATE - INTERVAL '30 days'));
  v_to date := COALESCE(p_date_to, CURRENT_DATE);
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
    ec.name,
    COALESCE(SUM(
      CASE WHEN e.currency_code != 'SAR' AND e.exchange_rate > 0 THEN e.amount * e.exchange_rate
           ELSE e.amount END
    ), 0) as value,
    COALESCE(ec.color, '#6366f1') as color
  FROM public.expense_categories ec
  LEFT JOIN public.expenses e ON e.category_id = ec.id
    AND e.company_id = p_company_id
    AND e.status = 'posted'
    AND e.deleted_at IS NULL
    AND e.expense_date BETWEEN v_from AND v_to
    AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
  WHERE ec.company_id = p_company_id
    AND ec.deleted_at IS NULL
  GROUP BY ec.id, ec.name, ec.color
  ORDER BY value DESC;
END;
$$;
