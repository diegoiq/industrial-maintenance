import {
  AccesoZonaItem,
  CatalogoMaterialItem,
  ClasificacionAlcance,
  ComplejidadCaldereria,
  EstrategiaIntervencion,
  GradoPreparacion,
  ItemMetalicoBOM,
  RangoAlturaAndamio,
  TarifarioIntervencion
} from '../types/computo';
import { Inspeccion, ZonaInspeccion } from '../types';

export const DEFAULT_TARIFARIO: TarifarioIntervencion = {
  moneda: 'USD',
  // 1. Pintura
  pintura_st3_parcheo_m2: 18.5,
  pintura_st3_integral_m2: 16.0,
  pintura_sa25_integral_m2: 26.5,
  pintura_uhp_integral_m2: 31.0,
  pintura_overcoat_m2: 19.5,
  factor_solape_parcheo: 1.25,
  // 2. Accesos (Schedule of Rates)
  andamio_armado_0_6m_m3: 8.5,
  andamio_armado_6_12m_m3: 11.5,
  andamio_armado_mas_12m_m3: 15.0,
  andamio_alquiler_m3_dia: 0.45,
  andamio_recargo_interferencia: 1.25,
  torre_movil_armado_u: 120.0,
  torre_movil_dia: 35.0,
  pem_tijera_jornada: 210.0,
  pem_brazo_jornada: 340.0,
  // 3. Calderería y Metálico
  acero_material_kg: 2.35,
  caldereria_mo_liviano_kg: 6.5,
  caldereria_mo_estructural_kg: 8.8,
  caldereria_mo_caneria_kg: 12.5,
  caldereria_factor_refuerzo: 0.7,
  caldereria_factor_soldadura: 0.35,
  desperdicio_metalico_pct: 10,
  // 4. Civil / Hormigón
  civil_mortero_dm3: 6.8,
  civil_junta_ml: 24.0,
  civil_fisura_ml: 32.0,
  civil_revestimiento_m2: 68.0,
  // 5. Movilización y Contingencia
  movilizacion_suma_alzada: 2800.0,
  bolsa_hh_contingencia_pct: 5
};

export function parseRiNumber(gradoCorrosion?: string): number {
  if (!gradoCorrosion) return 3;
  const match = gradoCorrosion.match(/\d+/);
  return match ? Number(match[0]) : 3;
}

export function calcularRangoAltura(altoM?: number): RangoAlturaAndamio {
  const h = Number(altoM) || 0;
  if (h <= 6) return '0_6M';
  if (h <= 12) return '6_12M';
  return 'MAS_12M';
}

export function sugerirEstrategiaYClasificacion(params: {
  porcentajeAfectado: number;
  gradoCorrosion: string;
  requiereAccesoMayor: boolean; // andamio fijo, torre o PEM
  requiereReemplazo: boolean;
}): {
  estrategia: EstrategiaIntervencion;
  clasificacion: ClasificacionAlcance;
  sinergiaAcceso: boolean;
} {
  const ri = parseRiNumber(params.gradoCorrosion);
  const pct = Number(params.porcentajeAfectado) || 0;

  let estrategia: EstrategiaIntervencion = 'PARCHEO';
  let sinergiaAcceso = false;

  if (pct > 30 || ri >= 4 || (params.requiereAccesoMayor && pct >= 15)) {
    estrategia = 'INTEGRAL_100';
    sinergiaAcceso = params.requiereAccesoMayor;
  } else if (pct >= 16 && pct <= 30 && ri <= 3) {
    estrategia = 'OVERCOAT';
  } else {
    estrategia = 'PARCHEO';
  }

  const clasificacion: ClasificacionAlcance =
    ri >= 4 || params.requiereReemplazo ? 'CRITICO' : ri <= 2 ? 'SINERGIA' : 'CRITICO';

  return { estrategia, clasificacion, sinergiaAcceso };
}

export function calcularSuperficiePintura(
  areaZonaM2: number,
  porcentajeAfectado: number,
  estrategia: EstrategiaIntervencion,
  factorSolape = 1.25
): {
  imprimacionM2: number;
  terminacionM2: number;
  computoObraM2: number;
} {
  const area = Math.max(0, Number(areaZonaM2) || 0);
  const pct = Math.max(0, Math.min(100, Number(porcentajeAfectado) || 0));
  const areaParcheo = Math.min(area, Math.round(area * (pct / 100) * factorSolape * 100) / 100);

  if (estrategia === 'PARCHEO') {
    return {
      imprimacionM2: areaParcheo,
      terminacionM2: areaParcheo,
      computoObraM2: areaParcheo
    };
  }
  if (estrategia === 'OVERCOAT') {
    return {
      imprimacionM2: areaParcheo,
      terminacionM2: area,
      computoObraM2: area
    };
  }
  return {
    imprimacionM2: area,
    terminacionM2: area,
    computoObraM2: area
  };
}

export function getEffectiveAccesos(inspeccion: Inspeccion): AccesoZonaItem[] {
  if (Array.isArray(inspeccion.accesos) && inspeccion.accesos.length > 0) {
    return inspeccion.accesos;
  }
  if (inspeccion.requiere_andamio) {
    const alto = Number(inspeccion.altura_andamio_m) || 4;
    const vol = Number(inspeccion.volumen_andamio_m3) || 24;
    if (inspeccion.tipo_acceso_sugerido === 'manlift') {
      return [
        {
          id: 'legacy-pem',
          tipo: 'PLATAFORMA_ELEVADORA',
          subtipo_pem: 'BRAZO_ARTICULADO',
          altura_trabajo_m: Math.max(10, alto),
          dias_uso: 3
        }
      ];
    }
    if (inspeccion.tipo_acceso_sugerido === 'escalera' || inspeccion.tipo_acceso_sugerido === 'suelo') {
      return [{ id: 'legacy-dir', tipo: 'ACCESO_DIRECTO' }];
    }
    return [
      {
        id: 'legacy-andamio',
        tipo: 'ANDAMIO_FIJO',
        alto_m: alto,
        volumen_m3: vol,
        rango_altura: calcularRangoAltura(alto),
        complejidad: 'NORMAL',
        dias_uso: 5
      }
    ];
  }
  return [{ id: 'default-directo', tipo: 'ACCESO_DIRECTO' }];
}

export function getTarifaPinturaUnitaria(
  grado: GradoPreparacion,
  estrategia: EstrategiaIntervencion,
  tarifario: TarifarioIntervencion
): number {
  if (estrategia === 'OVERCOAT') return tarifario.pintura_overcoat_m2;
  if (grado === 'SA_2_5') return tarifario.pintura_sa25_integral_m2;
  if (grado === 'UHP_HIDROLAVADO') return tarifario.pintura_uhp_integral_m2;
  return estrategia === 'PARCHEO'
    ? tarifario.pintura_st3_parcheo_m2
    : tarifario.pintura_st3_integral_m2;
}

export interface ResultadoPaqueteZona {
  inspeccionId: string;
  zonaCodigo: string;
  clasificacionZona: ClasificacionAlcance;
  estrategia: EstrategiaIntervencion;
  gradoPreparacion: GradoPreparacion;
  superficieComputadaM2: number;
  pesoTotalMetalicoKg: number;
  pesoPlantaKg: number;
  pesoContratistaKg: number;
  costos: {
    civil: number;
    caldereriaMO: number;
    materialMetalicoPlanta: number;
    materialMetalicoContratista: number;
    pintura: number;
    accesos: number;
    totalContratista: number;
    totalGeneral: number;
    totalCritico: number;
    totalSinergia: number;
  };
}

export function calcularPaqueteZona(
  inspeccion: Inspeccion,
  areaZonaM2: number,
  tarifario: TarifarioIntervencion = DEFAULT_TARIFARIO
): ResultadoPaqueteZona {
  const estrategia: EstrategiaIntervencion = inspeccion.estrategia_intervencion || 'INTEGRAL_100';
  const gradoPreparacion: GradoPreparacion = inspeccion.grado_preparacion || 'ST2_ST3';
  const clasificacionZona: ClasificacionAlcance = inspeccion.clasificacion_alcance || 'CRITICO';

  const supCalc = calcularSuperficiePintura(
    areaZonaM2,
    inspeccion.porcentaje_afectado || 0,
    estrategia,
    tarifario.factor_solape_parcheo
  );
  const superficieComputadaM2 =
    inspeccion.superficie_computada_m2 && inspeccion.superficie_computada_m2 > 0
      ? inspeccion.superficie_computada_m2
      : supCalc.computoObraM2;

  // 1. Civil / Hormigón
  let costoCivil = 0;
  let civilCritico = 0;
  let civilSinergia = 0;
  const itemsCivil = Array.isArray(inspeccion.items_civil) ? inspeccion.items_civil : [];
  for (const ic of itemsCivil) {
    let pu = tarifario.civil_mortero_dm3;
    if (ic.tipo === 'SELLADO_JUNTA_ML') pu = tarifario.civil_junta_ml;
    else if (ic.tipo === 'FISURA_INYECCION_ML') pu = tarifario.civil_fisura_ml;
    else if (ic.tipo === 'REVESTIMIENTO_M2') pu = tarifario.civil_revestimiento_m2;
    const sub = (Number(ic.cantidad) || 0) * pu;
    costoCivil += sub;
    if (ic.clasificacion === 'SINERGIA') civilSinergia += sub;
    else civilCritico += sub;
  }

  // 2. Calderería MO + Materiales Metálicos (Peso Teórico de Catálogo)
  let costoCaldereriaMO = 0;
  let caldereriaCritico = 0;
  let caldereriaSinergia = 0;
  let costoMaterialPlanta = 0;
  let costoMaterialContratista = 0;
  let matCritico = 0;
  let matSinergia = 0;
  let pesoTotalMetalicoKg = 0;
  let pesoPlantaKg = 0;
  let pesoContratistaKg = 0;

  const itemsMetalicos = Array.isArray(inspeccion.items_metalicos) ? inspeccion.items_metalicos : [];
  for (const im of itemsMetalicos) {
    const peso = Number(im.peso_total_kg) || 0;
    pesoTotalMetalicoKg += peso;

    const tarifaMO =
      im.complejidad === 'CANERIA'
        ? tarifario.caldereria_mo_caneria_kg
        : im.complejidad === 'ESTRUCTURAL'
        ? tarifario.caldereria_mo_estructural_kg
        : tarifario.caldereria_mo_liviano_kg;

    const factorAccion =
      im.accion === 'REFUERZO_EMPALME'
        ? tarifario.caldereria_factor_refuerzo
        : im.accion === 'SOLDADURA_MENOR'
        ? tarifario.caldereria_factor_soldadura
        : 1.0;

    const subMO = peso * tarifaMO * factorAccion;
    costoCaldereriaMO += subMO;

    const subMat =
      im.accion === 'SOLDADURA_MENOR'
        ? 0
        : peso * (1 + (tarifario.desperdicio_metalico_pct || 0) / 100) * tarifario.acero_material_kg;

    if (im.provision === 'PLANTA') {
      pesoPlantaKg += peso;
      costoMaterialPlanta += subMat;
    } else {
      pesoContratistaKg += peso;
      costoMaterialContratista += subMat;
    }

    if (im.clasificacion === 'SINERGIA') {
      caldereriaSinergia += subMO;
      matSinergia += subMat;
    } else {
      caldereriaCritico += subMO;
      matCritico += subMat;
    }
  }

  // 3. Pintura
  const puPintura = getTarifaPinturaUnitaria(gradoPreparacion, estrategia, tarifario);
  const costoPintura = Math.round(superficieComputadaM2 * puPintura * 100) / 100;

  // 4. Accesos
  let costoAccesos = 0;
  const accesos = getEffectiveAccesos(inspeccion);
  for (const acc of accesos) {
    if (acc.tipo === 'ANDAMIO_FIJO') {
      const vol = Number(acc.volumen_m3) || 0;
      const dias = Number(acc.dias_uso) || 5;
      const rango = acc.rango_altura || calcularRangoAltura(acc.alto_m);
      const puArmado =
        rango === 'MAS_12M'
          ? tarifario.andamio_armado_mas_12m_m3
          : rango === '6_12M'
          ? tarifario.andamio_armado_6_12m_m3
          : tarifario.andamio_armado_0_6m_m3;
      const multInt = acc.complejidad === 'ALTA_INTERFERENCIA' ? tarifario.andamio_recargo_interferencia : 1;
      costoAccesos += (vol * puArmado + vol * dias * tarifario.andamio_alquiler_m3_dia) * multInt;
    } else if (acc.tipo === 'TORRE_MOVIL') {
      const cant = Number(acc.cantidad_torres) || 1;
      const dias = Number(acc.dias_uso) || 3;
      costoAccesos += cant * tarifario.torre_movil_armado_u + cant * dias * tarifario.torre_movil_dia;
    } else if (acc.tipo === 'PLATAFORMA_ELEVADORA') {
      const dias = Number(acc.dias_uso) || 2;
      const puPem =
        acc.subtipo_pem === 'TIJERA' ? tarifario.pem_tijera_jornada : tarifario.pem_brazo_jornada;
      costoAccesos += dias * puPem;
    }
  }

  const totalContratista =
    costoCivil + costoCaldereriaMO + costoMaterialContratista + costoPintura + costoAccesos;
  const totalGeneral = totalContratista + costoMaterialPlanta;

  const pinturaYAccesoCritico = clasificacionZona === 'CRITICO' ? costoPintura + costoAccesos : 0;
  const pinturaYAccesoSinergia = clasificacionZona === 'SINERGIA' ? costoPintura + costoAccesos : 0;

  const totalCritico = civilCritico + caldereriaCritico + matCritico + pinturaYAccesoCritico;
  const totalSinergia = civilSinergia + caldereriaSinergia + matSinergia + pinturaYAccesoSinergia;

  return {
    inspeccionId: inspeccion.id,
    zonaCodigo: inspeccion.zona_codigo || inspeccion.elemento_id,
    clasificacionZona,
    estrategia,
    gradoPreparacion,
    superficieComputadaM2: Math.round(superficieComputadaM2 * 100) / 100,
    pesoTotalMetalicoKg: Math.round(pesoTotalMetalicoKg * 100) / 100,
    pesoPlantaKg: Math.round(pesoPlantaKg * 100) / 100,
    pesoContratistaKg: Math.round(pesoContratistaKg * 100) / 100,
    costos: {
      civil: round2(costoCivil),
      caldereriaMO: round2(costoCaldereriaMO),
      materialMetalicoPlanta: round2(costoMaterialPlanta),
      materialMetalicoContratista: round2(costoMaterialContratista),
      pintura: round2(costoPintura),
      accesos: round2(costoAccesos),
      totalContratista: round2(totalContratista),
      totalGeneral: round2(totalGeneral),
      totalCritico: round2(totalCritico),
      totalSinergia: round2(totalSinergia)
    }
  };
}

export interface BoQItemRow {
  codigo: string;
  disciplina: '1_CIVIL' | '2_CALDERERIA_MO' | '3_MATERIAL_CONTRATISTA' | '4_PINTURA' | '5_ACCESOS' | '6_GENERAL';
  disciplinaLabel: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export function generarBoQContratista(
  inspecciones: Inspeccion[],
  zonasById: Record<string, ZonaInspeccion>,
  tarifario: TarifarioIntervencion = DEFAULT_TARIFARIO
): {
  items: BoQItemRow[];
  subtotalDirecto: number;
  movilizacion: number;
  contingenciaHH: number;
  totalContrato: number;
} {
  const map = new Map<string, BoQItemRow>();

  const addQty = (
    codigo: string,
    disciplina: BoQItemRow['disciplina'],
    disciplinaLabel: string,
    descripcion: string,
    unidad: string,
    cantidad: number,
    precioUnitario: number
  ) => {
    if (cantidad <= 0) return;
    const prev = map.get(codigo);
    if (prev) {
      prev.cantidad = round2(prev.cantidad + cantidad);
      prev.subtotal = round2(prev.cantidad * prev.precioUnitario);
    } else {
      map.set(codigo, {
        codigo,
        disciplina,
        disciplinaLabel,
        descripcion,
        unidad,
        cantidad: round2(cantidad),
        precioUnitario: round2(precioUnitario),
        subtotal: round2(cantidad * precioUnitario)
      });
    }
  };

  for (const insp of inspecciones) {
    const zona = insp.zona_id ? zonasById[insp.zona_id] : undefined;
    const areaZona = Number(zona?.superficie_estimada_m2) || 40;
    const estrategia: EstrategiaIntervencion = insp.estrategia_intervencion || 'INTEGRAL_100';
    const grado: GradoPreparacion = insp.grado_preparacion || 'ST2_ST3';

    // 1. Civil
    for (const ic of insp.items_civil || []) {
      if (ic.tipo === 'BACHEO_MORTERO_DM3') {
        addQty('CIV-MORTERO', '1_CIVIL', '1. Civil y Hormigón', 'Mortero estructural de reparación', 'dm3', ic.cantidad, tarifario.civil_mortero_dm3);
      } else if (ic.tipo === 'SELLADO_JUNTA_ML') {
        addQty('CIV-JUNTA', '1_CIVIL', '1. Civil y Hormigón', 'Sellado elastomérico de juntas', 'ml', ic.cantidad, tarifario.civil_junta_ml);
      } else if (ic.tipo === 'FISURA_INYECCION_ML') {
        addQty('CIV-FISURA', '1_CIVIL', '1. Civil y Hormigón', 'Inyección y sellado de fisuras', 'ml', ic.cantidad, tarifario.civil_fisura_ml);
      } else if (ic.tipo === 'REVESTIMIENTO_M2') {
        addQty('CIV-REVEST', '1_CIVIL', '1. Civil y Hormigón', 'Revestimiento protector epoxi/cementicio', 'm2', ic.cantidad, tarifario.civil_revestimiento_m2);
      }
    }

    // 2. Calderería MO + Material Contratista
    for (const im of insp.items_metalicos || []) {
      const factorAccion =
        im.accion === 'REFUERZO_EMPALME'
          ? tarifario.caldereria_factor_refuerzo
          : im.accion === 'SOLDADURA_MENOR'
          ? tarifario.caldereria_factor_soldadura
          : 1.0;
      const pesoEquivalente = (Number(im.peso_total_kg) || 0) * factorAccion;

      if (im.complejidad === 'LIVIANO') {
        addQty('CALD-MO-LIV', '2_CALDERERIA_MO', '2. Calderería (MO)', 'Fabricación y montaje calderería liviana (peso teórico)', 'kg', pesoEquivalente, tarifario.caldereria_mo_liviano_kg);
      } else if (im.complejidad === 'ESTRUCTURAL') {
        addQty('CALD-MO-EST', '2_CALDERERIA_MO', '2. Calderería (MO)', 'Fabricación y montaje calderería estructural (peso teórico)', 'kg', pesoEquivalente, tarifario.caldereria_mo_estructural_kg);
      } else {
        addQty('CALD-MO-CAN', '2_CALDERERIA_MO', '2. Calderería (MO)', 'Fabricación y montaje de cañerías (peso teórico)', 'kg', pesoEquivalente, tarifario.caldereria_mo_caneria_kg);
      }

      if (im.provision === 'CONTRATISTA' && im.accion !== 'SOLDADURA_MENOR') {
        const pesoConDesp = (Number(im.peso_total_kg) || 0) * (1 + (tarifario.desperdicio_metalico_pct || 0) / 100);
        addQty('MAT-ACERO-CONT', '3_MATERIAL_CONTRATISTA', '3. Provisión Materiales (Contratista)', 'Provisión acero estructural/perfiles/caños c/ desperdicio', 'kg', pesoConDesp, tarifario.acero_material_kg);
      }
    }

    // 3. Pintura
    const supCalc = calcularSuperficiePintura(areaZona, insp.porcentaje_afectado || 0, estrategia, tarifario.factor_solape_parcheo);
    const supFinal = insp.superficie_computada_m2 && insp.superficie_computada_m2 > 0 ? insp.superficie_computada_m2 : supCalc.computoObraM2;
    const puPint = getTarifaPinturaUnitaria(grado, estrategia, tarifario);
    const codPint = `PINT-${grado}-${estrategia}`;
    const descPint = `Prep. ${grado.replace(/_/g, ' ')} y Pintura (${estrategia.replace(/_/g, ' ')})`;
    addQty(codPint, '4_PINTURA', '4. Preparación y Pintura', descPint, 'm2', supFinal, puPint);

    // 4. Accesos
    for (const acc of getEffectiveAccesos(insp)) {
      if (acc.tipo === 'ANDAMIO_FIJO') {
        const vol = Number(acc.volumen_m3) || 0;
        const dias = Number(acc.dias_uso) || 5;
        const rango = acc.rango_altura || calcularRangoAltura(acc.alto_m);
        const mult = acc.complejidad === 'ALTA_INTERFERENCIA' ? tarifario.andamio_recargo_interferencia : 1;
        const volEf = vol * mult;
        if (rango === '0_6M') {
          addQty('ACC-AND-0-6', '5_ACCESOS', '5. Accesos y Andamios', 'Andamio Fijo Armado/Desarmado (0 a 6 m)', 'm3', volEf, tarifario.andamio_armado_0_6m_m3);
        } else if (rango === '6_12M') {
          addQty('ACC-AND-6-12', '5_ACCESOS', '5. Accesos y Andamios', 'Andamio Fijo Armado/Desarmado (6 a 12 m)', 'm3', volEf, tarifario.andamio_armado_6_12m_m3);
        } else {
          addQty('ACC-AND-12+', '5_ACCESOS', '5. Accesos y Andamios', 'Andamio Fijo Armado/Desarmado (> 12 m)', 'm3', volEf, tarifario.andamio_armado_mas_12m_m3);
        }
        addQty('ACC-AND-ALQ', '5_ACCESOS', '5. Accesos y Andamios', 'Alquiler diario de andamio (corte por Liberación)', 'm3·día', volEf * dias, tarifario.andamio_alquiler_m3_dia);
      } else if (acc.tipo === 'TORRE_MOVIL') {
        const cant = Number(acc.cantidad_torres) || 1;
        const dias = Number(acc.dias_uso) || 3;
        addQty('ACC-TORRE-ARM', '5_ACCESOS', '5. Accesos y Andamios', 'Torre Móvil — Armado y traslados', 'u', cant, tarifario.torre_movil_armado_u);
        addQty('ACC-TORRE-DIA', '5_ACCESOS', '5. Accesos y Andamios', 'Torre Móvil — Alquiler por jornada', 'día', cant * dias, tarifario.torre_movil_dia);
      } else if (acc.tipo === 'PLATAFORMA_ELEVADORA') {
        const dias = Number(acc.dias_uso) || 2;
        if (acc.subtipo_pem === 'TIJERA') {
          addQty('ACC-PEM-TIJ', '5_ACCESOS', '5. Accesos y Andamios', 'Plataforma Elevadora Tijera (Jornada)', 'día', dias, tarifario.pem_tijera_jornada);
        } else {
          addQty('ACC-PEM-BRAZ', '5_ACCESOS', '5. Accesos y Andamios', 'Plataforma Elevadora Brazo Articulado (Jornada)', 'día', dias, tarifario.pem_brazo_jornada);
        }
      }
    }
  }

  const items = Array.from(map.values()).sort((a, b) => a.disciplina.localeCompare(b.disciplina));
  const subtotalDirecto = round2(items.reduce((acc, i) => acc + i.subtotal, 0));
  const movilizacion = inspecciones.length > 0 ? round2(tarifario.movilizacion_suma_alzada) : 0;
  const contingenciaHH = round2((subtotalDirecto * (tarifario.bolsa_hh_contingencia_pct || 0)) / 100);
  const totalContrato = round2(subtotalDirecto + movilizacion + contingenciaHH);

  return {
    items,
    subtotalDirecto,
    movilizacion,
    contingenciaHH,
    totalContrato
  };
}

export interface CompraMaterialRow {
  codigo_catalogo: string;
  descripcion: string;
  categoria: string;
  unidad: string;
  provision: 'PLANTA' | 'CONTRATISTA';
  cantidad_neta: number;
  cantidad_con_desperdicio: number;
  peso_teorico_total_kg: number;
  presentacion_comercial: string;
  factor_comercial: number;
  unidades_comerciales: number;
  zonas: string[];
}

export function consolidarListaCompras(
  inspecciones: Inspeccion[],
  catalogo: CatalogoMaterialItem[],
  desperdicioPct = 10
): {
  provisionPlanta: CompraMaterialRow[];
  provisionContratista: CompraMaterialRow[];
} {
  const catByCode = new Map<string, CatalogoMaterialItem>();
  for (const c of catalogo) {
    catByCode.set(c.codigo, c);
  }

  const aggMap = new Map<string, CompraMaterialRow>();

  for (const insp of inspecciones) {
    const zonaLabel = insp.zona_codigo || insp.zona_id || insp.elemento_id;
    for (const im of insp.items_metalicos || []) {
      if (im.accion === 'SOLDADURA_MENOR') continue;
      const key = `${im.provision}::${im.codigo_catalogo}`;
      const cat = catByCode.get(im.codigo_catalogo);
      const factor = cat?.factor_comercial && cat.factor_comercial > 0 ? cat.factor_comercial : 1;
      const presentacion = cat?.presentacion_comercial || 'Unidad comercial';
      const qtyLine =
        im.unidad === 'm' && im.largo_m
          ? im.largo_m * im.cantidad
          : im.unidad === 'm2' && im.largo_m && im.ancho_m
          ? im.largo_m * im.ancho_m * im.cantidad
          : im.cantidad;

      const prev = aggMap.get(key);
      if (prev) {
        prev.cantidad_neta = round2(prev.cantidad_neta + qtyLine);
        prev.peso_teorico_total_kg = round2(prev.peso_teorico_total_kg + (im.peso_total_kg || 0));
        if (!prev.zonas.includes(zonaLabel)) prev.zonas.push(zonaLabel);
      } else {
        aggMap.set(key, {
          codigo_catalogo: im.codigo_catalogo,
          descripcion: im.descripcion || cat?.descripcion || im.codigo_catalogo,
          categoria: im.categoria,
          unidad: im.unidad,
          provision: im.provision,
          cantidad_neta: round2(qtyLine),
          cantidad_con_desperdicio: 0,
          peso_teorico_total_kg: round2(im.peso_total_kg || 0),
          presentacion_comercial: presentacion,
          factor_comercial: factor,
          unidades_comerciales: 0,
          zonas: [zonaLabel]
        });
      }
    }
  }

  const mult = 1 + (Number(desperdicioPct) || 0) / 100;
  const all = Array.from(aggMap.values()).map((row) => {
    const conDesp = round2(row.cantidad_neta * mult);
    const unidadesCom = Math.ceil(conDesp / Math.max(0.001, row.factor_comercial));
    return {
      ...row,
      cantidad_con_desperdicio: conDesp,
      unidades_comerciales: unidadesCom
    };
  });

  return {
    provisionPlanta: all.filter((r) => r.provision === 'PLANTA'),
    provisionContratista: all.filter((r) => r.provision === 'CONTRATISTA')
  };
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
