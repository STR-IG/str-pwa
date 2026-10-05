-- Expand anonymous, privacy-preserving APP analytics to all current sections.
-- Events contain random visitor/session UUIDs only: no email, employee number, payroll data or query content.
drop policy if exists "public analytics insert only" on public.app_analytics_events;
create policy "app analytics anonymous insert"
on public.app_analytics_events
for insert
to anon, authenticated
with check (
  environment = 'production'
  and event_type in ('page_view','card_click')
  and area in ('public','private')
  and length(section) between 1 and 120
  and length(path) between 1 and 160
  and (target is null or length(target) <= 120)
);
