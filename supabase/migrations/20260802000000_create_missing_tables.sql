-- Migration: Create missing core tables
-- Run: supabase migration up or paste into SQL Editor

-- 1. Cashboxes (for POS/Treasury)
CREATE TABLE IF NOT EXISTS public.cashboxes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  branch_id uuid,
  name text NOT NULL,
  account_id uuid,
  currency_code text NOT NULL DEFAULT 'SAR'::text,
  is_active boolean NOT NULL DEFAULT true,
  opening_balance numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT cashboxes_pkey PRIMARY KEY (id),
  CONSTRAINT cashboxes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT cashboxes_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id),
  CONSTRAINT cashboxes_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id),
  CONSTRAINT cashboxes_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES public.supported_currencies(code),
  CONSTRAINT cashboxes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

-- 2. Monthly Targets (for dashboard)
CREATE TABLE IF NOT EXISTS public.monthly_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  branch_id uuid,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  sales_target numeric NOT NULL DEFAULT 0,
  collection_target numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT monthly_targets_pkey PRIMARY KEY (id),
  CONSTRAINT monthly_targets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT monthly_targets_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id),
  CONSTRAINT monthly_targets_unique UNIQUE (company_id, branch_id, year, month)
);

-- 3. Suspended Orders (for POS)
CREATE TABLE IF NOT EXISTS public.suspended_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  branch_id uuid,
  user_id uuid NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  customer jsonb,
  suspended_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT suspended_orders_pkey PRIMARY KEY (id),
  CONSTRAINT suspended_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT suspended_orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id),
  CONSTRAINT suspended_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- 4. Backup Configs
CREATE TABLE IF NOT EXISTS public.backup_configs (
  company_id uuid NOT NULL,
  auto_backup_enabled boolean NOT NULL DEFAULT false,
  backup_frequency_hours integer NOT NULL DEFAULT 24,
  google_drive_folder_id text,
  last_backup_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT backup_configs_pkey PRIMARY KEY (company_id),
  CONSTRAINT backup_configs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

-- 5. Backup Logs
CREATE TABLE IF NOT EXISTS public.backup_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid,
  backup_type text NOT NULL CHECK (backup_type = ANY (ARRAY['manual'::text, 'auto'::text, 'google_drive'::text])),
  file_name text,
  file_size_bytes bigint,
  google_drive_link text,
  status text NOT NULL DEFAULT 'success'::text CHECK (status = ANY (ARRAY['success'::text, 'failed'::text])),
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT backup_logs_pkey PRIMARY KEY (id),
  CONSTRAINT backup_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT backup_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
