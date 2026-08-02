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
    // Deduplicate in-flight requests only (avoid concurrent calls racing).
    // On failure, clear the cached promise so a retry can issue a fresh request.
    if (profileRequests.has(userId)) {
      return profileRequests.get(userId)!;
    }

    const fetchPromise = (async () => {
      try {
        // 1. Try RPC first
        const { data, error } = await (supabase.rpc as any)('get_user_profile', {
          p_user_id: userId,
        });

        if (!error && data && Object.keys(data).length > 2) {
          // Fetch email from session as RPC does not return it
          const { data: authData } = await supabase.auth.getUser();
          const user = authData?.user ?? null;

          if (!Array.isArray(data.companies) || data.companies.length === 0) {
            logger.warn('Auth', 'RPC returned profile with no companies, falling back');
            throw new Error('No companies in profile');
          }

          // Sort companies by joined_at/created_at ASC (oldest first = original company with data)
          const companies = [...data.companies].sort((a, b) => {
            const dateA = a.joined_at ? new Date(a.joined_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
            const dateB = b.joined_at ? new Date(b.joined_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
            return dateA - dateB;
          });

          const firstCompany = companies[0];

          if (!firstCompany?.company_id) {
            logger.error('Auth', 'Profile loaded but company_id is missing — all data queries will be disabled', {
              userId: data.id,
              companiesCount: companies.length
            });
          }

          const flatData = {
            id: data.id,
            email: user?.email || '',
            full_name: data.full_name || user?.user_metadata?.full_name || '',
            avatar_url: data.avatar_url || user?.user_metadata?.avatar_url,
            role: firstCompany?.role || 'viewer',
            company_id: firstCompany?.company_id,
            company_name: firstCompany?.company_name,
            branch_id: firstCompany?.branch_id ?? null,
            branch_name: firstCompany?.branch_name ?? null,
          };

          return { data: flatData, error: null };
        }

        // 2. Fallback: Manual fetch if RPC fails (e.g. timeout or connection closed)
        if (error) {
          // ⚡ Skip warning for abortions as they are expected during concurrency
          const isAbort = error.name === 'AbortError' || error.message?.includes('aborted') || error.message === 'signal is aborted without reason';

          if (isAbort) {
            return { data: null, error: null, isAborted: true };
          }

          logger.warn('Auth', `RPC get_user_profile failed (${error.code}: ${error.message}), failing back to manual`, {
            code: error.code,
            message: error.message,
            details: error.details
          });
        } else {
          logger.warn('Auth', 'RPC get_user_profile returned incomplete data, attempting manual fallback');
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
          logger.warn('Auth', 'Profile table query failed, constructing from auth session', profileRes.error);
          const { data: authData } = await supabase.auth.getUser();
          const user = authData?.user ?? null;
          if (!user) {
            return { data: null, error: new Error('Authentication session lost. Please log in again.') };
          }

          const sessionProfile = {
            id: userId,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || '',
            avatar_url: user.user_metadata?.avatar_url || null,
            role: 'viewer',
            company_id: null,
            company_name: null,
            branch_id: null,
            branch_name: null,
          };

          return { data: sessionProfile, error: null };
        }

        const profileData = profileRes.data as any;

        // Get email from session user if missing
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user ?? null;

        const fallbackData = {
          id: userId,
          email: user?.email || '',
          full_name: profileData?.full_name || user?.user_metadata?.full_name || '',
          avatar_url: profileData?.avatar_url || user?.user_metadata?.avatar_url,
          role: (roleRes.data as any)?.role || 'viewer',
          company_id: (roleRes.data as any)?.company_id,
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
