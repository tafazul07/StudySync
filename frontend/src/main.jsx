import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import App from './App.jsx';
import './index.css';

// Intercept all fetch calls to automatically attach the JWT token for /api routes
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  let url = typeof resource === 'string' ? resource : resource?.url;
  
  if (url && (url.startsWith('/api') || url.includes('/api/'))) {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config = config || {};
      config.headers = {
        ...config.headers,
        'Authorization': `Bearer ${token}`
      };
      args[1] = config;
    }
  }
  return originalFetch(...args);
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
