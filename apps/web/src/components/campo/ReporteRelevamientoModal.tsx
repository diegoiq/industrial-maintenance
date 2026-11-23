'use client';

import React, { useEffect, useState } from 'react';
import { 
  X, 
  Printer, 
  FileSpreadsheet, 
  Clock, 
  Layers, 
  HardHat, 
  Calendar,
  Globe,
  Camera
} from 'lucide-react';
import { Area, Elemento, Inspeccion, ParametroCubicacion, Plano, ZonaInspeccion } from '../../types';
import { db } from '../../lib/db';
import { sanitizeCsvCell } from '../../lib/security';
import { calculatePolygonAreaM2, getOrInitGeoreferencia, getPolygonCentroid, pixelToLatLng } from '../../lib/georeferenceEngine';

interface ReporteRelevamientoModalProps {
  isOpen: boolean;
  onClose: () => void;
  area?: Area;
  elementos: Elemento[];
  inspecciones: Inspeccion[];
  plano?: Plano;
  zonas?: ZonaInspeccion[];
}

export const ReporteRelevamientoModal: React.FC<ReporteRelevamientoModalProps> = ({
  isOpen,
  onClose,
  area,
  elementos,
  inspecciones,
  plano,
  zonas: propZonas
}) => {
  const [zonasLocales, setZonasLocales] = useState<ZonaInspeccion[]>([]);
  const [parametrosLocales, setParametrosLocales] = useState<ParametroCubicacion[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (propZonas && propZonas.length > 0) {
        setZonasLocales(propZonas);
      } else {
        db.zonas.toArray().then(setZonasLocales);
      }
      db.parametros.toArray().then(setParametrosLocales);
    }
  }, [isOpen, propZonas]);

  if (!isOpen) return null;

  const geoCal = getOrInitGeoreferencia(plano);
  const zonasReporte = plano ? zonasLocales.filter(z => z.plano_id === plano.id) : zonasLocales;
  const zonasReporteIds = new Set(zonasReporte.map(z => z.id));
  const zonasReporteCodigos = new Set(zonasReporte.map(z => `ZONA:${z.codigo}`));
  const elementosReporteIds = new Set(elementos.filter(e => zonasReporteIds.has(e.zona_id)).map(e => e.id));

  const inspeccionesReporte = plano
    ? inspecciones.filter(i =>
        (i.zona_id && zonasReporteIds.has(i.zona_id)) ||
        (i.elemento_id && (zonasReporteCodigos.has(i.elemento_id) || elementosReporteIds.has(i.elemento_id)))
      )
    : inspecciones;

  const getParam = (clave: string, fallback: number) => {
    const found = parametrosLocales.find(p => p.clave === clave);
    return found ? Number(found.valor_numerico) : fallback;
  };

  // Métricas consolidadas por Zonas + Elementos (Funciona en Revisión Preliminar de Gabinete y en Relevamiento de Campo)
  const totalZonas = zonasReporte.length;
  const zonasConInspeccion = zonasReporte.filter(z =>
    inspeccionesReporte.some(i => i.zona_id === z.id || i.elemento_id === `ZONA:${z.codigo}`)
  ).length;

  const m2TotalesZonas = zonasReporte.reduce((acc, z) => {
    const calcM2 = calculatePolygonAreaM2(z.poligono_svg?.puntos || [], geoCal);
    return acc + (z.superficie_estimada_m2 && z.superficie_estimada_m2 > 0 ? z.superficie_estimada_m2 : (calcM2 || 250));
  }, 0);

  const m3AndamioTotales = zonasReporte.reduce((acc, z) => {
    return acc + (z.nivel_acceso_andamio?.requiere_andamio !== false ? (z.nivel_acceso_andamio?.envolvente_m3 || 180) : 0);
  }, 0);

  // Estimación preliminar de HH y Presupuesto usando tarifas de db.parametros
  const hhPorM2Pintura = getParam('hh_por_m2_pintura_epoxi', 0.45);
  const costoHhMontador = getParam('costo_hh_oficial_montador', 28.50);
  const costoM2Pintura = getParam('costo_m2_sistema_epoxi_poliuretano', 18.20);
  const costoM3Andamio = getParam('costo_m3_andamio_mes', 12.00);

  const hhPreliminares = Math.round(m2TotalesZonas * 0.30 * hhPorM2Pintura + m3AndamioTotales * 0.12);
  const presupuestoPreliminarUsd = Math.round(
    m2TotalesZonas * 0.30 * costoM2Pintura + hhPreliminares * costoHhMontador + m3AndamioTotales * costoM3Andamio
  );

  const totalFotos = inspeccionesReporte.reduce((acc, i) => acc + (i.fotos?.length || 0), 0);
  const instanciaTexto = inspeccionesReporte.length === 0
    ? 'INSTANCIA 1: REVISIÓN PRELIMINAR DE INGENIERÍA Y ZONIFICACIÓN GEORREFERENCIADA'
    : zonasConInspeccion < totalZonas
    ? `INSTANCIA 2: RELEVAMIENTO DE CAMPO EN PROGRESO (${zonasConInspeccion}/${totalZonas} Zonas relevadas)`
    : 'INSTANCIA 3: RELEVAMIENTO DE CAMPO COMPLETADO Y DOCUMENTADO';

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const headers = [
      'CODIGO_ZONA',
      'NOMBRE_SECTOR',
      'COTA_NIVEL_M',
      'COORDENADAS_GPS',
      'DISCIPLINAS',
      'SUPERFICIE_M2',
      'ANDAMIO_M3',
      'ALTURA_ACCESO_M',
      'MODALIDAD_EJECUCION',
      'CONDICION_PRELIMINAR',
      'INSPECCIONES_REGISTRADAS'
    ];

    const rows = zonasReporte.map(z => {
      const centroid = getPolygonCentroid(z.poligono_svg?.puntos || []);
      const gps = z.coordenadas_gps_override || pixelToLatLng(centroid.x, centroid.y, geoCal);
      const calcM2 = calculatePolygonAreaM2(z.poligono_svg?.puntos || [], geoCal);
      const m2 = z.superficie_estimada_m2 || calcM2 || 250;
      const inspCount = inspeccionesReporte.filter(i => i.zona_id === z.id || i.elemento_id === `ZONA:${z.codigo}`).length;

      return [
        sanitizeCsvCell(z.codigo, true),
        sanitizeCsvCell(z.nombre, true),
        sanitizeCsvCell(`+${(Number(z.cota_nivel || 146000) / 1000).toFixed(1)}m`, false),
        sanitizeCsvCell(`${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`, true),
        sanitizeCsvCell((z.disciplinas_involucradas || []).join(' | '), true),
        m2,
        z.nivel_acceso_andamio?.envolvente_m3 || 180,
        z.nivel_acceso_andamio?.altura_mts || 6.5,
        z.nivel_acceso_andamio?.requiere_parada ? 'PARADA DE PLANTA' : 'EN MARCHA',
        sanitizeCsvCell((z.estado_salud_apriori || 'regular').toUpperCase(), false),
        inspCount
      ].join(';');
    });

    const csvString = [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `INFORME_PRELIMINAR_${(plano?.titulo || 'PLANTA').replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-5xl bg-slate-900 border-2 border-amber-500/70 rounded-2xl overflow-hidden shadow-2xl flex flex-col my-6 max-h-[93vh]">
        {/* Barra superior de acciones (no imprimible) */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-800 border-b border-slate-700 print:hidden flex-shrink-0">
          <div className="flex items-center space-x-2">
            <HardHat className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-black text-white uppercase tracking-wider">
              Informe Modelo — Revisión Preliminar y Relevamiento de Integridad
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg transition shadow"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Guardar PDF</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition shadow"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar CSV (SAP PM)</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Documento Imprimible A4 */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 text-slate-100 bg-slate-950 print:bg-white print:text-black">
          {/* 1. ENCABEZADO OFICIAL CORPORATIVO */}
          <div className="border-b-2 border-amber-500 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-mono text-amber-400 uppercase tracking-widest font-black block print:text-amber-700">
                INDUSTRIAL MAINTENANCE · ASSET INTEGRITY & CORROSION MANAGEMENT
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight print:text-black mt-0.5">
                INFORME TÉCNICO DE REVISIÓN PRELIMINAR Y ZONIFICACIÓN
              </h1>
              <p className="text-xs text-slate-300 print:text-gray-700 mt-1">
                Planta / Área: <strong className="text-white print:text-black">{area ? `${area.codigo} — ${area.nombre}` : 'Celulosa Puerto Esperanza'}</strong> · Plano: <strong>{plano ? plano.titulo : 'LAY OUT GENERAL'}</strong>
              </p>
              <p className="text-[11px] font-mono text-emerald-400 print:text-emerald-700 mt-0.5 flex items-center space-x-1">
                <Globe className="w-3.5 h-3.5 inline mr-1" />
                <span>
                  Georreferencia Satelital: Lat {geoCal.anchorLat.toFixed(5)}, Lng {geoCal.anchorLng.toFixed(5)} · Escala: {geoCal.metersPerPixel.toFixed(4)} m/px · Norte: {geoCal.rotationDeg}°
                </span>
              </p>
            </div>

            <div className="text-right text-xs bg-slate-900 print:bg-gray-100 p-3 rounded-xl border border-slate-800 print:border-gray-300 flex-shrink-0">
              <div className="flex items-center justify-end space-x-1.5 text-slate-200 print:text-black">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Emisión: <strong>{new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong></span>
              </div>
              <span className="text-[10px] font-mono text-sky-400 print:text-sky-700 font-bold block mt-1">
                {instanciaTexto}
              </span>
            </div>
          </div>

          {/* 2. RESUMEN EJECUTIVO DE KPIS DE INGENIERÍA */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900 print:bg-gray-100 p-3.5 rounded-xl border border-slate-800 print:border-gray-300">
              <span className="text-[10px] uppercase text-slate-400 print:text-gray-600 font-bold block">Zonas Delimitadas</span>
              <span className="text-2xl font-black text-sky-400 print:text-sky-800 font-mono">{totalZonas} Zonas</span>
              <span className="text-[11px] text-slate-400 print:text-gray-600 block mt-0.5">
                {elementos.length} hallazgos / pines puntuales
              </span>
            </div>

            <div className="bg-slate-900 print:bg-gray-100 p-3.5 rounded-xl border border-slate-800 print:border-gray-300">
              <span className="text-[10px] uppercase text-slate-400 print:text-gray-600 font-bold block">Superficie Estimada</span>
              <span className="text-2xl font-black text-white print:text-black font-mono">{m2TotalesZonas.toLocaleString()} m²</span>
              <span className="text-[11px] text-emerald-400 print:text-emerald-700 block mt-0.5">
                Alcance de protección anticorrosiva
              </span>
            </div>

            <div className="bg-slate-900 print:bg-gray-100 p-3.5 rounded-xl border border-slate-800 print:border-gray-300">
              <span className="text-[10px] uppercase text-slate-400 print:text-gray-600 font-bold block">Envolvente Andamios</span>
              <span className="text-2xl font-black text-purple-400 print:text-purple-800 font-mono">{m3AndamioTotales.toLocaleString()} m³</span>
              <span className="text-[11px] text-slate-400 print:text-gray-600 block mt-0.5">
                Andamio compartido multifunción
              </span>
            </div>

            <div className="bg-slate-900 print:bg-gray-100 p-3.5 rounded-xl border border-slate-800 print:border-gray-300">
              <span className="text-[10px] uppercase text-slate-400 print:text-gray-600 font-bold block">Estimación Preliminar</span>
              <span className="text-2xl font-black text-emerald-400 print:text-emerald-800 font-mono">${presupuestoPreliminarUsd.toLocaleString()}</span>
              <span className="text-[11px] text-amber-400 print:text-amber-700 block mt-0.5 font-mono">
                ~{hhPreliminares} HH estimadas
              </span>
            </div>
          </div>

          {/* 3. MATRIZ MAESTRA DE ZONAS DE INSPECCIÓN Y PAQUETES DE TRABAJO */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-extrabold text-slate-200 print:text-black uppercase tracking-wider flex items-center space-x-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <span>1. Matriz de Zonas de Inspección Georreferenciadas y Requerimientos de Acceso</span>
            </h3>

            <div className="border border-slate-800 print:border-gray-300 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 print:bg-gray-200 text-slate-300 print:text-gray-800 border-b border-slate-800 print:border-gray-300 font-mono text-[10px] uppercase">
                    <th className="p-2.5">Código Zona</th>
                    <th className="p-2.5">Sector / Alcance</th>
                    <th className="p-2.5">Cota & Coordenadas GPS</th>
                    <th className="p-2.5">Superficie</th>
                    <th className="p-2.5">Acceso / Andamio</th>
                    <th className="p-2.5">Condición / Ventana</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 print:divide-gray-300">
                  {zonasReporte.map((z) => {
                    const centroid = getPolygonCentroid(z.poligono_svg?.puntos || []);
                    const gps = z.coordenadas_gps_override || pixelToLatLng(centroid.x, centroid.y, geoCal);
                    const calcM2 = calculatePolygonAreaM2(z.poligono_svg?.puntos || [], geoCal);
                    const m2 = z.superficie_estimada_m2 || calcM2 || 250;
                    const inspZona = inspecciones.filter(i => i.zona_id === z.id || i.elemento_id === `ZONA:${z.codigo}`);
                    const ultimaInsp = inspZona[0];

                    return (
                      <tr key={z.id} className="hover:bg-slate-900/50">
                        <td className="p-2.5 font-mono font-black text-amber-400 print:text-amber-800">
                          {z.codigo}
                          {z.area_planta && (
                            <span className="block text-[9px] font-sans font-bold text-emerald-400 print:text-emerald-700 mt-0.5">
                              {z.area_planta}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5">
                          <span className="font-bold text-white print:text-black block">{z.nombre}</span>
                          <span className="text-[10px] text-slate-400 print:text-gray-600 capitalize">
                            {(z.disciplinas_involucradas || ['estructuras_acero']).map(d => d.replace(/_/g, ' ')).join(', ')}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono text-[11px] text-slate-300 print:text-gray-800">
                          Cota +{(Number(z.cota_nivel || 146000) / 1000).toFixed(1)} m
                          <span className="block text-[10px] text-emerald-400 print:text-emerald-700">
                            {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono font-bold text-white print:text-black">
                          {m2} m²
                        </td>
                        <td className="p-2.5 font-mono text-[11px] text-purple-300 print:text-purple-800">
                          {z.nivel_acceso_andamio?.envolvente_m3 || 180} m³ (H: {z.nivel_acceso_andamio?.altura_mts || 6.5}m)
                          <span className="block text-[10px] text-slate-400 print:text-gray-600 capitalize">
                            {z.nivel_acceso_andamio?.tipo_acceso?.replace(/_/g, ' ') || 'Andamio tubular'}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono bg-slate-800 text-amber-300 border border-slate-700 print:bg-gray-200 print:text-black">
                            {ultimaInsp ? `${ultimaInsp.grado_corrosion} (${ultimaInsp.porcentaje_afectado}%)` : (z.estado_salud_apriori || 'REGULAR')}
                          </span>
                          <span className="block text-[10px] text-slate-400 print:text-gray-600 mt-0.5 font-mono">
                            {z.nivel_acceso_andamio?.requiere_parada ? '🔴 Parada de Planta' : '🟢 En Marcha'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. REGISTRO DE HALLAZGOS DE CAMPO, FOTOS Y DIAGNÓSTICO TÉCNICO */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-extrabold text-slate-200 print:text-black uppercase tracking-wider flex items-center space-x-2">
              <Camera className="w-4 h-4 text-amber-400" />
              <span>2. Relevamiento de Campo, Hallazgos Puntuales y Registro Fotográfico ({inspeccionesReporte.length} inspecciones · {totalFotos} fotos)</span>
            </h3>

            {inspeccionesReporte.length === 0 && elementos.length === 0 ? (
              <div className="p-4 bg-slate-900 print:bg-gray-100 rounded-xl border border-slate-800 print:border-gray-300 text-xs text-slate-300 print:text-gray-700 space-y-1">
                <p className="font-bold text-amber-400 print:text-amber-800">
                  📋 Estado Documental: Revisión Preliminar de Ingeniería (Previo a Salida de Campo)
                </p>
                <p>
                  Se han delimitado, georreferenciado y pre-cubicado las <strong>{totalZonas} Zonas de Inspección</strong> sobre el plano general. A medida que el inspector recorra las zonas con la App de Campo (`/campo`) y capture fotografías o hallazgos, se anexarán automáticamente en esta sección con su evaluación normativa ISO 4628-3.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {inspeccionesReporte.map((insp) => (
                  <div key={insp.id} className="p-4 bg-slate-900 print:bg-gray-100 rounded-xl border border-slate-800 print:border-gray-300 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 print:border-gray-300 pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-black text-amber-400 print:text-black">
                          {insp.zona_codigo ? `ZONA: ${insp.zona_codigo}` : insp.elemento_id}
                        </span>
                        <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-700 rounded font-mono text-[10px] font-bold">
                          ISO 4628: {insp.grado_corrosion} ({insp.porcentaje_afectado}% afectado)
                        </span>
                        {insp.coordenadas_gps && (
                          <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-700 rounded font-mono text-[10px]">
                            📍 GPS Operario: {insp.coordenadas_gps.lat.toFixed(5)}, {insp.coordenadas_gps.lng.toFixed(5)} (±{insp.coordenadas_gps.precision_m || 5}m)
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-slate-400">
                        Fecha: {new Date(insp.fecha_inspeccion).toLocaleDateString()} · {insp.inspector_nombre || 'Inspector Planta'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-300 print:text-gray-800 flex flex-wrap gap-3">
                      <span><strong>Sustrato:</strong> {insp.clasificacion_sustrato.replace(/_/g, ' ')}</span>
                      <span><strong>Recubrimiento:</strong> {insp.clasificacion_recubrimiento.replace(/_/g, ' ')}</span>
                      {insp.historial_recorrido_gps && insp.historial_recorrido_gps.length > 0 && (
                        <span className="text-emerald-400 print:text-emerald-800 font-mono">
                          🛰️ Recorrido registrado: {insp.historial_recorrido_gps.length} posiciones GPS
                        </span>
                      )}
                    </div>

                    {insp.muestreo_tramo?.aplica && (
                      <div className="p-2 bg-slate-950 print:bg-gray-100 rounded border border-sky-500/30 text-[11px] font-mono text-sky-200 print:text-black">
                        Muestreo Tramo {insp.muestreo_tramo.longitud_tramo_m}m: {insp.muestreo_tramo.unidades_afectadas}/{insp.muestreo_tramo.unidades_totales} unid. ({insp.muestreo_tramo.extension_normalizada_pct}%) · Morfología: {insp.muestreo_tramo.morfologia_dominante.replace(/_/g, ' ')} · ISO 12944: {insp.muestreo_tramo.ambiente_iso12944} · Tasa: {insp.muestreo_tramo.tasa_calculada_pct_anio}%/año
                      </div>
                    )}

                    {insp.evaluacion_civil?.aplica && insp.evaluacion_civil.items?.length > 0 && (
                      <div className="p-2.5 bg-slate-950 print:bg-gray-200 rounded-lg border border-amber-500/30 space-y-1.5">
                        <span className="text-[10px] font-mono font-bold uppercase text-amber-400 print:text-amber-800 block">
                          🏗️ Evaluaciones Civiles (Juntas, Tabiques, Columnas, Vigas, Losas, Bases de Bombas)
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {insp.evaluacion_civil.items.map((civ, cIdx) => (
                            <div key={cIdx} className="text-[11px] bg-slate-900 print:bg-white p-1.5 rounded border border-slate-800 print:border-gray-300">
                              <div className="flex items-center justify-between">
                                <strong className="text-white print:text-black">{civ.elemento_civil}</strong>
                                <span className="uppercase font-mono text-[10px] font-bold text-amber-300 print:text-black">
                                  [{civ.estado}]
                                </span>
                              </div>
                              {civ.patologias && civ.patologias.length > 0 && (
                                <span className="text-[10px] text-slate-400 print:text-gray-700 block">
                                  Patologías: {civ.patologias.join(', ')}
                                </span>
                              )}
                              {civ.observacion && (
                                <span className="text-[10px] text-slate-300 print:text-black italic block">
                                  &quot;{civ.observacion}&quot;
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        {insp.evaluacion_civil.notas_civiles && (
                          <p className="text-[11px] text-slate-300 print:text-black pt-1">
                            <strong>Nota Civil:</strong> {insp.evaluacion_civil.notas_civiles}
                          </p>
                        )}
                      </div>
                    )}

                    {insp.observaciones && (
                      <p className="text-slate-200 print:text-black italic">
                        <strong>Observaciones / Dictamen:</strong> "{insp.observaciones}"
                      </p>
                    )}

                    {insp.diagnostico_ia?.evaluacion_normativa && (
                      <div className="p-2.5 bg-purple-950/30 print:bg-gray-100 rounded-lg border border-purple-500/40 print:border-gray-300 space-y-1">
                        <span className="text-[10px] font-mono font-bold uppercase text-purple-300 print:text-purple-900 block">
                          🤖 Dictamen Técnico Validado (IA + Ingeniería) — {insp.diagnostico_ia.evaluacion_normativa.norma_referencia}
                        </span>
                        <p className="text-[11px] text-slate-200 print:text-black">
                          <strong>Morfología:</strong> {insp.diagnostico_ia.evaluacion_normativa.tipo_morfologia} ·{' '}
                          <strong>Ensayo Sugerido:</strong> {insp.diagnostico_ia.evaluacion_normativa.ensayo_complementario_sugerido}
                        </p>
                        {insp.diagnostico_ia.sugerencia_intervencion?.sistema_recomendado && (
                          <p className="text-[11px] text-slate-300 print:text-black">
                            <strong>Esquema Recomendado:</strong> {insp.diagnostico_ia.sugerencia_intervencion.sistema_recomendado}
                          </p>
                        )}
                        {insp.diagnostico_ia.nota_validacion && (
                          <p className="text-[10px] text-emerald-300 print:text-emerald-800 font-mono">
                            ✓ Validado: {insp.diagnostico_ia.nota_validacion}
                          </p>
                        )}
                      </div>
                    )}

                    {insp.fotos && insp.fotos.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        {insp.fotos.map((f, idx) => (
                          <div key={f.id || idx} className="bg-slate-950 print:bg-white rounded-lg overflow-hidden border border-slate-800 print:border-gray-300">
                            <img
                              src={f.storage_url || f.thumbnail_data_url}
                              alt={`Foto ${idx + 1}`}
                              className="w-full h-28 object-cover"
                            />
                            {f.comentario && (
                              <p className="p-1.5 text-[10px] text-slate-300 print:text-black truncate">
                                #{idx + 1}: {f.comentario}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. CUADRO DE FIRMAS Y APROBACIÓN TÉCNICA */}
          <div className="pt-8 border-t border-slate-800 print:border-gray-400 grid grid-cols-2 gap-8 text-center text-xs">
            <div className="space-y-1">
              <div className="border-b border-slate-700 print:border-gray-400 h-12 w-48 mx-auto" />
              <span className="font-bold text-slate-200 print:text-black block">Responsable de Relevamiento en Planta</span>
              <span className="text-[10px] text-slate-400 print:text-gray-600">Inspección y Verificación Operativa</span>
            </div>
            <div className="space-y-1">
              <div className="border-b border-slate-700 print:border-gray-400 h-12 w-48 mx-auto" />
              <span className="font-bold text-slate-200 print:text-black block">Ingeniería de Mantenimiento e Integridad</span>
              <span className="text-[10px] text-slate-400 print:text-gray-600">Aprobación de Alcance y Presupuesto</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
