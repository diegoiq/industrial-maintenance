'use client';

import React, { useState } from 'react';
import { 
  Sliders, 
  Calculator, 
  ShieldAlert, 
  Save, 
  RotateCcw, 
  History, 
  CheckCircle2, 
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  FileText
} from 'lucide-react';
import { INITIAL_PARAMETROS, INITIAL_ELEMENTOS } from '../../../lib/mockData';
import { ParametroCubicacion, Elemento } from '../../../types';

export default function ParametrosCubicacionPage() {
  const [parametros, setParametros] = useState<ParametroCubicacion[]>(INITIAL_PARAMETROS);
  const [auditLog, setAuditLog] = useState<{ id: string; clave: string; valAnterior: number; valNuevo: number; fecha: string; usuario: string }[]>([]);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Estados del Simulador de Cubicación Paramétrica
  const [selectedTag, setSelectedTag] = useState<string>('131-COL-01');
  const [tipoElemento, setTipoElemento] = useState<string>('acero_estructural');
  const [perfil, setPerfil] = useState<string>('W12x50');
  const [longitudM, setLongitudM] = useState<number>(7.2);
  const [m2Superficie, setM2Superficie] = useState<number>(18.5);
  const [pesoKg, setPesoKg] = useState<number>(540.0);
  const [gradoCorrosion, setGradoCorrosion] = useState<string>('Ri 4');
  const [porcentajeAfectado, setPorcentajeAfectado] = useState<number>(30);
  const [requiereReemplazo, setRequiereReemplazo] = useState<boolean>(true);
  const [alturaAccesoM, setAlturaAccesoM] = useState<number>(8.5);
  const [envolventeM3, setEnvolventeM3] = useState<number>(160.0);

  // Estados de la Matriz de Criticidad (Severidad x Criticidad del Activo)
  const [severidadDeterioro, setSeveridadDeterioro] = useState<number>(4); // 1 a 5
  const [criticidadActivo, setCriticidadActivo] = useState<number>(5); // 1 a 5

  const valorCriticidad = severidadDeterioro * criticidadActivo; // 1 a 25
  const prioridadIntervencion = 
    valorCriticidad >= 16 ? { etiqueta: 'P1 - INMEDIATO (Parada de Planta)', color: 'bg-red-950 text-red-300 border-red-500' }
    : valorCriticidad >= 9 ? { etiqueta: 'P2 - ALTA (Campaña Anual Actual)', color: 'bg-amber-950 text-amber-300 border-amber-500' }
    : valorCriticidad >= 4 ? { etiqueta: 'P3 - MEDIA (Monitoreo 12-24 meses)', color: 'bg-sky-950 text-sky-300 border-sky-500' }
    : { etiqueta: 'P4 - BAJA (Inspección Rutinaria)', color: 'bg-emerald-950 text-emerald-300 border-emerald-500' };

  // Cálculo paramétrico en vivo
  const hhM2Pintura = parametros.find(p => p.clave === 'hh_por_m2_pintura_epoxi')?.valor_numerico || 0.45;
  const hhKgAcero = parametros.find(p => p.clave === 'hh_por_kg_acero_reemplazo')?.valor_numerico || 0.12;
  const tarifaHH = parametros.find(p => p.clave === 'costo_hh_oficial_montador')?.valor_numerico || 28.50;
  const costoM2Pintura = parametros.find(p => p.clave === 'costo_m2_sistema_epoxi_poliuretano')?.valor_numerico || 18.20;
  const costoKgAcero = parametros.find(p => p.clave === 'costo_kg_acero_perfileria')?.valor_numerico || 3.40;
  const costoM3Andamio = parametros.find(p => p.clave === 'costo_m3_andamio_mes')?.valor_numerico || 12.00;

  const m2CalculadoPintura = Number((m2Superficie * (porcentajeAfectado / 100) * 1.25).toFixed(2));
  const kgCalculadoAcero = requiereReemplazo ? Number((pesoKg * (porcentajeAfectado / 100) * 0.75).toFixed(2)) : 0;
  const mlCalculadoBarandas = tipoElemento === 'baranda' ? longitudM : 0;
  const m3CalculadoAndamio = alturaAccesoM > 2.0 ? envolventeM3 : 0;

  const hhPintura = m2CalculadoPintura * hhM2Pintura;
  const hhAcero = kgCalculadoAcero * hhKgAcero;
  const hhAndamio = m3CalculadoAndamio * 0.05;
  const hhTotal = Number(((hhPintura + hhAcero + hhAndamio) * 1.10).toFixed(1)); // +10% contingencia

  const costoMateriales = Number(((m2CalculadoPintura * costoM2Pintura) + (kgCalculadoAcero * costoKgAcero)).toFixed(2));
  const costoManoObra = Number((hhTotal * tarifaHH).toFixed(2));
  const costoAndamio = Number((m3CalculadoAndamio * costoM3Andamio).toFixed(2));
  const costoTotalEstimado = Number((costoMateriales + costoManoObra + costoAndamio).toFixed(2));

  const handleUpdateParametro = (id: string, nuevoValor: number) => {
    const item = parametros.find(p => p.id === id);
    if (!item) return;

    const valAnterior = item.valor_numerico;
    setParametros(prev => prev.map(p => p.id === id ? { ...p, valor_numerico: nuevoValor } : p));

    setAuditLog(prev => [
      {
        id: `aud_${Date.now()}`,
        clave: item.clave,
        valAnterior,
        valNuevo: nuevoValor,
        fecha: new Date().toLocaleTimeString(),
        usuario: 'Ing. Mantenimiento (ID: auth-01)'
      },
      ...prev
    ]);

    setSaveNotice(`Parámetro "${item.clave}" actualizado. Registrado en bitácora de auditoría.`);
    setTimeout(() => setSaveNotice(null), 3500);
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Cabecera */}
      <div className="border-b border-slate-800 pb-5">
        <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
          MÓDULO 4 · INGENIERÍA & COSTOS
        </span>
        <h2 className="text-2xl font-black text-white tracking-tight mt-1">
          Motor de Cubicaciones Paramétricas y Matriz de Criticidad
        </h2>
        <p className="text-xs text-slate-400 mt-1 max-w-3xl">
          Configuración centralizada de coeficientes de rendimiento, tarifas de cuadrilla, sistemas de pintura y matriz de riesgo (Severidad × Criticidad de Activo) para presupuestos confiables en planta.
        </p>
      </div>

      {saveNotice && (
        <div className="p-3 bg-emerald-950 border border-emerald-500/50 rounded-lg text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{saveNotice}</span>
        </div>
      )}

      {/* Grid Principal: Coeficientes Editables + Matriz de Criticidad */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Tabla Editable de Parámetros Globales */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Coeficientes Paramétricos de Planta</span>
            </h3>
            <span className="text-xs text-slate-500 font-mono">Tabla: parametros_cubicacion</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                  <th className="pb-2">Clave Parámetro</th>
                  <th className="pb-2">Categoría</th>
                  <th className="pb-2">Valor Numérico</th>
                  <th className="pb-2">Unidad</th>
                  <th className="pb-2">Descripción Técnica</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {parametros.map(param => (
                  <tr key={param.id} className="hover:bg-slate-950/40">
                    <td className="py-2.5 font-mono font-bold text-slate-200">{param.clave}</td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                        {param.categoria}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <input
                        type="number"
                        step="0.01"
                        value={param.valor_numerico}
                        onChange={(e) => handleUpdateParametro(param.id, parseFloat(e.target.value) || 0)}
                        className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-400"
                      />
                    </td>
                    <td className="py-2.5 font-mono text-slate-400">{param.unidad}</td>
                    <td className="py-2.5 text-slate-400 text-[11px] max-w-xs">{param.descripcion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Historial de Auditoría en Vivo */}
          {auditLog.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <History className="w-3.5 h-3.5 text-sky-400" />
                <span>Auditoría de Cambios Recientes (auditoria_cambios)</span>
              </span>
              <div className="space-y-1 max-h-28 overflow-y-auto font-mono text-[11px]">
                {auditLog.map(item => (
                  <div key={item.id} className="bg-slate-950 p-1.5 rounded border border-slate-800/80 flex items-center justify-between text-slate-300">
                    <span>
                      <strong className="text-amber-400">{item.clave}</strong>: {item.valAnterior} → <strong className="text-emerald-400">{item.valNuevo}</strong>
                    </span>
                    <span className="text-slate-500">{item.usuario} · {item.fecha}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 2. Matriz de Criticidad (Severidad x Criticidad de Activo) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span>Matriz de Criticidad</span>
              </h3>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-white">
                Valor: {valorCriticidad} / 25
              </span>
            </div>

            <p className="text-xs text-slate-400">
              Combina la <strong>Severidad del deterioro (1-5)</strong> observado en campo con la <strong>Criticidad del activo (1-5)</strong> en el proceso de planta.
            </p>

            {/* Selector Severidad */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-300">Severidad del Deterioro:</span>
                <span className="font-bold text-amber-400">Nivel {severidadDeterioro} / 5</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSeveridadDeterioro(n)}
                    className={`py-1.5 rounded font-mono font-bold text-xs transition ${
                      severidadDeterioro === n ? 'bg-amber-500 text-black' : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Selector Criticidad Activo */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-300">Criticidad del Activo (Planta):</span>
                <span className="font-bold text-amber-400">Nivel {criticidadActivo} / 5</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCriticidadActivo(n)}
                    className={`py-1.5 rounded font-mono font-bold text-xs transition ${
                      criticidadActivo === n ? 'bg-amber-500 text-black' : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Representación visual de cuadrícula 5x5 */}
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
              <div className="grid grid-cols-5 gap-1 text-center font-mono text-[10px]">
                {[5, 4, 3, 2, 1].map(row => (
                  <React.Fragment key={row}>
                    {[1, 2, 3, 4, 5].map(col => {
                      const score = row * col;
                      const isCurrent = row === severidadDeterioro && col === criticidadActivo;
                      const cellColor = 
                        score >= 16 ? 'bg-red-500/30 text-red-200 border-red-500'
                        : score >= 9 ? 'bg-amber-500/30 text-amber-200 border-amber-500'
                        : score >= 4 ? 'bg-sky-500/30 text-sky-200 border-sky-500'
                        : 'bg-emerald-500/30 text-emerald-200 border-emerald-500';

                      return (
                        <div
                          key={`${row}-${col}`}
                          className={`p-1.5 rounded border ${cellColor} ${isCurrent ? 'ring-2 ring-white font-black scale-110' : 'opacity-70'}`}
                        >
                          {score}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Resultado de Priorización */}
          <div className={`p-3 rounded-lg border text-xs font-bold text-center mt-3 ${prioridadIntervencion.color}`}>
            <span className="block text-[10px] opacity-80 uppercase">Prioridad de Intervención Calculada:</span>
            <span className="text-sm">{prioridadIntervencion.etiqueta}</span>
          </div>
        </div>
      </div>

      {/* 3. Simulador de Cubicación Paramétrica en Vivo */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Calculator className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-bold text-white">Simulador Paramétrico en Vivo (POST /api/v1/cubicar)</h3>
          </div>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
            Nivel Confiabilidad: ALTA (Geometría Verificada)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Inputs de Inspección y Geometría */}
          <div className="space-y-3 text-xs">
            <span className="font-bold text-slate-300 block uppercase tracking-wider text-[11px]">
              Variables del Activo
            </span>

            <div>
              <label className="text-slate-400 block mb-1">Perfil Estructural</label>
              <select
                value={perfil}
                onChange={(e) => setPerfil(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono"
              >
                <option value="W12x50">W12x50 (Columna pesada - 74.5 kg/m)</option>
                <option value="IPE 300">IPE 300 (Viga puente - 42.2 kg/m)</option>
                <option value="UPN 160">UPN 160 (Canaleta soporte - 18.8 kg/m)</option>
                <option value="Tubo 1 1/2">Tubo 1 1/2" Sch40 (Baranda pasarela)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">Longitud (m)</label>
                <input
                  type="number"
                  value={longitudM}
                  onChange={(e) => setLongitudM(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Superficie (m²)</label>
                <input
                  type="number"
                  value={m2Superficie}
                  onChange={(e) => setM2Superficie(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">% Deteriorado</label>
                <input
                  type="number"
                  value={porcentajeAfectado}
                  onChange={(e) => setPorcentajeAfectado(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Andamio Envolvente (m³)</label>
                <input
                  type="number"
                  value={envolventeM3}
                  onChange={(e) => setEnvolventeM3(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded border border-slate-800">
              <span className="text-slate-300 font-semibold">¿Reemplazo Estructural?</span>
              <input
                type="checkbox"
                checked={requiereReemplazo}
                onChange={(e) => setRequiereReemplazo(e.target.checked)}
                className="w-4 h-4 accent-red-500 rounded"
              />
            </div>
          </div>

          {/* Desglose de Metrados de Obra */}
          <div className="space-y-3 text-xs">
            <span className="font-bold text-slate-300 block uppercase tracking-wider text-[11px]">
              Metrados Físicos Estimados
            </span>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 font-mono">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Pintura (Saniado + Epoxi):</span>
                <span className="text-base font-bold text-sky-400">{m2CalculadoPintura} m²</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Acero para Reemplazo:</span>
                <span className="text-base font-bold text-red-400">{kgCalculadoAcero} kg</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Andamio Multidireccional:</span>
                <span className="text-base font-bold text-purple-400">{m3CalculadoAndamio} m³</span>
              </div>
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-slate-400 font-sans font-bold">Total Horas-Hombre (HH):</span>
                <span className="text-xl font-black text-amber-400">{hhTotal} HH</span>
              </div>
            </div>

            <div className="p-2.5 bg-slate-950/60 rounded text-[11px] text-slate-400 space-y-1">
              <span className="block font-semibold text-slate-300">Desglose de Mano de Obra:</span>
              <div className="flex justify-between">
                <span>• Limpieza mecánica y pintura:</span>
                <span className="font-mono text-slate-200">{hhPintura.toFixed(1)} HH</span>
              </div>
              <div className="flex justify-between">
                <span>• Calderería y montaje de acero:</span>
                <span className="font-mono text-slate-200">{hhAcero.toFixed(1)} HH</span>
              </div>
              <div className="flex justify-between">
                <span>• Montaje / desmontaje andamio:</span>
                <span className="font-mono text-slate-200">{hhAndamio.toFixed(1)} HH</span>
              </div>
            </div>
          </div>

          {/* Resumen Económico */}
          <div className="space-y-3 text-xs flex flex-col justify-between">
            <div>
              <span className="font-bold text-slate-300 block uppercase tracking-wider text-[11px] mb-3">
                Presupuesto Unitario Proyectado
              </span>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Materiales y Consumibles:</span>
                  <span className="font-mono font-bold text-slate-200">${costoMateriales.toLocaleString()} USD</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Mano de Obra Calificada:</span>
                  <span className="font-mono font-bold text-slate-200">${costoManoObra.toLocaleString()} USD</span>
                </div>
                <div className="flex justify-between text-xs border-b border-slate-800 pb-3">
                  <span className="text-slate-400">Alquiler y Armado Andamios:</span>
                  <span className="font-mono font-bold text-slate-200">${costoAndamio.toLocaleString()} USD</span>
                </div>

                <div className="pt-2">
                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">Costo Total de Intervención:</span>
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    ${costoTotalEstimado.toLocaleString()} USD
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Incluye factor de contingencia del 10%
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-xs flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 flex-shrink-0 text-amber-400" />
              <span>
                Cálculo listo para ser asignado a un paquete de campaña en <strong>/ingenieria/campanas</strong>.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
