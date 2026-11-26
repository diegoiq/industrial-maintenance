export type EstrategiaIntervencion =
  | 'PARCHEO'         // Solo área afectada * factor solape (1.25)
  | 'OVERCOAT'        // Imprimación en área afectada + 100% mano de terminación
  | 'INTEGRAL_100';   // Sinergia de acceso: repintado total 100% de la zona

export type GradoPreparacion = 'ST2_ST3' | 'SA_2_5' | 'UHP_HIDROLAVADO';

export type ClasificacionAlcance = 'CRITICO' | 'SINERGIA';

export type EstadoBOM = 'NO_APLICA' | 'PENDIENTE_REVISION' | 'COMPLETO';

export type ProvisionMaterial = 'PLANTA' | 'CONTRATISTA';

export type TipoAcceso =
  | 'ANDAMIO_FIJO'
  | 'TORRE_MOVIL'
  | 'PLATAFORMA_ELEVADORA'
  | 'ACCESO_DIRECTO';

export type RangoAlturaAndamio = '0_6M' | '6_12M' | 'MAS_12M';

export interface AccesoZonaItem {
  id: string;
  tipo: TipoAcceso;
  // Andamio Fijo Tubular
  largo_m?: number;
  ancho_m?: number;
  alto_m?: number;
  volumen_m3?: number;
  volumen_manual?: boolean;
  rango_altura?: RangoAlturaAndamio; // Calculado automáticamente desde alto_m
  complejidad?: 'NORMAL' | 'ALTA_INTERFERENCIA';
  // Torre Móvil
  cantidad_torres?: number;
  traslados_estimados?: number;
  // Plataforma Elevadora (PEM)
  subtipo_pem?: 'TIJERA' | 'BRAZO_ARTICULADO';
  altura_trabajo_m?: number;
  // Permanencia / Alquiler
  dias_uso?: number;
  observacion?: string;
}

export type CategoriaMaterial =
  | 'PERFIL'
  | 'CANO'
  | 'CHAPA_GRATING'
  | 'BARANDA_ESCALERA'
  | 'SOPORTERIA'
  | 'CIVIL_HORMIGON';

export type ComplejidadCaldereria = 'LIVIANO' | 'ESTRUCTURAL' | 'CANERIA';

export type AccionMetalico =
  | 'REEMPLAZO_TOTAL'
  | 'REFUERZO_EMPALME'
  | 'SOLDADURA_MENOR';

export interface CatalogoMaterialItem {
  id?: number;
  codigo: string;               // Ej: "UPN_120", "CANO_2_S40", "MORTERO_ESTRUCT"
  categoria: CategoriaMaterial;
  descripcion: string;          // Ej: "Perfil UPN 120"
  unidad: 'm' | 'm2' | 'u' | 'dm3';
  peso_unitario_kg: number;     // kg/m, kg/m2, kg/u (0 para insumos civiles en dm3)
  presentacion_comercial: string; // Ej: "Barra 6 m", "Hoja 1.22x2.44 m", "Bolsa 25 kg"
  factor_comercial: number;     // Ej: 6 (m por barra), 2.98 (m2 por hoja), 12.5 (dm3 por bolsa)
  complejidad_default: ComplejidadCaldereria;
  precio_ref_material?: number; // Opcional: costo referencial por unidad comercial o por kg
  activo: boolean;
  updated_at?: string;
}

export interface ItemMetalicoBOM {
  id: string;
  hallazgo_id?: string;
  categoria: Exclude<CategoriaMaterial, 'CIVIL_HORMIGON'>;
  codigo_catalogo: string;
  descripcion: string;
  unidad: 'm' | 'm2' | 'u';
  largo_m?: number;
  ancho_m?: number;
  cantidad: number;
  peso_unitario_kg: number;     // Peso teórico de catálogo
  peso_total_kg: number;        // Calculado automáticamente
  complejidad: ComplejidadCaldereria;
  accion: AccionMetalico;
  clasificacion: ClasificacionAlcance; // CRITICO vs SINERGIA
  provision: ProvisionMaterial;        // PLANTA vs CONTRATISTA
  nota?: string;
}

export interface ItemCivilComputo {
  id: string;
  hallazgo_id?: string;
  tipo: 'BACHEO_MORTERO_DM3' | 'SELLADO_JUNTA_ML' | 'FISURA_INYECCION_ML' | 'REVESTIMIENTO_M2';
  descripcion: string;
  unidad: 'dm3' | 'ml' | 'm2';
  cantidad: number;
  clasificacion: ClasificacionAlcance;
  nota?: string;
}

export interface TarifarioIntervencion {
  moneda: 'USD' | 'ARS';
  // 1. Pintura (USD o ARS por m2 según preparación y estrategia)
  pintura_st3_parcheo_m2: number;
  pintura_st3_integral_m2: number;
  pintura_sa25_integral_m2: number;
  pintura_uhp_integral_m2: number;
  pintura_overcoat_m2: number;
  factor_solape_parcheo: number;        // Default: 1.25
  // 2. Accesos (Schedule of Rates)
  andamio_armado_0_6m_m3: number;
  andamio_armado_6_12m_m3: number;
  andamio_armado_mas_12m_m3: number;
  andamio_alquiler_m3_dia: number;
  andamio_recargo_interferencia: number; // Default: 1.25 (+25%)
  torre_movil_armado_u: number;
  torre_movil_dia: number;
  pem_tijera_jornada: number;
  pem_brazo_jornada: number;
  // 3. Calderería y Metálico (Peso teórico de catálogo)
  acero_material_kg: number;             // Referencia si no hay precio por ítem
  caldereria_mo_liviano_kg: number;      // Barandas, soportes, escaleras
  caldereria_mo_estructural_kg: number;  // Vigas, columnas, ménsulas
  caldereria_mo_caneria_kg: number;      // Tramos de cañería
  caldereria_factor_refuerzo: number;    // Default: 0.70 sobre reemplazo total
  caldereria_factor_soldadura: number;   // Default: 0.35 sobre reemplazo total
  desperdicio_metalico_pct: number;      // Default: 10 (%)
  // 4. Civil / Hormigón
  civil_mortero_dm3: number;
  civil_junta_ml: number;
  civil_fisura_ml: number;
  civil_revestimiento_m2: number;
  // 5. Movilización y Contingencia
  movilizacion_suma_alzada: number;      // Obrador / seguridad / permisos
  bolsa_hh_contingencia_pct: number;     // Default: 5 (%) tope con autorización escrita
}
