'use client';

import React, { useState, useEffect } from 'react';
import { Layers, X, CheckCircle2, AlertCircle, Building2, HardHat, ShieldAlert, Ruler, Calculator, Save } from 'lucide-react';
import { ZonaInspeccion, DisciplinaZona } from '../../types';
import { db } from '../../lib/db';

interface EditZoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  zona?: ZonaInspeccion;
  onZoneUpdated: (updatedZone: ZonaInspeccion) => void;
}

const NIVELES_PLANTA = [
  { cota: 146000, nombre: 'Cota +146.000 m (Nivel Suelo Base)' },
  { cota: 152000, nombre: 'Cota +152.000 m (+6.00 m Pasarelas)' },
  { cota: 158000, nombre: 'Cota +158.000 m (+12.00 m Piso Operación)' },
  { cota: 170000, nombre: 'Cota +170.000 m (+24.00 m Nivel Superior Hornos)' }
];

const DISCIPLINAS_DISPONIBLES: { id: DisciplinaZona; label: string }[] = [
  { id: 'estructuras_acero', label: 'Estructuras de Acero (Vigas/Columnas)' },
  { id: 'parral_canerias', label: 'Parral de Cañerías (Pipe-Rack)' },
  { id: 'soportes', label: 'Soportes de Cañería y Silletas' },
  { id: 'canerias_proceso', label: 'Cañerías de Proceso / Vapor' },
  { id: 'columnas_hormigon', label: 'Columnas y Pedestales de Hormigón' },
  { id: 'barandas_plataformas', label: 'Barandas y Pisos Grating' }
];

export const EditZoneModal: React.FC<EditZoneModalProps> = ({
  isOpen,
  onClose,
  zona,
  onZoneUpdated
}) => {
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [cotaNivel, setCotaNivel] = useState<number>(146000);
  const [disciplinas, setDisciplinas] = useState<DisciplinaZona[]>([]);
  const [saludApriori, setSaludApriori] = useState<'bueno' | 'regular' | 'malo' | 'critico'>('regular');
  const [superficieEstimadaM2, setSuperficieEstimadaM2] = useState<number>(250);

  // Parámetros de Acceso y Andamio
  const [requiereAndamio, setRequiereAndamio] = useState(true);
  const [tipoAcceso, setTipoAcceso] = useState<'suelo' | 'escalera' | 'manlift' | 'andamio_tubular' | 'andamio_colgante'>('andamio_tubular');
  const [alturaMts, setAlturaMts] = useState<number>(6.5);
  const [envolventeM3, setEnvolventeM3] = useState<number>(180.0);
  const [complejidad, setComplejidad] = useState<'baja' | 'media' | 'alta'>('media');
  const [requiereParada, setRequiereParada] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cargar datos actuales de la zona
  useEffect(() => {
    if (zona) {
      setCodigo(zona.codigo || '');
      setNombre(zona.nombre || '');
      setCotaNivel(zona.cota_nivel || 146000);
      setDisciplinas(zona.disciplinas_involucradas || ['estructuras_acero']);
      setSaludApriori(zona.estado_salud_apriori || 'regular');
      setSuperficieEstimadaM2(zona.superficie_estimada_m2 || 250);

      if (zona.nivel_acceso_andamio) {
        setRequiereAndamio(zona.nivel_acceso_andamio.requiere_andamio ?? true);
        setTipoAcceso(zona.nivel_acceso_andamio.tipo_acceso || 'andamio_tubular');
        setAlturaMts(zona.nivel_acceso_andamio.altura_mts || 6.5);
        setEnvolventeM3(zona.nivel_acceso_andamio.envolvente_m3 || 180.0);
        setComplejidad(zona.nivel_acceso_andamio.complejidad || 'media');
        setRequiereParada(zona.nivel_acceso_andamio.requiere_parada || false);
      }
      setErrorMessage(null);
    }
  }, [zona, isOpen]);

  if (!isOpen || !zona) return null;

  const toggleDisciplina = (disc: DisciplinaZona) => {
    setDisciplinas(prev => 
      prev.includes(disc) ? prev.filter(d => d !== disc) : [...prev, disc]
    );
  };

  // Asistente de cálculo aproximado de envolvente
  const handleAutoCalculateVolume = () => {
    // Estimación geométrica industrial: Planta x Altura x Factor de llenado de bahías
    const factorEnvolvente = tipoAcceso === 'andamio_tubular' ? 0.35 : 0.2;
    const estimado = Math.round(superficieEstimadaM2 * alturaMts * factorEnvolvente);
    setEnvolventeM3(estimado > 0 ? estimado : 120);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo.trim() || !nombre.trim()) {
      setErrorMessage("Por favor ingresa Código y Nombre para la Zona.");
      return;
    }

    try {
      const nivelObj = NIVELES_PLANTA.find(n => n.cota === cotaNivel);

      const updatedZona: ZonaInspeccion = {
        ...zona,
        codigo: codigo.trim().toUpperCase(),
        nombre: nombre.trim(),
        cota_nivel: cotaNivel,
        nombre_nivel: nivelObj?.nombre || `Cota +${(cotaNivel / 1000).toFixed(3)} m`,
        disciplinas_involucradas: disciplinas,
        estado_salud_apriori: saludApriori,
        superficie_estimada_m2: superficieEstimadaM2,
        nivel_acceso_andamio: {
          requiere_andamio: requiereAndamio,
          tipo_acceso: tipoAcceso,
          altura_mts: alturaMts,
          envolvente_m3: envolventeM3,
          complejidad: complejidad,
          requiere_parada: requiereParada
        }
      };

      await db.zonas.put(updatedZona);
      onZoneUpdated(updatedZona);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || "Error al actualizar los datos de la zona.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-xl bg-slate-900 border-2 border-amber-500 rounded-2xl overflow-hidden shadow-2xl flex flex-col my-6 max-h-[92vh]">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center space-x-2 text-white font-bold text-sm">
            <Layers className="w-5 h-5 text-amber-400" />
            <span>Editar Parámetros de Zona y Cálculo de Andamio</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs overflow-y-auto">
          {/* Indicador de Geometría del Polígono */}
          <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 font-semibold flex items-center space-x-1.5">
              <Ruler className="w-3.5 h-3.5 text-sky-400" />
              <span>Contorno Poligonal:</span>
            </span>
            <span className="text-sky-300 font-mono font-bold bg-sky-950 px-2.5 py-0.5 rounded border border-sky-800">
              {zona.poligono_svg?.puntos?.length || 4} vértices trazados
            </span>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-950 border border-red-500/50 rounded-lg text-red-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Código, Nombre y Cota de Nivel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Código de Zona / Paquete *</label>
              <input
                type="text"
                placeholder="Ej: EDIFICIO EFLUENTES, Z-PARRAL-01"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono font-bold uppercase focus:border-amber-400 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Cota Georreferenciada / Nivel de Planta *</label>
              <select
                value={cotaNivel}
                onChange={(e) => setCotaNivel(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-amber-400 font-mono font-bold focus:border-amber-400 focus:outline-none"
              >
                {NIVELES_PLANTA.map(n => (
                  <option key={n.cota} value={n.cota}>{n.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Nombre Descriptivo de la Zona *</label>
            <input
              type="text"
              placeholder="Ej: Nave de Laminación, Tratamiento de Efluentes..."
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-medium focus:border-amber-400 focus:outline-none"
              required
            />
          </div>

          {/* 2. Disciplinas Involucradas */}
          <div>
            <label className="text-slate-400 block mb-1.5 font-semibold">Disciplinas Involucradas en esta Zona</label>
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800">
              {DISCIPLINAS_DISPONIBLES.map(disc => {
                const isSelected = disciplinas.includes(disc.id);
                return (
                  <button
                    key={disc.id}
                    type="button"
                    onClick={() => toggleDisciplina(disc.id)}
                    className={`flex items-center space-x-2 p-2 rounded text-left transition ${
                      isSelected 
                        ? 'bg-amber-950/60 border border-amber-500/60 text-amber-300 font-bold' 
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${isSelected ? 'bg-amber-500 border-amber-400 text-black' : 'border-slate-600'}`}>
                      {isSelected && <CheckCircle2 className="w-3 h-3" />}
                    </div>
                    <span className="text-[11px] leading-tight">{disc.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Salud a Priori y Superficie */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Estado de Salud a Priori</label>
              <select
                value={saludApriori}
                onChange={(e) => setSaludApriori(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-bold focus:border-amber-400 focus:outline-none"
              >
                <option value="bueno">🟢 Bueno (Sin daños visibles)</option>
                <option value="regular">🟡 Regular (Corrosión incipiente)</option>
                <option value="malo">🟠 Malo (Picaduras severas / fisuras)</option>
                <option value="critico">🔴 Crítico (Riesgo estructural)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Superficie Estimada (m² de pintura/acero)</label>
              <input
                type="number"
                min="1"
                step="5"
                value={superficieEstimadaM2}
                onChange={(e) => setSuperficieEstimadaM2(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono font-bold focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          {/* 4. CÁLCULO Y ESTIMACIÓN DE ANDAMIOS Y ACCESOS */}
          <div className="p-3.5 bg-slate-950 rounded-xl border border-purple-500/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-purple-300 flex items-center space-x-1.5 text-xs">
                <HardHat className="w-4 h-4 text-purple-400" />
                <span>Cálculo de Andamio y Altura de Intervención</span>
              </span>
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiereAndamio}
                  onChange={(e) => setRequiereAndamio(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-0"
                />
                <span className="text-[11px] text-purple-200 font-semibold">¿Requiere Andamio?</span>
              </label>
            </div>

            {requiereAndamio && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Tipo de Acceso Industrial</label>
                    <select
                      value={tipoAcceso}
                      onChange={(e) => setTipoAcceso(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-xs font-semibold focus:border-purple-400 focus:outline-none"
                    >
                      <option value="andamio_tubular">Andamio Tubular Multidireccional</option>
                      <option value="manlift">Plataforma Articulada (Manlift)</option>
                      <option value="andamio_colgante">Andamio Colgante / Silleta</option>
                      <option value="escalera">Escalera Industrial / Plataforma Fija</option>
                      <option value="suelo">A Nivel de Piso / Suelo</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Complejidad de Montaje</label>
                    <select
                      value={complejidad}
                      onChange={(e) => setComplejidad(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-xs font-semibold focus:border-purple-400 focus:outline-none"
                    >
                      <option value="baja">Baja (Piso despejado y firme)</option>
                      <option value="media">Media (Interferencia de cañerías)</option>
                      <option value="alta">Alta (Líneas calientes / espacio confinado)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Altura de Intervención (m) *</label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={alturaMts}
                      onChange={(e) => setAlturaMts(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-amber-300 font-mono font-bold focus:border-purple-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-400 block">Envolvente Andamio (m³) *</label>
                      <button
                        type="button"
                        onClick={handleAutoCalculateVolume}
                        className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center space-x-0.5 underline font-semibold"
                        title="Calcular en base a superficie y altura"
                      >
                        <Calculator className="w-3 h-3" />
                        <span>Estimar</span>
                      </button>
                    </div>
                    <input
                      type="number"
                      min="1"
                      step="5"
                      value={envolventeM3}
                      onChange={(e) => setEnvolventeM3(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono font-bold focus:border-purple-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1 border-t border-slate-800">
                  <input
                    type="checkbox"
                    id="editRequiereParada"
                    checked={requiereParada}
                    onChange={(e) => setRequiereParada(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-red-500 focus:ring-0"
                  />
                  <label htmlFor="editRequiereParada" className="text-[11px] text-slate-300 cursor-pointer">
                    Requiere Parada de Planta / Bloqueo LOTO de equipos para intervenir
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Botones de Acción */}
          <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-lg shadow-lg transition flex items-center space-x-2"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Cambios de Zona</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
