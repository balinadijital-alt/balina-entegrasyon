export function required(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function validateCompany(form) {
  const errors = {};
  if (!required(form.name)) errors.name = 'Firma adi zorunludur.';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Gecerli bir e-posta girin.';
  if (form.admin_username && !required(form.admin_password)) errors.admin_password = 'Yonetici sifresi zorunludur.';
  if (form.admin_password && !required(form.admin_username)) errors.admin_username = 'Yonetici kullanici adi zorunludur.';
  if (form.admin_password && String(form.admin_password).length < 8) errors.admin_password = 'Sifre en az 8 karakter olmali.';
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
      errors.trendyol_attributes = 'Trendyol ozellikleri gecerli formatta olmali.';
    }
  }
  if (form.hepsiburada_attributes) {
    try {
      JSON.parse(form.hepsiburada_attributes);
    } catch {
      errors.hepsiburada_attributes = 'Hepsiburada ozellikleri gecerli formatta olmali.';
    }
  }
  if (form.variant_options) {
    try {
      JSON.parse(form.variant_options);
    } catch {
      errors.variant_options = 'Varyant bilgileri gecerli formatta olmali.';
    }
  }
  return errors;
}

export function validateMarketplace(form) {
  const errors = {};
  if (!required(form.company_id)) errors.company_id = 'Firma secimi zorunludur.';
  if (!required(form.name)) errors.name = 'Hesap adi zorunludur.';
  if (form.code === 'trendyol' && !required(form.supplier_id)) errors.supplier_id = 'Trendyol icin Supplier ID zorunludur.';
  if (form.code === 'hepsiburada') {
    if (!required(form.merchant_id)) errors.merchant_id = 'Hepsiburada icin Merchant ID zorunludur.';
    if (!required(form.service_username) && !required(form.api_key)) errors.service_username = 'Hepsiburada kullanici adi zorunludur.';
    if (!required(form.service_password) && !required(form.api_secret)) errors.service_password = 'Hepsiburada parola zorunludur.';
  }
  return errors;
}

export function firstError(errors) {
  return Object.values(errors)[0] || '';
}
