'use client';

import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  Globe, 
  Navigation, 
  Compass, 
  AlertCircle,
  Building2,
  CheckCircle2
} from 'lucide-react';
import { HitoGeografico, TipoHito, Plano } from '../../types';
import { db } from '../../lib/db';

interface CreateHitoModalProps {
  isOpen: boolean;
  onClose: () => void;
  coordinates: { x: number; y: number } | null;
  currentPlano?: Plano;
  onHitoCreated: (newHito: HitoGeografico) => void;
}

const TIPOS_HITO: { id: TipoHito; label: string; icon: string; desc: string }[] = [
  { id: 'mojon_topografico', label: 'Mojón Topográfico / Geodésico', icon: '🚩', desc: 'Punto de control altimétrico y planimétrico' },
  { id: 'acceso_vial', label: 'Acceso Vial / Báscula Camiones', icon: '🚛', desc: 'Portón de ingreso, pesaje o paso de grúas' },
  { id: 'vertice_perimetro', label: 'Vértice Perimetral / Esquina', icon: '📐', desc: 'Límite predial o esquina de nave industrial' },
  { id: 'subestacion', label: 'Subestación Eléctrica / Transformador', icon: '⚡', desc: 'Área de alta tensión y riesgo operativo' },
  { id: 'tanque_exterior', label: 'Tanque Exterior / Piletas', icon: '🛢️', desc: 'Activo cilíndrico o fosa a cielo abierto' },
  { id: 'referencia_general', label: 'Punto de Referencia General', icon: '📍', desc: 'Cualquier hito visual clave para la planta' }
];

export const CreateHitoModal: React.FC<CreateHitoModalProps> = ({
  isOpen,
  onClose,
  coordinates,
  currentPlano,
  onHitoCreated
}) => {
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoHito>('mojon_topografico');
  const [coordsInput, setCoordsInput] = useState('');
  const [lat, setLat] = useState<number | ''>('');
  const [lng, setLng] = useState<number | ''>('');
  const [cotaSnm, setCotaSnm] = useState<number>(146000);
  const [descripcion, setDescripcion] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !coordinates) return null;

  // Analizador inteligente de texto / enlace de Google Maps
  const handleParseCoords = (inputVal: string) => {
    setCoordsInput(inputVal);
    setErrorMessage(null);
    const text = inputVal.trim();
    if (!text) return;

    // Caso 1: URL de Google Maps
    const urlMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || text.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (urlMatch) {
      setLat(parseFloat(urlMatch[1]));
      setLng(parseFloat(urlMatch[2]));
      return;
    }

    // Caso 2: Par de coordenadas "-25.593812, -54.572183"
    const pairMatch = text.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (pairMatch) {
      setLat(parseFloat(pairMatch[1]));
      setLng(parseFloat(pairMatch[2]));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
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
        plano_id: currentPlano?.id,
        coordenadas_plano: {
          x: coordinates.x,
          y: coordinates.y
        },
        created_at: new Date().toISOString()
      };

      await db.hitos.put(newHito);
      onHitoCreated(newHito);
      onClose();

      // Reset
      setCodigo('');
      setNombre('');
      setCoordsInput('');
      setLat('');
      setLng('');
      setDescripcion('');
      setErrorMessage(null);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err?.message || "Error al guardar el hito.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border-2 border-emerald-500 rounded-2xl overflow-hidden shadow-2xl flex flex-col my-6">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center space-x-2 text-white font-bold text-sm">
            <Compass className="w-5 h-5 text-emerald-400" />
            <span>Fijar Georreferencia / Hito GPS en el Plano</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-2.5 bg-red-950 border border-red-500/50 rounded-lg text-red-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Posición en el plano capturada con el clic */}
          <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg border border-emerald-500/30 font-mono text-[11px]">
            <span className="text-slate-400">Punto en el Plano (Píxeles CAD):</span>
            <span className="text-emerald-400 font-bold">X: {coordinates.x} · Y: {coordinates.y}</span>
          </div>

          {/* Captura de Coordenadas GPS */}
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3 space-y-2">
            <label className="text-[10px] text-emerald-300 font-bold uppercase block">
              1. Pegar Coordenadas o Enlace de Google Maps:
            </label>
            <input
              type="text"
              placeholder="Ej: -25.981240, -54.573120  o  https://maps.app.goo.gl/..."
              value={coordsInput}
              onChange={(e) => handleParseCoords(e.target.value)}
              className="w-full bg-slate-950 border border-emerald-500/50 rounded-lg p-2 text-white font-mono text-xs focus:outline-none focus:border-emerald-400"
            />
            <p className="text-[10px] text-slate-400">
              💡 Hacé clic derecho en Google Maps sobre este mismo punto y copiá las coordenadas numéricas.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Latitud Decimal:</label>
                <input
                  type="number"
                  step="any"
                  placeholder="-25.98124"
                  value={lat}
                  onChange={(e) => setLat(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Longitud Decimal:</label>
                <input
                  type="number"
                  step="any"
                  placeholder="-54.57312"
                  value={lng}
                  onChange={(e) => setLng(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono"
                  required
                />
              </div>
            </div>
          </div>

          {/* Código y Nombre */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Código del Hito (Ej: MOJON-1):</label>
              <input
                type="text"
                placeholder="HITO-01"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono uppercase focus:border-emerald-400 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Tipo de Referencia:</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none"
              >
                {TIPOS_HITO.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Nombre Descriptivo:</label>
            <input
              type="text"
              placeholder="Ej: Mojón Topográfico Esquina Noroeste Planta"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-emerald-400 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Cota s.n.m. (mm):</label>
              <input
                type="number"
                value={cotaSnm}
                onChange={(e) => setCotaSnm(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Plano Vinculado:</label>
              <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 truncate font-semibold">
                {currentPlano ? currentPlano.titulo : 'Sin plano'}
              </div>
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Observaciones / Referencia Visual:</label>
            <textarea
              rows={2}
              placeholder="Ej: Marcado con estaca de hormigón y pintura amarilla al pie de la columna..."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none resize-none"
            />
          </div>

          {/* Botones */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg flex items-center space-x-1.5"
            >
              <Compass className="w-4 h-4" />
              <span>Guardar Georreferencia</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
