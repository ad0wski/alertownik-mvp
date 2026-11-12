# LR-8A — Minimum Web Push: design, safety and activation plan (2026-11-12)

Status: code merged locally behind two OFF switches. **Nothing is active on
Production**: no table, no keys, no env, no cron change, no notification
sent. Activation is LR-8B, following §8 below.

## 1. Mechanism

Standard Web Push (Push API + VAPID, RFC 8030/8291/8292). No Firebase/FCM
SDK and no new npm package: encryption (aes128gcm) and the VAPID ES256 JWT
are implemented on `node:crypto` in `src/lib/push/webPushCrypto.ts` and
reproduce the RFC 8291 Appendix A test vector byte for byte.

```
visitor sets area → clicks "Włącz powiadomienia dla <miejscowość>"
  → browser permission prompt (only now)
  → PushManager.subscribe(public VAPID key)
  → POST /api/push/subscribe (same-origin, validated)
  → Postgres push_subscribe() (SECURITY DEFINER, validates again)

admin publishes manually in Builder (publish succeeds first)
  → POST /api/admin/push/alert-published {slug}  (admin bearer token)
  → eligibility: published · water/roads/waste · not ended · locality found
  → per subscription: claim (alert_id, subscription_id) UNIQUE → encrypt → POST to push service
  → 404/410 → subscription disabled; other errors → logged, alert untouched
```

## 2. Platform support (checked against vendor documentation, not on devices)

| Platform | Status |
|---|---|
| Android Chrome, website or installed PWA | Supported (FCM endpoint). |
| Desktop Chrome / Edge / Firefox, Safari macOS 13+ | Supported. |
| iPhone/iPad | Only iOS/iPadOS 16.4+ **and** the site added to the Home Screen; the prompt must come from a tap. The card explains this when Alertownik runs in a Safari tab. |
| Android TWA (Google Play wrapper) | **Not verified.** Chrome delegates TWA notifications to the wrapper app; on Android 13+ the app needs `POST_NOTIFICATIONS`. Whether the existing AAB was built with notification delegation enabled is not visible from this repo. Verify on a device in LR-8B; until then promise push for the web/PWA only. |

Sources: Android 13 notification permission (developer.android.com),
TrustedWebActivityService (developer.android.com), Apple/vendor notes on
iOS 16.4 Home Screen web push.

## 3. Data model (`docs/sql/PROPOSED_LR8A_PUSH_SUBSCRIPTIONS_V1.sql`)

`push_subscriptions`: id, endpoint (unique), p256dh, auth, locality,
enabled, disabled_reason ('gone'), disabled_at, created_at, updated_at.
`push_deliveries`: alert_id, subscription_id (UNIQUE pair), status,
http_status, timestamps.

Sensitive: endpoint + p256dh + auth together allow sending a push to that
browser. Not stored: name, e-mail, phone, account, IP, user agent, GPS.
Categories are fixed in code (water, roads, waste).

Retention: unsubscribe deletes the row (and its deliveries). Rows the push
service reports as gone are disabled at once and deleted after 30 days;
delivery log deleted after 90 days (manual SQL at the end of the file — no
new cron).

## 4. Security

- anon: no table grant, no policy. Only EXECUTE on `push_subscribe` /
  `push_unsubscribe`, which validate host allowlist, key format, locality
  and a 20 000-row ceiling. `push_unsubscribe` returns nothing, so it
  cannot reveal whether an endpoint exists.
- authenticated: RLS = `admin_profiles` membership (same rule as alerts).
  The send path runs as the admin who clicked "Opublikuj"; **no
  service_role and no new server credential are needed.**
- SSRF: the server only POSTs to `fcm.googleapis.com`,
  `updates.push.services.mozilla.com`, `web.push.apple.com`,
  `*.notify.windows.com` over https, no redirects, 10 s timeout; checked in
  SQL, at subscribe and again at send.
- Abuse: same-origin check, 4 KB body cap, 20 requests / 10 min per IP
  (best effort, per server instance), SQL ceiling. Residual: the RPC is
  callable directly with the public anon key; the SQL validation and
  ceiling are the real boundary there.
- Spam: only manual publishes, three categories, one push per alert per
  subscription (unique key, claimed before sending), `Topic` header so an
  undelivered older push for the same alert is replaced.
- Notification click opens only `/alerts/<slug>` on the same origin.

## 5. VAPID / env (set in LR-8B only)

| Variable | Scope | Value |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Production + Preview | public key |
| `VAPID_PRIVATE_KEY` | Production (Sensitive) | private key — never printed, never committed |
| `VAPID_SUBJECT` | Production | `mailto:` contact address |
| `PUSH_NOTIFICATIONS_ENABLED` | Production | `true` to activate; anything else = kill switch |
| `NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED` | Production | `true` to show the opt-in card |

Key generation (locally, output straight into the Vercel prompt, not into
the chat or a file):
`node -e "const c=require('crypto');const k=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const p=k.publicKey.export({format:'jwk'}),s=k.privateKey.export({format:'jwk'});console.log(Buffer.concat([Buffer.from([4]),Buffer.from(p.x,'base64url'),Buffer.from(p.y,'base64url')]).toString('base64url'));console.error(s.d)"`
(stdout = public key, stderr = private key). Rotating the key pair
invalidates every existing subscription.

## 6. Privacy — staged wording for /prywatnosc (apply in LR-8B, with activation)

Replace in "Czego NIE zbieramy" the phrase *„tokenów powiadomień push
(powiadomień jeszcze nie ma)"* and add this item to "Jakie dane mogą być
przetwarzane":

> **Powiadomienia (jeśli je włączysz)** — gdy klikniesz „Włącz powiadomienia",
> przeglądarka tworzy adres subskrypcji i klucze szyfrujące. Zapisujemy je
> razem z wybraną miejscowością, żeby wysyłać powiadomienia o alertach dla tej
> miejscowości (woda, drogi, odpady). Nie zapisujemy imienia, e-maila, numeru
> telefonu ani dokładnej lokalizacji. Treść powiadomienia zawiera tylko
> publiczne informacje z alertu i jest szyfrowana. Wyłączenie powiadomień
> („Wyłącz powiadomienia" w Ustawieniach) usuwa subskrypcję z naszej bazy.
> Jeśli dostawca powiadomień zgłosi, że subskrypcja wygasła, wyłączamy ją
> i usuwamy po 30 dniach. Historię wysyłek przechowujemy do 90 dni.

Add to "Komu powierzamy dane":

> **Dostawcy powiadomień przeglądarki** — powiadomienie trafia do Ciebie przez
> usługę push Twojej przeglądarki (np. Google dla Chrome i Androida, Apple dla
> Safari, Mozilla dla Firefoksa, Microsoft dla Edge). Usługa otrzymuje
> zaszyfrowaną treść i adres subskrypcji; nie zna Twojej miejscowości.

Also adjust "Preferencje lokalne": the locality chosen for notifications
is, unlike "Moja okolica", stored on our server.

## 7. Second writer run (no change made)

- Plan verified via the Vercel API: **Hobby**. Docs: up to 100 cron jobs
  per project, each at most once a day, fired somewhere within the
  scheduled hour. The writer route has no once-a-day guard (its lock is
  concurrency-only).
- 2026 water notices with a known post time (29): posted 08:00–15:59
  local. Simulation, worst case within the hour:

| Runs | after start | < 3 h before start | ≥ 3 h before |
|---|---|---|---|
| 06:21 UTC only (today) | 1 | 15 | 11 |
| + 15:00 UTC | 0 | 1 | 26 |

  (+2 notices posted by the gmina at or after the outage start — no
  schedule helps.)
- Recommended: `{"path": "/api/cron/write-candidates", "schedule": "0 15 * * *"}`
  → 16:00–16:59 in winter (CET), 17:00–17:59 in summer (CEST). Catches every
  notice of the office day and leaves the evening to publish the push.
- Production change required: one `vercel.json` entry (explicit approval
  needed). Two entries with the same path is expected to be accepted; the
  build in LR-8B will confirm it. Fallback if refused: the same path with a
  query string (`/api/cron/write-candidates?run=afternoon`).

## 8. LR-8B activation checklist (do not run in LR-8A)

1. Review this document, the SQL and the diff.
2. Run `PROPOSED_LR8A_PUSH_SUBSCRIPTIONS_V1.sql` manually in the Supabase SQL
   editor; then every query in `VERIFY_LR8A_PUSH_SUBSCRIPTIONS_READ_ONLY_V1.sql`
   (anon: zero table grants; 6 admin policies; 2 SECURITY DEFINER functions).
3. Generate the VAPID pair locally (§5); set the five env vars in Vercel,
   with `PUSH_NOTIFICATIONS_ENABLED` and `NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED`
   still unset.
4. Apply the privacy wording (§6) and, if approved, the second cron (§7).
   Push the LR-8A commit + these changes; wait for the deployment.
5. Set `PUSH_NOTIFICATIONS_ENABLED=true` and
   `NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED=true`; redeploy.
6. Smoke test on the owner's own devices only: Android Chrome (website),
   desktop Chrome, an installed iPhone web app, and the Play/TWA build.
   Subscribe to one locality → publish a real-but-harmless test alert for
   that locality in category water → archive it right after. Check:
   notification arrives, click opens the alert, `push_deliveries` has
   exactly one `sent` row per device, a second "Opublikuj" sends nothing,
   "Wyłącz powiadomienia" deletes the row.
7. Kill switch: set `PUSH_NOTIFICATIONS_ENABLED` to anything but `true` and
   redeploy — subscribe and send stop at once; unsubscribe keeps working.
   Hide the card with `NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED`.
   Full rollback: kill switch, then `ROLLBACK_LR8A_PUSH_SUBSCRIPTIONS_V1.sql`.

## 9. Known limits

- At-most-once: a send that failed after its claim is not retried.
- Rate limiting is per server instance (best effort).
- One locality per device.
- Localities outside the pilot list (Opacz, Pęcice) cannot be chosen yet.
- TWA delivery unverified (§2).
