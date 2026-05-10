# Contributing

Bu proje Laravel backend ve React admin panelden olusan moduler bir entegrasyon sistemidir. Degisiklik yaparken mevcut servis, controller, job ve frontend sayfa desenlerini koruyun.

## Gelistirme Akisi

1. Repo guncelken yeni branch acin.
2. Backend degisiklikleri icin migration, model, controller, service ve test etkisini birlikte degerlendirin.
3. Frontend degisiklikleri icin API servis katmanini `frontend/src/api/client.js` uzerinden kullanin.
4. Yeni endpointler icin loading, hata ve bos durum davranisini unutmayin.
5. Commit oncesi kalite komutunu calistirin.

```bash
./scripts/quality-check.sh
```

## Kod Standartlari

- Backend modullerini servis siniflariyla ayirin.
- Controller'larda validasyon ve response akislarini sade tutun.
- Credential alanlarini encrypted cast ile saklayin.
- Queue ile calisan operasyonlarda retry/backoff ve log kaydi kullanin.
- Frontend'de tekrar eden API erisimlerini axios servis katmanina ekleyin.
- Bos ekran, loading, hata ve toast davranislari profesyonel gorunmelidir.

## Test Beklentisi

- API davranisi degisiyorsa feature test ekleyin veya mevcut testi guncelleyin.
- Kritik operasyonlar icin en azindan happy-path ve yetkisiz/validasyon senaryolari dusunulmelidir.
- Build gecmeden PR/commit kapatilmaz.

## Commit Mesajlari

Kisa ve emir kipine yakin mesajlar tercih edilir:

```text
dashboard raporlarini demo veriyle bagla
hepsiburada kategori sync hatasini duzelt
urun import validasyon testlerini ekle
```

## Pull Request Kontrolu

- `composer test` temiz
- `npm run build` temiz
- Migration geriye uyumlu
- `.env.example` gerekiyorsa guncel
- README veya ilgili dokuman gerekiyorsa guncel
- Hassas veri loglanmiyor
- Queue/schedule etkisi acik

## Guvenlik

API key, secret, sifre, webhook secret ve token degerleri commitlenmez. Ornek degerler sadece `.env.example` icinde placeholder olarak tutulur.
