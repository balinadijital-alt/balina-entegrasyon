import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastHost } from './components/ToastHost.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { AppLayout } from './layouts/AppLayout.jsx';
import { LoginPage } from './pages/Auth/LoginPage.jsx';
import { RegisterPage } from './pages/Auth/RegisterPage.jsx';
import { CompaniesPage } from './pages/Companies/CompaniesPage.jsx';
import { AccountingPage } from './pages/Accounting/AccountingPage.jsx';
import { DashboardPage } from './pages/Dashboard/DashboardPage.jsx';
import { ApiLogsPage } from './pages/Logs/ApiLogsPage.jsx';
import { ImportCenterPage } from './pages/Imports/ImportCenterPage.jsx';
import { MarketplacesPage } from './pages/Marketplaces/MarketplacesPage.jsx';
import { OrdersPage } from './pages/Orders/OrdersPage.jsx';
import { PaymentsPage } from './pages/Payments/PaymentsPage.jsx';
import { ProductsPage } from './pages/Products/ProductsPage.jsx';
import { QueuePage } from './pages/Queue/QueuePage.jsx';
import { RolesPage } from './pages/Roles/RolesPage.jsx';
import { ShippingPage } from './pages/Shipping/ShippingPage.jsx';
import './styles/app.css';

function Protected({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" replace />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <Protected>
                <AppLayout />
              </Protected>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="companies" element={<CompaniesPage />} />
            <Route path="accounting" element={<AccountingPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="imports" element={<ImportCenterPage />} />
            <Route path="marketplaces" element={<MarketplacesPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="shipping" element={<ShippingPage />} />
          <Route path="api-logs" element={<ApiLogsPage />} />
          <Route path="queue" element={<QueuePage />} />
          <Route path="roles" element={<RolesPage />} />
          </Route>
        </Routes>
        <ToastHost />
      </BrowserRouter>
    </AppProvider>
  </React.StrictMode>,
);
