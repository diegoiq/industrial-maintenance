import { Area, Plano, ZonaInspeccion, Elemento, ParametroCubicacion, InfraTelemetryMetrics } from '../types';

// Los catálogos de áreas y planos inician limpios para que cada fábrica cargue sus propios planos
export const INITIAL_AREAS: Area[] = [];

export const INITIAL_PLANOS: Plano[] = [];

export const INITIAL_ZONAS: ZonaInspeccion[] = [];

export const INITIAL_ELEMENTOS: Elemento[] = [];

export const INITIAL_PARAMETROS: ParametroCubicacion[] = [
  {
    id: 'param-1',
    categoria: 'rendimientos',
    clave: 'hh_por_m2_pintura_epoxi',
    valor_numerico: 0.45,
    unidad: 'HH/m2',
    descripcion: 'Horas-Hombre por m2 de saniado mecánico St2 y aplicación epoxi'
  },
  {
    id: 'param-2',
    categoria: 'rendimientos',
    clave: 'hh_por_kg_acero_reemplazo',
    valor_numerico: 0.12,
    unidad: 'HH/kg',
    descripcion: 'Horas-Hombre por kg de corte, calderería y montaje estructural'
  },
  {
    id: 'param-3',
    categoria: 'costos',
    clave: 'costo_hh_oficial_montador',
    valor_numerico: 28.50,
    unidad: 'USD/HH',
    descripcion: 'Costo unitario por hora oficial de montaje'
  },
  {
    id: 'param-4',
    categoria: 'costos',
    clave: 'costo_m2_sistema_epoxi_poliuretano',
    valor_numerico: 18.20,
    unidad: 'USD/m2',
    descripcion: 'Costo de insumos de pintura industrial especificación marina'
  },
  {
    id: 'param-5',
    categoria: 'costos',
    clave: 'costo_kg_acero_perfileria',
    valor_numerico: 3.40,
    unidad: 'USD/kg',
    descripcion: 'Costo comercial de perfiles laminados con granallado'
  },
  {
    id: 'param-6',
    categoria: 'andamios',
    clave: 'costo_m3_andamio_mes',
    valor_numerico: 12.00,
    unidad: 'USD/m3',
    descripcion: 'Alquiler y armado de andamios certificados'
  }
];

export const INITIAL_TELEMETRY: InfraTelemetryMetrics = {
  supabase: {
    db_size_bytes: 35651584, // ~34 MB base
    db_limit_bytes: 524288000, // 500 MB Free Tier
    db_usage_percent: 6.8,
    storage_size_bytes: 52428800, // ~50 MB
    storage_limit_bytes: 1073741824, // 1 GB Free Tier
    storage_usage_percent: 4.8,
    buckets: [
      { bucket_id: 'planos-svg', total_bytes: 4194304, total_archivos: 2 },
      { bucket_id: 'fotos-inspeccion-webp', total_bytes: 46137344, total_archivos: 250 },
      { bucket_id: 'reportes-pdf-export', total_bytes: 2097152, total_archivos: 4 }
    ],
    egress_estimado_bytes: 429496729, // ~0.4 GB
    egress_limit_bytes: 5368709120, // 5 GB/mes
    egress_usage_percent: 8.0
  },
  render_api: {
    service_name: 'industrial-maintenance-engine (FastAPI)',
    container_limit_mb: 512,
    process_ram_mb: 138.4,
    render_ram_percent: 27.03,
    alert_status: 'optimo',
    alert_message: 'Consumo de recursos dentro de los márgenes seguros.',
    uptime_seconds: 4820
  },
  render_web: {
    service_name: 'industrial-maintenance-web (Next.js)',
    container_limit_mb: 512,
    process_ram_mb: 212.8,
    render_ram_percent: 41.56,
    alert_status: 'optimo'
  }
};
