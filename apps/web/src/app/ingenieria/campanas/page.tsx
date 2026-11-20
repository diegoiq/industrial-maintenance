'use client';

import React, { useState } from 'react';
import { 
  CalendarDays, 
  Layers, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Plus, 
  Clock, 
  DollarSign, 
  ArrowRight,
  HardHat,
  Factory
} from 'lucide-react';

interface Campana {
  id: string;
  nombre: string;
  anio_ejecucion: number;
  zona_codigo: string;
  zona_nombre: string;
  requiere_parada_planta: boolean;
  estado: 'borrador' | 'planificada' | 'aprobada' | 'en_ejecucion' | 'cerrada';
  elementos_incluidos: { tag: string; tipo: string; intervencion: string; costo_individual: number }[];
  m3_andamio_compartido: number;
  costo_andamio_compartido: number;
  ahorro_por_agrupacion: number;
  costo_total_campana: number;
  hh_totales: number;
}

const INITIAL_CAMPANAS: Campana[] = [
  {
    id: 'camp-01',
    nombre: 'Rehabilitación Estructural Integral Torres de Enfriamiento',
    anio_ejecucion: 2026,
    zona_codigo: '131-Z04',
    zona_nombre: 'Torres de Enfriamiento y Bombas',
    requiere_parada_planta: true,
    estado: 'planificada',
    elementos_incluidos: [
      { tag: '131-COL-01', tipo: 'Columna W12x50', intervencion: 'Reemplazo estructural base y arenado Sa 2.5', costo_individual: 9400 },
      { tag: '131-BAR-04', tipo: 'Baranda perimetral', intervencion: 'Saniado mecánico y repintado epoxi', costo_individual: 1850 },
      { tag: '131-VIG-08', tipo: 'Viga IPE 300', intervencion: 'Tratamiento de nudo y repintado de ala inferior', costo_individual: 2600 }
    ],
    m3_andamio_compartido: 320.0,
    costo_andamio_compartido: 3840.0,
    ahorro_por_agrupacion: 4800.0, // Ahorro al no armar 3 andamios independientes
    costo_total_campana: 17690.0,
    hh_totales: 284.0
  },
  {
    id: 'camp-02',
    nombre: 'Mantenimiento Preventivo Pasarelas Clarificadores',
    anio_ejecucion: 2026,
    zona_codigo: '131-Z02',
    zona_nombre: 'Clarificadores y Piletas de Lodos',
    requiere_parada_planta: false,
    estado: 'aprobada',
    elementos_incluidos: [
      { tag: '131-PLA-02', tipo: 'Plataforma rejilla', intervencion: 'Retoque de galvanizado en frío y fijaciones', costo_individual: 3200 },
      { tag: '131-SOP-12', tipo: 'Soporte UPN 160', intervencion: 'Pintura de mantenimiento sistema bicapa', costo_individual: 1450 }
    ],
    m3_andamio_compartido: 140.0,
    costo_andamio_compartido: 1680.0,
    ahorro_por_agrupacion: 1950.0,
    costo_total_campana: 6330.0,
    hh_totales: 96.0
  }
];

export default function CampanasPage() {
  const [campanas, setCampanas] = useState<Campana[]>(INITIAL_CAMPANAS);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'parada' | 'marcha'>('todos');
  const [selectedCampana, setSelectedCampana] = useState<Campana | null>(INITIAL_CAMPANAS[0]);

  const campanasFiltradas = campanas.filter(c => {
    if (filtroTipo === 'parada') return c.requiere_parada_planta;
    if (filtroTipo === 'marcha') return !c.requiere_parada_planta;
    return true;
  });

  const ahorroTotalAcumulado = campanas.reduce((acc, curr) => acc + curr.ahorro_por_agrupacion, 0);

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <span className="text-[11px] font-mono font-bold text-sky-400 bg-sky-950 px-2 py-0.5 rounded border border-sky-800">
            MÓDULO 5 · PLANIFICACIÓN TÉCNICA
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight mt-1 flex items-center space-x-2">
            <span>Campañas de Intervención y Optimización de Andamios</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Agrupación paramétrica de intervenciones por zona de acceso para compartir un único montaje de andamio multidireccional, distinguiendo trabajos en parada de planta versus ejecución en marcha.
          </p>
        </div>

        {/* Indicador de Ahorro por Andamios Compartidos */}
        <div className="bg-emerald-950/70 border border-emerald-500/50 px-4 py-2.5 rounded-xl text-emerald-200">
          <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wider">
            Ahorro por Andamios Compartidos:
          </span>
          <span className="text-xl font-black font-mono text-white">
            +${ahorroTotalAcumulado.toLocaleString()} USD
          </span>
        </div>
      </div>

      {/* Barra de Filtros Operativos */}
      <div className="flex items-center space-x-2">
        <span className="text-xs text-slate-400">Ventana Operativa:</span>
        <button
          onClick={() => setFiltroTipo('todos')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filtroTipo === 'todos' ? 'bg-sky-500 text-black' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
        >
          Todas ({campanas.length})
        </button>
        <button
          onClick={() => setFiltroTipo('parada')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${filtroTipo === 'parada' ? 'bg-red-500 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
        >
          <Factory className="w-3.5 h-3.5" />
          <span>Parada de Planta</span>
        </button>
        <button
          onClick={() => setFiltroTipo('marcha')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${filtroTipo === 'marcha' ? 'bg-emerald-500 text-black' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Ejecución en Marcha</span>
        </button>
      </div>

      {/* Grid de Campañas y Panel de Detalle */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Listado de Campañas */}
        <div className="lg:col-span-2 space-y-4">
          {campanasFiltradas.map((campana) => {
            const isSelected = selectedCampana?.id === campana.id;

            return (
              <div
                key={campana.id}
                onClick={() => setSelectedCampana(campana)}
                className={`bg-slate-900 border rounded-xl p-5 cursor-pointer transition-all ${
                  isSelected ? 'border-sky-500 shadow-xl shadow-sky-950/40 bg-slate-900/90' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                        {campana.zona_codigo}
                      </span>
                      <span className="text-xs text-slate-400">Año {campana.anio_ejecucion}</span>
                      {campana.requiere_parada_planta ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-500">
                          PARADA DE PLANTA
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500">
                          EN MARCHA
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-white mt-1">{campana.nombre}</h3>
                    <p className="text-xs text-slate-400">{campana.zona_nombre}</p>
                  </div>

                  <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase font-mono ${
                    campana.estado === 'aprobada' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}>
                    {campana.estado}
                  </span>
                </div>

                {/* Métricas clave de la campaña */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-800/80 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Activos a Intervenir</span>
                    <span className="font-mono font-bold text-white">{campana.elementos_incluidos.length} Activos</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Andamio Compartido</span>
                    <span className="font-mono font-bold text-purple-400">{campana.m3_andamio_compartido} m³</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Mano de Obra</span>
                    <span className="font-mono font-bold text-amber-400">{campana.hh_totales} HH</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Costo Estimado</span>
                    <span className="font-mono font-bold text-emerald-400">${campana.costo_total_campana.toLocaleString()} USD</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Panel Lateral: Detalle de Activos y Desglose de Andamio Compartido */}
        {selectedCampana && (
          <aside className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5 h-fit">
            <div className="border-b border-slate-800 pb-3">
              <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block font-mono">
                DESGLOSE DE PAQUETE DE TRABAJO
              </span>
              <h4 className="text-base font-bold text-white leading-tight mt-0.5">
                {selectedCampana.nombre}
              </h4>
            </div>

            {/* Ahorro por andamio compartido */}
            <div className="p-3 bg-purple-950/60 border border-purple-500/40 rounded-lg text-purple-200 text-xs space-y-1">
              <span className="font-bold flex items-center space-x-1 text-purple-300">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>Estrategia de Andamio Compartido:</span>
              </span>
              <p className="text-[11px] text-purple-200/80 leading-relaxed">
                Los {selectedCampana.elementos_incluidos.length} elementos de la zona <strong>{selectedCampana.zona_codigo}</strong> se intervendrán bajo una misma estructura de {selectedCampana.m3_andamio_compartido} m³, ahorrando <strong>${selectedCampana.ahorro_por_agrupacion.toLocaleString()} USD</strong> en montajes duplicados.
              </p>
            </div>

            {/* Listado de intervenciones incluidas */}
            <div className="space-y-2 text-xs">
              <span className="font-bold text-slate-300 block uppercase tracking-wider text-[10px]">
                Activos y Tratamientos Asignados:
              </span>
              <div className="space-y-2">
                {selectedCampana.elementos_incluidos.map((elem, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-amber-400">{elem.tag}</span>
                      <span className="font-mono text-slate-300">${elem.costo_individual.toLocaleString()} USD</span>
                    </div>
                    <span className="text-[11px] text-slate-400 block">{elem.tipo}</span>
                    <span className="text-[10px] text-slate-500 block italic">{elem.intervencion}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Resumen Total */}
            <div className="pt-3 border-t border-slate-800 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Andamio Compartido:</span>
                <span className="text-purple-400">${selectedCampana.costo_andamio_compartido.toLocaleString()} USD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">HH Calificadas:</span>
                <span className="text-amber-400">{selectedCampana.hh_totales} HH</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-800">
                <span className="text-white font-sans">Presupuesto Campaña:</span>
                <span className="text-emerald-400">${selectedCampana.costo_total_campana.toLocaleString()} USD</span>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
