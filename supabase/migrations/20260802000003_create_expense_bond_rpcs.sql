-- Migration: Expenses & Bonds RPCs
-- commit_expense_v2, get_expense_stats, commit_payment, void_bond

-- 1. Commit Expense (creates expense record + journal entry)
CREATE OR REPLACE FUNCTION public.commit_expense_v2(
  p_company_id uuid,
  p_user_id uuid,
  p_data jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_expense_id uuid;
  v_voucher_number text;
  v_category_id uuid;
  v_amount numeric;
  v_currency_code text;
  v_exchange_rate numeric;
  v_date date;
  v_description text;
  v_payment_method text;
  v_branch_id uuid;
  v_fiscal_year_id uuid;
  v_cash_account_id uuid;
  v_expense_account_id uuid;
  v_entry_id uuid;
BEGIN
  v_category_id := (p_data->>'category_id')::uuid;
  v_amount := COALESCE((p_data->>'amount')::numeric, 0);
  v_currency_code := COALESCE(p_data->>'currency_code', 'SAR');
  v_exchange_rate := COALESCE((p_data->>'exchange_rate')::numeric, 1);
  v_date := COALESCE((p_data->>'expense_date')::date, CURRENT_DATE);
  v_description := COALESCE(p_data->>'description', '');
  v_payment_method := COALESCE(p_data->>'payment_method', 'cash');
  v_branch_id := (p_data->>'branch_id')::uuid;

  -- Get fiscal year
  SELECT id INTO v_fiscal_year_id FROM public.fiscal_years
  WHERE company_id = p_company_id AND is_closed = false
  AND v_date BETWEEN start_date AND end_date LIMIT 1;

  -- Generate voucher number
  v_voucher_number := COALESCE(p_data->>'voucher_number', '');
  IF v_voucher_number = '' THEN
    SELECT COALESCE(MAX(entry_number), 0) + 1 INTO v_voucher_number
    FROM public.journal_entries WHERE company_id = p_company_id;
    v_voucher_number := 'EXP-' || v_voucher_number::text;
  END IF;

  -- Create expense record
  INSERT INTO public.expenses (
    company_id, category_id, voucher_number, description,
    amount, currency_code, exchange_rate, expense_date,
    status, payment_method, created_by, branch_id
  ) VALUES (
    p_company_id, v_category_id, v_voucher_number, v_description,
    v_amount, v_currency_code, v_exchange_rate, v_date,
    'posted', v_payment_method, p_user_id, v_branch_id
  ) RETURNING id INTO v_expense_id;

  -- Get accounts
  SELECT id INTO v_cash_account_id FROM public.accounts
  WHERE company_id = p_company_id AND code LIKE '1%' AND type = 'asset' AND is_active = true LIMIT 1;

  SELECT id INTO v_expense_account_id FROM public.accounts
  WHERE company_id = p_company_id AND code LIKE '5%' AND type = 'expense' LIMIT 1;

  -- Create journal entry
  IF v_cash_account_id IS NOT NULL AND v_expense_account_id IS NOT NULL THEN
    INSERT INTO public.journal_entries (
      company_id, entry_number, entry_date, description,
      reference_type, reference_id, status, created_by, branch_id, fiscal_year_id
    ) VALUES (
      p_company_id,
      (SELECT COALESCE(MAX(entry_number), 0) + 1 FROM public.journal_entries WHERE company_id = p_company_id),
      v_date, v_description,
      'expense', v_expense_id, 'posted', p_user_id, v_branch_id, v_fiscal_year_id
    ) RETURNING id INTO v_entry_id;

    -- Debit: Expense
    INSERT INTO public.journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount,
      description, currency_code, company_id, branch_id
    ) VALUES (
      v_entry_id, v_expense_account_id, v_amount, 0,
      v_description, v_currency_code, p_company_id, v_branch_id
    );

    -- Credit: Cash
    INSERT INTO public.journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount,
      description, currency_code, company_id, branch_id
    ) VALUES (
      v_entry_id, v_cash_account_id, 0, v_amount,
      v_description, v_currency_code, p_company_id, v_branch_id
    );
  END IF;

  RETURN jsonb_build_object('id', v_expense_id, 'voucher_number', v_voucher_number);
END;
$$;


-- 2. Expense Stats
CREATE OR REPLACE FUNCTION public.get_expense_stats(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
) RETURNS TABLE(
  total_amount numeric,
  expense_count integer,
  avg_amount numeric,
  by_category jsonb
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from date := COALESCE(p_start_date, (CURRENT_DATE - INTERVAL '30 days'));
  v_to date := COALESCE(p_end_date, CURRENT_DATE);
BEGIN
  SELECT 
    COALESCE(SUM(amount), 0),
    COUNT(*),
    CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(amount), 0) / COUNT(*) ELSE 0 END
  INTO total_amount, expense_count, avg_amount
  FROM public.expenses
  WHERE company_id = p_company_id
    AND status = 'posted' AND deleted_at IS NULL
    AND expense_date BETWEEN v_from AND v_to
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  SELECT jsonb_agg(row_to_json(d)) INTO by_category FROM (
    SELECT ec.name as category, SUM(e.amount) as amount, COUNT(*) as count
    FROM public.expenses e
    JOIN public.expense_categories ec ON ec.id = e.category_id
    WHERE e.company_id = p_company_id
      AND e.status = 'posted' AND e.deleted_at IS NULL
      AND e.expense_date BETWEEN v_from AND v_to
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
    GROUP BY ec.id, ec.name ORDER BY amount DESC
  ) d;

  RETURN NEXT;
END;
$$;


-- 3. Commit Payment (creates payment + journal entry)
CREATE OR REPLACE FUNCTION public.commit_payment(
  p_company_id uuid,
  p_user_id uuid,
  p_type text,
  p_amount numeric,
  p_date date,
  p_cash_account_id uuid,
  p_counterparty_type text DEFAULT NULL,
  p_counterparty_id uuid DEFAULT NULL,
  p_description text DEFAULT '',
  p_payment_method text DEFAULT 'cash',
  p_reference_number text DEFAULT '',
  p_currency_code text DEFAULT 'SAR',
  p_exchange_rate numeric DEFAULT 1,
  p_foreign_amount numeric DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_payment_id uuid;
  v_payment_number text;
  v_fiscal_year_id uuid;
  v_counter_account_id uuid;
  v_entry_id uuid;
BEGIN
  -- Get fiscal year
  SELECT id INTO v_fiscal_year_id FROM public.fiscal_years
  WHERE company_id = p_company_id AND is_closed = false
  AND p_date BETWEEN start_date AND end_date LIMIT 1;

  -- Generate payment number
  SELECT COALESCE(MAX(NULLIF(payment_number, '')::bigint), 0) + 1 INTO v_payment_number
  FROM public.payments WHERE company_id = p_company_id;
  v_payment_number := v_payment_number::text;

  -- Create payment
  INSERT INTO public.payments (
    company_id, payment_number, type, amount,
    currency_code, exchange_rate, payment_date, payment_method,
    account_id, reference_type, notes, status,
    created_by, branch_id, party_id
  ) VALUES (
    p_company_id, v_payment_number, p_type, p_amount,
    p_currency_code, p_exchange_rate, p_date, p_payment_method,
    p_cash_account_id, 'bond', p_description, 'posted',
    p_user_id, p_branch_id, 
    CASE WHEN p_counterparty_type = 'party' THEN p_counterparty_id ELSE NULL END
  ) RETURNING id INTO v_payment_id;

  -- Get counter account
  IF p_counterparty_type = 'account' AND p_counterparty_id IS NOT NULL THEN
    v_counter_account_id := p_counterparty_id;
  ELSE
    -- Default: use revenue for receipts, expense for disbursements
    IF p_type = 'receipt' THEN
      SELECT id INTO v_counter_account_id FROM public.accounts
      WHERE company_id = p_company_id AND code LIKE '4%' AND type = 'revenue' LIMIT 1;
    ELSE
      SELECT id INTO v_counter_account_id FROM public.accounts
      WHERE company_id = p_company_id AND code LIKE '5%' AND type = 'expense' LIMIT 1;
    END IF;
  END IF;

  -- Create journal entry
  IF v_counter_account_id IS NOT NULL THEN
    INSERT INTO public.journal_entries (
      company_id, entry_number, entry_date, description,
      reference_type, reference_id, status, created_by, branch_id, fiscal_year_id
    ) VALUES (
      p_company_id,
      (SELECT COALESCE(MAX(entry_number), 0) + 1 FROM public.journal_entries WHERE company_id = p_company_id),
      p_date, COALESCE(p_description, CASE p_type WHEN 'receipt' THEN 'سند قبض' WHEN 'disbursement' THEN 'سند صرف' ELSE 'سند' END),
      'payment', v_payment_id, 'posted', p_user_id, p_branch_id, v_fiscal_year_id
    ) RETURNING id INTO v_entry_id;

    IF p_type = 'receipt' THEN
      -- Debit: Cash, Credit: Counter
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, currency_code, company_id, branch_id)
      VALUES (v_entry_id, p_cash_account_id, p_amount, 0, 'سند قبض', p_currency_code, p_company_id, p_branch_id);
      
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, currency_code, company_id, branch_id)
      VALUES (v_entry_id, v_counter_account_id, 0, p_amount, 'سند قبض', p_currency_code, p_company_id, p_branch_id);
    ELSE
      -- Debit: Counter, Credit: Cash
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, currency_code, company_id, branch_id)
      VALUES (v_entry_id, v_counter_account_id, p_amount, 0, 'سند صرف', p_currency_code, p_company_id, p_branch_id);
      
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, currency_code, company_id, branch_id)
      VALUES (v_entry_id, p_cash_account_id, 0, p_amount, 'سند صرف', p_currency_code, p_company_id, p_branch_id);
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_payment_id, 'payment_number', v_payment_number);
END;
$$;


-- 4. Void Bond (creates reversal journal entry)
CREATE OR REPLACE FUNCTION public.void_bond(
  p_payment_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_payment record;
  v_entry_id uuid;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  
  IF v_payment IS NULL OR v_payment.status = 'void' THEN
    RAISE EXCEPTION 'Payment not found or already voided';
  END IF;

  -- Void the payment
  UPDATE public.payments SET status = 'void', updated_at = now() WHERE id = p_payment_id;

  -- Void related journal entries
  UPDATE public.journal_entries SET status = 'void', updated_at = now()
  WHERE reference_type = 'payment' AND reference_id = p_payment_id;
END;
$$;
