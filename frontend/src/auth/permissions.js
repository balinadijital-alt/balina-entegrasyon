export const defaultRolePermissions = {
  super_admin: ['*'],
  company_admin: [
    'companies.manage', 'users.manage', 'roles.manage', 'settings.manage', 'products.manage', 'imports.manage',
    'marketplaces.manage', 'marketplaces.send', 'orders.manage', 'payments.manage', 'payments.refund',
    'shipping.manage', 'shipping.labels', 'accounting.manage', 'queue.view', 'queue.retry',
    'analytics.view', 'executive.view', 'logs.view', 'modules.manage',
  ],
  operator: [
    'products.manage', 'imports.manage', 'marketplaces.manage', 'marketplaces.send', 'orders.manage',
    'queue.view', 'queue.retry', 'analytics.view', 'logs.view',
  ],
  company_operator: [
    'products.manage', 'imports.manage', 'marketplaces.manage', 'marketplaces.send', 'orders.manage',
    'queue.view', 'queue.retry', 'analytics.view', 'logs.view',
  ],
  finance: ['payments.manage', 'payments.refund', 'accounting.manage', 'analytics.view', 'logs.view'],
  warehouse: ['shipping.manage', 'shipping.labels', 'orders.manage', 'analytics.view'],
  support: ['analytics.view', 'logs.view', 'queue.view'],
};

const roleLabels = {
  super_admin: 'Platform Admin',
  company_admin: 'Firma Yoneticisi',
  operator: 'Operasyon',
  company_operator: 'Operasyon',
  finance: 'Finans',
  warehouse: 'Depo',
  support: 'Destek',
};

function normalizeName(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.name || value.code || value.slug || null;
}

export function userRoles(user) {
  return [
    ...((Array.isArray(user?.roles) ? user.roles : []).map(normalizeName)),
    normalizeName(user?.role),
  ].filter(Boolean);
}

export function userPermissions(user) {
  return (Array.isArray(user?.permissions) ? user.permissions : []).map(normalizeName).filter(Boolean);
}

export function hasRole(user, role) {
  return userRoles(user).includes(role);
}

export function hasAnyRole(user, roles = []) {
  if (!roles.length) return true;
  return roles.some((role) => hasRole(user, role));
}

export function isSuperAdmin(user) {
  return hasRole(user, 'super_admin');
}

export function isCompanyAdmin(user) {
  return hasRole(user, 'company_admin');
}

export function hasPermission(user, permission) {
  if (!permission) return true;
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  const directPermissions = new Set(userPermissions(user));
  if (directPermissions.has(permission)) return true;

  return userRoles(user).some((role) => (defaultRolePermissions[role] || []).includes(permission));
}

export function hasAnyPermission(user, permissions = []) {
  if (!permissions.length) return true;
  return permissions.some((permission) => hasPermission(user, permission));
}

export function canAccessNavigationItem(user, item) {
  if (!item) return false;
  if (!item.roles?.length && !item.permissions?.length) return true;
  if (!user) return false;
  if (item.roles?.length && !hasAnyRole(user, item.roles)) return false;
  if (item.permissions?.length && !hasAnyPermission(user, item.permissions)) return false;
  return true;
}

export function primaryRoleLabel(user) {
  const role = userRoles(user).find((item) => roleLabels[item]);
  return role ? roleLabels[role] : 'Kullanici';
}

export function defaultRouteForUser(user, basePath = '') {
  const prefix = basePath === '/app' ? '/app' : '';
  if (isSuperAdmin(user)) return '/admin/executive';
  if (isCompanyAdmin(user)) return `${prefix}/executive` || '/executive';
  if (hasAnyRole(user, ['finance'])) return `${prefix}/payments` || '/payments';
  if (hasAnyRole(user, ['warehouse'])) return `${prefix}/shipping` || '/shipping';
  if (hasAnyRole(user, ['operator', 'company_operator'])) return `${prefix}/products` || '/products';
  if (hasAnyRole(user, ['support'])) return `${prefix}/reports` || '/reports';
  return `${prefix}/dashboard` || '/dashboard';
}
