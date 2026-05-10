import { ModulePage } from './ModulePage.jsx';
import { modulePages } from './moduleConfig.js';

const domainByPath = {
  cms: 'cms',
  marketing: 'marketing',
  catalog: 'catalog',
  pricing: 'pricing',
  workflow: 'workflow',
  b2b: 'b2b',
  seo: 'seo',
};

export function SpecializedModulePage({ path, title }) {
  const base = modulePages.find((item) => item.path === path);
  const domain = domainByPath[path.split('/')[0]];

  return <ModulePage config={{ ...base, title: title || base.title, domain }} />;
}
