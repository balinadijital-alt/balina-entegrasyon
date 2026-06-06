# Release Hardening

Bu dokuman production release oncesi guvenlik, saglik ve rollback kontrollerini tanımlar. Gercek deploy komutu veya provider islemi icermez.

## Release Gate

Release aday commit icin zorunlu kontroller:

- `git diff --check`
- `cd backend && ./vendor/bin/phpunit`
- `npm run build --prefix frontend`
- `cd frontend && npm run test:e2e:smoke`
- `./scripts/quality-check.sh`
- Migration listesi incelendi
- Rollback commit SHA not edildi
- Database backup alindi
- Production `.env` ve frontend `VITE_API_URL` dogrulandi

## Runtime Gate

Deploy sonrasi release tamamlanmis sayilmadan once:

```bash
./scripts/deploy-health-check.sh https://api.example.com
```

Beklenen:

- `/api/health/ready` HTTP 200
- `status=healthy`
- `checks.database=ok`
- `checks.cache=ok`
- `checks.queue=ok`
- `checks.storage=ok`
- Queue backlog ve failed job sayisi operasyonel esiklerin altinda

## Webhook Gate

- Trendyol webhook timestamp ve signature dogrulamasi aktif
- Invalid signature kaydi `inbound_webhook_deliveries` icinde gorunuyor
- Duplicate/replay delivery order'i ikinci kez islemiyor
- Payload limit asimi 413 donuyor
- JSON olmayan payload reddediliyor
- Unknown supplier loglaniyor ama order olusturmuyor

## Payment Callback Gate

- `GET /api/payment-callbacks/{payment}` kabul edilmiyor
- Production hesaplarinda callback secret bos degil
- Raw body HMAC dogrulamasi aktif
- Timestamp toleransi `±5 dakika`
- Replay callback ikinci kez payment status degistirmiyor
- Callback loglari sensitive alanlari maskeliyor

## Observability Gate

- Her API response `X-Request-Id` ve `X-Correlation-Id` header'lari tasiyor
- ApiLog, AuditLog, PaymentLog ve webhook delivery kayitlari request/correlation id sakliyor
- Error triage icin request id loglarda aranabilir
- Queue dashboard tenant icin scoped, super admin icin global failed jobs gosteriyor

## Rollback Gate

Rollback hazirligi:

- Onceki iyi commit SHA
- DB backup dosyasi ve restore proseduru
- Onceki frontend build veya release dizini
- Horizon terminate proseduru
- `/api/health/ready` healthy olana kadar rollback tamamlanmis sayilmaz

Migration veri uyumsuzlugunda once backup restore plani uygulanir; migration rollback tek basina yeterli kabul edilmez.
