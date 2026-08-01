import { describe, it, expect } from 'vitest';
import {
    validateInvoiceItems,
    validateSalePayload,
    validatePurchasePayload,
    assertValid,
} from './validationUtils';

describe('validationUtils', () => {
    describe('validateInvoiceItems', () => {
        it('should return error for empty items', () => {
            const errors = validateInvoiceItems([]);
            expect(errors).toHaveLength(1);
            expect(errors[0].field).toBe('items');
            expect(errors[0].message).toContain('صنف واحد');
        });

        it('should return error for missing productId', () => {
            const errors = validateInvoiceItems([{ quantity: 1, unitPrice: 10 }]);
            expect(errors).toHaveLength(1);
            expect(errors[0].field).toBe('items[0].productId');
        });

        it('should return error for zero or negative quantity', () => {
            const errors = validateInvoiceItems([
                { productId: 'p1', quantity: 0, unitPrice: 10 },
                { productId: 'p2', quantity: -5, unitPrice: 10 },
            ]);
            expect(errors).toHaveLength(2);
        });

        it('should return error for negative price', () => {
            const errors = validateInvoiceItems([
                { productId: 'p1', quantity: 1, unitPrice: -10 },
            ]);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toContain('لا يمكن أن يكون سالباً');
        });

        it('should return no errors for valid items', () => {
            const errors = validateInvoiceItems([
                { productId: 'p1', quantity: 2, unitPrice: 50 },
            ]);
            expect(errors).toHaveLength(0);
        });
    });

    describe('validateSalePayload', () => {
        it('should return error for missing payment method', () => {
            const errors = validateSalePayload({
                items: [{ productId: 'p1', quantity: 1, unitPrice: 10 }],
                paymentMethod: '',
            });
            expect(errors.some(e => e.field === 'paymentMethod')).toBe(true);
        });

        it('should return no errors for valid sale payload', () => {
            const errors = validateSalePayload({
                items: [{ productId: 'p1', quantity: 1, unitPrice: 10 }],
                paymentMethod: 'cash',
            });
            expect(errors).toHaveLength(0);
        });
    });

    describe('validatePurchasePayload', () => {
        it('should return error for missing issue date', () => {
            const errors = validatePurchasePayload({
                items: [{ productId: 'p1', quantity: 1, costPrice: 10 }],
                issueDate: '',
            });
            expect(errors.some(e => e.field === 'issueDate')).toBe(true);
        });

        it('should return no errors for valid purchase payload', () => {
            const errors = validatePurchasePayload({
                items: [{ productId: 'p1', quantity: 1, costPrice: 10 }],
                issueDate: '2026-07-31',
            });
            expect(errors).toHaveLength(0);
        });
    });

    describe('assertValid', () => {
        it('should not throw for empty errors', () => {
            expect(() => assertValid([])).not.toThrow();
        });

        it('should throw for non-empty errors', () => {
            expect(() =>
                assertValid([{ field: 'test', message: 'Test error' }])
            ).toThrow('أخطاء في التحقق من البيانات');
        });
    });
});