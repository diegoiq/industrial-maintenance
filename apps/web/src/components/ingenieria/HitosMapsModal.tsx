'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  MapPin, 
  Globe, 
  ExternalLink, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Compass, 
  Layers, 
  Building2, 
  AlertCircle,
  Navigation
} from 'lucide-react';
import { HitoGeografico, TipoHito, Plano } from '../../types';
import { db } from '../../lib/db';

interface HitosMapsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlano?: Plano;
  onHitosUpdated?: () => void;
}

const TIPOS_HITO: { id: TipoHito; label: string; icon: string; desc: string }[] = [
  { id: 'mojon_topografico', label: 'Mojón Topográfico / Geodésico', icon: '🚩', desc: 'Punto de control altimétrico y planimétrico' },
  { id: 'acceso_vial', label: 'Acceso Vial / Báscula Camiones', icon: '🚛', desc: 'Portón de ingreso, pesaje o paso de grúas' },
  { id: 'vertice_perimetro', label: 'Vértice Perimetral / Esquina', icon: '📐', desc: 'Límite predial o esquina de nave industrial' },
  { id: 'subestacion', label: 'Subestación Eléctrica / Transformador', icon: '⚡', desc: 'Área de alta tensión y riesgo operativo' },
  { id: 'tanque_exterior', label: 'Tanque Exterior / Piletas', icon: '🛢️', desc: 'Activo cilíndrico o fosa a cielo abierto' },
  { id: 'referencia_general', label: 'Punto de Referencia General', icon: '📍', desc: 'Cualquier hito visual clave para la planta' }
];

export const HitosMapsModal: React.FC<HitosMapsModalProps> = ({
  isOpen,
  onClose,
  currentPlano,
  onHitosUpdated
}) => {
  const [hitos, setHitos] = useState<HitoGeografico[]>([]);
  const [activeTab, setActiveTab] = useState<'crear' | 'lista'>('crear');

  // Formulario de nuevo Hito
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoHito>('mojon_topografico');
  const [coordsInput, setCoordsInput] = useState('');
  const [lat, setLat] = useState<number | ''>('');
  const [lng, setLng] = useState<number | ''>('');
  const [cotaSnm, setCotaSnm] = useState<number>(146000);
  const [descripcion, setDescripcion] = useState('');
  const [vincularPlano, setVincularPlano] = useState(true);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Cargar hitos de la base de datos
  const loadHitos = async () => {
    try {
      const data = await db.hitos.toArray();
      setHitos(data);
    } catch (e) {
      console.warn("No se pudieron cargar hitos:", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHitos();
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Analizador inteligente de texto/URL de Google Maps
  // Admite formatos: "-25.593812, -54.572183" o URLs de Maps
  const handleParseCoords = (inputVal: string) => {
    setCoordsInput(inputVal);
    setErrorMessage(null);

    const text = inputVal.trim();
    if (!text) return;

    // Caso 1: URL de Google Maps (contiene @lat,lng o q=lat,lng)
    const urlMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || text.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (urlMatch) {
      setLat(parseFloat(urlMatch[1]));
      setLng(parseFloat(urlMatch[2]));
      return;
    }

    // Caso 2: Formato texto "-25.593812, -54.572183" o "-25.593812 -54.572183"
    const pairMatch = text.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (pairMatch) {
      setLat(parseFloat(pairMatch[1]));
      setLng(parseFloat(pairMatch[2]));
    }
  };

  // Guardar nuevo hito
  const handleSaveHito = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo.trim() || !nombre.trim()) {
      setErrorMessage("Por favor ingresa Código y Nombre para el Hito.");
      return;
    }

    if (lat === '' || lng === '' || isNaN(Number(lat)) || isNaN(Number(lng))) {
      setErrorMessage("Por favor ingresa coordenadas válidas de Latitud y Longitud.");
      return;
    }

    try {
      const newId = `hito_${Date.now()}`;
      const newHito: HitoGeografico = {
        id: newId,
        codigo: codigo.trim().toUpperCase(),
        nombre: nombre.trim(),
        tipo: tipo,
        lat: Number(lat),
        lng: Number(lng),
        cota_snm: cotaSnm,
        descripcion: descripcion.trim() || undefined,
        plano_id: vincularPlano && currentPlano ? currentPlano.id : undefined,
        created_at: new Date().toISOString()
      };

      await db.hitos.put(newHito);
      await loadHitos();
      onHitosUpdated?.();

      setSuccessMessage(`¡Hito "${newHito.codigo}" guardado con éxito!`);
      setTimeout(() => setSuccessMessage(null), 3500);

      // Limpiar campos
      setCodigo('');
      setNombre('');
      setCoordsInput('');
      setLat('');
      setLng('');
      setDescripcion('');
      setActiveTab('lista');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err?.message || "Error al guardar el hito.");
    }
  };

  // Eliminar hito
  const handleDeleteHito = async (id: string, cod: string) => {
    if (window.confirm(`¿Seguro que deseas eliminar el hito "${cod}"?`)) {
      await db.hitos.delete(id);
      await loadHitos();
      onHitosUpdated?.();
    }
  };

  // Copiar coordenadas al portapapeles
  const handleCopyCoords = (latVal: number, lngVal: number, id: string) => {
    navigator.clipboard.writeText(`${latVal}, ${lngVal}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border-2 border-emerald-500 rounded-2xl overflow-hidden shadow-2xl flex flex-col my-6 max-h-[92vh]">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center space-x-2 text-white font-bold text-sm">
            <Globe className="w-5 h-5 text-emerald-400" />
            <span>Gestor de Hitos y Puntos de Referencia Maps (Admin)</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pestañas de navegación */}
        <div className="flex border-b border-slate-800 bg-slate-950 px-6 pt-3 space-x-2 text-xs flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('crear')}
            className={`px-4 py-2 font-bold rounded-t-lg border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'crear' 
                ? 'border-emerald-500 text-white bg-slate-900' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>+ Agregar Punto desde Maps</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lista')}
            className={`px-4 py-2 font-bold rounded-t-lg border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'lista' 
                ? 'border-emerald-500 text-white bg-slate-900' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-4 h-4 text-sky-400" />
            <span>Hitos Registrados ({hitos.length})</span>
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-red-950 border border-red-500/50 rounded-lg text-red-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-950 border border-emerald-500/50 rounded-lg text-emerald-300 flex items-center space-x-2">
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {activeTab === 'crear' && (
            <form onSubmit={handleSaveHito} className="space-y-4">
              {/* Ayuda de Captura desde Google Maps */}
              <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3.5 space-y-2 text-emerald-200">
                <div className="flex items-center space-x-2 font-bold text-white text-xs">
                  <Navigation className="w-4 h-4 text-emerald-400" />
                  <span>¿Cómo obtener el punto desde Google Maps?</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Abre Google Maps en tu PC o celular, haz clic derecho sobre el punto de la planta (ej: esquina de nave, báscula o tanque) y selecciona las coordenadas numéricas, o copia el enlace de compartir y pégalo abajo:
                </p>
                <div>
                  <label className="text-[10px] text-emerald-300 uppercase font-mono font-bold block mb-1">
                    Pegar Coordenadas o Enlace de Google Maps:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: -25.593812, -54.572183  o  https://maps.app.goo.gl/..."
                    value={coordsInput}
                    onChange={(e) => handleParseCoords(e.target.value)}
                    className="w-full bg-slate-950 border border-emerald-500/50 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {/* Coordenadas parseadas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-bold">Latitud (Decimal) *</label>
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="Ej: -25.593812"
                    value={lat}
                    onChange={(e) => setLat(e.target.value ? parseFloat(e.target.value) : '')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-bold">Longitud (Decimal) *</label>
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="Ej: -54.572183"
                    value={lng}
                    onChange={(e) => setLng(e.target.value ? parseFloat(e.target.value) : '')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono font-bold"
                    required
                  />
                </div>
              </div>

              {lat !== '' && lng !== '' && (
                <div className="flex justify-end">
                  <a
                    href={`https://www.google.com/maps?q=${lat},${lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center space-x-1 underline text-[11px]"
                  >
                    <span>Previsualizar punto en Google Maps Satelital</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {/* Código y Nombre */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-bold">Código / Identificador del Hito *</label>
                  <input
                    type="text"
                    placeholder="Ej: HITO-01, MOJON-NORTE, BASCULA-01"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono font-bold uppercase focus:border-emerald-400 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-bold">Cota s.n.m. Georreferenciada (mm)</label>
                  <input
                    type="number"
                    placeholder="146000"
                    value={cotaSnm}
                    onChange={(e) => setCotaSnm(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-amber-400 font-mono font-bold focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Equivale a +{(cotaSnm / 1000).toFixed(3)} m s.n.m. (Nivel Suelo Planta)
                  </span>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-bold">Nombre Descriptivo *</label>
                <input
                  type="text"
                  placeholder="Ej: Mojón Geodésico Esquina Noroeste Planta - Vértice de Referencia 01"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none"
                  required
                />
              </div>

              {/* Tipo de Hito */}
              <div>
                <label className="text-slate-400 block mb-1.5 font-bold">Tipo de Hito / Punto de Referencia</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TIPOS_HITO.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTipo(t.id)}
                      className={`text-left p-2.5 rounded-xl border transition ${
                        tipo === t.id 
                          ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200' 
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5 font-bold text-xs text-white">
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-0.5">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Descripción adicional */}
              <div>
                <label className="text-slate-400 block mb-1">Notas Topográficas / Instrucciones de Acceso</label>
                <textarea
                  placeholder="Ej: Placa de bronce empotrada en cabezal de hormigón. Utilizar para calibrar GPS en relevamientos de tanques exteriores..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none"
                />
              </div>

              {/* Botón Guardar */}
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
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center space-x-2"
                >
                  <MapPin className="w-4 h-4" />
                  <span>Guardar Hito de Referencia</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'lista' && (
            <div className="space-y-3">
              {hitos.length === 0 ? (
                <div className="text-center py-8 text-slate-500 space-y-2">
                  <Compass className="w-10 h-10 text-slate-600 mx-auto" />
                  <p>No hay hitos geográficos registrados aún.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('crear')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-xs"
                  >
                    + Agregar el Primer Hito desde Google Maps
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {hitos.map((h) => {
                    const tipoObj = TIPOS_HITO.find(t => t.id === h.tipo);
                    return (
                      <div
                        key={h.id}
                        className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-slate-700 transition"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-base">{tipoObj?.icon || '📍'}</span>
                            <span className="font-mono font-extrabold text-white text-xs">{h.codigo}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                              {tipoObj?.label}
                            </span>
                            {h.cota_snm && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800 text-amber-300">
                                Cota +{(h.cota_snm / 1000).toFixed(3)} m
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs font-semibold text-slate-200">{h.nombre}</h4>
                          {h.descripcion && (
                            <p className="text-[11px] text-slate-400">{h.descripcion}</p>
                          )}
                          <div className="flex items-center space-x-2 text-[11px] font-mono text-emerald-400 pt-1">
                            <span>Lat: {h.lat.toFixed(6)}, Lng: {h.lng.toFixed(6)}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyCoords(h.lat, h.lng, h.id)}
                              className="text-slate-500 hover:text-white"
                              title="Copiar coordenadas"
                            >
                              {copiedId === h.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 flex-shrink-0 self-end sm:self-center">
                          <a
                            href={`https://www.google.com/maps?q=${h.lat},${h.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 rounded-lg border border-emerald-600 font-bold flex items-center space-x-1 transition"
                          >
                            <span>Abrir Maps</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteHito(h.id, h.codigo)}
                            className="p-1.5 text-slate-500 hover:text-red-400 rounded hover:bg-slate-900 transition"
                            title="Eliminar hito"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
