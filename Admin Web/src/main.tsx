import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import UnifiedLogin from './UnifiedLogin';
import ErrorBoundary from './ErrorBoundary';
import './unified-login.css';
import './error-boundary.css';

const AdminApp = lazy(() => import('./AdminEntry'));
const PortalApp = lazy(() => import('./portal/PortalEntry'));

function Loading() {
  return <div className="unified-boot"><img src="/logo.png" alt="X-TRIM FIT GYM" /><span>Opening secure portal…</span></div>;
}

function Root() {
  const path = window.location.pathname;
  if (path === '/admin' || path.startsWith('/admin/')) return <BrowserRouter basename="/admin"><Suspense fallback={<Loading />}><AdminApp /></Suspense></BrowserRouter>;
  if (path === '/portal' || path.startsWith('/portal/')) return <BrowserRouter basename="/portal"><Suspense fallback={<Loading />}><PortalApp /></Suspense></BrowserRouter>;
  return <BrowserRouter><UnifiedLogin /></BrowserRouter>;
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><Root /></ErrorBoundary></StrictMode>);
