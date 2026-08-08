import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from '@renderer/App';
import { AuthProvider } from '@renderer/contexts/AuthContext';
import '@renderer/styles/custom-bootstrap.scss'; // Import custom Bootstrap build
import '@renderer/styles/index.css';
import { ToastContainer, toast } from 'react-toastify';
import ErrorBoundary from '@renderer/components/common/ErrorBoundary';
import { error as logError } from '@renderer/utils/logger';

// Errors thrown outside of React (event handlers, promises) are otherwise invisible.
window.addEventListener('error', (event) => {
  logError('Uncaught renderer error:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  logError('Unhandled promise rejection in renderer:', event.reason);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </AuthProvider>
    </ErrorBoundary>

    <ToastContainer
      position="top-right"
      autoClose={5000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={true} // Important for our UI
      theme="colored"
    />
  </React.StrictMode>,
);
