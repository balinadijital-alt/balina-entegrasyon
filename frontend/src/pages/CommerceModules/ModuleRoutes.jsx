import { Route } from 'react-router-dom';
import { ModulePage } from './ModulePage.jsx';
import { modulePages } from './moduleConfig.js';

export function moduleRoutes() {
  return modulePages.map((config) => (
    <Route key={config.path} path={config.path} element={<ModulePage config={config} />} />
  ));
}
