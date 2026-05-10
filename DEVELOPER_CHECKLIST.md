# Developer Checklist

Bu liste local gelistirme ve VPS oncesi kalite kontrol icin kullanilir.

## Local Ortam

- [ ] `backend/.env` olusturuldu
- [ ] `APP_KEY` uretildi
- [ ] `php artisan migrate --seed` calisti
- [ ] Demo veri gerekiyorsa `php artisan db:seed --class=DemoSeeder` calisti
- [ ] `php artisan serve` calisiyor
- [ ] `npm run dev` calisiyor
- [ ] Login `admin@balina.local / password` ile test edildi

## Backend

- [ ] Yeni endpoint route'a eklendi
- [ ] Controller validasyonu var
- [ ] Service/job sinirlari temiz
- [ ] Hassas alanlar encrypted veya hidden
- [ ] API loglarinda secret alan yok
- [ ] Queue job retry/backoff degerleri uygun
- [ ] Schedule gerekiyorsa `schedule:list` icinde gorunuyor

## Frontend

- [ ] API cagirilari `api/client.js` katmanindan yapiliyor
- [ ] Loading state var
- [ ] Error state var
- [ ] Bos ekran profesyonel gorunuyor
- [ ] Toast feedback var
- [ ] Responsive kontrol edildi
- [ ] Uzun metinler layout'u bozmuyor

## Test ve Kalite

- [ ] `composer test` temiz
- [ ] `npm run build` temiz
- [ ] `./scripts/quality-check.sh` temiz
- [ ] `php artisan route:list` beklenen route'lari gosteriyor
- [ ] `php artisan list balina` operasyon komutlarini gosteriyor
- [ ] `php artisan list demo` demo komutlarini gosteriyor

## Demo

- [ ] `php artisan demo:reset --seed` calisiyor
- [ ] Dashboard metrikleri dolu geliyor
- [ ] Demo firma listeleniyor
- [ ] Demo urunler listeleniyor
- [ ] Demo siparis, kargo, odeme ve fatura kayitlari gorunuyor
- [ ] API log ekrani demo loglari gosteriyor

## Deploy Oncesi

- [ ] `.env.example` yeni env anahtarlarini iceriyor
- [ ] README guncel
- [ ] CHANGELOG guncel
- [ ] Backup komutu test edildi
- [ ] Restore komutu test edildi
- [ ] `/api/health` healthy donuyor
- [ ] `APP_DEBUG=false` ile smoke test yapildi
- [ ] Redis queue ve Horizon calisiyor
- [ ] Supervisor ve cron hazir
