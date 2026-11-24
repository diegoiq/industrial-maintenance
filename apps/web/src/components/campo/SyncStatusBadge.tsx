'use client';

import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, Server, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { syncManager, SyncStatusEvent } from '../../lib/syncManager';

export const SyncStatusBadge: React.FC = () => {
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatusEvent>({
    state: 'idle',
    pendingCount: 0,
    message: 'Listo'
  });

  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = syncManager.subscribe((status) => {
      setSyncStatus(status);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const handleManualSync = () => {
    syncManager.triggerSync();
  };

  return (
    <div className="flex flex-col w-full bg-slate-950 border-b border-slate-800 text-xs text-white">
      <div className="flex items-center justify-between px-3 py-2">
        {/* Indicador de Red */}
        <div className="flex items-center space-x-2">
          {isOnline ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-500/40">
              <Wifi className="w-3 h-3 mr-1 text-emerald-400" />
              ONLINE
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-950 text-red-300 border border-red-500/40 animate-pulse">
              <WifiOff className="w-3 h-3 mr-1 text-red-400" />
              OFFLINE (IndexedDB Activo)
            </span>
          )}

          {/* Cola de pendientes */}
          <span className="text-slate-400">
            Pendientes: <strong className="text-amber-400">{syncStatus.pendingCount}</strong>
          </span>
        </div>

        {/* Botón de sincronización manual */}
        <button
          onClick={handleManualSync}
          disabled={!isOnline || syncStatus.state === 'syncing' || syncStatus.state === 'waking_render'}
          className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.state === 'syncing' || syncStatus.state === 'waking_render' ? 'animate-spin text-amber-400' : ''}`} />
          <span className="hidden sm:inline">Sincronizar</span>
        </button>
      </div>

      {/* Banner de Cold Start o Sync en progreso */}
      {(syncStatus.state === 'waking_render' || syncStatus.state === 'error_cold_start' || syncStatus.state === 'syncing') && (
        <div className={`px-3 py-1.5 flex items-center space-x-2 ${
          syncStatus.state === 'waking_render' 
            ? 'bg-amber-950/80 text-amber-200 border-t border-amber-500/30' 
            : syncStatus.state === 'error_cold_start'
            ? 'bg-orange-950/80 text-orange-200 border-t border-orange-500/30'
            : 'bg-sky-950/80 text-sky-200 border-t border-sky-500/30'
        }`}>
          {syncStatus.state === 'waking_render' && (
            <>
              <Server className="w-4 h-4 text-amber-400 animate-bounce flex-shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">Conectando con servidor Neon &amp; Backblaze B2...</span>
                <span className="block text-[10px] text-amber-300/80">Tus datos y fotos permanecen seguros en el dispositivo.</span>
              </div>
            </>
          )}

          {syncStatus.state === 'syncing' && (
            <>
              <RefreshCw className="w-4 h-4 text-sky-400 animate-spin flex-shrink-0" />
              <div className="flex-1">
                <span>{syncStatus.message}</span>
              </div>
            </>
          )}

          {syncStatus.state === 'error_cold_start' && (
            <>
              <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />
              <div className="flex-1">
                <span>{syncStatus.message}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
