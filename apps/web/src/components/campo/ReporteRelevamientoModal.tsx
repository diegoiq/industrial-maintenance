'use client';

import React from 'react';
import { 
  X, 
  Printer, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Layers, 
  HardHat, 
  ShieldAlert, 
  TrendingUp,
  Building2,
  Calendar
} from 'lucide-react';
import { Area, Elemento, Inspeccion, Plano } from '../../types';

interface ReporteRelevamientoModalProps {
  isOpen: boolean;
  onClose: () => void;
  area?: Area;
  elementos: Elemento[];
  inspecciones: Inspeccion[];
  plano?: Plano;
}

export const ReporteRelevamientoModal: React.FC<ReporteRelevamientoModalProps> = ({
  isOpen,
  onClose,
  area,
  elementos,
  inspecciones,
  plano
}) => {
  if (!isOpen) return null;

  // Cálculos del Relevamiento
  const totalActivos = elementos.length;
  const activosInspeccionados = elementos.filter(e => e.estado_actual !== 'gris');
  const totalInspeccionados = activosInspeccionados.length;
  const porcentajeAvance = totalActivos > 0 ? Math.round((totalInspeccionados / totalActivos) * 100) : 0;
  const pendientes = totalActivos - totalInspeccionados;

  const criticosRojos = elementos.filter(e => e.estado_actual === 'rojo').length;
  const severosNaranjas = elementos.filter(e => e.estado_actual === 'naranja').length;
  const incipientesAmarillos = elementos.filter(e => e.estado_actual === 'amarillo').length;
  const normalesVerdes = elementos.filter(e => e.estado_actual === 'verde').length;

  const m2Totales = elementos.reduce((acc, el) => acc + (el.geometria_parametros?.m2_superficie || 0), 0);
  const m2Afectados = elementos.reduce((acc, el) => {
    if (el.estado_actual === 'rojo' || el.estado_actual === 'naranja') {
      return acc + (el.geometria_parametros?.m2_superficie || 0);
    }
    return acc;
  }, 0);

  const kgReemplazo = elementos.reduce((acc, el) => {
    if (el.estado_actual === 'rojo') {
      return acc + (el.geometria_parametros?.peso_kg || 0);
    }
    return acc;
  }, 0);

  // Manejador para imprimir / guardar como PDF nativo
  const handlePrint = () => {
    window.print();
  };

  // Manejador para exportar a CSV para SAP PM / ERP
  const handleExportCSV = () => {
    const headers = [
      'TAG_ACTIVO',
      'CODIGO_ERP',
      'AREA',
      'TIPO_ELEMENTO',
      'ESTADO_SEMAFORO',
      'M2_SUPERFICIE',
      'KG_PESO',
      'REQUIERE_REEMPLAZO',
      'FECHA_INSPECCION'
    ];

    const rows = elementos.map(el => {
      const insp = inspecciones.find(i => i.elemento_id === el.id);
      return [
        el.tag_codigo,
        el.codigo_equipo_erp || 'N/A',
        area?.nombre || 'General',
        el.tipo_elemento,
        el.estado_actual.toUpperCase(),
        el.geometria_parametros.m2_superficie,
        el.geometria_parametros.peso_kg,
        el.estado_actual === 'rojo' ? 'SI' : 'NO',
        insp?.fecha_inspeccion ? new Date(insp.fecha_inspeccion).toLocaleDateString() : 'PENDIENTE'
      ].join(';');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(';'), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `REPORTE_RELEVAMIENTO_${area?.codigo || 'PLANTA'}_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-4xl bg-slate-900 border-2 border-amber-500/70 rounded-2xl overflow-hidden shadow-2xl flex flex-col my-6 max-h-[92vh]">
        {/* Barra superior de acciones (no imprimible) */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-800 border-b border-slate-700 print:hidden flex-shrink-0">
          <div className="flex items-center space-x-2">
            <HardHat className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-black text-white uppercase tracking-wider">
              Reporte Ejecutivo de Relevamiento e Integridad Estructural
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg transition shadow"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / PDF</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition shadow"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar SAP PM</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Contenido Imprimible del Informe */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-100 bg-slate-950 print:bg-white print:text-black">
          {/* Encabezado Corporativo Oficial */}
          <div className="border-b-2 border-amber-500 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-mono text-amber-400 uppercase tracking-widest font-black block print:text-amber-700">
                INDUSTRIAL MAINTENANCE · ASSET INTEGRITY & CORROSION MANAGEMENT
              </span>
              <h1 className="text-2xl font-black text-white tracking-tight print:text-black">
                INFORME TÉCNICO DE RELEVAMIENTO DE CAMPO
              </h1>
              <p className="text-xs text-slate-400 print:text-gray-600 mt-1">
                Área Evaluada: <strong className="text-white print:text-black">{area ? `${area.codigo} - ${area.nombre}` : 'Planta Completa'}</strong> {area?.ubicacion_tecnica_erp ? `(Ubicación Técnica: ${area.ubicacion_tecnica_erp})` : ''}
              </p>
            </div>

            <div className="text-right text-xs bg-slate-900 print:bg-gray-100 p-3 rounded-lg border border-slate-800 print:border-gray-300">
              <div className="flex items-center justify-end space-x-1.5 text-slate-300 print:text-black">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Fecha: <strong>{new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong></span>
              </div>
              <span className="text-[11px] text-slate-400 print:text-gray-600 block mt-0.5">
                Plano: {plano ? plano.titulo : 'Layout General'}
              </span>
              <span className="text-[11px] font-mono text-emerald-400 print:text-emerald-700 font-bold block mt-0.5">
                Estado: {porcentajeAvance === 100 ? '✅ RELEVAMIENTO FINALIZADO' : `⏳ EN PROGRESO (${porcentajeAvance}%)`}
              </span>
            </div>
          </div>

          {/* Tarjetas de Resumen Ejecutivo y KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900 print:bg-gray-100 p-3 rounded-xl border border-slate-800 print:border-gray-300">
              <span className="text-[10px] uppercase text-slate-400 print:text-gray-600 font-bold block">Progreso Global</span>
              <span className="text-xl font-extrabold text-white print:text-black">{porcentajeAvance}%</span>
              <span className="text-[11px] text-slate-400 print:text-gray-600 block mt-0.5">
                {totalInspeccionados} de {totalActivos} relevados
              </span>
            </div>

            <div className="bg-red-950/40 print:bg-red-100 p-3 rounded-xl border border-red-500/50 print:border-red-400">
              <span className="text-[10px] uppercase text-red-300 print:text-red-700 font-bold block">Críticos (Rojo)</span>
              <span className="text-xl font-extrabold text-red-400 print:text-red-700">{criticosRojos}</span>
              <span className="text-[11px] text-red-300/80 print:text-red-600 block mt-0.5">
                {kgReemplazo.toFixed(0)} kg acero a cambiar
              </span>
            </div>

            <div className="bg-amber-950/40 print:bg-amber-100 p-3 rounded-xl border border-amber-500/50 print:border-amber-400">
              <span className="text-[10px] uppercase text-amber-300 print:text-amber-700 font-bold block">Severos / Naranja</span>
              <span className="text-xl font-extrabold text-amber-400 print:text-amber-700">{severosNaranjas}</span>
              <span className="text-[11px] text-amber-300/80 print:text-amber-600 block mt-0.5">
                {incipientesAmarillos} incipientes (amarillo)
              </span>
            </div>

            <div className="bg-emerald-950/40 print:bg-emerald-100 p-3 rounded-xl border border-emerald-500/50 print:border-emerald-400">
              <span className="text-[10px] uppercase text-emerald-300 print:text-emerald-700 font-bold block">Superficie Total</span>
              <span className="text-xl font-extrabold text-emerald-400 print:text-emerald-700">{m2Totales.toFixed(0)} m²</span>
              <span className="text-[11px] text-emerald-300/80 print:text-emerald-600 block mt-0.5">
                {m2Afectados.toFixed(0)} m² a intervenir
              </span>
            </div>
          </div>

          {/* Timeline de Avance del Relevamiento */}
          <div className="bg-slate-900 print:bg-gray-100 p-4 rounded-xl border border-slate-800 print:border-gray-300 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-300 print:text-gray-800 uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-sky-400" />
                <span>Estado de Culminación del Relevamiento</span>
              </span>
              <span className="text-sky-400 print:text-sky-700 font-mono">
                {pendientes === 0 ? '100% CUBIERTO - LISTO PARA VALIDACIÓN' : `${pendientes} activos pendientes por relevar`}
              </span>
            </div>
            
            {/* Barra de progreso visual */}
            <div className="w-full bg-slate-950 print:bg-gray-300 rounded-full h-3 overflow-hidden flex">
              <div 
                className="bg-emerald-500 h-full transition-all duration-500" 
                style={{ width: `${porcentajeAvance}%` }}
                title={`${porcentajeAvance}% Completado`}
              />
              <div 
                className="bg-slate-700 h-full transition-all duration-500" 
                style={{ width: `${100 - porcentajeAvance}%` }}
                title={`${100 - porcentajeAvance}% Pendiente`}
              />
            </div>
          </div>

          {/* Tabla de Activos Relevados */}
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold text-slate-300 print:text-black uppercase tracking-wider flex items-center space-x-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Inventario y Condición Técnica de Activos Mapeados</span>
            </h3>

            <div className="border border-slate-800 print:border-gray-300 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 print:bg-gray-200 text-slate-400 print:text-gray-700 border-b border-slate-800 print:border-gray-300 font-mono text-[11px]">
                    <th className="p-2.5">TAG Activo</th>
                    <th className="p-2.5">Tipo / Perfil</th>
                    <th className="p-2.5">Superficie / Peso</th>
                    <th className="p-2.5">Condición Semáforo</th>
                    <th className="p-2.5">Corrosión (ISO)</th>
                    <th className="p-2.5 text-right">Ventana Óptima</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 print:divide-gray-200">
                  {elementos.map(el => {
                    const insp = inspecciones.find(i => i.elemento_id === el.id);
                    return (
                      <tr key={el.id} className="hover:bg-slate-900/50 print:hover:bg-transparent">
                        <td className="p-2.5 font-bold font-mono text-white print:text-black">
                          {el.tag_codigo}
                          {el.codigo_equipo_erp && (
                            <span className="block text-[10px] text-slate-400 print:text-gray-600 font-normal">
                              ERP: {el.codigo_equipo_erp}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 capitalize text-slate-300 print:text-gray-800">
                          {el.tipo_elemento.replace('_', ' ')}
                          <span className="block text-[10px] text-amber-400 font-mono">
                            {el.geometria_parametros?.perfil || 'Estándar'}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono text-slate-300 print:text-gray-800">
                          {el.geometria_parametros?.m2_superficie} m² · {el.geometria_parametros?.peso_kg} kg
                        </td>
                        <td className="p-2.5">
                          {el.estado_actual === 'rojo' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-500 print:bg-red-100 print:text-red-700">
                              CRÍTICO (REEMPLAZO)
                            </span>
                          )}
                          {el.estado_actual === 'naranja' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-950 text-orange-300 border border-orange-500 print:bg-orange-100 print:text-orange-700">
                              CORROSIÓN SEVERA
                            </span>
                          )}
                          {el.estado_actual === 'amarillo' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-500 print:bg-amber-100 print:text-amber-700">
                              DETERIORO INCIPIENTE
                            </span>
                          )}
                          {el.estado_actual === 'verde' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500 print:bg-emerald-100 print:text-emerald-700">
                              CONDICIÓN NORMAL
                            </span>
                          )}
                          {el.estado_actual === 'gris' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 print:bg-gray-100 print:text-gray-600">
                              PENDIENTE
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 font-mono text-slate-300 print:text-gray-800">
                          {insp ? `${insp.grado_corrosion} (${insp.porcentaje_afectado}%)` : 'S/D'}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold">
                          {el.estado_actual === 'rojo' ? (
                            <span className="text-red-400 print:text-red-700">INMEDIATO (0-3 meses)</span>
                          ) : el.estado_actual === 'naranja' ? (
                            <span className="text-amber-400 print:text-amber-700">PRÓX. PARADA (6-12 m)</span>
                          ) : (
                            <span className="text-slate-400 print:text-gray-600">PROGRAMADO (24-36 m)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Firmas y Validación Técnica (Para entregar firmado a gerencia) */}
          <div className="pt-8 border-t border-slate-800 print:border-gray-400 grid grid-cols-2 gap-8 text-center text-xs">
            <div className="space-y-1">
              <div className="border-b border-slate-700 print:border-gray-400 h-12 w-48 mx-auto" />
              <span className="font-bold text-slate-200 print:text-black block">Inspector de Mantenimiento / NACE</span>
              <span className="text-[10px] text-slate-400 print:text-gray-600">Firma y Aclaración en Terreno</span>
            </div>
            <div className="space-y-1">
              <div className="border-b border-slate-700 print:border-gray-400 h-12 w-48 mx-auto" />
              <span className="font-bold text-slate-200 print:text-black block">Ingeniero de Integridad Estructural</span>
              <span className="text-[10px] text-slate-400 print:text-gray-600">Validación Técnica y Presupuestaria</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
