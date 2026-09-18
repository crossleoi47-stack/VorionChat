-- Required by company policy settings (DLP and role feature overrides).
alter table public.companies
  add column if not exists settings jsonb not null default '{}'::jsonb;
