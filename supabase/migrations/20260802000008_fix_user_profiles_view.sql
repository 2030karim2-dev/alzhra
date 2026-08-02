-- ============================================================
-- FIX ALL: Complete Supabase Connection & Data Visibility Fix
-- ============================================================
-- 
-- Problems found in frontend-backend integration:
-- 1. user_profiles view doesn't exist → RLS functions fail silently
-- 2. get_user_company_id() queries non-existent "user_profiles" table
-- 3. get_user_profile() has no ORDER BY → companies returned in 
--    arbitrary order, often selecting empty company first
-- 4. RLS policies reference user_profiles table which doesn't exist
--
-- Run this ENTIRE script in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/zzthamxjxnxzzpswllid/sql/new
-- ============================================================

-- -------------------------------------------------------
-- FIX 1: Create user_profiles VIEW 
--   This is the CRITICAL fix - without it, ALL RLS policies fail
--   because get_user_company_id() looks up company_id from this view
-- -------------------------------------------------------
CREATE OR REPLACE VIEW public.user_profiles AS
SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    p.created_at,
    p.updated_at,
    COALESCE(ucr.role, 'viewer') AS role,
    ucr.company_id,
    ucr.branch_id
FROM public.profiles p
LEFT JOIN public.user_company_roles ucr ON p.id = ucr.user_id;

GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT ON public.user_profiles TO anon;

-- -------------------------------------------------------
-- FIX 2: Rewrite get_user_company_id() 
--   Direct query to user_company_roles instead of view 
--   (faster, more reliable)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT company_id 
    FROM public.user_company_roles 
    WHERE user_id = auth.uid()
    ORDER BY created_at ASC
    LIMIT 1;
$$;

-- -------------------------------------------------------
-- FIX 3: Rewrite get_user_role()
--   Direct query to user_company_roles
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT role::text
    FROM public.user_company_roles 
    WHERE user_id = auth.uid()
    ORDER BY created_at ASC
    LIMIT 1;
$$;

-- -------------------------------------------------------
-- FIX 4: Rewrite user_is_admin_or_manager()
--   Include 'owner' role + direct query
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_admin_or_manager()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_company_roles
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin', 'manager')
    );
$$;

-- -------------------------------------------------------
-- FIX 5: Rewrite get_user_profile()
--   Add ORDER BY ucr.created_at ASC so the OLDEST (first created)
--   company comes first - this ensures the company with historical
--   data (Aljaafari) is selected rather than empty new companies.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_profile(
  p_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', u.id,
    'full_name', COALESCE(
        (SELECT full_name FROM public.profiles WHERE id = u.id),
        u.raw_user_meta_data->>'full_name',
        ''
    ),
    'avatar_url', COALESCE(
        (SELECT avatar_url FROM public.profiles WHERE id = u.id),
        u.raw_user_meta_data->>'avatar_url',
        ''
    ),
    'companies', COALESCE(
      (SELECT jsonb_agg(sub.companies ORDER BY sub.sort_order)
       FROM (
         SELECT jsonb_build_object(
           'company_id', ucr.company_id,
           'company_name', c.name,
           'role', ucr.role,
           'branch_id', ucr.branch_id,
           'branch_name', COALESCE(b.name_ar, ''),
           'joined_at', ucr.created_at
         ) AS companies,
         ucr.created_at AS sort_order
         FROM public.user_company_roles ucr
         JOIN public.companies c ON c.id = ucr.company_id
         LEFT JOIN public.branches b ON b.id = ucr.branch_id
         WHERE ucr.user_id = p_user_id
       ) sub),
      '[]'::jsonb
    )
  ) INTO v_result
  FROM auth.users u
  WHERE u.id = p_user_id;

  RETURN v_result;
END;
$$;

-- -------------------------------------------------------
-- FIX 6: Add has_role_permission function if missing
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role_permission(
  p_role TEXT,
  p_resource TEXT,
  p_action TEXT
) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_role = 'owner' THEN true
    WHEN p_role = 'admin' THEN true
    WHEN p_role = 'manager' AND p_action IN ('select', 'insert', 'update') THEN true
    WHEN p_role = 'accountant' AND p_resource IN ('accounting', 'expenses', 'journal') AND p_action IN ('select', 'insert', 'update') THEN true
    WHEN p_role = 'accountant' AND p_action = 'select' THEN true
    WHEN p_role = 'sales' AND p_resource IN ('sales', 'customers', 'parties') AND p_action IN ('select', 'insert') THEN true
    WHEN p_role = 'sales' AND p_resource = 'inventory' AND p_action = 'select' THEN true
    WHEN p_role = 'viewer' AND p_action = 'select' THEN true
    ELSE false
  END;
$$;

-- -------------------------------------------------------
-- VERIFICATION QUERIES
-- -------------------------------------------------------
SELECT '✅ All fixes applied!' AS status;
SELECT '📊 user_profiles view: ' || COUNT(*)::text || ' rows' FROM public.user_profiles;
SELECT '🏢 Companies: ' || COUNT(*)::text FROM public.companies;
SELECT '📦 Products: ' || COUNT(*)::text FROM public.products;
SELECT '👤 User-company-roles: ' || COUNT(*)::text FROM public.user_company_roles;
