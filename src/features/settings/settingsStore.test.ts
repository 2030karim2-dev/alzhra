import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settingsStore';
import { DEFAULT_INVOICE_SETTINGS } from './types/index';

describe('SettingsStore', () => {
    beforeEach(() => {
        useSettingsStore.getState().resetAllSettings();
    });

    it('should have default settings initialized', () => {
        const state = useSettingsStore.getState();
        expect(state.invoice).toBeDefined();
        expect(state.inventory).toBeDefined();
        expect(state.payment).toBeDefined();
        expect(state.pos).toBeDefined();
        expect(state.print).toBeDefined();
        expect(state.integration).toBeDefined();
        expect(state.localization).toBeDefined();
    });

    it('should update invoice settings', () => {
        useSettingsStore.getState().setInvoiceSettings({ invoice_prefix: 'INV2-' });
        const state = useSettingsStore.getState();
        expect(state.invoice.invoice_prefix).toBe('INV2-');
    });

    it('should update inventory settings', () => {
        useSettingsStore.getState().setInventorySettings({ low_stock_threshold: 5 });
        const state = useSettingsStore.getState();
        expect(state.inventory.low_stock_threshold).toBe(5);
    });

    it('should add a bank account', () => {
        const account = {
            id: 'acc-1',
            bank_name: 'Test Bank',
            account_name: 'Test Account',
            account_number: '123456',
            iban: 'YE123456789',
            is_default: false,
        };
        useSettingsStore.getState().addBankAccount(account);

        const state = useSettingsStore.getState();
        expect(state.payment.bank_accounts).toHaveLength(1);
        expect(state.payment.bank_accounts[0].bank_name).toBe('Test Bank');
    });

    it('should update a bank account', () => {
        const account = {
            id: 'acc-1',
            bank_name: 'Test Bank',
            account_name: 'Test Account',
            account_number: '123456',
            iban: 'YE123456789',
            is_default: false,
        };
        useSettingsStore.getState().addBankAccount(account);
        useSettingsStore.getState().updateBankAccount('acc-1', { bank_name: 'Updated Bank' });

        const state = useSettingsStore.getState();
        expect(state.payment.bank_accounts[0].bank_name).toBe('Updated Bank');
    });

    it('should delete a bank account', () => {
        const account = {
            id: 'acc-1',
            bank_name: 'Test Bank',
            account_name: 'Test Account',
            account_number: '123456',
            iban: 'YE123456789',
            is_default: false,
        };
        useSettingsStore.getState().addBankAccount(account);
        useSettingsStore.getState().deleteBankAccount('acc-1');

        const state = useSettingsStore.getState();
        expect(state.payment.bank_accounts).toHaveLength(0);
    });

    it('should set default bank account', () => {
        const acc1 = { id: 'acc-1', bank_name: 'Bank 1', account_name: 'A1', account_number: '1', iban: 'YE1', is_default: false };
        const acc2 = { id: 'acc-2', bank_name: 'Bank 2', account_name: 'A2', account_number: '2', iban: 'YE2', is_default: false };
        useSettingsStore.getState().addBankAccount(acc1);
        useSettingsStore.getState().addBankAccount(acc2);

        useSettingsStore.getState().setDefaultBankAccount('acc-2');

        const state = useSettingsStore.getState();
        expect(state.payment.bank_accounts.find(b => b.id === 'acc-2')?.is_default).toBe(true);
        expect(state.payment.bank_accounts.find(b => b.id === 'acc-1')?.is_default).toBe(false);
    });

    it('should reset all settings to defaults', () => {
        useSettingsStore.getState().setInvoiceSettings({ invoice_prefix: 'CUSTOM-' });
        useSettingsStore.getState().resetAllSettings();

        const state = useSettingsStore.getState();
        expect(state.invoice.invoice_prefix).toBe(DEFAULT_INVOICE_SETTINGS.invoice_prefix);
    });

    it('should reset a specific section', () => {
        useSettingsStore.getState().setInvoiceSettings({ invoice_prefix: 'CUSTOM-' });
        useSettingsStore.getState().resetSection('invoice');

        const state = useSettingsStore.getState();
        expect(state.invoice.invoice_prefix).toBe(DEFAULT_INVOICE_SETTINGS.invoice_prefix);
        expect(state.inventory).toBeDefined();
    });
});