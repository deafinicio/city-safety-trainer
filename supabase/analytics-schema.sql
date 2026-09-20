-- Reproducible schema for training analytics and administrator access.
-- Apply to the Supabase project through a reviewed migration or SQL editor.

create table if not exists public.admin_users (
  email text primary key,
  display_name text,
  created_at timestamptz not null default now(),
  constraint admin_users_email_format check (
    char_length(email) between 5 and 254
    and email = lower(btrim(email))
    and position('@' in email) > 1
  ),
  constraint admin_users_display_name_length check (
    display_name is null or char_length(btrim(display_name)) between 2 and 80
  )
);

create table if not exists public.stage_attempts (
  id uuid primary key,
  participant_id uuid not null references public.participants(id) on delete cascade,
  session_id uuid not null,
  stage_id smallint not null check (stage_id between 1 and 11),
  attempt_number smallint not null default 1 check (attempt_number between 1 and 100),
  outcome text not null check (outcome in ('success', 'failure', 'abandoned')),
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 1000),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_ms integer not null check (duration_ms between 0 and 86400000),
  metrics jsonb not null default '{}'::jsonb,
  app_version text not null default 'unknown' check (char_length(app_version) between 1 and 40),
  created_at timestamptz not null default now(),
  constraint stage_attempts_time_order check (finished_at >= started_at),
  constraint stage_attempts_metrics_object check (
    jsonb_typeof(metrics) = 'object' and pg_column_size(metrics) <= 16384
  )
);

create index if not exists stage_attempts_participant_id_idx on public.stage_attempts (participant_id);
create index if not exists stage_attempts_session_id_idx on public.stage_attempts (session_id);
create index if not exists stage_attempts_finished_at_idx on public.stage_attempts (finished_at desc);
create index if not exists stage_attempts_stage_outcome_idx on public.stage_attempts (stage_id, outcome);

alter table public.admin_users enable row level security;
alter table public.stage_attempts enable row level security;

drop policy if exists "Administrators can verify own access" on public.admin_users;
create policy "Administrators can verify own access"
  on public.admin_users for select to authenticated
  using (lower(email) = lower(coalesce(((select auth.jwt()) ->> 'email'), '')));

drop policy if exists "Anonymous users can submit stage attempts" on public.stage_attempts;
create policy "Anonymous users can submit stage attempts"
  on public.stage_attempts for insert to anon
  with check (
    stage_id between 1 and 11
    and attempt_number between 1 and 100
    and outcome in ('success', 'failure', 'abandoned')
    and finished_at >= started_at
    and duration_ms between 0 and 86400000
    and jsonb_typeof(metrics) = 'object'
    and pg_column_size(metrics) <= 16384
  );

drop policy if exists "Administrators can read participants" on public.participants;
create policy "Administrators can read participants"
  on public.participants for select to authenticated
  using (
    exists (
      select 1 from public.admin_users administrator
      where lower(administrator.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
    )
  );

drop policy if exists "Administrators can read stage attempts" on public.stage_attempts;
create policy "Administrators can read stage attempts"
  on public.stage_attempts for select to authenticated
  using (
    exists (
      select 1 from public.admin_users administrator
      where lower(administrator.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
    )
  );

revoke all on table public.admin_users, public.stage_attempts, public.participants from anon, authenticated;
grant select on table public.admin_users to authenticated;
grant insert on table public.stage_attempts to anon;
grant select on table public.stage_attempts to authenticated;
grant insert on table public.participants to anon;
grant select on table public.participants to authenticated;
