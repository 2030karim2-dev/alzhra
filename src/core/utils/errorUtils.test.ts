import { describe, it, expect } from 'vitest';
import { parseError, AppError } from '../utils/errorUtils';

describe('errorUtils', () => {
    describe('parseError', () => {
        it('should parse Error with code and return mapped message', () => {
            const error = new Error('Duplicate key') as any;
            error.code = '23505';
            const result = parseError(error);
            expect(result).toBeInstanceOf(AppError);
            expect(result.code).toBe('23505');
            expect(result.severity).toBe('medium');
            expect(result.statusCode).toBe(409);
            expect(result.message).toContain('موجود مسبقاً');
        });

        it('should detect network errors', () => {
            const error = new Error('Failed to fetch');
            const result = parseError(error);
            expect(result).toBeInstanceOf(AppError);
            expect(result.code).toBe('NETWORK_ERROR');
            expect(result.severity).toBe('high');
            expect(result.actionLabel).toBe('تحديث');
        });

        it('should handle PGRST116 error code', () => {
            const error = new Error('Not found') as any;
            error.code = 'PGRST116';
            const result = parseError(error);
            expect(result).toBeInstanceOf(AppError);
            expect(result.code).toBe('PGRST116');
            expect(result.severity).toBe('critical');
        });

        it('should handle auth errors', () => {
            const error = new Error('Invalid login') as any;
            error.code = 'invalid_credentials';
            const result = parseError(error);
            expect(result).toBeInstanceOf(AppError);
            expect(result.code).toBe('invalid_credentials');
            expect(result.message).toContain('بيانات الدخول غير صحيحة');
        });

        it('should return default message for unknown errors', () => {
            const error = new Error('Something weird');
            const result = parseError(error);
            expect(result).toBeInstanceOf(AppError);
            expect(result.code).toBe('UNKNOWN');
            expect(result.message).toBe('حدث خطأ غير متوقع (Something weird)، يرجى المحاولة لاحقاً.');
        });

        it('should handle string errors', () => {
            const result = parseError('String error');
            expect(result).toBeInstanceOf(AppError);
            expect(result.message).toBe('String error');
            expect(result.code).toBe('UNKNOWN');
        });

        it('should handle null/undefined gracefully', () => {
            const result1 = parseError(null);
            expect(result1).toBeInstanceOf(AppError);
            expect(result1.message).toBe('حدث خطأ غير متوقع');
            expect(result1.code).toBe('UNKNOWN');
            const result2 = parseError(undefined);
            expect(result2).toBeInstanceOf(AppError);
            expect(result2.message).toBe('حدث خطأ غير متوقع');
            expect(result2.code).toBe('UNKNOWN');
        });
    });

    describe('AppError shape', () => {
        it('should have expected fields', () => {
            const error = new AppError('Test', 'TEST', 500, undefined, 'low');
            expect(error.message).toBe('Test');
            expect(error.code).toBe('TEST');
            expect(error.severity).toBe('low');
            expect(error).toBeInstanceOf(Error);
            expect(error.name).toBe('AppError');
        });
    });
});
