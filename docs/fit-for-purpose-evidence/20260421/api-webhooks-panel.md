# T2418 / T2419 — API & Webhooks Panel Evidence

**Date:** 2026-04-21
**Commits:**

- `b6a0c800` — T2418-B Event Feed tab
- `7b783a3f` — T2418-C Outbound webhook dispatcher + WebhooksSection UI
- `118ca293` — T2419-C First-run SSH key/trust bootstrap
- `9fa417bd` — T2419-D/E/F Web SSH tab UI + XTermTerminal + Advanced form
- `0e200876` — T2419-B FastAPI WebSocket route `/ws/ssh`
- `23b73b8e` — T2419-A asyncssh Web SSH bridge service
- `908fddfe` — T2418-D `POST /api/platform-events/test`
- `4939f85e` — T2418-A StandalonePanel scaffold

## Build Artifacts

```
ApiWebhooksPage-1tEjj2Pn.js   379.03 kB  gzip 99.90 kB   (T2418-C live build)
ApiWebhooksPage-CR_Gcc6C.js   379.03 kB  gzip 99.91 kB   (T2418-C pre-hoist build)
```

## Tests

### Backend (pytest)

| Suite                                          | Result  |
| ---------------------------------------------- | ------- |
| `tests/test_webhook_dispatcher.py`             | 9 PASS  |
| `tests/test_platform_event_routes.py`          | 6 PASS  |
| `tests/test_platform_event_bus.py`             | 5 PASS  |
| **Combined for T2418-B/C/D:**                  | **20 PASS** |

### Frontend (jest)

| Suite                                              | Result |
| -------------------------------------------------- | ------ |
| `web/src/app/pages/ApiWebhooksPage/ApiWebhooksPage.test.tsx` | 2 PASS |
| `web/src/app/pages/ApiWebhooksPage/EventFeedTab.test.tsx`    | 4 PASS |
| `web/src/app/pages/ApiWebhooksPage/WebhooksSection.test.tsx` | 4 PASS |
| `web/src/app/pages/ApiWebhooksPage/WebSshTab.test.tsx`       | 4 PASS |
| `web/src/app/components/WebSsh/sshTrustBootstrap.test.ts`    | 4 PASS |
| **Combined for T2418 + T2419:**                              | **18 PASS** |

## Live Backend Smoke Test (localhost:8080)

```
GET  /api/webhooks                       → 200 {"targets":[],"count":0}
POST /api/webhooks {url,secret,filter,…} → 201 {id,url,filter,…,has_secret:true}
GET  /api/webhooks/{id}/deliveries        → 200 {deliveries:[],count:0}
DELETE /api/webhooks/{id}                 → 204
GET  /api/webhooks (after delete)        → 200 {"targets":[],"count":0}
```

## Live Web Bundle (localhost:3000)

```
GET  /                                    → 200 index-xsh-oOVh.js / index-B2lLA_J2.css
GET  /assets/ApiWebhooksPage-1tEjj2Pn.js → 200
```

## Architectural Notes

- Webhook targets + delivery log persisted to `/var/lib/map2/webhooks.db`
  (durable service plane per Configuration Authority Model).
- `WebhookDispatcherService.start()` is wired into the backend FastAPI
  lifespan via `safe_start_service` in `app/main.py`.
- HMAC-SHA256 signing header format: `X-Map2-Signature: sha256=<hex>` (only
  when a secret is configured on the target).
- Retry policy: up to 3 attempts, exponential backoff 0.5s → 1.0s between
  attempts, every attempt recorded in the delivery log regardless of outcome.
- `EventFeedTab` mounts `<WebhooksSection />` below the event table so the
  Webhooks subsection lives inside the Event Feed tab as specified.

## Screen Capture

A headless browser is not installed on this host. A live, operator-captured
PNG snapshot at `docs/fit-for-purpose-evidence/20260421/api-webhooks-panel.png`
can be added during the next session with a visible browser.
