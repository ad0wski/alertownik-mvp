# LR-8A — Minimum Web Push: design, safety and activation plan (2026-11-12, hardened LR-8A.1 2026-11-13)

Status: code committed locally behind two OFF switches. **Nothing is active on
Production**: no table, no keys, no env, no cron change, no notification
sent. Activation is LR-8B, following §8 below.

## 1. Mechanism

Standard Web Push (Push API + VAPID, RFC 8030/8291/8292). No Firebase/FCM
SDK. LR-8A.1 replaced the LR-8A hand-written crypto with the `web-push`
library (web-push-libs, pinned `3.6.7` — the long-stable line; `4.0.0` was
only 7 days old at review time). `src/lib/push/webPushRequest.ts` calls only
`generateRequestDetails` (encryption + VAPID header); the HTTP POST stays in
`pushSender.ts` on `fetch` with `redirect: "manual"` and a 10 s timeout, after
the endpoint allowlist check, so the library never opens a connection or
reads proxy settings. Tests pin the library: RFC 8291 Appendix A vector on
its encryption layer, decryption in an independent RFC 8291 receiver, and
ES256 verification of the VAPID JWT.

```
visitor sets area → clicks "Włącz powiadomienia dla <miejscowość>"
  → browser permission prompt (only now)
  → PushManager.subscribe(public VAPID key)
  → POST /api/push/subscribe (same-origin, validated, rate-limited)
  → Postgres push_subscribe(gateway token, …) (SECURITY DEFINER: checks the
    token's SHA-256, validates again, global throttle)

admin publishes manually in Builder (publish succeeds first)
  → POST /api/admin/push/alert-published {slug}  (admin bearer token)
  → eligibility: published · water/roads/waste · not ended · locality found
  → per subscription: claim (alert_id, subscription_id) UNIQUE → encrypt → POST to push service
  → 404/410 → subscription disabled; other errors → logged, alert untouched
```

## 2. Platform support (vendor documentation + the real TWA project files; no device test yet)

| Platform | Status |
|---|---|
| Android Chrome, website or installed PWA | Supported (FCM endpoint). |
| Desktop Chrome / Edge / Firefox, Safari macOS 13+ | Supported. |
| iPhone/iPad | Only iOS/iPadOS 16.4+ **and** the site added to the Home Screen; the prompt must come from a tap. The card explains this when Alertownik runs in a Safari tab. |
| Android TWA (Google Play wrapper) | **Compatible by configuration (LR-8A.1 audit of `~/Projects/AndroidTwaProject`, Bubblewrap, android-browser-helper 2.6.2, targetSdk 36):** `enableNotifications: true`; manifest has `POST_NOTIFICATIONS`, `DelegationService` (TrustedWebActivityService) with `SMALL_ICON` = `ic_notification_icon` (5 densities) and `NotificationPermissionRequestActivity`; the built `app-release-bundle.aab` (versionCode 4) contains all of them. Asset Links live on Production. Chrome delegates the page's `Notification.requestPermission()` to the app, which shows the Android 13+ runtime prompt. Still to do in LR-8B: one real-device test with the Play build. |

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
  `push_unsubscribe`, and both refuse (42501) unless the first argument is
  the server-only gateway token (`PUSH_GATEWAY_TOKEN`, Vercel env, never
  `NEXT_PUBLIC_`); only its SHA-256 is stored, in `push_gateway_secret`
  (RLS on, no grant, no policy — not even admins can read it). So the
  public anon key alone can no longer call the RPC and bypass the route's
  rate limit (LR-8A residual risk, closed in LR-8A.1). Then the functions
  validate host allowlist, key format, locality, a global throttle of 60 new
  subscriptions per minute (across all server instances) and a 20 000-row
  ceiling. `push_unsubscribe` returns nothing, so it cannot reveal whether
  an endpoint exists.
- Why a token and not the project's automation-identity pattern (a
  dedicated Supabase Auth account): that pattern signs in with a password
  per run, which is fine for a daily cron but would put a Supabase Auth
  sign-in (and its rate limit) on every cold start of a public endpoint.
  The token gives the same "only our server can call it" property with no
  Auth dependency, no new account, and no service_role.
- authenticated: RLS = `admin_profiles` membership (same rule as alerts).
  The send path runs as the admin who clicked "Opublikuj"; **no
  service_role and no new server credential are needed.**
- SSRF: the server only POSTs to `fcm.googleapis.com`,
  `updates.push.services.mozilla.com`, `web.push.apple.com`,
  `*.notify.windows.com` over https, no redirects, 10 s timeout; checked in
  SQL, at subscribe and again at send.
- Abuse: same-origin check, 4 KB body cap, 20 requests / 10 min per IP
  (per server instance), global 60 new subscriptions / minute and 20 000-row
  ceiling in SQL. A direct RPC call without the token fails.
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
| `PUSH_GATEWAY_TOKEN` | Production (Sensitive) | random ≥ 32 chars; its SHA-256 goes into `push_gateway_secret` |

Key generation (locally, output straight into the Vercel prompt, not into
the chat or a file):
`node -e "const c=require('crypto');const k=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const p=k.publicKey.export({format:'jwk'}),s=k.privateKey.export({format:'jwk'});console.log(Buffer.concat([Buffer.from([4]),Buffer.from(p.x,'base64url'),Buffer.from(p.y,'base64url')]).toString('base64url'));console.error(s.d)"`
(stdout = public key, stderr = private key). Rotating the key pair
invalidates every existing subscription.

Gateway token (locally; stderr = token for Vercel, stdout = hash for SQL):
`node -e "const c=require('crypto');const t=c.randomBytes(32).toString('base64url');console.error(t);console.log(c.createHash('sha256').update(t).digest('hex'))"`
then in the SQL editor:
`insert into public.push_gateway_secret (token_sha256) values (decode('<hex>', 'hex'));`
Rotation: `update public.push_gateway_secret set token_sha256 = decode('<new hex>', 'hex');`
together with the new Vercel value and a redeploy (subscribe fails with 503
in between; nothing is lost).

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

## 7. Second writer run (prepared in vercel.json in LR-8A.1; goes live with the push in LR-8B)

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
- LR-8A.1: the entry is in `vercel.json` (committed locally, not pushed).
  Vercel's cron docs explicitly allow the same path in several entries with
  different schedules. Same route, same CRON_SECRET auth, same
  max-candidates cap from server env, same dedup (an afternoon re-read of a
  notice inserted in the morning is skipped). Auto-publish stays at one
  morning run, so afternoon candidates wait for manual review. It goes
  live when the commit is pushed (LR-8B step 4).

## 7a. SQL integration test (LR-8A.1)

`bash tests/sql/run-push-sql-integration.sh` starts a throwaway
`supabase/postgres:17.6.1.170` (same PostgreSQL 17.6 as Production) +
PostgREST on 127.0.0.1, loads a Production-like baseline
(`tests/sql/lr8a1_prod_like_baseline.sql`: auth.uid(), alerts, admin_profiles,
automation_identities, default ACLs, policies — read from Production
read-only), then applies the migration, the token hash, every access check
(SQL roles and supabase-js through PostgREST), the real route handlers and
send store, the throttle and ceiling, the retention SQL and the rollback
(twice, plus re-apply). Containers are deleted at the end.

## 8. LR-8B activation checklist (do not run in LR-8A)

1. Review this document, the SQL and the diff.
2. Run `PROPOSED_LR8A_PUSH_SUBSCRIPTIONS_V1.sql` manually in the Supabase SQL
   editor; then every query in `VERIFY_LR8A_PUSH_SUBSCRIPTIONS_READ_ONLY_V1.sql`
   (anon: zero table grants; 6 admin policies; 2 SECURITY DEFINER functions).
3. Generate the VAPID pair and the gateway token locally (§5); insert the
   token hash into `push_gateway_secret`; set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_GATEWAY_TOKEN` in Vercel, with
   `PUSH_NOTIFICATIONS_ENABLED` and `NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED`
   still unset.
4. Apply the privacy wording (§6). Push the LR-8A + LR-8A.1 commits (this
   also activates the afternoon writer cron, §7); wait for the deployment.
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
- The per-IP limit is per server instance; the SQL throttle is global.
- One locality per device.
- Localities outside the pilot list (Opacz, Pęcice) cannot be chosen yet.
- TWA: configuration verified (§2); delivery on a real device not yet.
