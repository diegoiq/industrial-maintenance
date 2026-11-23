'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Map,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  CalendarDays,
  ArrowRight,
  ShieldCheck,
  Layers
} from 'lucide-react';
import { db } from '../../lib/db';
import { getSyncRequestHeaders } from '../../lib/security';
import { Area, Plano, ZonaInspeccion, Elemento, Inspeccion, ParametroCubicacion } from '../../types';
import { calculatePolygonAreaM2, getOrInitGeoreferencia } from '../../lib/georeferenceEngine';
import { extractTarifasFromParams, projectAssetTimeline } from '../../lib/degradationModel';

export default function IngenieriaDashboardPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [zonas, setZonas] = useState<ZonaInspeccion[]>([]);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);
  const [parametros, setParametros] = useState<ParametroCubicacion[]>([]);

  useEffect(() => {
    const loadAll = async () => {
      let lZonas = await db.zonas.toArray();
      if (lZonas.length === 0) {
        try {
          const res = await fetch('/api/sync-neon', { headers: getSyncRequestHeaders() });
          const json = await res.json();
          if (json.success && json.data) {
            for (const a of (json.data.areas || [])) await db.areas.put(a);
            for (const p of (json.data.planos || [])) await db.planos.put(p);
            for (const z of (json.data.zonas || [])) await db.zonas.put(z);
            for (const e of (json.data.elementos || [])) await db.elementos.put(e);
            for (const i of (json.data.inspecciones || [])) await db.inspecciones.put(i);
            for (const prm of (json.data.parametros || [])) await db.parametros.put(prm);
          }
        } catch {
          // Modo offline
        }
      }

      const [a, p, z, e, i, prm] = await Promise.all([
        db.areas.toArray(),
        db.planos.toArray(),
        db.zonas.toArray(),
        db.elementos.toArray(),
        db.inspecciones.toArray(),
        db.parametros.toArray()
      ]);
      setAreas(a);
      setPlanos(p);
      setZonas(z);
      setElementos(e);
      setInspecciones(i);
      setParametros(prm);
    };
    loadAll();
  }, []);

  const tarifas = extractTarifasFromParams(parametros);

  const zonasConEstado = zonas.map(z => {
    const plano = planos.find(p => p.id === z.plano_id);
    const geoCal = getOrInitGeoreferencia(plano);
    const m2 = z.superficie_estimada_m2 && z.superficie_estimada_m2 > 0
      ? z.superficie_estimada_m2
      : (calculatePolygonAreaM2(z.poligono_svg?.puntos || [], geoCal) || 250);
    const m3 = z.nivel_acceso_andamio?.requiere_andamio !== false ? (z.nivel_acceso_andamio?.envolvente_m3 || 180) : 0;
    const inspZona = inspecciones.filter(i => i.zona_id === z.id || i.elemento_id === `ZONA:${z.codigo}`);
    const ultimaInsp = inspZona[0];
    const salud = ultimaInsp
      ? (ultimaInsp.requiere_reemplazo || ultimaInsp.grado_corrosion === 'Ri 5' ? 'critico' : ultimaInsp.grado_corrosion === 'Ri 4' ? 'malo' : ultimaInsp.grado_corrosion === 'Ri 3' ? 'regular' : 'bueno')
      : (z.estado_salud_apriori || 'regular');

    const proj = projectAssetTimeline({
      m2Superficie: m2,
      m3Andamio: m3,
      saludFallback: salud,
      ultimaInspeccion: ultimaInsp,
      tarifas
    });

    return { zona: z, plano, salud, relevada: inspZona.length > 0, m2, m3, proj };
  });

  const totalZonas = zonasConEstado.length;
  const zonasRelevadas = zonasConEstado.filter(x => x.relevada).length;
  const avancePct = totalZonas > 0 ? Math.round((zonasRelevadas / totalZonas) * 100) : 0;

  const criticas = zonasConEstado.filter(x => x.salud === 'critico' || x.salud === 'malo');
  const capexOportuno = zonasConEstado.reduce((acc, x) => acc + x.proj.costoIntervencionTempranaUsd, 0);
  const costoPostergado = zonasConEstado.reduce((acc, x) => acc + x.proj.costoNoIntervencionUsd, 0);
  const ahorroPotencial = Math.max(0, costoPostergado - capexOportuno);

  const distSalud = {
    critico: zonasConEstado.filter(x => x.salud === 'critico').length,
    malo: zonasConEstado.filter(x => x.salud === 'malo').length,
    regular: zonasConEstado.filter(x => x.salud === 'regular').length,
    bueno: zonasConEstado.filter(x => x.salud === 'bueno').length
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
            <LayoutDashboard className="w-4 h-4" />
            <span>TABLERO EJECUTIVO DE INTEGRIDAD DE ACTIVOS</span>
          </span>
          <h1 className="text-2xl font-black text-white mt-1">Resumen General de Planta y Toma de Decisiones</h1>
          <p className="text-xs text-slate-400 mt-1">
            Consolidado en tiempo real de {areas.length} áreas, {planos.length} planos, {totalZonas} zonas y {elementos.length} hallazgos puntuales.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/ingenieria/planos"
            className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg flex items-center space-x-1.5 shadow"
          >
            <Map className="w-4 h-4" />
            <span>Abrir Visor de Planos</span>
          </Link>
          <Link
            href="/ingenieria/presupuestos"
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center space-x-1.5 shadow"
          >
            <Clock className="w-4 h-4" />
            <span>Timeline y Presupuestos</span>
          </Link>
        </div>
      </div>

      {/* KPIs Ejecutivos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avance de Relevamiento</span>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black font-mono text-sky-400">{avancePct}%</span>
            <span className="text-xs text-slate-400 font-mono">({zonasRelevadas}/{totalZonas} zonas)</span>
          </div>
          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden mt-2">
            <div className="h-full bg-sky-500" style={{ width: `${avancePct}%` }} />
          </div>
        </div>

        <div className="bg-slate-900 border border-red-500/30 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Zonas Prioridad P1 (Crítico/Malo)</span>
          <span className="text-2xl font-black font-mono text-red-400 block">{criticas.length}</span>
          <span className="text-[11px] text-slate-400 block">
            {distSalud.critico} críticas · {distSalud.malo} deterioro severo
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CAPEX Intervención Oportuna</span>
          <span className="text-2xl font-black font-mono text-emerald-400 block">
            ${capexOportuno.toLocaleString()} USD
          </span>
          <span className="text-[11px] text-slate-400 block">Plan 2026–2030 con tarifas vigentes</span>
        </div>

        <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Ahorro vs. No-Intervención</span>
          <span className="text-2xl font-black font-mono text-amber-400 block">
            +${ahorroPotencial.toLocaleString()} USD
          </span>
          <span className="text-[11px] text-slate-400 block">
            Evita escalar a ${costoPostergado.toLocaleString()} USD
          </span>
        </div>
      </div>

      {/* Distribución por Condición y Ranking Crítico */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-white flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Distribución de Integridad</span>
          </h2>
          <div className="space-y-3 text-xs">
            {[
              { label: 'Crítico (Ri 5 / Reemplazo)', count: distSalud.critico, color: 'bg-red-500' },
              { label: 'Malo (Ri 4)', count: distSalud.malo, color: 'bg-orange-500' },
              { label: 'Regular (Ri 3)', count: distSalud.regular, color: 'bg-amber-400' },
              { label: 'Bueno (Ri 1–Ri 2)', count: distSalud.bueno, color: 'bg-emerald-500' }
            ].map(item => (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-300">{item.label}</span>
                  <span className="font-mono font-bold text-white">{item.count}</span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color}`}
                    style={{ width: `${totalZonas > 0 ? (item.count / totalZonas) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-white flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span>Ranking de Zonas Prioritarias para Decisión</span>
            </h2>
            <Link href="/ingenieria/campanas" className="text-xs text-sky-400 font-bold flex items-center space-x-1">
              <span>Ver Campañas</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {zonasConEstado.length === 0 ? (
            <p className="text-xs text-slate-400">No hay zonas cargadas todavía. Ingresa al Visor de Planos para delimitar sectores.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase">
                    <th className="pb-2">Zona</th>
                    <th className="pb-2">Estado</th>
                    <th className="pb-2">Año Óptimo</th>
                    <th className="pb-2">Costo Oportuno</th>
                    <th className="pb-2 text-right">Consecuencia si Posterga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {zonasConEstado
                    .sort((a, b) => a.proj.anioRecomendado - b.proj.anioRecomendado)
                    .slice(0, 6)
                    .map(({ zona, salud, proj }) => (
                      <tr key={zona.id}>
                        <td className="py-2 font-mono font-bold text-amber-400">{zona.codigo}</td>
                        <td className="py-2 uppercase font-mono text-[10px]">{salud}</td>
                        <td className="py-2 font-mono text-sky-300">{proj.anioRecomendado}</td>
                        <td className="py-2 font-mono text-emerald-400">${proj.costoIntervencionTempranaUsd.toLocaleString()}</td>
                        <td className="py-2 text-right text-[11px] text-slate-400 max-w-xs truncate">{proj.consecuenciaSiPosterga}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Accesos Rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <Link href="/ingenieria/campanas" className="p-4 bg-slate-900 hover:bg-slate-800/80 border border-slate-800 rounded-xl flex items-center justify-between transition">
          <div className="flex items-center space-x-3">
            <CalendarDays className="w-5 h-5 text-amber-400" />
            <div>
              <span className="font-bold text-white block">Campañas y Andamios</span>
              <span className="text-[11px] text-slate-400">Optimización compartida y pliegos</span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-500" />
        </Link>
        <Link href="/ingenieria/presupuestos" className="p-4 bg-slate-900 hover:bg-slate-800/80 border border-slate-800 rounded-xl flex items-center justify-between transition">
          <div className="flex items-center space-x-3">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <div>
              <span className="font-bold text-white block">Presupuestos SAP PM</span>
              <span className="text-[11px] text-slate-400">Timeline 2026–2030 y exportación CSV</span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-500" />
        </Link>
        <Link href="/ingenieria/diagnostico-ia" className="p-4 bg-slate-900 hover:bg-slate-800/80 border border-slate-800 rounded-xl flex items-center justify-between transition">
          <div className="flex items-center space-x-3">
            <Layers className="w-5 h-5 text-purple-400" />
            <div>
              <span className="font-bold text-white block">Diagnóstico IA (Gemini)</span>
              <span className="text-[11px] text-slate-400">Validación Human-in-the-Loop</span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-500" />
        </Link>
      </div>
    </div>
  );
}
