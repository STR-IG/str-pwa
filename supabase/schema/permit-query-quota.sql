-- Apply before deploying public permit functions. Only the server may access usage.
create table if not exists public.permit_query_reservations (
  id uuid primary key,
  subject text not null check (subject ~ '^[a-f0-9]{64}$'),
  month date not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists permit_query_reservations_subject_month
  on public.permit_query_reservations (subject, month);
alter table public.permit_query_reservations enable row level security;
revoke all on public.permit_query_reservations from public, anon, authenticated;
grant select, insert, update, delete on public.permit_query_reservations to service_role;

create or replace function public.permit_query_quota(
  p_subject text, p_action text, p_reservation uuid default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_month date := date_trunc('month', now() at time zone 'Europe/Madrid')::date;
  used integer;
  reservation uuid;
begin
  if p_subject is null or p_subject !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_SUBJECT';
  end if;
  if p_action not in ('status', 'reserve', 'complete', 'release') or p_action is null then
    raise exception 'INVALID_ACTION';
  end if;
  -- Serialize all requests for this browser, including requests to different functions.
  perform pg_advisory_xact_lock(hashtextextended(p_subject, 0));
  delete from public.permit_query_reservations
    where subject = p_subject and not completed and created_at < now() - interval '5 minutes';
  if p_action = 'complete' then
    update public.permit_query_reservations set completed = true
      where id = p_reservation and subject = p_subject;
    if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  elsif p_action = 'release' then
    delete from public.permit_query_reservations
      where id = p_reservation and subject = p_subject and not completed;
  end if;
  select count(*) into used from public.permit_query_reservations
    where subject = p_subject and month = current_month;
  if p_action = 'reserve' then
    if used >= 2 then
      return jsonb_build_object('allowed', false, 'remaining', 0, 'month', current_month);
    end if;
    reservation := gen_random_uuid();
    insert into public.permit_query_reservations (id, subject, month)
      values (reservation, p_subject, current_month);
    used := used + 1;
  end if;
  return jsonb_build_object('allowed', true, 'remaining', greatest(0, 2 - used),
    'month', current_month, 'reservation', reservation);
end;
$$;
revoke all on function public.permit_query_quota(text, text, uuid) from public, anon, authenticated;
grant execute on function public.permit_query_quota(text, text, uuid) to service_role;
