# Alertownik — Incident and Rollback Runbook (v1)

Short, practical, for one person (Adam) to follow under stress. Not a sprint-specific runbook — this is the general playbook for "something is wrong in Production," created in Sprint 159 because none existed yet.

---

## When to Stop and Use This Document

- A published alert is visibly wrong (wrong dates, wrong place, wrong category) and residents could act on bad information.
- The public site is down, erroring, or showing a broken page.
- You suspect a secret (Supabase key, `ANTHROPIC_API_KEY`, `CRON_SECRET`) has leaked — in a commit, a log, a screenshot, or anywhere public.
- A deploy introduced a regression (admin broken, public site broken, PWA broken).
- The cron endpoint is behaving unexpectedly (running when it shouldn't, or erroring repeatedly).

## What NOT to Do

- Don't `git push --force` to `main`, ever.
- Don't `git reset --hard` or `git clean` without first checking `git status` and stashing/committing anything you might need.
- Don't rotate a secret and forget to update it in Vercel — the app will fail closed (safe) but stop working until you do.
- Don't try to fix a live-data problem by editing the database schema. A wrong alert is a data problem, not a schema problem — archive it, don't restructure tables.
- Don't skip writing down what you did — you'll need it if the same thing happens again.

---

## 1. A Published Alert Is Wrong

**Fastest safe fix: archive it.**

1. Log in at `/login`.
2. Go to `/builder`, find the alert.
3. Archive it (existing archive action — no new tooling needed; this was verified end-to-end with a real alert in Sprint 150).
4. If the content needs to be republished correctly, create a new draft rather than editing the wrong one in place, so there's no window where a half-edited alert is live.

No deploy, no rollback needed for bad *content* — this is a data operation inside the app you already have.

---

## 2. Public Site Is Down or Broken

1. Check Vercel dashboard → Deployments. Confirm which commit is currently `Production`.
2. Check the Vercel build/runtime logs for the failing deployment.
3. **If the last deploy caused it:** roll back.
   - In Vercel: find the last known-good deployment (the one before the regression) and use Vercel's "Promote to Production" / redeploy-this-commit action on it. This does not require a new git push — Vercel can serve a previous build directly.
   - Confirm `main` in git still matches what you *want* live; if not, this is a signal you need a fix-forward commit afterward, not just a Vercel-side rollback.
4. **If it's not a deploy problem** (e.g. Supabase outage, DNS, Vercel platform issue): check Supabase status and Vercel status pages before assuming it's your code.
5. Once the site is back, do a quick pass of: homepage loads, `/alerts/[slug]` loads, `/login` loads, `/admin` still requires auth.

---

## 3. Suspected Secret Leak

**Do not paste the secret anywhere, including into an AI assistant, a chat, or this document — ever, even to describe the incident.**

1. Identify which secret: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (low severity — meant to be public, protected by RLS), `SUPABASE_SERVICE_ROLE_KEY` (never used in this app — if you find one anywhere, that alone is the incident), `ANTHROPIC_API_KEY`, or `CRON_SECRET`.
2. Rotate it at the source:
   - Supabase keys: Supabase dashboard → Settings → API → regenerate.
   - `ANTHROPIC_API_KEY`: console.anthropic.com → revoke and issue a new one.
   - `CRON_SECRET`: this is a value you generate yourself — just generate a new random string.
3. Update the new value in Vercel: Project → Settings → Environment Variables → replace → redeploy so the running app picks it up.
4. If the leak was in a git commit: rotating the key makes the old committed value useless, which is sufficient — you generally do **not** need to rewrite git history for a rotated secret (rewriting published history is its own risk and is out of scope for a one-person pilot).
5. Write down what leaked, when, and what you rotated, in a private note (not this repo).

---

## 4. Cron Behaving Unexpectedly

- The single cron (`/api/cron/check-michalowice`, `0 5 * * *`) is fail-closed: it requires both `SCHEDULED_CHECKS_ENABLED=true` and a valid `CRON_SECRET`. It **never writes to the database** — it only fetches and summarizes.
- **To stop it immediately:** set `SCHEDULED_CHECKS_ENABLED=false` in Vercel env vars and redeploy (or use Vercel's env-var-only update if that doesn't require a rebuild — check current Vercel behavior). The route returns `503` and does nothing when this is off.
- Do not click "Run" on the cron in Vercel's dashboard while investigating — let it stay off until you understand what happened.
- Because the route makes zero writes, "unexpected cron behavior" can only mean: it ran when it shouldn't have (env misconfiguration) or it errored (check logs, likely a source-site change breaking the fetch/parse — not a data-safety issue).

---

## 5. Deploy / Rollback Mechanics (Reference)

- **Identify the right commit:** `git log --oneline -20` on `main`. Every sprint commit is named `sprint-NNN-...`, so the commit you want is usually self-describing.
- **Vercel rollback (preferred, fastest):** Vercel keeps prior deployments; promoting an older one to Production is immediate and doesn't touch git.
- **Git-level rollback (if you need `main` itself to move back):**
  ```
  git checkout main
  git log --oneline -10        # find the last known-good commit
  git revert <bad-commit>      # preferred: adds a new commit undoing the bad one, keeps history intact
  ```
  Avoid `git reset --hard` on `main` if it's already been pushed — it rewrites history other clones (and Vercel's git integration) rely on. `git revert` is almost always the safer choice for a shared branch.
- **After any rollback:** run `npm run check`, `npm run test:e2e`, and (if the change touched PWA) `npm run test:pwa` before pushing again.

---

## 6. Collecting Evidence Before You Fix Anything

If something looks like a real incident (not just a typo), before changing anything:

- Screenshot or copy the broken state (page, error message, Vercel log).
- Note the exact time (with timezone) you noticed it.
- Note the current `git rev-parse HEAD` on `main` and the Vercel deployment ID.
- Note what you were doing right before, if relevant (e.g. "I published a new alert 5 minutes before this appeared").

This takes two minutes and makes root-causing much faster afterward — don't skip it just because you want to fix it immediately.

---

## 7. Confirming Recovery

After any fix or rollback, confirm all of:

- [ ] Homepage loads and shows the current alert list (or correct empty state).
- [ ] `/alerts/[slug]` loads for one real alert.
- [ ] `/login` loads; admin login still works.
- [ ] `/admin`, `/builder`, `/ai-helper`, `/admin/sources` still require auth (unauthenticated visit shows the login prompt, not data).
- [ ] `/manifest.webmanifest`, `/sw.js`, `/offline.html`, `/instalacja` all still return 200.
- [ ] `git rev-parse HEAD` on `main` matches what Vercel Production reports as its commit.
- [ ] No secret appears in the fix commit's diff (`git diff` review before pushing).

---

## Contact

Single-admin project — Adam Jurkowski (`alertownik.kontakt@gmail.com`) is the only person who can execute any of the above. There is no on-call rotation; this document exists so that future-you (or, in an emergency, someone you've briefed) doesn't have to reconstruct the process from scratch.
