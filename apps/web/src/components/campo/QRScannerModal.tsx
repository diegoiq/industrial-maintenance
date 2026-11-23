'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QrCode, X, Search, AlertCircle, Camera, CameraOff } from 'lucide-react';
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
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string>('Iniciando visor de cámara...');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const handleScanOrSubmit = useCallback((val: string) => {
    const cleanToken = val.trim().toUpperCase();
    if (!cleanToken) return;

    const found = elementos.find(
      e => e.qr_token.toUpperCase() === cleanToken ||
           e.tag_codigo.toUpperCase() === cleanToken ||
           (e.codigo_equipo_erp && e.codigo_equipo_erp.toUpperCase() === cleanToken)
    );

    if (found) {
      stopCamera();
      onElementSelect(found);
      onClose();
    } else {
      setErrorMsg(`No se encontró ningún elemento con el código o QR: "${cleanToken}"`);
    }
  }, [elementos, onClose, onElementSelect, stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('Cámara no disponible en este navegador. Use búsqueda manual.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraActive(true);

        const BarcodeDetectorCtor = (window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (src: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
          };
        }).BarcodeDetector;

        if (!BarcodeDetectorCtor) {
          setCameraStatus('Cámara activa. Lectura automática QR no soportada en este navegador: ingrese el código manualmente.');
          return;
        }

        setCameraStatus('Escaneando código QR en tiempo real...');
        const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });

        const tick = async () => {
          if (cancelled || !videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          try {
            const barcodes = await detector.detect(videoRef.current);
            const raw = barcodes.find(b => b.rawValue)?.rawValue;
            if (raw) {
              setTokenInput(raw);
              handleScanOrSubmit(raw);
              return;
            }
          } catch {
            // Ignorar frames transitorios
          }
          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) {
          setCameraActive(false);
          setCameraStatus('Sin acceso a cámara (permiso denegado o sin dispositivo). Use el buscador manual.');
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, handleScanOrSubmit, stopCamera]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border-2 border-amber-500 rounded-xl overflow-hidden shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-4 py-3 bg-amber-500 text-black font-bold">
          <div className="flex items-center space-x-2">
            <QrCode className="w-5 h-5" />
            <span>Escaneo Rápido de QR en Planta</span>
          </div>
          <button onClick={() => { stopCamera(); onClose(); }} className="p-1 hover:bg-amber-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Visor real de cámara */}
        <div className="p-4 space-y-4">
          <div className="relative aspect-video w-full bg-slate-950 rounded-lg border-2 border-dashed border-amber-400/60 flex flex-col items-center justify-center overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover ${cameraActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            />
            {cameraActive && (
              <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-0.5 bg-amber-400 shadow-[0_0_12px_#f59e0b] animate-pulse pointer-events-none" />
            )}
            {!cameraActive && (
              <>
                <CameraOff className="w-12 h-12 text-amber-400/40 mb-2" />
                <QrCode className="w-6 h-6 text-slate-600 mb-1" />
              </>
            )}
            <div className="relative z-10 mt-auto w-full bg-black/70 px-3 py-1.5 flex items-center justify-center space-x-1.5">
              <Camera className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <p className="text-[11px] text-amber-100 text-center">{cameraStatus}</p>
            </div>
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleScanOrSubmit(tokenInput);
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
