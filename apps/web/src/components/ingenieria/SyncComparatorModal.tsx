'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  HardDrive,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowUpCircle,
  ArrowDownCircle,
  Layers,
  Image as ImageIcon,
  MapPin,
  Camera,
  Compass
} from 'lucide-react';
import {
  compareLocalCacheWithCloud,
  CacheComparisonReport,
  pushFastSyncToCloud,
  pullAndReconcileFromCloud
} from '../../lib/cloudSync';

interface SyncComparatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncCompleted: () => void;
}

export const SyncComparatorModal: React.FC<SyncComparatorModalProps> = ({
  isOpen,
  onClose,
  onSyncCompleted
}) => {
  const [report, setReport] = useState<CacheComparisonReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadComparison = async () => {
    setIsLoading(true);
    try {
      const res = await compareLocalCacheWithCloud();
      setReport(res);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadComparison();
      setActionMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePushLocalToCloud = async (includeImages = false) => {
    setIsLoading(true);
    setActionMessage(null);
    try {
      const res = await pushFastSyncToCloud({
        includePlanImages: includeImages,
        authoritativeZonas: true,
        authoritativeHitos: true
      });
      await loadComparison();
      onSyncCompleted();
      if (res.success) {
        setActionMessage('⬆️ Datos locales subidos y espejados en Neon PostgreSQL.');
      } else {
        setActionMessage('⚠️ Error al subir: ' + (res.error || 'Verificar conexión'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePullCloudToLocal = async (forcePlanImage = false) => {
    setIsLoading(true);
    setActionMessage(null);
    try {
      const ok = await pullAndReconcileFromCloud({ forceFullPlanDownload: forcePlanImage });
      await loadComparison();
      onSyncCompleted();
      setActionMessage(
        ok
          ? '⬇️ Caché local actualizada con los datos de Neon Cloud.'
          : '⚠️ No se pudo descargar desde la nube.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border-2 border-indigo-500/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col my-6 max-h-[92vh]">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center space-x-2.5">
            <HardDrive className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Monitor Edge-First: Caché Local vs. Nube (Neon + B2)
              </h3>
              <span className="text-[10px] font-mono text-slate-400">
                Comparación por manifiesto ultraligero (~500 bytes) · Descarga de planos 1 sola vez
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={loadComparison}
              disabled={isLoading}
              className="p-1.5 text-slate-300 hover:text-white bg-slate-900 rounded-lg border border-slate-700"
              title="Volver a comparar"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {actionMessage && (
            <div className="p-3 bg-indigo-950/90 border border-indigo-500/60 rounded-xl text-indigo-200 font-semibold flex items-center justify-between">
              <span>{actionMessage}</span>
            </div>
          )}

          {!report ? (
            <div className="py-12 text-center text-slate-400 font-mono">
              Analizando caché IndexedDB del dispositivo y manifiesto de Neon Cloud...
            </div>
          ) : (
            <>
              {/* Semáforo General de Alineación */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                  report.isAligned
                    ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200'
                    : 'bg-amber-950/60 border-amber-500/60 text-amber-200'
                }`}
              >
                <div className="flex items-center space-x-3">
                  {report.isAligned ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0" />
                  )}
                  <div>
                    <span className="font-black text-xs uppercase block">
                      {report.isAligned
                        ? '100% SINCRONIZADO — TRABAJANDO EN EL BORDE (0 DESCARGAS)'
                        : 'DIFERENCIAS DETECTADAS ENTRE ESTE DISPOSITIVO Y LA NUBE'}
                    </span>
                    <span className="text-[11px] opacity-90 block">
                      Memoria en caché local de este dispositivo: <strong>{formatSize(report.localCacheBytes)}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Tabla Comparativa Lado a Lado: Dispositivo Local vs. Nube */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                      <th className="p-2.5">Entidad / Archivo</th>
                      <th className="p-2.5">💻 En Caché Local (Este Equipo)</th>
                      <th className="p-2.5">☁️ En Base de Datos (Neon/B2)</th>
                      <th className="p-2.5 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-mono">
                    {/* 1. Planos e Imágenes */}
                    <tr>
                      <td className="p-2.5 font-sans font-bold text-slate-200 flex items-center space-x-1.5">
                        <ImageIcon className="w-4 h-4 text-sky-400" />
                        <span>Plano CAD / PDF</span>
                      </td>
                      <td className="p-2.5 text-sky-300">
                        {report.local.planos.length} plano(s){' '}
                        {report.local.planos.every(p => p.cachedInEdge && p.sizeBytes > 0)
                          ? `(${formatSize(report.local.planos.reduce((a, b) => a + b.sizeBytes, 0))} en caché)`
                          : '(Sin imagen local)'}
                      </td>
                      <td className="p-2.5 text-slate-300">
                        {report.cloud ? `${report.cloud.counts.planos} plano(s)` : 'Sin conexión'}
                      </td>
                      <td className="p-2.5 text-right">
                        {!report.needsInitialPlanDownload && report.local.planos.length > 0 ? (
                          <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded text-[10px] font-bold">
                            EN CACHÉ LOCAL
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 rounded text-[10px] font-bold">
                            FALTA BAJAR
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* 2. Zonas de Inspección */}
                    <tr>
                      <td className="p-2.5 font-sans font-bold text-slate-200 flex items-center space-x-1.5">
                        <Layers className="w-4 h-4 text-amber-400" />
                        <span>Zonas Delimitadas</span>
                      </td>
                      <td className="p-2.5 text-amber-300 font-bold">{report.local.zonas.length} zonas</td>
                      <td className="p-2.5 text-slate-300">{report.cloud ? `${report.cloud.counts.zonas} zonas` : '-'}</td>
                      <td className="p-2.5 text-right">
                        {report.diff.zonasOnlyLocal.length === 0 && report.diff.zonasOnlyCloud.length === 0 ? (
                          <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded text-[10px] font-bold">
                            IGUALES
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 rounded text-[10px] font-bold">
                            {report.diff.zonasOnlyLocal.length > 0
                              ? `+${report.diff.zonasOnlyLocal.length} LOCAL`
                              : `+${report.diff.zonasOnlyCloud.length} EN NUBE`}
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* 3. Pines / Elementos */}
                    <tr>
                      <td className="p-2.5 font-sans font-bold text-slate-200 flex items-center space-x-1.5">
                        <MapPin className="w-4 h-4 text-orange-400" />
                        <span>Pines / Hallazgos</span>
                      </td>
                      <td className="p-2.5 text-slate-200">{report.local.elementosCount} pines</td>
                      <td className="p-2.5 text-slate-300">{report.cloud ? `${report.cloud.counts.elementos} pines` : '-'}</td>
                      <td className="p-2.5 text-right">
                        {report.cloud && report.local.elementosCount === report.cloud.counts.elementos ? (
                          <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded text-[10px] font-bold">
                            IGUALES
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 rounded text-[10px] font-bold">
                            DIFERENTE
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* 4. Hitos GPS */}
                    <tr>
                      <td className="p-2.5 font-sans font-bold text-slate-200 flex items-center space-x-1.5">
                        <Compass className="w-4 h-4 text-emerald-400" />
                        <span>Hitos GPS</span>
                      </td>
                      <td className="p-2.5 text-slate-200">{report.local.hitosCount} hitos</td>
                      <td className="p-2.5 text-slate-300">{report.cloud ? `${report.cloud.counts.hitos} hitos` : '-'}</td>
                      <td className="p-2.5 text-right">
                        {report.cloud && report.local.hitosCount === report.cloud.counts.hitos ? (
                          <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded text-[10px] font-bold">
                            IGUALES
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 rounded text-[10px] font-bold">
                            DIFERENTE
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* 5. Inspecciones y Fotos */}
                    <tr>
                      <td className="p-2.5 font-sans font-bold text-slate-200 flex items-center space-x-1.5">
                        <Camera className="w-4 h-4 text-purple-400" />
                        <span>Inspecciones y Fotos</span>
                      </td>
                      <td className="p-2.5 text-purple-300">
                        {report.local.inspeccionesCount} insp. ({report.local.fotosCount} fotos)
                      </td>
                      <td className="p-2.5 text-slate-300">
                        {report.cloud
                          ? `${report.cloud.counts.inspecciones} insp. (${report.cloud.counts.fotos} fotos)`
                          : '-'}
                      </td>
                      <td className="p-2.5 text-right">
                        {report.diff.inspeccionesOnlyLocalCount === 0 &&
                        report.diff.inspeccionesOnlyCloudCount === 0 ? (
                          <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded text-[10px] font-bold">
                            IGUALES
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 rounded text-[10px] font-bold">
                            POR SINCRONIZAR
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Detalle de Códigos de Zonas en Caché Local vs. Nube */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="text-[10px] font-mono font-bold uppercase text-sky-400 flex items-center space-x-1">
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>Zonas en este dispositivo ({report.local.zonas.length}):</span>
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {report.local.zonas.map(z => (
                      <span
                        key={z.id}
                        className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${
                          z.status === 'synced'
                            ? 'bg-slate-900 text-slate-200 border-slate-700'
                            : 'bg-amber-950 text-amber-300 border-amber-500'
                        }`}
                        title={z.nombre}
                      >
                        {z.codigo} {z.status === 'local_only' ? '(Solo Local)' : '✓'}
                      </span>
                    ))}
                    {report.local.zonas.length === 0 && (
                      <span className="text-slate-500 italic">Sin zonas en caché local</span>
                    )}
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="text-[10px] font-mono font-bold uppercase text-indigo-400 flex items-center space-x-1">
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Zonas en Neon Cloud ({report.cloud?.zonas.length || 0}):</span>
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(report.cloud?.zonas || []).map(z => (
                      <span
                        key={z.id}
                        className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-indigo-950/60 text-indigo-200 border border-indigo-800"
                        title={z.nombre}
                      >
                        {z.codigo}
                      </span>
                    ))}
                    {(!report.cloud || report.cloud.zonas.length === 0) && (
                      <span className="text-slate-500 italic">Sin zonas en la nube</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Acciones Manuales de Control de Caché y Nube */}
              <div className="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handlePushLocalToCloud(false)}
                  disabled={isLoading}
                  className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center space-x-2 shadow transition"
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  <span>Subir Zonas y Cambios Locales a Nube</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePullCloudToLocal(false)}
                  disabled={isLoading}
                  className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center space-x-2 shadow transition"
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  <span>Descargar Novedades desde Nube (~4 KB)</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
