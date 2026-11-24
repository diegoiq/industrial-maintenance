'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Filter,
  Paintbrush,
  Wrench,
  AlertTriangle,
  Building2,
  Layers,
  FileSpreadsheet,
  Clock,
  Camera,
  ArrowRight,
  HardHat
} from 'lucide-react';
import { db } from '../../../lib/db';
import { getSyncRequestHeaders, sanitizeCsvCell } from '../../../lib/security';
import { Area, Elemento, Inspeccion, ParametroCubicacion, Plano, ZonaInspeccion } from '../../../types';
import { calculatePolygonAreaM2, getOrInitGeoreferencia } from '../../../lib/georeferenceEngine';
import { extractTarifasFromParams, projectAssetTimeline } from '../../../lib/degradationModel';

type AlcanceFilter = 'todos' | 'anticorrosivo' | 'reparaciones' | 'reemplazos';

export default function AnalisisAreaZonaPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [zonas, setZonas] = useState<ZonaInspeccion[]>([]);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);
  const [parametros, setParametros] = useState<ParametroCubicacion[]>([]);

  const [selectedAreaNombre, setSelectedAreaNombre] = useState<string>('todas');
  const [selectedZonaId, setSelectedZonaId] = useState<string>('todas');
  const [alcanceFilter, setAlcanceFilter] = useState<AlcanceFilter>('todos');
  const [soloRelevadas, setSoloRelevadas] = useState<boolean>(false);

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

  const tarifas = useMemo(() => extractTarifasFromParams(parametros), [parametros]);

  const areaOpciones = useMemo(() => {
    const setNombres = new Set<string>();
    areas.forEach(a => {
      if (a.codigo !== 'PLANTA GENERAL') setNombres.add(a.nombre);
    });
    zonas.forEach(z => {
      if (z.area_planta) setNombres.add(z.area_planta);
    });
    return Array.from(setNombres).sort();
  }, [areas, zonas]);

  const zonasAnalisis = useMemo(() => {
    return zonas
      .map((z) => {
        const plano = planos.find(p => p.id === z.plano_id);
        const geoCal = getOrInitGeoreferencia(plano);
        const m2Total = z.superficie_estimada_m2 && z.superficie_estimada_m2 > 0
          ? z.superficie_estimada_m2
          : (calculatePolygonAreaM2(z.poligono_svg?.puntos || [], geoCal) || 250);

        const inspZona = inspecciones
          .filter(i => i.zona_id === z.id || i.elemento_id === `ZONA:${z.codigo}`)
          .sort((a, b) => new Date(b.fecha_inspeccion).getTime() - new Date(a.fecha_inspeccion).getTime());

        const elemsZona = elementos.filter(e => e.zona_id === z.id);
        const ultimaInsp = inspZona[0];

        const salud = ultimaInsp
          ? (ultimaInsp.requiere_reemplazo || ultimaInsp.grado_corrosion === 'Ri 5' ? 'critico' : ultimaInsp.grado_corrosion === 'Ri 4' ? 'malo' : ultimaInsp.grado_corrosion === 'Ri 3' ? 'regular' : 'bueno')
          : (z.estado_salud_apriori || 'regular');

        const m3Andamio = z.nivel_acceso_andamio?.requiere_andamio !== false
          ? (z.nivel_acceso_andamio?.envolvente_m3 || 180)
          : 0;

        const proj = projectAssetTimeline({
          m2Superficie: m2Total,
          m3Andamio,
          saludFallback: salud,
          ultimaInspeccion: ultimaInsp,
          inspeccionesHistoricas: inspZona,
          tarifas
        });

        const pctAfectado = proj.porcentajeActual;
        const m2Anticorrosivo = Math.max(1, Math.round((m2Total * pctAfectado) / 100));
        const requiereReemplazo = Boolean(ultimaInsp?.requiere_reemplazo) || salud === 'critico';
        const kgAceroReemplazo = requiereReemplazo ? Math.round(m2Anticorrosivo * 18) : 0;

        // Reparaciones civiles o hallazgos puntuales
        const itemsCiviles = inspZona.flatMap(i => i.evaluacion_civil?.aplica ? (i.evaluacion_civil.items || []) : []);
        const reparacionesCount = itemsCiviles.length + elemsZona.filter(e => e.estado_actual !== 'verde' && e.estado_actual !== 'gris').length;
        const tieneReparaciones = reparacionesCount > 0 || (z.disciplinas_involucradas || []).some(d => d.includes('hormigon') || d.includes('civil') || d.includes('soportes'));

        const hhAnticorrosivo = Math.round(m2Anticorrosivo * tarifas.hhPorM2Pintura);
        const hhReemplazo = Math.round(kgAceroReemplazo * tarifas.hhPorKgAcero);
        const costoAnticorrosivoUsd = Math.round(m2Anticorrosivo * tarifas.costoM2Pintura + hhAnticorrosivo * tarifas.costoHhMontador);
        const costoReemplazoUsd = Math.round(kgAceroReemplazo * tarifas.costoKgAcero + hhReemplazo * tarifas.costoHhMontador);
        const costoAndamioUsd = Math.round(m3Andamio * tarifas.costoM3Andamio);
        const totalFotos = inspZona.reduce((acc, i) => acc + (i.fotos?.length || 0), 0);

        return {
          zona: z,
          areaNombre: z.area_planta || 'Sin Área Asignada',
          planoTitulo: plano?.titulo || 'Plano General',
          salud,
          relevada: inspZona.length > 0,
          ultimaInsp,
          inspZona,
          elemsZona,
          itemsCiviles,
          reparacionesCount,
          tieneReparaciones,
          requiereReemplazo,
          m2Total,
          m2Anticorrosivo,
          kgAceroReemplazo,
          m3Andamio,
          hhAnticorrosivo,
          hhReemplazo,
          costoAnticorrosivoUsd,
          costoReemplazoUsd,
          costoAndamioUsd,
          costoTotalUsd: costoAnticorrosivoUsd + costoReemplazoUsd + costoAndamioUsd,
          totalFotos,
          proj
        };
      });
  }, [zonas, planos, inspecciones, elementos, tarifas]);

  const zonasFiltradas = useMemo(() => {
    return zonasAnalisis.filter((item) => {
      if (selectedAreaNombre !== 'todas' && item.areaNombre.toLowerCase() !== selectedAreaNombre.toLowerCase()) {
        return false;
      }
      if (selectedZonaId !== 'todas' && item.zona.id !== selectedZonaId) {
        return false;
      }
      if (soloRelevadas && !item.relevada) {
        return false;
      }
      if (alcanceFilter === 'reemplazos' && !item.requiereReemplazo) return false;
      if (alcanceFilter === 'reparaciones' && !item.tieneReparaciones) return false;
      if (alcanceFilter === 'anticorrosivo' && item.m2Anticorrosivo <= 0) return false;
      return true;
    });
  }, [zonasAnalisis, selectedAreaNombre, selectedZonaId, soloRelevadas, alcanceFilter]);

  const resumen = useMemo(() => {
    return zonasFiltradas.reduce(
      (acc, z) => {
        acc.m2Anticorrosivo += z.m2Anticorrosivo;
        acc.costoAnticorrosivo += z.costoAnticorrosivoUsd;
        acc.hhAnticorrosivo += z.hhAnticorrosivo;
        acc.reparaciones += z.reparacionesCount;
        acc.kgReemplazo += z.kgAceroReemplazo;
        acc.costoReemplazo += z.costoReemplazoUsd;
        acc.hhReemplazo += z.hhReemplazo;
        acc.m3Andamio += z.m3Andamio;
        acc.costoAndamio += z.costoAndamioUsd;
        acc.costoTotal += z.costoTotalUsd;
        acc.costoNoInterv += z.proj.costoNoIntervencionUsd;
        acc.zonasParada += z.zona.nivel_acceso_andamio?.requiere_parada ? 1 : 0;
        acc.fotos += z.totalFotos;
        return acc;
      },
      {
        m2Anticorrosivo: 0,
        costoAnticorrosivo: 0,
        hhAnticorrosivo: 0,
        reparaciones: 0,
        kgReemplazo: 0,
        costoReemplazo: 0,
        hhReemplazo: 0,
        m3Andamio: 0,
        costoAndamio: 0,
        costoTotal: 0,
        costoNoInterv: 0,
        zonasParada: 0,
        fotos: 0
      }
    );
  }, [zonasFiltradas]);

  const handleExportAlcanceCSV = () => {
    const headers = [
      'AREA',
      'CODIGO_ZONA',
      'SECTOR',
      'COTA_M',
      'GRADO_ISO',
      'PCT_AFECTADO',
      'ALCANCE_ANTICORROSIVO_M2',
      'COSTO_ANTICORROSIVO_USD',
      'REPARACIONES_CIVILES_HALLAZGOS',
      'REEMPLAZO_ESTRUCTURAL_KG',
      'COSTO_REEMPLAZO_USD',
      'ANDAMIO_M3',
      'COSTO_ANDAMIO_USD',
      'COSTO_TOTAL_USD',
      'ANIO_OPTIMO',
      'COSTO_NO_INTERVENCION_USD'
    ];

    const rows = zonasFiltradas.map(z => [
      sanitizeCsvCell(z.areaNombre, true),
      sanitizeCsvCell(z.zona.codigo, true),
      sanitizeCsvCell(z.zona.nombre, true),
      sanitizeCsvCell(`+${(Number(z.zona.cota_nivel || 146000) / 1000).toFixed(2)}m`, false),
      sanitizeCsvCell(z.proj.gradoActual, false),
      z.proj.porcentajeActual,
      z.m2Anticorrosivo,
      z.costoAnticorrosivoUsd,
      z.reparacionesCount,
      z.kgAceroReemplazo,
      z.costoReemplazoUsd,
      z.m3Andamio,
      z.costoAndamioUsd,
      z.costoTotalUsd,
      z.proj.anioRecomendado,
      z.proj.costoNoIntervencionUsd
    ].join(';'));

    const blob = new Blob(['\uFEFF' + [headers.join(';'), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ANALISIS_ALCANCE_${selectedAreaNombre.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Cabecera */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-wider flex items-center space-x-1.5">
            <Filter className="w-4 h-4" />
            <span>ANÁLISIS TÉCNICO ACOTADO POR ÁREA Y ZONA</span>
          </span>
          <h1 className="text-2xl font-black text-white mt-1">
            Alcance: Tratamiento Anticorrosivo, Reparaciones y Reemplazos
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Acotá el análisis por área de planta o zona puntual para dimensionar cómputos, patologías, andamios y costo de intervención.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportAlcanceCSV}
          disabled={zonasFiltradas.length === 0}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs rounded-lg flex items-center space-x-2 shadow self-start md:self-auto"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Exportar Alcance Acotado (CSV)</span>
        </button>
      </div>

      {/* Barra de Filtros para Acotar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">1. Área de Planta</label>
          <select
            value={selectedAreaNombre}
            onChange={(e) => {
              setSelectedAreaNombre(e.target.value);
              setSelectedZonaId('todas');
            }}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-semibold"
          >
            <option value="todas">Todas las Áreas ({areaOpciones.length})</option>
            {areaOpciones.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">2. Zona Específica</label>
          <select
            value={selectedZonaId}
            onChange={(e) => setSelectedZonaId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-amber-300 font-mono font-bold"
          >
            <option value="todas">Todas las Zonas del Área</option>
            {zonasAnalisis
              .filter(z => selectedAreaNombre === 'todas' || z.areaNombre.toLowerCase() === selectedAreaNombre.toLowerCase())
              .map(z => (
                <option key={z.zona.id} value={z.zona.id}>
                  {z.zona.codigo} — {z.zona.nombre}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">3. Enfoque de Tratamiento</label>
          <select
            value={alcanceFilter}
            onChange={(e) => setAlcanceFilter(e.target.value as AlcanceFilter)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
          >
            <option value="todos">Todo el Alcance (Integral)</option>
            <option value="anticorrosivo">Tratamiento Anticorrosivo</option>
            <option value="reparaciones">Reparaciones Civiles / Localizadas</option>
            <option value="reemplazos">Reemplazos Estructurales (Crítico)</option>
          </select>
        </div>

        <div className="flex items-end">
          <label className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between cursor-pointer">
            <span className="text-slate-300 font-semibold">Solo zonas ya relevadas</span>
            <input
              type="checkbox"
              checked={soloRelevadas}
              onChange={(e) => setSoloRelevadas(e.target.checked)}
              className="w-4 h-4 accent-sky-500"
            />
          </label>
        </div>
      </div>

      {/* 4 Tarjetas de Alcance Cuantificado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-sky-500/40 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider flex items-center space-x-1">
            <Paintbrush className="w-3.5 h-3.5" />
            <span>Tratamiento Anticorrosivo</span>
          </span>
          <span className="text-2xl font-black font-mono text-white block">
            {resumen.m2Anticorrosivo.toLocaleString()} m²
          </span>
          <span className="text-[11px] text-slate-400 font-mono block">
            {resumen.hhAnticorrosivo} HH · ${resumen.costoAnticorrosivo.toLocaleString()} USD
          </span>
        </div>

        <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1">
            <Wrench className="w-3.5 h-3.5" />
            <span>Reparaciones / Hallazgos</span>
          </span>
          <span className="text-2xl font-black font-mono text-white block">
            {resumen.reparaciones} ítems
          </span>
          <span className="text-[11px] text-slate-400 block">
            Patologías civiles y puntos locales · 📸 {resumen.fotos} fotos
          </span>
        </div>

        <div className="bg-slate-900 border border-red-500/40 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider flex items-center space-x-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Reemplazo Estructural</span>
          </span>
          <span className="text-2xl font-black font-mono text-white block">
            {resumen.kgReemplazo.toLocaleString()} kg
          </span>
          <span className="text-[11px] text-slate-400 font-mono block">
            {resumen.hhReemplazo} HH · ${resumen.costoReemplazo.toLocaleString()} USD
          </span>
        </div>

        <div className="bg-slate-900 border border-purple-500/40 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider flex items-center space-x-1">
            <HardHat className="w-3.5 h-3.5" />
            <span>Andamios e Inversión Total</span>
          </span>
          <span className="text-2xl font-black font-mono text-emerald-400 block">
            ${resumen.costoTotal.toLocaleString()} USD
          </span>
          <span className="text-[11px] text-slate-400 font-mono block">
            {resumen.m3Andamio.toLocaleString()} m³ andamio · {resumen.zonasParada} en Parada
          </span>
        </div>
      </div>

      {/* Detalle por Zona */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <span>Detalle Técnico de Zonas en el Alcance ({zonasFiltradas.length})</span>
          </h2>
          {resumen.costoNoInterv > resumen.costoTotal && (
            <span className="text-xs font-mono text-amber-300">
              Ahorro estimado vs. postergar a 2030: +${(resumen.costoNoInterv - resumen.costoTotal).toLocaleString()} USD
            </span>
          )}
        </div>

        {zonasFiltradas.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-xs text-slate-400 space-y-2">
            <p>No hay zonas que coincidan con los filtros seleccionados.</p>
            <Link href="/ingenieria/planos" className="inline-flex items-center space-x-1 text-sky-400 font-bold">
              <span>Ir a Planos y Planta</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {zonasFiltradas.map((item) => (
              <div
                key={item.zona.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-black text-amber-400 text-sm">{item.zona.codigo}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-semibold text-[10px] flex items-center space-x-1">
                        <Building2 className="w-3 h-3" />
                        <span>{item.areaNombre}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 font-mono text-[10px] text-slate-300">
                        +{(Number(item.zona.cota_nivel || 146000) / 1000).toFixed(2)} m
                      </span>
                      <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                        item.salud === 'critico' ? 'bg-red-950 text-red-400 border border-red-800' :
                        item.salud === 'malo' ? 'bg-orange-950 text-orange-400 border border-orange-800' :
                        item.salud === 'bueno' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                        'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}>
                        {item.proj.gradoActual} · {item.proj.porcentajeActual}% afect.
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white mt-1">{item.zona.nombre}</h3>
                    {item.zona.disciplinas_involucradas && item.zona.disciplinas_involucradas.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.zona.disciplinas_involucradas.map(d => (
                          <span key={d} className="px-1.5 py-0.5 bg-slate-950 border border-slate-800 rounded text-[10px] text-slate-400 capitalize">
                            {d.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-right font-mono space-y-0.5">
                    <span className="text-emerald-400 font-black text-base block">
                      ${item.costoTotalUsd.toLocaleString()} USD
                    </span>
                    <span className="text-[10px] text-slate-400 flex items-center justify-end space-x-1">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>Intervención óptima: {item.proj.anioRecomendado}</span>
                    </span>
                  </div>
                </div>

                {/* Desglose de los 3 frentes */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1">
                    <span className="text-[10px] font-bold text-sky-400 uppercase block">1. Tratamiento Anticorrosivo</span>
                    <span className="font-mono text-white font-bold block">
                      {item.m2Anticorrosivo} m² a intervenir (de {item.m2Total} m²)
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      {item.hhAnticorrosivo} HH · ${item.costoAnticorrosivoUsd.toLocaleString()} USD
                    </span>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1">
                    <span className="text-[10px] font-bold text-amber-400 uppercase block">2. Reparaciones y Hallazgos</span>
                    <span className="font-mono text-white font-bold block">
                      {item.itemsCiviles.length} ítems civiles · {item.elemsZona.length} pines
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      {item.itemsCiviles.length > 0
                        ? item.itemsCiviles.map(c => `${c.elemento_civil} [${c.estado}]`).join(', ')
                        : 'Sin patologías civiles registradas'}
                    </span>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1">
                    <span className="text-[10px] font-bold text-red-400 uppercase block">3. Reemplazos y Logística</span>
                    <span className="font-mono text-white font-bold block">
                      {item.requiereReemplazo ? `${item.kgAceroReemplazo} kg acero ($${item.costoReemplazoUsd.toLocaleString()})` : 'Sin reemplazo estructural'}
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Andamio: {item.m3Andamio} m³ (${item.costoAndamioUsd.toLocaleString()}) · {item.zona.nivel_acceso_andamio?.requiere_parada ? '🔴 Parada' : '🟢 En Marcha'}
                    </span>
                  </div>
                </div>

                {/* Consecuencia futura y evidencia */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
                  <span>{item.proj.consecuenciaSiPosterga}</span>
                  <span className="font-mono text-emerald-300 flex items-center space-x-1">
                    <Camera className="w-3.5 h-3.5" />
                    <span>{item.inspZona.length} inspecciones · {item.totalFotos} fotos</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
