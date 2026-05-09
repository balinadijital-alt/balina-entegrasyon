# Balina Pazaryeri Entegrasyon Sistemi

Laravel backend ve React + Vite admin panelden olusan moduler pazaryeri entegrasyon iskeleti.

## Moduller

- Kullanici kayit/giris sistemi: Laravel Sanctum token auth
- Firma yonetimi
- Urun yonetimi ve manuel urun ekleme
- Excel ile toplu urun yukleme
- Urun gorsel yukleme
- Trendyol servis altyapisi
- Hepsiburada servis altyapisi
- Siparis yonetimi
- API log sistemi
- Rol/yetki sistemi: Spatie Permission

## Backend

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan storage:link
php artisan serve
```

## Queue ve Worker

Production queue altyapisi Redis + Laravel Horizon ile calisir.

```bash
brew install redis
brew services start redis

cd backend
php artisan migrate
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

Horizon dashboard:

```text
http://localhost:8000/horizon
```

Admin panel Queue ekrani:

```text
http://localhost:5173/queue
```

Varsayilan seed kullanicisi:

```text
admin@balina.local
password
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend varsayilan olarak `http://localhost:8000/api` adresindeki backend API'yi kullanir. Farkli adres icin `frontend/.env` dosyasina sunu ekleyin:

```bash
VITE_API_URL=http://localhost:8000/api
```

## Excel Urun Sablonu

Ilk satir kolon basliklari olmalidir:

```text
sku,barcode,name,description,brand,category,price,stock,vat_rate,status
```

`status` degerleri: `draft`, `active`, `passive`.

## Notlar

Bu ortamda `php` ve `composer` kurulu olmadigi icin backend bagimliliklari burada indirilemedi veya migrationlar calistirilamadi. Dosya yapisi Laravel 11 akisi icin hazirlandi; PHP/Composer olan ortamda yukaridaki komutlarla kurulabilir.
