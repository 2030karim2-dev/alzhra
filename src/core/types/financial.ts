/**
 * @fileoverview Unified financial types for accounting transactions
 * Used by PostTransactionUsecase and related accounting services
 */

export interface PostTransactionLineInput {
    account_id: string;
    debit_amount?: number | null;
    credit_amount?: number | null;
    description?: string | null;
}

export interface PostTransactionInput {
    date: string;
    description: string;
    reference?: string | undefined;
    reference_type?: string | undefined;
    lines: PostTransactionLineInput[];
}

export interface PostTransactionResult {
    journalId: string;
}

export interface TreasuryAccount {
    id: string;
    company_id: string;
    code: string;
    name: string;
    type: string;
    balance: number;
    currency_code: string;
    is_system: boolean;
    parent_id?: string | null;
}