import { CONTENIDOS, ordenarPorFecha } from './actividad-sindical-datos.mjs';

// Adaptador para conservar el listado mensual y sus rutas existentes.
export const MONTHLY_SUMMARIES = ordenarPorFecha(CONTENIDOS.filter(entrada => entrada.tipo === 'resumen'))
  .map(entrada => ({
    date: entrada.fecha,
    title: entrada.titulo,
    summary: entrada.resumen,
    topics: entrada.temasBreves,
    url: entrada.enlace
  }));
