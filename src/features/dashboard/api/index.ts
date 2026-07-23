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

            // 4. Products with stock levels (for low stock alerts)
            supabase.from('products').select('id, name_ar, min_stock_level, product_stock(quantity, warehouse_id)').eq('company_id', companyId).eq('status', 'active').limit(1000).abortSignal(signal as any) as any,
            
            // 5. Expense Categories (for category breakdown)
            supabase.from('expenses').select('amount, expense_categories(name)').eq('company_id', companyId).neq('status', 'void').gte('expense_date', dateFrom).lte('expense_date', dateTo).abortSignal(signal as any) as any,

            // 6. Trial Balance for accurate Net Profit based on Accounting Trees
            supabase.rpc('report_trial_balance', { p_company_id: companyId, p_from: '2000-01-01', p_to: dateTo, p_branch_id: branchId || null } as any).abortSignal(signal as any)
        ]);

        const firstError = batch.find((res: any) => res.error)?.error;
        if (firstError) throw firstError;

        const [summaryRes, chartRes, topRes, productsRes, expensesRes, trialBalanceRes] = batch;

        return {
            summary: summaryRes.data || {},
            salesChart: chartRes.data || [],
            topData: topRes.data || { top_products: [], top_customers: [] },
            productsWithStock: productsRes.data || [],
            expensesRaw: expensesRes.data || [],
            trialBalanceRows: (trialBalanceRes.data as any)?.rows || []
        };
    }
};

