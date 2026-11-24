'use client';

import React, { useState, useEffect } from 'react';
import { Layers, X, CheckCircle2, AlertCircle, Building2, HardHat, ShieldAlert, Ruler } from 'lucide-react';
import { ZonaInspeccion, DisciplinaZona, Plano, HitoGeografico } from '../../types';
import { db } from '../../lib/db';
import { calculatePolygonAreaM2, calculatePolygonPerimeterM, getOrInitGeoreferencia } from '../../lib/georeferenceEngine';

interface CreateZoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlanoId: string;
  currentPlano?: Plano;
  hitos?: HitoGeografico[];
  defaultPoints?: { x: number; y: number }[];
  defaultAreaPlanta?: string;
  onZoneCreated: (newZone: ZonaInspeccion) => void;
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

const AREAS_PLANTA_SUGERIDAS = [
  'Efluentes',
  'Blanqueo',
  'Caustificación',
  'Calderas y Energía',
  'Secado y Embalaje',
  'Planta Química',
  'General / Servicios'
];

export const CreateZoneModal: React.FC<CreateZoneModalProps> = ({
  isOpen,
  onClose,
  currentPlanoId,
  currentPlano,
  hitos = [],
  defaultPoints,
  defaultAreaPlanta,
  onZoneCreated
}) => {
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [areaPlanta, setAreaPlanta] = useState(defaultAreaPlanta || 'Efluentes');
  const [customAreaPlanta, setCustomAreaPlanta] = useState('');
  const [areasOpciones, setAreasOpciones] = useState<string[]>(AREAS_PLANTA_SUGERIDAS);
  const [geoStats, setGeoStats] = useState<{ areaM2: number; perimM: number; mPerPx: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (defaultPoints && defaultPoints.length >= 3) {
      const geoCal = getOrInitGeoreferencia(currentPlano, hitos);
      const areaM2 = Math.max(1, Math.round(calculatePolygonAreaM2(defaultPoints, geoCal)));
      const perimM = Math.round(calculatePolygonPerimeterM(defaultPoints, geoCal));
      setSuperficieEstimadaM2(areaM2);
      setGeoStats({ areaM2, perimM, mPerPx: geoCal.metersPerPixel });
    } else {
      setGeoStats(null);
      setSuperficieEstimadaM2(250);
    }
    db.areas.toArray().then(dbAreas => {
      const merged = Array.from(new Set([
        ...AREAS_PLANTA_SUGERIDAS,
        ...dbAreas.map(a => a.nombre)
      ]));
      setAreasOpciones(merged);
      if (defaultAreaPlanta) {
        if (merged.includes(defaultAreaPlanta)) {
          setAreaPlanta(defaultAreaPlanta);
          setCustomAreaPlanta('');
        } else {
          setAreaPlanta('__custom__');
          setCustomAreaPlanta(defaultAreaPlanta);
        }
      }
    }).catch(() => null);
  }, [isOpen, defaultAreaPlanta]);
  const [cotaNivel, setCotaNivel] = useState<number>(146000);
  const [disciplinas, setDisciplinas] = useState<DisciplinaZona[]>([
    'estructuras_acero',
    'parral_canerias'
  ]);
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

  if (!isOpen) return null;

  const toggleDisciplina = (disc: DisciplinaZona) => {
    setDisciplinas(prev => 
      prev.includes(disc) ? prev.filter(d => d !== disc) : [...prev, disc]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo.trim() || !nombre.trim()) {
      setErrorMessage("Por favor ingresa Código y Nombre para la Zona.");
      return;
    }

    try {
      const newId = `zona_${Date.now()}`;
      const pts = defaultPoints && defaultPoints.length >= 3 ? defaultPoints : [
        { x: 100, y: 100 },
        { x: 500, y: 100 },
        { x: 500, y: 400 },
        { x: 100, y: 400 }
      ];

      const nivelObj = NIVELES_PLANTA.find(n => n.cota === cotaNivel);

      const areaFinal = areaPlanta === '__custom__' ? (customAreaPlanta.trim() || 'General') : areaPlanta;

      const newZona: ZonaInspeccion = {
        id: newId,
        plano_id: currentPlanoId,
        area_planta: areaFinal,
        codigo: codigo.trim().toUpperCase(),
        nombre: nombre.trim(),
        cota_nivel: cotaNivel,
        nombre_nivel: nivelObj?.nombre || `Cota +${(cotaNivel / 1000).toFixed(3)} m`,
        disciplinas_involucradas: disciplinas,
        estado_salud_apriori: saludApriori,
        superficie_estimada_m2: superficieEstimadaM2,
        poligono_svg: {
          puntos: pts
        },
        nivel_acceso_andamio: {
          requiere_andamio: requiereAndamio,
          tipo_acceso: tipoAcceso,
          altura_mts: alturaMts,
          envolvente_m3: envolventeM3,
          complejidad: complejidad,
          requiere_parada: requiereParada
        }
      };

      await db.zonas.put(newZona);
      setCodigo('');
      setNombre('');
      setErrorMessage(null);
      onZoneCreated(newZona);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || "Error al guardar la zona.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-xl bg-slate-900 border-2 border-sky-500 rounded-2xl overflow-hidden shadow-2xl flex flex-col my-6 max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center space-x-2 text-white font-bold text-sm">
            <Layers className="w-5 h-5 text-sky-400" />
            <span>Crear Zona / Paquete de Intervención Multinivel</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs overflow-y-auto">
          {/* Indicador de Vértices del Contorno */}
          <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-sky-500/30">
            <span className="text-slate-400 font-semibold flex items-center space-x-1.5">
              <Ruler className="w-3.5 h-3.5 text-sky-400" />
              <span>Contorno Geométrico de Intervención:</span>
            </span>
            <span className="text-sky-300 font-mono font-bold bg-sky-950 px-2 py-0.5 rounded border border-sky-800">
              {defaultPoints?.length || 4} vértices asignados (moldeables en plano)
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
                placeholder="Ej: Z-PARRAL-01, TORRES-CALDERA..."
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono font-bold uppercase focus:border-sky-400 focus:outline-none"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Nombre Descriptivo de la Zona / Sector *</label>
              <input
                type="text"
                placeholder="Ej: Parral de cañerías alta presión y soportes..."
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Área de Planta (Agrupación) *</label>
              <select
                value={areaPlanta}
                onChange={(e) => setAreaPlanta(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-emerald-300 font-bold focus:border-emerald-400 focus:outline-none"
              >
                {areasOpciones.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
                <option value="__custom__">➕ Otra Área / Escribir...</option>
              </select>
              {areaPlanta === '__custom__' && (
                <input
                  type="text"
                  value={customAreaPlanta}
                  onChange={(e) => setCustomAreaPlanta(e.target.value)}
                  placeholder="Ej: Digestor, Torre Enfriamiento..."
                  className="w-full mt-1.5 bg-slate-950 border border-emerald-500/70 rounded-lg p-2 text-white focus:outline-none"
                />
              )}
            </div>
          </div>

          {/* 2. Disciplinas Involucradas en esta Zona de Intervención */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <span className="font-bold text-slate-300 block uppercase tracking-wider text-[11px]">
              Disciplinas Involucradas en el Paquete
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DISCIPLINAS_DISPONIBLES.map(d => (
                <label 
                  key={d.id} 
                  className={`flex items-center space-x-2 p-2 rounded-lg border cursor-pointer transition ${
                    disciplinas.includes(d.id) 
                      ? 'bg-sky-950/60 border-sky-500 text-sky-200 font-semibold' 
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={disciplinas.includes(d.id)}
                    onChange={() => toggleDisciplina(d.id)}
                    className="accent-sky-500 rounded"
                  />
                  <span className="text-[11px]">{d.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 3. Estimación a Priori de Salud y Alcance */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Estado de Salud a Priori</label>
              <select
                value={saludApriori}
                onChange={(e: any) => setSaludApriori(e.target.value)}
                className={`w-full bg-slate-950 border rounded-lg p-2 font-bold ${
                  saludApriori === 'critico' ? 'border-red-500 text-red-400' :
                  saludApriori === 'malo' ? 'border-orange-500 text-orange-400' :
                  saludApriori === 'regular' ? 'border-amber-500 text-amber-400' : 'border-emerald-500 text-emerald-400'
                }`}
              >
                <option value="bueno">🟢 Bueno (Mantenimiento menor)</option>
                <option value="regular">🟡 Regular (Pintura incipiente)</option>
                <option value="malo">🟠 Malo (Corrosión severa)</option>
                <option value="critico">🔴 Crítico (Riesgo estructural)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-400">Superficie Estimada (m²)</label>
                {geoStats && (
                  <button
                    type="button"
                    onClick={() => setSuperficieEstimadaM2(geoStats.areaM2)}
                    className="text-[10px] font-mono text-sky-400 hover:text-sky-300 underline"
                  >
                    Usar polígono ({geoStats.areaM2} m²)
                  </button>
                )}
              </div>
              <input
                type="number"
                value={superficieEstimadaM2}
                onChange={(e) => setSuperficieEstimadaM2(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
              />
              {geoStats && (
                <span className="text-[10px] text-emerald-400 font-mono block mt-1">
                  📐 Estimado por vértices: {geoStats.areaM2} m² · Perímetro: {geoStats.perimM} m ({geoStats.mPerPx.toFixed(3)} m/px)
                </span>
              )}
            </div>
          </div>

          {/* 4. Logística y Estimación de Andamio */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                Logística de Acceso y Andamio Compartido
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
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Tipo de Acceso</label>
                    <select
                      value={tipoAcceso}
                      onChange={(e: any) => setTipoAcceso(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                    >
                      <option value="andamio_tubular">Andamio Tubular Multidireccional</option>
                      <option value="andamio_colgante">Andamio Colgante / Balancín</option>
                      <option value="manlift">Plataforma Manlift / Tijera</option>
                      <option value="escalera">Escalera de Mano / Plataforma Móvil</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Altura de Trabajo (m)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={alturaMts}
                      onChange={(e) => setAlturaMts(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Envolvente Andamio (m³)</label>
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
                      <option value="baja">Baja (Apoyo en piso libre)</option>
                      <option value="media">Media (Interferencias de cañerías)</option>
                      <option value="alta">Alta (Voladizo / Espacio confinado)</option>
                    </select>
                  </div>
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
                <span className="text-[11px] font-bold text-red-300">¿Requiere Parada de Planta para Intervenir?</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center space-x-2"
            >
              <Layers className="w-4 h-4" />
              <span>Guardar Paquete de Zona</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
