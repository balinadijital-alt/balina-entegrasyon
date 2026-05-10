import { Route } from 'react-router-dom';
import { ModulePage } from './ModulePage.jsx';
import { modulePages } from './moduleConfig.js';

const specializedPaths = new Set([
  'cms/pages', 'cms/blog-posts', 'cms/banners', 'cms/popups',
  'marketing/coupons', 'marketing/abandoned-carts', 'marketing/feeds', 'marketing/pixels',
  'catalog/variants', 'catalog/relations', 'catalog/custom-fields', 'catalog/reviews',
  'pricing/profit-rules', 'workflow/rules',
  'b2b/dealers', 'b2b/prices', 'b2b/transactions',
  'seo/settings', 'seo/sitemap', 'seo/head-tags', 'seo/languages',
]);

export function moduleRoutes() {
  return modulePages.filter((config) => !specializedPaths.has(config.path)).map((config) => (
    <Route key={config.path} path={config.path} element={<ModulePage config={config} />} />
  ));
}
