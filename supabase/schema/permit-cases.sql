-- Private STR inbox. Apply before deploying submit-permit-case.
create table if not exists public.permit_cases (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  facts jsonb not null,
  guidance jsonb not null,
  primary key (user_id, id)
);
alter table public.permit_cases enable row level security;
revoke all on public.permit_cases from public, anon, authenticated;
grant select, insert on public.permit_cases to service_role;
-- Access only through submit-permit-case: confirmed member for insert, committee admin for read.
