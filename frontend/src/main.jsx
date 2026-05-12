import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastHost } from './components/ToastHost.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { AppLayout } from './layouts/AppLayout.jsx';
import { adminNavigationGroups, appNavigationGroups } from './navigation.js';
import { LoginPage } from './pages/Auth/LoginPage.jsx';
import { RegisterPage } from './pages/Auth/RegisterPage.jsx';
import { CompaniesPage } from './pages/Companies/CompaniesPage.jsx';
import { AccountingPage } from './pages/Accounting/AccountingPage.jsx';
import { moduleRoutes } from './pages/CommerceModules/ModuleRoutes.jsx';
import { B2BDealersPage } from './pages/CommerceModules/B2BDealersPage.jsx';
import { B2BPricesPage } from './pages/CommerceModules/B2BPricesPage.jsx';
import { B2BTransactionsPage } from './pages/CommerceModules/B2BTransactionsPage.jsx';
import { CatalogCustomFieldsPage } from './pages/CommerceModules/CatalogCustomFieldsPage.jsx';
import { CatalogRelationsPage } from './pages/CommerceModules/CatalogRelationsPage.jsx';
import { CatalogReviewsPage } from './pages/CommerceModules/CatalogReviewsPage.jsx';
import { CmsBannersPage } from './pages/CommerceModules/CmsBannersPage.jsx';
import { CmsBlogPage } from './pages/CommerceModules/CmsBlogPage.jsx';
import { CmsPagesPage } from './pages/CommerceModules/CmsPagesPage.jsx';
import { CmsPopupsPage } from './pages/CommerceModules/CmsPopupsPage.jsx';
import { MarketingAbandonedCartsPage } from './pages/CommerceModules/MarketingAbandonedCartsPage.jsx';
import { MarketingCouponsPage } from './pages/CommerceModules/MarketingCouponsPage.jsx';
import { MarketingFeedsPage } from './pages/CommerceModules/MarketingFeedsPage.jsx';
import { MarketingPixelsPage } from './pages/CommerceModules/MarketingPixelsPage.jsx';
import { SeoHeadTagsPage } from './pages/CommerceModules/SeoHeadTagsPage.jsx';
import { SeoLocalizationPage } from './pages/CommerceModules/SeoLocalizationPage.jsx';
import { SeoRobotsSitemapPage } from './pages/CommerceModules/SeoRobotsSitemapPage.jsx';
import { SeoSettingsPage } from './pages/CommerceModules/SeoSettingsPage.jsx';
import { WorkflowRulesPage } from './pages/CommerceModules/WorkflowRulesPage.jsx';
import { DashboardPage } from './pages/Dashboard/DashboardPage.jsx';
import { CustomerDashboardPage } from './pages/Dashboard/CustomerDashboardPage.jsx';
import { ApiLogsPage } from './pages/Logs/ApiLogsPage.jsx';
import { ImportCenterPage } from './pages/Imports/ImportCenterPage.jsx';
import { ProductImportPage } from './pages/Imports/ProductImportPage.jsx';
import { HepsiburadaPage } from './pages/Marketplaces/HepsiburadaPage.jsx';
import { BatchResultsPage } from './pages/Marketplaces/BatchResultsPage.jsx';
import { MarketplacesPage } from './pages/Marketplaces/MarketplacesPage.jsx';
import { MarketplaceOnboardingPage } from './pages/Marketplaces/MarketplaceOnboardingPage.jsx';
import { TrendyolPage } from './pages/Marketplaces/TrendyolPage.jsx';
import { OrderDetailPage } from './pages/Orders/OrderDetailPage.jsx';
import { OrdersPage } from './pages/Orders/OrdersPage.jsx';
import { OperationsCenterPage } from './pages/Operations/OperationsCenterPage.jsx';
import { PaymentsPage } from './pages/Payments/PaymentsPage.jsx';
import { CategoryMappingPage } from './pages/Products/CategoryMappingPage.jsx';
import { CatalogResourcePage } from './pages/Products/CatalogResourcePage.jsx';
import { ProductCreatePage } from './pages/Products/ProductCreatePage.jsx';
import { ProductDetailPage } from './pages/Products/ProductDetailPage.jsx';
import { ProductPublishWizardPage } from './pages/Products/ProductPublishWizardPage.jsx';
import { PricingRulesCustomerPage } from './pages/Products/PricingRulesCustomerPage.jsx';
import { PublishQueuePage } from './pages/Products/PublishQueuePage.jsx';
import { ProductsPage } from './pages/Products/ProductsPage.jsx';
import { VariantManagementPage } from './pages/Products/VariantManagementPage.jsx';
import { QueuePage } from './pages/Queue/QueuePage.jsx';
import { CustomerReportsPage, ReportsPage } from './pages/Reports/ReportsPage.jsx';
import { DeveloperCenterPage } from './pages/Resources/DeveloperCenterPage.jsx';
import { RolesPage } from './pages/Roles/RolesPage.jsx';
import { ShippingPage } from './pages/Shipping/ShippingPage.jsx';
import { SaasPage } from './pages/Saas/SaasPage.jsx';
import { SettingsPage } from './pages/Settings/SettingsPage.jsx';
import './styles/app.css';

function Protected({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" replace />;
}

function CustomerRoutes() {
  return (
    <>
      <Route index element={<CustomerDashboardPage />} />
      <Route path="reports" element={<CustomerReportsPage />} />
      <Route path="resources" element={<DeveloperCenterPage />} />
      <Route path="companies" element={<CompaniesPage />} />
      <Route path="accounting" element={<AccountingPage />} />
      <Route path="operations" element={<OperationsCenterPage />} />
      <Route path="products" element={<ProductsPage />} />
      <Route path="products/new" element={<ProductCreatePage />} />
      <Route path="products/category-mapping" element={<CategoryMappingPage />} />
      <Route path="products/publish-queue" element={<PublishQueuePage />} />
      <Route path="products/publish" element={<ProductPublishWizardPage />} />
      <Route path="products/:id" element={<ProductDetailPage />} />
      <Route path="products/:id/edit" element={<ProductCreatePage />} />
      <Route path="imports" element={<ImportCenterPage />} />
      <Route path="products/import" element={<ProductImportPage />} />
      <Route path="catalog/categories" element={<CatalogResourcePage type="categories" />} />
      <Route path="catalog/brands" element={<CatalogResourcePage type="brands" />} />
      <Route path="catalog/attributes" element={<CatalogResourcePage type="attributes" />} />
      <Route path="catalog/tags" element={<CatalogResourcePage type="tags" />} />
      <Route path="catalog/suppliers" element={<CatalogResourcePage type="suppliers" />} />
      <Route path="catalog/tax-rates" element={<CatalogResourcePage type="tax-rates" />} />
      <Route path="catalog/units" element={<CatalogResourcePage type="units" />} />
      <Route path="catalog/defaults" element={<CatalogResourcePage type="defaults" />} />
      <Route path="marketplaces" element={<MarketplacesPage />} />
      <Route path="marketplaces/onboarding" element={<MarketplaceOnboardingPage />} />
      <Route path="marketplaces/trendyol" element={<TrendyolPage />} />
      <Route path="marketplaces/hepsiburada" element={<HepsiburadaPage />} />
      <Route path="marketplaces/batch-results" element={<BatchResultsPage />} />
      <Route path="orders" element={<OrdersPage initialStatus="" />} />
      <Route path="orders/new" element={<OrdersPage initialStatus="new" />} />
      <Route path="orders/preparing" element={<OrdersPage initialStatus="preparing" />} />
      <Route path="orders/ready-to-ship" element={<OrdersPage initialStatus="ready_to_ship" />} />
      <Route path="orders/shipped" element={<OrdersPage initialStatus="shipped" />} />
      <Route path="orders/cancel-returned" element={<OrdersPage initialStatus="cancel_returned" />} />
      <Route path="orders/:id" element={<OrderDetailPage />} />
      <Route path="payments" element={<PaymentsPage />} />
      <Route path="shipping" element={<ShippingPage />} />
      <Route path="saas" element={<SaasPage />} />
      <Route path="settings" element={<SettingsPage audience="customer" />} />
      <Route path="api-logs" element={<ApiLogsPage />} />
      <Route path="queue" element={<QueuePage />} />
      <Route path="roles" element={<RolesPage />} />
      <Route path="cms/pages" element={<CmsPagesPage />} />
      <Route path="cms/blog-posts" element={<CmsBlogPage />} />
      <Route path="cms/banners" element={<CmsBannersPage />} />
      <Route path="cms/popups" element={<CmsPopupsPage />} />
      <Route path="marketing/coupons" element={<MarketingCouponsPage />} />
      <Route path="marketing/abandoned-carts" element={<MarketingAbandonedCartsPage />} />
      <Route path="marketing/feeds" element={<MarketingFeedsPage />} />
      <Route path="marketing/pixels" element={<MarketingPixelsPage />} />
      <Route path="catalog/variants" element={<VariantManagementPage />} />
      <Route path="catalog/relations" element={<CatalogRelationsPage />} />
      <Route path="catalog/custom-fields" element={<CatalogCustomFieldsPage />} />
      <Route path="catalog/reviews" element={<CatalogReviewsPage />} />
      <Route path="pricing/profit-rules" element={<PricingRulesCustomerPage />} />
      <Route path="workflow/rules" element={<WorkflowRulesPage />} />
      <Route path="b2b/dealers" element={<B2BDealersPage />} />
      <Route path="b2b/prices" element={<B2BPricesPage />} />
      <Route path="b2b/transactions" element={<B2BTransactionsPage />} />
      <Route path="seo/settings" element={<SeoSettingsPage />} />
      <Route path="seo/sitemap" element={<SeoRobotsSitemapPage />} />
      <Route path="seo/head-tags" element={<SeoHeadTagsPage />} />
      <Route path="seo/languages" element={<SeoLocalizationPage />} />
      {moduleRoutes()}
    </>
  );
}

function AdminRoutes() {
  return (
    <>
      <Route index element={<DashboardPage title="Super Admin Dashboard" />} />
      <Route path="operations" element={<OperationsCenterPage />} />
      <Route path="companies" element={<CompaniesPage />} />
      <Route path="saas" element={<SaasPage />} />
      <Route path="payments" element={<PaymentsPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="queue" element={<QueuePage />} />
      <Route path="api-logs" element={<ApiLogsPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="roles" element={<RolesPage />} />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/admin"
            element={
              <Protected>
                <AppLayout navigationGroups={adminNavigationGroups} panelLabel="Super Admin Paneli" />
              </Protected>
            }
          >
            {AdminRoutes()}
          </Route>
          <Route
            path="/app"
            element={
              <Protected>
                <AppLayout navigationGroups={appNavigationGroups} panelLabel="Musteri Paneli" basePath="/app" />
              </Protected>
            }
          >
            {CustomerRoutes()}
          </Route>
          <Route
            path="/"
            element={
              <Protected>
                <AppLayout navigationGroups={appNavigationGroups} panelLabel="Musteri Paneli" />
              </Protected>
            }
          >
            {CustomerRoutes()}
          </Route>
        </Routes>
        <ToastHost />
      </BrowserRouter>
    </AppProvider>
  </React.StrictMode>,
);
