export type RolUsuario = 'admin' | 'ingeniero' | 'inspector' | 'consulta';

export type EstadoSemaforo = 'gris' | 'verde' | 'amarillo' | 'naranja' | 'rojo';

export type TipoElemento = 
  | 'acero_estructural' 
  | 'baranda' 
  | 'plataforma' 
  | 'soporte' 
  | 'equipo' 
  | 'caneria' 
  | 'tanque'
  | 'parral_caneria'
  | 'columna_hormigon'
  | 'junta_dilatacion'
  | 'tabique'
  | 'viga_hormigon'
  | 'losa'
  | 'base_bomba'
  | string;

export interface EvaluacionCivilItem {
  elemento_civil: string; // 'juntas' | 'tabiques' | 'columnas' | 'vigas' | 'losas' | 'bases_bombas' | custom
  estado: 'bueno' | 'regular' | 'severo' | 'critico';
  patologias: string[]; // ej: ['Fisuración / Grietas', 'Armadura expuesta / Corrosión', 'Desprendimiento / Spalling', 'Filtración / Humedad', 'Falla de sello / Junta', 'Vibración / Grout fisurado']
  observacion?: string;
}

export type DisciplinaZona = 
  | 'estructuras_acero'
  | 'parral_canerias'
  | 'soportes'
  | 'canerias_proceso'
  | 'columnas_hormigon'
  | 'barandas_plataformas'
  | 'equipos_proceso'
  | 'tanques_silos'
  | 'cerramientos_cubiertas'
  | 'bandejas_electricas'
  | 'puentes_grua_escaleras'
  | 'obras_civiles_pisos'
  | string;

export type TipoHito = 
  | 'mojon_topografico'
  | 'acceso_vial'
  | 'vertice_perimetro'
  | 'subestacion'
  | 'tanque_exterior'
  | 'referencia_general';

export interface HitoGeografico {
  id: string;
  codigo: string; // ej: HITO-01, MOJON-NORTE
  nombre: string;
  tipo: TipoHito;
  lat: number;
  lng: number;
  cota_snm?: number; // ej: 146000
  descripcion?: string;
  plano_id?: string;
  coordenadas_plano?: { x: number; y: number };
  created_at: string;
}

export interface Area {
  id: string;
  codigo: string;
  nombre: string;
  ubicacion_tecnica_erp?: string;
  descripcion?: string;
}

export interface PlanoGeoreferencia {
  anchorLat: number;
  anchorLng: number;
  anchorPixelX: number;
  anchorPixelY: number;
  metersPerPixel: number;
  scaleRatioX?: number; // Factor de estiramiento/contracción Ancho X del Lay Out CAD alrededor del Pivote (1.0 = 100%)
  scaleRatioY?: number; // Factor de estiramiento/contracción Alto Y del Lay Out CAD alrededor del Pivote (1.0 = 100%)
  rotationDeg: number;
  satelliteOpacity?: number;
  invertCadLines?: boolean;
  showSatelliteLayer?: boolean;
  updated_at?: string;
}

export interface Plano {
  id: string;
  area_id: string;
  titulo: string;
  archivo_original_url?: string;
  svg_url?: string;
  svg_content?: string;
  archivo_data_url?: string;
  rotacion?: number; // 0, 90, 180, 270 grados
  tipo_plano?: 'layout_general' | 'area_detalle' | 'elevacion_isometrico';
  dimensiones_viewbox: { width: number; height: number };
  georeferencia?: PlanoGeoreferencia;
  version: number;
  activo: boolean;
}

export interface ZonaInspeccion {
  id: string;
  plano_id: string;
  area_planta?: string; // Ej: "131 - Efluentes", "411 - Blanqueo", "Calderas"
  codigo: string;
  nombre: string;
  cota_nivel?: number; // Cota s.n.m. ej: 146000 (Suelo), 152000 (+6m), 158000 (+12m)
  nombre_nivel?: string; // ej: "Nivel Suelo (+146.000)", "Nivel Pasarelas (+152.000)"
  disciplinas_involucradas?: DisciplinaZona[];
  estado_salud_apriori?: 'bueno' | 'regular' | 'malo' | 'critico';
  superficie_estimada_m2?: number;
  coordenadas_gps_override?: { lat: number; lng: number };
  poligono_svg: {
    puntos: { x: number; y: number }[];
  };
  nivel_acceso_andamio?: {
    requiere_andamio?: boolean;
    tipo_acceso?: 'suelo' | 'escalera' | 'manlift' | 'andamio_tubular' | 'andamio_colgante';
    altura_mts: number;
    envolvente_m3: number;
    complejidad: 'baja' | 'media' | 'alta';
    requiere_parada: boolean;
    estimado_en_campo_por?: string;
  };
}

export interface Elemento {
  id: string;
  zona_id: string;
  tag_codigo: string;
  codigo_equipo_erp?: string;
  qr_token: string;
  tipo_elemento: TipoElemento;
  coordenadas_pin: { x: number; y: number };
  cota_nivel?: number;
  nombre_nivel?: string;
  creado_en_campo?: boolean;
  geometria_parametros: {
    perfil?: string;
    longitud_m: number;
    m2_superficie: number;
    peso_kg: number;
    tipologia?: string;
  };
  criticidad_activo: number; // 1 a 5
  estado_actual: EstadoSemaforo;
  antiguedad_anios?: number; // Antigüedad estructural en servicio
  ultimo_revestimiento_anios?: number; // Años desde el último esquema de pintura
  tasa_avance_anual_pct?: number; // Tasa de deterioro estimada (% anual según ISO 12944)
  ultima_inspeccion_fecha?: string;
  coordenadas_gps?: { lat: number; lng: number; precision_m?: number };
}

export interface VectorAnnotation {
  id: string;
  tipo: 'rectangulo' | 'circulo' | 'flecha' | 'trazo_libre' | 'texto';
  coordenadas: { x: number; y: number; x2?: number; y2?: number; puntos?: { x: number; y: number }[] };
  color: string;
  etiqueta?: string;
}

export interface FotoInspeccionLocal {
  id?: string;
  storage_url?: string;
  thumbnail_data_url: string;
  micro_thumbnail_data_url?: string;
  original_webp_blob?: Blob;
  peso_bytes: number;
  comentario?: string;
  anotaciones_canvas: VectorAnnotation[];
}

export type MorfologiaCorrosiva = 'superficial' | 'activo_laminar' | 'picado_perdida_seccion';
export type AmbienteISO12944 = 'C3' | 'C4' | 'C5' | 'CX';

export interface MuestreoTramoTecnico {
  aplica: boolean;
  longitud_tramo_m: number;
  unidades_totales: number;
  unidades_afectadas: number;
  extension_normalizada_pct: number;
  morfologia_dominante: MorfologiaCorrosiva;
  ambiente_iso12944: AmbienteISO12944;
  tasa_calculada_pct_anio: number;
}

export interface Inspeccion {
  id: string;
  elemento_id: string;
  zona_id?: string;
  zona_codigo?: string;
  inspector_id?: string;
  inspector_nombre?: string;
  fecha_inspeccion: string;
  estado_sincronizacion: 'pendiente' | 'sincronizado' | 'error';
  clasificacion_sustrato: string;
  clasificacion_recubrimiento: string;
  grado_corrosion: string; // ISO 4628 / ASTM D610
  requiere_reemplazo: boolean;
  porcentaje_afectado: number;
  criticidad_calculada: number;
  requiere_andamio?: boolean;
  tipo_acceso_sugerido?: 'suelo' | 'escalera' | 'manlift' | 'andamio_tubular' | 'andamio_colgante';
  altura_andamio_m?: number;
  volumen_andamio_m3?: number;
  antiguedad_anios?: number;
  ultimo_revestimiento_anios?: number;
  tasa_avance_anual_pct?: number;
  meses_ventana_intervencion?: number;
  espesor_dft_um?: number;
  espesor_ut_mm?: number;
  proxima_inspeccion_fecha?: string;
  coordenadas_gps?: { lat: number; lng: number; precision_m?: number; timestamp?: string; en_recorrido?: boolean };
  historial_recorrido_gps?: { lat: number; lng: number; precision_m?: number; timestamp: string; pixelX?: number; pixelY?: number; zona_detectada?: string }[];
  evaluacion_civil?: {
    aplica: boolean;
    items: EvaluacionCivilItem[];
    notas_civiles?: string;
  };
  muestreo_tramo?: MuestreoTramoTecnico;
  observaciones?: string;
  diagnostico_ia?: any;
  fotos: FotoInspeccionLocal[];
  validado_por_ingeniero_id?: string;
  fecha_validacion?: string;
  reintentos_sync?: number;
}

export interface ParametroCubicacion {
  id: string;
  categoria: string;
  clave: string;
  valor_numerico: number;
  unidad: string;
  descripcion: string;
  updated_at?: string;
}

export interface InfraTelemetryMetrics {
  supabase: {
    db_size_bytes: number;
    db_limit_bytes: number;
    db_usage_percent: number;
    storage_size_bytes: number;
    storage_limit_bytes: number;
    storage_usage_percent: number;
    buckets: {
      bucket_id: string;
      total_bytes: number;
      total_archivos: number;
    }[];
    egress_estimado_bytes: number;
    egress_limit_bytes: number;
    egress_usage_percent: number;
  };
  render_api: {
    service_name: string;
    container_limit_mb: number;
    process_ram_mb: number;
    render_ram_percent: number;
    alert_status: 'optimo' | 'advertencia' | 'critico';
    alert_message: string;
    uptime_seconds: number;
  };
  render_web: {
    service_name: string;
    container_limit_mb: number;
    process_ram_mb: number;
    render_ram_percent: number;
    alert_status: 'optimo' | 'advertencia' | 'critico';
  };
}
