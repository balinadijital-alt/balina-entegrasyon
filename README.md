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
