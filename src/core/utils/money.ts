/**
 * @fileoverview Unified money utilities for Al-Zahra Smart ERP
 * Combines decimal-safe arithmetic with currency conversion
 * This is the single source of truth for all monetary operations
 */

import Decimal from 'decimal.js';
import { SOX_BALANCE_TOLERANCE, CURRENCY_PRECISION, safeDecimal, NumericInput } from './decimalUtils';

// ============================================
// Currency Type Definitions (Unified)
// ============================================

export type UnifiedCurrencyCode = 'SAR' | 'YER' | 'USD' | 'EUR' | 'OMR' | 'CNY' | 'EGP' | 'AED' | 'KWD' | 'BHD' | 'QAR';

export interface Money {
    readonly amount: number;
    readonly currency: UnifiedCurrencyCode;
    readonly exchangeRate: number;
}

// ============================================
// Money Creation
// ============================================

export const createMoney = (
    amount: NumericInput,
    currency: UnifiedCurrencyCode = 'SAR',
    exchangeRate: number = 1
): Money => {
    const d = safeDecimal(amount);
    return {
        amount: d.toDecimalPlaces(CURRENCY_PRECISION).toNumber(),
        currency,
        exchangeRate: Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1,
    };
};

export const zeroMoney = (currency: UnifiedCurrencyCode = 'SAR'): Money => ({
    amount: 0,
    currency,
    exchangeRate: 1,
});

// ============================================
// Money Arithmetic
// ============================================

const assertSameCurrency = (a: Money, b: Money): void => {
    if (a.currency !== b.currency) {
        throw new Error(`Currency mismatch: cannot perform operation between ${a.currency} and ${b.currency}`);
    }
};

export const addMoney = (a: Money, b: Money): Money => {
    assertSameCurrency(a, b);
    const result = safeDecimal(a.amount).plus(safeDecimal(b.amount));
    return {
        amount: result.toDecimalPlaces(CURRENCY_PRECISION).toNumber(),
        currency: a.currency,
        exchangeRate: a.exchangeRate,
    };
};

export const subtractMoney = (a: Money, b: Money): Money => {
    assertSameCurrency(a, b);
    const result = safeDecimal(a.amount).minus(safeDecimal(b.amount));
    return {
        amount: result.toDecimalPlaces(CURRENCY_PRECISION).toNumber(),
        currency: a.currency,
        exchangeRate: a.exchangeRate,
    };
};

export const multiplyMoney = (money: Money, factor: NumericInput): Money => {
    const f = safeDecimal(factor);
    const result = safeDecimal(money.amount).times(f);
    return {
        amount: result.toDecimalPlaces(CURRENCY_PRECISION).toNumber(),
        currency: money.currency,
        exchangeRate: money.exchangeRate,
    };
};

export const divideMoney = (money: Money, divisor: NumericInput): Money => {
    const d = safeDecimal(divisor);
    if (d.isZero()) {
        throw new Error('Cannot divide money by zero');
    }
    const result = safeDecimal(money.amount).dividedBy(d);
    return {
        amount: result.toDecimalPlaces(CURRENCY_PRECISION).toNumber(),
        currency: money.currency,
        exchangeRate: money.exchangeRate,
    };
};

// ============================================
// Currency Conversion
// ============================================

export interface CurrencyConversionParams {
    amount: NumericInput;
    fromCurrency: UnifiedCurrencyCode;
    toCurrency: UnifiedCurrencyCode;
    exchangeRate: NumericInput;
    exchangeOperator?: 'multiply' | 'divide';
}

export const convertMoney = (params: CurrencyConversionParams): number => {
    const { amount, exchangeRate, exchangeOperator = 'multiply' } = params;

    const rate = safeDecimal(exchangeRate);
    if (rate.isZero() || rate.isNegative()) {
        throw new Error(`Invalid exchange rate: ${exchangeRate}. Must be a positive number.`);
    }

    if (params.fromCurrency === params.toCurrency || rate.equals(1)) {
        return safeDecimal(amount).toDecimalPlaces(CURRENCY_PRECISION).toNumber();
    }

    const amt = safeDecimal(amount);
    if (!amt.isFinite()) {
        throw new Error(`Invalid amount: ${amount}. Must be a finite number.`);
    }

    const converted = exchangeOperator === 'divide'
        ? amt.dividedBy(rate)
        : amt.times(rate);

    return converted.toDecimalPlaces(CURRENCY_PRECISION).toNumber();
};

export const toBaseMoney = (
    entity: {
        amount?: number;
        total_amount?: number;
        currency_code?: string;
        exchange_rate?: number;
        exchange_operator?: string;
    }
): number => {
    const amount = safeDecimal(entity.amount ?? entity.total_amount ?? 0);
    const exchangeRate = safeDecimal(entity.exchange_rate ?? 1);
    const exchangeOperator = (entity.exchange_operator as 'multiply' | 'divide') || 'multiply';

    // If base currency (SAR) or no conversion needed
    if (!entity.currency_code || entity.currency_code === 'SAR') {
        return amount.toDecimalPlaces(CURRENCY_PRECISION).toNumber();
    }

    try {
        return convertMoney({
            amount,
            fromCurrency: (entity.currency_code as UnifiedCurrencyCode) || 'SAR',
            toCurrency: 'SAR',
            exchangeRate,
            exchangeOperator,
        });
    } catch {
        return amount.toDecimalPlaces(CURRENCY_PRECISION).toNumber();
    }
};

export const sumInBase = (
    items: Array<{
        amount?: number;
        total_amount?: number;
        currency_code?: string;
        exchange_rate?: number;
    }>
): number => {
    return items.reduce((sum, item) => sum + toBaseMoney(item), 0);
};

// ============================================
// Formatting
// ============================================

export const CURRENCY_SYMBOLS: Record<string, string> = {
    SAR: 'ر.س',
    YER: 'ر.ي',
    USD: '$',
    OMR: 'ر.ع',
    CNY: '¥',
    EGP: 'ج.م',
    AED: 'د.إ',
    KWD: 'د.ك',
    BHD: 'د.ب',
    QAR: 'ر.ق',
    EUR: '€',
};

export const formatMoney = (
    amount: NumericInput,
    currency: UnifiedCurrencyCode | string = 'SAR',
    options?: {
        minimumFractionDigits?: number;
        maximumFractionDigits?: number;
    }
): string => {
    const { minimumFractionDigits = 2, maximumFractionDigits = 2 } = options || {};
    const d = safeDecimal(amount);

    const formattedNumber = new Intl.NumberFormat('en-US', {
        minimumFractionDigits,
        maximumFractionDigits,
    }).format(d.toDecimalPlaces(CURRENCY_PRECISION).toNumber());

    const symbol = CURRENCY_SYMBOLS[currency] || currency;

    if (currency === 'USD' || currency === 'EUR') {
        return `${symbol}${formattedNumber}`;
    }

    return `${formattedNumber} ${symbol}`;
};

// ============================================
// Balance Validation (SOX)
// ============================================

export const isBalanced = (
    lines: Array<{ debit?: NumericInput; credit?: NumericInput }>
): { isBalanced: boolean; imbalance: Decimal; debitTotal: Decimal; creditTotal: Decimal } => {
    const debitTotal = lines.reduce(
        (sum, line) => sum.plus(safeDecimal(line.debit)),
        new Decimal(0)
    );
    const creditTotal = lines.reduce(
        (sum, line) => sum.plus(safeDecimal(line.credit)),
        new Decimal(0)
    );
    const imbalance = debitTotal.minus(creditTotal).absoluteValue();
    return {
        isBalanced: imbalance.lessThanOrEqualTo(SOX_BALANCE_TOLERANCE),
        imbalance,
        debitTotal: debitTotal.toDecimalPlaces(CURRENCY_PRECISION),
        creditTotal: creditTotal.toDecimalPlaces(CURRENCY_PRECISION),
    };
};

// ============================================
// Unified Export
// ============================================

export const money = {
    create: createMoney,
    zero: zeroMoney,
    add: addMoney,
    subtract: subtractMoney,
    multiply: multiplyMoney,
    divide: divideMoney,
    convert: convertMoney,
    toBase: toBaseMoney,
    sumInBase,
    format: formatMoney,
    isBalanced,
    symbols: CURRENCY_SYMBOLS,
};

// Backward-compatible MoneyUtils for legacy code
export const MoneyUtils = {
    create: createMoney,
    zero: zeroMoney,
    add: addMoney,
    subtract: subtractMoney,
    multiply: multiplyMoney,
};