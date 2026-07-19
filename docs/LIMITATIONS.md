# Current Limitations

This document describes what Alertownik does not yet do. It is intended to be read alongside the demo guide and project status, and to support honest communication with reviewers, collaborators, and pilot testers.

These are not design failures — they are intentional deferrals. Each limitation reflects a deliberate choice to keep the MVP scope small while validating the core idea.

**Updated June 2026 (Sprint 70)** — the sections below previously described a pre-Supabase, localStorage-only version of the app (no backend, no auth, sample data on the homepage). That version no longer exists; this rewrite reflects what's actually deployed today.

---

## No Automatic Source Monitoring

There is no mechanism to watch, scrape, or subscribe to official announcement sources. New alerts cannot be discovered automatically — an admin opens `/admin/sources`, clicks "Sprawdź stronę" on a source, and decides by hand whether anything is worth turning into an alert.

**Consequence:** Finding relevant announcements and deciding they're worth publishing is entirely manual. Coverage is only as good as how often the admin checks.

---

## AI Drafts Are Never Published Automatically

The AI Helper and source-card "Generuj draft AI" can call the Claude API (when `ANTHROPIC_API_KEY` is configured server-side) to turn a pasted notice into a structured draft. This draft is never written to the database automatically — it only prefills the Builder form, and an admin must review it and explicitly click "Zapisz jako draft w Supabase" or "Opublikuj w Supabase".

**Consequence:** Every published alert has had a human look at it. The AI can get dates, places, or category wrong — the Builder does not currently force every field to be filled in before saving as a draft (Sprint 70 added a confirmation prompt before *publishing* if location, "what's changing," "what to do," or source are still empty, but it doesn't block the action).

---

## Single Admin Role

`/admin`, `/admin/sources`, `/ai-helper`, and `/builder` are gated by a Supabase Auth session in the browser, but there is no role *tier* system beyond a single binary: is this account in `public.admin_profiles` or not. Every account in that table has full admin access (create, edit, publish, archive, delete sources and alerts) — there's no separate "editor" vs "approver" role, and no audit trail of who changed what.

**Update (Sprint 161B, closed Sprint 164A):** this used to be *less* true-to-code than it should have been — the app was documented as "any authenticated Supabase Auth user is admin," but the project already had more than one Supabase Auth account, and the API layer (`requireAdminSession`) was only checking authentication, not `admin_profiles` membership; `alert_sources`'s own RLS policies had the same gap at the database level. Sprint 161B closed the API-layer version of this (a signed-in non-admin account now gets `403`, not access) and proposed the matching database-layer fix; **Sprint 164A (2026-07-19) confirms that fix is now live and verified on Production** — see `docs/SPRINT_161_CRITICAL_SECURITY_HARDENING_V1.md` §3a/§10a. Membership in `admin_profiles` is genuinely the single source of truth for "is this account an admin" now, at both layers — it just still isn't *tiered* (no editor-vs-approver distinction).

**Consequence:** Fine for a pilot with a small, trusted set of full-access admins. Would need a real tiered role system before handing narrower (e.g. review-only) access to a less-trusted person — today it's all-or-nothing per `admin_profiles` row.

---

## No Real-Time or Push Notifications

Residents have to open the app to see new alerts. There's no email, SMS, or push notification when something new is published.

**Consequence:** A resident only learns about a new alert by checking the homepage themselves, or via "Moja okolica" filtering down what they see once they do check.

---

## "Moja okolica" Preferences Are Local-Only

Category and location-keyword preferences set in "Moja okolica" are saved in the browser's `localStorage`, not in an account.

**Consequence:** Preferences don't sync across devices and are lost if the user clears browser data or switches browsers/phones. There's no account system to fix this — by design, for now (no login required for residents).

---

## No Credible Rate Limiting on Admin API Routes

`/api/sources/fetch-preview`, `/api/sources/check`, and `/api/ai/draft-alert`
now require a verified admin session (Sprint 161), which closes the
anonymous-caller version of the abuse risk, but there is still no
request-volume throttling for a session that is genuinely logged in. A
credible limiter needs state that survives across serverless instances —
Vercel Firewall or an external store (Upstash/Vercel KV) — which is a new
service/config decision, not something Claude can silently add. See
`docs/SPRINT_161_CRITICAL_SECURITY_HARDENING_V1.md` §5 for the full
decision record and recommendation.

**Consequence:** a compromised or careless admin session could call these
routes at high volume — most acutely `ai/draft-alert`, which is billed
per call. Body/text-length caps and a 10 s timeout limit the damage per
call, but not the call rate.

---

## Admin Routes Are Client-Side Gated, Not Server-Enforced

`/admin`, `/admin/*`, `/builder`, and `/ai-helper` check the Supabase
session in the browser (`AuthGate`/inline session checks) — there is no
`middleware.ts` or server-side route guard, because the Supabase session
is stored in `localStorage`, which a Next.js middleware function cannot
read. The real access-control boundary for data is Supabase RLS (the
three admin API routes now additionally require a verified *and
authorized* session server-side as of Sprint 161/161B — not just any
signed-in account, specifically one with an `admin_profiles` row — see
`docs/SUPABASE_RLS_SECURITY_VERIFICATION_V1.md`).

**Update (Sprint 161B, closed Sprint 164A):** RLS itself was manually
verified live — `alerts`, `source_checks`, and `source_notice_candidates`
are confirmed correct (admin operations gated on `admin_profiles`);
`alert_sources` was found still using the older, broader
`auth.role() = 'authenticated'` check and had a proposed fix. **That fix
is now confirmed live on Production (2026-07-19)** — see
`docs/SPRINT_161_CRITICAL_SECURITY_HARDENING_V1.md` §10/§10a. RLS is now a
confirmed-correct boundary for all four admin-owned tables even while the
routing layer above stays client-gated.

**Consequence:** an unauthenticated visitor's browser still downloads the
admin pages' JS bundle and gets a brief loading flash before the login
prompt renders, though no protected data is ever fetched or displayed.
Closing this properly means migrating to `@supabase/ssr`'s cookie-based
session handling — a real architecture change, planned as a separate,
not-yet-started follow-up (see `docs/ROADMAP.md`).

---

## No Search Beyond Keyword Matching

The homepage search box matches title, place, "co się zmienia," "co zrobić," and category label as plain substrings. There's no fuzzy matching, no date-range filter beyond the category buttons, and no geographic/map-based search.

---

## Pilot Coverage Detection Is a Heuristic, Not Geocoding

Sprint 158A added a check that flags when a typed "Moja okolica" value looks like it's outside the pilot area (`src/lib/pilotCoverage.ts`), so a resident typing e.g. "Warszawa" sees "Nie obsługujemy jeszcze tej okolicy" instead of a generic empty result. This is plain string matching against `PILOT_LOCALITIES`, not real geocoding — a typed street/estate group that doesn't resemble a known locality name gets a cautious "we're not sure" message rather than a confident yes/no, since the app has no way to know which streets fall inside which locality.

**Consequence:** A real street inside the pilot area but far from any recognizable locality name in its spelling could get the cautious message even though it's actually covered. This is intentional — a wrong "unsupported" claim is worse than an occasional over-cautious one.

---

## PWA Offline Mode Never Shows Alert Content (By Design)

Sprint 158B made Alertownik installable (manifest, icons, service worker) and gave it a safe offline fallback. When there's no connection, the app shows a standalone "Brak połączenia z internetem" screen — it deliberately never serves a cached copy of the alert list, an alert detail page, `/admin`, or any API/Supabase response. The service worker's cache holds only the offline screen and the icon it needs.

**Consequence:** Alertownik cannot be browsed offline at all — no "recently viewed alerts while offline" feature exists or is planned as currently scoped. This is intentional: a stale cached alert presented as current could send someone to a road closure or water outage that's already over. Freshness beats offline availability for this app.

---

## No English Language Support Yet (Backlog)

The public UI is Polish-only. Two professional Userbrain testers (Franklin, Elizabeth, English-speaking, using Chrome's automatic translation) hit a real language barrier, and Chrome's translation distorted Polish locality names in the process. This is tracked as backlog, not fixed in Sprint 158A — the pilot itself is Polish-language-first, and full i18n needs a dedicated audit of every page's copy, routes, metadata, and alert data (which is entered in Polish by the admin), not a partial toggle. A half-translated UI would likely confuse residents more than the current all-Polish version.

---

## Dark Mode Is Real But Not Fully Hand-Tuned (Sprint 162)

Sprint 162 added a complete light/dark/system theme system (semantic CSS
tokens, no-flash hydration, live system reaction, accessible three-way
toggle at `/ustawienia`). The ~30 pre-existing pages/components (all admin
surfaces, all public pages) got their dark-mode coverage via a scripted,
purely additive sweep — a `dark:` companion class inserted next to each
recurring hardcoded Tailwind color class, not a manual per-component design
pass the way light mode has had. It's genuinely readable and tested (see
`docs/SPRINT_162_THEME_SYSTEM_LIGHT_DARK_SYSTEM_V1.md`'s test matrix and
manual QA), but a handful of small accents (e.g. `ring-*` badge outlines)
were left unstyled for dark mode since they weren't part of the sweep's
pattern set. The Web App Manifest's `theme_color`/`background_color` also
stay fixed to the light brand color — no dark variant exists in that spec.

**Consequence:** dark mode looks correct and consistent everywhere it was
tested, but hasn't had the same level of design polish as light mode. A
future sprint could migrate the swept files to the semantic token classes
(`bg-surface`, `text-text-primary`, ...) incrementally, with no behavior
change, to close this gap.

---

## "Dzisiaj" Only Surfaces Currently-Active Alerts (Sprint 163)

The new `/` home view's "most important alert" and "other active alerts"
sections only consider alerts whose time status is currently `active` — an
*upcoming* alert (e.g. starting tomorrow), even an urgent one, won't appear
on `/` until it becomes active. This was a deliberate choice to keep
"Dzisiaj" answering "what's happening right now," not "what's coming up" —
the full list at `/alerty` always shows upcoming alerts too, unfiltered.

**Consequence:** a resident who only ever looks at `/` could miss an
important alert the day before it starts. `/alerty`'s "Zobacz wszystkie
alerty" link is one tap away from `/` specifically to mitigate this.

---

## Link Health Checks Are Live but Not Persisted (Sprint 164A)

The Link Health Panel on `/admin/sources` ("Kontrola dostępności linków")
checks each active source's URL for live HTTP reachability on demand
(admin clicks a button) — status code, timeout, redirect behavior — via
the same SSRF-guarded fetch as the source preview feature. The result is
never written to Supabase; it only exists in that browser tab for that
session. A page reload loses it, and there is no history of past health
checks.

**Consequence:** an admin has to re-run the check to see current link
health; there's no "link has been down for 3 days" trend view. A proposed
(not applied) forward migration for persisting this exists at
`docs/sql/PROPOSED_SPRINT_164A_LINK_HEALTH_PERSISTENCE_V1.sql`, with a
paired rollback and read-only verify file, for a future sprint to
consider — see `docs/SPRINT_164A_AUTOMATION_LINK_HEALTH_SAFE_FOUNDATION_V1.md`.

---

## Michałowice Candidate Automation Is Built but Not Turned On (Sprint 164A/164B)

`GET /api/cron/write-candidates` (Sprint 147–153) can automatically create
at most one `pending` source-notice candidate per invocation for the
Michałowice source, behind three independent, all-required kill switches
(`SCHEDULED_CHECKS_ENABLED`, `SCHEDULED_WRITES_ENABLED`, and a configured
+ RLS-authorized scheduled-writer account). None of the three is
configured in any environment as of Sprint 164B, and the route is not
wired into `vercel.json` — only the harmless dry-run
`/api/cron/check-michalowice` is. Turning this on is a manual,
separately-approved Production activation step for Adam, not something
any sprint does automatically.

**Sprint 164B update:** a fresh audit against a new safety spec confirmed
this pipeline already satisfied every requirement (max 1 candidate/run,
single-source allowlist, pending-only inserts, fail-closed gates,
conservative dedup) without needing a code change to the write path
itself. The one real gap — nothing showed *whether* the switches were on
or off — is now closed by a new read-only "Stan automatyzacji (canary)"
panel on `/admin/sources`. Still off everywhere; see
`docs/SPRINT_164B_SAFE_AUTO_CANDIDATE_CANARY_FOUNDATION_V1.md` and its
paired activation/rollback runbooks for the exact staged path to turning
it on.

**Consequence:** today, candidate creation for Michałowice is still
entirely manual (the "Sprawdź stronę" / "Zapisz jako kandydata" flow on
`/admin/sources`). An admin can now at least *see* the automation's
current on/off state at a glance instead of having to check Vercel's
environment variable dashboard.

---

## This Is Early-Stage Software

Alertownik is a pilot-stage MVP, not a mature product. It has had QA passes (see [[Sprint Log]] Sprint 68 in Obsidian) and is now being prepared for its first real testers, but it has not yet been validated under real, sustained usage. See `docs/NEXT_MILESTONES.md` for the planned path (richer source monitoring, notifications, multi-role admin).

---

**Sprint 159 (MVP 100% closure) note:** every limitation above is a deliberate scope boundary of the current MVP, not an unfinished piece of it — see `docs/SPRINT_159_MVP_100_PERCENT_CLOSURE_V1.md` for the closure audit that confirmed this. Push notifications, app-store distribution, analytics, PL/EN, and geographic expansion are explicitly future, separately-scoped work, not gaps in what's live today.
