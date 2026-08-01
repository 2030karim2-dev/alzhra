import React from 'react';
import { HashRouter } from 'react-router-dom';
import { AppRoutes } from './app/routes';
import FeedbackToast from './ui/base/FeedbackToast';
import { ErrorBoundary } from './core/components/ErrorBoundary';
import CommandPalette from './ui/base/CommandPalette';
import { useSystemInitialization } from './core/hooks/useSystemInitialization';
import { prefetchCriticalRoutes } from './core/utils/routePrefetcher';
import AIChatButton from './ui/common/AIChatButton';
const App: React.FC = () => {
  // Centralized system bootstrapping (Auth, I18n, Sync, Shortcuts)
  useSystemInitialization();

  React.useEffect(() => {
    // ⚡ PERFORMANCE FIX: Delay route prefetching until 30 seconds after idle
    // Old behavior prefetched 4 routes immediately after mount → unnecessary
    // network traffic and slow navigation while the dashboard loads
    const prefetchTimer = setTimeout(() => {
      prefetchCriticalRoutes();
    }, 30000);

    return () => clearTimeout(prefetchTimer);
  }, []);

  return (
    <ErrorBoundary>
      <HashRouter>
        <AppRoutes />
        <FeedbackToast />
        <CommandPalette />
        <AIChatButton />
      </HashRouter>
    </ErrorBoundary>
  );
};

export default App;
