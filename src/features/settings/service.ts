import { settingsApi } from './api';
import { CompanyFormData, WarehouseFormData, FiscalYearFormData, ExchangeRateFormData, AutoBackupConfig, BranchFormData } from './types.ts';
import { supabase } from '../../lib/supabaseClient';
import { logger } from '../../core/utils/logger';

export const settingsService = {
    fetchCompany: async (companyId: string) => {
        const { data, error } = await settingsApi.getCompany(companyId);
        if (error) throw error;
        return data;
    },

    updateCompanyProfile: async (companyId: string, data: CompanyFormData) => {
        const { error } = await settingsApi.updateCompany(companyId, data);
        if (error) throw error;
    },

    fetchBranches: async (companyId: string) => {
        const { data, error } = await settingsApi.getBranches(companyId);
        if (error) throw error;
        return data || [];
    },

    addBranch: async (companyId: string, data: BranchFormData) => {
        const { data: branch, error } = await settingsApi.createBranch(companyId, data);
        if (error) throw error;
        return branch;
    },

    updateBranch: async (id: string, data: BranchFormData) => {
        const { data: branch, error } = await settingsApi.updateBranch(id, data);
        if (error) throw error;
        return branch;
    },

    removeBranch: async (id: string) => {
        const { error } = await settingsApi.deleteBranch(id);
        if (error) throw error;
    },

    fetchWarehouses: async (companyId: string) => {
        const { data, error } = await settingsApi.getWarehouses(companyId);
        if (error) throw error;
        return data || [];
    },

    addWarehouse: async (companyId: string, data: WarehouseFormData) => {
        const { data: wh, error } = await settingsApi.createWarehouse(companyId, data);
        if (error) throw error;
        return wh;
    },

    removeWarehouse: async (id: string) => {
        const { error } = await settingsApi.deleteWarehouse(id);
        if (error) throw error;
    },

    updatePrimaryStatus: async (companyId: string, warehouseId: string) => {
        const { error } = await settingsApi.setPrimaryWarehouse(companyId, warehouseId);
        if (error) throw error;
    },

    fetchFiscalYears: async (companyId: string) => {
        const { data, error } = await settingsApi.getFiscalYears(companyId);
        if (error) throw error;
        return data || [];
    },

    addFiscalYear: async (companyId: string, data: FiscalYearFormData) => {
        const { data: fy, error } = await settingsApi.createFiscalYear(companyId, data);
        if (error) throw error;
        return fy;
    },

    closeFiscalYear: async (id: string) => {
        const { error } = await settingsApi.closeFiscalYear(id);
        if (error) throw error;
    },

    fetchCurrencies: async () => {
        const { data, error } = await settingsApi.getSupportedCurrencies();
        if (error) throw error;
        return data || [];
    },

    fetchExchangeRates: async (companyId: string) => {
        const { data, error } = await settingsApi.getExchangeRates(companyId);
        if (error) throw error;
        return data || [];
    },

    setExchangeRate: async (companyId: string, data: ExchangeRateFormData, userId: string) => {
        const { error } = await settingsApi.updateExchangeRate(companyId, data, userId);
        if (error) throw error;
    },

    // Backup Config - Supabase primary, localStorage fallback
    getAutoBackupConfig: async (companyId?: string): Promise<AutoBackupConfig> => {
        if (companyId) {
            try {
                const { data } = await supabase.from('backup_configs').select('*').eq('company_id', companyId).single();
                if (data) return { enabled: data.auto_backup_enabled, frequency: data.backup_frequency_hours <= 24 ? 'daily' : 'weekly', retentionDays: 30, includeImages: false, lastBackupStatus: data.last_backup_at ? 'success' : 'idle' };
            } catch {}
        }
        const stored = localStorage.getItem('alz_auto_backup');
        return stored ? JSON.parse(stored) : { enabled: true, frequency: 'daily', retentionDays: 30, includeImages: false, lastBackupStatus: 'idle' };
    },

    saveAutoBackupConfig: async (config: AutoBackupConfig, companyId?: string) => {
        localStorage.setItem('alz_auto_backup', JSON.stringify(config));
        if (companyId) {
            try {
                await supabase.from('backup_configs').upsert({
                    company_id: companyId,
                    auto_backup_enabled: config.enabled,
                    backup_frequency_hours: config.frequency === 'daily' ? 24 : 168,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'company_id' });
            } catch {}
        }
    },

    getStorageStats: async (companyId?: string) => {
        try {
            const { count: products } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('company_id', companyId);
            const { count: invoices } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('company_id', companyId);
            const { count: parties } = await supabase.from('parties').select('*', { count: 'exact', head: true }).eq('company_id', companyId);
            const totalRecords = (products || 0) + (invoices || 0) + (parties || 0);
            return { totalRecords, details: { products, invoices, parties }, lastSync: new Date().toISOString(), spaceUsed: `${(totalRecords / 1000).toFixed(1)}K records`, spaceLimit: 'Unlimited' };
        } catch {
            return { totalRecords: 0, details: {}, lastSync: new Date().toISOString(), spaceUsed: 'DB Managed', spaceLimit: 'Unlimited' };
        }
    },

    getBackupLogs: async (companyId?: string): Promise<{ id: string; action: string; size: string; time: string; status: string; icon: string }[]> => {
        if (companyId) {
            try {
                const { data } = await supabase.from('backup_logs').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(20);
                if (data) return data.map((log: any) => ({
                    id: log.id, action: log.backup_type === 'google_drive' ? 'نسخ سحابي' : 'نسخ محلي',
                    size: log.file_size_bytes ? `${(log.file_size_bytes / 1024).toFixed(1)} KB` : '--',
                    time: new Date(log.created_at).toLocaleString('ar-SA'),
                    status: log.status === 'success' ? 'Success' : 'Error',
                    icon: log.backup_type === 'google_drive' ? 'cloud' : 'file'
                }));
            } catch {}
        }
        const logs = localStorage.getItem('alz_backup_logs');
        return logs ? JSON.parse(logs) : [];
    },

    addBackupLog: async (action: string, size: string, status: 'Success' | 'Error', companyId?: string, userId?: string) => {
        const logs = await settingsService.getBackupLogs(companyId);
        const newLog = {
            id: Date.now().toString(),
            action,
            size,
            time: new Date().toLocaleString('en-GB'),
            status,
            icon: action.includes('Google') ? 'CloudSync' : 'HardDrive'
        };
        localStorage.setItem('alz_backup_logs', JSON.stringify([newLog, ...logs].slice(0, 10)));

        // Also save to Supabase
        if (companyId) {
            try {
                await supabase.from('backup_logs').insert({
                    company_id: companyId,
                    user_id: userId,
                    backup_type: action.includes('Google') ? 'google_drive' : 'manual',
                    file_name: action,
                    file_size_bytes: size !== '--' ? parseFloat(size) * 1024 : null,
                    status: status === 'Success' ? 'success' : 'failed',
                });
            } catch {}
        }
    },

    exportSystemData: async () => {
        const tables = [
            'companies', 'branches', 'warehouses', 'products', 'product_categories',
            'product_stock', 'product_cross_references', 'product_supplier_prices', 'product_kit_items',
            'inventory_transactions', 'stock_transfers', 'stock_transfer_items',
            'parties', 'party_categories',
            'invoices', 'invoice_items',
            'accounts', 'journal_entries', 'journal_entry_lines',
            'fiscal_years', 'supported_currencies', 'exchange_rates',
            'expenses', 'expense_categories'
        ];

        const exportData: Record<string, unknown> = {
            version: '2.0',
            exportedAt: new Date().toISOString(),
            data: {} as Record<string, unknown>
        };

        for (const table of tables) {
            try {
                const tableName = table as keyof import('../../core/database.types').Database['public']['Tables'];
                const { data, error } = await supabase.from(tableName).select('*');
                if (!error && data) {
                    (exportData.data as Record<string, unknown>)[table] = data;
                }
            } catch (err) {
                logger.warn('Settings', `Failed to export table ${table}`, err);
            }
        }

        settingsService.addBackupLog('Export Full Data Archive', `${(JSON.stringify(exportData).length / 1024 / 1024).toFixed(2)} MB`, 'Success');
        return exportData;
    },

    importSystemData: async (file: File) => {
        try {
            const text = await file.text();
            const json = JSON.parse(text);

            if (!json.data || !json.version) {
                throw new Error("ملف غير صالح أو تالف");
            }

            // Tables in order of dependencies (roughly)
            const tables = [
                'companies', 'branches', 'warehouses', 'product_categories', 'products',
                'product_stock', 'product_cross_references', 'product_supplier_prices', 'product_kit_items',
                'inventory_transactions', 'stock_transfers', 'stock_transfer_items',
                'party_categories', 'parties',
                'fiscal_years', 'supported_currencies', 'exchange_rates',
                'invoices', 'invoice_items',
                'accounts', 'journal_entries', 'journal_entry_lines',
                'expense_categories', 'expenses'
            ];

            // Warning: This implementation assumes the user wants to upsert/replace.
            // In a production app, we would handle this with extreme care or via a Postgres function.
            for (const table of tables) {
                const tableData = json.data[table];
                if (tableData && Array.isArray(tableData) && tableData.length > 0) {
                    const tableName = table as keyof import('../../core/database.types').Database['public']['Tables'];
                    const { error } = await (supabase.from(tableName) as unknown as { upsert: (data: unknown[], opts: { onConflict: string }) => Promise<{ error: unknown }> }).upsert(tableData, { onConflict: 'id' });
                    if (error) logger.error('Settings', `Error importing ${table}`, error);
                }
            }

            settingsService.addBackupLog('System Data Restore', `${(file.size / 1024).toFixed(1)} KB`, 'Success');
            return true;
        } catch (err) {
            settingsService.addBackupLog('System Data Restore', '0 KB', 'Error');
            throw err;
        }
    },

    /**
     * تحديث أسعار الصرف من السوق عبر Edge Function
     */
    refreshMarketRates: async (companyId?: string) => {
        try {
            return await settingsApi.fetchMarketRates(companyId);
        } catch (error) {
            logger.error('Settings', 'Failed to refresh market rates', error);
            throw error;
        }
    }
};
