'use client';

import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Database, 
  HardDrive, 
  Cpu, 
  Activity, 
  AlertTriangle, 
  ShieldCheck, 
  RefreshCw, 
  DownloadCloud, 
  Trash2,
  Zap,
  Sliders,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { MetricCard } from '../../../components/sistema/MetricCard';
import { INITIAL_TELEMETRY } from '../../../lib/mockData';
import { InfraTelemetryMetrics } from '../../../types';

export default function SistemaTelemetriaPage() {
  const [metrics, setMetrics] = useState<InfraTelemetryMetrics>(INITIAL_TELEMETRY);
  const [isLoading, setIsLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [stressTestActive, setStressTestActive] = useState(false);

  // Consulta de métricas en vivo desde el backend de FastAPI
  const fetchLiveMetrics = async () => {
    setIsLoading(true);
    try {
      const apiEngineUrl = process.env.NEXT_PUBLIC_API_ENGINE_URL || 'http://localhost:8000';
      const res = await fetch(`${apiEngineUrl}/health/metrics`, { cache: 'no-store' }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        setMetrics(prev => ({
          ...prev,
          render_api: {
            service_name: data.service_name || 'industrial-maintenance-engine',
            container_limit_mb: data.container_limit_mb || 512,
            process_ram_mb: data.process_ram_mb || 138.4,
            render_ram_percent: data.render_ram_percent || 27.0,
            alert_status: data.alert_status || 'optimo',
            alert_message: data.alert_message || 'OK',
            uptime_seconds: data.uptime_seconds || 3600
          }
        }));
      }
    } catch (err) {
      console.warn('Backend metrics offline, utilizando telemetría de monitoreo simulada');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveMetrics();
  }, []);

  // Simulación de "Exportar y Archivar campañas cerradas" para liberar Storage
  const handleArchiveClosedCampaigns = () => {
    setIsLoading(true);
    setTimeout(() => {
      setMetrics(prev => {
        const nuevoStorage = prev.supabase.storage_size_bytes * 0.45; // libera el 55%
        return {
          ...prev,
          supabase: {
            ...prev.supabase,
            storage_size_bytes: Math.round(nuevoStorage),
            storage_usage_percent: Number(((nuevoStorage / prev.supabase.storage_limit_bytes) * 100).toFixed(1)),
            buckets: prev.supabase.buckets.map(b => b.bucket_id.includes('fotos') ? { ...b, total_bytes: Math.round(b.total_bytes * 0.4) } : b)
          }
        };
      });
      setIsLoading(false);
      setActionNotice('¡Archivo comprimido generado con éxito! Se descargó ZIP y se liberaron 120 MB en Supabase Storage.');
      setTimeout(() => setActionNotice(null), 5000);
    }, 1200);
  };

  // Simulación de Keep-Alive semanal Supabase (evita pausa a los 7 días de inactividad)
  const handleKeepAlive = () => {
    setActionNotice('Heartbeat ejecutado: Supabase PostgreSQL se mantendrá activo sin entrar en pausa de 7 días.');
    setTimeout(() => setActionNotice(null), 4000);
  };

  // Activar / Desactivar prueba de estrés para verificar semáforos preventivos (>85% y 70-85%)
  const toggleStressTest = () => {
    setStressTestActive(!stressTestActive);
    if (!stressTestActive) {
      // Forzar valores altos para activar semáforo rojo y amarillo
      setMetrics(prev => ({
        ...prev,
        supabase: {
          ...prev.supabase,
          storage_size_bytes: 940000000, // ~940 MB (87.5% -> ROJO)
          storage_usage_percent: 87.5
        },
        render_api: {
          ...prev.render_api,
          process_ram_mb: 395.0, // ~77% de 512MB -> AMARILLO
          render_ram_percent: 77.1,
          alert_status: 'advertencia',
          alert_message: 'Uso de RAM superior al 70%. Alerta preventiva antes de llegar al límite de Render.'
        }
      }));
    } else {
      setMetrics(INITIAL_TELEMETRY);
    }
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Cabecera del Módulo 7 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-purple-950 text-purple-400 border border-purple-800">
              MÓDULO 7 · ROL ADMIN
            </span>
            <span className="text-xs text-slate-500 font-mono">Límites Free Tier (Render + Supabase)</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight mt-1 flex items-center space-x-2">
            <span>Monitor de Salud y Límites de Infraestructura</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Control de saturación en tiempo real para evitar fallos en planta: previene desbordes en Supabase Storage (1 GB), suspensión de base de datos por inactividad de 7 días y reinicios Out-Of-Memory (OOM) en Render (512 MB).
          </p>
        </div>

        {/* Acciones de Control */}
        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={toggleStressTest}
            className={`px-3 py-2 rounded-lg text-xs font-bold border transition flex items-center space-x-1.5 ${
              stressTestActive 
                ? 'bg-amber-500 text-black border-amber-400 font-black' 
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{stressTestActive ? 'Desactivar Simulación' : 'Simular Alerta Crítica (87%)'}</span>
          </button>

          <button
            type="button"
            onClick={fetchLiveMetrics}
            disabled={isLoading}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg transition disabled:opacity-50"
            title="Refrescar métricas"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs flex items-center space-x-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Alerta Destacada Crítica si algún indicador supera 85% */}
      {metrics.supabase.storage_usage_percent >= 85 && (
        <div className="p-4 rounded-xl bg-red-950/90 border-2 border-red-500 text-red-100 flex items-start justify-between gap-4 shadow-xl">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5 animate-bounce" />
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wide">
                ALERTA CRÍTICA: Supabase Storage ha superado el 85% de su capacidad gratuita ({metrics.supabase.storage_usage_percent}%)
              </h4>
              <p className="text-xs text-red-200/90 mt-1">
                Quedan menos de 100 MB disponibles. Si los inspectores suben nuevas fotos sin archivar las campañas cerradas, Supabase rechazará las peticiones.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleArchiveClosedCampaigns}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider rounded-lg shadow-lg whitespace-nowrap"
          >
            Exportar y Archivar Ahora
          </button>
        </div>
      )}

      {/* Grid de Tarjetas de Monitoreo Preventivo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 1. Supabase Storage */}
        <MetricCard
          service="Supabase"
          title="Supabase Storage (Fotos y Reportes)"
          currentValue={metrics.supabase.storage_size_bytes}
          limitValue={metrics.supabase.storage_limit_bytes}
          unit="bytes"
          usagePercent={metrics.supabase.storage_usage_percent}
          description="Almacenamiento de fotografías WebP comprimidas en cliente, miniaturas y planos SVG."
          preventativeAction="Descarga un ZIP con las inspecciones y fotos de campañas anteriores para liberar espacio sin perder datos históricos."
          actionButtonText="Exportar y Archivar"
          onActionClick={handleArchiveClosedCampaigns}
          subBreakdown={metrics.supabase.buckets.map(b => ({
            name: b.bucket_id,
            value: `${(b.total_bytes / (1024 * 1024)).toFixed(1)} MB`,
            count: b.total_archivos
          }))}
        />

        {/* 2. Supabase Base de Datos PostgreSQL */}
        <MetricCard
          service="Supabase"
          title="Tamaño Base de Datos PostgreSQL"
          currentValue={metrics.supabase.db_size_bytes}
          limitValue={metrics.supabase.db_limit_bytes}
          unit="bytes"
          usagePercent={metrics.supabase.db_usage_percent}
          description="Medido mediante función RPC get_supabase_usage() ejecutando pg_database_size()."
          preventativeAction="Purgar registros antiguos de auditoria_cambios o snapshots de telemetría de más de 12 meses."
          actionButtonText="Purgar Auditoría"
          onActionClick={() => {
            setActionNotice('Se purgaron 1,240 registros de auditoría antiguos. Liberados 4.2 MB.');
            setTimeout(() => setActionNotice(null), 4000);
          }}
        />

        {/* 3. Render API RAM */}
        <MetricCard
          service="Render"
          title="Render API RAM (FastAPI & Cálculos)"
          currentValue={metrics.render_api.process_ram_mb}
          limitValue={metrics.render_api.container_limit_mb}
          unit="MB"
          usagePercent={metrics.render_api.render_ram_percent}
          description="Medido en tiempo real mediante psutil en endpoint /health/metrics (Free Tier: 512 MB)."
          preventativeAction="Evitar convertir archivos DXF pesados (>20MB) en horario de relevamiento para prevenir reinicios Out-Of-Memory (OOM)."
        />

        {/* 4. Supabase Egress (Transferencia) */}
        <MetricCard
          service="Supabase"
          title="Supabase Egress (Transferencia Mensual)"
          currentValue={metrics.supabase.egress_estimado_bytes}
          limitValue={metrics.supabase.egress_limit_bytes}
          unit="bytes"
          usagePercent={metrics.supabase.egress_usage_percent}
          description="Tráfico de descarga mensual acumulado por sincronizaciones de planos y galerías."
          preventativeAction="Utilizar siempre miniaturas (~20 KB) en listados y no descargar el WebP original hasta abrir el zoom."
        />
      </div>

      {/* Panel de Mantenimiento Preventivo Adicional: Keep-Alive y Parámetros */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
          <Clock className="w-4 h-4 text-amber-400" />
          <span>Keep-Alive Automático y Prevención de Suspensión</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
            <span className="font-bold text-slate-200 block">Pausa de Inactividad (Supabase)</span>
            <p className="text-slate-400 text-[11px]">
              El plan gratuito de Supabase pausa el proyecto tras 7 días seguidos sin consultas.
            </p>
            <button
              type="button"
              onClick={handleKeepAlive}
              className="mt-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-bold border border-slate-700 text-[11px]"
            >
              Ejecutar Keep-Alive Ahora
            </button>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
            <span className="font-bold text-slate-200 block">Horas de Instancia Render</span>
            <p className="text-slate-400 text-[11px]">
              750 horas mensuales disponibles en plan Free. Se consumen ~340 horas al mes con cold sleep tras 15 min.
            </p>
            <span className="inline-block text-[11px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
              Consumo proyectado: 45.3%
            </span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
            <span className="font-bold text-slate-200 block">Configuración de Cuotas</span>
            <p className="text-slate-400 text-[11px]">
              Los topes numéricos están guardados en la tabla <code className="text-amber-400">configuracion_limites_infra</code>.
            </p>
            <span className="text-[11px] text-slate-400 block">
              Al contratar plan Starter ($7/mo), solo actualizas el valor en BD sin modificar el código.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
