-- Migration: Sales RPCs
-- commit_sales_invoice, get_next_invoice_number, get_next_sequence, get_sales_analytics, get_sales_stats

-- 1. Commit Sales Invoice (creates invoice + journal entries)
CREATE OR REPLACE FUNCTION public.commit_sales_invoice(
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
  v_subtotal numeric;
  v_tax_amount numeric;
  v_discount numeric;
  v_date date;
  v_payment_method text;
  v_currency_code text;
  v_exchange_rate numeric;
  v_notes text;
  v_branch_id uuid;
  v_fiscal_year_id uuid;
  v_cashbox_id uuid;
  v_sales_account_id uuid;
  v_cash_account_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_price numeric;
  v_cost numeric;
  v_sales_revenue_code text := '4000';
  v_cash_code text := '1000';
  v_cogs_code text := '5100';
  v_inventory_code text := '1100';
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

  -- Extract data from JSON
  v_party_id := (p_data->>'party_id')::uuid;
  v_items := p_data->'items';
  v_total := COALESCE((p_data->>'total_amount')::numeric, 0);
  v_subtotal := COALESCE((p_data->>'subtotal')::numeric, 0);
  v_tax_amount := COALESCE((p_data->>'tax_amount')::numeric, 0);
  v_discount := COALESCE((p_data->>'discount_amount')::numeric, 0);
  v_date := COALESCE((p_data->>'issue_date')::date, CURRENT_DATE);
  v_payment_method := COALESCE(p_data->>'payment_method', 'cash');
  v_currency_code := COALESCE(p_data->>'currency_code', 'SAR');
  v_exchange_rate := COALESCE((p_data->>'exchange_rate')::numeric, 1);
  v_notes := p_data->>'notes';
  v_branch_id := (p_data->>'branch_id')::uuid;
  v_cashbox_id := (p_data->>'cashbox_id')::uuid;

  -- Get fiscal year
  SELECT id INTO v_fiscal_year_id FROM public.fiscal_years
  WHERE company_id = p_company_id AND is_closed = false
  AND v_date BETWEEN start_date AND end_date
  LIMIT 1;

  -- Generate invoice number
  v_invoice_number := p_data->>'invoice_number';
  IF v_invoice_number IS NULL OR v_invoice_number = '' THEN
    SELECT COALESCE(MAX(NULLIF(invoice_number, '')::bigint), 0) + 1
    INTO v_invoice_number
    FROM public.invoices WHERE company_id = p_company_id AND type = 'sale';
    v_invoice_number := v_invoice_number::text;
  END IF;

  -- Create invoice
  INSERT INTO public.invoices (
    company_id, party_id, invoice_number, type, status,
    total_amount, subtotal, tax_amount, discount_amount,
    issue_date, payment_method, currency_code, exchange_rate,
    notes, created_by, branch_id, fiscal_year_id
  ) VALUES (
    p_company_id, v_party_id, v_invoice_number, 'sale', 'posted',
    v_total, v_subtotal, v_tax_amount, v_discount,
    v_date, v_payment_method, v_currency_code, v_exchange_rate,
    v_notes, p_user_id, v_branch_id, v_fiscal_year_id
  ) RETURNING id INTO v_invoice_id;

  -- Insert invoice items and update stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'price')::numeric;
    v_cost := COALESCE((v_item->>'cost_price')::numeric, 0);

    INSERT INTO public.invoice_items (
      invoice_id, product_id, description, quantity,
      unit_price, cost_price, tax_amount, total, discount_amount, company_id
    ) VALUES (
      v_invoice_id, v_product_id, v_item->>'name', v_qty,
      v_price, v_cost, COALESCE((v_item->>'tax_amount')::numeric, 0),
      COALESCE((v_item->>'total')::numeric, v_qty * v_price),
      COALESCE((v_item->>'discount')::numeric, 0), p_company_id
    );

    -- Update product stock (reduce from primary warehouse)
    UPDATE public.product_stock SET
      quantity = quantity - v_qty,
      updated_at = now()
    WHERE product_id = v_product_id
      AND company_id = p_company_id
      AND warehouse_id = (
        SELECT id FROM public.warehouses WHERE company_id = p_company_id AND is_primary = true LIMIT 1
      );

    -- Log inventory transaction
    INSERT INTO public.inventory_transactions (
      company_id, product_id, warehouse_id, quantity,
      transaction_type, reference_type, reference_id,
      unit_cost, total_cost, created_by
    ) VALUES (
      p_company_id, v_product_id,
      (SELECT id FROM public.warehouses WHERE company_id = p_company_id AND is_primary = true LIMIT 1),
      -v_qty, 'sales', 'invoice', v_invoice_id, v_cost, v_qty * v_cost, p_user_id
    );
  END LOOP;

  -- Get account IDs
  SELECT id INTO v_sales_account_id FROM public.accounts
  WHERE company_id = p_company_id AND code LIKE '4%' AND type = 'revenue' LIMIT 1;

  SELECT id INTO v_cash_account_id FROM public.accounts
  WHERE company_id = p_company_id AND code LIKE '1%' AND type = 'asset' AND is_active = true LIMIT 1;

  -- Create journal entry for the sale
  IF v_sales_account_id IS NOT NULL AND v_cash_account_id IS NOT NULL THEN
    INSERT INTO public.journal_entries (
      company_id, entry_number, entry_date, description,
      reference_type, reference_id, status, created_by, branch_id, fiscal_year_id
    ) VALUES (
      p_company_id,
      (SELECT COALESCE(MAX(entry_number), 0) + 1 FROM public.journal_entries WHERE company_id = p_company_id),
      v_date, 'فاتورة مبيعات رقم ' || v_invoice_number,
      'invoice', v_invoice_id, 'posted', p_user_id, v_branch_id, v_fiscal_year_id
    ) RETURNING id INTO v_entry_id;

    -- Debit: Cash (received payment)
    INSERT INTO public.journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount,
      description, currency_code, company_id, branch_id
    ) VALUES (
      v_entry_id, v_cash_account_id, v_total, 0,
      'فاتورة مبيعات رقم ' || v_invoice_number, v_currency_code, p_company_id, v_branch_id
    );

    -- Credit: Sales Revenue
    INSERT INTO public.journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount,
      description, currency_code, company_id, branch_id
    ) VALUES (
      v_entry_id, v_sales_account_id, 0, v_total,
      'فاتورة مبيعات رقم ' || v_invoice_number, v_currency_code, p_company_id, v_branch_id
    );
  END IF;

  -- Return result
  RETURN jsonb_build_object('id', v_invoice_id, 'invoice_number', v_invoice_number);
END;
$$;


-- 2. Get Next Invoice Number
CREATE OR REPLACE FUNCTION public.get_next_invoice_number(
  p_company_id uuid,
  p_type text DEFAULT 'sale'
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_next bigint;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  SELECT COALESCE(MAX(NULLIF(invoice_number, '')::bigint), 0) + 1
  INTO v_next
  FROM public.invoices
  WHERE company_id = p_company_id AND type = p_type;
  
  RETURN v_next::text;
END;
$$;


-- 3. Get Next Sequence (generic sequence generator)
CREATE OR REPLACE FUNCTION public.get_next_sequence(
  p_company_id uuid,
  p_sequence_name text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_next bigint;
  v_table text;
  v_column text;
BEGIN
  CASE p_sequence_name
    WHEN 'invoice' THEN
      SELECT COALESCE(MAX(NULLIF(invoice_number, '')::bigint), 0) + 1 INTO v_next
      FROM public.invoices WHERE company_id = p_company_id AND type = 'sale';
    WHEN 'purchase' THEN
      SELECT COALESCE(MAX(NULLIF(invoice_number, '')::bigint), 0) + 1 INTO v_next
      FROM public.invoices WHERE company_id = p_company_id AND type = 'purchase';
    WHEN 'expense' THEN
      SELECT COALESCE(MAX(NULLIF(voucher_number, '')::bigint), 0) + 1 INTO v_next
      FROM public.expenses WHERE company_id = p_company_id;
    WHEN 'payment' THEN
      SELECT COALESCE(MAX(entry_number), 0) + 1 INTO v_next
      FROM public.journal_entries WHERE company_id = p_company_id;
    WHEN 'bond' THEN
      SELECT COALESCE(MAX(NULLIF(payment_number, '')::bigint), 0) + 1 INTO v_next
      FROM public.payments WHERE company_id = p_company_id;
    ELSE
      v_next := 1;
  END CASE;
  
  RETURN v_next::text;
END;
$$;


-- 4. Sales Analytics
CREATE OR REPLACE FUNCTION public.get_sales_analytics(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from date := COALESCE(p_start_date, (CURRENT_DATE - INTERVAL '30 days'));
  v_to date := COALESCE(p_end_date, CURRENT_DATE);
  v_total_sales numeric;
  v_total_returns numeric;
  v_net_sales numeric;
  v_invoice_count integer;
  v_avg_invoice numeric;
  v_top_products jsonb;
  v_top_customers jsonb;
  v_sales_by_day jsonb;
  v_sales_by_payment jsonb;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  -- Total Sales
  SELECT COALESCE(SUM(total_amount), 0) INTO v_total_sales
  FROM public.invoices
  WHERE company_id = p_company_id AND type = 'sale'
    AND status IN ('posted', 'paid', 'partially_paid')
    AND issue_date BETWEEN v_from AND v_to AND deleted_at IS NULL;

  -- Total Returns
  SELECT COALESCE(SUM(total_amount), 0) INTO v_total_returns
  FROM public.invoices
  WHERE company_id = p_company_id AND type = 'sale_return'
    AND status IN ('posted', 'paid', 'partially_paid')
    AND issue_date BETWEEN v_from AND v_to AND deleted_at IS NULL;

  -- Net Sales
  v_net_sales := v_total_sales - COALESCE(v_total_returns, 0);

  -- Invoice Count
  SELECT COUNT(*) INTO v_invoice_count
  FROM public.invoices
  WHERE company_id = p_company_id AND type = 'sale'
    AND status != 'void'
    AND issue_date BETWEEN v_from AND v_to AND deleted_at IS NULL;

  -- Average Invoice
  v_avg_invoice := CASE WHEN v_invoice_count > 0 THEN v_total_sales / v_invoice_count ELSE 0 END;

  -- Top Products
  SELECT jsonb_agg(result) INTO v_top_products FROM (
    SELECT p.name_ar as name, SUM(ii.total) as revenue, SUM(ii.quantity) as quantity
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    JOIN public.products p ON p.id = ii.product_id
    WHERE i.company_id = p_company_id AND i.type = 'sale'
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.issue_date BETWEEN v_from AND v_to AND i.deleted_at IS NULL
    GROUP BY p.id, p.name_ar ORDER BY revenue DESC LIMIT 10
  ) result;

  -- Top Customers
  SELECT jsonb_agg(result) INTO v_top_customers FROM (
    SELECT pr.name, SUM(i.total_amount) as revenue, COUNT(i.id) as count
    FROM public.invoices i
    JOIN public.parties pr ON pr.id = i.party_id
    WHERE i.company_id = p_company_id AND i.type = 'sale'
      AND i.status IN ('posted', 'paid', 'partially_paid')
      AND i.issue_date BETWEEN v_from AND v_to AND i.deleted_at IS NULL
    GROUP BY pr.id, pr.name ORDER BY revenue DESC LIMIT 10
  ) result;

  -- Sales by Day
  SELECT jsonb_agg(row_to_json(d)) INTO v_sales_by_day FROM (
    SELECT issue_date::text as date, SUM(total_amount) as sales
    FROM public.invoices
    WHERE company_id = p_company_id AND type = 'sale'
      AND status IN ('posted', 'paid', 'partially_paid')
      AND issue_date BETWEEN v_from AND v_to AND deleted_at IS NULL
    GROUP BY issue_date ORDER BY issue_date
  ) d;

  -- Sales by Payment Method
  SELECT jsonb_agg(row_to_json(d)) INTO v_sales_by_payment FROM (
    SELECT payment_method, SUM(total_amount) as total, COUNT(*) as count
    FROM public.invoices
    WHERE company_id = p_company_id AND type = 'sale'
      AND status IN ('posted', 'paid', 'partially_paid')
      AND issue_date BETWEEN v_from AND v_to AND deleted_at IS NULL
    GROUP BY payment_method
  ) d;

  RETURN jsonb_build_object(
    'totalSales', v_total_sales,
    'totalReturns', v_total_returns,
    'netSales', v_net_sales,
    'invoiceCount', v_invoice_count,
    'averageInvoiceValue', v_avg_invoice,
    'topProducts', COALESCE(v_top_products, '[]'::jsonb),
    'topCustomers', COALESCE(v_top_customers, '[]'::jsonb),
    'salesByDay', COALESCE(v_sales_by_day, '[]'::jsonb),
    'salesByPaymentMethod', COALESCE(v_sales_by_payment, '[]'::jsonb)
  );
END;
$$;


-- 5. Sales Stats (simplified)
CREATE OR REPLACE FUNCTION public.get_sales_stats(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
) RETURNS TABLE(
  total_sales numeric,
  invoice_count integer,
  avg_sale numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from date := COALESCE(p_start_date, (CURRENT_DATE - INTERVAL '30 days'));
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

  SELECT 
    COALESCE(SUM(total_amount), 0),
    COUNT(*),
    CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total_amount), 0) / COUNT(*) ELSE 0 END
  INTO total_sales, invoice_count, avg_sale
  FROM public.invoices
  WHERE company_id = p_company_id
    AND type = 'sale'
    AND status IN ('posted', 'paid', 'partially_paid')
    AND issue_date BETWEEN v_from AND v_to
    AND deleted_at IS NULL;
    
  RETURN NEXT;
END;
$$;
