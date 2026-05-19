# Real Provider E2E Verification Checklist

Bu dokuman Trendyol, Hepsiburada, POS, kargo, import, webhook ve queue akislarini gercek veya staging provider credentiallari girilmeden once guvenli sekilde dogrulamak icin kullanilir.

Bu dokuman deploy otomasyonu, provider credential saklama veya canli urun/siparis operasyonu yapmaz. Gercek API cagrisina gecmeden once read-only kontroller tamamlanmali, sonra stage credential ile test edilmeli, en son kontrollu live test yapilmalidir.

## 1. Amac ve Guvenlik Uyarisi

Dogru siralama:

1. Kod, route, UI, log, queue ve masking kontrolleri.
2. Read-only provider cagirilari.
3. Stage credential ile izole test.
4. Kontrollu live credential testi.

Canli provider credential ile ilk denemede bulk product send, bulk stock/price update, refund, invoice, return answer veya customer-facing aksiyon calistirilmaz.

Bulk riskleri:

- Trendyol urun gonderim ve stok/fiyat update akisleri aktif company urunleri uzerinden calisabilir.
- Hepsiburada urun gonderim ve stok/fiyat update akisleri aktif company urunleri uzerinden calisabilir.
- Test disi urunler staging company icinde bulunuyorsa yanlislikla provider'a gidebilir.
- Canli ortamda duplicate SKU, barcode, productMainId veya merchantSku kalici provider kaydi olusturabilir.

## 2. Test SKU / Barcode Standardi

Test urunleri icin tek tip adlandirma kullanilir:

- SKU prefix: `BALINA-STG-`
- Ornek SKU: `BALINA-STG-TY-20260519-001`
- Barcode prefix: `869BALINA` veya provider sandbox tarafindan kabul edilen benzer test standardi
- Ornek barcode: `869BALINA20260519001`
- `productMainId`: SKU ailesini temsil edecek sekilde `BALINA-STG-TY-20260519`
- `merchantSku`: SKU ile ayni veya provider standardina gore `BALINA-STG-HB-20260519-001`
- Urun adi: `[STAGING TEST - DO NOT FULFILL] Balina Test Urunu`

Duplicate risk uyarisi:

- Ayni barcode veya merchantSku tekrar kullanilirsa provider tarafinda duplicate, update veya rejected batch sonucu olusabilir.
- Live testte gercek GTIN, gercek musteri urunu veya fulfillment'a dusme riski olan SKU kullanilmaz.
- Her provider ve tarih icin ayri test SKU serisi kullanilir.

## 3. Trendyol Verification Runbook

### Credential Test

UI: `Marketplaces > Trendyol > Hesap / Baglanti Testi`

Basari kriteri:

- Connection status basarili gorunur.
- API Logs icinde Trendyol connection istegi basarili kaydedilir.
- Credential degerleri loglarda maskeli kalir.

### Kategori Cekme

UI: `Trendyol > Kategori Agaci`

Basari kriteri:

- Kategori listesi gelir.
- Bos veya hatali response beyaz ekran uretmez.
- API Logs status/result alanlari anlamli gorunur.

### Marka Cekme

UI: `Trendyol > Marka Listesi`

Basari kriteri:

- Marka listesi gelir.
- Pagination veya bos response guvenli gosterilir.

### Kategori Ozellikleri

UI: kategori secilip `Ozellikleri Getir`

Basari kriteri:

- Required/optional attribute bilgileri gorunur.
- Category id hatasinda hata state gorunur.

### Attribute Values

UI: attribute value sorgusu

Basari kriteri:

- Enum degerleri gorunur.
- Bos value listesi empty state olarak kalir.

### Product Readiness

UI: `Product Publish Wizard` veya publish queue readiness adimi

Kontrol edilecek alanlar:

- Barcode
- Trendyol brand id
- Trendyol category id
- Required attributes
- HTTPS image
- Price ve stock

Basari kriteri:

- Eksik alanlar urun gondermeden once listelenir.
- Test urunu disindaki urunler secilmez.

### Test Urun Gonderimi

On kosul:

- Staging company izole.
- Sadece `BALINA-STG-` test urunleri aktif.
- Provider environment stage veya onayli test hesap.

UI: `Trendyol > Urunleri Gonder`

Basari kriteri:

- Queue run olusur.
- Batch request id kaydedilir.
- API Logs basarili veya provider hata detayini maskeli gosterir.

### Batch Result

UI: `Trendyol > Batch > Sorgula`

Basari kriteri:

- Batch sonucu gorunur.
- Hata/reject nedenleri provider response icinde izlenir.
- Metadata son batch sonucunu saklar.

### Stok/Fiyat Update

On kosul:

- Yalnizca test urunleri aktif.

UI: `Trendyol > Toplu Stok/Fiyat Gonder`

Basari kriteri:

- Queue run tamamlanir.
- Provider response loglanir.
- Test SKU disinda urun etkilenmez.

### Siparis Cekme

UI:

- `Yeni Siparisleri Al`
- `Tum Siparisleri Kontrol Et`

Basari kriteri:

- Order kaydi upsert edilir.
- Queue status completed olur.
- `sync.completed` webhook delivery log'a duser.

### Iade / Soru-Cevap / Fatura Dogrulama

Read-only kontroller once yapilir:

- Iade taleplerini cek.
- Sorulari cek.

Write aksiyonlar ayrica onay gerektirir:

- Iade cevaplama.
- Soru cevaplama.
- Fatura linki veya dosyasi gonderme.

Basari kriteri:

- Read-only response UI'da gorunur.
- Write aksiyonlar sadece provider test datasinda yapilir.

### Webhook Callback Riski

Trendyol package webhook isleme akisi vardir; ancak mevcut route protected API altindadir. Gercek provider callback icin public signed endpoint hardening ihtiyaci ayrica degerlendirilmelidir.

## 4. Hepsiburada Verification Runbook

### Credential Test

UI: `Marketplaces > Hepsiburada > Baglanti Testi`

Basari kriteri:

- Merchant credential calisir.
- API Logs basarili kayit olusturur.
- Secret alanlar maskelenir.

### Kategori Cekme

UI: `Hepsiburada > Kategorileri Cek`

Basari kriteri:

- Kategori listesi gelir.
- Bos response empty state olarak gorunur.

### Urun Gonderim

On kosul:

- Staging company izole.
- Sadece `BALINA-STG-` test urunleri aktif.

UI: `Hepsiburada > Urunleri Gonder`

Basari kriteri:

- Import/tracking id doner.
- Metadata veya API Logs uzerinden tracking id izlenir.

### Stok/Fiyat Update

UI: `Hepsiburada > Toplu Stok/Fiyat Gonder`

Basari kriteri:

- Test SKU/merchantSku icin update basarili olur.
- Test disi urun etkilenmez.

### Siparis Cekme

UI: `Hepsiburada > Siparisleri Cek`

Basari kriteri:

- Siparisler local order kaydina upsert edilir.
- Queue run tamamlanir.
- API Logs response maskeli gorunur.

### Eksik Endpointler

Mevcut eksikler:

- Batch result query.
- Return/iade detay akisleri.
- Question/answer akisleri.
- Invoice link/file akisleri.
- Detayli product status filtreleri.

### Stage/Prod Environment Risk Notu

Hepsiburada UI'da environment secimi gorunur; ancak backend service account metadata environment degerini Trendyol gibi aktif kullanmayabilir. Stage/prod ayrimi config/base URL seviyesinde ayrica dogrulanmalidir.

## 5. POS / Odeme Verification

### Account Config

Kontrol edilecek alanlar:

- `base_url`
- API key/client id
- Payment create endpoint
- Query endpoint
- Refund endpoint
- Webhook secret

Uyari:

- Endpoint veya base URL eksikse servis mock response donebilir. Bu durum gercek provider basarisi olarak kabul edilmez.

### Payment Create / Query

UI: Payments ekrani

Basari kriteri:

- Test order icin payment olusur.
- Query job dispatch edilir.
- Payment status provider response ile guncellenir.

### Refund

On kosul:

- Provider test payment kaydi.
- Refund aksiyonu icin manuel onay.

Basari kriteri:

- Refund response loglanir.
- Payment log ve API log tutarlidir.

### Callback Signature

Route: `/api/payment-callbacks/{payment}`

Basari kriteri:

- Signature dogruysa callback kabul edilir.
- Signature hataliysa rejected log olusur.
- Webhook secret olmadan live test yapilmaz.

### Payment Logs

Kontrol:

- Payment status history.
- Callback accepted/rejected loglari.
- API log masking.

## 6. Kargo Verification

### Account Config

Kontrol edilecek alanlar:

- Cargo account active.
- `base_url`
- Create shipment endpoint.
- Track endpoint.
- Label endpoint.
- Return code endpoint.

Uyari:

- Endpoint veya base URL eksikse mock/fallback response olusabilir.

### Barkod Olusturma

UI: Shipping ekranindan order shipment create

Basari kriteri:

- Shipment queued olur.
- Job tamamlaninca barcode/tracking number olusur.

### Takip Sorgulama

UI: Shipment track aksiyonu

Basari kriteri:

- Tracking status guncellenir.
- API log provider response'u saklar.

### Etiket Goruntuleme / Indirme

UI: label view/download

Basari kriteri:

- Label path olusur.
- Download route calisir.
- Storage permission sorunu yoktur.

### Iade Kodu

UI: return code aksiyonu

Basari kriteri:

- Return code provider response ile kaydedilir.
- Hata durumunda shipment error state gorunur.

### Error Log

Kontrol:

- Failed provider response API Logs'a duser.
- Shipment status error olur.
- Retry aksiyonu calisir.

## 7. XML / Excel Import Verification

### XML Preview

UI: Imports ekraninda XML source preview

Basari kriteri:

- XML URL okunur.
- Sample rows ve field candidates gorunur.
- Invalid XML hata state uretir.

### Excel Preview

UI: Excel upload preview

Basari kriteri:

- Valid/invalid rows ayrilir.
- Sample rows gorunur.

### Field Mapping

Kontrol edilecek alanlar:

- Name
- SKU/barcode
- Price
- Stock
- Brand
- Category
- Images
- Variant fields

### Import Job

Basari kriteri:

- Import run queued/running/completed olarak izlenir.
- Queue `imports` calisir.
- Lock conflict veya retry durumlari gorunur.

### Failed Rows

Basari kriteri:

- Row bazli hata mesaji gorunur.
- Failed rows tekrar incelenebilir.

### Product Readiness Etkisi

Import sonrasi:

- Product readiness yeniden calistirilir.
- Marketplace mapping eksikleri gorunur.
- Test urunleri provider gonderime hazir hale gelir.

## 8. Webhook Runtime Verification

### Settings Webhook Test

UI: `Settings > Webhook`

Basari kriteri:

- Endpoint ve secret kaydedilir.
- `Webhook test et` butonu signed request gonderir.
- Success/error state gorunur.

### Delivery Log

Kontrol:

- Delivery id.
- Event.
- Endpoint.
- Status.
- Attempts.
- HTTP code.
- Last error.
- Payload ve response body.

### sync.completed / sync.failed

Tetikleyiciler:

- Marketplace sync basarili tamamlanirsa `sync.completed`.
- Marketplace sync fail olursa `sync.failed`.

Basari kriteri:

- Delivery log olusur.
- Notification job ana operasyonu bloklamaz.

### Signature Dogrulama

Headerlar:

- `X-Balina-Event`
- `X-Balina-Signature`
- `X-Balina-Delivery`

Basari kriteri:

- Receiver payload body uzerinden HMAC SHA-256 dogrular.
- Secret hataliysa receiver reject eder ve delivery log hata gosterir.

### Retry Gorunurlugu

Basari kriteri:

- Failed response attempts alanini artirir.
- Son hata delivery log'da gorunur.
- Final fail durumunda status failed olur.

## 9. Queue / Horizon Verification

### Job Dispatch

Kontrol edilecek job tipleri:

- Marketplace sync.
- Product send.
- Stock/price update.
- Order pull.
- Import.
- Shipping.
- Payment query.
- Webhook notification.

### Pending / Running / Failed

UI: `QueuePage`

Basari kriteri:

- Pending/running/completed/failed sayilari gorunur.
- Recent sync runs dogru listelenir.

### Retry

Basari kriteri:

- Failed job retry aksiyonu calisir.
- Retry sonrasi queue notification olusur.

### Failed Job Log

Kontrol:

- Failed jobs tablosu.
- Laravel log.
- API Logs.
- Queue notifications.

### Horizon Kontrol

Sunucu tarafinda:

```bash
php artisan horizon:status
sudo supervisorctl status balina-horizon
```

Beklenen queue'lar:

- `marketplace-sync`
- `imports`
- `shipping`
- `payments`
- `accounting`
- `notifications`
- `default`

## 10. UI Dogrulama Haritasi

| Ekran | Islem | Beklenen basari state | Beklenen hata state |
| --- | --- | --- | --- |
| Marketplaces | Provider connection test | Connected/status success | Error toast veya card hata mesaji |
| Trendyol | Categories/brands/attributes | Liste veya table dolu | Empty/error state |
| Trendyol | Product send | Queue run ve batch id | API log hata, UI hata state |
| Trendyol | Batch result | Batch sonucu gorunur | Provider hata mesaji |
| Hepsiburada | Categories | Liste dolu | Empty/error state |
| Hepsiburada | Product send | Tracking id/log | API log hata |
| Product Publish Wizard | Readiness | Eksiksiz urun ready | Eksik alan listesi |
| Publish Queue | Draft send | Draft queued | Validation hata listesi |
| Orders | Order pull sonucu | Siparis listesi guncel | Empty/error state |
| Queue | Job status | Running/completed gorunur | Failed job ve retry |
| API Logs | Provider log | Maskeli request/response | Hata detaylari |
| Settings | Webhook test | Delivery delivered | Delivery failed ve last error |

## 11. Guvenlik Checklist

Credential masking:

- API key, token, secret, password, authorization, supplier id ve merchant id alanlari loglarda maskelenmeli.
- Settings form secret alanlari acik text olarak kalici gorunmemeli.

API log masking:

- Request/response detayinda hassas alanlar maskeli olmali.
- Provider hata response'u credential icermemeli.

Webhook payload masking:

- `secret`, `token`, `password`, `api_key`, `api_secret`, `authorization`, `webhook_secret`, `key` patternleri maskelenmeli.

Tenant izolasyonu:

- Normal kullanici yalnizca kendi company marketplace, order, log, queue ve webhook delivery kayitlarini gormeli.
- Super admin company filtreleri bilincli kullanilmali.

## 12. Live Credential Oncesi Onay Checklist

Canli credential girilmeden once:

- Staging company izole mi?
- Staging company icinde test urunleri disinda aktif urun var mi?
- Test SKU prefixleri `BALINA-STG-` ile basliyor mu?
- Barcode/productMainId/merchantSku provider test standardina uygun mu?
- `VITE_API_URL` dogru staging veya production API'yi gosteriyor mu?
- Provider environment stage/prod dogru mu?
- Hepsiburada base URL/config stage/prod ayrimi dogrulandi mi?
- Payment/cargo servislerinde mock'a dusmeyecek base URL ve endpointler girildi mi?
- Backup alindi mi?
- Queue/Horizon calisiyor mu?
- Scheduler calisiyor mu?
- Webhook endpoint test edildi mi?
- Delivery log gorunuyor mu?
- API log masking dogrulandi mi?
- Bulk send/update icin yazili onay var mi?
- Refund, invoice, return answer gibi write aksiyonlar icin ayrica onay var mi?

## 13. Provider Eksik Endpoint Listesi

Hepsiburada eksikleri:

- Batch result query.
- Return/iade akis detaylari.
- Question/answer akisleri.
- Invoice link/file akisleri.
- Detayli product status filtreleri.

Trendyol hardening ihtiyaci:

- Gercek external webhook callback icin public signed endpoint degerlendirilmeli.
- Live write aksiyonlar icin test data guardrails ayrica planlanmali.

Publish wizard ayrimi:

- Publish wizard ve publish queue draft/status akisini yonetir.
- Gercek provider API dispatch akisi provider sayfalarindaki product send/update aksiyonlari ile calisir.
- E2E testte bu ayrim acikca not edilmeli.
