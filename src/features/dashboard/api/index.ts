/**
 * Dashboard API Layer
 * Pure functions for fetching raw data from Supabase
 */

import { supabase } from '@/lib/supabaseClient';

export const dashboardApi = {
    /**
     * Fetches the core dashboard raw data in a single parallel transaction
     * @param companyId The current active company ID
     * @param dateLimit The ISO string limit for filtering (e.g., last 30 days)
     * @param branchId Optional branch UUID for branch-level filtering
     */
    async fetchRawDashboardData(companyId: string, _dateLimit: string, signal?: AbortSignal, branchId?: string | null) {
        // We now use Thick Database architecture (Postgres RPCs) for instant calculations
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateFrom = thirtyDaysAgo.toISOString().split('T')[0];
        const dateTo = new Date().toISOString().split('T')[0];
        // ⚡ PERFORMANCE FIX: Changed from '2000-01-01' → start of current year
        // Old query scanned ALL accounting history (26+ years) — very slow
        const currentYearStart = `${new Date().getFullYear()}-01-01`;

        const batch = await Promise.all([
            // 1. Dashboard Summary (Sales, Purchases, Expenses, Bonds, Debts)
            supabase.rpc('get_dashboard_summary', {
                p_company_id: companyId,
                p_branch_id: branchId || null,
                p_date_from: dateFrom,
                p_date_to: dateTo
            }).abortSignal(signal as any),

            // 2. Sales Chart Data
            supabase.rpc('get_sales_chart_data', {
                p_company_id: companyId,
                p_branch_id: branchId || null,
                p_date_from: dateFrom,
                p_date_to: dateTo
            }).abortSignal(signal as any),

            // 3. Top Products & Customers
            supabase.rpc('get_top_products_and_customers', {
                p_company_id: companyId,
                p_branch_id: branchId || null,
                p_limit: 3
            }).abortSignal(signal as any),

            // 4. ⚡ Low Stock Products via RPC (replaces JS filtering)
            supabase.rpc('get_low_stock_products', {
                p_company_id: companyId,
                p_branch_id: branchId || null
            }).abortSignal(signal as any),

            // 5. ⚡ Expense Categories via RPC (replaces JS grouping)
            supabase.rpc('get_expense_categories_summary', {
                p_company_id: companyId,
                p_date_from: dateFrom,
                p_date_to: dateTo,
                p_branch_id: branchId || null
            }).abortSignal(signal as any),

            // 6. Trial Balance for accurate Net Profit based on Accounting Trees
            supabase.rpc('report_trial_balance', {
                p_company_id: companyId,
                p_from: currentYearStart,
                p_to: dateTo,
                p_branch_id: branchId || null
            } as any).abortSignal(signal as any),

            // 7. Recent Invoices for insights
            supabase.from('invoices').select('id,invoice_number,total_amount,paid_amount,issue_date,due_date,status,type')
                .eq('company_id', companyId)
                .gte('issue_date', dateFrom)
                .lte('issue_date', dateTo)
                .neq('status', 'void')
                .is('deleted_at', null)
                .order('issue_date', { ascending: false })
                .limit(100)
                .abortSignal(signal as any),

            // 8. Recent Expenses for insights
            supabase.from('expenses').select('id,amount,description,expense_date,status')
                .eq('company_id', companyId)
                .gte('expense_date', dateFrom)
                .lte('expense_date', dateTo)
                .eq('status', 'posted')
                .is('deleted_at', null)
                .order('expense_date', { ascending: false })
                .limit(100)
                .abortSignal(signal as any),

            // 9. Overdue Invoices
            supabase.from('invoices').select('id,invoice_number,total_amount,paid_amount,due_date,party_id,parties(name)')
                .eq('company_id', companyId)
                .eq('type', 'sale')
                .in('status', ['posted', 'partially_paid'])
                .lt('due_date', new Date().toISOString().split('T')[0])
                .is('deleted_at', null)
                .order('due_date', { ascending: true })
                .limit(50)
                .abortSignal(signal as any)
        ]);

        const firstError = batch.find((res: any) => res.error)?.error;
        if (firstError) throw firstError;

        const [summaryRes, chartRes, topRes, lowStockRes, categoryRes, trialBalanceRes, recentInvoicesRes, recentExpensesRes, overdueInvoicesRes] = batch;

        return {
            summary: summaryRes.data || {},
            salesChart: chartRes.data || [],
            topData: topRes.data || { top_products: [], top_customers: [] },
            lowStockProducts: (lowStockRes.data || []).map((p: any) => ({
                id: p.id,
                name: p.name_ar,
                quantity: Number(p.total_stock),
                min_quantity: Number(p.min_stock_level)
            })),
            categoryData: (categoryRes.data || []).map((c: any, i: number) => ({
                name: c.name,
                value: Number(c.value),
                color: c.color || ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa'][i % 6]
            })),
            trialBalanceRows: (trialBalanceRes.data as any)?.rows || [],
            recentInvoices: recentInvoicesRes.data || [],
            recentExpenses: recentExpensesRes.data || [],
            overdueInvoices: overdueInvoicesRes.data || []
        };
    }
};