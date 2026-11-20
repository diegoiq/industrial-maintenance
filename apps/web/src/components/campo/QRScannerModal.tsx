'use client';

import React, { useState } from 'react';
import { QrCode, X, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { Elemento } from '../../types';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  elementos: Elemento[];
  onElementSelect: (elemento: Elemento) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  elementos,
  onElementSelect
}) => {
  const [tokenInput, setTokenInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleScanOrSubmit = (val: string) => {
    const cleanToken = val.trim().toUpperCase();
    const found = elementos.find(
      e => e.qr_token.toUpperCase() === cleanToken || 
           e.tag_codigo.toUpperCase() === cleanToken ||
           (e.codigo_equipo_erp && e.codigo_equipo_erp.toUpperCase() === cleanToken)
    );

    if (found) {
      onElementSelect(found);
      onClose();
    } else {
      setErrorMsg(`No se encontró ningún elemento con el código o QR: "${cleanToken}"`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border-2 border-amber-500 rounded-xl overflow-hidden shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-4 py-3 bg-amber-500 text-black font-bold">
          <div className="flex items-center space-x-2">
            <QrCode className="w-5 h-5" />
            <span>Escaneo Rápido de QR en Planta</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-amber-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Visor simulado de cámara / escáner óptico */}
        <div className="p-4 space-y-4">
          <div className="relative aspect-video w-full bg-slate-950 rounded-lg border-2 border-dashed border-amber-400/60 flex flex-col items-center justify-center overflow-hidden">
            {/* Animación de escaneo láser */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-400 shadow-[0_0_12px_#f59e0b] animate-pulse" />
            <QrCode className="w-16 h-16 text-amber-400/40 mb-2" />
            <p className="text-xs text-amber-200 text-center px-4">
              Apunta la cámara a la placa QR del equipo o soporte estructural
            </p>
          </div>

          {/* Acceso rápido a etiquetas disponibles en planta */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">
              O ingresar/seleccionar código de activo:
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => {
                  setTokenInput(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="Ej: 131-COL-01 o token QR..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => handleScanOrSubmit(tokenInput)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-lg flex items-center space-x-1"
              >
                <Search className="w-4 h-4" />
                <span>Buscar</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-center space-x-2 p-2 rounded bg-red-950/60 border border-red-500/50 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Sugerencias de muestra para prueba rápida en planta */}
          <div className="border-t border-slate-800 pt-3">
            <p className="text-[11px] text-slate-400 mb-2">Activos cargados en memoria local:</p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {elementos.map(elem => (
                <button
                  key={elem.id}
                  onClick={() => handleScanOrSubmit(elem.tag_codigo)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs border border-slate-700 hover:border-amber-400 flex items-center space-x-1"
                >
                  <span className="font-mono font-bold text-amber-400">{elem.tag_codigo}</span>
                  <span className="text-[10px] text-slate-400">({elem.tipo_elemento})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
