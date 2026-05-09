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

export const api = {
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
    list: () => http.get('/products').then((response) => response.data),
    create: (payload) => http.post('/products', payload).then((response) => response.data),
    import: (payload) => http.post('/products/import', payload).then((response) => response.data),
    uploadImage: (productId, payload) => http.post(`/products/${productId}/images`, payload).then((response) => response.data),
  },
  marketplaces: {
    list: () => http.get('/marketplaces').then((response) => response.data),
    create: (payload) => http.post('/marketplaces', payload).then((response) => response.data),
    syncProducts: (id) => http.post(`/marketplaces/${id}/sync-products`).then((response) => response.data),
    syncOrders: (id) => http.post(`/marketplaces/${id}/sync-orders`).then((response) => response.data),
    trendyolTest: (id) => http.post(`/marketplaces/${id}/trendyol/test`).then((response) => response.data),
    trendyolCategories: (id) => http.get(`/marketplaces/${id}/trendyol/categories`).then((response) => response.data),
    trendyolSendProducts: (id) => http.post(`/marketplaces/${id}/trendyol/send-products`).then((response) => response.data),
    trendyolUpdatePriceInventory: (id) => http.post(`/marketplaces/${id}/trendyol/update-price-inventory`).then((response) => response.data),
    trendyolPullOrders: (id) => http.post(`/marketplaces/${id}/trendyol/pull-orders`).then((response) => response.data),
    hepsiburadaTest: (id) => http.post(`/marketplaces/${id}/hepsiburada/test`).then((response) => response.data),
    hepsiburadaCategories: (id) => http.get(`/marketplaces/${id}/hepsiburada/categories`).then((response) => response.data),
    hepsiburadaSendProducts: (id) => http.post(`/marketplaces/${id}/hepsiburada/send-products`).then((response) => response.data),
    hepsiburadaUpdatePriceInventory: (id) => http.post(`/marketplaces/${id}/hepsiburada/update-price-inventory`).then((response) => response.data),
    hepsiburadaPullOrders: (id) => http.post(`/marketplaces/${id}/hepsiburada/pull-orders`).then((response) => response.data),
  },
  categoryMappings: {
    list: (params) => http.get('/category-mappings', { params }).then((response) => response.data),
    create: (payload) => http.post('/category-mappings', payload).then((response) => response.data),
  },
  orders: {
    list: () => http.get('/orders').then((response) => response.data),
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
