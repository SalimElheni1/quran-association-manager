import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from '@renderer/App';
import { AuthProvider } from '@renderer/contexts/AuthContext';
import './styles/fontawesome-local.css'; // Local FontAwesome CSS
import 'bootstrap/dist/css/bootstrap.rtl.min.css'; // Import Bootstrap RTL CSS
import '@renderer/styles/index.css';
import { ToastContainer } from 'react-toastify';

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
