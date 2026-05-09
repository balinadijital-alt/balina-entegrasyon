# Balina Pazaryeri Entegrasyon Sistemi

Laravel backend ve React + Vite admin panelden olusan moduler pazaryeri entegrasyon sistemi.

## Moduller

- Sanctum tabanli kullanici kayit/giris sistemi
- Firma, urun, siparis, rol/yetki ve API log yonetimi
- Excel/XML import merkezi, alan eslestirme, queue import ve hata raporlari
- Trendyol ve Hepsiburada pazaryeri servis altyapilari
- Kargo, sanal POS, e-fatura/e-arsiv, muhasebe/cari altyapilari
- SaaS paket, abonelik, lisans ve partner yonetimi
- Redis queue, Horizon dashboard, failed job retry ve scheduled task altyapisi

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

Varsayilan seed kullanicisi:

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

Frontend varsayilan olarak `http://localhost:8000/api` adresindeki backend API'yi kullanir. Farkli adres icin `frontend/.env` dosyasina sunu ekleyin:

```bash
VITE_API_URL=http://localhost:8000/api
```

## Test ve Kalite Kontrol

```bash
cd backend
composer test

cd ../frontend
npm run build

./scripts/quality-check.sh
```

## Queue ve Worker

Production queue altyapisi Redis + Laravel Horizon ile calisir.

```bash
brew install redis
brew services start redis

cd backend
php artisan horizon
```

Scheduler icin production cron girdisi:

```cron
* * * * * cd /path/to/balina-entegrasyon/backend && php artisan schedule:run >> /dev/null 2>&1
```

Supervisor ile Horizon calistirma ornegi:

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

## Health Check

```text
GET /api/health
```

Database, cache, queue ve storage kontrollerini dondurur.

## Backup / Restore

SQLite kurulumlar icin:

```bash
cd backend
php artisan balina:backup
php artisan balina:restore storage/app/backups/database-YYYYmmdd-HHMMSS.sqlite --force
```

MySQL production ortaminda `mysqldump` veya managed database backup kullanin. Uygulama loglari scheduler ile her gun `balina:prune-logs --days=30` komutuyla temizlenir.

## Deployment Checklist

- `APP_ENV=production`, `APP_DEBUG=false`, guclu `APP_KEY`
- Production DB ve otomatik backup
- Redis cache/queue/Horizon aktif
- `php artisan migrate --force`
- `php artisan storage:link`
- `php artisan config:cache && php artisan route:cache`
- Supervisor ile `php artisan horizon`
- Cron ile `php artisan schedule:run`
- `composer test` ve `npm run build` temiz
- `/api/health` healthy
- Marketplace, kargo, POS ve muhasebe credential alanlari encrypted girildi
- HTTPS, HSTS ve reverse proxy headerlari aktif
- Failed job retry, backup restore ve log retention proseduru test edildi

## Guvenlik

- Login endpointinde rate limit ve brute-force korumasi vardir.
- API response security headerlari eklenir.
- Hassas alanlar API loglarindan haric tutulur.
- Token auth Laravel Sanctum ile yapilir.

## Excel Urun Sablonu

Ilk satir kolon basliklari olmalidir:

```text
sku,barcode,name,description,brand,category,price,stock,vat_rate,status
```

`status` degerleri: `draft`, `active`, `passive`.
