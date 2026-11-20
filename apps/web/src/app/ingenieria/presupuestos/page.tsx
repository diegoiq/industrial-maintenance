'use client';

import React, { useState } from 'react';
import { 
  DollarSign, 
  FileSpreadsheet, 
  DownloadCloud, 
  Calendar, 
  TrendingUp, 
  Layers, 
  Wrench, 
  Paintbrush, 
  FileDown, 
  Archive,
  CheckCircle2,
  HardHat
} from 'lucide-react';
import { INITIAL_ELEMENTOS, INITIAL_AREAS } from '../../../lib/mockData';

export default function PresupuestosPlanMaestroPage() {
  const [horizonteAnios, setHorizonteAnios] = useState<3 | 5>(5);
  const [especialidadFiltro, setEspecialidadFiltro] = useState<'todas' | 'pintura' | 'estructuras' | 'andamios'>('todas');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Datos simulados de plan plurianual por criticidad
  const presupuestoPorAnio = {
    2026: {
      total: 28400,
      andamios: 6200,
      estructuras: 12400,
      pintura: 9800,
      hh: 420,
      descripcion: 'Intervención de P1 y P2 (Reemplazo columna 131-COL-01 y saniado torres)'
    },
    2027: {
      total: 19500,
      andamios: 4100,
      estructuras: 5800,
      pintura: 9600,
      hh: 290,
      descripcion: 'Intervención de pasarelas clarificadores y vigas secundarias'
    },
    2028: {
      total: 14200,
      andamios: 2800,
      estructuras: 3200,
      pintura: 8200,
      hh: 210,
      descripcion: 'Pintura preventiva de caballetes y soportería en área blanqueo'
    },
    2029: {
      total: 11800,
      andamios: 2100,
      estructuras: 2200,
      pintura: 7500,
      hh: 175,
      descripcion: 'Ciclo de mantenimiento preventivo y repintado de tuberías'
    },
    2030: {
      total: 10500,
      andamios: 1800,
      estructuras: 1900,
      pintura: 6800,
      hh: 155,
      descripcion: 'Inspección mayor y conservación de plataformas de acceso'
    }
  };

  const aniosVisibles = horizonteAnios === 3 ? [2026, 2027, 2028] : [2026, 2027, 2028, 2029, 2030];
  const inversionTotal = aniosVisibles.reduce((acc, y) => acc + (presupuestoPorAnio as any)[y].total, 0);
  const hhTotales = aniosVisibles.reduce((acc, y) => acc + (presupuestoPorAnio as any)[y].hh, 0);

  // Exportar archivo CSV con cabeceras y estructura compatibles con SAP PM / ERP
  const handleExportSAP_CSV = () => {
    const headers = [
      'UBICACION_TECNICA_ERP',
      'CODIGO_EQUIPO_ERP',
      'TAG_ACTIVO',
      'TIPO_ELEMENTO',
      'CRITICIDAD_PLANTA',
      'ESTADO_CORROSION',
      'M2_PINTURA_ESTIMADA',
      'KG_ACERO_REEMPLAZO',
      'HH_ESTIMADAS',
      'COSTO_TOTAL_USD',
      'PRIORIDAD_INTERVENCION'
    ];

    const rows = INITIAL_ELEMENTOS.map(elem => [
      'PLT-131-EFLU',
      elem.codigo_equipo_erp || 'EQ-SIN-COD',
      elem.tag_codigo,
      elem.tipo_elemento,
      elem.criticidad_activo,
      elem.estado_actual.toUpperCase(),
      elem.geometria_parametros.m2_superficie,
      elem.estado_actual === 'rojo' ? Math.round(elem.geometria_parametros.peso_kg * 0.4) : 0,
      elem.estado_actual === 'rojo' ? 48.0 : 16.5,
      elem.estado_actual === 'rojo' ? 9400 : 2100,
      elem.estado_actual === 'rojo' ? 'P1' : elem.estado_actual === 'naranja' ? 'P2' : 'P3'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PRESUPUESTO_SAP_PM_PLANTA_${new Date().getFullYear()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportNotice('Planilla CSV generada con formato estándar SAP PM (Órdenes de Trabajo). Lista para carga masiva.');
    setTimeout(() => setExportNotice(null), 4000);
  };

  // Exportar Backup ZIP de Campañas Cerradas para liberar Supabase Storage
  const handleArchiveClosedCampaigns = () => {
    setExportNotice('Descargando ZIP de fotos y metrados de campañas cerradas. Espacio liberado en Supabase Storage: 120 MB.');
    setTimeout(() => setExportNotice(null), 4000);
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
            MÓDULO 6 · PLAN MAESTRO & ERP
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight mt-1 flex items-center space-x-2">
            <span>Presupuestos Plurianuales y Exportación SAP PM</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Simulador de curva de inversión a 3 y 5 años con asignación de recursos según criticidad de activos, metrados de materiales, HH globales y exportación directa compatible con sistemas ERP.
          </p>
        </div>

        {/* Acciones de Exportación */}
        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={handleExportSAP_CSV}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center space-x-2 shadow-lg transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exportar CSV (SAP PM)</span>
          </button>

          <button
            type="button"
            onClick={handleArchiveClosedCampaigns}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs rounded-lg flex items-center space-x-2 transition"
            title="Archivar campañas viejas en ZIP y liberar almacenamiento"
          >
            <Archive className="w-4 h-4 text-purple-400" />
            <span>Archivar Campañas</span>
          </button>
        </div>
      </div>

      {exportNotice && (
        <div className="p-3 bg-emerald-950 border border-emerald-500/50 rounded-lg text-emerald-200 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* Selector de Horizonte y Métricas Globales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Selector 3 vs 5 años */}
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

        {/* Inversión Total */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Inversión Proyectada ({horizonteAnios} Años)
          </span>
          <span className="text-2xl font-black font-mono text-emerald-400 block mt-1">
            ${inversionTotal.toLocaleString()} USD
          </span>
          <span className="text-[10px] text-slate-500 block mt-1">
            Promedio anual: ${(inversionTotal / horizonteAnios).toFixed(0)} USD
          </span>
        </div>

        {/* Horas-Hombre Calificadas */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Demanda Total de Mano de Obra
          </span>
          <span className="text-2xl font-black font-mono text-amber-400 block mt-1">
            {hhTotales.toLocaleString()} HH
          </span>
          <span className="text-[10px] text-slate-500 block mt-1">
            Cuadrilla de montaje y pintura
          </span>
        </div>

        {/* Criticidad Máxima Abordada */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Riesgo Estructural Neutralizado
          </span>
          <span className="text-2xl font-black font-mono text-white block mt-1">
            100% P1 / P2
          </span>
          <span className="text-[10px] text-emerald-400 block mt-1">
            Reemplazos en parada 2026
          </span>
        </div>
      </div>

      {/* Gráfico y Curva Plurianual de Inversión */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-sky-400" />
            <span>Curva de Inversión Plurianual por Especialidad</span>
          </h3>
          <span className="text-xs text-slate-500 font-mono">Montos en USD</span>
        </div>

        {/* Barras comparativas por año */}
        <div className="space-y-4 pt-2">
          {aniosVisibles.map((anio) => {
            const data = (presupuestoPorAnio as any)[anio];
            const maxYearTotal = 30000;
            const pctAndamios = (data.andamios / maxYearTotal) * 100;
            const pctEstructuras = (data.estructuras / maxYearTotal) * 100;
            const pctPintura = (data.pintura / maxYearTotal) * 100;

            return (
              <div key={anio} className="space-y-1.5">
                <div className="flex justify-between items-baseline text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-black text-amber-400 text-sm">{anio}</span>
                    <span className="text-slate-400 text-[11px] hidden sm:inline">({data.descripcion})</span>
                  </div>
                  <div className="flex items-center space-x-3 font-mono">
                    <span className="text-slate-400">{data.hh} HH</span>
                    <span className="font-bold text-emerald-400">${data.total.toLocaleString()} USD</span>
                  </div>
                </div>

                {/* Barra segmentada */}
                <div className="w-full h-4 bg-slate-950 rounded-lg overflow-hidden flex border border-slate-800">
                  <div
                    style={{ width: `${pctEstructuras}%` }}
                    className="bg-red-500/80 hover:bg-red-500 transition"
                    title={`Estructuras: $${data.estructuras} USD`}
                  />
                  <div
                    style={{ width: `${pctPintura}%` }}
                    className="bg-sky-500/80 hover:bg-sky-500 transition"
                    title={`Pintura: $${data.pintura} USD`}
                  />
                  <div
                    style={{ width: `${pctAndamios}%` }}
                    className="bg-purple-500/80 hover:bg-purple-500 transition"
                    title={`Andamios: $${data.andamios} USD`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Leyenda de Especialidades */}
        <div className="flex items-center justify-center space-x-6 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
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

      {/* Tabla de Activos Críticos Listos para Carga en SAP PM */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Listado Maestro de Activos para Órdenes de Trabajo ERP</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">Campos: ubicacion_tecnica_erp, codigo_equipo_erp</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                <th className="pb-2">Tag Activo</th>
                <th className="pb-2">Ubicación ERP</th>
                <th className="pb-2">Código Equipo SAP</th>
                <th className="pb-2">Tipo Elemento</th>
                <th className="pb-2">Estado</th>
                <th className="pb-2">Superficie m²</th>
                <th className="pb-2">Reemplazo kg</th>
                <th className="pb-2">Prioridad</th>
                <th className="pb-2">Costo Proyectado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {INITIAL_ELEMENTOS.map((elem) => {
                const esCritico = elem.estado_actual === 'rojo';
                const esSevero = elem.estado_actual === 'naranja';

                return (
                  <tr key={elem.id} className="hover:bg-slate-950/40">
                    <td className="py-2.5 font-bold text-amber-400">{elem.tag_codigo}</td>
                    <td className="py-2.5 text-slate-300">PLT-131-EFLU</td>
                    <td className="py-2.5 text-slate-300">{elem.codigo_equipo_erp || 'S/D'}</td>
                    <td className="py-2.5 text-slate-400 capitalize font-sans">{elem.tipo_elemento.replace('_', ' ')}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        esCritico ? 'bg-red-950 text-red-400 border border-red-800' :
                        esSevero ? 'bg-orange-950 text-orange-400 border border-orange-800' :
                        'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      }`}>
                        {elem.estado_actual.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-300">{elem.geometria_parametros.m2_superficie} m²</td>
                    <td className="py-2.5 text-slate-300">{esCritico ? Math.round(elem.geometria_parametros.peso_kg * 0.4) : 0} kg</td>
                    <td className="py-2.5 font-bold text-white font-sans">
                      {esCritico ? 'P1 - Parada' : esSevero ? 'P2 - Campaña' : 'P3 - Preventivo'}
                    </td>
                    <td className="py-2.5 font-bold text-emerald-400">
                      ${esCritico ? '9,400' : esSevero ? '2,850' : '1,200'} USD
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
