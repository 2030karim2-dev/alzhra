import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../auth/store';
import { dashboardApi } from '../api/index';
import { calculateDashboardStats } from '../services/dashboardStats';
import { calculateDashboardInsights } from '../services/dashboardInsights';
import { useMemo } from 'react';
import { toBaseCurrency, formatCurrency } from '../../../core/utils/currencyUtils';
import type { DashboardDataPayload } from '../models';
import { useBranchFilter } from '../../branches/hooks/useBranchFilter';

// Re-export specific hooks from the old structure for backwards compatibility
export {
  useSalesChart,
  useInventoryChart,
  useRecentActivity,
  useTopProducts,
  useTopCustomers,
  useDashboardAlerts
} from './useDashboard';

export const useDashboardData = () => {
  const { user } = useAuthStore();
  const companyId = user?.company_id;
  const { branchId } = useBranchFilter();

  // 1. Fetch Raw Data using React Query
  const rawDataQuery = useQuery({
    queryKey: ['dashboard_raw_data', companyId, branchId],
    queryFn: async ({ signal }) => {
      try {
        if (!companyId) return Promise.reject('No company ID');
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateLimit = thirtyDaysAgo.toISOString().split('T')[0];
        return await dashboardApi.fetchRawDashboardData(companyId, dateLimit, signal, branchId);
      } catch (error: any) {
        // Gracefully handle aborted requests to avoid console error spam
        if (error.name === 'AbortError' || error.message?.includes('aborted') || signal.aborted) {
          console.debug('Dashboard data fetch aborted');
          return null;
        }
        throw error;
      }
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // Data stays fresh for 5 minutes
  });

  // 2. Compute Base Metrics using useMemo
  const processedData = useMemo<DashboardDataPayload | null>(() => {
    if (!rawDataQuery.data) return null;

    const { summary, salesChart, topData, productsWithStock, expensesRaw, trialBalanceRows } = rawDataQuery.data;

    // Process Trial Balance for accurate Net Profit/Loss
    const revenues = trialBalanceRows.filter((a: any) => (a.code || a.account_code || '').startsWith('4'));
    const expensesAcc = trialBalanceRows.filter((a: any) => (a.code || a.account_code || '').startsWith('5'));

    const totalRevenues = revenues.reduce((s: number, a: any) => s + Math.abs(a.netBalance ?? a.balance ?? 0), 0);
    const totalExpensesAcc = expensesAcc.reduce((s: number, a: any) => s + Math.abs(a.netBalance ?? a.balance ?? 0), 0);

    const netProfit = totalRevenues - totalExpensesAcc;
    const netCashPosition = (summary.receipt_bonds || 0) - (summary.payment_bonds || 0);

    const lowStockProducts = productsWithStock.filter((p: any) => {
      const totalStock = (p.product_stock || []).reduce((sum: number, s: any) => sum + Number(s.quantity || 0), 0);
      return totalStock <= (p.min_stock_level || 5);
    }).map((p: any) => ({
      ...p,
      name: p.name_ar,
      quantity: (p.product_stock || []).reduce((sum: number, s: any) => sum + Number(s.quantity || 0), 0),
      min_quantity: p.min_stock_level || 5
    }));

    const expenseByCategory: Record<string, number> = {};
    (expensesRaw || []).forEach((exp: any) => {
        const categoryName = exp.expense_categories?.name || 'غير مصنف';
        expenseByCategory[categoryName] = (expenseByCategory[categoryName] || 0) + Number(exp.amount || 0);
    });

    const categoryData = Object.entries(expenseByCategory)
        .map(([name, value], index) => ({
            name,
            value,
            color: ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa'][index % 6]
        }))
        .slice(0, 6);

    // Call external service transformers for insights
    const insightsResult = calculateDashboardInsights({
      totalSales: summary.total_sales || 0,
      totalPurchases: summary.total_purchases || 0,
      totalExpenses: summary.total_expenses || 0,
      invoicesData: [], // We skip raw analytics
      expensesData: [], 
    });

    // Assemble final payload directly from RPC data
    return {
      stats: {
        sales: formatCurrency(summary.total_sales || 0),
        purchases: formatCurrency(summary.total_purchases || 0),
        expenses: formatCurrency(summary.total_expenses || 0),
        debts: formatCurrency((summary.total_debts || 0) + (summary.total_supplier_debts || 0)),
        invoices: '0', // Or query count if needed
        profit: formatCurrency(netProfit),
        netCash: formatCurrency(netCashPosition),
        salesTrend: Math.round(insightsResult.salesTrend * 10) / 10,
        purchasesTrend: Math.round(insightsResult.purchasesTrend * 10) / 10,
        expensesTrend: Math.round(insightsResult.expensesTrend * 10) / 10,
        profitTrend: 0
      },
      salesData: salesChart.length ? salesChart : [{ name: 'اليوم', value: 0 }],
      categoryData: categoryData.length ? categoryData : [{ name: 'لا توجد بيانات', value: 0, color: '#94a3b8' }],
      recentActivities: [], // Optimize by fetching recent activities on demand or removing
      customers: topData.top_customers || [],
      topProducts: topData.top_products || [],
      topCustomers: topData.top_customers || [],
      targets: insightsResult.targets,
      cashFlow: {
        inflow: summary.receipt_bonds || 0,
        outflow: summary.payment_bonds || 0,
        net: netCashPosition
      },
      alerts: insightsResult.alerts as any,
      insights: insightsResult.insights as any,
      lowStockProducts: lowStockProducts as any
    };

  }, [rawDataQuery.data]);

  // Provide fallback empty data if still loading or errored
  const fallbackData: DashboardDataPayload = {
    stats: { sales: '0', purchases: '0', expenses: '0', debts: '0', invoices: '0', profit: '0', netCash: '0', salesTrend: 0, purchasesTrend: 0, expensesTrend: 0, profitTrend: 0 },
    salesData: [], categoryData: [], recentActivities: [], customers: [], topProducts: [], topCustomers: [],
    targets: { salesProgress: 0, collectionRate: 0 }, cashFlow: { inflow: 0, outflow: 0, net: 0 },
    alerts: [], insights: [], lowStockProducts: []
  };

  return {
    ...rawDataQuery,
    data: processedData, // Replace raw data with processed data in return
    ... (processedData || fallbackData) // Spread attributes for ease of access
  };
};

export const useDashboardStats = () => {
  const { stats, isLoading, error } = useDashboardData();
  return { stats, isLoading, error };
};
export default useDashboardData;
