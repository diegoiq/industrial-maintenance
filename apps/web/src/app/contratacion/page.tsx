'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  CheckSquare,
  Square
} from 'lucide-react';
import { Area, Inspeccion, ZonaInspeccion } from '../../types';
import { CatalogoMaterialItem, TarifarioIntervencion } from '../../types/computo';
import { DEFAULT_TARIFARIO, calcularPaqueteZona, round2 } from '../../lib/computoEngine';
import { DEFAULT_CATALOG_SEED } from '../../lib/defaultCatalogSeed';
import { BomReviewTab } from '../../components/contratacion/BomReviewTab';
import { CatalogoTarifarioTab } from '../../components/contratacion/CatalogoTarifarioTab';
import { BoqComprasTab } from '../../components/contratacion/BoqComprasTab';
import { PliegoTecnicoTab } from '../../components/contratacion/PliegoTecnicoTab';

type TabId = 'bom' | 'catalogo' | 'boq' | 'pliego';

export default function ContratacionPage() {
  const [activeTab, setActiveTab] = useState<TabId>('bom');
  const [areas, setAreas] = useState<Area[]>([]);
  const [zonas, setZonas] = useState<ZonaInspeccion[]>([]);
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoMaterialItem[]>(DEFAULT_CATALOG_SEED);
  const [tarifario, setTarifario] = useState<TarifarioIntervencion>(DEFAULT_TARIFARIO);
  const [selectedInspIds, setSelectedInspIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [syncRes, catRes, tarRes] = await Promise.all([
        fetch('/api/sync-neon?light=1', { cache: 'no-store' }),
        fetch('/api/catalogo', { cache: 'no-store' }),
        fetch('/api/tarifario', { cache: 'no-store' })
      ]);
      const syncJson = await syncRes.json().catch(() => null);
      if (syncJson?.success && syncJson.data) {
        setAreas(syncJson.data.areas || []);
        setZonas(syncJson.data.zonas || []);
        const insps: Inspeccion[] = syncJson.data.inspecciones || [];
        setInspecciones(insps);
        setSelectedInspIds(new Set(insps.map((i) => i.id)));
      }
      const catJson = await catRes.json().catch(() => null);
      if (catJson?.success && Array.isArray(catJson.items)) {
        setCatalogo(catJson.items);
      }
      const tarJson = await tarRes.json().catch(() => null);
      if (tarJson?.success && tarJson.tarifario) {
        setTarifario(tarJson.tarifario);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('tab') as TabId | null;
      if (t && ['bom', 'catalogo', 'boq', 'pliego'].includes(t)) {
        setActiveTab(t);
      }
    }
    void loadAll();
  }, []);

  const zonasById = useMemo(() => {
    const map: Record<string, ZonaInspeccion> = {};
    for (const z of zonas) map[z.id] = z;
    return map;
  }, [zonas]);

  const selectedInspecciones = useMemo(
    () => inspecciones.filter((i) => selectedInspIds.has(i.id)),
    [inspecciones, selectedInspIds]
  );

  // KPIs Ejecutivos
  const kpis = useMemo(() => {
    let m2Pintura = 0;
    let kgAcero = 0;
    let totalCritico = 0;
    let totalSinergia = 0;
    let totalPlanta = 0;
    let totalContratista = 0;

    for (const insp of selectedInspecciones) {
      const z = insp.zona_id ? zonasById[insp.zona_id] : undefined;
      const areaM2 = Number(z?.superficie_estimada_m2) || 40;
      const res = calcularPaqueteZona(insp, areaM2, tarifario);
      m2Pintura += res.superficieComputadaM2;
      kgAcero += res.pesoTotalMetalicoKg;
      totalCritico += res.costos.totalCritico;
      totalSinergia += res.costos.totalSinergia;
      totalPlanta += res.costos.materialMetalicoPlanta;
      totalContratista += res.costos.totalContratista;
    }

    return {
      frentes: selectedInspecciones.length,
      m2Pintura: round2(m2Pintura),
      kgAcero: round2(kgAcero),
      totalCritico: round2(totalCritico),
      totalSinergia: round2(totalSinergia),
      totalPlanta: round2(totalPlanta),
      totalContratista: round2(totalContratista)
    };
  }, [selectedInspecciones, zonasById, tarifario]);

  const toggleInsp = (id: string) => {
    setSelectedInspIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 space-y-5">
      {/* Header */}
      <header className="print:hidden flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <Link
            href="/ingenieria/planos"
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
              Fase 5 · Schedule of Rates &amp; Fabric Maintenance
            </span>
            <h1 className="text-xl font-black text-white">
              Ingeniería de Detalle, BOM y Contratación
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={loadAll}
          disabled={loading}
          className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold flex items-center space-x-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          <span>Actualizar desde Neon</span>
        </button>
      </header>

      {/* Tablero Ejecutivo KPIs */}
      <div className="print:hidden grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <span className="text-[10px] text-slate-400 uppercase block">Zonas / Frentes</span>
          <strong className="text-lg font-black text-white font-mono">{kpis.frentes}</strong>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <span className="text-[10px] text-slate-400 uppercase block">Pintura Total</span>
          <strong className="text-lg font-black text-sky-400 font-mono">{kpis.m2Pintura} m²</strong>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <span className="text-[10px] text-slate-400 uppercase block">Acero Teórico</span>
          <strong className="text-lg font-black text-amber-400 font-mono">{kpis.kgAcero} kg</strong>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <span className="text-[10px] text-slate-400 uppercase block">Crítico vs Sinergia</span>
          <strong className="text-xs font-black font-mono block text-red-400">
            Crít: {kpis.totalCritico.toLocaleString()} {tarifario.moneda}
          </strong>
          <span className="text-[11px] font-mono text-emerald-400">
            Sinergia: {kpis.totalSinergia.toLocaleString()} {tarifario.moneda}
          </span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <span className="text-[10px] text-slate-400 uppercase block">Planta vs Contratista</span>
          <strong className="text-xs font-black font-mono block text-emerald-300">
            Serv: {kpis.totalContratista.toLocaleString()} {tarifario.moneda}
          </strong>
          <span className="text-[11px] font-mono text-sky-300">
            Mat. Planta: {kpis.totalPlanta.toLocaleString()} {tarifario.moneda}
          </span>
        </div>
      </div>

      {/* Selector de Alcance de Licitación (en BoQ y Pliego) */}
      {(activeTab === 'boq' || activeTab === 'pliego') && inspecciones.length > 0 && (
        <div className="print:hidden bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-300">
              Selector de Alcance de Licitación ({selectedInspecciones.length}/{inspecciones.length} frentes)
            </span>
            <div className="space-x-2">
              <button
                type="button"
                onClick={() => setSelectedInspIds(new Set(inspecciones.map((i) => i.id)))}
                className="text-sky-400 hover:underline text-[11px] font-bold"
              >
                Seleccionar todas
              </button>
              <button
                type="button"
                onClick={() => setSelectedInspIds(new Set())}
                className="text-slate-400 hover:underline text-[11px]"
              >
                Limpiar
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {inspecciones.map((insp) => {
              const checked = selectedInspIds.has(insp.id);
              return (
                <button
                  key={insp.id}
                  type="button"
                  onClick={() => toggleInsp(insp.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border flex items-center space-x-1.5 ${
                    checked
                      ? 'bg-amber-500/15 border-amber-500/60 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  {checked ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                  <span>{insp.zona_codigo || insp.elemento_id}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Navegación 4 Pestañas */}
      <div className="print:hidden flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {(
          [
            { id: 'bom', label: '1. Bandeja Revisión BOM (Split View)', icon: ClipboardCheck },
            { id: 'catalogo', label: '2. Catálogo Maestro y Tarifario', icon: Database },
            { id: 'boq', label: '3. BoQ y Lista de Compras', icon: FileSpreadsheet },
            { id: 'pliego', label: '4. Pliego Técnico por Frente', icon: Printer }
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center space-x-2 border transition ${
                active
                  ? 'bg-amber-500 text-black border-amber-400 shadow'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Contenido de Pestaña */}
      {activeTab === 'bom' && (
        <BomReviewTab
          inspecciones={inspecciones}
          zonasById={zonasById}
          catalogo={catalogo}
          onInspectionUpdated={(updated) =>
            setInspecciones((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
          }
        />
      )}

      {activeTab === 'catalogo' && (
        <CatalogoTarifarioTab
          catalogo={catalogo}
          tarifario={tarifario}
          onCatalogoChange={setCatalogo}
          onTarifarioChange={setTarifario}
        />
      )}

      {activeTab === 'boq' && (
        <BoqComprasTab
          inspecciones={selectedInspecciones}
          zonasById={zonasById}
          catalogo={catalogo}
          tarifario={tarifario}
        />
      )}

      {activeTab === 'pliego' && (
        <PliegoTecnicoTab
          inspecciones={selectedInspecciones}
          zonasById={zonasById}
          tarifario={tarifario}
        />
      )}
    </div>
  );
}
