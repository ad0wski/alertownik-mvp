-- ============================================================================
-- READ ONLY — NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 148 — single-table verification for the controlled write test
-- against Gmina Michałowice — komunikaty only. Simplified successor to
-- docs/sql/VERIFY_SPRINT_148_CONTROLLED_WRITE_TEST_READ_ONLY_V1.sql (6
-- separate result sets) — this file returns ONE result set, one row per
-- check, so it can be read/exported/screenshotted in a single pass.
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY (wrapped in read-only CTEs).
-- No INSERT, UPDATE, DELETE, ALTER, CREATE, DROP, GRANT, or REVOKE, and no
-- data-modifying function (no `set_updated_at`, no `nextval`, nothing that
-- writes). Safe to run at any time, any number of times — it changes
-- nothing. No email, password, token, CRON_SECRET, env value, or technical
-- account identifier is selected anywhere in this file — only a generic
-- true/false ("was the actor a known automation identity") derived from
-- `public.automation_identities`, never the UUID itself.
--
-- HOW THIS DISTINGUISHES "scheduled writer" FROM "admin, manually":
--   - source_notice_candidates.source_key is populated ONLY by the
--     scheduled-writer insert path (src/lib/scheduledWriter.ts,
--     buildPendingCandidateInsert) — the admin's manual "Zapisz jako
--     kandydata" insert (src/lib/supabaseCandidateWrites.ts,
--     createSourceCandidateNotice) never sets this column, so it stays
--     NULL for every admin-created row. Any row with
--     source_key = 'michalowice-komunikaty' can ONLY have been written by
--     the scheduled writer — no time-window guessing required.
--   - source_checks.created_by is set by BOTH the admin's manual check
--     button and the scheduled writer, so it alone doesn't distinguish
--     them — but source_checks.created_by IN (select user_id from
--     automation_identities) does, since only the technical writer
--     account (never the human admin) is a member of that table.
--
-- Run this AFTER the single manual call to
-- GET /api/cron/write-candidates?sourceKey=michalowice-komunikaty.
-- ============================================================================

with target as (
  select
    'a56cfb33-a443-47aa-8365-89c6303e7fcc'::uuid as source_id,
    'michalowice-komunikaty'::text            as source_key
),

-- Any source_checks row actually created by the technical writer identity
-- (not the admin), for the Michałowice registry row.
writer_checks as (
  select sc.*
  from public.source_checks sc
  cross join target t
  where sc.source_id = t.source_id
    and sc.created_by in (select user_id from public.automation_identities)
),

-- Any source_notice_candidates row the scheduled writer could have
-- created for Michałowice — identified purely by source_key, which only
-- this code path ever populates.
writer_candidates as (
  select c.*
  from public.source_notice_candidates c
  cross join target t
  where c.source_key = t.source_key
),

-- Same check for WKD — must stay at zero; this test's approval explicitly
-- excludes WKD from the first live write.
writer_candidates_wkd as (
  select c.*
  from public.source_notice_candidates c
  where c.source_key = 'wkd-aktualnosci'
),

alerts_recent_activity as (
  select
    count(*) filter (where created_at > now() - interval '2 hours') as created_recently,
    count(*) filter (where updated_at > now() - interval '2 hours') as updated_recently,
    count(*) as total_alerts
  from public.alerts
)

select * from (

  select
    1 as ord,
    'Czy funkcja /api/cron/write-candidates w ogóle uruchomiła się (source_check zapisany przez konto techniczne)?' as check_name,
    case when (select count(*) from writer_checks) > 0 then 'TAK' else 'NIE' end as result,
    'TAK jeśli route dotarł do writeCandidatesForSource() — check jest logowany ZAWSZE przy poprawnym uruchomieniu, niezależnie od tego czy znaleziono nowy kandydat' as expected,
    case when (select count(*) from writer_checks) > 0 then 'PASS' else 'INFO' end as status,
    case
      when (select count(*) from writer_checks) > 0
        then 'Znaleziono ' || (select count(*) from writer_checks)::text || ' check(i) autora=konto techniczne, result=' ||
             coalesce((select string_agg(distinct result, ', ') from writer_checks), '(brak)')
      else 'Brak jakiegokolwiek source_check od konta technicznego dla tego źródła — wspiera hipotezę REQUEST BLOCKED BEFORE APPLICATION'
    end as details

  union all

  select
    2,
    'Ile nowych kandydatów (source_key=michalowice-komunikaty) powstało łącznie?',
    (select count(*) from writer_candidates)::text,
    '0 (brak nowej treści na stronie) lub dokładnie 1 (limit pierwszego live write = 1) — NIGDY więcej niż 1',
    case
      when (select count(*) from writer_candidates) = 0 then 'INFO'
      when (select count(*) from writer_candidates) = 1 then 'PASS'
      else 'FAIL'
    end,
    case
      when (select count(*) from writer_candidates) = 0 then 'Zero kandydatów — zgodne zarówno z "brak nowej treści" (result=no_changes) jak i z "request nigdy nie dotarł"; rozstrzyga check #1 powyżej'
      when (select count(*) from writer_candidates) = 1 then 'Dokładnie 1 — zgodne z cap-em DEFAULT_MAX_CANDIDATES_PER_INVOCATION=1'
      else 'PRZEKROCZONO limit 1 na wywołanie — niezgodne z konfiguracją, wymaga wyjaśnienia'
    end

  union all

  select
    3,
    'Czy jedyny nowy kandydat ma status = pending?',
    coalesce((select status from writer_candidates order by created_at desc limit 1), '(brak kandydata)'),
    'pending (jedyna wartość jaką może ustawić buildPendingCandidateInsert)',
    case
      when (select count(*) from writer_candidates) = 0 then 'INFO'
      when (select status from writer_candidates order by created_at desc limit 1) = 'pending' then 'PASS'
      else 'FAIL'
    end,
    case
      when (select count(*) from writer_candidates) = 0 then 'Nie dotyczy — brak kandydata do sprawdzenia'
      else 'status=' || (select status from writer_candidates order by created_at desc limit 1)
    end

  union all

  select
    4,
    'Czy pola wrażliwe/publikacyjne kandydata pozostały puste/bezpieczne?',
    case
      when (select count(*) from writer_candidates) = 0 then '(brak kandydata)'
      when (select
              verification_status = 'unverified'
              and confidence_score is null
              and risk_level is null
              and verification_notes is null
              and checked_at is null
              and duplicate_of_alert_id is null
              and converted_alert_id is null
              and ai_draft_json is null
            from writer_candidates order by created_at desc limit 1)
        then 'TAK — wszystkie puste/bezpieczne'
      else 'NIE — co najmniej jedno pole odbiega od oczekiwanego'
    end,
    'verification_status=unverified, confidence_score/risk_level/verification_notes/checked_at/duplicate_of_alert_id/converted_alert_id/ai_draft_json = NULL',
    case
      when (select count(*) from writer_candidates) = 0 then 'INFO'
      when (select
              verification_status = 'unverified'
              and confidence_score is null
              and risk_level is null
              and verification_notes is null
              and checked_at is null
              and duplicate_of_alert_id is null
              and converted_alert_id is null
              and ai_draft_json is null
            from writer_candidates order by created_at desc limit 1)
        then 'PASS'
      else 'FAIL'
    end,
    case
      when (select count(*) from writer_candidates) = 0 then 'Nie dotyczy — brak kandydata do sprawdzenia'
      else 'Zobacz kolumnę result — TAK/NIE'
    end

  union all

  select
    5,
    'Czy WKD zostało (błędnie) dotknięte przez ten test?',
    (select count(*) from writer_candidates_wkd)::text,
    '0 — WKD jest jawnie wykluczone z tego pierwszego zapisu',
    case when (select count(*) from writer_candidates_wkd) = 0 then 'PASS' else 'FAIL' end,
    case
      when (select count(*) from writer_candidates_wkd) = 0 then 'Brak nowych kandydatów WKD — zgodne z zatwierdzonym zakresem'
      else 'UWAGA: znaleziono kandydat(y) WKD — niezgodne z zatwierdzonym zakresem, wymaga natychmiastowego wyjaśnienia'
    end

  union all

  select
    6,
    'Czy tabela alerts ma jakąkolwiek aktywność w ostatnich 2 godzinach?',
    'utworzone=' || (select created_recently from alerts_recent_activity)::text ||
      ', zaktualizowane=' || (select updated_recently from alerts_recent_activity)::text ||
      ' (łącznie w tabeli: ' || (select total_alerts from alerts_recent_activity)::text || ')',
    '0 i 0 — route nie ma kodowo żadnej ścieżki do tabeli alerts (potwierdzone statycznym audytem kodu)',
    case
      when (select created_recently from alerts_recent_activity) = 0
       and (select updated_recently from alerts_recent_activity) = 0
      then 'PASS'
      else 'WARN'
    end,
    case
      when (select created_recently from alerts_recent_activity) = 0
       and (select updated_recently from alerts_recent_activity) = 0
      then 'Brak jakiejkolwiek świeżej zmiany w alerts — nic nie zostało opublikowane'
      else 'Wykryto świeżą zmianę w alerts w ciągu ostatnich 2h — może być niezwiązana z tym testem, ale wymaga ręcznego potwierdzenia że to nie ten endpoint'
    end

) as checks
order by ord;

-- ============================================================================
-- END OF VERIFICATION ARTIFACT — jeden wynik, jedna tabela.
-- ============================================================================
-- Czytaj kolumnę `status` odgórnie: PASS = zgodnie z oczekiwaniem, INFO =
-- neutralne/brak danych do porównania, WARN = wymaga ręcznego spojrzenia
-- (niekoniecznie błąd), FAIL = niezgodność wymagająca wyjaśnienia przed
-- kolejnym krokiem.
-- ============================================================================
