-- Aggregate card accesses only: no event rows, identities, session IDs or query contents.
create table public.app_card_catalog (card text primary key, label text not null);
create table public.app_card_counts (
  month date not null,
  card text not null references public.app_card_catalog(card),
  accesses bigint not null default 0 check (accesses >= 0),
  primary key (month,card)
);
alter table public.app_card_catalog enable row level security;
alter table public.app_card_counts enable row level security;
revoke all on public.app_card_catalog, public.app_card_counts from public, anon, authenticated;
grant select on public.app_card_catalog, public.app_card_counts to service_role;
insert into public.app_card_catalog(card,label) values ('acceso-privado.html','Acceso privado'),
('actividad-informacion-sindical.html','Actividad e información sindical'),
('actividad-sindical.html','Actividad e información sindical'),
('actualidad-empresa.html','Actualidad de tu empresa'),
('actualidad-laboral.html','Actualidad laboral'),
('actualidad-sindical.html','Actividad e información sindical'),
('alertas-meteorologicas.html','Alertas meteorológicas'),
('alta-afiliados.html','Alta de afiliados'),
('app.html','STR-IG'),
('area-privada.html','Área privada'),
('auth-callback.html','Validando acceso'),
('calendarios.html','Calendarios 2027'),
('comunicado-comedor.html','Comunicado comedor'),
('comunicados-internos.html','Comunicados internos'),
('conoce-tus-derechos.html','Conoce tus derechos'),
('demo-app.html','Demo'),
('demo-calcula-v-flujo.html','Calcula tu V · Demo'),
('demo-calcula-v.html','Calcula tu V · Demo'),
('demo-matrimonio.html','Permiso por matrimonio · Demo'),
('demo-preguntale-matrimonio-fecha.html','Fecha · Matrimonio · Demo'),
('demo-preguntale-matrimonio-jornada.html','Inicio del permiso · Matrimonio · Demo'),
('demo-preguntale-matrimonio-resultado.html','Resultado · Matrimonio · Demo'),
('demo-preguntale-matrimonio-tipo.html','Matrimonio o pareja de hecho · Demo'),
('demo-preguntale-str-ig.html','Pregúntale a STR-IG · Demo'),
('demo-preguntale-str-permisos.html','Permisos retribuidos · Demo'),
('dia-afiliacion.html','Día de la Afiliación'),
('emergencia-climatica.html','Emergencia climática'),
('encuestas-admin.html','Administrar encuestas'),
('encuestas.html','Participa en las encuestas'),
('estadisticas-nomina.html','Estadísticas retiradas'),
('estado-carreteras.html','Estado de las carreteras'),
('fallecimiento-familiar.html','Fallecimiento familiar'),
('ficha-afiliate-str-ig.html','Afíliate a STR-IG'),
('fuerza-mayor-familiar.html','Fuerza mayor familiar'),
('hospitalizacion-primer-grado.html','Hospitalización familiar de primer grado'),
('hospitalizacion-segundo-grado.html','Hospitalización familiar de segundo grado'),
('index.html','Instalar STR-IG'),
('informacion-plantilla.html','Actividad e información sindical'),
('intervencion-conviviente-sin-ingreso.html','Intervención conviviente sin hospitalización'),
('intervencion-familiar-sin-ingreso-primer-grado.html','Intervención familiar sin hospitalización 1er grado'),
('intervencion-familiar-sin-ingreso-segundo-grado.html','Intervención familiar sin hospitalización 2º grado'),
('justificantes-oficiales.html','Justificantes oficiales'),
('matrimonio.html','Permiso por matrimonio'),
('menu-comedor.html','Menú del comedor'),
('mesa-electoral.html','Mesa electoral'),
('nuestra-explicacion-documentacion.html','Nuestra explicación de los hechos'),
('panel-administracion.html','Panel de administración'),
('permiso-deber-inexcusable.html','Deber inexcusable'),
('permiso-traslado-domicilio.html','Traslado de domicilio'),
('permisos-publicos.html','Permisos retribuidos'),
('permisos.html','Permisos retribuidos'),
('preguntale-deber-inexcusable.html','Deber inexcusable · Pregúntale a STR-IG'),
('preguntale-emergencia-aviso-oficial.html','Emergencia climática · Pregúntale a STR-IG'),
('preguntale-emergencia-consulta-oficial.html','Consulta oficial · Emergencia climática'),
('preguntale-emergencia-situacion.html','Emergencia climática · Pregúntale a STR-IG'),
('preguntale-fallecimiento-desplazamiento.html','Desplazamiento · Pregúntale a STR-IG'),
('preguntale-fallecimiento-dias.html','Días del permiso · Pregúntale a STR-IG'),
('preguntale-fallecimiento-familiar.html','Fallecimiento familiar · Pregúntale a STR-IG'),
('preguntale-fallecimiento-fecha.html','Fecha del fallecimiento · Pregúntale a STR-IG'),
('preguntale-fallecimiento-jornada.html','Primer día del permiso · Pregúntale a STR-IG'),
('preguntale-fallecimiento-turno.html','Turno y fallecimiento · Pregúntale a STR-IG'),
('preguntale-fuerza-mayor-duracion.html','Duración · Fuerza mayor familiar'),
('preguntale-fuerza-mayor-fecha.html','Fecha · Fuerza mayor familiar'),
('preguntale-fuerza-mayor-motivo.html','Motivo · Fuerza mayor familiar'),
('preguntale-fuerza-mayor-persona.html','Fuerza mayor familiar · Pregúntale a STR-IG'),
('preguntale-fuerza-mayor-presencia.html','Presencia inmediata · Fuerza mayor familiar'),
('preguntale-hospitalizacion-dias.html','Días del permiso · Pregúntale a STR-IG'),
('preguntale-hospitalizacion-duracion.html','Duración de la hospitalización · Pregúntale a STR-IG'),
('preguntale-hospitalizacion-familiar.html','Hospitalización familiar · Pregúntale a STR-IG'),
('preguntale-hospitalizacion-jornada.html','Inicio del permiso · Pregúntale a STR-IG'),
('preguntale-hospitalizacion-primer-grado-documentacion.html','Documentación hospitalización · Pregúntale a STR-IG'),
('preguntale-hospitalizacion-reposo.html','Hospitalización y reposo · Pregúntale a STR-IG'),
('preguntale-hospitalizacion-segundo-grado-documentacion.html','Documentación hospitalización 2.º grado · Pregúntale a STR-IG'),
('preguntale-hospitalizacion-segundo-grado-familiar.html','Hospitalización familiar de segundo grado · Pregúntale a STR-IG'),
('preguntale-hospitalizacion-turno.html','Turno e ingreso · Pregúntale a STR-IG'),
('preguntale-intervencion-conviviente.html','Intervención de conviviente · Pregúntale a STR-IG'),
('preguntale-intervencion-primer-grado-dias.html','Días del permiso · Pregúntale a STR-IG'),
('preguntale-intervencion-primer-grado-familiar.html','Intervención quirúrgica familiar · Pregúntale a STR-IG'),
('preguntale-intervencion-primer-grado-fecha.html','Fecha de la intervención · Pregúntale a STR-IG'),
('preguntale-intervencion-primer-grado-jornada.html','Primer día del permiso · Pregúntale a STR-IG'),
('preguntale-intervencion-primer-grado-reposo.html','Reposo domiciliario · Pregúntale a STR-IG'),
('preguntale-intervencion-primer-grado-turno.html','Turno e intervención · Pregúntale a STR-IG'),
('preguntale-intervencion-segundo-grado-dias.html','Días del permiso · Pregúntale a STR-IG'),
('preguntale-intervencion-segundo-grado-familiar.html','Intervención quirúrgica familiar · Pregúntale a STR-IG'),
('preguntale-intervencion-segundo-grado-fecha.html','Fecha de la intervención · Pregúntale a STR-IG'),
('preguntale-intervencion-segundo-grado-jornada.html','Primer día del permiso · Pregúntale a STR-IG'),
('preguntale-intervencion-segundo-grado-reposo.html','Reposo domiciliario · Pregúntale a STR-IG'),
('preguntale-intervencion-segundo-grado-turno.html','Turno e intervención · Pregúntale a STR-IG'),
('preguntale-matrimonio-fecha.html','Fecha · Matrimonio · Pregúntale a STR-IG'),
('preguntale-matrimonio-jornada.html','Inicio del permiso · Matrimonio · Pregúntale a STR-IG'),
('preguntale-matrimonio-resultado.html','Resultado · Matrimonio · Pregúntale a STR-IG'),
('preguntale-matrimonio-tipo.html','Matrimonio o pareja de hecho · Pregúntale a STR-IG'),
('preguntale-str-ig.html','Pregúntale a STR-IG'),
('preguntale-str-permisos.html','Permisos retribuidos · Pregúntale a STR-IG'),
('preguntale-traslado-domicilio.html','Traslado de domicilio · Pregúntale a STR-IG'),
('preguntale-visita-medica.html','Visita médica · Pregúntale a STR-IG'),
('preguntale-votaciones.html','Votaciones · Consulta tu caso'),
('revisa-nomina.html','Revisa tu nómina'),
('revisa-tu-nomina-base.html','Revisa tu nómina'),
('revisa-tu-nomina.html','Revisa tu nómina'),
('tu-jornada-laboral.html','Tu jornada laboral'),
('visita-medica.html','Visita médica'),
('votaciones.html','Votaciones'),
('voy-a-votar.html','Voy a votar');
create function public.record_card_access(p_card text) returns void
language plpgsql security definer set search_path = '' as $function$
begin
  if not exists (select 1 from public.app_card_catalog where card=p_card) then
    raise exception 'INVALID_CARD' using errcode='22023';
  end if;
  insert into public.app_card_counts(month,card,accesses)
  values (date_trunc('month',now() at time zone 'Europe/Madrid')::date,p_card,1)
  on conflict (month,card) do update set accesses=public.app_card_counts.accesses+1;
end;
$function$;
revoke all on function public.record_card_access(text) from public;
grant execute on function public.record_card_access(text) to anon, authenticated;
-- Block older app versions before removing their personal event/case records.
revoke all on public.app_analytics_events from public, anon, authenticated;
drop policy if exists "app analytics anonymous insert" on public.app_analytics_events;
drop policy if exists "public analytics insert only" on public.app_analytics_events;
revoke all on public.permit_cases from public, anon, authenticated, service_role;
delete from public.app_analytics_events;
delete from public.permit_cases;
