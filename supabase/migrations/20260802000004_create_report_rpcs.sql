-- Migration: Report RPCs
-- report_trial_balance, report_profit_loss, report_balance_sheet, report_cash_flow, report_debt_aging

-- 1. Trial Balance
CREATE OR REPLACE FUNCTION public.report_trial_balance(
  p_company_id uuid,
  p_from date,
  p_to date,
  p_branch_id uuid DEFAULT NULL
) RETURNS TABLE(
  account_code text,
  account_id uuid,
  account_name text,
  account_type text,
  balance numeric,
  total_debit numeric,
  total_credit numeric
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
    a.code,
    a.id,
    a.name_ar,
    a.type,
    COALESCE(SUM(jel.debit_amount) - SUM(jel.credit_amount), 0) as balance,
    COALESCE(SUM(jel.debit_amount), 0) as total_debit,
    COALESCE(SUM(jel.credit_amount), 0) as total_credit
  FROM public.accounts a
  LEFT JOIN public.journal_entry_lines jel ON jel.account_id = a.id
    AND jel.deleted_at IS NULL
    AND (p_branch_id IS NULL OR jel.branch_id = p_branch_id)
  LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    AND je.status = 'posted'
    AND je.deleted_at IS NULL
    AND je.entry_date BETWEEN p_from AND p_to
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.deleted_at IS NULL
  GROUP BY a.id, a.code, a.name_ar, a.type
  ORDER BY a.code;
END;
$$;


-- 2. Profit & Loss (Income Statement)
CREATE OR REPLACE FUNCTION public.report_profit_loss(
  p_company_id uuid,
  p_from date,
  p_to date
) RETURNS TABLE(
  category text,
  amount numeric,
  type text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_revenue numeric;
  v_expense numeric;
  v_gross_profit numeric;
  v_net_profit numeric;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  -- Revenue (accounts starting with 4)
  SELECT COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0) INTO v_revenue
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.code LIKE '4%'
    AND je.status = 'posted' AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date BETWEEN p_from AND p_to;

  -- Expenses (accounts starting with 5)
  SELECT COALESCE(SUM(jel.debit_amount) - SUM(jel.credit_amount), 0) INTO v_expense
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.code LIKE '5%'
    AND je.status = 'posted' AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date BETWEEN p_from AND p_to;

  v_net_profit := v_revenue - v_expense;
  v_gross_profit := v_revenue;

  -- Return rows
  category := 'الإيرادات'; amount := v_revenue; type := 'revenue'; RETURN NEXT;
  category := 'المصروفات'; amount := v_expense; type := 'expense'; RETURN NEXT;
  category := 'صافي الربح/الخسارة'; amount := v_net_profit; type := 'net_profit'; RETURN NEXT;
END;
$$;


-- 3. Balance Sheet
CREATE OR REPLACE FUNCTION public.report_balance_sheet(
  p_company_id uuid,
  p_as_of_date date DEFAULT NULL
) RETURNS TABLE(
  category text,
  amount numeric,
  type text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_date date := COALESCE(p_as_of_date, CURRENT_DATE);
  v_assets numeric;
  v_liabilities numeric;
  v_equity numeric;
  v_cash numeric;
  v_receivables numeric;
  v_inventory_value numeric;
  v_payables numeric;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  -- Assets (accounts starting with 1)
  SELECT COALESCE(SUM(jel.debit_amount) - SUM(jel.credit_amount), 0) INTO v_assets
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.code LIKE '1%'
    AND je.status = 'posted' AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date <= v_date;

  -- Liabilities (accounts starting with 2)
  SELECT COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0) INTO v_liabilities
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.code LIKE '2%'
    AND je.status = 'posted' AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date <= v_date;

  -- Equity (accounts starting with 3)
  SELECT COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0) INTO v_equity
  FROM public.journal_entry_lines jel
  JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  JOIN public.accounts a ON a.id = jel.account_id
  WHERE a.company_id = p_company_id
    AND a.code LIKE '3%'
    AND je.status = 'posted' AND je.deleted_at IS NULL
    AND jel.deleted_at IS NULL
    AND je.entry_date <= v_date;

  -- Return rows in proper order
  category := 'الأصول'; amount := v_assets; type := 'asset'; RETURN NEXT;
  category := 'الالتزامات'; amount := v_liabilities; type := 'liability'; RETURN NEXT;
  category := 'حقوق الملكية'; amount := v_equity; type := 'equity'; RETURN NEXT;
END;
$$;


-- 4. Cash Flow
CREATE OR REPLACE FUNCTION public.report_cash_flow(
  p_company_id uuid,
  p_from date,
  p_to date
) RETURNS TABLE(
  category text,
  inflow numeric,
  outflow numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_operating_in numeric;
  v_operating_out numeric;
  v_investing_in numeric;
  v_investing_out numeric;
  v_financing_in numeric;
  v_financing_out numeric;
  v_actual_company_id uuid;
BEGIN
  v_actual_company_id := (SELECT get_user_company_id());
  IF v_actual_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_actual_company_id != p_company_id THEN
    RAISE EXCEPTION 'Company ID mismatch: access denied';
  END IF;

  -- Operating inflow (sales cash receipts)
  SELECT COALESCE(SUM(i.total_amount), 0) INTO v_operating_in
  FROM public.invoices i
  WHERE i.company_id = p_company_id
    AND i.type = 'sale'
    AND i.status IN ('paid', 'partially_paid')
    AND i.payment_method = 'cash'
    AND i.issue_date BETWEEN p_from AND p_to
    AND i.deleted_at IS NULL;

  -- Operating outflow (expenses paid)
  SELECT COALESCE(SUM(e.amount), 0) INTO v_operating_out
  FROM public.expenses e
  WHERE e.company_id = p_company_id
    AND e.status = 'posted'
    AND e.payment_method IN ('cash', 'bank')
    AND e.expense_date BETWEEN p_from AND p_to
    AND e.deleted_at IS NULL;

  -- Receipt bonds
  SELECT COALESCE(SUM(p.amount), 0) INTO v_financing_in
  FROM public.payments p
  WHERE p.company_id = p_company_id
    AND p.type = 'receipt'
    AND p.status = 'posted'
    AND p.payment_date BETWEEN p_from AND p_to
    AND p.deleted_at IS NULL;

  -- Payment bonds
  SELECT COALESCE(SUM(p.amount), 0) INTO v_financing_out
  FROM public.payments p
  WHERE p.company_id = p_company_id
    AND p.type = 'disbursement'
    AND p.status = 'posted'
    AND p.payment_date BETWEEN p_from AND p_to
    AND p.deleted_at IS NULL;

  category := 'التشغيل'; inflow := v_operating_in; outflow := v_operating_out; RETURN NEXT;
  category := 'الاستثمار'; inflow := 0; outflow := 0; RETURN NEXT;
  category := 'التمويل'; inflow := v_financing_in; outflow := v_financing_out; RETURN NEXT;
END;
$$;


-- 5. Debt Aging Report
CREATE OR REPLACE FUNCTION public.report_debt_aging(
  p_company_id uuid
) RETURNS TABLE(
  customer_name text,
  total numeric,
  days_0_30 numeric,
  days_31_60 numeric,
  days_61_90 numeric,
  days_90_plus numeric
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
    COALESCE(pr.name, 'نقدي') as customer_name,
    SUM(i.total_amount - COALESCE(i.paid_amount, 0)) as total,
    SUM(CASE WHEN i.due_date >= CURRENT_DATE - INTERVAL '30 days' THEN i.total_amount - COALESCE(i.paid_amount, 0) ELSE 0 END) as days_0_30,
    SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '31 days' THEN i.total_amount - COALESCE(i.paid_amount, 0) ELSE 0 END) as days_31_60,
    SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - INTERVAL '90 days' AND CURRENT_DATE - INTERVAL '61 days' THEN i.total_amount - COALESCE(i.paid_amount, 0) ELSE 0 END) as days_61_90,
    SUM(CASE WHEN i.due_date < CURRENT_DATE - INTERVAL '90 days' THEN i.total_amount - COALESCE(i.paid_amount, 0) ELSE 0 END) as days_90_plus
  FROM public.invoices i
  LEFT JOIN public.parties pr ON pr.id = i.party_id
  WHERE i.company_id = p_company_id
    AND i.type = 'sale'
    AND i.status IN ('posted', 'partially_paid')
    AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0
    AND i.deleted_at IS NULL
  GROUP BY pr.id, pr.name
  ORDER BY total DESC;
END;
$$;
