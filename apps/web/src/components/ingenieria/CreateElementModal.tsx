'use client';

import React, { useState } from 'react';
import { MapPin, X, QrCode, Tag, CheckCircle2, AlertCircle } from 'lucide-react';
import { Elemento, ZonaInspeccion, TipoElemento, EstadoSemaforo } from '../../types';
import { db } from '../../lib/db';

interface CreateElementModalProps {
  isOpen: boolean;
  onClose: () => void;
  coordinates: { x: number; y: number } | null;
  zonas: ZonaInspeccion[];
  currentPlanoId: string;
  onElementCreated: (newElemento: Elemento) => void;
}

export const CreateElementModal: React.FC<CreateElementModalProps> = ({
  isOpen,
  onClose,
  coordinates,
  zonas,
  currentPlanoId,
  onElementCreated
}) => {
  const [tagCodigo, setTagCodigo] = useState('');
  const [codigoERP, setCodigoERP] = useState('');
  const [selectedZonaId, setSelectedZonaId] = useState<string>(zonas[0]?.id || '');
  const [tipoElemento, setTipoElemento] = useState<TipoElemento>('acero_estructural');
  const [perfil, setPerfil] = useState('W12x50');
  const [longitudM, setLongitudM] = useState<number>(6.0);
  const [m2Superficie, setM2Superficie] = useState<number>(14.5);
  const [pesoKg, setPesoKg] = useState<number>(350.0);
  const [criticidadActivo, setCriticidadActivo] = useState<number>(3);
  const [estadoActual, setEstadoActual] = useState<EstadoSemaforo>('gris');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !coordinates) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagCodigo.trim()) {
      setErrorMessage("Por favor ingresa un TAG identificador para el elemento.");
      return;
    }

    try {
      const newId = `elem_${Date.now()}`;
      const qrToken = `QR-${tagCodigo.trim().toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const newElem: Elemento = {
        id: newId,
        zona_id: selectedZonaId || 'zona-general',
        tag_codigo: tagCodigo.trim().toUpperCase(),
        codigo_equipo_erp: codigoERP.trim() || undefined,
        qr_token: qrToken,
        tipo_elemento: tipoElemento,
        coordenadas_pin: {
          x: Math.round(coordinates.x),
          y: Math.round(coordinates.y)
        },
        geometria_parametros: {
          perfil: perfil.trim() || 'Estándar',
          longitud_m: longitudM,
          m2_superficie: m2Superficie,
          peso_kg: pesoKg,
          tipologia: tipoElemento
        },
        criticidad_activo: criticidadActivo,
        estado_actual: estadoActual
      };

      await db.elementos.put(newElem);
      onElementCreated(newElem);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || "Error al guardar el elemento.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border-2 border-amber-500 rounded-2xl overflow-hidden shadow-2xl flex flex-col my-8">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center space-x-2 text-white font-bold text-sm">
            <MapPin className="w-5 h-5 text-amber-400" />
            <span>Colocar Pin de Activo en Coordenadas ({Math.round(coordinates.x)}, {Math.round(coordinates.y)})</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-red-950 border border-red-500/50 rounded-lg text-red-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">TAG Identificador *</label>
              <input
                type="text"
                placeholder="Ej: COL-01, VIG-08..."
                value={tagCodigo}
                onChange={(e) => setTagCodigo(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono font-bold uppercase focus:border-amber-400 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Código Equipo ERP / SAP</label>
              <input
                type="text"
                placeholder="Ej: EQ-STR-104"
                value={codigoERP}
                onChange={(e) => setCodigoERP(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono uppercase focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Tipo de Activo</label>
              <select
                value={tipoElemento}
                onChange={(e) => setTipoElemento(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
              >
                <option value="acero_estructural">Acero Estructural (Columna/Viga)</option>
                <option value="baranda">Baranda de Seguridad</option>
                <option value="plataforma">Plataforma / Pasarela / Rejilla</option>
                <option value="soporte">Soporte de Tubería / Caballete</option>
                <option value="equipo">Equipo Estático / Dinámico</option>
                <option value="caneria">Cañería de Proceso</option>
                <option value="tanque">Tanque / Silo / Tolva</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Zona Asociada</label>
              <select
                value={selectedZonaId}
                onChange={(e) => setSelectedZonaId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
              >
                {zonas.map(z => (
                  <option key={z.id} value={z.id}>{z.codigo} - {z.nombre}</option>
                ))}
                {zonas.length === 0 && (
                  <option value="zona-general">Zona General Planta</option>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Perfil / Catálogo</label>
              <input
                type="text"
                value={perfil}
                onChange={(e) => setPerfil(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Longitud (m)</label>
              <input
                type="number"
                step="0.1"
                value={longitudM}
                onChange={(e) => setLongitudM(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Superficie (m²)</label>
              <input
                type="number"
                step="0.1"
                value={m2Superficie}
                onChange={(e) => setM2Superficie(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Criticidad del Activo (1-5)</label>
              <select
                value={criticidadActivo}
                onChange={(e) => setCriticidadActivo(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-bold"
              >
                <option value={1}>1 - Muy Baja</option>
                <option value={2}>2 - Baja</option>
                <option value={3}>3 - Media</option>
                <option value={4}>4 - Alta</option>
                <option value={5}>5 - Crítica para Producción</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Estado de Condición Inicial</label>
              <select
                value={estadoActual}
                onChange={(e) => setEstadoActual(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-bold"
              >
                <option value="gris">Gris (Sin Inspeccionar)</option>
                <option value="verde">Verde (Normal)</option>
                <option value="amarillo">Amarillo (Alerta)</option>
                <option value="naranja">Naranja (Severo)</option>
                <option value="rojo">Rojo (Requiere Reemplazo)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center space-x-2"
            >
              <MapPin className="w-4 h-4" />
              <span>Colocar Pin y Generar QR</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
