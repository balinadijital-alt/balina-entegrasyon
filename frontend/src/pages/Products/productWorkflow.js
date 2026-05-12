export function marketplaceStatus(product, code) {
  return product.marketplace_statuses?.find((status) => status.marketplace_code === code)
    || product.marketplaceStatuses?.find((status) => status.marketplace_code === code);
}

export const MISSING_FIELD_LABELS = {
  name: 'Urun adi',
  brand: 'Marka',
  category: 'Kategori',
  barcode: 'Barkod',
  sku: 'SKU',
  price: 'Fiyat',
  stock: 'Stok',
  attributes: 'Katalog niteligi',
  vat_rate: 'KDV',
  description: 'Aciklama',
  seo: 'SEO bilgileri',
  image: 'Gorsel',
  cargo: 'Kargo bilgisi',
  marketplace_category: 'Pazaryeri kategorisi',
  category_mapping: 'Kategori eslesmesi',
  required_attributes: 'Zorunlu pazaryeri ozelligi',
};

export function missingLabel(field) {
  return MISSING_FIELD_LABELS[field] || String(field || '').replaceAll('_', ' ');
}

export function marketplaceReadiness(product, code) {
  if (!code) return null;
  return product.marketplace_readiness?.[code] || null;
}

export function missingFields(product, code = null) {
  const statuses = product.marketplace_statuses || product.marketplaceStatuses || [];
  const readiness = product.marketplace_readiness || {};
  const relevantStatuses = code ? statuses.filter((status) => status.marketplace_code === code) : statuses;
  const relevantReports = code ? [readiness[code]].filter(Boolean) : Object.values(readiness);
  const statusMissing = relevantStatuses.flatMap((status) => status.missing_fields || []);
  const reportMissing = relevantReports.flatMap((item) => item?.missing_fields || []);

  return [...new Set([...statusMissing, ...reportMissing])];
}

export function productImage(product) {
  if (product.main_image_url) {
    return product.main_image_url;
  }

  const firstGalleryItem = product.gallery_images?.[0] || product.images?.[0];
  if (typeof firstGalleryItem === 'string') {
    return firstGalleryItem;
  }

  return firstGalleryItem?.url || firstGalleryItem?.path || '';
}

export function readinessScore(product, code = null) {
  const singleReport = marketplaceReadiness(product, code);
  if (singleReport) {
    return Number(singleReport.score || 0);
  }

  const reports = Object.values(product.marketplace_readiness || {});
  if (reports.length > 0) {
    return Math.round(reports.reduce((sum, report) => sum + Number(report.score || 0), 0) / reports.length);
  }

  if (product.marketplace_ready) {
    return 100;
  }

  const missing = missingFields(product, code).length;
  return Math.max(20, 100 - (missing * 12));
}

export function isMarketplaceReady(product, code = null) {
  const report = marketplaceReadiness(product, code);
  if (report) return Boolean(report.ready);
  return Boolean(product.marketplace_ready);
}

export function publishBlockReason(product, code = null) {
  const missing = missingFields(product, code);
  if (missing.includes('category_mapping')) return 'Eksik kategori eslesmesi';
  if (missing.includes('marketplace_category')) return 'Eksik pazaryeri kategorisi';
  if (missing.includes('required_attributes')) return 'Eksik zorunlu ozellik';
  if (missing.includes('attributes')) return 'Eksik katalog niteligi';
  if (missing.includes('brand')) return 'Eksik marka';
  if (missing.includes('category')) return 'Eksik kategori';
  if (missing.includes('barcode')) return 'Eksik barkod';
  if (missing.includes('image')) return 'Eksik gorsel';
  if (missing.includes('price') || missing.includes('stock')) return 'Fiyat/stok hatasi';
  return isMarketplaceReady(product, code) ? 'Hazir' : 'Kontrol gerekli';
}

export function missingTextFromFields(fields = []) {
  return [...new Set(fields)].map((field) => missingLabel(field)).join(', ');
}
