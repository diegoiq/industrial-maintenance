import { sanitizeCsvCell } from './security';

export type MaterialCategoria =
  | 'perfil_metalico'
  | 'civil_hormigon'
  | 'pintura_recubrimiento'
  | 'andamio_acceso'
  | 'mano_obra';

export interface MaterialCatalogItem {
  id: string;
  codigo: string;
  categoria: MaterialCategoria;
  nombre: string;
  unidad: string; // 'kg', 'm', 'm2', 'm3', 'ml', 'HH', 'u'
  precio_usd: number;
  peso_kg_por_unidad: number; // ej: kg/m para perfiles, 2400 kg/m3 para hormigón, 0 si no aplica
  superficie_m2_por_unidad: number; // ej: m2/m de perímetro a pintar en perfiles
  hh_unitaria: number; // HH estimadas por unidad de medida
  notas?: string;
}

export const DEFAULT_MATERIALS_CATALOG: MaterialCatalogItem[] = [
  // 1. PERFILES METÁLICOS Y ESTRUCTURALES
  { id: 'mat-w8x31', codigo: 'W8X31', categoria: 'perfil_metalico', nombre: 'Perfil Ala Ancha W8x31 (ASTM A992)', unidad: 'm', precio_usd: 156.80, peso_kg_por_unidad: 46.1, superficie_m2_por_unidad: 1.18, hh_unitaria: 2.2, notas: 'Columnas y vigas secundarias' },
  { id: 'mat-w10x45', codigo: 'W10X45', categoria: 'perfil_metalico', nombre: 'Perfil Ala Ancha W10x45 (ASTM A992)', unidad: 'm', precio_usd: 227.80, peso_kg_por_unidad: 67.0, superficie_m2_por_unidad: 1.48, hh_unitaria: 2.8, notas: 'Pórticos de carga media' },
  { id: 'mat-w12x40', codigo: 'W12X40', categoria: 'perfil_metalico', nombre: 'Perfil Ala Ancha W12x40 (ASTM A992)', unidad: 'm', precio_usd: 202.30, peso_kg_por_unidad: 59.5, superficie_m2_por_unidad: 1.62, hh_unitaria: 2.6, notas: 'Columnas estándar de nave' },
  { id: 'mat-w12x50', codigo: 'W12X50', categoria: 'perfil_metalico', nombre: 'Perfil Ala Ancha W12x50 (ASTM A992)', unidad: 'm', precio_usd: 253.30, peso_kg_por_unidad: 74.5, superficie_m2_por_unidad: 1.68, hh_unitaria: 3.1, notas: 'Columnas pesadas / puente grúa' },
  { id: 'mat-w14x68', codigo: 'W14X68', categoria: 'perfil_metalico', nombre: 'Perfil Ala Ancha W14x68 (ASTM A992)', unidad: 'm', precio_usd: 344.10, peso_kg_por_unidad: 101.2, superficie_m2_por_unidad: 1.98, hh_unitaria: 3.8, notas: 'Columnas principales de carga' },
  { id: 'mat-ipe160', codigo: 'IPE160', categoria: 'perfil_metalico', nombre: 'Viga Europea IPE 160', unidad: 'm', precio_usd: 53.70, peso_kg_por_unidad: 15.8, superficie_m2_por_unidad: 0.62, hh_unitaria: 1.2, notas: 'Correas y pasarelas' },
  { id: 'mat-ipe200', codigo: 'IPE200', categoria: 'perfil_metalico', nombre: 'Viga Europea IPE 200', unidad: 'm', precio_usd: 76.15, peso_kg_por_unidad: 22.4, superficie_m2_por_unidad: 0.77, hh_unitaria: 1.5, notas: 'Vigas de piso y parral' },
  { id: 'mat-ipe240', codigo: 'IPE240', categoria: 'perfil_metalico', nombre: 'Viga Europea IPE 240', unidad: 'm', precio_usd: 104.38, peso_kg_por_unidad: 30.7, superficie_m2_por_unidad: 0.92, hh_unitaria: 1.9, notas: 'Vigas principales pasarelas' },
  { id: 'mat-ipe300', codigo: 'IPE300', categoria: 'perfil_metalico', nombre: 'Viga Europea IPE 300', unidad: 'm', precio_usd: 143.50, peso_kg_por_unidad: 42.2, superficie_m2_por_unidad: 1.16, hh_unitaria: 2.3, notas: 'Vigas puente y pipe-rack' },
  { id: 'mat-heb200', codigo: 'HEB200', categoria: 'perfil_metalico', nombre: 'Columna Pesada HEB 200', unidad: 'm', precio_usd: 208.40, peso_kg_por_unidad: 61.3, superficie_m2_por_unidad: 1.15, hh_unitaria: 2.7, notas: 'Columnas y pórticos rígidos' },
  { id: 'mat-upn120', codigo: 'UPN120', categoria: 'perfil_metalico', nombre: 'Canal UPN 120', unidad: 'm', precio_usd: 45.55, peso_kg_por_unidad: 13.4, superficie_m2_por_unidad: 0.44, hh_unitaria: 1.0, notas: 'Soportes de cañerías y silletas' },
  { id: 'mat-upn160', codigo: 'UPN160', categoria: 'perfil_metalico', nombre: 'Canal UPN 160', unidad: 'm', precio_usd: 63.90, peso_kg_por_unidad: 18.8, superficie_m2_por_unidad: 0.56, hh_unitaria: 1.3, notas: 'Soportes pipe-rack' },
  { id: 'mat-upn200', codigo: 'UPN200', categoria: 'perfil_metalico', nombre: 'Canal UPN 200', unidad: 'm', precio_usd: 86.00, peso_kg_por_unidad: 25.3, superficie_m2_por_unidad: 0.68, hh_unitaria: 1.6, notas: 'Bastidores de equipos' },
  { id: 'mat-ang2x2', codigo: 'ANG-2X2', categoria: 'perfil_metalico', nombre: 'Ángulo L 2" x 2" x 1/4" (Arriostre)', unidad: 'm', precio_usd: 16.15, peso_kg_por_unidad: 4.75, superficie_m2_por_unidad: 0.20, hh_unitaria: 0.6, notas: 'Cruces de San Andrés / arrostramientos' },
  { id: 'mat-ang3x3', codigo: 'ANG-3X3', categoria: 'perfil_metalico', nombre: 'Ángulo L 3" x 3" x 5/16"', unidad: 'm', precio_usd: 30.90, peso_kg_por_unidad: 9.10, superficie_m2_por_unidad: 0.30, hh_unitaria: 0.85, notas: 'Cartelas y ménsulas' },
  { id: 'mat-tubo15', codigo: 'TUBO-1.5', categoria: 'perfil_metalico', nombre: 'Caño / Tubo 1 1/2" Sch40 (Baranda)', unidad: 'm', precio_usd: 14.80, peso_kg_por_unidad: 4.05, superficie_m2_por_unidad: 0.15, hh_unitaria: 0.85, notas: 'Barandas de seguridad industriales' },
  { id: 'mat-tubo4', codigo: 'TUBO-4', categoria: 'perfil_metalico', nombre: 'Cañería Acero Carbono 4" Sch40', unidad: 'm', precio_usd: 58.20, peso_kg_por_unidad: 16.07, superficie_m2_por_unidad: 0.36, hh_unitaria: 1.4, notas: 'Líneas de proceso / agua / efluentes' },
  { id: 'mat-tubo6', codigo: 'TUBO-6', categoria: 'perfil_metalico', nombre: 'Cañería Acero Carbono 6" Sch40', unidad: 'm', precio_usd: 102.50, peso_kg_por_unidad: 28.26, superficie_m2_por_unidad: 0.53, hh_unitaria: 1.9, notas: 'Troncales de proceso / vapor' },
  { id: 'mat-chapa6', codigo: 'CHAPA-6MM', categoria: 'perfil_metalico', nombre: 'Chapa Acero A36 Espesor 6 mm (1/4")', unidad: 'm2', precio_usd: 165.00, peso_kg_por_unidad: 47.1, superficie_m2_por_unidad: 2.0, hh_unitaria: 2.5, notas: 'Cartelas, refuerzos y tanques' },
  { id: 'mat-grating', codigo: 'GRATING-30X3', categoria: 'perfil_metalico', nombre: 'Rejilla Grating Galvanizada 30x3 mm', unidad: 'm2', precio_usd: 138.00, peso_kg_por_unidad: 32.0, superficie_m2_por_unidad: 1.0, hh_unitaria: 1.4, notas: 'Pisos de pasarelas y plataformas' },

  // 2. MATERIALES CIVILES Y HORMIGÓN ARMADO
  { id: 'civ-h30', codigo: 'CIV-H30', categoria: 'civil_hormigon', nombre: 'Hormigón Elaborado H-30 (Resistencia Química)', unidad: 'm3', precio_usd: 185.00, peso_kg_por_unidad: 2400, superficie_m2_por_unidad: 0, hh_unitaria: 4.5, notas: 'Bases de bombas, columnas y losas' },
  { id: 'civ-mortero', codigo: 'CIV-MORTERO', categoria: 'civil_hormigon', nombre: 'Mortero Reparación Estructural Epoxi/Cementicio', unidad: 'm2', precio_usd: 68.50, peso_kg_por_unidad: 35, superficie_m2_por_unidad: 1.0, hh_unitaria: 2.2, notas: 'Reparación de spalling y descascaramiento (e=20mm)' },
  { id: 'civ-adn420', codigo: 'CIV-ACERO-ADN', categoria: 'civil_hormigon', nombre: 'Acero Armadura ADN-420 (Barras / Mallas)', unidad: 'kg', precio_usd: 2.15, peso_kg_por_unidad: 1.0, superficie_m2_por_unidad: 0, hh_unitaria: 0.08, notas: 'Reposición de armaduras corroídas' },
  { id: 'civ-pasivador', codigo: 'CIV-PASIVADOR', categoria: 'civil_hormigon', nombre: 'Pasivador de Armaduras + Puente Adherencia Epoxi', unidad: 'm2', precio_usd: 24.80, peso_kg_por_unidad: 1.5, superficie_m2_por_unidad: 1.0, hh_unitaria: 0.75, notas: 'Tratamiento anticorrosivo de hierros expuestos' },
  { id: 'civ-junta', codigo: 'CIV-JUNTA-PU', categoria: 'civil_hormigon', nombre: 'Sellador Elastomérico de Juntas (Poliuretano/Epoxi)', unidad: 'ml', precio_usd: 22.40, peso_kg_por_unidad: 0.8, superficie_m2_por_unidad: 0, hh_unitaria: 0.65, notas: 'Juntas de dilatación en losas y tabiques' },
  { id: 'civ-grout', codigo: 'CIV-GROUT-BOMBA', categoria: 'civil_hormigon', nombre: 'Grout Epoxi Alta Resistencia (Base de Bomba)', unidad: 'u', precio_usd: 340.00, peso_kg_por_unidad: 75, superficie_m2_por_unidad: 1.5, hh_unitaria: 6.0, notas: 'Nivelación y anclaje de pedestal/bomba' },
  { id: 'civ-tabique', codigo: 'CIV-TABIQUE', categoria: 'civil_hormigon', nombre: 'Reparación Tabique / Mampostería + Revoque Impermeable', unidad: 'm2', precio_usd: 54.00, peso_kg_por_unidad: 0, superficie_m2_por_unidad: 1.0, hh_unitaria: 1.8, notas: 'Muros de contención y piletas' },
  { id: 'civ-pisoepoxi', codigo: 'CIV-PISO-EPOXI', categoria: 'civil_hormigon', nombre: 'Revestimiento Piso Industrial Epoxi Antiácido (e=3mm)', unidad: 'm2', precio_usd: 72.00, peso_kg_por_unidad: 0, superficie_m2_por_unidad: 1.0, hh_unitaria: 1.1, notas: 'Protección química de losas y trincheras' },

  // 3. PINTURAS, ANDAMIOS Y MANO DE OBRA
  { id: 'pint-c5m', codigo: 'PINT-C5M', categoria: 'pintura_recubrimiento', nombre: 'Esquema Tricapa C5-M (Sa 2½ + Zinc + Epoxi + PU)', unidad: 'm2', precio_usd: 24.50, peso_kg_por_unidad: 0, superficie_m2_por_unidad: 1.0, hh_unitaria: 0.55, notas: 'Ambiente agresivo químico/húmedo' },
  { id: 'pint-mastic', codigo: 'PINT-MASTIC', categoria: 'pintura_recubrimiento', nombre: 'Esquema Mantenimiento St3 + Epoxi Mastic + PU', unidad: 'm2', precio_usd: 18.20, peso_kg_por_unidad: 0, superficie_m2_por_unidad: 1.0, hh_unitaria: 0.45, notas: 'Mantenimiento en marcha' },
  { id: 'and-tubular', codigo: 'AND-TUBULAR', categoria: 'andamio_acceso', nombre: 'Andamio Tubular Multidireccional Certificado', unidad: 'm3', precio_usd: 12.00, peso_kg_por_unidad: 0, superficie_m2_por_unidad: 0, hh_unitaria: 0.05, notas: 'Alquiler mensual + armado/desarmado' },
  { id: 'mo-oficial', codigo: 'MO-OFICIAL', categoria: 'mano_obra', nombre: 'Hora Hombre Cuadrilla Oficial Montador / Civil', unidad: 'HH', precio_usd: 28.50, peso_kg_por_unidad: 0, superficie_m2_por_unidad: 0, hh_unitaria: 1.0, notas: 'Tarifa horaria promedio contratista' }
];

const STORAGE_KEY = 'im_materials_catalog_v1';

export function loadMaterialsCatalog(): MaterialCatalogItem[] {
  if (typeof window === 'undefined') return DEFAULT_MATERIALS_CATALOG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_MATERIALS_CATALOG));
      return DEFAULT_MATERIALS_CATALOG;
    }
    const parsed = JSON.parse(raw) as MaterialCatalogItem[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_MATERIALS_CATALOG;
  } catch {
    return DEFAULT_MATERIALS_CATALOG;
  }
}

export function saveMaterialsCatalog(items: MaterialCatalogItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

/**
 * Genera y descarga la Plantilla Oficial CSV compatible con Microsoft Excel (separador ;)
 * con todos los materiales actuales y sus precios en USD.
 */
export function downloadMaterialsExcelTemplate(items: MaterialCatalogItem[]): void {
  const headers = [
    'CODIGO',
    'CATEGORIA',
    'NOMBRE_DESCRIPCION',
    'UNIDAD',
    'PRECIO_USD',
    'PESO_KG_UNIT',
    'SUPERFICIE_M2_UNIT',
    'HH_UNITARIA',
    'NOTAS'
  ];

  const rows = items.map(item =>
    [
      sanitizeCsvCell(item.codigo, false),
      sanitizeCsvCell(item.categoria, false),
      sanitizeCsvCell(item.nombre, true),
      sanitizeCsvCell(item.unidad, false),
      item.precio_usd,
      item.peso_kg_por_unidad,
      item.superficie_m2_por_unidad,
      item.hh_unitaria,
      sanitizeCsvCell(item.notas || '', true)
    ].join(';')
  );

  // BOM UTF-8 para que Microsoft Excel abra tildes y ñ correctamente
  const bom = '\uFEFF';
  const csvContent = bom + [headers.join(';'), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `LISTA_PRECIOS_MATERIALES_USD_${new Date().toISOString().substring(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parsea texto proveniente de un archivo CSV o de copiar y pegar directo desde Excel (Ctrl+C -> Ctrl+V).
 * Soporta separadores: tabulador (\t), punto y coma (;) o coma (,).
 */
export function parseAndMergeMaterialsFromText(
  rawText: string,
  currentCatalog: MaterialCatalogItem[]
): { updatedCatalog: MaterialCatalogItem[]; updatedCount: number; addedCount: number; errors: string[] } {
  const lines = rawText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { updatedCatalog: currentCatalog, updatedCount: 0, addedCount: 0, errors: ['El archivo o texto está vacío.'] };
  }

  // Detectar separador automáticamente (Tabulador de Excel, ; o ,)
  const sample = lines[0];
  const delimiter = sample.includes('\t') ? '\t' : sample.includes(';') ? ';' : ',';

  const resultMap = new Map<string, MaterialCatalogItem>();
  for (const item of currentCatalog) {
    resultMap.set(item.codigo.toUpperCase(), { ...item });
  }

  let updatedCount = 0;
  let addedCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.replace(/^"|"$/g, '').trim());
    if (cols.length < 2) continue;

    const firstUpper = cols[0].toUpperCase();
    // Saltar fila de encabezado
    if (firstUpper === 'CODIGO' || firstUpper === 'CODE' || firstUpper === 'ITEM') {
      continue;
    }

    // Formato flexible:
    // A) Plantilla completa (9 cols): CODIGO; CATEGORIA; NOMBRE; UNIDAD; PRECIO_USD; PESO; SUP; HH; NOTAS
    // B) Lista rápida de 3 o 4 cols desde Excel: CODIGO | NOMBRE | UNIDAD | PRECIO_USD (o CODIGO | PRECIO_USD)
    const codigo = firstUpper;
    if (!codigo) continue;

    const parseNum = (val?: string): number => {
      if (!val) return NaN;
      // Soporta "$ 156,80" o "156.80"
      const cleaned = val.replace(/[$\s]/g, '').replace(',', '.');
      return parseFloat(cleaned);
    };

    const existing = resultMap.get(codigo);

    if (cols.length === 2) {
      // Formato ultra rápido: CODIGO | PRECIO_USD
      const price = parseNum(cols[1]);
      if (!isNaN(price) && existing) {
        existing.precio_usd = price;
        resultMap.set(codigo, existing);
        updatedCount++;
      } else {
        errors.push(`Fila ${i + 1}: código "${codigo}" no encontrado o precio inválido.`);
      }
      continue;
    }

    if (cols.length >= 5) {
      const rawCat = cols[1].toLowerCase();
      const categoria: MaterialCategoria =
        rawCat.includes('civil') || rawCat.includes('hormig')
          ? 'civil_hormigon'
          : rawCat.includes('pint')
          ? 'pintura_recubrimiento'
          : rawCat.includes('andam')
          ? 'andamio_acceso'
          : rawCat.includes('mano') || rawCat.includes('hh')
          ? 'mano_obra'
          : 'perfil_metalico';

      const nombre = cols[2] || existing?.nombre || codigo;
      const unidad = cols[3] || existing?.unidad || 'u';
      const precio = parseNum(cols[4]);
      if (isNaN(precio)) {
        errors.push(`Fila ${i + 1} (${codigo}): precio USD inválido.`);
        continue;
      }

      const peso = !isNaN(parseNum(cols[5])) ? parseNum(cols[5]) : (existing?.peso_kg_por_unidad || 0);
      const sup = !isNaN(parseNum(cols[6])) ? parseNum(cols[6]) : (existing?.superficie_m2_por_unidad || 0);
      const hh = !isNaN(parseNum(cols[7])) ? parseNum(cols[7]) : (existing?.hh_unitaria || 1);
      const notas = cols[8] || existing?.notas || '';

      if (existing) {
        resultMap.set(codigo, {
          ...existing,
          categoria,
          nombre,
          unidad,
          precio_usd: precio,
          peso_kg_por_unidad: peso,
          superficie_m2_por_unidad: sup,
          hh_unitaria: hh,
          notas
        });
        updatedCount++;
      } else {
        resultMap.set(codigo, {
          id: `mat-custom-${Date.now()}-${i}`,
          codigo,
          categoria,
          nombre,
          unidad,
          precio_usd: precio,
          peso_kg_por_unidad: peso,
          superficie_m2_por_unidad: sup,
          hh_unitaria: hh,
          notas
        });
        addedCount++;
      }
    }
  }

  return {
    updatedCatalog: Array.from(resultMap.values()),
    updatedCount,
    addedCount,
    errors
  };
}
