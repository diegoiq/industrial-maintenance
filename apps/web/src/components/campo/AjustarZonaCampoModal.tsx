'use client';

import React, { useState, useEffect } from 'react';
import { Layers, X, Check, HardHat, AlertTriangle, ShieldAlert } from 'lucide-react';
import { ZonaInspeccion, DisciplinaZona } from '../../types';
import { db } from '../../lib/db';

interface AjustarZonaCampoModalProps {
  isOpen: boolean;
  onClose: () => void;
  zona: ZonaInspeccion | null;
  onZonaUpdated: (updated: ZonaInspeccion) => void;
}

const DISCIPLINAS_DISPONIBLES: { id: DisciplinaZona; label: string }[] = [
  { id: 'estructuras_acero', label: 'Estructuras de Acero' },
  { id: 'parral_canerias', label: 'Parral de Cañerías' },
  { id: 'soportes', label: 'Soportes de Cañería' },
  { id: 'canerias_proceso', label: 'Cañerías Proceso' },
  { id: 'columnas_hormigon', label: 'Columnas Hormigón' },
  { id: 'barandas_plataformas', label: 'Barandas / Grating' }
];

export const AjustarZonaCampoModal: React.FC<AjustarZonaCampoModalProps> = ({
  isOpen,
  onClose,
  zona,
  onZonaUpdated
}) => {
  const [nombre, setNombre] = useState('');
  const [disciplinas, setDisciplinas] = useState<DisciplinaZona[]>([]);
  const [saludApriori, setSaludApriori] = useState<'bueno' | 'regular' | 'malo' | 'critico'>('regular');
  const [superficieM2, setSuperficieM2] = useState<number>(250);

  // Parámetros de Andamio y Acceso
  const [requiereAndamio, setRequiereAndamio] = useState(true);
  const [tipoAcceso, setTipoAcceso] = useState<'suelo' | 'escalera' | 'manlift' | 'andamio_tubular' | 'andamio_colgante'>('andamio_tubular');
  const [alturaMts, setAlturaMts] = useState<number>(6.5);
  const [envolventeM3, setEnvolventeM3] = useState<number>(180.0);
  const [complejidad, setComplejidad] = useState<'baja' | 'media' | 'alta'>('media');
  const [requiereParada, setRequiereParada] = useState(false);

  useEffect(() => {
    if (zona) {
      setNombre(zona.nombre || '');
      setDisciplinas(zona.disciplinas_involucradas || ['estructuras_acero']);
      setSaludApriori(zona.estado_salud_apriori || 'regular');
      setSuperficieM2(zona.superficie_estimada_m2 || 250);
      setRequiereAndamio(zona.nivel_acceso_andamio?.requiere_andamio ?? true);
      setTipoAcceso(zona.nivel_acceso_andamio?.tipo_acceso || 'andamio_tubular');
      setAlturaMts(zona.nivel_acceso_andamio?.altura_mts || 6.5);
      setEnvolventeM3(zona.nivel_acceso_andamio?.envolvente_m3 || 180.0);
      setComplejidad(zona.nivel_acceso_andamio?.complejidad || 'media');
      setRequiereParada(zona.nivel_acceso_andamio?.requiere_parada || false);
    }
  }, [zona]);

  if (!isOpen || !zona) return null;

  const toggleDisciplina = (disc: DisciplinaZona) => {
    setDisciplinas(prev => 
      prev.includes(disc) ? prev.filter(d => d !== disc) : [...prev, disc]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const updatedZona: ZonaInspeccion = {
      ...zona,
      nombre: nombre.trim(),
      disciplinas_involucradas: disciplinas,
      estado_salud_apriori: saludApriori,
      superficie_estimada_m2: superficieM2,
      nivel_acceso_andamio: {
        requiere_andamio: requiereAndamio,
        tipo_acceso: tipoAcceso,
        altura_mts: alturaMts,
        envolvente_m3: envolventeM3,
        complejidad: complejidad,
        requiere_parada: requiereParada,
        estimado_en_campo_por: 'Inspector en Terreno (Ajuste Real)'
      }
    };

    await db.zonas.put(updatedZona);
    onZonaUpdated(updatedZona);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border-2 border-amber-500 rounded-2xl overflow-hidden shadow-2xl flex flex-col my-6 max-h-[92vh]">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center space-x-2 text-white font-bold text-sm">
            <HardHat className="w-5 h-5 text-amber-400" />
            <span>Ajustar Parámetros de Zona en Terreno</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs overflow-y-auto">
          {/* Info de la Zona */}
          <div className="bg-amber-950/40 p-3 rounded-xl border border-amber-500/40 text-amber-200 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono font-black text-white text-xs">{zona.codigo}</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-900/60 border border-amber-700">
                {zona.nombre_nivel || `Cota +${((zona.cota_nivel || 146000) / 1000).toFixed(3)} m`}
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              Esta zona fue pre-armada en oficina técnica. Como inspector en campo, ajusta las condiciones reales detectadas al pie de la estructura:
            </p>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-bold">Nombre / Descripción del Sector</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none"
              required
            />
          </div>

          {/* Disciplinas presentes en la zona */}
          <div>
            <label className="text-slate-400 block mb-1.5 font-bold">Disciplinas Detectadas en Terreno</label>
            <div className="grid grid-cols-2 gap-2">
              {DISCIPLINAS_DISPONIBLES.map(d => (
                <label
                  key={d.id}
                  className={`flex items-center space-x-2 p-2 rounded-lg border cursor-pointer transition ${
                    disciplinas.includes(d.id)
                      ? 'bg-amber-950/60 border-amber-500 text-amber-200 font-semibold'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={disciplinas.includes(d.id)}
                    onChange={() => toggleDisciplina(d.id)}
                    className="accent-amber-500 rounded"
                  />
                  <span className="text-[11px]">{d.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Salud y Superficie */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1 font-bold">Condición Global Observada</label>
              <select
                value={saludApriori}
                onChange={(e: any) => setSaludApriori(e.target.value)}
                className={`w-full bg-slate-950 border rounded-lg p-2 font-bold ${
                  saludApriori === 'critico' ? 'border-red-500 text-red-400' :
                  saludApriori === 'malo' ? 'border-orange-500 text-orange-400' :
                  saludApriori === 'regular' ? 'border-amber-500 text-amber-400' : 'border-emerald-500 text-emerald-400'
                }`}
              >
                <option value="bueno">🟢 Bueno (Leve)</option>
                <option value="regular">🟡 Regular (Pintura)</option>
                <option value="malo">🟠 Malo (Severo)</option>
                <option value="critico">🔴 Crítico (Riesgo)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-bold">Superficie Estimada (m²)</label>
              <input
                type="number"
                value={superficieM2}
                onChange={(e) => setSuperficieM2(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
              />
            </div>
          </div>

          {/* Andamio Real Ajustado */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                Requerimiento Real de Andamio y Acceso
              </span>
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiereAndamio}
                  onChange={(e) => setRequiereAndamio(e.target.checked)}
                  className="accent-amber-500 rounded"
                />
                <span className="text-amber-400 font-bold text-xs">Requiere Andamio</span>
              </label>
            </div>

            {requiereAndamio && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-slate-400 block mb-1">Tipo de Acceso Real</label>
                  <select
                    value={tipoAcceso}
                    onChange={(e: any) => setTipoAcceso(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                  >
                    <option value="andamio_tubular">Andamio Tubular</option>
                    <option value="andamio_colgante">Andamio Colgante</option>
                    <option value="manlift">Manlift / Tijera</option>
                    <option value="escalera">Escalera</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Altura Real (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={alturaMts}
                    onChange={(e) => setAlturaMts(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Volumen Andamio (m³)</label>
                  <input
                    type="number"
                    value={envolventeM3}
                    onChange={(e) => setEnvolventeM3(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Complejidad</label>
                  <select
                    value={complejidad}
                    onChange={(e) => setComplejidad(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                  >
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-800">
              <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiereParada}
                  onChange={(e) => setRequiereParada(e.target.checked)}
                  className="w-4 h-4 accent-red-500 rounded"
                />
                <span className="text-[11px] font-bold text-red-300">¿Requiere Parada de Planta?</span>
              </label>
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center space-x-2"
            >
              <Check className="w-4 h-4" />
              <span>Guardar Ajuste de Campo</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
