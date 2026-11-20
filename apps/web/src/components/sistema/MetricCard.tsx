'use client';

import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';

interface MetricCardProps {
  title: string;
  service: 'Supabase' | 'Render';
  currentValue: number;
  limitValue: number;
  unit: string;
  usagePercent: number;
  description: string;
  preventativeAction: string;
  actionButtonText?: string;
  onActionClick?: () => void;
  subBreakdown?: { name: string; value: string; count?: number }[];
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  service,
  currentValue,
  limitValue,
  unit,
  usagePercent,
  description,
  preventativeAction,
  actionButtonText,
  onActionClick,
  subBreakdown
}) => {
  // Regla de semáforo: <70% verde, 70-85% amarillo, >85% rojo
  const status: 'verde' | 'amarillo' | 'rojo' = 
    usagePercent >= 85 ? 'rojo' : usagePercent >= 70 ? 'amarillo' : 'verde';

  const formatValue = (bytesOrVal: number, u: string) => {
    if (u === 'bytes') {
      const mb = bytesOrVal / (1024 * 1024);
      if (mb >= 1024) {
        return `${(mb / 1024).toFixed(2)} GB`;
      }
      return `${mb.toFixed(1)} MB`;
    }
    return `${bytesOrVal.toLocaleString()} ${u}`;
  };

  return (
    <div className={`rounded-xl border p-5 bg-slate-900 transition-all ${
      status === 'rojo'
        ? 'border-red-500/70 shadow-lg shadow-red-950/40'
        : status === 'amarillo'
        ? 'border-amber-500/60 shadow-lg shadow-amber-950/30'
        : 'border-slate-800'
    }`}>
      {/* Cabecera */}
      <div className="flex items-start justify-between">
        <div>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
            service === 'Supabase' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-indigo-950 text-indigo-400 border border-indigo-800'
          }`}>
            {service}
          </span>
          <h4 className="text-base font-bold text-white mt-1.5">{title}</h4>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>

        {/* Badge Semáforo */}
        <div>
          {status === 'verde' && (
            <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-500/40">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>&lt; 70% Normal</span>
            </span>
          )}
          {status === 'amarillo' && (
            <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-500/50 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>70% - 85% Alerta</span>
            </span>
          )}
          {status === 'rojo' && (
            <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-950 text-red-300 border border-red-500 animate-bounce">
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              <span>&gt; 85% Crítico</span>
            </span>
          )}
        </div>
      </div>

      {/* Barra de Progreso y Números */}
      <div className="mt-4 space-y-2">
        <div className="flex items-baseline justify-between text-xs">
          <div className="flex items-baseline space-x-1.5">
            <span className="text-2xl font-black font-mono text-white">
              {formatValue(currentValue, unit)}
            </span>
            <span className="text-slate-500">/ {formatValue(limitValue, unit)}</span>
          </div>
          <span className={`font-mono font-bold text-sm ${
            status === 'rojo' ? 'text-red-400' : status === 'amarillo' ? 'text-amber-400' : 'text-emerald-400'
          }`}>
            {usagePercent.toFixed(1)}%
          </span>
        </div>

        {/* Barra visual con marcas en 70% y 85% */}
        <div className="relative w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              status === 'rojo' ? 'bg-red-500' : status === 'amarillo' ? 'bg-amber-400' : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(2, usagePercent))}%` }}
          />
          {/* Guía 70% */}
          <div className="absolute top-0 bottom-0 left-[70%] w-0.5 bg-amber-500/40" title="Alerta preventiva 70%" />
          {/* Guía 85% */}
          <div className="absolute top-0 bottom-0 left-[85%] w-0.5 bg-red-500/50" title="Nivel crítico 85%" />
        </div>
      </div>

      {/* Desglose secundario (ej. por bucket) */}
      {subBreakdown && subBreakdown.length > 0 && (
        <div className="mt-3.5 pt-3 border-t border-slate-800/80 space-y-1.5">
          <span className="text-[11px] font-semibold text-slate-400 block">Distribución por contenido:</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {subBreakdown.map((item, idx) => (
              <div key={idx} className="bg-slate-950/80 px-2.5 py-1.5 rounded border border-slate-800">
                <span className="text-[10px] text-slate-400 truncate block">{item.name}</span>
                <span className="font-mono text-slate-200 font-semibold">{item.value}</span>
                {item.count !== undefined && (
                  <span className="text-[10px] text-slate-500 block">{item.count} archivos</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerta y Acción preventiva sugerida */}
      <div className={`mt-4 p-3 rounded-lg flex items-center justify-between text-xs ${
        status === 'rojo'
          ? 'bg-red-950/70 border border-red-500/50 text-red-200'
          : status === 'amarillo'
          ? 'bg-amber-950/60 border border-amber-500/40 text-amber-200'
          : 'bg-slate-950 border border-slate-800 text-slate-300'
      }`}>
        <div className="flex-1 pr-3">
          <strong className="block text-[11px] uppercase tracking-wide opacity-80">
            {status === 'rojo' ? 'Acción Crítica Inmediata:' : 'Acción Preventiva Sugerida:'}
          </strong>
          <span>{preventativeAction}</span>
        </div>

        {actionButtonText && onActionClick && (
          <button
            onClick={onActionClick}
            className={`px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap flex items-center space-x-1 transition ${
              status === 'rojo'
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
            }`}
          >
            <span>{actionButtonText}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
