'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  FileSpreadsheet, 
  TrendingUp, 
  CheckCircle2,
  Layers,
  ArrowRight,
  Sliders
} from 'lucide-react';
import { db } from '../../../lib/db';
import { sanitizeCsvCell, getSyncRequestHeaders } from '../../../lib/security';
import { Area, Plano, ZonaInspeccion, Elemento, Inspeccion, ParametroCubicacion } from '../../../types';
import { calculatePolygonAreaM2, getOrInitGeoreferencia, getPolygonCentroid, pixelToLatLng } from '../../../lib/georeferenceEngine';

interface FilaPresupuestoERP {
  id: string;
  tipoRegistro: 'ZONA' | 'ACTIVO';
  codigoTag: string;
  nombre: string;
  ubicacionErp: string;
  cotaM: string;
  gpsStr: string;
  estadoSalud: string;
  prioridad: 'P1' | 'P2' | 'P3';
  anioAsignado: number;
  m2Superficie: number;
  m2Afectados: number;
  m3Andamio: number;
  kgAceroReemplazo: number;
  hhEstimadas: number;
  costoAndamioUsd: number;
  costoPinturaUsd: number;
  costoEstructurasUsd: number;
  costoTotalUsd: number;
}

export default function PresupuestosPlanMaestroPage() {
  const [horizonteAnios, setHorizonteAnios] = useState<3 | 5>(5);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const [areas, setAreas] = useState<Area[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [zonas, setZonas] = useState<ZonaInspeccion[]>([]);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);
  const [parametros, setParametros] = useState<ParametroCubicacion[]>([]);

  useEffect(() => {
    const loadAll = async () => {
      let loadedAreas = await db.areas.toArray();
      let loadedPlanos = await db.planos.toArray();
      let loadedZonas = await db.zonas.toArray();
      let loadedElementos = await db.elementos.toArray();
      let loadedInspecciones = await db.inspecciones.toArray();
      let loadedParams = await db.parametros.toArray();

      if (loadedZonas.length === 0) {
        try {
          const res = await fetch('/api/sync-neon', { headers: getSyncRequestHeaders() });
          const json = await res.json();
          if (json.success && json.data) {
            for (const a of (json.data.areas || [])) await db.areas.put(a);
            for (const p of (json.data.planos || [])) await db.planos.put(p);
            for (const z of (json.data.zonas || [])) await db.zonas.put(z);
            for (const e of (json.data.elementos || [])) await db.elementos.put(e);
            for (const i of (json.data.inspecciones || [])) await db.inspecciones.put(i);
            loadedAreas = await db.areas.toArray();
            loadedPlanos = await db.planos.toArray();
            loadedZonas = await db.zonas.toArray();
            loadedElementos = await db.elementos.toArray();
            loadedInspecciones = await db.inspecciones.toArray();
          }
        } catch (e) {
          console.warn('Error cargando datos en presupuestos:', e);
        }
      }

      setAreas(loadedAreas);
      setPlanos(loadedPlanos);
      setZonas(loadedZonas);
      setElementos(loadedElementos);
      setInspecciones(loadedInspecciones);
      setParametros(loadedParams);
    };
    loadAll();
  }, []);

  const getParam = (clave: string, fallback: number) => {
    const found = parametros.find(p => p.clave === clave);
    return found ? Number(found.valor_numerico) : fallback;
  };

  const hhPorM2Pintura = getParam('hh_por_m2_pintura_epoxi', 0.45);
  const hhPorKgAcero = getParam('hh_por_kg_acero_reemplazo', 0.12);
  const costoHhMontador = getParam('costo_hh_oficial_montador', 28.50);
  const costoM2Pintura = getParam('costo_m2_sistema_epoxi_poliuretano', 18.20);
  const costoKgAcero = getParam('costo_kg_acero_perfileria', 3.40);
  const costoM3Andamio = getParam('costo_m3_andamio_mes', 12.00);

  // Construir filas reales de presupuesto a partir de las Zonas y Elementos cargados por el usuario
  const filasERP: FilaPresupuestoERP[] = zonas.map((z) => {
    const plano = planos.find(p => p.id === z.plano_id);
    const area = areas.find(a => a.id === plano?.area_id);
    const geoCal = getOrInitGeoreferencia(plano);
    const centroid = getPolygonCentroid(z.poligono_svg?.puntos || []);
    const gps = z.coordenadas_gps_override || pixelToLatLng(centroid.x, centroid.y, geoCal);

    const calcM2 = calculatePolygonAreaM2(z.poligono_svg?.puntos || [], geoCal);
    const m2Superficie = z.superficie_estimada_m2 && z.superficie_estimada_m2 > 0 ? z.superficie_estimada_m2 : (calcM2 || 250);

    const inspZona = inspecciones.filter(i => i.zona_id === z.id || i.elemento_id === `ZONA:${z.codigo}`);
    const ultimaInsp = inspZona[0];

    const salud = ultimaInsp
      ? (ultimaInsp.requiere_reemplazo || ultimaInsp.grado_corrosion === 'Ri 5' ? 'critico' : ultimaInsp.grado_corrosion === 'Ri 4' ? 'malo' : ultimaInsp.grado_corrosion === 'Ri 3' ? 'regular' : 'bueno')
      : (z.estado_salud_apriori || 'regular');

    const prioridad: 'P1' | 'P2' | 'P3' = salud === 'critico' || salud === 'malo' ? 'P1' : salud === 'regular' ? 'P2' : 'P3';
    const anioAsignado = prioridad === 'P1' ? 2026 : prioridad === 'P2' ? 2027 : 2028;

    const pctAfectado = ultimaInsp ? (ultimaInsp.porcentaje_afectado || 25) : (salud === 'critico' ? 60 : salud === 'malo' ? 40 : salud === 'regular' ? 25 : 15);
    const m2Afectados = Math.round((m2Superficie * pctAfectado) / 100);
    const m3Andamio = z.nivel_acceso_andamio?.requiere_andamio !== false ? (z.nivel_acceso_andamio?.envolvente_m3 || 180) : 0;
    const kgAceroReemplazo = (ultimaInsp?.requiere_reemplazo || salud === 'critico') ? Math.round(m2Afectados * 18) : 0;

    const hhPintura = m2Afectados * hhPorM2Pintura;
    const hhAcero = kgAceroReemplazo * hhPorKgAcero;
    const hhEstimadas = Math.round(hhPintura + hhAcero);

    const costoAndamioUsd = Math.round(m3Andamio * costoM3Andamio);
    const costoPinturaUsd = Math.round(m2Afectados * costoM2Pintura + hhPintura * costoHhMontador);
    const costoEstructurasUsd = Math.round(kgAceroReemplazo * costoKgAcero + hhAcero * costoHhMontador);
    const costoTotalUsd = costoAndamioUsd + costoPinturaUsd + costoEstructurasUsd;

    return {
      id: z.id,
      tipoRegistro: 'ZONA',
      codigoTag: z.codigo,
      nombre: z.nombre,
      ubicacionErp: area?.ubicacion_tecnica_erp || area?.codigo || 'PLANTA-GRAL',
      cotaM: `+${(Number(z.cota_nivel || 146000) / 1000).toFixed(1)}m`,
      gpsStr: `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`,
      estadoSalud: salud.toUpperCase(),
      prioridad,
      anioAsignado,
      m2Superficie,
      m2Afectados,
      m3Andamio,
      kgAceroReemplazo,
      hhEstimadas,
      costoAndamioUsd,
      costoPinturaUsd,
      costoEstructurasUsd,
      costoTotalUsd
    };
  });

  const aniosVisibles = horizonteAnios === 3 ? [2026, 2027, 2028] : [2026, 2027, 2028, 2029, 2030];

  const resumenPorAnio = aniosVisibles.map(anio => {
    const itemsAnio = filasERP.filter(f => f.anioAsignado === anio);
    const pintura = itemsAnio.reduce((acc, f) => acc + f.costoPinturaUsd, 0);
    const estructuras = itemsAnio.reduce((acc, f) => acc + f.costoEstructurasUsd, 0);
    const andamios = itemsAnio.reduce((acc, f) => acc + f.costoAndamioUsd, 0);
    const total = pintura + estructuras + andamios;
    const hh = itemsAnio.reduce((acc, f) => acc + f.hhEstimadas, 0);
    const zonasNombres = itemsAnio.map(f => f.codigoTag).join(', ');
    return {
      anio,
      pintura,
      estructuras,
      andamios,
      total,
      hh,
      descripcion: itemsAnio.length > 0 ? `Zonas programadas: ${zonasNombres}` : 'Sin intervenciones asignadas a este período'
    };
  });

  const inversionTotal = filasERP.reduce((acc, f) => acc + f.costoTotalUsd, 0);
  const hhTotales = filasERP.reduce((acc, f) => acc + f.hhEstimadas, 0);
  const maxAnioTotal = Math.max(10000, ...resumenPorAnio.map(r => r.total));

  // Exportar CSV real compatible con SAP PM / Excel
  const handleExportSAP_CSV = () => {
    const headers = [
      'TIPO',
      'UBICACION_TECNICA_ERP',
      'CODIGO_ZONA_O_TAG',
      'DESCRIPCION_SECTOR',
      'COTA_NIVEL',
      'COORDENADAS_GPS',
      'CONDICION_SALUD',
      'PRIORIDAD',
      'ANIO_PLAN',
      'M2_TOTAL_ZONA',
      'M2_PINTURA_INTERVENIR',
      'M3_ANDAMIO',
      'KG_ACERO_REEMPLAZO',
      'HH_ESTIMADAS',
      'COSTO_TOTAL_USD'
    ];

    const rows = filasERP.map(f => [
      sanitizeCsvCell(f.tipoRegistro, false),
      sanitizeCsvCell(f.ubicacionErp, true),
      sanitizeCsvCell(f.codigoTag, true),
      sanitizeCsvCell(f.nombre, true),
      sanitizeCsvCell(f.cotaM, false),
      sanitizeCsvCell(f.gpsStr, true),
      sanitizeCsvCell(f.estadoSalud, false),
      sanitizeCsvCell(f.prioridad, false),
      f.anioAsignado,
      f.m2Superficie,
      f.m2Afectados,
      f.m3Andamio,
      f.kgAceroReemplazo,
      f.hhEstimadas,
      f.costoTotalUsd
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PRESUPUESTO_SAP_PM_RELEVAMIENTO_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportNotice(`Planilla CSV exportada con tus ${filasERP.length} zonas reales para SAP PM / Excel.`);
    setTimeout(() => setExportNotice(null), 4000);
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
            MÓDULO 6 · PLAN MAESTRO & ERP (DATOS REALES DE TU PROYECTO)
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight mt-1">
            Presupuestos Plurianuales y Exportación SAP PM
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Calculado automáticamente cruzando la superficie (`m²`), andamios (`m³`) y estado de tus <strong>Zonas e Inspecciones reales</strong> con los precios unitarios de <strong>Parámetros y Cubicaciones</strong>.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <Link
            href="/ingenieria/parametros"
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sky-300 font-bold text-xs rounded-lg flex items-center space-x-1.5"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Tarifas Unitarias</span>
          </Link>

          <button
            type="button"
            onClick={handleExportSAP_CSV}
            disabled={filasERP.length === 0}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs rounded-lg flex items-center space-x-2 shadow-lg transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exportar CSV (SAP PM)</span>
          </button>
        </div>
      </div>

      {exportNotice && (
        <div className="p-3 bg-emerald-950 border border-emerald-500/50 rounded-lg text-emerald-200 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* KPIs Globales Calculados en Vivo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Horizonte de Planificación
          </span>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              onClick={() => setHorizonteAnios(3)}
              className={`py-2 rounded-lg text-xs font-bold font-mono transition ${
                horizonteAnios === 3 ? 'bg-amber-500 text-black' : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
              }`}
            >
              3 Años
            </button>
            <button
              onClick={() => setHorizonteAnios(5)}
              className={`py-2 rounded-lg text-xs font-bold font-mono transition ${
                horizonteAnios === 5 ? 'bg-amber-500 text-black' : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
              }`}
            >
              5 Años
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Presupuesto Calculado ({filasERP.length} Zonas)
          </span>
          <span className="text-2xl font-black font-mono text-emerald-400 block mt-1">
            ${inversionTotal.toLocaleString()} USD
          </span>
          <span className="text-[10px] text-slate-500 block mt-1">
            Pintura + Andamios + Calderería
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Demanda Total de Mano de Obra
          </span>
          <span className="text-2xl font-black font-mono text-amber-400 block mt-1">
            {hhTotales.toLocaleString()} HH
          </span>
          <span className="text-[10px] text-slate-500 block mt-1">
            Tarifa base: ${costoHhMontador}/HH
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Superficie Total Mapeada
          </span>
          <span className="text-2xl font-black font-mono text-sky-400 block mt-1">
            {filasERP.reduce((acc, f) => acc + f.m2Superficie, 0).toLocaleString()} m²
          </span>
          <span className="text-[10px] text-emerald-400 block mt-1">
            {filasERP.reduce((acc, f) => acc + f.m2Afectados, 0).toLocaleString()} m² a intervenir
          </span>
        </div>
      </div>

      {/* Curva Plurianual Calculada */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-sky-400" />
            <span>Curva de Inversión por Especialidad y Prioridad</span>
          </h3>
          <span className="text-xs text-slate-500 font-mono">P1 → 2026 · P2 → 2027 · P3 → 2028+</span>
        </div>

        <div className="space-y-4 pt-2">
          {resumenPorAnio.map((data) => {
            const pctEstructuras = (data.estructuras / maxAnioTotal) * 100;
            const pctPintura = (data.pintura / maxAnioTotal) * 100;
            const pctAndamios = (data.andamios / maxAnioTotal) * 100;

            return (
              <div key={data.anio} className="space-y-1.5">
                <div className="flex justify-between items-baseline text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-black text-amber-400 text-sm">{data.anio}</span>
                    <span className="text-slate-400 text-[11px] truncate max-w-md">({data.descripcion})</span>
                  </div>
                  <div className="flex items-center space-x-3 font-mono">
                    <span className="text-slate-400">{data.hh} HH</span>
                    <span className="font-bold text-emerald-400">${data.total.toLocaleString()} USD</span>
                  </div>
                </div>

                <div className="w-full h-4 bg-slate-950 rounded-lg overflow-hidden flex border border-slate-800">
                  <div
                    style={{ width: `${pctEstructuras}%` }}
                    className="bg-red-500/80 transition"
                    title={`Calderería/Acero: $${data.estructuras.toLocaleString()} USD`}
                  />
                  <div
                    style={{ width: `${pctPintura}%` }}
                    className="bg-sky-500/80 transition"
                    title={`Pintura Epoxi: $${data.pintura.toLocaleString()} USD`}
                  />
                  <div
                    style={{ width: `${pctAndamios}%` }}
                    className="bg-purple-500/80 transition"
                    title={`Andamios: $${data.andamios.toLocaleString()} USD`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span>Calderería y Acero Estructural</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded-full bg-sky-500" />
            <span>Limpieza Mecánica y Pintura Epoxi</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded-full bg-purple-500" />
            <span>Andamios Multidireccionales</span>
          </div>
        </div>
      </div>

      {/* Tabla Maestra Real para SAP PM */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Listado Maestro de Zonas y Paquetes para Órdenes de Trabajo SAP PM</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">{filasERP.length} registros activos</span>
        </div>

        {filasERP.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 space-y-2">
            <p>Aún no hay zonas delimitadas en el plano para cubicación presupuestaria.</p>
            <Link href="/ingenieria/planos" className="inline-flex items-center space-x-1 text-sky-400 font-bold">
              <span>Ir al Visor de Planos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                  <th className="pb-2">Código Zona</th>
                  <th className="pb-2">Descripción Sector</th>
                  <th className="pb-2">Cota / GPS</th>
                  <th className="pb-2">Condición</th>
                  <th className="pb-2">Sup. Total / Afect.</th>
                  <th className="pb-2">Andamio</th>
                  <th className="pb-2">HH Est.</th>
                  <th className="pb-2">Prioridad</th>
                  <th className="pb-2 text-right">Costo Total USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filasERP.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-950/40">
                    <td className="py-2.5 font-bold text-amber-400">{f.codigoTag}</td>
                    <td className="py-2.5 text-slate-200 font-sans font-medium">{f.nombre}</td>
                    <td className="py-2.5 text-slate-400 text-[10px]">
                      {f.cotaM}
                      <span className="block text-emerald-400">{f.gpsStr}</span>
                    </td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        f.estadoSalud === 'CRITICO' ? 'bg-red-950 text-red-400 border border-red-800' :
                        f.estadoSalud === 'MALO' ? 'bg-orange-950 text-orange-400 border border-orange-800' :
                        f.estadoSalud === 'BUENO' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                        'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}>
                        {f.estadoSalud}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-300">{f.m2Superficie} m² ({f.m2Afectados} m² int.)</td>
                    <td className="py-2.5 text-purple-300">{f.m3Andamio} m³</td>
                    <td className="py-2.5 text-amber-300">{f.hhEstimadas} HH</td>
                    <td className="py-2.5 font-bold text-sky-400">{f.prioridad} ({f.anioAsignado})</td>
                    <td className="py-2.5 text-right font-bold text-emerald-400">${f.costoTotalUsd.toLocaleString()} USD</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
