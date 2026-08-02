
import { AppError } from '../types/common';

export { AppError };

/**
 * محرك معالجة الأخطاء الذكي لنظام الزهراء
 */
export const parseError = (error: any): AppError => {
  if (error === null || error === undefined) {
    return new AppError('حدث خطأ غير متوقع', 'UNKNOWN', 500);
  }

  if (typeof error === 'string') {
    return new AppError(error, 'UNKNOWN', 500);
  }

  const errorObj = error instanceof Error ? error : error;
  
  // Supabase Auth errors use `.name` and `.__isAuthError` instead of `.code`
  const isAuthError = errorObj?.__isAuthError === true || errorObj?.name === 'AuthApiError' || errorObj?.name === 'AuthSessionMissingError';
  const code = errorObj?.code || (isAuthError ? errorObj?.name : 'UNKNOWN');
  const status = errorObj?.status || errorObj?.statusCode || 500;
  const rawMessage = errorObj?.message || String(errorObj);
  const lowerMsg = rawMessage.toLowerCase();

  // Network Errors - Catch generic fetch failures
  if (
    lowerMsg.includes('failed to fetch') || 
    lowerMsg.includes('networkerror') || 
    lowerMsg.includes('load failed') ||
    lowerMsg.includes('network request failed') ||
    lowerMsg.includes('connection refused')
  ) {
    return new AppError(
      'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.',
      'NETWORK_ERROR',
      0,
      undefined,
      'high',
      'تحديث'
    );
  }

  // خوارزمية تحديد الرسالة بناءً على الكود
  switch (code) {
    case '23505': // Unique violation
      return new AppError(
        'هذا السجل (رقم SKU أو الاسم) موجود مسبقاً في النظام.',
        code,
        409,
        undefined,
        'medium',
        'تغيير القيمة'
      );
    case 'PGRST116':
      return new AppError(
        'الجداول المطلوبة غير موجودة في قاعدة البيانات.',
        code,
        500,
        undefined,
        'critical',
        'تحديث الهيكل'
      );
    case '42501':
      return new AppError(
        'عذراً، لا تمتلك الصلاحيات الكافية لتنفيذ هذه العملية.',
        code,
        403,
        undefined,
        'high',
        'طلب إذن'
      );
    case 'invalid_credentials':
      return new AppError(
        'بيانات الدخول غير صحيحة. يرجى التأكد من البريد وكلمة المرور.',
        code,
        401,
        undefined,
        'medium'
      );
    case 'AuthApiError': {
      // Generic Supabase auth error without a specific machine-readable code.
      // Only show "invalid credentials" when the underlying message actually
      // indicates bad credentials; otherwise show a generic auth error so we
      // don't mislead users whose credentials are correct.
      if (
        lowerMsg.includes('invalid login credentials') ||
        lowerMsg.includes('invalid_credentials') ||
        lowerMsg.includes('invalid email or password')
      ) {
        return new AppError(
          'بيانات الدخول غير صحيحة. يرجى التأكد من البريد وكلمة المرور.',
          'invalid_credentials',
          401,
          undefined,
          'medium'
        );
      }
      return new AppError(
        `حدث خطأ في المصادقة${rawMessage ? ` (${rawMessage})` : ''}. يرجى المحاولة مرة أخرى.`,
        code,
        status,
        undefined,
        'medium'
      );
    }
    case 'AuthSessionMissingError':
      return new AppError(
        'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.',
        code,
        401,
        undefined,
        'medium',
        'تسجيل الدخول'
      );
    case 'email_not_confirmed':
      return new AppError(
        'لم يتم تأكيد البريد الإلكتروني. يرجى التحقق من صندوق الوارد.',
        code,
        403,
        undefined,
        'medium'
      );
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return new AppError(
        'طلبات كثيرة جداً. يرجى الانتظار قليلاً والمحاولة مرة أخرى.',
        code,
        429,
        undefined,
        'medium'
      );
    case 'user_already_exists':
      return new AppError(
        'البريد الإلكتروني مسجل مسبقاً.',
        code,
        409,
        undefined,
        'medium'
      );
    default: {
      const message = `حدث خطأ غير متوقع${rawMessage ? ` (${rawMessage})` : ''}، يرجى المحاولة لاحقاً.`;
      return new AppError(
        message,
        code,
        status,
        undefined,
        'medium'
      );
    }
  }
};
