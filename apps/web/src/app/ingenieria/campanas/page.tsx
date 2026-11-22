'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Layers, 
  Clock, 
  HardHat, 
  Factory,
  MapPin,
  Wrench,
  CheckCircle2,
  ArrowRight,
  Sliders
} from 'lucide-react';
import { db } from '../../../lib/db';
import { getSyncRequestHeaders } from '../../../lib/security';
import { ZonaInspeccion, Elemento, Inspeccion, ParametroCubicacion, Plano } from '../../../types';
import { calculatePolygonAreaM2, getOrInitGeoreferencia } from '../../../lib/georeferenceEngine';

interface PaqueteCampanaZona {
  zona: ZonaInspeccion;
  planoTitulo: string;
  m2Superficie: number;
  m3Andamio: number;
  alturaAndamioM: number;
  requiereParada: boolean;
  elementosZona: Elemento[];
  inspeccionesZona: Inspeccion[];
  hhPinturaYMontaje: number;
  costoPinturaYManoObra: number;
  costoAndamioCompartido: number;
  ahorroAndamioCompartido: number;
  costoTotalPaquete: number;
}

export default function CampanasPage() {
  const [zonas, setZonas] = useState<ZonaInspeccion[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);
  const [parametros, setParametros] = useState<ParametroCubicacion[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'parada' | 'marcha'>('todos');
  const [selectedZonaId, setSelectedZonaId] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);

  const loadRealData = async () => {
    let loadedZonas = await db.zonas.toArray();
    let loadedPlanos = await db.planos.toArray();
    let loadedElementos = await db.elementos.toArray();
    let loadedInspecciones = await db.inspecciones.toArray();
    let loadedParams = await db.parametros.toArray();

    if (loadedZonas.length === 0) {
      try {
        const res = await fetch('/api/sync-neon', { headers: getSyncRequestHeaders() });
        const json = await res.json();
        if (json.success && json.data) {
          for (const p of (json.data.planos || [])) await db.planos.put(p);
          for (const z of (json.data.zonas || [])) await db.zonas.put(z);
          for (const e of (json.data.elementos || [])) await db.elementos.put(e);
          for (const i of (json.data.inspecciones || [])) await db.inspecciones.put(i);
          loadedPlanos = await db.planos.toArray();
          loadedZonas = await db.zonas.toArray();
          loadedElementos = await db.elementos.toArray();
          loadedInspecciones = await db.inspecciones.toArray();
        }
      } catch (e) {
        console.warn('Error hidratando campañas desde Neon:', e);
      }
    }

    setZonas(loadedZonas);
    setPlanos(loadedPlanos);
    setElementos(loadedElementos);
    setInspecciones(loadedInspecciones);
    setParametros(loadedParams);

    if (loadedZonas.length > 0 && !selectedZonaId) {
      setSelectedZonaId(loadedZonas[0].id);
    }
  };

  useEffect(() => {
    loadRealData();
  }, []);

  // Obtener coeficientes desde Parámetros y Cubicaciones (con fallback estándar industrial)
  const getParam = (clave: string, fallback: number) => {
    const found = parametros.find(p => p.clave === clave);
    return found ? Number(found.valor_numerico) : fallback;
  };

  const hhPorM2Pintura = getParam('hh_por_m2_pintura_epoxi', 0.45);
  const costoHhMontador = getParam('costo_hh_oficial_montador', 28.50);
  const costoM2Pintura = getParam('costo_m2_sistema_epoxi_poliuretano', 18.20);
  const costoM3Andamio = getParam('costo_m3_andamio_mes', 12.00);

  // Construir dinámicamente los paquetes de campaña a partir de las Zonas Reales del proyecto
  const paquetes: PaqueteCampanaZona[] = zonas.map((z) => {
    const plano = planos.find(p => p.id === z.plano_id);
    const geoCal = getOrInitGeoreferencia(plano);
    const calcM2 = calculatePolygonAreaM2(z.poligono_svg?.puntos || [], geoCal);
    const m2Superficie = z.superficie_estimada_m2 && z.superficie_estimada_m2 > 0 ? z.superficie_estimada_m2 : (calcM2 || 250);

    const requiereAndamio = z.nivel_acceso_andamio?.requiere_andamio !== false;
    const m3Andamio = requiereAndamio ? (z.nivel_acceso_andamio?.envolvente_m3 || 180) : 0;
    const alturaAndamioM = z.nivel_acceso_andamio?.altura_mts || 6.5;
    const requiereParada = !!z.nivel_acceso_andamio?.requiere_parada;

    const elementosZona = elementos.filter(e => e.zona_id === z.id);
    const inspeccionesZona = inspecciones.filter(
      i => i.zona_id === z.id || i.elemento_id === `ZONA:${z.codigo}` || elementosZona.some(e => e.id === i.elemento_id)
    );

    // Factor de afectación según inspecciones reales o estado a priori de la zona
    const ultimaInsp = inspeccionesZona[0];
    const factorAfectacion = ultimaInsp
      ? Math.max(0.15, (ultimaInsp.porcentaje_afectado || 25) / 100)
      : z.estado_salud_apriori === 'critico'
      ? 0.65
      : z.estado_salud_apriori === 'malo'
      ? 0.45
      : z.estado_salud_apriori === 'bueno'
      ? 0.15
      : 0.30;

    const m2Intervenir = Math.round(m2Superficie * factorAfectacion);
    const hhPinturaYMontaje = Math.round(m2Intervenir * hhPorM2Pintura + (m3Andamio * 0.12));
    const costoPinturaYManoObra = Math.round(m2Intervenir * costoM2Pintura + hhPinturaYMontaje * costoHhMontador);
    const costoAndamioCompartido = Math.round(m3Andamio * costoM3Andamio);

    // Ahorro por compartir un único andamio multifunción entre todas las disciplinas de la zona
    const numDisciplinas = Math.max(2, z.disciplinas_involucradas?.length || 2);
    const ahorroAndamioCompartido = requiereAndamio ? Math.round(costoAndamioCompartido * (numDisciplinas - 1) * 0.55) : 0;

    return {
      zona: z,
      planoTitulo: plano?.titulo || 'Lay Out General',
      m2Superficie,
      m3Andamio,
      alturaAndamioM,
      requiereParada,
      elementosZona,
      inspeccionesZona,
      hhPinturaYMontaje,
      costoPinturaYManoObra,
      costoAndamioCompartido,
      ahorroAndamioCompartido,
      costoTotalPaquete: costoPinturaYManoObra + costoAndamioCompartido
    };
  });

  const paquetesFiltrados = paquetes.filter(p => {
    if (filtroTipo === 'parada') return p.requiereParada;
    if (filtroTipo === 'marcha') return !p.requiereParada;
    return true;
  });

  const selectedPaquete = paquetes.find(p => p.zona.id === selectedZonaId) || paquetesFiltrados[0] || null;
  const ahorroTotalAcumulado = paquetes.reduce((acc, curr) => acc + curr.ahorroAndamioCompartido, 0);

  // Alternar si una zona requiere Parada de Planta o se ejecuta En Marcha
  const handleToggleParadaPlanta = async (zona: ZonaInspeccion) => {
    const currentParada = !!zona.nivel_acceso_andamio?.requiere_parada;
    const updated: ZonaInspeccion = {
      ...zona,
      nivel_acceso_andamio: {
        altura_mts: zona.nivel_acceso_andamio?.altura_mts || 6.5,
        envolvente_m3: zona.nivel_acceso_andamio?.envolvente_m3 || 180,
        complejidad: zona.nivel_acceso_andamio?.complejidad || 'media',
        ...zona.nivel_acceso_andamio,
        requiere_parada: !currentParada
      }
    };
    await db.zonas.put(updated);
    await loadRealData();
    setNotice(`Zona "${zona.codigo}" actualizada a modalidad: ${!currentParada ? 'PARADA DE PLANTA' : 'EJECUCIÓN EN MARCHA'}.`);
    setTimeout(() => setNotice(null), 3500);
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <span className="text-[11px] font-mono font-bold text-sky-400 bg-sky-950 px-2 py-0.5 rounded border border-sky-800">
            MÓDULO 5 · PLANIFICACIÓN TÉCNICA DESDE ZONAS REALES
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight mt-1">
            Campañas de Intervención y Optimización de Andamios
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Se alimenta directamente de las <strong>Zonas de Inspección delimitadas en tus planos</strong>, agrupando todas las disciplinas de cada zona bajo un mismo montaje de andamio compartido y separando trabajos en marcha vs. parada de planta.
          </p>
        </div>

        <div className="bg-emerald-950/70 border border-emerald-500/50 px-4 py-2.5 rounded-xl text-emerald-200 flex-shrink-0">
          <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wider">
            Ahorro por Andamios Compartidos ({paquetes.length} Zonas):
          </span>
          <span className="text-xl font-black font-mono text-white">
            +${ahorroTotalAcumulado.toLocaleString()} USD
          </span>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-950 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{notice}</span>
        </div>
      )}

      {/* Barra de Filtros Operativos */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400">Ventana Operativa:</span>
          <button
            onClick={() => setFiltroTipo('todos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filtroTipo === 'todos' ? 'bg-sky-500 text-black' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
          >
            Todas las Zonas ({paquetes.length})
          </button>
          <button
            onClick={() => setFiltroTipo('parada')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${filtroTipo === 'parada' ? 'bg-red-500 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
          >
            <Factory className="w-3.5 h-3.5" />
            <span>Parada de Planta ({paquetes.filter(p => p.requiereParada).length})</span>
          </button>
          <button
            onClick={() => setFiltroTipo('marcha')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${filtroTipo === 'marcha' ? 'bg-emerald-500 text-black' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Ejecución en Marcha ({paquetes.filter(p => !p.requiereParada).length})</span>
          </button>
        </div>

        <Link
          href="/ingenieria/parametros"
          className="text-xs text-sky-400 hover:text-sky-300 flex items-center space-x-1 font-semibold"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Ajustar Tarifas Unitarias ($/m³, $/HH, $/m²) →</span>
        </Link>
      </div>

      {paquetes.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
          <Layers className="w-10 h-10 text-sky-400 mx-auto" />
          <h3 className="text-base font-bold text-white">No hay Zonas de Inspección cargadas todavía</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Esta pantalla genera automáticamente las campañas y paquetes de andamio a partir de las zonas que traces sobre tus planos en el visor principal.
          </p>
          <Link
            href="/ingenieria/planos"
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg"
          >
            <span>Ir al Visor de Planos</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Listado de Paquetes generados desde tus Zonas Reales */}
          <div className="lg:col-span-2 space-y-4">
            {paquetesFiltrados.map((pkg) => {
              const isSelected = selectedPaquete?.zona.id === pkg.zona.id;

              return (
                <div
                  key={pkg.zona.id}
                  onClick={() => setSelectedZonaId(pkg.zona.id)}
                  className={`bg-slate-900 border rounded-xl p-5 cursor-pointer transition-all ${
                    isSelected ? 'border-sky-500 shadow-xl shadow-sky-950/40 bg-slate-900/90' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                          {pkg.zona.codigo}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          Cota +{(Number(pkg.zona.cota_nivel || 146000) / 1000).toFixed(3)} m
                        </span>
                        {pkg.requiereParada ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-500">
                            PARADA DE PLANTA
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500">
                            EN MARCHA
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-white mt-1">{pkg.zona.nombre}</h3>
                      <p className="text-xs text-slate-400">
                        Plano: {pkg.planoTitulo} · Disciplinas: {(pkg.zona.disciplinas_involucradas || ['estructuras_acero']).map(d => d.replace(/_/g, ' ')).join(', ')}
                      </p>
                    </div>

                    <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase font-mono ${
                      pkg.inspeccionesZona.length > 0
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}>
                      {pkg.inspeccionesZona.length > 0 ? 'RELEVADA EN CAMPO' : 'PRELIMINAR GABINETE'}
                    </span>
                  </div>

                  {/* Métricas calculadas de la Zona */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-800/80 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Superficie Zona</span>
                      <span className="font-mono font-bold text-white">{pkg.m2Superficie} m²</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Andamio Compartido</span>
                      <span className="font-mono font-bold text-purple-400">{pkg.m3Andamio} m³ ({pkg.alturaAndamioM}m)</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Mano de Obra Est.</span>
                      <span className="font-mono font-bold text-amber-400">{pkg.hhPinturaYMontaje} HH</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Costo Paquete</span>
                      <span className="font-mono font-bold text-emerald-400">${pkg.costoTotalPaquete.toLocaleString()} USD</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Panel Lateral: Desglose de la Zona Seleccionada */}
          {selectedPaquete && (
            <aside className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5 h-fit">
              <div className="border-b border-slate-800 pb-3">
                <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block font-mono">
                  DESGLOSE DE PAQUETE DE ZONA ({selectedPaquete.zona.codigo})
                </span>
                <h4 className="text-base font-bold text-white leading-tight mt-0.5">
                  {selectedPaquete.zona.nombre}
                </h4>
              </div>

              {/* Ahorro por andamio compartido */}
              <div className="p-3 bg-purple-950/60 border border-purple-500/40 rounded-lg text-purple-200 text-xs space-y-1.5">
                <span className="font-bold flex items-center space-x-1 text-purple-300">
                  <HardHat className="w-4 h-4 text-purple-400" />
                  <span>Optimización de Andamio Compartido:</span>
                </span>
                <p className="text-[11px] text-purple-200/80 leading-relaxed">
                  Al agrupar las disciplinas de <strong>{selectedPaquete.zona.codigo}</strong> en una sola campaña con una envolvente de <strong>{selectedPaquete.m3Andamio} m³</strong> (altura {selectedPaquete.alturaAndamioM} m), se ahorran <strong>${selectedPaquete.ahorroAndamioCompartido.toLocaleString()} USD</strong> frente a armados independientes.
                </p>
              </div>

              {/* Botón para cambiar ventana operativa (En Marcha vs Parada) */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Ventana de Ejecución:</span>
                  <span className="font-bold text-white">
                    {selectedPaquete.requiereParada ? '🔴 Requiere Parada de Planta' : '🟢 Ejecutable con Planta en Marcha'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleParadaPlanta(selectedPaquete.zona)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 rounded font-bold text-[11px]"
                >
                  Cambiar
                </button>
              </div>

              {/* Elementos / Hallazgos e Inspecciones dentro de esta Zona */}
              <div className="space-y-2 text-xs">
                <span className="font-bold text-slate-300 block uppercase tracking-wider text-[10px]">
                  Alcance e Inspecciones en esta Zona:
                </span>
                {selectedPaquete.elementosZona.length === 0 && selectedPaquete.inspeccionesZona.length === 0 ? (
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-slate-400 text-[11px] space-y-1">
                    <p>
                      • <strong>Alcance Preliminar por Zona:</strong> {selectedPaquete.m2Superficie} m² estimados (Salud a priori: <strong className="uppercase text-amber-400">{selectedPaquete.zona.estado_salud_apriori || 'regular'}</strong>).
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Cuando realices el recorrido con el celular en Campo, los hallazgos y fotos de esta zona se listarán aquí automáticamente.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedPaquete.elementosZona.map((elem) => (
                      <div key={elem.id} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 flex justify-between items-center">
                        <div>
                          <span className="font-mono font-bold text-amber-400 block">{elem.tag_codigo}</span>
                          <span className="text-[10px] text-slate-400 capitalize">{elem.tipo_elemento.replace('_', ' ')}</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700 uppercase">
                          {elem.estado_actual}
                        </span>
                      </div>
                    ))}
                    {selectedPaquete.inspeccionesZona.map((insp) => (
                      <div key={insp.id} className="p-2.5 bg-emerald-950/30 rounded-lg border border-emerald-500/30 space-y-0.5">
                        <div className="flex justify-between font-mono text-[11px]">
                          <span className="text-emerald-300 font-bold">Inspección {insp.grado_corrosion}</span>
                          <span className="text-slate-400">{insp.porcentaje_afectado}% afect. · 📸 {insp.fotos?.length || 0} fotos</span>
                        </div>
                        {insp.observaciones && (
                          <p className="text-[10px] text-slate-300 italic">"{insp.observaciones}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Resumen Financiero del Paquete */}
              <div className="pt-3 border-t border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Andamio ({selectedPaquete.m3Andamio} m³ × ${costoM3Andamio}/m³):</span>
                  <span className="text-purple-400">${selectedPaquete.costoAndamioCompartido.toLocaleString()} USD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Pintura y Mano Obra ({selectedPaquete.hhPinturaYMontaje} HH):</span>
                  <span className="text-amber-400">${selectedPaquete.costoPinturaYManoObra.toLocaleString()} USD</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-800">
                  <span className="text-white font-sans">Presupuesto Total Zona:</span>
                  <span className="text-emerald-400">${selectedPaquete.costoTotalPaquete.toLocaleString()} USD</span>
                </div>
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
