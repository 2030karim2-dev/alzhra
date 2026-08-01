import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
    safeDecimal,
    tryDecimal,
    calculateLineItem,
    calculateInvoiceSummary,
    validateJournalBalance,
    assertJournalBalanced,
    convertCurrency,
    isPositiveDecimal,
    isNonNegativeDecimal,
    isZeroDecimal,
    isValidDecimal,
    CURRENCY_PRECISION,
    SOX_BALANCE_TOLERANCE,
} from './decimalUtils';

describe('decimalUtils', () => {
    describe('safeDecimal', () => {
        it('should return zero for null/undefined', () => {
            expect(safeDecimal(null).toString()).toBe('0');
            expect(safeDecimal(undefined).toString()).toBe('0');
        });

        it('should handle numbers correctly', () => {
            expect(safeDecimal(10).toString()).toBe('10');
            expect(safeDecimal(10.5).toString()).toBe('10.5');
        });

        it('should handle strings correctly', () => {
            expect(safeDecimal('100.25').toString()).toBe('100.25');
        });

        it('should handle invalid strings', () => {
            expect(safeDecimal('abc').toString()).toBe('0');
            expect(safeDecimal('NaN').toString()).toBe('0');
            expect(safeDecimal('Infinity').toString()).toBe('0');
        });

        it('should handle Decimal instances', () => {
            const d = new Decimal('42');
            expect(safeDecimal(d).equals(d)).toBe(true);
        });

        it('should handle non-finite numbers', () => {
            expect(safeDecimal(Infinity).toString()).toBe('0');
            expect(safeDecimal(NaN).toString()).toBe('0');
        });
    });

    describe('tryDecimal', () => {
        it('should return null for invalid values', () => {
            expect(tryDecimal(null)).toBeNull();
            expect(tryDecimal(undefined)).toBeNull();
            expect(tryDecimal('abc')).toBeNull();
            expect(tryDecimal(NaN)).toBeNull();
        });

        it('should return Decimal for valid values', () => {
            expect(tryDecimal('5')?.toString()).toBe('5');
            expect(tryDecimal(7)?.toString()).toBe('7');
        });
    });

    describe('calculateLineItem', () => {
        it('should calculate subtotal, tax, and total correctly', () => {
            const result = calculateLineItem({ quantity: 2, price: 100, discount: 10, taxRate: 15 });

            expect(result.subtotal.toString()).toBe('200');
            expect(result.discountAmount.toString()).toBe('10');
            expect(result.taxableAmount.toString()).toBe('190');
            expect(result.taxAmount.toString()).toBe('28.5');
            expect(result.total.toString()).toBe('218.5');
        });

        it('should handle zero values', () => {
            const result = calculateLineItem({ quantity: 0, price: 0 });
            expect(result.total.toString()).toBe('0');
        });
    });

    describe('calculateInvoiceSummary', () => {
        it('should calculate summary totals correctly', () => {
            const result = calculateInvoiceSummary({
                items: [
                    { quantity: 1, price: 100, taxRate: 0 },
                    { quantity: 2, price: 50, taxRate: 0 },
                ],
            });

            expect(result.subtotal.toString()).toBe('200');
            expect(result.itemCount).toBe(2);
        });

        it('should handle global discount', () => {
            const result = calculateInvoiceSummary({
                items: [{ quantity: 1, price: 100, taxRate: 0 }],
                globalDiscount: 10,
            });

            expect(result.totalDiscount.toString()).toBe('10');
        });
    });

    describe('validateJournalBalance', () => {
        it('should return balanced when debits equal credits', () => {
            const result = validateJournalBalance([
                { debit: 100, credit: 0 },
                { debit: 0, credit: 100 },
            ]);

            expect(result.isBalanced).toBe(true);
            expect(result.debitTotal.toString()).toBe('100');
            expect(result.creditTotal.toString()).toBe('100');
            expect(result.imbalance.toString()).toBe('0');
        });

        it('should return unbalanced when debits differ from credits', () => {
            const result = validateJournalBalance([
                { debit: 100, credit: 0 },
                { debit: 0, credit: 50 },
            ]);

            expect(result.isBalanced).toBe(false);
            expect(result.imbalance.toString()).toBe('50');
        });
    });

    describe('assertJournalBalanced', () => {
        it('should not throw for balanced journal', () => {
            expect(() =>
                assertJournalBalanced([
                    { debit: 100, credit: 0 },
                    { debit: 0, credit: 100 },
                ])
            ).not.toThrow();
        });

        it('should throw for unbalanced journal', () => {
            expect(() =>
                assertJournalBalanced([
                    { debit: 100, credit: 0 },
                    { debit: 0, credit: 90 },
                ])
            ).toThrow('Journal entry imbalance');
        });
    });

    describe('convertCurrency', () => {
        it('should convert amount with rate', () => {
            const result = convertCurrency({ amount: 100, exchangeRate: 3.75, fromCurrency: 'USD', toCurrency: 'SAR' });
            expect(result.convertedAmount.toString()).toBe('375');
        });

        it('should use rate of 1 when rate is zero', () => {
            const result = convertCurrency({ amount: 100, exchangeRate: 0, fromCurrency: 'USD', toCurrency: 'SAR' });
            expect(result.convertedAmount.toString()).toBe('100');
        });
    });

    describe('validation helpers', () => {
        it('isPositiveDecimal', () => {
            expect(isPositiveDecimal(10)).toBe(true);
            expect(isPositiveDecimal(-10)).toBe(false);
            expect(isPositiveDecimal(0)).toBe(false);
        });

        it('isNonNegativeDecimal', () => {
            expect(isNonNegativeDecimal(0)).toBe(true);
            expect(isNonNegativeDecimal(-1)).toBe(false);
            expect(isNonNegativeDecimal(5)).toBe(true);
        });

        it('isZeroDecimal', () => {
            expect(isZeroDecimal(0)).toBe(true);
            expect(isZeroDecimal(1)).toBe(false);
        });

        it('isValidDecimal', () => {
            expect(isValidDecimal('10')).toBe(true);
            expect(isValidDecimal('abc')).toBe(false);
            expect(isValidDecimal(null)).toBe(false);
        });
    });

    describe('constants', () => {
        it('should have correct precision constants', () => {
            expect(CURRENCY_PRECISION).toBe(2);
            expect(SOX_BALANCE_TOLERANCE.toString()).toBe('0.000001');
        });
    });
});