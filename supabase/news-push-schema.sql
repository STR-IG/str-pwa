-- Esquema del sistema de novedades y Web Push.
-- Las claves VAPID se guardan en Supabase Vault con los nombres usados por
-- get_push_vapid_config(); nunca deben añadirse a este repositorio.

create table if not exists public.app_news (
  id text primary key,
  category text not null check (category ~ '^[a-z0-9_-]{1,50}$'),
  published_at timestamptz not null,
  url text not null check (char_length(url) between 1 and 500),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists app_news_active_published_idx
  on public.app_news (active, published_at desc);

alter table public.app_news enable row level security;
revoke all on table public.app_news from anon, authenticated;
grant select on table public.app_news to anon, authenticated;
grant all on table public.app_news to service_role;

drop policy if exists "active_news_public_read" on public.app_news;
create policy "active_news_public_read"
  on public.app_news for select to anon, authenticated using (active);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_key_hash text not null unique check (char_length(device_key_hash) = 64),
  endpoint text not null unique check (char_length(endpoint) between 20 and 2048),
  p256dh text not null check (char_length(p256dh) between 20 and 500),
  auth text not null check (char_length(auth) between 10 and 500),
  expiration_time bigint,
  user_id uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_active_idx
  on public.push_subscriptions (active) where active;
create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
grant all on table public.push_subscriptions to service_role;
drop policy if exists "deny_public_push_subscriptions" on public.push_subscriptions;
create policy "deny_public_push_subscriptions"
  on public.push_subscriptions for all to public using (false) with check (false);

create table if not exists public.push_news_reads (
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  news_id text not null references public.app_news(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (subscription_id, news_id)
);

create index if not exists push_news_reads_news_id_idx
  on public.push_news_reads (news_id);

alter table public.push_news_reads enable row level security;
revoke all on table public.push_news_reads from anon, authenticated;
grant all on table public.push_news_reads to service_role;
drop policy if exists "deny_public_push_news_reads" on public.push_news_reads;
create policy "deny_public_push_news_reads"
  on public.push_news_reads for all to public using (false) with check (false);

create or replace function public.get_push_vapid_config()
returns table (public_key text, private_key text, subject text)
language plpgsql security definer
set search_path = pg_catalog, public, vault
as $$
begin
  if current_user <> 'service_role' then raise exception 'not authorized'; end if;
  return query select
    (select decrypted_secret from vault.decrypted_secrets where name = 'str_push_vapid_public' order by created_at desc limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'str_push_vapid_private' order by created_at desc limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'str_push_vapid_subject' order by created_at desc limit 1);
end;
$$;

revoke all on function public.get_push_vapid_config() from public, anon, authenticated;
grant execute on function public.get_push_vapid_config() to service_role;

insert into public.app_news (id, category, published_at, url, active)
values ('menu-2026-09', 'menu', '2026-09-03T12:37:11Z', 'menu-comedor.html', true)
on conflict (id) do update set
  category = excluded.category,
  published_at = excluded.published_at,
  url = excluded.url,
  active = excluded.active;
