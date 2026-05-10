# Balina Pazaryeri Entegrasyon Sistemi

Balina; Laravel backend ve React + Vite admin panelden olusan, pazaryeri, kargo, odeme, e-fatura, muhasebe, urun import ve SaaS lisans yonetimi modullerini tek panelde birlestiren moduler entegrasyon platformudur.

Bu repo VPS'e cikmadan once local gelistirme, demo veri, test, kalite kontrol ve deployment hazirligi icin gerekli temel altyapiyi icerir.

## Urun Kapsami

Balina'nin hedefi firmalarin birden fazla pazaryeri ve operasyonel servisi tek noktadan yonetmesini saglamaktir.

- Pazaryeri urun, stok/fiyat ve siparis senkronizasyonu
- XML/Excel kaynaklardan tedarikci bazli urun importu
- Kargo barkod, takip, etiket ve iade kodu altyapisi
- Sanal POS, 3D Secure, iade ve odeme loglari
- E-fatura/e-arsiv, cari hesap ve muhasebe entegrasyonu
- SaaS paket, abonelik, lisans ve partner yonetimi
- Queue, scheduled task, API log, health check ve backup/restore operasyonlari

## Modul Listesi

| Modul | Durum | Aciklama |
| --- | --- | --- |
| Auth ve roller | Hazir | Sanctum login/register, rol/yetki altyapisi |
| Firma yonetimi | Hazir | Firma CRUD, firma bazli entegrasyon hesaplari |
| Urun yonetimi | Hazir | Manuel urun, gorsel, stok/fiyat alanlari |
| XML/Excel import | Hazir | Alan eslestirme, preview, queue import, hata raporu |
| Trendyol | Hazir | Baglanti testi, kategori, urun, stok/fiyat, siparis joblari |
| Hepsiburada | Hazir | Trendyol mimarisiyle uyumlu servis, job ve log altyapisi |
| Kargo | Hazir | Yurtici, Aras, MNG, Surat, PTT, Hepsijet, Trendyol Express servisleri |
| Odeme/POS | Hazir | iyzico, PayTR, Param, Sipay, Paynet, banka POS, havale/EFT, kapida odeme |
| Muhasebe/e-fatura | Hazir | Parasut, Logo, Mikro, Nebim, QNB e-Finans altyapisi |
| SaaS | Hazir | Paket limitleri, abonelik, lisans anahtari, partner temel yonetimi |
| Queue/worker | Hazir | Redis, Horizon, failed job retry, schedule |
| Dashboard | Hazir | Satis, siparis, urun, kargo, odeme, fatura ve SaaS metrikleri |
| Test/kalite | Hazir | Feature test, quality-check script, health check |

## Mimari

```text
balina-entegrasyon/
  backend/      Laravel API, queue jobs, migrations, seeders, services
  frontend/     React + Vite admin panel
  scripts/      Kalite ve operasyon yardimci scriptleri
```

Backend servisleri moduler klasorlerle ayrilir:

- `app/Services/Marketplaces`
- `app/Services/Shipping`
- `app/Services/Payments`
- `app/Services/Accounting`
- `app/Services/Imports`
- `app/Jobs`
- `app/Console/Commands`

## Gereksinimler

- PHP 8.3+ veya lokal mevcut PHP 8.5
- Composer
- Node.js 20+
- npm
- SQLite local gelistirme icin yeterlidir
- Redis queue/Horizon icin onerilir
- GitHub CLI deployment oncesi repo islemleri icin opsiyonel

## Backend Kurulum

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan storage:link
php artisan serve
```

Varsayilan admin:

```text
admin@balina.local
password
```

## Frontend Kurulum

```bash
cd frontend
npm install
npm run dev
```

Varsayilan API adresi:

```text
http://127.0.0.1:8000/api
```

Farkli backend adresi icin:

```bash
VITE_API_URL=http://localhost:8000/api
```

## Demo Veri

Local gelistirmede dashboard ve moduller bos kalmasin diye demo seed sistemi eklidir.

Demo veriyi olustur:

```bash
cd backend
php artisan db:seed --class=DemoSeeder
```

Demo veriyi temizle:

```bash
php artisan demo:reset
```

Demo veriyi sifirlayip yeniden kur:

```bash
php artisan demo:reset --seed
```

Demo seed sunlari uretir:

- Demo firma
- 12 demo urun
- 16 demo siparis
- Kargo kayitlari ve takip numaralari
- Odeme kayitlari ve odeme loglari
- Fatura ve muhasebe loglari
- Trendyol/Hepsiburada marketplace hesaplari
- API log kayitlari
- Profesyonel paket aboneligi ve kullanim sayaclari

## Gelistirme

Backend:

```bash
cd backend
php artisan serve
php artisan horizon
```

Frontend:

```bash
cd frontend
npm run dev
```

Scheduler local test:

```bash
cd backend
php artisan schedule:list
php artisan schedule:run
```

Queue worker/Horizon:

```bash
brew install redis
brew services start redis

cd backend
php artisan horizon
```

## API

Ana endpoint gruplari:

- `POST /api/auth/login`
- `GET /api/dashboard`
- `GET /api/companies`
- `GET /api/products`
- `GET /api/orders`
- `GET /api/shipments`
- `GET /api/payments`
- `GET /api/invoices`
- `GET /api/api-logs`
- `GET /api/queue/status`
- `GET /api/health`

Protected endpointler Sanctum token ister. Login ve API rate limitleri aktiftir.

## Dashboard Metrikleri

Dashboard endpoint'i su alanlari dondurur:

- Toplam satis ve 7 gunluk satis trendi
- Siparis sayisi ve siparis trendi
- Aktif urun sayisi
- Kargo, odeme ve fatura durum dagilimlari
- SaaS abonelik ve limit kullanim metrikleri
- Son siparisler ve son API cagrilari
- Demo veri varligi ve bos ekran bilgileri

## Test ve Kalite Kontrol

Backend feature testleri:

```bash
cd backend
composer test
```

Frontend production build:

```bash
cd frontend
npm run build
```

Tek komut kalite kontrol:

```bash
./scripts/quality-check.sh
```

Bu script backend testlerini ve frontend build'ini birlikte calistirir.

## Health Check

```text
GET /api/health
```

Kontrol edilen servisler:

- Uygulama
- Database
- Cache
- Queue
- Storage

## Backup / Restore

SQLite local/prototip kurulumlar icin:

```bash
cd backend
php artisan balina:backup
php artisan balina:restore storage/app/backups/database-YYYYmmdd-HHMMSS.sqlite --force
```

Production MySQL/PostgreSQL icin provider seviyesinde otomatik backup veya `mysqldump`/`pg_dump` kullanilmalidir.

## Deploy

Production checklist:

- `APP_ENV=production`
- `APP_DEBUG=false`
- Guclu `APP_KEY`
- Production DB bilgileri girildi
- Redis cache/queue aktif
- `QUEUE_CONNECTION=redis`
- `CACHE_STORE=redis`
- `php artisan migrate --force`
- `php artisan storage:link`
- `php artisan config:cache`
- `php artisan route:cache`
- `php artisan view:cache`
- Supervisor ile `php artisan horizon`
- Cron ile `php artisan schedule:run`
- `/api/health` healthy donuyor
- `composer test` ve `npm run build` temiz
- Marketplace, kargo, POS ve muhasebe credential alanlari encrypted olarak girildi
- HTTPS ve reverse proxy headerlari dogru
- Backup/restore proseduru test edildi
- Failed job retry ve log retention proseduru test edildi

Production cron:

```cron
* * * * * cd /path/to/balina-entegrasyon/backend && php artisan schedule:run >> /dev/null 2>&1
```

Supervisor Horizon ornegi:

```ini
[program:balina-horizon]
process_name=%(program_name)s
command=php /path/to/balina-entegrasyon/backend/artisan horizon
autostart=true
autorestart=true
user=www-data
redirect_stderr=true
stdout_logfile=/var/log/balina-horizon.log
stopwaitsecs=3600
```

## Guvenlik

- Laravel Sanctum token auth kullanilir.
- Login endpointinde brute-force ve rate limit korumasi vardir.
- Protected API grubunda `throttle:api` aktiftir.
- Security header middleware'i API response'larina temel guvenlik headerlari ekler.
- Hassas credential alanlari encrypted cast ile saklanir.
- API log middleware'i parola, api key, secret ve webhook secret alanlarini loglamaz.
- Webhook/callback endpointleri provider servislerinde dogrulama icin ayrilmistir.

## Log ve Monitoring

- Laravel daily log channel aktif.
- `LOG_DAILY_DAYS` ile log retention ayarlanir.
- `balina:prune-logs` API, odeme ve muhasebe log tablolarini temizler.
- `ERROR_MONITORING_DSN` doluysa exception report hook'u merkezi monitoring icin log event uretir.

## Excel Urun Sablonu

Ilk satir kolon basliklari olmalidir:

```text
sku,barcode,name,description,brand,category,price,stock,vat_rate,status
```

`status` degerleri:

```text
draft, active, passive
```

## Gelistirici Kontrol Listesi

Detayli kontrol listesi icin [DEVELOPER_CHECKLIST.md](DEVELOPER_CHECKLIST.md) dosyasina bakiniz.

## Katki

Katki akisi ve branch/commit kurallari icin [CONTRIBUTING.md](CONTRIBUTING.md) dosyasina bakiniz.

## Degisiklik Gecmisi

Surum notlari icin [CHANGELOG.md](CHANGELOG.md) dosyasina bakiniz.
