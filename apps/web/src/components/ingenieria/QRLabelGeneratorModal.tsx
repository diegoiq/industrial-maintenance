'use client';

import React from 'react';
import { X, Printer, QrCode, Factory } from 'lucide-react';
import { Elemento } from '../../types';

interface QRLabelGeneratorModalProps {
  elemento: Elemento | null;
  isOpen: boolean;
  onClose: () => void;
}

export const QRLabelGeneratorModal: React.FC<QRLabelGeneratorModalProps> = ({
  elemento,
  isOpen,
  onClose
}) => {
  if (!isOpen || !elemento) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl flex flex-col">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center space-x-2 text-white font-bold text-sm">
            <QrCode className="w-5 h-5 text-amber-400" />
            <span>Etiqueta QR Industrial para Planta</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Vista previa de la etiqueta física */}
        <div className="p-6 flex flex-col items-center bg-slate-950">
          {/* Tarjeta de etiqueta física (Estilo chapa o sticker adhesivo industrial de alta visibilidad) */}
          <div
            id="printable-label"
            className="w-full max-w-sm bg-white text-black p-5 rounded-lg border-4 border-black shadow-xl space-y-4 print:border-2 print:shadow-none"
          >
            {/* Cabecera empresa / planta */}
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <div className="flex items-center space-x-2">
                <Factory className="w-6 h-6 text-black" />
                <div>
                  <h4 className="font-extrabold text-sm uppercase tracking-tight leading-none">PLANTA INDUSTRIAL</h4>
                  <span className="text-[10px] font-semibold text-slate-700">INTEGRIDAD ESTRUCTURAL</span>
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold bg-black text-white px-2 py-0.5 rounded">
                CRIT {elemento.criticidad_activo}
              </span>
            </div>

            {/* Código QR y TAG */}
            <div className="flex items-center space-x-4">
              {/* Representación visual de código QR */}
              <div className="w-28 h-28 border-2 border-black p-1 bg-white flex flex-col justify-between flex-shrink-0">
                <div className="w-full h-full flex flex-col justify-between p-1 bg-slate-100 border border-slate-300">
                  <div className="flex justify-between">
                    <div className="w-5 h-5 bg-black" />
                    <div className="w-2 h-2 bg-black" />
                    <div className="w-5 h-5 bg-black" />
                  </div>
                  <div className="flex justify-center items-center">
                    <QrCode className="w-10 h-10 text-black" />
                  </div>
                  <div className="flex justify-between">
                    <div className="w-5 h-5 bg-black" />
                    <div className="w-2 h-2 bg-black" />
                    <div className="w-2 h-2 bg-black" />
                  </div>
                </div>
              </div>

              {/* Datos del activo */}
              <div className="space-y-1.5 flex-1 min-w-0">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">TAG IDENTIFICADOR</span>
                  <span className="text-xl font-black font-mono tracking-tight leading-none text-black break-words">
                    {elemento.tag_codigo}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">CÓDIGO ERP / SAP</span>
                  <span className="text-xs font-mono font-bold text-slate-800">
                    {elemento.codigo_equipo_erp || 'SIN REGISTRO'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">PERFIL / TIPO</span>
                  <span className="text-xs font-semibold text-slate-900 truncate block">
                    {elemento.geometria_parametros.perfil || elemento.tipo_elemento}
                  </span>
                </div>
              </div>
            </div>

            {/* Token QR único para escaneo offline */}
            <div className="bg-yellow-300 border-2 border-black p-2 rounded text-center">
              <span className="text-[10px] font-black tracking-widest text-black font-mono block">
                TOKEN: {elemento.qr_token}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-4 text-center">
            Etiqueta resistente a intemperie y vapores químicos. Lista para impresión directa en plotter o impresora térmica.
          </p>
        </div>

        {/* Acciones del Modal */}
        <div className="flex items-center justify-end space-x-3 px-5 py-3.5 bg-slate-900 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 rounded-lg"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg flex items-center space-x-1.5 shadow-lg"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Etiqueta</span>
          </button>
        </div>
      </div>
    </div>
  );
};
