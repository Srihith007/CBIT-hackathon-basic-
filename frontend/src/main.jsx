import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link as RouterLink } from 'react-router-dom';
import { LinkProvider, ThemeProvider, ToastProvider } from './ui-kit';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="traceline.theme">
      <ToastProvider>
        <BrowserRouter>
          <LinkProvider component={RouterLink} prop="to">
            <App />
          </LinkProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
