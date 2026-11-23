import { AmbienteISO12944, Inspeccion, MorfologiaCorrosiva, MuestreoTramoTecnico, ParametroCubicacion } from '../types';

export interface YearProjectionPoint {
  anio: number;
  gradoProyectado: 'Ri 1' | 'Ri 2' | 'Ri 3' | 'Ri 4' | 'Ri 5';
  porcentajeAfectado: number;
  requiereReemplazo: boolean;
  costoIntervencionEseAnioUsd: number;
}

export interface TimelineProjectionResult {
  anioRecomendado: number;
  anioFallaCritica: number | null;
  gradoActual: 'Ri 1' | 'Ri 2' | 'Ri 3' | 'Ri 4' | 'Ri 5';
  porcentajeActual: number;
  tasaAvanceAnualPct: number;
  fuenteTasa: 'inter_campana' | 'empirica_iso12944' | 'estimada_severidad';
  costoIntervencionTempranaUsd: number;
  costoNoIntervencionUsd: number;
  ahorroOportunoUsd: number;
  consecuenciaSiPosterga: string;
  trayectoria: YearProjectionPoint[];
}

const AMBIENTE_FACTOR: Record<AmbienteISO12944, number> = {
  C3: 0.8,
  C4: 1.0,
  C5: 1.25,
  CX: 1.5
};

function getStageFactor(grado: string): number {
  if (grado === 'Ri 1' || grado === 'Ri 2') return 0.7;
  if (grado === 'Ri 4' || grado === 'Ri 5') return 1.4;
  return 1.0;
}

function pctToIsoGrade(pct: number, forceReemplazo: boolean): 'Ri 1' | 'Ri 2' | 'Ri 3' | 'Ri 4' | 'Ri 5' {
  if (forceReemplazo || pct >= 50) return 'Ri 5';
  if (pct >= 30) return 'Ri 4';
  if (pct >= 15) return 'Ri 3';
  if (pct >= 5) return 'Ri 2';
  return 'Ri 1';
}

function gradeToBasePct(grado?: string, salud?: string): number {
  if (grado === 'Ri 5' || salud === 'critico') return 60;
  if (grado === 'Ri 4' || salud === 'malo') return 35;
  if (grado === 'Ri 3' || salud === 'regular') return 20;
  if (grado === 'Ri 2') return 8;
  if (grado === 'Ri 1' || salud === 'bueno') return 4;
  return 18;
}

export function computeInterCampaignRate(inspecciones?: Inspeccion[]): number | null {
  if (!inspecciones || inspecciones.length < 2) return null;
  const sorted = [...inspecciones].sort(
    (a, b) => new Date(b.fecha_inspeccion).getTime() - new Date(a.fecha_inspeccion).getTime()
  );
  const newest = sorted[0];
  const oldest = sorted[sorted.length - 1];
  const diffDays = (new Date(newest.fecha_inspeccion).getTime() - new Date(oldest.fecha_inspeccion).getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 30) return null;
  const diffYears = diffDays / 365.25;
  const deltaPct = newest.porcentaje_afectado - oldest.porcentaje_afectado;
  if (deltaPct <= 0) return null;
  return Math.min(35, Math.max(1, Number((deltaPct / diffYears).toFixed(1))));
}

/**
 * Calcula extensión normalizada (%), grado ISO 4628 sugerido, alerta de reemplazo y tasa de avance
 * para muestreo técnico por tramo en campo (3m, 5m, 10m).
 */
export function calcularMuestreoTramo(input: {
  longitudTramoM: number;
  unidadesTotales: number;
  unidadesAfectadas: number;
  morfologiaDominante: MorfologiaCorrosiva;
  ambienteIso12944: AmbienteISO12944;
  ultimoRevestimientoAnios: number;
  inspeccionesPrevias?: Inspeccion[];
}): {
  muestreo: MuestreoTramoTecnico;
  gradoSugerido: 'Ri 1' | 'Ri 2' | 'Ri 3' | 'Ri 4' | 'Ri 5';
  requiereReemplazoSugerido: boolean;
  fuenteTasa: 'inter_campana' | 'empirica_iso12944';
} {
  const totales = Math.max(1, Math.round(input.unidadesTotales));
  const afectadas = Math.min(totales, Math.max(0, Math.round(input.unidadesAfectadas)));
  const extensionPct = Math.round((afectadas / totales) * 100);

  let gradoSugerido = pctToIsoGrade(extensionPct, false);
  let requiereReemplazoSugerido = extensionPct >= 50;

  if (input.morfologiaDominante === 'picado_perdida_seccion') {
    if (gradoSugerido === 'Ri 1' || gradoSugerido === 'Ri 2' || gradoSugerido === 'Ri 3') {
      gradoSugerido = 'Ri 4';
    }
    if (extensionPct >= 25) {
      gradoSugerido = 'Ri 5';
      requiereReemplazoSugerido = true;
    }
  } else if (input.morfologiaDominante === 'activo_laminar') {
    if (gradoSugerido === 'Ri 1') gradoSugerido = 'Ri 2';
    else if (gradoSugerido === 'Ri 2' && extensionPct >= 10) gradoSugerido = 'Ri 3';
  }

  // Tasa: prioridad 1 = histórico real entre campañas; prioridad 2 = empírica ajustada por etapa + ISO 12944
  let fuenteTasa: 'inter_campana' | 'empirica_iso12944' = 'empirica_iso12944';
  let tasa = 4;

  const historial = input.inspeccionesPrevias || [];
  if (historial.length > 0) {
    const oldest = historial[historial.length - 1];
    const diffDays = (Date.now() - new Date(oldest.fecha_inspeccion).getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays >= 30 && extensionPct > oldest.porcentaje_afectado) {
      const years = diffDays / 365.25;
      tasa = Math.min(35, Math.max(1, Number(((extensionPct - oldest.porcentaje_afectado) / years).toFixed(1))));
      fuenteTasa = 'inter_campana';
    }
  }

  if (fuenteTasa === 'empirica_iso12944') {
    const anios = Math.max(1, input.ultimoRevestimientoAnios || 1);
    const tasaMedia = extensionPct > 0 ? extensionPct / anios : 2;
    const ajustada = tasaMedia * getStageFactor(gradoSugerido) * AMBIENTE_FACTOR[input.ambienteIso12944];
    tasa = Math.min(35, Math.max(2, Number(ajustada.toFixed(1))));
  }

  return {
    muestreo: {
      aplica: true,
      longitud_tramo_m: input.longitudTramoM,
      unidades_totales: totales,
      unidades_afectadas: afectadas,
      extension_normalizada_pct: extensionPct,
      morfologia_dominante: input.morfologiaDominante,
      ambiente_iso12944: input.ambienteIso12944,
      tasa_calculada_pct_anio: tasa
    },
    gradoSugerido,
    requiereReemplazoSugerido,
    fuenteTasa
  };
}

export function projectAssetTimeline(params: {
  m2Superficie: number;
  m3Andamio: number;
  saludFallback: string;
  ultimaInspeccion?: Inspeccion;
  inspeccionesHistoricas?: Inspeccion[];
  ambienteFallback?: AmbienteISO12944;
  tarifas: {
    hhPorM2Pintura: number;
    hhPorKgAcero: number;
    costoHhMontador: number;
    costoM2Pintura: number;
    costoKgAcero: number;
    costoM3Andamio: number;
  };
  baseYear?: number;
}): TimelineProjectionResult {
  const { m2Superficie, m3Andamio, saludFallback, ultimaInspeccion, inspeccionesHistoricas, ambienteFallback = 'C4', tarifas, baseYear = 2026 } = params;

  const pctInicial = ultimaInspeccion?.porcentaje_afectado ?? gradeToBasePct(ultimaInspeccion?.grado_corrosion, saludFallback);
  const gradoActual = (ultimaInspeccion?.grado_corrosion as TimelineProjectionResult['gradoActual']) ||
    pctToIsoGrade(pctInicial, Boolean(ultimaInspeccion?.requiere_reemplazo));

  const ambiente = ultimaInspeccion?.muestreo_tramo?.ambiente_iso12944 || ambienteFallback;
  const tasaInterCampana = computeInterCampaignRate(inspeccionesHistoricas);

  let fuenteTasa: TimelineProjectionResult['fuenteTasa'] = 'estimada_severidad';
  let tasaBase = gradoActual === 'Ri 5' || gradoActual === 'Ri 4' ? 8 : gradoActual === 'Ri 3' ? 6 : 4;

  if (tasaInterCampana !== null) {
    tasaBase = tasaInterCampana;
    fuenteTasa = 'inter_campana';
  } else if (ultimaInspeccion?.tasa_avance_anual_pct && ultimaInspeccion.tasa_avance_anual_pct > 0) {
    tasaBase = ultimaInspeccion.tasa_avance_anual_pct;
    fuenteTasa = ultimaInspeccion.muestreo_tramo?.aplica ? 'empirica_iso12944' : 'estimada_severidad';
  } else if (ultimaInspeccion?.ultimo_revestimiento_anios && ultimaInspeccion.ultimo_revestimiento_anios > 0) {
    const media = pctInicial / Math.max(1, ultimaInspeccion.ultimo_revestimiento_anios);
    tasaBase = Math.min(35, Math.max(2, Number((media * getStageFactor(gradoActual) * AMBIENTE_FACTOR[ambiente]).toFixed(1))));
    fuenteTasa = 'empirica_iso12944';
  }

  const anios = [baseYear, baseYear + 1, baseYear + 2, baseYear + 3, baseYear + 4];
  let anioFallaCritica: number | null = null;

  const computeCostAtPct = (pct: number, esReemplazo: boolean, factorParada = 1) => {
    const m2Afect = Math.max(1, Math.round((m2Superficie * pct) / 100));
    const kgAcero = esReemplazo ? Math.round(m2Afect * 18) : 0;
    const hhPintura = m2Afect * tarifas.hhPorM2Pintura;
    const hhAcero = kgAcero * tarifas.hhPorKgAcero;
    const costoPintura = m2Afect * tarifas.costoM2Pintura + hhPintura * tarifas.costoHhMontador;
    const costoAcero = kgAcero * tarifas.costoKgAcero + hhAcero * tarifas.costoHhMontador;
    const costoAndamio = m3Andamio * tarifas.costoM3Andamio;
    return Math.round((costoPintura + costoAcero + costoAndamio) * factorParada);
  };

  let pctAcumulado = pctInicial;
  const trayectoria: YearProjectionPoint[] = anios.map((anio, idx) => {
    if (idx > 0) {
      const gradoPrevio = pctToIsoGrade(pctAcumulado, Boolean(ultimaInspeccion?.requiere_reemplazo));
      const incremento = tasaBase * getStageFactor(gradoPrevio);
      pctAcumulado = Math.min(100, Math.round(pctAcumulado + incremento));
    }
    const pctProyectado = Math.round(pctAcumulado);
    const reqReemplazo = Boolean(ultimaInspeccion?.requiere_reemplazo) || pctProyectado >= 50;
    const gradoProyectado = pctToIsoGrade(pctProyectado, reqReemplazo);

    if (anioFallaCritica === null && (gradoProyectado === 'Ri 5' || reqReemplazo)) {
      anioFallaCritica = anio;
    }

    const factorParada = gradoProyectado === 'Ri 5' ? 1.25 : 1;
    return {
      anio,
      gradoProyectado,
      porcentajeAfectado: pctProyectado,
      requiereReemplazo: reqReemplazo,
      costoIntervencionEseAnioUsd: computeCostAtPct(pctProyectado, reqReemplazo, factorParada)
    };
  });

  // Asignación dinámica a 5 años (2026..2030) según urgencia y ventana de intervención
  const ventanaMeses = ultimaInspeccion?.meses_ventana_intervencion;
  let anioRecomendado = baseYear + 2;
  if (gradoActual === 'Ri 5' || gradoActual === 'Ri 4' || ultimaInspeccion?.requiere_reemplazo || (ventanaMeses !== undefined && ventanaMeses <= 12)) {
    anioRecomendado = baseYear; // 2026
  } else if (gradoActual === 'Ri 3' || (ventanaMeses !== undefined && ventanaMeses <= 24)) {
    anioRecomendado = baseYear + 1; // 2027
  } else if (gradoActual === 'Ri 2') {
    anioRecomendado = pctInicial >= 7 ? baseYear + 2 : baseYear + 3; // 2028 o 2029
  } else {
    anioRecomendado = baseYear + 4; // 2030 (preventivo programado)
  }

  const puntoRecomendado = trayectoria.find(t => t.anio === anioRecomendado) || trayectoria[0];
  const puntoFinal = trayectoria[trayectoria.length - 1];

  const costoIntervencionTempranaUsd = puntoRecomendado.costoIntervencionEseAnioUsd;
  const costoNoIntervencionUsd = Math.max(
    costoIntervencionTempranaUsd,
    puntoFinal.costoIntervencionEseAnioUsd
  );
  const ahorroOportunoUsd = Math.max(0, costoNoIntervencionUsd - costoIntervencionTempranaUsd);

  const consecuenciaSiPosterga =
    gradoActual === 'Ri 5' || ultimaInspeccion?.requiere_reemplazo
      ? 'Riesgo estructural inmediato: pérdida de sección y parada correctiva de emergencia.'
      : anioFallaCritica
      ? `Sin intervención antes de ${anioFallaCritica}, evoluciona a ${puntoFinal.gradoProyectado} (${puntoFinal.porcentajeAfectado}%) requiriendo reemplazo de acero.`
      : `Degradación progresiva hasta ${puntoFinal.gradoProyectado} (${puntoFinal.porcentajeAfectado}%) en ${puntoFinal.anio}.`;

  return {
    anioRecomendado,
    anioFallaCritica,
    gradoActual,
    porcentajeActual: pctInicial,
    tasaAvanceAnualPct: tasaBase,
    fuenteTasa,
    costoIntervencionTempranaUsd,
    costoNoIntervencionUsd,
    ahorroOportunoUsd,
    consecuenciaSiPosterga,
    trayectoria
  };
}

export function extractTarifasFromParams(parametros: ParametroCubicacion[]) {
  const getParam = (clave: string, fallback: number) => {
    const found = parametros.find(p => p.clave === clave);
    return found ? Number(found.valor_numerico) : fallback;
  };
  return {
    hhPorM2Pintura: getParam('hh_por_m2_pintura_epoxi', 0.45),
    hhPorKgAcero: getParam('hh_por_kg_acero_reemplazo', 0.12),
    costoHhMontador: getParam('costo_hh_oficial_montador', 28.50),
    costoM2Pintura: getParam('costo_m2_sistema_epoxi_poliuretano', 18.20),
    costoKgAcero: getParam('costo_kg_acero_perfileria', 3.40),
    costoM3Andamio: getParam('costo_m3_andamio_mes', 12.00)
  };
}
