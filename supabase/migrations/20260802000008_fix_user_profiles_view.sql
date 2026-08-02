-- ============================================================
-- Fix: Create user_profiles VIEW for RLS Compatibility
-- ============================================================
-- Problem: get_user_company_id() and RLS policies reference 
--   "user_profiles" table which doesn't exist in the database.
--   The actual table is "profiles" without company_id column.
--   company_id and role are in "user_company_roles" table.
-- ============================================================
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/zzthamxjxnxzzpswllid/sql/new
-- ============================================================

-- Step 1: Create user_profiles VIEW
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

-- Step 2: Grant permissions
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT ON public.user_profiles TO anon;

-- Step 3: Fix get_user_company_id function
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT company_id 
    FROM public.user_company_roles 
    WHERE user_id = auth.uid()
    LIMIT 1;
$$;

-- Step 4: Fix get_user_role function
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT role::text
    FROM public.user_company_roles 
    WHERE user_id = auth.uid()
    LIMIT 1;
$$;

-- Step 5: Fix get_user_profile RPC to work without user_profiles table
CREATE OR REPLACE FUNCTION public.get_user_profile(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT,
    company_id UUID,
    company_name TEXT,
    branch_id UUID,
    branch_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT 
        p.id,
        au.email,
        p.full_name,
        p.avatar_url,
        ucr.role,
        ucr.company_id,
        c.name_ar AS company_name,
        ucr.branch_id,
        b.name AS branch_name
    FROM public.profiles p
    LEFT JOIN auth.users au ON p.id = au.id
    LEFT JOIN public.user_company_roles ucr ON p.id = ucr.user_id
    LEFT JOIN public.companies c ON ucr.company_id = c.id
    LEFT JOIN public.branches b ON ucr.branch_id = b.id
    WHERE p.id = p_user_id;
$$;

-- Step 6: Verify everything works
SELECT 'View created successfully' AS status;
SELECT count(*) AS profile_count FROM public.user_profiles;
SELECT count(*) AS companies FROM public.companies;
