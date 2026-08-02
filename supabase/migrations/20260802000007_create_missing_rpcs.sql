-- Migration: Missing RPCs (27 functions called from frontend)
-- Provides server-side implementations with SECURITY DEFINER + company_id validation

-- ============================================================================
-- 1. calculate_and_update_wac
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_and_update_wac(
  p_company_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_quantity numeric DEFAULT 0,
  p_unit_price numeric DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_cost numeric;
  v_current_stock numeric;
  v_new_cost numeric;
  v_actual_company_id uuid;
  v_company_id uuid;
  v_product_id uuid;
  v_added_qty numeric;
  v_price numeric;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_company_id := COALESCE(p_company_id, v_actual_company_id);
  IF v_actual_company_id != v_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  v_product_id := p_product_id;
  v_added_qty := p_quantity;
  v_price := p_unit_price;

  SELECT cost_price INTO v_current_cost FROM public.products WHERE id = v_product_id AND company_id = v_company_id;
  SELECT COALESCE(SUM(quantity), 0) INTO v_current_stock FROM public.product_stock WHERE product_id = v_product_id AND company_id = v_company_id;

  IF v_current_stock + v_added_qty <= 0 THEN
    v_new_cost := v_price;
  ELSE
    v_new_cost := ((v_current_cost * v_current_stock) + (v_price * v_added_qty)) / (v_current_stock + v_added_qty);
  END IF;

  UPDATE public.products SET cost_price = v_new_cost, updated_at = now() WHERE id = v_product_id AND company_id = v_company_id;
  UPDATE public.product_stock SET avg_cost = v_new_cost, updated_at = now() WHERE product_id = v_product_id AND company_id = v_company_id;
END;
$$;


-- ============================================================================
-- 2. process_stock_transfer
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_stock_transfer(
  p_company_id uuid,
  p_from_warehouse uuid,
  p_to_warehouse uuid,
  p_items jsonb,
  p_user_id uuid,
  p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_transfer_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  INSERT INTO public.stock_transfers (
    company_id, from_warehouse_id, to_warehouse_id, notes, created_by, status
  ) VALUES (
    p_company_id, p_from_warehouse, p_to_warehouse, p_notes, p_user_id, 'completed'
  ) RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);

    INSERT INTO public.stock_transfer_items (
      transfer_id, product_id, quantity, company_id
    ) VALUES (
      v_transfer_id, v_product_id, v_qty, p_company_id
    );

    UPDATE public.product_stock SET
      quantity = quantity - v_qty, updated_at = now()
    WHERE product_id = v_product_id AND company_id = p_company_id AND warehouse_id = p_from_warehouse;

    INSERT INTO public.product_stock (product_id, warehouse_id, company_id, quantity)
    VALUES (v_product_id, p_to_warehouse, p_company_id, v_qty)
    ON CONFLICT (product_id, warehouse_id, company_id) DO UPDATE SET
      quantity = product_stock.quantity + v_qty, updated_at = now();

    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, transaction_type,
      reference_type, reference_id, created_by
    ) VALUES (
      p_company_id, v_product_id, p_from_warehouse, -v_qty, 'transfer_out',
      'stock_transfer', v_transfer_id, p_user_id
    );

    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, transaction_type,
      reference_type, reference_id, created_by
    ) VALUES (
      p_company_id, v_product_id, p_to_warehouse, v_qty, 'transfer_in',
      'stock_transfer', v_transfer_id, p_user_id
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;


-- ============================================================================
-- 3. get_item_movements_with_balance
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_item_movements_with_balance(
  p_company_id uuid,
  p_product_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
) RETURNS TABLE(
  id uuid,
  date date,
  transaction_type text,
  reference_type text,
  quantity numeric,
  raw_quantity numeric,
  balance_after numeric,
  notes text,
  source_name text,
  source_user text,
  document_number text,
  original_type text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actual_company_id uuid;
  v_balance numeric := 0;
  v_from date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '365 days');
  v_to date := COALESCE(p_end_date, CURRENT_DATE);
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
    it.id,
    it.created_at::date,
    it.transaction_type,
    it.reference_type,
    it.quantity,
    ABS(it.quantity) as raw_quantity,
    SUM(it.quantity) OVER (ORDER BY it.created_at, it.id) as balance_after,
    COALESCE(it.notes, ''),
    CASE
      WHEN it.reference_type = 'invoice' THEN 'فاتورة'
      WHEN it.reference_type = 'purchase' THEN 'مشتريات'
      WHEN it.reference_type = 'stock_transfer' THEN 'تحويل مخزني'
      WHEN it.reference_type = 'adjustment' THEN 'تسوية'
      ELSE it.reference_type
    END as source_name,
    COALESCE(u.raw_user_meta_data->>'full_name', '') as source_user,
    COALESCE(it.reference_id::text, ''),
    it.transaction_type as original_type
  FROM public.inventory_transactions it
  LEFT JOIN auth.users u ON u.id = it.created_by
  WHERE it.company_id = p_company_id
    AND it.product_id = p_product_id
    AND it.created_at::date BETWEEN v_from AND v_to
  ORDER BY it.created_at, it.id;
END;
$$;


-- ============================================================================
-- 4. get_similar_products
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_similar_products(
  p_company_id uuid,
  p_name text
) RETURNS TABLE(
  id uuid,
  name_ar text,
  similarity_score real
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
    p.id,
    p.name_ar,
    similarity(p.name_ar, p_name) as similarity_score
  FROM public.products p
  WHERE p.company_id = p_company_id
    AND p.deleted_at IS NULL
    AND p.status = 'active'
    AND p.name_ar % p_name
  ORDER BY similarity_score DESC
  LIMIT 10;
END;
$$;


-- ============================================================================
-- 5. get_potential_duplicates
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_potential_duplicates(
  p_company_id uuid,
  p_limit int DEFAULT 20
) RETURNS TABLE(
  product_a_id uuid,
  product_a_name text,
  product_a_sku text,
  product_a_brand text,
  product_a_price numeric,
  product_a_stock numeric,
  product_b_id uuid,
  product_b_name text,
  product_b_sku text,
  product_b_brand text,
  product_b_price numeric,
  product_b_stock numeric,
  similarity real
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
    a.id as product_a_id,
    a.name_ar as product_a_name,
    a.sku as product_a_sku,
    a.brand as product_a_brand,
    a.sale_price as product_a_price,
    COALESCE(SUM(psa.quantity), 0) as product_a_stock,
    b.id as product_b_id,
    b.name_ar as product_b_name,
    b.sku as product_b_sku,
    b.brand as product_b_brand,
    b.sale_price as product_b_price,
    COALESCE(SUM(psb.quantity), 0) as product_b_stock,
    similarity(a.name_ar, b.name_ar) as similarity
  FROM public.products a
  JOIN public.products b ON b.company_id = p_company_id
    AND b.id > a.id
    AND b.deleted_at IS NULL
    AND b.status = 'active'
    AND similarity(a.name_ar, b.name_ar) > 0.4
  LEFT JOIN public.product_stock psa ON psa.product_id = a.id AND psa.company_id = p_company_id
  LEFT JOIN public.product_stock psb ON psb.product_id = b.id AND psb.company_id = p_company_id
  WHERE a.company_id = p_company_id
    AND a.deleted_at IS NULL
    AND a.status = 'active'
  GROUP BY a.id, a.name_ar, a.sku, a.brand, a.sale_price,
           b.id, b.name_ar, b.sku, b.brand, b.sale_price,
           similarity(a.name_ar, b.name_ar)
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$;


-- ============================================================================
-- 6. get_stock_valuation
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_stock_valuation(
  p_company_id uuid,
  p_warehouse_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total_products bigint;
  v_total_stock numeric;
  v_total_value numeric;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  SELECT
    COUNT(DISTINCT ps.product_id),
    COALESCE(SUM(ps.quantity), 0),
    COALESCE(SUM(ps.quantity * p.cost_price), 0)
  INTO v_total_products, v_total_stock, v_total_value
  FROM public.product_stock ps
  JOIN public.products p ON p.id = ps.product_id AND p.company_id = p_company_id
  WHERE ps.company_id = p_company_id
    AND ps.quantity > 0
    AND p.deleted_at IS NULL
    AND (p_warehouse_id IS NULL OR ps.warehouse_id = p_warehouse_id);

  RETURN jsonb_build_object(
    'total_products', v_total_products,
    'total_stock', v_total_stock,
    'total_value', v_total_value
  );
END;
$$;


-- ============================================================================
-- 7. get_top_selling_products
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_top_selling_products(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_limit int DEFAULT 10
) RETURNS TABLE(
  id uuid,
  name_ar text,
  sku text,
  brand text,
  total_quantity numeric,
  total_revenue numeric,
  sale_price numeric,
  cost_price numeric,
  category_name text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_to date := COALESCE(p_end_date, CURRENT_DATE);
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
    p.id,
    p.name_ar,
    p.sku,
    p.brand,
    SUM(ii.quantity) as total_quantity,
    SUM(ii.total) as total_revenue,
    p.sale_price,
    p.cost_price,
    pc.name as category_name
  FROM public.invoice_items ii
  JOIN public.invoices i ON i.id = ii.invoice_id
  JOIN public.products p ON p.id = ii.product_id
  LEFT JOIN public.product_categories pc ON pc.id = p.category_id
  WHERE i.company_id = p_company_id
    AND i.type = 'sale'
    AND i.status IN ('posted', 'paid', 'partially_paid')
    AND i.issue_date BETWEEN v_from AND v_to
    AND i.deleted_at IS NULL
  GROUP BY p.id, p.name_ar, p.sku, p.brand, p.sale_price, p.cost_price, pc.name
  ORDER BY total_revenue DESC
  LIMIT p_limit;
END;
$$;


-- ============================================================================
-- 8. get_vehicle_products
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_vehicle_products(
  v_id uuid
) RETURNS TABLE(
  product_id uuid,
  name text,
  sku text,
  part_number text,
  price numeric,
  total_stock numeric,
  fitment_id uuid,
  notes text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());

  RETURN QUERY
  SELECT
    p.id as product_id,
    p.name_ar as name,
    p.sku,
    p.part_number,
    p.sale_price as price,
    COALESCE(SUM(ps.quantity), 0) as total_stock,
    pf.id as fitment_id,
    pf.notes
  FROM public.product_fitment pf
  JOIN public.products p ON p.id = pf.product_id AND p.deleted_at IS NULL AND p.company_id = v_actual_company_id
  LEFT JOIN public.product_stock ps ON ps.product_id = p.id AND ps.company_id = p.company_id
  WHERE pf.vehicle_id = v_id
  GROUP BY p.id, p.name_ar, p.sku, p.part_number, p.sale_price, pf.id, pf.notes;
END;
$$;


-- ============================================================================
-- 9. get_dead_stock
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_dead_stock(
  p_company_id uuid DEFAULT NULL,
  days_threshold int DEFAULT 90,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE(
  id uuid,
  name_ar text,
  sku text,
  part_number text,
  stock_quantity numeric,
  cost_price numeric,
  total_value numeric,
  last_sale_date date,
  days_since_last_sale int
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actual_company_id uuid;
  v_company_id uuid;
  v_p_days int := days_threshold;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_company_id := COALESCE(p_company_id, v_actual_company_id);
  IF v_actual_company_id != v_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name_ar,
    p.sku,
    p.part_number,
    COALESCE(SUM(ps.quantity), 0) as stock_quantity,
    p.cost_price,
    COALESCE(SUM(ps.quantity), 0) * p.cost_price as total_value,
    MAX(i.issue_date) as last_sale_date,
    EXTRACT(day FROM CURRENT_DATE - MAX(i.issue_date))::int as days_since_last_sale
  FROM public.products p
  LEFT JOIN public.product_stock ps ON ps.product_id = p.id AND ps.company_id = v_company_id
  LEFT JOIN public.invoice_items ii ON ii.product_id = p.id
  LEFT JOIN public.invoices i ON i.id = ii.invoice_id AND i.type = 'sale' AND i.status IN ('posted', 'paid', 'partially_paid') AND i.deleted_at IS NULL
  WHERE p.company_id = v_company_id
    AND p.deleted_at IS NULL
    AND p.status = 'active'
  GROUP BY p.id, p.name_ar, p.sku, p.part_number, p.cost_price
  HAVING COALESCE(SUM(ps.quantity), 0) > 0
    AND (MAX(i.issue_date) IS NULL OR MAX(i.issue_date) < CURRENT_DATE - v_p_days)
  ORDER BY total_value DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;


-- ============================================================================
-- 10. get_warehouses_with_stats
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_warehouses_with_stats(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL
) RETURNS TABLE(
  id uuid,
  name_ar text,
  location text,
  total_products bigint,
  total_quantity numeric,
  total_value numeric
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
    w.id,
    w.name_ar,
    w.location,
    COUNT(DISTINCT ps.product_id) as total_products,
    COALESCE(SUM(ps.quantity), 0) as total_quantity,
    COALESCE(SUM(ps.quantity * p.cost_price), 0) as total_value
  FROM public.warehouses w
  LEFT JOIN public.product_stock ps ON ps.warehouse_id = w.id AND ps.company_id = p_company_id AND ps.quantity > 0
  LEFT JOIN public.products p ON p.id = ps.product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
  WHERE w.company_id = p_company_id
    AND w.deleted_at IS NULL
    AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
  GROUP BY w.id, w.name_ar, w.location
  ORDER BY w.name_ar;
END;
$$;


-- ============================================================================
-- 11. get_cash_liquidity
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_cash_liquidity(
  p_company_id uuid
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_liquidity numeric;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  SELECT COALESCE(SUM(jel.debit_amount) - SUM(jel.credit_amount), 0) INTO v_liquidity
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.type = 'asset'
    AND a.code LIKE '1%'
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL;

  RETURN v_liquidity;
END;
$$;


-- ============================================================================
-- 12. get_bonds_stats
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_bonds_stats(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total_receipts numeric;
  v_total_disbursements numeric;
  v_net numeric;
  v_count_receipts bigint;
  v_count_disbursements bigint;
  v_from date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_to date := COALESCE(p_end_date, CURRENT_DATE);
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_total_receipts, v_count_receipts
  FROM public.payments
  WHERE company_id = p_company_id AND type = 'receipt' AND status = 'posted' AND deleted_at IS NULL
    AND payment_date BETWEEN v_from AND v_to
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_total_disbursements, v_count_disbursements
  FROM public.payments
  WHERE company_id = p_company_id AND type = 'disbursement' AND status = 'posted' AND deleted_at IS NULL
    AND payment_date BETWEEN v_from AND v_to
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  v_net := COALESCE(v_total_receipts, 0) - COALESCE(v_total_disbursements, 0);

  RETURN jsonb_build_object(
    'totalReceipts', v_total_receipts,
    'totalDisbursements', v_total_disbursements,
    'net', v_net,
    'receiptCount', v_count_receipts,
    'disbursementCount', v_count_disbursements
  );
END;
$$;


-- ============================================================================
-- 13. get_purchase_stats
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_purchase_stats(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total numeric;
  v_count bigint;
  v_pending bigint;
  v_total_debt numeric;
  v_from date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_to date := COALESCE(p_end_date, CURRENT_DATE);
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  SELECT COALESCE(SUM(total_amount), 0), COUNT(*) INTO v_total, v_count
  FROM public.invoices
  WHERE company_id = p_company_id AND type = 'purchase' AND status IN ('posted', 'paid', 'partially_paid')
    AND issue_date BETWEEN v_from AND v_to AND deleted_at IS NULL
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  SELECT COUNT(*) INTO v_pending
  FROM public.invoices
  WHERE company_id = p_company_id AND type = 'purchase' AND status IN ('posted', 'partially_paid')
    AND deleted_at IS NULL
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) INTO v_total_debt
  FROM public.invoices
  WHERE company_id = p_company_id AND type = 'purchase' AND status IN ('posted', 'partially_paid')
    AND deleted_at IS NULL
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  RETURN jsonb_build_object(
    'totalPurchases', v_total,
    'invoiceCount', v_count,
    'pendingPaymentCount', v_pending,
    'totalDebt', v_total_debt,
    'topSuppliers', '[]'::jsonb,
    'chartData', '[]'::jsonb
  );
END;
$$;


-- ============================================================================
-- 14. commit_purchase_invoice
-- ============================================================================
CREATE OR REPLACE FUNCTION public.commit_purchase_invoice(
  p_company_id uuid,
  p_user_id uuid,
  p_data jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_supplier_id uuid;
  v_items jsonb;
  v_total numeric;
  v_currency text;
  v_exchange_rate numeric;
  v_payment_method text;
  v_issue_date date;
  v_notes text;
  v_branch_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  v_supplier_id := (p_data->>'supplier_id')::uuid;
  v_items := p_data->'items';
  v_currency := COALESCE(p_data->>'currency', 'SAR');
  v_exchange_rate := COALESCE((p_data->>'exchange_rate')::numeric, 1);
  v_payment_method := COALESCE(p_data->>'payment_method', 'credit');
  v_issue_date := COALESCE((p_data->>'issue_date')::date, CURRENT_DATE);
  v_notes := p_data->>'notes';
  v_branch_id := (p_data->>'branch_id')::uuid;

  SELECT COALESCE(MAX(NULLIF(invoice_number, '')::bigint), 0) + 1 INTO v_invoice_number
  FROM public.invoices WHERE company_id = p_company_id AND type = 'purchase';
  v_invoice_number := 'PUR-' || v_invoice_number::text;

  v_total := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);
    v_total := v_total + (v_qty * v_cost);
  END LOOP;

  INSERT INTO public.invoices (
    company_id, party_id, invoice_number, type, status,
    total_amount, issue_date, payment_method, currency_code, exchange_rate,
    notes, created_by, branch_id
  ) VALUES (
    p_company_id, v_supplier_id, v_invoice_number, 'purchase', 'posted',
    v_total, v_issue_date, v_payment_method, v_currency, v_exchange_rate,
    v_notes, p_user_id, v_branch_id
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);

    INSERT INTO public.invoice_items (
      invoice_id, product_id, description, quantity, unit_price, total, company_id
    ) VALUES (
      v_invoice_id, v_product_id, v_item->>'name', v_qty, v_cost, v_qty * v_cost, p_company_id
    );

    INSERT INTO public.product_stock (product_id, warehouse_id, company_id, quantity)
    VALUES (v_product_id, (SELECT id FROM public.warehouses WHERE company_id = p_company_id AND is_primary = true LIMIT 1), p_company_id, v_qty)
    ON CONFLICT (product_id, warehouse_id, company_id) DO UPDATE SET
      quantity = product_stock.quantity + v_qty, updated_at = now();

    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, transaction_type,
      reference_type, reference_id, unit_cost, total_cost, created_by
    ) VALUES (
      p_company_id, v_product_id,
      (SELECT id FROM public.warehouses WHERE company_id = p_company_id AND is_primary = true LIMIT 1),
      v_qty, 'purchase', 'invoice', v_invoice_id, v_cost, v_qty * v_cost, p_user_id
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_invoice_id, 'invoice_number', v_invoice_number);
END;
$$;


-- ============================================================================
-- 15. commit_purchase_return
-- ============================================================================
CREATE OR REPLACE FUNCTION public.commit_purchase_return(
  p_company_id uuid,
  p_user_id uuid,
  p_data jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_supplier_id uuid;
  v_items jsonb;
  v_total numeric;
  v_currency text;
  v_exchange_rate numeric;
  v_notes text;
  v_branch_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  v_supplier_id := (p_data->>'supplier_id')::uuid;
  v_items := p_data->'items';
  v_currency := COALESCE(p_data->>'currency', 'SAR');
  v_exchange_rate := COALESCE((p_data->>'exchange_rate')::numeric, 1);
  v_notes := p_data->>'notes';
  v_branch_id := (p_data->>'branch_id')::uuid;

  SELECT COALESCE(MAX(NULLIF(invoice_number, '')::bigint), 0) + 1 INTO v_invoice_number
  FROM public.invoices WHERE company_id = p_company_id AND type = 'purchase_return';
  v_invoice_number := 'PR-' || v_invoice_number::text;

  v_total := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);
    v_total := v_total + (v_qty * v_cost);
  END LOOP;

  INSERT INTO public.invoices (
    company_id, party_id, invoice_number, type, status,
    total_amount, issue_date, currency_code, exchange_rate,
    notes, created_by, branch_id
  ) VALUES (
    p_company_id, v_supplier_id, v_invoice_number, 'purchase_return', 'posted',
    v_total, CURRENT_DATE, v_currency, v_exchange_rate,
    v_notes, p_user_id, v_branch_id
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);

    INSERT INTO public.invoice_items (
      invoice_id, product_id, description, quantity, unit_price, total, company_id
    ) VALUES (
      v_invoice_id, v_product_id, v_item->>'name', v_qty, v_cost, v_qty * v_cost, p_company_id
    );

    UPDATE public.product_stock SET
      quantity = quantity - v_qty, updated_at = now()
    WHERE product_id = v_product_id
      AND company_id = p_company_id
      AND warehouse_id = (SELECT id FROM public.warehouses WHERE company_id = p_company_id AND is_primary = true LIMIT 1);

    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, transaction_type,
      reference_type, reference_id, unit_cost, total_cost, created_by
    ) VALUES (
      p_company_id, v_product_id,
      (SELECT id FROM public.warehouses WHERE company_id = p_company_id AND is_primary = true LIMIT 1),
      -v_qty, 'purchase_return', 'invoice', v_invoice_id, v_cost, -v_qty * v_cost, p_user_id
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_invoice_id, 'invoice_number', v_invoice_number);
END;
$$;


-- ============================================================================
-- 16. create_financial_bond
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_financial_bond(
  p_company_id uuid,
  p_user_id uuid,
  p_data jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_payment_id uuid;
  v_payment_number text;
  v_bond_type text;
  v_amount numeric;
  v_date date;
  v_cash_account_id uuid;
  v_counterparty_type text;
  v_counterparty_id uuid;
  v_description text;
  v_currency_code text;
  v_exchange_rate numeric;
  v_foreign_amount numeric;
  v_fiscal_year_id uuid;
  v_counter_account_id uuid;
  v_entry_id uuid;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  v_bond_type := COALESCE(p_data->>'bond_type', 'payment');
  v_amount := COALESCE((p_data->>'amount')::numeric, 0);
  v_date := COALESCE((p_data->>'date')::date, CURRENT_DATE);
  v_cash_account_id := (p_data->>'cash_account_id')::uuid;
  v_counterparty_type := COALESCE(p_data->>'counterparty_type', 'party');
  v_counterparty_id := (p_data->>'counterparty_id')::uuid;
  v_description := COALESCE(p_data->>'description', 'سند مالي');
  v_currency_code := COALESCE(p_data->>'currency_code', 'SAR');
  v_exchange_rate := COALESCE((p_data->>'exchange_rate')::numeric, 1);
  v_foreign_amount := (p_data->>'foreign_amount')::numeric;

  SELECT id INTO v_fiscal_year_id FROM public.fiscal_years
  WHERE company_id = p_company_id AND is_closed = false
  AND v_date BETWEEN start_date AND end_date LIMIT 1;

  SELECT COALESCE(MAX(NULLIF(payment_number, '')::bigint), 0) + 1 INTO v_payment_number
  FROM public.payments WHERE company_id = p_company_id;
  v_payment_number := v_payment_number::text;

  INSERT INTO public.payments (
    company_id, payment_number, type, amount,
    currency_code, exchange_rate, payment_date, payment_method,
    account_id, reference_type, notes, status,
    created_by, branch_id, party_id
  ) VALUES (
    p_company_id, v_payment_number, CASE v_bond_type WHEN 'receipt' THEN 'receipt' ELSE 'disbursement' END,
    v_amount, v_currency_code, v_exchange_rate, v_date, 'cash',
    v_cash_account_id, 'bond', v_description, 'posted',
    p_user_id, NULL,
    CASE WHEN v_counterparty_type = 'party' THEN v_counterparty_id ELSE NULL END
  ) RETURNING id INTO v_payment_id;

  IF v_counterparty_type = 'account' AND v_counterparty_id IS NOT NULL THEN
    v_counter_account_id := v_counterparty_id;
  ELSE
    SELECT id INTO v_counter_account_id FROM public.accounts
    WHERE company_id = p_company_id AND code LIKE '4%' AND type = 'revenue' LIMIT 1;
  END IF;

  IF v_counter_account_id IS NOT NULL THEN
    INSERT INTO public.journal_entries (
      company_id, entry_number, entry_date, description,
      reference_type, reference_id, status, created_by, fiscal_year_id
    ) VALUES (
      p_company_id,
      (SELECT COALESCE(MAX(entry_number), 0) + 1 FROM public.journal_entries WHERE company_id = p_company_id),
      v_date, v_description,
      'payment', v_payment_id, 'posted', p_user_id, v_fiscal_year_id
    ) RETURNING id INTO v_entry_id;

    IF v_bond_type = 'receipt' THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, currency_code, company_id)
      VALUES (v_entry_id, v_cash_account_id, v_amount, 0, v_description, v_currency_code, p_company_id);

      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, currency_code, company_id)
      VALUES (v_entry_id, v_counter_account_id, 0, v_amount, v_description, v_currency_code, p_company_id);
    ELSE
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, currency_code, company_id)
      VALUES (v_entry_id, v_counter_account_id, v_amount, 0, v_description, v_currency_code, p_company_id);

      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, currency_code, company_id)
      VALUES (v_entry_id, v_cash_account_id, 0, v_amount, v_description, v_currency_code, p_company_id);
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_payment_id, 'payment_number', v_payment_number);
END;
$$;


-- ============================================================================
-- 17. void_expense
-- ============================================================================
CREATE OR REPLACE FUNCTION public.void_expense(
  p_expense_id uuid,
  p_company_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_expense record;
  v_reversal_entry_id uuid;
  v_actual_company_id uuid;
  v_company_id uuid;
  v_user_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_company_id := COALESCE(p_company_id, v_actual_company_id);
  IF v_actual_company_id != v_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());

  SELECT * INTO v_expense FROM public.expenses WHERE id = p_expense_id AND company_id = v_company_id;

  IF v_expense IS NULL OR v_expense.status = 'void' THEN
    RAISE EXCEPTION 'Expense not found or already voided';
  END IF;

  UPDATE public.expenses SET status = 'void', updated_at = now() WHERE id = p_expense_id;

  INSERT INTO public.journal_entries (
    company_id, entry_number, entry_date, description,
    reference_type, reference_id, status, created_by
  ) VALUES (
    v_company_id,
    (SELECT COALESCE(MAX(entry_number), 0) + 1 FROM public.journal_entries WHERE company_id = v_company_id),
    CURRENT_DATE, 'إلغاء مصروف: ' || COALESCE(v_expense.description, ''),
    'expense', p_expense_id, 'posted', v_user_id
  ) RETURNING id INTO v_reversal_entry_id;

  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount, description, company_id
  )
  SELECT v_reversal_entry_id, jel.account_id, jel.credit_amount, jel.debit_amount,
    'عكس مصروف ملغى', v_company_id
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE je.reference_type = 'expense' AND je.reference_id = p_expense_id;
END;
$$;


-- ============================================================================
-- 18. get_party_statement
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_party_statement(
  p_company_id uuid,
  p_party_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
) RETURNS TABLE(
  line_id uuid,
  entry_date date,
  ref text,
  operation_type text,
  description text,
  type text,
  debit numeric,
  credit numeric,
  currency text,
  balance numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '365 days');
  v_to date := COALESCE(p_end_date, CURRENT_DATE);
  v_running_balance numeric := 0;
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
    je.id as line_id,
    je.entry_date,
    je.entry_number::text as ref,
    COALESCE(je.reference_type, 'payment') as operation_type,
    je.description,
    CASE WHEN (SUM(jel.debit_amount) - SUM(jel.credit_amount)) >= 0 THEN 'receipt' ELSE 'payment' END as type,
    SUM(jel.debit_amount) as debit,
    SUM(jel.credit_amount) as credit,
    COALESCE(jel.currency_code, 'SAR') as currency,
    SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)) OVER (ORDER BY je.entry_date, je.entry_number) as balance
  FROM public.journal_entries je
  JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN public.accounts a ON a.id = jel.account_id
  LEFT JOIN public.parties p ON p.id = a.party_id
  WHERE je.company_id = p_company_id
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date BETWEEN v_from AND v_to
    AND (a.party_id = p_party_id)
  GROUP BY je.id, je.entry_date, je.entry_number, je.reference_type, je.description, jel.currency_code
  ORDER BY je.entry_date, je.entry_number;
END;
$$;


-- ============================================================================
-- 19. get_customer_stats
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_customer_stats(
  p_company_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  SELECT jsonb_build_object(
    'totalCustomers', (SELECT COUNT(*) FROM public.parties WHERE company_id = p_company_id AND type = 'customer' AND deleted_at IS NULL),
    'activeCustomers', (SELECT COUNT(DISTINCT party_id) FROM public.invoices WHERE company_id = p_company_id AND type = 'sale' AND status IN ('posted', 'paid', 'partially_paid') AND deleted_at IS NULL),
    'totalRevenue', (SELECT COALESCE(SUM(total_amount), 0) FROM public.invoices WHERE company_id = p_company_id AND type = 'sale' AND status IN ('posted', 'paid', 'partially_paid') AND deleted_at IS NULL),
    'totalOutstanding', (SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) FROM public.invoices WHERE company_id = p_company_id AND type = 'sale' AND status IN ('posted', 'partially_paid') AND deleted_at IS NULL),
    'avgTransactionValue', (SELECT CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total_amount), 0) / COUNT(*) ELSE 0 END FROM public.invoices WHERE company_id = p_company_id AND type = 'sale' AND status IN ('posted', 'paid', 'partially_paid') AND deleted_at IS NULL)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- ============================================================================
-- 20. get_top_customers_by_revenue
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_top_customers_by_revenue(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_limit int DEFAULT 10
) RETURNS TABLE(
  id uuid,
  name text,
  total_revenue numeric,
  invoice_count bigint
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '365 days');
  v_to date := COALESCE(p_end_date, CURRENT_DATE);
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
    pr.id,
    pr.name,
    SUM(i.total_amount) as total_revenue,
    COUNT(i.id) as invoice_count
  FROM public.invoices i
  JOIN public.parties pr ON pr.id = i.party_id
  WHERE i.company_id = p_company_id
    AND i.type = 'sale'
    AND i.status IN ('posted', 'paid', 'partially_paid')
    AND i.deleted_at IS NULL
    AND i.issue_date BETWEEN v_from AND v_to
  GROUP BY pr.id, pr.name
  ORDER BY total_revenue DESC
  LIMIT p_limit;
END;
$$;


-- ============================================================================
-- 21. get_account_ledger
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_account_ledger(
  p_company_id uuid,
  p_account_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_entries jsonb;
  v_from date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '365 days');
  v_to date := COALESCE(p_end_date, CURRENT_DATE);
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  SELECT jsonb_agg(row_to_json(d) ORDER BY d.entry_date, d.entry_number) INTO v_entries
  FROM (
    SELECT
      je.entry_date::text,
      je.entry_number,
      je.description,
      jel.debit_amount,
      jel.credit_amount,
      COALESCE(jel.currency_code, 'SAR') as currency_code,
      jel.exchange_rate,
      0 as balance,
      0 as foreign_amount
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.company_id = p_company_id
      AND jel.account_id = p_account_id
      AND je.status = 'posted'
      AND je.deleted_at IS NULL
      AND jel.deleted_at IS NULL
      AND je.entry_date BETWEEN v_from AND v_to
  ) d;

  RETURN jsonb_build_object('entries', COALESCE(v_entries, '[]'::jsonb));
END;
$$;


-- ============================================================================
-- 22. post_manual_journal
-- ============================================================================
CREATE OR REPLACE FUNCTION public.post_manual_journal(
  p_company_id uuid,
  p_user_id uuid,
  p_data jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_entry_id uuid;
  v_entry_number bigint;
  v_date date;
  v_description text;
  v_reference_type text;
  v_currency_code text;
  v_exchange_rate numeric;
  v_branch_id uuid;
  v_lines jsonb;
  v_line jsonb;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  v_date := COALESCE((p_data->>'date')::date, CURRENT_DATE);
  v_description := COALESCE(p_data->>'description', 'قيود يدوية');
  v_reference_type := COALESCE(p_data->>'reference_type', 'manual');
  v_currency_code := COALESCE(p_data->>'currency_code', 'SAR');
  v_exchange_rate := COALESCE((p_data->>'exchange_rate')::numeric, 1);
  v_branch_id := (p_data->>'branch_id')::uuid;
  v_lines := p_data->'lines';

  SELECT COALESCE(MAX(entry_number), 0) + 1 INTO v_entry_number
  FROM public.journal_entries WHERE company_id = p_company_id;

  INSERT INTO public.journal_entries (
    company_id, entry_number, entry_date, description,
    reference_type, status, created_by, branch_id
  ) VALUES (
    p_company_id, v_entry_number, v_date, v_description,
    v_reference_type, 'posted', p_user_id, v_branch_id
  ) RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    INSERT INTO public.journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount,
      description, currency_code, exchange_rate, company_id, branch_id
    ) VALUES (
      v_entry_id,
      (v_line->>'account_id')::uuid,
      COALESCE((v_line->>'debit')::numeric, 0),
      COALESCE((v_line->>'credit')::numeric, 0),
      v_line->>'description',
      v_currency_code, v_exchange_rate, p_company_id, v_branch_id
    );
  END LOOP;

  RETURN v_entry_id;
END;
$$;


-- ============================================================================
-- 23. commit_sale_return
-- ============================================================================
CREATE OR REPLACE FUNCTION public.commit_sale_return(
  p_company_id uuid,
  p_user_id uuid,
  p_data jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_party_id uuid;
  v_items jsonb;
  v_total numeric;
  v_currency text;
  v_exchange_rate numeric;
  v_notes text;
  v_reference_invoice_id uuid;
  v_return_reason text;
  v_branch_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_price numeric;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  v_party_id := (p_data->>'party_id')::uuid;
  v_items := p_data->'items';
  v_currency := COALESCE(p_data->>'currency', 'SAR');
  v_exchange_rate := COALESCE((p_data->>'exchange_rate')::numeric, 1);
  v_notes := p_data->>'notes';
  v_reference_invoice_id := (p_data->>'reference_invoice_id')::uuid;
  v_return_reason := p_data->>'return_reason';
  v_branch_id := (p_data->>'branch_id')::uuid;

  SELECT COALESCE(MAX(NULLIF(invoice_number, '')::bigint), 0) + 1 INTO v_invoice_number
  FROM public.invoices WHERE company_id = p_company_id AND type = 'sale_return';
  v_invoice_number := 'SR-' || v_invoice_number::text;

  v_total := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_total := v_total + (v_qty * v_price);
  END LOOP;

  INSERT INTO public.invoices (
    company_id, party_id, invoice_number, type, status,
    total_amount, issue_date, currency_code, exchange_rate,
    notes, created_by, branch_id, reference_invoice_id
  ) VALUES (
    p_company_id, v_party_id, v_invoice_number, 'sale_return', 'posted',
    v_total, CURRENT_DATE, v_currency, v_exchange_rate,
    v_notes, p_user_id, v_branch_id, v_reference_invoice_id
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_price := COALESCE((v_item->>'unit_price')::numeric, 0);

    INSERT INTO public.invoice_items (
      invoice_id, product_id, description, quantity, unit_price, total, company_id
    ) VALUES (
      v_invoice_id, v_product_id, v_item->>'name', v_qty, v_price, v_qty * v_price, p_company_id
    );

    INSERT INTO public.product_stock (product_id, warehouse_id, company_id, quantity)
    VALUES (v_product_id, (SELECT id FROM public.warehouses WHERE company_id = p_company_id AND is_primary = true LIMIT 1), p_company_id, v_qty)
    ON CONFLICT (product_id, warehouse_id, company_id) DO UPDATE SET
      quantity = product_stock.quantity + v_qty, updated_at = now();

    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, transaction_type,
      reference_type, reference_id, unit_cost, total_cost, created_by
    ) VALUES (
      p_company_id, v_product_id,
      (SELECT id FROM public.warehouses WHERE company_id = p_company_id AND is_primary = true LIMIT 1),
      v_qty, 'sales_return', 'invoice', v_invoice_id, 0, 0, p_user_id
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_invoice_id, 'invoice_number', v_invoice_number);
END;
$$;


-- ============================================================================
-- 24. void_invoice
-- ============================================================================
CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id uuid,
  p_company_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invoice record;
  v_reversal_entry_id uuid;
  v_actual_company_id uuid;
  v_company_id uuid;
  v_user_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_company_id := COALESCE(p_company_id, v_actual_company_id);
  IF v_actual_company_id != v_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());

  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id AND company_id = v_company_id;
  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF v_invoice.status = 'void' THEN
    RAISE EXCEPTION 'Invoice already voided';
  END IF;

  UPDATE public.invoices SET status = 'void', updated_at = now() WHERE id = p_invoice_id;

  INSERT INTO public.journal_entries (
    company_id, entry_number, entry_date, description,
    reference_type, reference_id, status, created_by
  ) VALUES (
    v_company_id,
    (SELECT COALESCE(MAX(entry_number), 0) + 1 FROM public.journal_entries WHERE company_id = v_company_id),
    CURRENT_DATE, 'إلغاء فاتورة رقم ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text),
    'invoice', p_invoice_id, 'posted', v_user_id
  ) RETURNING id INTO v_reversal_entry_id;

  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount, description, company_id
  )
  SELECT v_reversal_entry_id, jel.account_id, jel.credit_amount, jel.debit_amount,
    'عكس فاتورة ملغاة', v_company_id
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  WHERE je.reference_type = 'invoice' AND je.reference_id = p_invoice_id;

  RETURN jsonb_build_object('status', 'void', 'invoice_id', p_invoice_id);
END;
$$;


-- ============================================================================
-- 25. process_sales_return
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_sales_return(
  p_company_id uuid,
  p_user_id uuid,
  p_data jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_party_id uuid;
  v_items jsonb;
  v_total numeric;
  v_payment_method text;
  v_return_reason text;
  v_status text;
  v_notes text;
  v_issue_date date;
  v_currency_code text;
  v_exchange_rate numeric;
  v_original_invoice_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_price numeric;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  v_original_invoice_id := (p_data->>'invoice_id')::uuid;
  v_party_id := (p_data->>'party_id')::uuid;
  v_items := p_data->'items';
  v_payment_method := COALESCE(p_data->>'payment_method', 'cash');
  v_return_reason := COALESCE(p_data->>'return_reason', '');
  v_status := COALESCE(p_data->>'status', 'posted');
  v_notes := COALESCE(p_data->>'notes', '');
  v_issue_date := COALESCE((p_data->>'issue_date')::date, CURRENT_DATE);
  v_currency_code := COALESCE(p_data->>'currency_code', 'SAR');
  v_exchange_rate := COALESCE((p_data->>'exchange_rate')::numeric, 1);

  SELECT COALESCE(MAX(NULLIF(invoice_number, '')::bigint), 0) + 1 INTO v_invoice_number
  FROM public.invoices WHERE company_id = p_company_id AND type = 'sale_return';
  v_invoice_number := 'SR-' || v_invoice_number::text;

  v_total := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_total := v_total + (v_qty * v_price);
  END LOOP;

  INSERT INTO public.invoices (
    company_id, party_id, invoice_number, type, status,
    total_amount, issue_date, payment_method, currency_code, exchange_rate,
    notes, created_by, reference_invoice_id
  ) VALUES (
    p_company_id, v_party_id, v_invoice_number, 'sale_return', v_status,
    v_total, v_issue_date, v_payment_method, v_currency_code, v_exchange_rate,
    v_notes || CASE WHEN v_return_reason != '' THEN ' | سبب الارجاع: ' || v_return_reason ELSE '' END,
    p_user_id, v_original_invoice_id
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_price := COALESCE((v_item->>'unit_price')::numeric, 0);

    INSERT INTO public.invoice_items (
      invoice_id, product_id, description, quantity, unit_price, total, company_id
    ) VALUES (
      v_invoice_id, v_product_id, v_item->>'name', v_qty, v_price, v_qty * v_price, p_company_id
    );

    INSERT INTO public.product_stock (product_id, warehouse_id, company_id, quantity)
    VALUES (v_product_id, (SELECT id FROM public.warehouses WHERE company_id = p_company_id AND is_primary = true LIMIT 1), p_company_id, v_qty)
    ON CONFLICT (product_id, warehouse_id, company_id) DO UPDATE SET
      quantity = product_stock.quantity + v_qty, updated_at = now();

    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity, transaction_type,
      reference_type, reference_id, created_by
    ) VALUES (
      p_company_id, v_product_id,
      (SELECT id FROM public.warehouses WHERE company_id = p_company_id AND is_primary = true LIMIT 1),
      v_qty, 'sales_return', 'invoice', v_invoice_id, p_user_id
    );
  END LOOP;

  RETURN jsonb_build_object('invoice_number', v_invoice_number);
END;
$$;


-- ============================================================================
-- 26. get_user_profile
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_profile(
  p_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', u.id,
    'full_name', COALESCE(u.raw_user_meta_data->>'full_name', ''),
    'avatar_url', COALESCE(u.raw_user_meta_data->>'avatar_url', ''),
    'companies', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'company_id', ucr.company_id,
        'company_name', c.name,
        'role', ucr.role,
        'branch_id', ucr.branch_id,
        'branch_name', COALESCE(b.name_ar, '')
      )) FROM public.user_company_roles ucr
      JOIN public.companies c ON c.id = ucr.company_id
      LEFT JOIN public.branches b ON b.id = ucr.branch_id
      WHERE ucr.user_id = p_user_id),
      '[]'::jsonb
    )
  ) INTO v_result
  FROM auth.users u
  WHERE u.id = p_user_id;

  RETURN v_result;
END;
$$;


-- ============================================================================
-- 27. check_rate_limit
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_company_id uuid DEFAULT NULL,
  p_endpoint text DEFAULT 'default',
  p_max_requests int DEFAULT 60,
  p_window_seconds int DEFAULT 60
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count bigint;
  v_window interval := (p_window_seconds || ' seconds')::interval;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.audit_logs
  WHERE company_id = p_company_id
    AND created_at > now() - v_window;

  RETURN (v_count < p_max_requests);
END;
$$;


-- ============================================================================
-- GRANT EXECUTE ON ALL FUNCTIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.calculate_and_update_wac(uuid, uuid, numeric, numeric) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.process_stock_transfer(uuid, uuid, uuid, jsonb, uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_item_movements_with_balance(uuid, uuid, date, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_similar_products(uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_potential_duplicates(uuid, int) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_valuation(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_top_selling_products(uuid, date, date, int) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_vehicle_products(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_dead_stock(uuid, int, int, int) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_warehouses_with_stats(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_liquidity(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_bonds_stats(uuid, date, date, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_purchase_stats(uuid, date, date, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.commit_purchase_invoice(uuid, uuid, jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.commit_purchase_return(uuid, uuid, jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_financial_bond(uuid, uuid, jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.void_expense(uuid, uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_party_statement(uuid, uuid, date, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_stats(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_top_customers_by_revenue(uuid, date, date, int) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_account_ledger(uuid, uuid, date, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.post_manual_journal(uuid, uuid, jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.commit_sale_return(uuid, uuid, jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.process_sales_return(uuid, uuid, jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_profile(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, int, int) TO authenticated, anon;
