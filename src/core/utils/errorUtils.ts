
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
  
  const code = errorObj?.code || 'UNKNOWN';
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
    case 'AuthApiError':
    case 'invalid_credentials':
      return new AppError(
        'بيانات الدخول غير صحيحة. يرجى التأكد من البريد وكلمة المرور.',
        code,
        401,
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
    default:
      return new AppError(
        'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.',
        code,
        500,
        undefined,
        'medium'
      );
  }
};
