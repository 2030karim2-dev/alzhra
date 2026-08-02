
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks';
import PageLoader from '../../../ui/base/PageLoader';
import { ROUTES } from '../../../core/routes/paths';
import { isSupabaseConfigured } from '../../../lib/supabaseClient';

interface AuthGuardProps {
  children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { isAuthenticated, isLoading, isReady } = useAuth();

  if (!isReady || isLoading) {
    return <PageLoader />;
  }

  if (!isSupabaseConfigured) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>خطأ في الاتصال بالخادم</h1>
        <p style={{ color: '#6b7280', maxWidth: 480 }}>إعدادات الاتصال بقاعدة البيانات (Supabase) غير مكتملة. تأكد من ضبط متغيرات البيئة VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY ثم أعد تشغيل التطبيق.</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.AUTH.LOGIN} replace />;
  }

  return <>{children}</>;
};
