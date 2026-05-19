# Staging Runtime Verification

Bu dokuman gercek staging/VPS deploy oncesinde ve deploy sonrasinda runtime servislerini dogrulamak icin kullanilir. Deploy otomasyonu, sunucu baglantisi, Docker/Kubernetes veya GitHub Actions deploy adimi icermez.

## Dogrulama Matrisi

| Alan | Otomatik kontrol | Manuel kontrol | Basari kriteri |
| --- | --- | --- | --- |
| API health | `scripts/staging-runtime-check.sh` | `curl /api/health` | HTTP 200 ve `status=healthy` |
| Database | `/api/health` | staging DB connection bilgileri | `checks.database=ok` |
| Cache | `/api/health` | Redis loglari | `checks.cache=ok` |
| Queue | `/api/health`, token varsa `/api/queue/status` | Horizon dashboard | `checks.queue=ok`, Redis connected |
| Horizon | - | `php artisan horizon:status`, Supervisor status | Horizon aktif |
| Scheduler | - | `php artisan schedule:list`, cron kontrolu | Schedule list dogru, cron dakikada bir calisiyor |
| Storage | `/api/health` sinirli kontrol | permission ve symlink kontrolu | `storage:link` var, yazilabilir dizinler dogru |
| Frontend API URL | `scripts/check-frontend-env.sh` | browser network panel | dist icinde staging API URL var, local fallback yok |
| Webhook delivery | token varsa panel/API kontrolu | Settings webhook test | Delivery log olusuyor, status gorunuyor |
| Smoke routes | local Playwright smoke | staging browser smoke | Kritik route'lar beyaz ekrana dusmuyor |

## API Health Kontrolu

Public API base URL ile calistirilir:

```bash
./scripts/staging-runtime-check.sh https://api-staging.example.com
```

Script su endpointi kontrol eder:

```text
GET /api/health
```

Beklenen minimum response:

```json
{
  "status": "healthy",
  "checks": {
    "database": "ok",
    "cache": "ok",
    "queue": "ok",
    "storage": "ok"
  }
}
```

`status` healthy degilse staging runtime hazir kabul edilmez.

## Redis / Cache / Queue Kontrolu

`/api/health` icindeki alanlar ilk kontrol seviyesidir:

- `checks.cache`
- `checks.queue`

Opsiyonel authenticated kontrol icin token verilebilir:

```bash
BALINA_API_TOKEN=<token> ./scripts/staging-runtime-check.sh https://api-staging.example.com
```

Token verildiginde script su endpointi de cagirir:

```text
GET /api/queue/status
```

Beklenen:

- HTTP 200
- Redis alanlari response icinde gorunur
- Queue stats response icinde gorunur

Bu kontrol job tuketimini garanti etmez; yalnizca API'nin queue durumunu okuyabildigini dogrular.

## Horizon Dogrulama

Horizon dogrulamasi sunucu tarafinda manuel kalmalidir:

```bash
cd /var/www/balina-entegrasyon/backend
php artisan horizon:status
```

Supervisor ile:

```bash
sudo supervisorctl status balina-horizon
```

Basari kriteri:

- Horizon aktif
- Supervisor process running
- Queue listesi beklenen kuyruklari iceriyor:
  - `marketplace-sync`
  - `imports`
  - `shipping`
  - `payments`
  - `accounting`
  - `notifications`
  - `default`

Deploy/update sonrasi:

```bash
php artisan horizon:terminate
```

Supervisor yeni Horizon surecini baslatmalidir.

## Scheduler / Cron Dogrulama

Schedule list:

```bash
cd /var/www/balina-entegrasyon/backend
php artisan schedule:list
```

Cron kaydi:

```cron
* * * * * cd /var/www/balina-entegrasyon/backend && php artisan schedule:run >> /dev/null 2>&1
```

Basari kriteri:

- `trendyol:sync-orders` listede
- `trendyol:sync-price-inventory` listede
- `hepsiburada:sync-orders` listede
- `hepsiburada:sync-price-inventory` listede
- `imports:dispatch-due-xml` listede
- `horizon:snapshot` listede
- prune komutlari listede

Cron'un calistigi sunucu loglari veya queue etkisiyle dogrulanmalidir.

## Storage Permission Kontrolu

Manuel kontroller:

```bash
cd /var/www/balina-entegrasyon/backend
php artisan storage:link
ls -la public/storage
ls -ld storage bootstrap/cache
```

Basari kriteri:

- `public/storage` symlink var
- PHP-FPM kullanicisi `storage` dizinine yazabiliyor
- PHP-FPM kullanicisi `bootstrap/cache` dizinine yazabiliyor
- Log dosyasi yazilabiliyor

Ornek permission:

```bash
sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R ug+rw storage bootstrap/cache
```

## Frontend `VITE_API_URL` Dogrulama

Build oncesi:

```env
VITE_API_URL=https://api-staging.example.com/api
```

Build sonrasi dist artifact kontrolu:

```bash
./scripts/check-frontend-env.sh frontend/dist https://api-staging.example.com/api
```

Script sunlari dogrular:

- `frontend/dist` var
- Beklenen API URL build artifact icinde var
- `127.0.0.1:8000/api` kalmamis
- `localhost:8000/api` kalmamis

Bu kontrol build-time env hatalarini staging'e cikmadan yakalamak icindir.

## Webhook Delivery Dogrulama

Settings ekraninda webhook endpoint ve secret staging degerleriyle kaydedilir. Ardindan:

- `Webhook test et` butonu calistirilir
- Delivery log panelinde yeni kayit gorulur
- Status, attempts, HTTP code ve response body kontrol edilir

Basari kriteri:

- Test request signed header ile gider
- Delivery log kaydi olusur
- Basarili endpoint icin `delivered`
- Hatali endpoint icin hata statusu ve last error gorunur

Webhook endpointi production disi staging hedefe gitmelidir.

## Smoke Route Kontrolu

Mevcut Playwright smoke local preview server icin tasarlanmistir:

```bash
cd frontend
npm run test:e2e:smoke
```

Staging icin manuel browser smoke:

- `/dashboard`
- `/operations`
- `/marketplaces`
- `/imports`
- `/orders`
- `/shipping`
- `/payments`
- `/accounting`
- `/saas`
- `/settings`
- `/queue`
- `/api-logs`
- `/resources`

Basari kriteri:

- Route acilir
- Shell ve content gorunur
- Beyaz ekran yok
- Console runtime crash yok
- 401 durumunda login/auth akisina kontrollu doner

## Manuel Kalmasi Gereken Kontroller

- Nginx server block dogrulama
- PHP-FPM pool ve user dogrulama
- Supervisor process status
- `php artisan horizon:status`
- `php artisan schedule:list`
- Cron kaydinin gercekten her dakika calismasi
- Database backup ve restore provasi
- Storage ownership ve symlink
- Marketplace/kargo/odeme/muhasebe gercek credential testleri
- Provider inbound webhook callback testi
- Horizon dashboard admin erisimi

## Failure Triage

### `/api/health` HTTP fail

- Nginx backend root `backend/public` mi?
- PHP-FPM calisiyor mu?
- `.env` okunuyor mu?
- `APP_KEY` var mi?
- Laravel log dosyasi yazilabiliyor mu?

### `status` degraded

- `checks.database=failed`: DB host, credential, migration durumu
- `checks.cache=failed`: Redis host/port/password, `CACHE_STORE`
- `checks.queue=failed`: `QUEUE_CONNECTION`, Redis queue connection
- `checks.storage=failed`: storage permission ve symlink

### `/api/queue/status` fail

- Token gecerli mi?
- Kullanici tenant/company kapsaminda mi?
- Redis erisilebilir mi?
- Horizon/queue tablolarinda beklenen data var mi?

### Horizon inactive

- Supervisor config dogru mu?
- `php artisan horizon` komutu dogru dizinde mi?
- Redis baglantisi dogru mu?
- `storage/logs` yazilabilir mi?

### Scheduler calismiyor

- Cron kaydi dogru kullanici altinda mi?
- Proje dizini dogru mu?
- `php artisan schedule:run` manuel calisiyor mu?
- Server timezone beklenen degerde mi?

### Frontend yanlis API'ye gidiyor

- `VITE_API_URL` build oncesi dogru mu?
- `npm run build` dogru env ile tekrar calisti mi?
- Nginx eski dist artifact servis ediyor olabilir mi?
- `scripts/check-frontend-env.sh` local fallback yakaliyor mu?

### Webhook delivery hatali

- Webhook endpoint staging hedef mi?
- Secret kayitli mi?
- Karsi endpoint HMAC imzayi bekledigi formatta dogruluyor mu?
- Delivery log response code ve body ne diyor?

## Minimum Staging Runtime Komut Sirasi

```bash
./scripts/staging-runtime-check.sh https://api-staging.example.com
./scripts/check-frontend-env.sh frontend/dist https://api-staging.example.com/api
```

Token ile queue kontrolu:

```bash
BALINA_API_TOKEN=<token> ./scripts/staging-runtime-check.sh https://api-staging.example.com
```

Bu kontroller basarili olmadan staging hazir kabul edilmemelidir.
