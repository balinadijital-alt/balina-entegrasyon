# Production Checklist

Bu checklist Balina uygulamasi canliya alinmadan once uygulanacak manuel kontrolleri listeler. Deploy otomasyonu veya sunucuya baglanti komutu icermez.

## Env Checklist

- `APP_ENV=production`
- `APP_DEBUG=false`
- `APP_KEY` guclu ve bos degil
- `APP_URL` public backend URL
- `FRONTEND_URL` public frontend URL
- `APP_TIMEZONE=Europe/Istanbul`
- `LOG_LEVEL=info`
- `LOG_DAILY_DAYS` retention politikasina uygun
- `ERROR_MONITORING_DSN` kullaniliyorsa dogru
- `.env` dosyasi public web root altinda degil

## DB / Redis / Queue

- Production database ayri ve backup kapsaminda
- `DB_CONNECTION=mysql` veya production icin secilen driver
- `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` dogru
- Redis erisilebilir
- `CACHE_STORE=redis`
- `QUEUE_CONNECTION=redis`
- `REDIS_CLIENT=predis`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` dogru
- Failed jobs tablosu migration ile hazir

## Migration Oncesi Backup

Migration calistirmadan once backup alin:

```bash
mysqldump -u <user> -p <database> > balina-before-deploy.sql
```

PostgreSQL kullaniliyorsa:

```bash
pg_dump <database> > balina-before-deploy.sql
```

Kontroller:

- Backup dosyasi olustu
- Backup dosyasi bos degil
- Restore proseduru biliniyor
- Deploy commit SHA not edildi

## Credential Kontrolu

Marketplace:

- Trendyol production `supplier_id`, `api_key`, `api_secret`
- Hepsiburada production merchant credentiallari
- Stage/test credentiallari production'a karismamis

Kargo:

- Yurtici
- Aras
- MNG
- Surat
- PTT
- Hepsijet
- Trendyol Express

Odeme:

- iyzico
- PayTR
- Param
- Sipay
- Paynet
- banka POS

Muhasebe:

- Parasut
- Logo
- Mikro
- Nebim
- QNB e-Finans

Tum hassas degerler `.env` veya encrypted uygulama alanlarinda tutulmali; dokumanlara veya commitlere yazilmamalidir.

## Storage / Permission

Backend icin:

```bash
php artisan storage:link
```

Yazilabilir dizinler:

- `backend/storage`
- `backend/bootstrap/cache`

Ornek:

```bash
sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R ug+rw storage bootstrap/cache
```

## Frontend `VITE_API_URL`

Build oncesi kontrol:

```env
VITE_API_URL=https://api.example.com/api
```

Kontroller:

- URL `/api` ile bitiyor
- HTTPS kullaniyor
- Production backend domain'ini gosteriyor
- Staging API URL'i production build'e karismamis

## Horizon / Scheduler

Horizon:

- Supervisor config hazir
- `php artisan horizon` Supervisor tarafindan calisiyor
- Deploy sonrasi `php artisan horizon:terminate` calistiriliyor
- Horizon dashboard erisimi sadece yetkili adminlerde

Scheduler:

```cron
* * * * * cd /path/to/balina-entegrasyon/backend && php artisan schedule:run >> /dev/null 2>&1
```

Kontroller:

- Cron aktif
- `php artisan schedule:list` beklenen komutlari gosteriyor
- Redis queue backlog izleniyor
- Failed jobs prune ve log prune calisiyor

## Health Check

Deploy sonrasi:

```bash
./scripts/deploy-health-check.sh https://api.example.com
```

veya:

```bash
curl -fsS https://api.example.com/api/health/live
curl -fsS https://api.example.com/api/health/ready
```

Beklenen:

- HTTP 200
- `status` degeri `healthy`
- `database`, `cache`, `queue`, `storage` kontrolleri `ok`
- `queue.backlog` ve `queue.failed_jobs` alanlari gorunur
- `scheduler.last_run_at` cron calistiktan sonra dolu olur

## Webhook / Callback Security

- Trendyol inbound webhook secret her aktif hesapta tanimli
- Inbound webhook istekleri `Content-Type: application/json` ile geliyor
- Inbound webhook istekleri `X-Timestamp`, `X-Balina-Timestamp` veya `X-Trendyol-Timestamp` tasiyor
- Timestamp toleransi `±5 dakika`
- Eski veya ileri timestamp `expired_signature` olarak reddediliyor
- Payload limiti `256 KB`
- Duplicate veya replay delivery kayitlari tekrar order islemiyor
- Odeme callback endpointi sadece `POST`
- Production odeme hesaplarinda `webhook_secret` veya `api_secret` tanimli
- Odeme callback imzasi raw body uzerinden dogrulaniyor
- Odeme callback status degeri whitelist icinde: `paid`, `failed`, `pending`, `cancelled`, `refunded`
- Odeme callback replay/idempotency log kaydiyla engelleniyor
- Webhook ve callback loglarinda request/correlation id gorunur
- Outbound webhook URL'leri HTTPS ve public hedef olmalidir; localhost/private/metadata hedefleri reddedilir

## Smoke Test

Canli oncesi minimum smoke:

- Login ekrani aciliyor
- API health healthy
- Dashboard beyaz ekrana dusmuyor
- Orders listesi aciliyor
- Queue sayfasi aciliyor
- Settings sayfasi aciliyor
- Marketplace hesap testleri kontrollu calisiyor
- Webhook test endpointi staging/production hedefiyle dogrulaniyor

Local kalite zinciri deploy oncesi temiz olmali:

```bash
./scripts/quality-check.sh
```

Release hardening detaylari icin `docs/RELEASE_HARDENING.md` izlenmelidir.

## Rollback Hazirligi

Deploy baslamadan once:

- Onceki iyi commit SHA not edildi
- Database backup alindi
- `.env` yedeklendi
- `storage` dizini korunuyor
- Onceki frontend build veya release dizini korunuyor
- Rollback sorumlusu belli

Rollback sirasinda:

- Onceki release veya commit'e don
- Backend cacheleri yeniden olustur
- Frontend build'i onceki iyi surume dondur
- `php artisan horizon:terminate` calistir
- `/api/health` healthy olana kadar deploy tamamlanmis sayma

Migration kaynakli veri uyumsuzlugunda migration rollback yerine backup restore tercih edilmelidir.
