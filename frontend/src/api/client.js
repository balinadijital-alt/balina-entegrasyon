import axios from 'axios';

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api',
  headers: {
    Accept: 'application/json',
  },
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
    }

    return Promise.reject(error);
  },
);

export function apiErrorMessage(error) {
  const data = error.response?.data;
  const validationMessage = data?.errors ? Object.values(data.errors)[0]?.[0] : null;

  return validationMessage || data?.message || error.message || 'Beklenmeyen bir hata olustu.';
}

export function safeData(response, fallback = null) {
  if (response === null || response === undefined) return fallback;
  if (response?.data !== undefined) return response.data;
  return response;
}

export function asArray(response, keys = ['data']) {
  if (Array.isArray(response)) return response;

  const data = safeData(response);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;

  const candidates = [...keys, 'items', 'results', 'records'];
  for (const key of candidates) {
    if (Array.isArray(data?.[key])) return data[key];
    if (Array.isArray(response?.[key])) return response[key];
  }

  return [];
}

export function asObject(response, fallback = {}) {
  const data = safeData(response, fallback);
  if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  return fallback;
}

export function asPaginatedArray(response) {
  return asArray(response, ['data', 'items', 'results', 'records']);
}

export const api = {
  dashboard: {
    report: () => http.get('/dashboard').then((response) => response.data),
  },
  modules: {
    list: (module, params) => http.get(`/modules/${module}`, { params }).then((response) => response.data),
    create: (module, payload) => http.post(`/modules/${module}`, payload).then((response) => response.data),
    update: (module, id, payload) => http.put(`/modules/${module}/${id}`, payload).then((response) => response.data),
    remove: (module, id) => http.delete(`/modules/${module}/${id}`),
  },
  domainModules: {
    list: (domain, module, params) => http.get(`/${domain}/${module}`, { params }).then((response) => response.data),
    create: (domain, module, payload) => http.post(`/${domain}/${module}`, payload).then((response) => response.data),
    update: (domain, module, id, payload) => http.put(`/${domain}/${module}/${id}`, payload).then((response) => response.data),
    remove: (domain, module, id) => http.delete(`/${domain}/${module}/${id}`),
  },
  auth: {
    login: (payload) => http.post('/auth/login', payload).then((response) => response.data),
    register: (payload) => http.post('/auth/register', payload).then((response) => response.data),
    me: () => http.get('/auth/me').then((response) => response.data),
    logout: () => http.post('/auth/logout').then((response) => response.data),
  },
  companies: {
    list: () => http.get('/companies').then((response) => response.data),
    create: (payload) => http.post('/companies', payload).then((response) => response.data),
    update: (id, payload) => http.put(`/companies/${id}`, payload).then((response) => response.data),
    remove: (id) => http.delete(`/companies/${id}`),
  },
  products: {
    list: (params) => http.get('/products', { params }).then((response) => response.data),
    show: (id) => http.get(`/products/${id}`).then((response) => response.data),
    create: (payload) => http.post('/products', payload).then((response) => response.data),
    update: (id, payload) => http.put(`/products/${id}`, payload).then((response) => response.data),
    readiness: (id) => http.get(`/products/${id}/readiness`).then((response) => response.data),
    import: (payload) => http.post('/products/import', payload).then((response) => response.data),
    uploadImage: (productId, payload) => http.post(`/products/${productId}/images`, payload).then((response) => response.data),
  },
  catalogResources: {
    list: (params) => http.get('/catalog-resources', { params }).then((response) => response.data),
    create: (payload) => http.post('/catalog-resources', payload).then((response) => response.data),
    update: (id, payload) => http.put(`/catalog-resources/${id}`, payload).then((response) => response.data),
    remove: (id) => http.delete(`/catalog-resources/${id}`),
  },
  productPublish: {
    drafts: () => http.get('/marketplace-publish-drafts').then((response) => response.data),
    validate: (payload) => http.post('/marketplace-publish/validate', payload).then((response) => response.data),
    send: (draftId) => http.post(`/marketplace-publish-drafts/${draftId}/send`).then((response) => response.data),
  },
  imports: {
    runs: () => http.get('/import-runs').then((response) => response.data),
    showRun: (id) => http.get(`/import-runs/${id}`).then((response) => response.data),
    previewExcel: (payload) => http.post('/import-runs/preview-excel', payload).then((response) => response.data),
    queueExcel: (payload) => http.post('/import-runs/excel', payload).then((response) => response.data),
    retry: (id) => http.post(`/import-runs/${id}/retry`).then((response) => response.data),
  },
  xmlSources: {
    list: () => http.get('/xml-sources').then((response) => response.data),
    create: (payload) => http.post('/xml-sources', payload).then((response) => response.data),
    update: (id, payload) => http.put(`/xml-sources/${id}`, payload).then((response) => response.data),
    preview: (id, payload) => http.post(`/xml-sources/${id}/preview`, payload).then((response) => response.data),
    import: (id, payload) => http.post(`/xml-sources/${id}/import`, payload).then((response) => response.data),
    remove: (id) => http.delete(`/xml-sources/${id}`),
  },
  marketplaces: {
    list: () => http.get('/marketplaces').then((response) => response.data),
    create: (payload) => http.post('/marketplaces', payload).then((response) => response.data),
    update: (id, payload) => http.put(`/marketplaces/${id}`, payload).then((response) => response.data),
    syncProducts: (id) => http.post(`/marketplaces/${id}/sync-products`).then((response) => response.data),
    syncOrders: (id) => http.post(`/marketplaces/${id}/sync-orders`).then((response) => response.data),
    trendyolTest: (id) => http.post(`/marketplaces/${id}/trendyol/test`).then((response) => response.data),
    trendyolCategories: (id) => http.get(`/marketplaces/${id}/trendyol/categories`).then((response) => response.data),
    trendyolBrands: (id, params) => http.get(`/marketplaces/${id}/trendyol/brands`, { params }).then((response) => response.data),
    trendyolCategoryAttributes: (id, categoryId, params) => http.get(`/marketplaces/${id}/trendyol/categories/${categoryId}/attributes`, { params }).then((response) => response.data),
    trendyolCategoryAttributeValues: (id, categoryId, attributeId, params) => http.get(`/marketplaces/${id}/trendyol/categories/${categoryId}/attributes/${attributeId}/values`, { params }).then((response) => response.data),
    trendyolSendProducts: (id) => http.post(`/marketplaces/${id}/trendyol/send-products`).then((response) => response.data),
    trendyolUpdatePriceInventory: (id) => http.post(`/marketplaces/${id}/trendyol/update-price-inventory`).then((response) => response.data),
    trendyolBatchResult: (id, batchId) => http.get(`/marketplaces/${id}/trendyol/batch-results/${batchId}`).then((response) => response.data),
    trendyolFilterProducts: (id, params) => http.get(`/marketplaces/${id}/trendyol/products/filter`, { params }).then((response) => response.data),
    trendyolArchiveProducts: (id, payload) => http.put(`/marketplaces/${id}/trendyol/products/archive`, payload).then((response) => response.data),
    trendyolPullOrders: (id) => http.post(`/marketplaces/${id}/trendyol/pull-orders`).then((response) => response.data),
    trendyolOrdersStream: (id, params) => http.get(`/marketplaces/${id}/trendyol/orders/stream`, { params }).then((response) => response.data),
    trendyolReturns: (id, params) => http.get(`/marketplaces/${id}/trendyol/returns`, { params }).then((response) => response.data),
    trendyolQuestions: (id, params) => http.get(`/marketplaces/${id}/trendyol/questions`, { params }).then((response) => response.data),
    trendyolSendInvoiceLink: (id, packageId, payload) => http.post(`/marketplaces/${id}/trendyol/shipment-packages/${packageId}/invoice-link`, payload).then((response) => response.data),
    trendyolCommonLabelBarcodes: (id, params) => http.get(`/marketplaces/${id}/trendyol/common-label-barcodes`, { params }).then((response) => response.data),
    hepsiburadaTest: (id) => http.post(`/marketplaces/${id}/hepsiburada/test`).then((response) => response.data),
    hepsiburadaCategories: (id) => http.get(`/marketplaces/${id}/hepsiburada/categories`).then((response) => response.data),
    hepsiburadaSendProducts: (id) => http.post(`/marketplaces/${id}/hepsiburada/send-products`).then((response) => response.data),
    hepsiburadaUpdatePriceInventory: (id) => http.post(`/marketplaces/${id}/hepsiburada/update-price-inventory`).then((response) => response.data),
    hepsiburadaPullOrders: (id) => http.post(`/marketplaces/${id}/hepsiburada/pull-orders`).then((response) => response.data),
  },
  categoryMappings: {
    list: (params) => http.get('/category-mappings', { params }).then((response) => response.data),
    create: (payload) => http.post('/category-mappings', payload).then((response) => response.data),
    update: (id, payload) => http.put(`/category-mappings/${id}`, payload).then((response) => response.data),
    remove: (id) => http.delete(`/category-mappings/${id}`),
  },
  orders: {
    list: (params) => http.get('/orders', { params }).then((response) => response.data),
    show: (id) => http.get(`/orders/${id}`).then((response) => response.data),
    statuses: () => http.get('/orders/statuses').then((response) => response.data),
    update: (id, payload) => http.put(`/orders/${id}`, payload).then((response) => response.data),
    transition: (id, payload) => http.post(`/orders/${id}/transition`, payload).then((response) => response.data),
    addNote: (id, payload) => http.post(`/orders/${id}/notes`, payload).then((response) => response.data),
    resolution: (id, payload) => http.post(`/orders/${id}/resolution-request`, payload).then((response) => response.data),
    bulk: (payload) => http.post('/orders/bulk', payload).then((response) => response.data),
  },
  payments: {
    providers: () => http.get('/payment-providers').then((response) => response.data),
    accounts: () => http.get('/payment-accounts').then((response) => response.data),
    createAccount: (payload) => http.post('/payment-accounts', payload).then((response) => response.data),
    list: () => http.get('/payments').then((response) => response.data),
    logs: () => http.get('/payment-logs').then((response) => response.data),
    create: (orderId, payload) => http.post(`/orders/${orderId}/payments`, payload).then((response) => response.data),
    query: (id) => http.post(`/payments/${id}/query`).then((response) => response.data),
    refund: (id, payload) => http.post(`/payments/${id}/refund`, payload).then((response) => response.data),
  },
  accounting: {
    integrations: () => http.get('/accounting-integrations').then((response) => response.data),
    accounts: () => http.get('/accounting-accounts').then((response) => response.data),
    createAccount: (payload) => http.post('/accounting-accounts', payload).then((response) => response.data),
    currentAccounts: () => http.get('/current-accounts').then((response) => response.data),
    createCurrentAccount: (payload) => http.post('/current-accounts', payload).then((response) => response.data),
    transactions: () => http.get('/current-transactions').then((response) => response.data),
    addTransaction: (id, payload) => http.post(`/current-accounts/${id}/transactions`, payload).then((response) => response.data),
    invoices: () => http.get('/invoices').then((response) => response.data),
    logs: () => http.get('/accounting-logs').then((response) => response.data),
    createInvoice: (orderId, payload) => http.post(`/orders/${orderId}/invoices`, payload).then((response) => response.data),
    returnInvoice: (id) => http.post(`/invoices/${id}/return`).then((response) => response.data),
    queryInvoice: (id) => http.post(`/invoices/${id}/query`).then((response) => response.data),
    createPdf: (id) => http.post(`/invoices/${id}/pdf`).then((response) => response.data),
    downloadPdf: (id) => http.get(`/invoices/${id}/pdf`, { responseType: 'blob' }).then((response) => response.data),
  },
  saas: {
    plans: () => http.get('/saas/plans').then((response) => response.data),
    subscriptions: () => http.get('/saas/subscriptions').then((response) => response.data),
    usage: (companyId) => http.get(`/companies/${companyId}/saas-usage`).then((response) => response.data),
    changePlan: (companyId, payload) => http.post(`/companies/${companyId}/change-plan`, payload).then((response) => response.data),
    startTrial: (companyId, payload) => http.post(`/companies/${companyId}/start-trial`, payload).then((response) => response.data),
    licenses: () => http.get('/licenses').then((response) => response.data),
    createLicense: (payload) => http.post('/licenses', payload).then((response) => response.data),
    activateLicense: (payload) => http.post('/licenses/activate', payload).then((response) => response.data),
    partners: () => http.get('/partners').then((response) => response.data),
    createPartner: (payload) => http.post('/partners', payload).then((response) => response.data),
  },
  shipping: {
    carriers: () => http.get('/shipping-carriers').then((response) => response.data),
    accounts: () => http.get('/shipping-accounts').then((response) => response.data),
    createAccount: (payload) => http.post('/shipping-accounts', payload).then((response) => response.data),
    shipments: () => http.get('/shipments').then((response) => response.data),
    createShipment: (orderId, payload) => http.post(`/orders/${orderId}/shipments`, payload).then((response) => response.data),
    bulkLabels: (payload) => http.post('/shipments/bulk-labels', payload).then((response) => response.data),
    track: (id) => http.post(`/shipments/${id}/track`).then((response) => response.data),
    label: (id) => http.post(`/shipments/${id}/label`).then((response) => response.data),
    returnCode: (id) => http.post(`/shipments/${id}/return-code`).then((response) => response.data),
    retry: (id) => http.post(`/shipments/${id}/retry`).then((response) => response.data),
    downloadLabel: (id) => http.get(`/shipments/${id}/label`, { responseType: 'blob' }).then((response) => response.data),
  },
  logs: {
    list: () => http.get('/api-logs').then((response) => response.data),
  },
  queue: {
    status: () => http.get('/queue/status').then((response) => response.data),
    retry: (uuid) => http.post(`/queue/failed/${uuid}/retry`).then((response) => response.data),
  },
  roles: {
    list: () => http.get('/roles').then((response) => response.data),
  },
};
