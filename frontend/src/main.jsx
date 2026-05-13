import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastHost } from './components/ToastHost.jsx';
import { LoadingState } from './components/LoadingState.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { AppLayout } from './layouts/AppLayout.jsx';
import { adminNavigationGroups, appNavigationGroups } from './navigation.js';
import { moduleRoutes } from './pages/CommerceModules/ModuleRoutes.jsx';
import './styles/app.css';

function lazyPage(loader, exportName) {
  return React.lazy(() => loader().then((module) => ({ default: module[exportName] })));
}

const LoginPage = lazyPage(() => import('./pages/Auth/LoginPage.jsx'), 'LoginPage');
const RegisterPage = lazyPage(() => import('./pages/Auth/RegisterPage.jsx'), 'RegisterPage');
const CompaniesPage = lazyPage(() => import('./pages/Companies/CompaniesPage.jsx'), 'CompaniesPage');
const AccountingPage = lazyPage(() => import('./pages/Accounting/AccountingPage.jsx'), 'AccountingPage');
const B2BDealersPage = lazyPage(() => import('./pages/CommerceModules/B2BDealersPage.jsx'), 'B2BDealersPage');
const B2BPricesPage = lazyPage(() => import('./pages/CommerceModules/B2BPricesPage.jsx'), 'B2BPricesPage');
const B2BTransactionsPage = lazyPage(() => import('./pages/CommerceModules/B2BTransactionsPage.jsx'), 'B2BTransactionsPage');
const CatalogCustomFieldsPage = lazyPage(() => import('./pages/CommerceModules/CatalogCustomFieldsPage.jsx'), 'CatalogCustomFieldsPage');
const CatalogRelationsPage = lazyPage(() => import('./pages/CommerceModules/CatalogRelationsPage.jsx'), 'CatalogRelationsPage');
const CatalogReviewsPage = lazyPage(() => import('./pages/CommerceModules/CatalogReviewsPage.jsx'), 'CatalogReviewsPage');
const CmsBannersPage = lazyPage(() => import('./pages/CommerceModules/CmsBannersPage.jsx'), 'CmsBannersPage');
const CmsBlogPage = lazyPage(() => import('./pages/CommerceModules/CmsBlogPage.jsx'), 'CmsBlogPage');
const CmsPagesPage = lazyPage(() => import('./pages/CommerceModules/CmsPagesPage.jsx'), 'CmsPagesPage');
const CmsPopupsPage = lazyPage(() => import('./pages/CommerceModules/CmsPopupsPage.jsx'), 'CmsPopupsPage');
const MarketingAbandonedCartsPage = lazyPage(() => import('./pages/CommerceModules/MarketingAbandonedCartsPage.jsx'), 'MarketingAbandonedCartsPage');
const MarketingCouponsPage = lazyPage(() => import('./pages/CommerceModules/MarketingCouponsPage.jsx'), 'MarketingCouponsPage');
const MarketingFeedsPage = lazyPage(() => import('./pages/CommerceModules/MarketingFeedsPage.jsx'), 'MarketingFeedsPage');
const MarketingPixelsPage = lazyPage(() => import('./pages/CommerceModules/MarketingPixelsPage.jsx'), 'MarketingPixelsPage');
const SeoHeadTagsPage = lazyPage(() => import('./pages/CommerceModules/SeoHeadTagsPage.jsx'), 'SeoHeadTagsPage');
const SeoLocalizationPage = lazyPage(() => import('./pages/CommerceModules/SeoLocalizationPage.jsx'), 'SeoLocalizationPage');
const SeoRobotsSitemapPage = lazyPage(() => import('./pages/CommerceModules/SeoRobotsSitemapPage.jsx'), 'SeoRobotsSitemapPage');
const SeoSettingsPage = lazyPage(() => import('./pages/CommerceModules/SeoSettingsPage.jsx'), 'SeoSettingsPage');
const WorkflowRulesPage = lazyPage(() => import('./pages/CommerceModules/WorkflowRulesPage.jsx'), 'WorkflowRulesPage');
const DashboardPage = lazyPage(() => import('./pages/Dashboard/DashboardPage.jsx'), 'DashboardPage');
const CustomerDashboardPage = lazyPage(() => import('./pages/Dashboard/CustomerDashboardPage.jsx'), 'CustomerDashboardPage');
const ApiLogsPage = lazyPage(() => import('./pages/Logs/ApiLogsPage.jsx'), 'ApiLogsPage');
const ImportCenterPage = lazyPage(() => import('./pages/Imports/ImportCenterPage.jsx'), 'ImportCenterPage');
const ProductImportPage = lazyPage(() => import('./pages/Imports/ProductImportPage.jsx'), 'ProductImportPage');
const HepsiburadaPage = lazyPage(() => import('./pages/Marketplaces/HepsiburadaPage.jsx'), 'HepsiburadaPage');
const BatchResultsPage = lazyPage(() => import('./pages/Marketplaces/BatchResultsPage.jsx'), 'BatchResultsPage');
const MarketplacesPage = lazyPage(() => import('./pages/Marketplaces/MarketplacesPage.jsx'), 'MarketplacesPage');
const MarketplaceOnboardingPage = lazyPage(() => import('./pages/Marketplaces/MarketplaceOnboardingPage.jsx'), 'MarketplaceOnboardingPage');
const TrendyolPage = lazyPage(() => import('./pages/Marketplaces/TrendyolPage.jsx'), 'TrendyolPage');
const OrderDetailPage = lazyPage(() => import('./pages/Orders/OrderDetailPage.jsx'), 'OrderDetailPage');
const OrdersPage = lazyPage(() => import('./pages/Orders/OrdersPage.jsx'), 'OrdersPage');
const OperationsCenterPage = lazyPage(() => import('./pages/Operations/OperationsCenterPage.jsx'), 'OperationsCenterPage');
const PaymentsPage = lazyPage(() => import('./pages/Payments/PaymentsPage.jsx'), 'PaymentsPage');
const CategoryMappingPage = lazyPage(() => import('./pages/Products/CategoryMappingPage.jsx'), 'CategoryMappingPage');
const CatalogResourcePage = lazyPage(() => import('./pages/Products/CatalogResourcePage.jsx'), 'CatalogResourcePage');
const ProductCreatePage = lazyPage(() => import('./pages/Products/ProductCreatePage.jsx'), 'ProductCreatePage');
const ProductDetailPage = lazyPage(() => import('./pages/Products/ProductDetailPage.jsx'), 'ProductDetailPage');
const ProductPublishWizardPage = lazyPage(() => import('./pages/Products/ProductPublishWizardPage.jsx'), 'ProductPublishWizardPage');
const PricingRulesCustomerPage = lazyPage(() => import('./pages/Products/PricingRulesCustomerPage.jsx'), 'PricingRulesCustomerPage');
const PublishQueuePage = lazyPage(() => import('./pages/Products/PublishQueuePage.jsx'), 'PublishQueuePage');
const ProductsPage = lazyPage(() => import('./pages/Products/ProductsPage.jsx'), 'ProductsPage');
const VariantManagementPage = lazyPage(() => import('./pages/Products/VariantManagementPage.jsx'), 'VariantManagementPage');
const QueuePage = lazyPage(() => import('./pages/Queue/QueuePage.jsx'), 'QueuePage');
const ReportsPage = lazyPage(() => import('./pages/Reports/ReportsPage.jsx'), 'ReportsPage');
const CustomerReportsPage = lazyPage(() => import('./pages/Reports/ReportsPage.jsx'), 'CustomerReportsPage');
const DeveloperCenterPage = lazyPage(() => import('./pages/Resources/DeveloperCenterPage.jsx'), 'DeveloperCenterPage');
const RolesPage = lazyPage(() => import('./pages/Roles/RolesPage.jsx'), 'RolesPage');
const ShippingPage = lazyPage(() => import('./pages/Shipping/ShippingPage.jsx'), 'ShippingPage');
const SaasPage = lazyPage(() => import('./pages/Saas/SaasPage.jsx'), 'SaasPage');
const SettingsPage = lazyPage(() => import('./pages/Settings/SettingsPage.jsx'), 'SettingsPage');

function Protected({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" replace />;
}

function RouteFallback() {
  return (
    <div className="route-loading-shell">
      <LoadingState label="Sayfa yukleniyor..." />
    </div>
  );
}

function CustomerRoutes() {
  return (
    <>
      <Route index element={<CustomerDashboardPage />} />
      <Route path="dashboard" element={<CustomerDashboardPage />} />
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
        <React.Suspense fallback={<RouteFallback />}>
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
        </React.Suspense>
        <ToastHost />
      </BrowserRouter>
    </AppProvider>
  </React.StrictMode>,
);
