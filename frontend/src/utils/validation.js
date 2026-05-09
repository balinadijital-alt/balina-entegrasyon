export function required(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function validateCompany(form) {
  const errors = {};
  if (!required(form.name)) errors.name = 'Firma adi zorunludur.';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Gecerli bir e-posta girin.';
  return errors;
}

export function validateProduct(form) {
  const errors = {};
  if (!required(form.company_id)) errors.company_id = 'Firma secimi zorunludur.';
  if (!required(form.sku)) errors.sku = 'SKU zorunludur.';
  if (!required(form.name)) errors.name = 'Urun adi zorunludur.';
  if (Number(form.price) < 0) errors.price = 'Fiyat negatif olamaz.';
  if (Number(form.stock) < 0) errors.stock = 'Stok negatif olamaz.';
  if (form.trendyol_attributes) {
    try {
      JSON.parse(form.trendyol_attributes);
    } catch {
      errors.trendyol_attributes = 'Trendyol ozellikleri gecerli JSON olmali.';
    }
  }
  return errors;
}

export function validateMarketplace(form) {
  const errors = {};
  if (!required(form.company_id)) errors.company_id = 'Firma secimi zorunludur.';
  if (!required(form.name)) errors.name = 'Hesap adi zorunludur.';
  if (form.code === 'trendyol' && !required(form.supplier_id)) errors.supplier_id = 'Trendyol icin Supplier ID zorunludur.';
  if (form.code === 'hepsiburada' && !required(form.merchant_id)) errors.merchant_id = 'Hepsiburada icin Merchant ID zorunludur.';
  return errors;
}

export function firstError(errors) {
  return Object.values(errors)[0] || '';
}
