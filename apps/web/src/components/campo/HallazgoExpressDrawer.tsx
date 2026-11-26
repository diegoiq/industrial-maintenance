'use client';

import React, { useState, useEffect } from 'react';
import { X, Camera, Mic, MicOff, Plus, CheckCircle2, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { compressInspectionPhoto } from '../../lib/imageCompression';
import { FotoInspeccionLocal, TipoElemento } from '../../types';
import { CatalogoMaterialItem, EstadoBOM, ItemMetalicoBOM } from '../../types/computo';
import { ensureLocalCatalogSeeded } from '../../lib/db';
import { MetalicoBOMEditor } from './MetalicoBOMEditor';

interface HallazgoExpressDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  zonaCodigo: string;
  onLocatePin?: () => void;
  onSaveExpress: (data: {
    tagCodigo: string;
    tipoElemento: TipoElemento;
    gradoCorrosion: string;
    requiereReemplazo: boolean;
    observaciones: string;
    fotos: FotoInspeccionLocal[];
    estadoBom?: EstadoBOM;
    notaBomCampo?: string;
    itemsMetalicos?: ItemMetalicoBOM[];
  }) => Promise<void>;
}

const QUICK_ELEMENT_TYPES: { label: string; value: TipoElemento }[] = [
  { label: 'Columna', value: 'columna_hormigon' },
  { label: 'Viga', value: 'viga_acero' },
  { label: 'Soporte', value: 'soporte' },
  { label: 'Cañería', value: 'tuberia' },
  { label: 'Baranda', value: 'baranda' },
  { label: 'Escalera', value: 'escalera' },
  { label: '+ Otro', value: 'otro_personalizado' }
];

export function HallazgoExpressDrawer({
  isOpen,
  onClose,
  zonaCodigo,
  onLocatePin,
  onSaveExpress
}: HallazgoExpressDrawerProps) {
  const [tipo, setTipo] = useState<TipoElemento>('viga_acero');
  const [tagCustom, setTagCustom] = useState('');
  const [grado, setGrado] = useState('Ri 3');
  const [reemplazo, setReemplazo] = useState(false);
  const [nota, setNota] = useState('');
  const [notaBom, setNotaBom] = useState('');
  const [itemsMetalicos, setItemsMetalicos] = useState<ItemMetalicoBOM[]>([]);
  const [showBomEditor, setShowBomEditor] = useState(false);
  const [catalogo, setCatalogo] = useState<CatalogoMaterialItem[]>([]);
  const [fotos, setFotos] = useState<FotoInspeccionLocal[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [isDictating, setIsDictating] = useState(false);

  useEffect(() => {
    if (isOpen && catalogo.length === 0) {
      ensureLocalCatalogSeeded().then(setCatalogo).catch(() => null);
    }
  }, [isOpen, catalogo.length]);

  if (!isOpen) return null;

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsCompressing(true);
    try {
      const res = await compressInspectionPhoto(files[0]);
      setFotos(prev => [
        ...prev,
        {
          id: `foto_exp_${Date.now()}`,
          thumbnail_data_url: res.dataUrl,
          micro_thumbnail_data_url: res.thumbnailDataUrl,
          original_webp_blob: res.blob,
          peso_bytes: res.compressedSizeBytes,
          comentario: '',
          anotaciones_canvas: []
        }
      ]);
    } finally {
      setIsCompressing(false);
      e.target.value = '';
    }
  };

  const handleDictate = () => {
    if (typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    try {
      const rec = new SpeechRec();
      rec.lang = 'es-AR';
      rec.onresult = (ev: any) => {
        const text = ev.results?.[0]?.[0]?.transcript;
        if (text) setNota(prev => (prev ? `${prev.trim()} ${text.trim()}` : text.trim()));
      };
      rec.onend = () => setIsDictating(false);
      rec.onerror = () => setIsDictating(false);
      rec.start();
      setIsDictating(true);
    } catch {
      setIsDictating(false);
    }
  };

  const resetForm = () => {
    setTagCustom('');
    setReemplazo(false);
    setNota('');
    setNotaBom('');
    setItemsMetalicos([]);
    setShowBomEditor(false);
    setFotos([]);
  };

  const handleSubmit = async (addAnother: boolean) => {
    setIsSaving(true);
    try {
      const prefix = QUICK_ELEMENT_TYPES.find(t => t.value === tipo)?.label.replace('+ ', '').toUpperCase().slice(0, 4) || 'HALL';
      const generatedTag = tagCustom.trim() || `${zonaCodigo}-${prefix}-${String(Date.now()).slice(-3)}`;
      const estadoBom: EstadoBOM = !reemplazo
        ? 'NO_APLICA'
        : itemsMetalicos.length > 0
        ? 'COMPLETO'
        : 'PENDIENTE_REVISION';
      await onSaveExpress({
        tagCodigo: generatedTag.toUpperCase(),
        tipoElemento: tipo,
        gradoCorrosion: grado,
        requiereReemplazo: reemplazo,
        observaciones: nota,
        fotos,
        estadoBom,
        notaBomCampo: notaBom.trim() || undefined,
        itemsMetalicos
      });
      resetForm();
      if (addAnother) {
        setSavedToast(true);
        setTimeout(() => setSavedToast(false), 2000);
      } else {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 space-y-4 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div>
            <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">Hallazgo Express · Zona {zonaCodigo}</span>
            <h3 className="text-sm font-black">Carga Rápida en 4 Pasos</h3>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {savedToast && (
          <div className="p-2.5 rounded-xl bg-emerald-950 border border-emerald-500 text-emerald-300 text-xs font-bold flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Hallazgo guardado en cola. Listo para cargar el siguiente.</span>
          </div>
        )}

        {/* Paso 1: Foto */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-slate-300 block">1. Foto del Elemento ({fotos.length})</span>
          <div className="flex items-center gap-2 overflow-x-auto">
            <label className="min-h-[52px] px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl cursor-pointer flex items-center space-x-2 flex-shrink-0">
              <Camera className="w-4 h-4" />
              <span>{isCompressing ? 'Comprimiendo...' : 'Sacar Foto'}</span>
              <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
            </label>
            {fotos.map((f) => (
              <img key={f.id} src={f.thumbnail_data_url} alt="Hallazgo" className="w-14 h-14 object-cover rounded-xl border border-slate-700 flex-shrink-0" />
            ))}
          </div>
        </div>

        {/* Paso 2: Tipo de elemento */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-slate-300 block">2. Tipo de Elemento</span>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ELEMENT_TYPES.map(item => (
              <button
                key={item.value}
                type="button"
                onClick={() => setTipo(item.value)}
                className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  tipo === item.value
                    ? 'bg-sky-500 text-black border-sky-400'
                    : 'bg-slate-950 text-slate-300 border-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={tagCustom}
            onChange={(e) => setTagCustom(e.target.value)}
            placeholder="Tag / Código opcional (ej: VIGA-N2-04)..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
          />
        </div>

        {/* Paso 3: Severidad + Calderería */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-slate-300 block">3. Severidad ISO 4628</span>
          <div className="grid grid-cols-6 gap-1.5">
            {(['Ri 0', 'Ri 1', 'Ri 2', 'Ri 3', 'Ri 4', 'Ri 5'] as const).map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGrado(g)}
                className={`min-h-[44px] rounded-xl font-mono text-xs font-black border ${
                  grado === g ? 'bg-amber-500 text-black border-amber-400' : 'bg-slate-950 text-slate-300 border-slate-800'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setReemplazo(prev => !prev)}
            className={`w-full min-h-[52px] p-3 rounded-xl border flex items-center justify-between text-left transition ${
              reemplazo ? 'bg-red-950/50 border-red-500' : 'bg-slate-950 border-slate-800'
            }`}
          >
            <span className="text-xs font-bold">¿Requiere calderería / reemplazo estructural?</span>
            <div className={`w-11 h-6 rounded-full p-0.5 transition ${reemplazo ? 'bg-red-500' : 'bg-slate-700'}`}>
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${reemplazo ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </button>

          {reemplazo && (
            <div className="bg-slate-950 border border-amber-500/40 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-300">
                  {itemsMetalicos.length > 0 ? '🟢 BOM con borrador cargado' : '🟡 BOM Pendiente de Revisión en PC'}
                </span>
              </div>
              <input
                type="text"
                value={notaBom}
                onChange={(e) => setNotaBom(e.target.value)}
                placeholder="Nota rápida para Ingeniería / BOM (ej: Cambiar 2 ménsulas ~1.5 m)..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => setShowBomEditor((prev) => !prev)}
                className="w-full flex items-center justify-between text-[11px] font-bold text-sky-300 py-1"
              >
                <span>+ Cargar borrador de perfiles ahora (Opcional)</span>
                {showBomEditor ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showBomEditor && (
                <MetalicoBOMEditor
                  items={itemsMetalicos}
                  catalogo={catalogo}
                  onChange={setItemsMetalicos}
                />
              )}
            </div>
          )}

          {onLocatePin && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onLocatePin();
              }}
              className="w-full py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-semibold flex items-center justify-center space-x-1.5"
            >
              <MapPin className="w-3.5 h-3.5 text-sky-400" />
              <span>📍 Ubicar Pin en Plano (Opcional)</span>
            </button>
          )}
        </div>

        {/* Paso 4: Nota rápida / dictado */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">4. Nota rápida</span>
            <button
              type="button"
              onClick={handleDictate}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center space-x-1 border ${
                isDictating ? 'bg-red-600 text-white border-red-400 animate-pulse' : 'bg-slate-800 text-sky-300 border-slate-700'
              }`}
            >
              {isDictating ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span>{isDictating ? 'Escuchando...' : 'Dictar'}</span>
            </button>
          </div>
          <textarea
            rows={2}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ubicación exacta, espesor remanente o interferencia..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSubmit(false)}
            className="min-h-[48px] py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl"
          >
            Guardar y Cerrar
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSubmit(true)}
            className="min-h-[48px] py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl flex items-center justify-center space-x-1"
          >
            <Plus className="w-4 h-4" />
            <span>Guardar y otro</span>
          </button>
        </div>
      </div>
    </div>
  );
}
