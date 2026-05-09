const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'API hatasi' }));
    throw new Error(error.message || Object.values(error.errors || {})[0]?.[0] || 'API hatasi');
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const jsonBody = (payload) => JSON.stringify(payload);
