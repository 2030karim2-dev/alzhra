import { supabase } from '../../lib/supabaseClient';
import { logger } from '../../core/utils/logger';

// Registry to deduplicate in-flight profile requests
const profileRequests = new Map<string, Promise<{ data: any, error: any, isAborted?: boolean }>>();

// Normalize an email address: trim whitespace and lowercase it so that
// minor input differences (autofill/copy-paste spaces, case) don't cause
// spurious "invalid credentials" errors on login/signup.
const normalizeEmail = (email: string): string => String(email || '').trim().toLowerCase();

export const authApi = {
  signInWithPassword: async (email: string, pass: string) => {
    return await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password: pass,
    });
  },

  signInWithGoogle: async (redirectTo?: string) => {
    return await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo || window.location.origin,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
  },

  // --- MFA Methods ---
  enrollMFA: async () => {
    return await supabase.auth.mfa.enroll({
      factorType: 'totp'
    });
  },

  challengeMFA: async (factorId: string) => {
    return await supabase.auth.mfa.challenge({ factorId });
  },

  verifyMFA: async (factorId: string, challengeId: string, code: string) => {
    return await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code
    });
  },
  // -------------------

  signUp: async (email: string, pass: string, companyName: string, fullName: string) => {
    // Ensure values are strings and trimmed
    const cleanFullName = String(fullName || '').trim();
    const cleanCompanyName = String(companyName || '').trim();

    return await supabase.auth.signUp({
      email: normalizeEmail(email),
      password: pass,
      options: {
        data: {
          full_name: cleanFullName,
          company_name: cleanCompanyName,
        }
      }
    });
  },

  getProfile: async (userId: string): Promise<{ data: any, error: any, isAborted?: boolean }> => {
    if (profileRequests.has(userId)) {
      return profileRequests.get(userId)!;
    }

    const fetchPromise = (async () => {
      try {
        const { data, error } = await (supabase.rpc as any)('get_user_profile', {
          p_user_id: userId,
        });

        if (!error && data && Array.isArray(data.companies) && data.companies.length > 0) {
          const { data: authData } = await supabase.auth.getUser();
          const user = authData?.user ?? null;

          const companies = [...data.companies].sort((a, b) => {
            const dateA = a.joined_at ? new Date(a.joined_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
            const dateB = b.joined_at ? new Date(b.joined_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
            return dateA - dateB;
          });

          const firstCompany = companies[0];

          return {
            data: {
              id: data.id,
              email: user?.email || '',
              full_name: data.full_name || user?.user_metadata?.full_name || '',
              avatar_url: data.avatar_url || user?.user_metadata?.avatar_url,
              role: firstCompany?.role || 'viewer',
              company_id: firstCompany?.company_id,
              company_name: firstCompany?.company_name,
              branch_id: firstCompany?.branch_id ?? null,
              branch_name: firstCompany?.branch_name ?? null,
            },
            error: null
          };
        }

        if (error) {
          const isAbort = error.name === 'AbortError' || error.message?.includes('aborted') || error.message === 'signal is aborted without reason';
          if (isAbort) return { data: null, error: null, isAborted: true };
          logger.warn('Auth', 'RPC get_user_profile failed, falling back to direct query', { message: error.message });
        }

        const [profileRes, roleRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          supabase.from('user_company_roles')
            .select('role, company_id, branch_id, created_at, companies:company_id(name_ar), branches:branch_id(name)')
            .eq('user_id', userId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
        ]);

        if (profileRes.error) {
          // 3. Last resort: construct minimal profile from auth session
          logger.warn('Auth', 'Profile table query failed', profileRes.error);
          const { data: authData } = await supabase.auth.getUser();
          const user = authData?.user ?? null;
          if (!user) {
            return { data: null, error: new Error('Authentication session lost. Please log in again.') };
          }

          // Even from the auth session we cannot know the user's company —
          // return an error so the caller forces a fresh login instead of
          // creating an authenticated user with company_id: null.
          return {
            data: null,
            error: new Error('تعذر تحديد الشركة المرتبطة بالحساب. يرجى تسجيل الخروج ثم تسجيل الدخول مجدداً.'),
          };
        }

        const profileData = profileRes.data as any;

        // Get email from session user if missing
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user ?? null;

        const roleCompanyId = (roleRes.data as any)?.company_id;

        // If we genuinely could not resolve a company_id from ANY source,
        // return an error instead of a broken profile. This forces the caller
        // to handle it (clear session / prompt re-login) rather than showing
        // "No Company ID" errors throughout the app.
        if (!roleCompanyId) {
          logger.error('Auth', 'getProfile: no company_id resolvable from user_company_roles', {
            userId,
            roleResError: (roleRes.data as any)?.error,
          });
          return { data: null, error: new Error('تعذر تحديد الشركة المرتبطة بالحساب. يرجى تسجيل الخروج ثم تسجيل الدخول مجدداً.') };
        }

        const fallbackData = {
          id: userId,
          email: user?.email || '',
          full_name: profileData?.full_name || user?.user_metadata?.full_name || '',
          avatar_url: profileData?.avatar_url || user?.user_metadata?.avatar_url,
          role: (roleRes.data as any)?.role || 'viewer',
          company_id: roleCompanyId,
          company_name: (roleRes.data as any)?.companies?.name_ar || (roleRes.data as any)?.companies,
          branch_id: (roleRes.data as any)?.branch_id ?? null,
          branch_name: (roleRes.data as any)?.branches?.name ?? null,
        };

        return { data: fallbackData, error: null };
      } catch (err: unknown) {
        // ⚡ Handle AbortError gracefully (common in concurrent auth checks)
        const error = err as Error;
        if (error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message === 'signal is aborted without reason') {
          return { data: null, error: null, isAborted: true }; // Flag as aborted
        }

        logger.error('Auth', 'Profile fetch exception', error);
        return { data: null, error: err };
      } finally {
        // 3. Clear request from registry once finished/failed
        profileRequests.delete(userId);
      }
    })() as Promise<{ data: any, error: any, isAborted?: boolean }>;

    // Store promise in registry
    profileRequests.set(userId, fetchPromise);
    return fetchPromise;
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },

  resetPasswordForEmail: async (email: string) => {
    return await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: `${window.location.origin}/update-password`,
    });
  },

  updateUserPassword: async (password: string) => {
    // Supabase requires the user to have recently authenticated.
    // If the session is stale, updateUser will fail with a reauthentication error.
    return await supabase.auth.updateUser({ password });
  },

  // Note: inviteUser moved to settingsApi.inviteUser (includes created_by field)
};
