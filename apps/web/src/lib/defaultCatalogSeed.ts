import { CatalogoMaterialItem } from '../types/computo';

export const DEFAULT_CATALOG_SEED: CatalogoMaterialItem[] = [
  // PERFILES
  {
    codigo: 'UPN_80',
    categoria: 'PERFIL',
    descripcion: 'Perfil UPN 80',
    unidad: 'm',
    peso_unitario_kg: 8.64,
    presentacion_comercial: 'Barra 6 m',
    factor_comercial: 6,
    complejidad_default: 'ESTRUCTURAL',
    precio_ref_material: 2.2,
    activo: true
  },
  {
    codigo: 'UPN_100',
    categoria: 'PERFIL',
    descripcion: 'Perfil UPN 100',
    unidad: 'm',
    peso_unitario_kg: 10.60,
    presentacion_comercial: 'Barra 6 m',
    factor_comercial: 6,
    complejidad_default: 'ESTRUCTURAL',
    precio_ref_material: 2.2,
    activo: true
  },
  {
    codigo: 'UPN_120',
    categoria: 'PERFIL',
    descripcion: 'Perfil UPN 120',
    unidad: 'm',
    peso_unitario_kg: 13.40,
    presentacion_comercial: 'Barra 6 m',
    factor_comercial: 6,
    complejidad_default: 'ESTRUCTURAL',
    precio_ref_material: 2.2,
    activo: true
  },
  {
    codigo: 'UPN_140',
    categoria: 'PERFIL',
    descripcion: 'Perfil UPN 140',
    unidad: 'm',
    peso_unitario_kg: 16.00,
    presentacion_comercial: 'Barra 6 m',
    factor_comercial: 6,
    complejidad_default: 'ESTRUCTURAL',
    precio_ref_material: 2.2,
    activo: true
  },
  {
    codigo: 'UPN_160',
    categoria: 'PERFIL',
    descripcion: 'Perfil UPN 160',
    unidad: 'm',
    peso_unitario_kg: 18.80,
    presentacion_comercial: 'Barra 6 m',
    factor_comercial: 6,
    complejidad_default: 'ESTRUCTURAL',
    precio_ref_material: 2.2,
    activo: true
  },
  {
    codigo: 'IPN_120',
    categoria: 'PERFIL',
    descripcion: 'Perfil IPN 120',
    unidad: 'm',
    peso_unitario_kg: 11.10,
    presentacion_comercial: 'Barra 6 m',
    factor_comercial: 6,
    complejidad_default: 'ESTRUCTURAL',
    precio_ref_material: 2.3,
    activo: true
  },
  {
    codigo: 'IPN_160',
    categoria: 'PERFIL',
    descripcion: 'Perfil IPN 160',
    unidad: 'm',
    peso_unitario_kg: 17.90,
    presentacion_comercial: 'Barra 6 m',
    factor_comercial: 6,
    complejidad_default: 'ESTRUCTURAL',
    precio_ref_material: 2.3,
    activo: true
  },
  {
    codigo: 'IPN_200',
    categoria: 'PERFIL',
    descripcion: 'Perfil IPN 200',
    unidad: 'm',
    peso_unitario_kg: 26.20,
    presentacion_comercial: 'Barra 6 m',
    factor_comercial: 6,
    complejidad_default: 'ESTRUCTURAL',
    precio_ref_material: 2.3,
    activo: true
  },
  {
    codigo: 'ANG_2_316',
    categoria: 'PERFIL',
    descripcion: 'Ángulo L 2" × 3/16"',
    unidad: 'm',
    peso_unitario_kg: 3.63,
    presentacion_comercial: 'Barra 6 m',
    factor_comercial: 6,
    complejidad_default: 'LIVIANO',
    precio_ref_material: 2.1,
    activo: true
  },
  {
    codigo: 'ANG_2_14',
    categoria: 'PERFIL',
    descripcion: 'Ángulo L 2" × 1/4"',
    unidad: 'm',
    peso_unitario_kg: 4.75,
    presentacion_comercial: 'Barra 6 m',
    factor_comercial: 6,
    complejidad_default: 'LIVIANO',
    precio_ref_material: 2.1,
    activo: true
  },
  {
    codigo: 'ANG_3_14',
    categoria: 'PERFIL',
    descripcion: 'Ángulo L 3" × 1/4"',
    unidad: 'm',
    peso_unitario_kg: 7.30,
    presentacion_comercial: 'Barra 6 m',
    factor_comercial: 6,
    complejidad_default: 'ESTRUCTURAL',
    precio_ref_material: 2.1,
    activo: true
  },

  // CAÑOS
  {
    codigo: 'CANO_15_S40',
    categoria: 'CANO',
    descripcion: 'Caño ASTM A53 1½" Sch40',
    unidad: 'm',
    peso_unitario_kg: 4.05,
    presentacion_comercial: 'Tira 6 m',
    factor_comercial: 6,
    complejidad_default: 'CANERIA',
    precio_ref_material: 2.8,
    activo: true
  },
  {
    codigo: 'CANO_2_S40',
    categoria: 'CANO',
    descripcion: 'Caño ASTM A53 2" Sch40',
    unidad: 'm',
    peso_unitario_kg: 5.44,
    presentacion_comercial: 'Tira 6 m',
    factor_comercial: 6,
    complejidad_default: 'CANERIA',
    precio_ref_material: 2.8,
    activo: true
  },
  {
    codigo: 'CANO_3_S40',
    categoria: 'CANO',
    descripcion: 'Caño ASTM A53 3" Sch40',
    unidad: 'm',
    peso_unitario_kg: 11.29,
    presentacion_comercial: 'Tira 6 m',
    factor_comercial: 6,
    complejidad_default: 'CANERIA',
    precio_ref_material: 2.8,
    activo: true
  },
  {
    codigo: 'CANO_4_S40',
    categoria: 'CANO',
    descripcion: 'Caño ASTM A53 4" Sch40',
    unidad: 'm',
    peso_unitario_kg: 16.07,
    presentacion_comercial: 'Tira 6 m',
    factor_comercial: 6,
    complejidad_default: 'CANERIA',
    precio_ref_material: 2.8,
    activo: true
  },
  {
    codigo: 'CANO_6_S40',
    categoria: 'CANO',
    descripcion: 'Caño ASTM A53 6" Sch40',
    unidad: 'm',
    peso_unitario_kg: 28.26,
    presentacion_comercial: 'Tira 6 m',
    factor_comercial: 6,
    complejidad_default: 'CANERIA',
    precio_ref_material: 2.8,
    activo: true
  },

  // CHAPAS Y GRATINGS
  {
    codigo: 'CHAPA_18',
    categoria: 'CHAPA_GRATING',
    descripcion: 'Chapa Acero 1/8" (3.2mm)',
    unidad: 'm2',
    peso_unitario_kg: 25.10,
    presentacion_comercial: 'Hoja 1.22×2.44 m',
    factor_comercial: 2.98,
    complejidad_default: 'LIVIANO',
    precio_ref_material: 2.4,
    activo: true
  },
  {
    codigo: 'CHAPA_316',
    categoria: 'CHAPA_GRATING',
    descripcion: 'Chapa Acero 3/16" (4.76mm)',
    unidad: 'm2',
    peso_unitario_kg: 37.40,
    presentacion_comercial: 'Hoja 1.22×2.44 m',
    factor_comercial: 2.98,
    complejidad_default: 'ESTRUCTURAL',
    precio_ref_material: 2.4,
    activo: true
  },
  {
    codigo: 'CHAPA_14',
    categoria: 'CHAPA_GRATING',
    descripcion: 'Chapa Acero 1/4" (6.35mm)',
    unidad: 'm2',
    peso_unitario_kg: 49.80,
    presentacion_comercial: 'Hoja 1.22×2.44 m',
    factor_comercial: 2.98,
    complejidad_default: 'ESTRUCTURAL',
    precio_ref_material: 2.4,
    activo: true
  },
  {
    codigo: 'GRAT_30_3',
    categoria: 'CHAPA_GRATING',
    descripcion: 'Grating Electroforjado 30×3',
    unidad: 'm2',
    peso_unitario_kg: 31.50,
    presentacion_comercial: 'Panel 1×6 m',
    factor_comercial: 6,
    complejidad_default: 'LIVIANO',
    precio_ref_material: 3.5,
    activo: true
  },

  // BARANDAS, ESCALERAS Y SOPORTERÍA
  {
    codigo: 'BARANDA_STD',
    categoria: 'BARANDA_ESCALERA',
    descripcion: 'Baranda Industrial Completa',
    unidad: 'm',
    peso_unitario_kg: 14.50,
    presentacion_comercial: 'Metro lineal',
    factor_comercial: 1,
    complejidad_default: 'LIVIANO',
    precio_ref_material: 2.6,
    activo: true
  },
  {
    codigo: 'ESCALON_GRAT',
    categoria: 'BARANDA_ESCALERA',
    descripcion: 'Escalón Grating Estándar',
    unidad: 'u',
    peso_unitario_kg: 6.50,
    presentacion_comercial: 'Unidad',
    factor_comercial: 1,
    complejidad_default: 'LIVIANO',
    precio_ref_material: 3.8,
    activo: true
  },
  {
    codigo: 'SOPORTE_STD',
    categoria: 'SOPORTERIA',
    descripcion: 'Soporte / Ménsula Estándar',
    unidad: 'u',
    peso_unitario_kg: 8.00,
    presentacion_comercial: 'Unidad',
    factor_comercial: 1,
    complejidad_default: 'LIVIANO',
    precio_ref_material: 2.5,
    activo: true
  },

  // INSUMOS CIVILES / HORMIGÓN
  {
    codigo: 'MORTERO_ESTRUCT',
    categoria: 'CIVIL_HORMIGON',
    descripcion: 'Mortero Estructural Cementicio / Epoxi',
    unidad: 'dm3',
    peso_unitario_kg: 0,
    presentacion_comercial: 'Bolsa 25 kg (12.5 dm³)',
    factor_comercial: 12.5,
    complejidad_default: 'LIVIANO',
    precio_ref_material: 38,
    activo: true
  }
];
