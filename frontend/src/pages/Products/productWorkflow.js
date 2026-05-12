export function marketplaceStatus(product, code) {
  return product.marketplace_statuses?.find((status) => status.marketplace_code === code)
    || product.marketplaceStatuses?.find((status) => status.marketplace_code === code);
}

export function missingFields(product) {
  const statuses = product.marketplace_statuses || product.marketplaceStatuses || [];
  const readiness = product.marketplace_readiness || {};
  const statusMissing = statuses.flatMap((status) => status.missing_fields || []);
  const reportMissing = Object.values(readiness).flatMap((item) => item?.missing_fields || []);

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

export function readinessScore(product) {
  const reports = Object.values(product.marketplace_readiness || {});
  if (reports.length > 0) {
    return Math.round(reports.reduce((sum, report) => sum + Number(report.score || 0), 0) / reports.length);
  }

  if (product.marketplace_ready) {
    return 100;
  }

  const missing = missingFields(product).length;
  return Math.max(20, 100 - (missing * 12));
}

export function publishBlockReason(product) {
  const missing = missingFields(product);
  if (missing.includes('category_mapping')) return 'Eksik kategori eslesmesi';
  if (missing.includes('marketplace_category')) return 'Eksik pazaryeri kategorisi';
  if (missing.includes('required_attributes')) return 'Eksik zorunlu ozellik';
  if (missing.includes('image')) return 'Eksik gorsel';
  if (missing.includes('price') || missing.includes('stock')) return 'Fiyat/stok hatasi';
  return product.marketplace_ready ? 'Hazir' : 'Kontrol gerekli';
}
