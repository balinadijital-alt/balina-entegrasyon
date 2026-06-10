import { expect, test } from '@playwright/test';

const smokeRoutes = [
  { path: '/dashboard', title: 'Baslangic' },
  { path: '/operations', title: 'Operasyon Merkezi' },
  { path: '/marketplaces', title: 'Pazaryerleri' },
  { path: '/marketplace-mapping', title: 'Pazaryeri Eslestirme Merkezi' },
  { path: '/marketplace-readiness', title: 'Pazaryeri Hazirlik Merkezi' },
  { path: '/marketplace-mapping/categories', title: 'Kategori Eslestirme' },
  { path: '/marketplace-mapping/brands', title: 'Marka Eslestirme' },
  { path: '/marketplace-mapping/attributes', title: 'Ozellik / Nitelik Eslestirme' },
  { path: '/marketplace-mapping/variants', title: 'Varyant Eslestirme' },
  { path: '/products/publish-wizard', title: 'Urun Gonderme Sihirbazi' },
  { path: '/products/publish-queue', title: 'Gonderim Kuyrugu' },
  { path: '/imports', title: 'XML / Excel Import Merkezi' },
  { path: '/orders', title: 'Siparis Operasyon Merkezi' },
  { path: '/shipping', title: 'Kargo Operasyon Merkezi' },
  { path: '/payments', title: 'Odeme Operasyon Merkezi' },
  { path: '/accounting', title: 'Muhasebe Operasyon Merkezi' },
  { path: '/saas', title: 'SaaS Operasyon Merkezi' },
  { path: '/settings', title: 'Sistem ve Firma Yonetim Merkezi' },
  { path: '/queue', title: 'Queue Retry Merkezi' },
  { path: '/api-logs', title: 'Hata Merkezi' },
  { path: '/resources', title: 'Kaynaklar / Developer Center' },
];

async function authenticate(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'e2e-smoke-token');
  });
}

async function isolateBackendApi(page) {
  await page.route('http://127.0.0.1:8000/api/**', async (route) => {
    await route.abort('failed');
  });
}

function collectConsoleErrors(page) {
  const errors = [];

  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('Failed to load resource')) {
      errors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  return errors;
}

test.describe('operasyon paneli smoke testleri', () => {
  for (const route of smokeRoutes) {
    test(`${route.path} route acilir`, async ({ page }) => {
      const consoleErrors = collectConsoleErrors(page);
      await authenticate(page);
      await isolateBackendApi(page);

      await page.goto(route.path);

      await expect(page.locator('.shell')).toBeVisible();
      await expect(page.locator('.content')).toBeVisible();
      await expect(page.locator('.page-header h1')).toContainText(route.title);
      await expect(page.locator('.route-loading-shell')).toHaveCount(0);
      expect(consoleErrors).toEqual([]);
    });
  }

  test('sidebar navigasyonu lazy route gecislerinde calisir', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await authenticate(page);
    await isolateBackendApi(page);

    await page.goto('/dashboard');
    await expect(page.locator('.page-header h1')).toContainText('Baslangic');

    const sidebar = page.locator('.sidebar');
    await sidebar.getByRole('button', { name: 'Operasyon' }).click();
    await sidebar.getByRole('link', { name: 'Operasyon Merkezi' }).click();
    await expect(page).toHaveURL(/\/operations$/);
    await expect(page.locator('.page-header h1')).toContainText('Operasyon Merkezi');

    await sidebar.getByRole('button', { name: 'Pazaryeri Yonetimi' }).click();
    await sidebar.getByRole('link', { name: 'Pazaryeri Hesaplari' }).click();
    await expect(page).toHaveURL(/\/marketplaces$/);
    await expect(page.locator('.page-header h1')).toContainText('Pazaryerleri');
    await sidebar.getByRole('link', { name: 'Pazaryeri Hazirlik' }).click();
    await expect(page).toHaveURL(/\/marketplace-readiness$/);
    await expect(page.locator('.page-header h1')).toContainText('Pazaryeri Hazirlik Merkezi');

    await sidebar.getByRole('button', { name: 'Genel' }).click();
    await sidebar.getByRole('link', { name: 'Kaynaklar' }).click();
    await expect(page).toHaveURL(/\/resources$/);
    await expect(page.locator('.page-header h1')).toContainText('Kaynaklar / Developer Center');
    expect(consoleErrors).toEqual([]);
  });
});
