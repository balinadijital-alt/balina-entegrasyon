import { expect, test } from '@playwright/test';

const smokeRoutes = [
  { path: '/dashboard', title: 'Baslangic' },
  { path: '/operations', title: 'Operasyon Merkezi' },
  { path: '/marketplaces', title: 'Pazaryerleri' },
  { path: '/marketplace-mapping', title: 'Pazaryeri Eslestirmeleri' },
  { path: '/marketplace-readiness', title: 'Pazaryeri Hazirlik Merkezi' },
  { path: '/marketplace-mapping/categories', title: 'Kategori Eslestirme' },
  { path: '/marketplace-mapping/brands', title: 'Marka Eslestirme' },
  { path: '/marketplace-mapping/attributes', title: 'Ozellik / Nitelik Eslestirme' },
  { path: '/marketplace-mapping/variants', title: 'Varyant Eslestirme' },
  { path: '/products/publish-wizard', title: 'Toplu Pazaryeri Islemleri' },
  { path: '/products/publish-queue', title: 'Pazaryeri Monitoru' },
  { path: '/imports', title: 'XML / Excel Import Merkezi' },
  { path: '/orders', title: 'Siparisler' },
  { path: '/shipping', title: 'Kargo Operasyon Merkezi' },
  { path: '/payments', title: 'Odeme Operasyon Merkezi' },
  { path: '/accounting', title: 'Muhasebe Operasyon Merkezi' },
  { path: '/saas', title: 'SaaS Operasyon Merkezi' },
  { path: '/settings', title: 'Ayarlar' },
  { path: '/queue', title: 'Queue Retry Merkezi' },
  { path: '/api-logs', title: 'Hata Merkezi' },
  { path: '/resources', title: 'Kaynaklar / Developer Center' },
  { path: '/resources/api-knowledge', title: 'API Knowledge Center' },
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

    await sidebar.getByRole('button', { name: 'Entegrasyonlar' }).click();
    await sidebar.getByRole('link', { name: 'Pazaryeri Entegrasyonlari' }).click();
    await expect(page).toHaveURL(/\/marketplaces$/);
    await expect(page.locator('.page-header h1')).toContainText('Pazaryerleri');
    await sidebar.getByRole('link', { name: 'Pazaryeri Monitoru' }).click();
    await expect(page).toHaveURL(/\/products\/publish-queue$/);
    await expect(page.locator('.page-header h1')).toContainText('Pazaryeri Monitoru');

    await sidebar.getByRole('button', { name: 'Genel' }).click();
    await sidebar.getByRole('link', { name: 'Kaynaklar' }).click();
    await expect(page).toHaveURL(/\/resources$/);
    await expect(page.locator('.page-header h1')).toContainText('Kaynaklar / Developer Center');
    expect(consoleErrors).toEqual([]);
  });

  test('api knowledge provider matrisleri ve arama calisir', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await authenticate(page);
    await isolateBackendApi(page);

    await page.goto('/resources/api-knowledge');
    await expect(page.locator('.page-header h1')).toContainText('API Knowledge Center');
    await expect(page.locator('.api-doc-heading')).toContainText('Trendyol');

    await page.getByRole('button', { name: /Hepsiburada/ }).click();
    await expect(page.locator('.api-doc-heading')).toContainText('Hepsiburada');
    await expect(page.locator('.api-topic-list')).toContainText('Hesap Testi');
    await expect(page.locator('.api-topic-list')).toContainText('Siparisler');

    await page.getByPlaceholder('Endpoint, servis veya ekran ara').fill('orders');
    await expect(page.locator('.api-topic-list')).toContainText('Siparisler');
    await expect(page.locator('.api-doc-heading')).toContainText('Siparisler');

    await page.getByRole('button', { name: /XML/ }).click();
    await expect(page.locator('.api-doc-heading')).toContainText('XML');
    await expect(page.locator('.api-topic-list')).toContainText('XML Kaynak Kurulumu');
    await page.getByPlaceholder('Endpoint, servis veya ekran ara').fill('stok');
    await expect(page.locator('.api-topic-list')).toContainText('Stok / Fiyat Kurallari');
    await page.getByRole('button', { name: /Stok \/ Fiyat Kurallari/ }).click();
    await expect(page.locator('.api-doc-heading')).toContainText('Stok / Fiyat Kurallari');

    await page.getByRole('button', { name: /Shipping/ }).click();
    await expect(page.locator('.api-doc-heading')).toContainText('Shipping');
    await expect(page.locator('.api-topic-list')).toContainText('Provider Kurulumu');
    await expect(page.locator('.api-topic-list')).toContainText('Etiket Olusturma');
    await page.getByPlaceholder('Endpoint, servis veya ekran ara').fill('tracking');
    await expect(page.locator('.api-topic-list')).toContainText('Takip Numarasi');
    await page.getByRole('button', { name: /Takip Numarasi/ }).click();
    await expect(page.locator('.api-doc-heading')).toContainText('Takip Numarasi');

    await page.getByRole('button', { name: /Payments/ }).click();
    await expect(page.locator('.api-doc-heading')).toContainText('Payments');
    await expect(page.locator('.api-topic-list')).toContainText('Provider Kurulumu');
    await expect(page.locator('.api-topic-list')).toContainText('Odeme Olusturma');
    await page.getByPlaceholder('Endpoint, servis veya ekran ara').fill('callback');
    await expect(page.locator('.api-topic-list')).toContainText('Callbackler');
    await page.getByRole('button', { name: /Callbackler/ }).click();
    await expect(page.locator('.api-doc-heading')).toContainText('Callbackler');

    await page.getByRole('button', { name: /Trendyol/ }).click();
    await expect(page.locator('.api-doc-heading')).toContainText('Trendyol');
    await expect(page.locator('.api-topic-list')).toContainText('Urunler');
    expect(consoleErrors).toEqual([]);
  });

  test('marketplace mapping workflow query adimlari acilir', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await authenticate(page);
    await isolateBackendApi(page);

    await page.goto('/marketplace-mapping?step=attribute&marketplace=trendyol&category_id=demo');
    await expect(page.locator('.page-header h1')).toContainText('Pazaryeri Eslestirmeleri');
    await expect(page.locator('.workflow-modal')).toBeVisible();
    await expect(page.locator('.workflow-modal h2')).toContainText('Ozellik Eslestirme');

    await page.goto('/marketplace-mapping?step=variant&marketplace=trendyol');
    await expect(page.locator('.workflow-modal')).toBeVisible();
    await expect(page.locator('.workflow-modal h2')).toContainText('Varyant Eslestirme');
    expect(consoleErrors).toEqual([]);
  });
});
