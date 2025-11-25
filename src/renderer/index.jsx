import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from '@renderer/App';
import { AuthProvider } from '@renderer/contexts/AuthContext';
import '@renderer/styles/custom-bootstrap.scss'; // Import custom Bootstrap build
import '@renderer/styles/index.css';
import { ToastContainer, toast } from 'react-toastify';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </AuthProvider>

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
