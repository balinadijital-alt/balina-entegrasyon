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
import { ProductImportPage } from './pages/Imports/ProductImportPage.jsx';
import { HepsiburadaPage } from './pages/Marketplaces/HepsiburadaPage.jsx';
import { MarketplacesPage } from './pages/Marketplaces/MarketplacesPage.jsx';
import { TrendyolPage } from './pages/Marketplaces/TrendyolPage.jsx';
import { OrdersPage } from './pages/Orders/OrdersPage.jsx';
import { PaymentsPage } from './pages/Payments/PaymentsPage.jsx';
import { ProductCreatePage } from './pages/Products/ProductCreatePage.jsx';
import { ProductsPage } from './pages/Products/ProductsPage.jsx';
import { QueuePage } from './pages/Queue/QueuePage.jsx';
import { ReportsPage } from './pages/Reports/ReportsPage.jsx';
import { RolesPage } from './pages/Roles/RolesPage.jsx';
import { ShippingPage } from './pages/Shipping/ShippingPage.jsx';
import { SaasPage } from './pages/Saas/SaasPage.jsx';
import { SettingsPage } from './pages/Settings/SettingsPage.jsx';
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
            <Route path="reports" element={<ReportsPage />} />
            <Route path="companies" element={<CompaniesPage />} />
            <Route path="accounting" element={<AccountingPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="products/new" element={<ProductCreatePage />} />
            <Route path="imports" element={<ImportCenterPage />} />
            <Route path="products/import" element={<ProductImportPage />} />
            <Route path="marketplaces" element={<MarketplacesPage />} />
            <Route path="marketplaces/trendyol" element={<TrendyolPage />} />
            <Route path="marketplaces/hepsiburada" element={<HepsiburadaPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="shipping" element={<ShippingPage />} />
            <Route path="saas" element={<SaasPage />} />
            <Route path="settings" element={<SettingsPage />} />
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
