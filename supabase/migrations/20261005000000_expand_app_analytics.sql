-- Expand anonymous APP analytics while restricting accepted values to known app routes.
-- No email, employee number, payroll data, form values or query contents are stored.
drop policy if exists "public analytics insert only" on public.app_analytics_events;
drop policy if exists "app analytics anonymous insert" on public.app_analytics_events;

create policy "app analytics anonymous insert"
on public.app_analytics_events
for insert
to anon, authenticated
with check (
  environment = 'production'
  and event_type in ('page_view','card_click')
  and area in ('public','private')
  and section in (
    'index','demo-app','dia-afiliacion','permisos-publicos','permisos','preguntale-str-permisos',
    'hospitalizacion-primer-grado','hospitalizacion-segundo-grado',
    'intervencion-familiar-sin-ingreso-primer-grado','intervencion-familiar-sin-ingreso-segundo-grado',
    'intervencion-conviviente-sin-ingreso','fallecimiento-familiar','matrimonio','visita-medica',
    'permiso-deber-inexcusable','fuerza-mayor-familiar','permiso-traslado-domicilio','emergencia-climatica',
    'alertas-meteorologicas','estado-carreteras','menu-comedor','actualidad-empresa','actualidad-laboral',
    'actividad-informacion-sindical','conoce-tus-derechos','ficha-afiliate-str-ig',
    'acceso-privado','area-privada','revisa-tu-nomina','estadisticas-nomina','justificantes-oficiales',
    'comunicados-internos'
  )
  and length(path) between 1 and 160
  and path like '/%'
  and path not like '%?%'
  and (target is null or length(target) <= 120)
);
