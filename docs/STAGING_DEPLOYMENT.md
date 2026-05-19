# Staging / VPS Deployment Hazirligi

Bu dokuman Balina uygulamasini staging veya VPS ortaminda manuel olarak hazirlamak icin kullanilir. Gercek deploy otomasyonu, Docker, Kubernetes veya GitHub Actions deploy adimi icermez.

## VPS / Staging Prerequisites

- Ubuntu tabanli guncel bir VPS veya benzer Linux ortam
- PHP 8.3+ ve gerekli extensionlar: `mbstring`, `xml`, `ctype`, `fileinfo`, `openssl`, `pdo_mysql`, `redis`
- Composer
- Node.js 24 veya repo ile uyumlu guncel Node surumu
- npm
- MySQL veya uyumlu production database
- Redis
- Nginx
- PHP-FPM
- Supervisor
- Cron
- HTTPS sertifikasi
- Repo icin read access

Staging ortami production'a benzemeli, ancak ayri domain, ayri database, ayri Redis prefix/DB ve test servis credentiallari kullanmalidir.

## Backend Kurulum / Update

Ornek dizinler:

```bash
/var/www/balina-entegrasyon
/var/www/balina-entegrasyon/backend
/var/www/balina-entegrasyon/frontend
```

Ilk kurulum:

```bash
cd /var/www/balina-entegrasyon
git clone <repo-url> .

cd backend
composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist
cp .env.production.example .env
php artisan key:generate
php artisan migrate --force
php artisan storage:link
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Update akisi:

```bash
cd /var/www/balina-entegrasyon
git fetch origin
git checkout main
git pull --ff-only origin main

cd backend
composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist
php artisan optimize:clear
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan horizon:terminate
```

Migration calistirmadan once database backup alinmalidir.

## Frontend Build / Deploy

Frontend build-time API URL kullanir. Staging icin `VITE_API_URL` dogru API adresini gostermelidir.

```bash
cd /var/www/balina-entegrasyon/frontend
cp .env.production.example .env.production
npm ci
npm run build
```

Nginx static root olarak `frontend/dist` dizini kullanilabilir. Ayrik panel domain'i onerilir:

```text
panel-staging.example.com -> /var/www/balina-entegrasyon/frontend/dist
api-staging.example.com   -> /var/www/balina-entegrasyon/backend/public
```

## Nginx / PHP-FPM Varsayimlari

Backend icin document root:

```text
/var/www/balina-entegrasyon/backend/public
```

Frontend icin document root:

```text
/var/www/balina-entegrasyon/frontend/dist
```

Backend PHP istekleri PHP-FPM'e yonlendirilmelidir. Frontend SPA route'lari icin `try_files $uri /index.html;` davranisi gerekir.

Reverse proxy / HTTPS arkasinda:

- `APP_URL` public backend URL ile ayni olmali
- `FRONTEND_URL` public frontend URL ile ayni olmali
- HTTPS aktif olmali
- PHP-FPM kullanicisi `storage` ve `bootstrap/cache` dizinlerine yazabilmeli

## Storage / Link / Permission

Backend tarafinda:

```bash
cd /var/www/balina-entegrasyon/backend
php artisan storage:link
sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R ug+rw storage bootstrap/cache
```

Release dizin modeli kullaniliyorsa su dizinler shared tutulmalidir:

- `backend/.env`
- `backend/storage`
- `backend/public/storage`

## Redis / Queue / Horizon / Supervisor

Production benzeri ortamda queue Redis ile calismalidir:

```env
CACHE_STORE=redis
QUEUE_CONNECTION=redis
REDIS_CLIENT=predis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

Horizon Supervisor ile calistirilmalidir:

```ini
[program:balina-horizon]
process_name=%(program_name)s
command=php /var/www/balina-entegrasyon/backend/artisan horizon
directory=/var/www/balina-entegrasyon/backend
autostart=true
autorestart=true
user=www-data
redirect_stderr=true
stdout_logfile=/var/log/balina-horizon.log
stopwaitsecs=3600
```

Supervisor reload:

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl restart balina-horizon
```

Deploy/update sonrasinda `php artisan horizon:terminate` calistirilmalidir. Supervisor yeni Horizon surecini baslatir.

## Scheduler Cron

Laravel scheduler her dakika calismalidir:

```cron
* * * * * cd /var/www/balina-entegrasyon/backend && php artisan schedule:run >> /dev/null 2>&1
```

Scheduler su isleri tetikler:

- Trendyol siparis senkronizasyonu
- Trendyol stok/fiyat senkronizasyonu
- Hepsiburada siparis senkronizasyonu
- Hepsiburada stok/fiyat senkronizasyonu
- Zamanlanmis XML importlari
- Horizon snapshot
- failed job ve log temizligi

## Health Check Dogrulama

Backend API health endpoint:

```text
GET /api/health
```

Manuel kontrol:

```bash
curl -fsS https://api-staging.example.com/api/health
```

Repo helper scripti:

```bash
./scripts/deploy-health-check.sh https://api-staging.example.com
```

Beklenen sonuc:

```json
{
  "status": "healthy"
}
```

Health check `database`, `cache`, `queue` ve `storage` kontrollerini de dondurur. `status` healthy degilse deploy tamamlanmis sayilmamalidir.

## Staging Ozel Uyarilar

- `APP_ENV=staging` kullanilabilir, ancak `APP_DEBUG=false` kalmalidir.
- Staging ayri database kullanmalidir.
- Staging ayri Redis prefix veya Redis DB kullanmalidir.
- Marketplace, kargo, odeme ve muhasebe credentiallari test/stage ortam credentiallari olmalidir.
- Webhook endpointleri staging URL'lerine gitmelidir.
- Production kullanici verisi staging'e tasinacaksa maskeleme/anonymization uygulanmalidir.
- Demo seed staging'de sadece bilincli olarak calistirilmelidir; production'da calistirilmamalidir.

## Rollback Ozeti

Rollback hazirligi:

- Deploy oncesi commit SHA kaydedilir.
- Deploy oncesi database backup alinir.
- Onceki frontend build veya onceki release dizini korunur.
- `.env` ve `storage` shared kalir.

Rollback adimlari:

```bash
cd /var/www/balina-entegrasyon
git checkout <previous-good-sha>

cd backend
composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan horizon:terminate

cd ../frontend
npm ci
npm run build
```

Migration sonrasi veri uyumsuzlugu varsa migration rollback yerine deploy oncesi alinan database backup restore edilmelidir.
