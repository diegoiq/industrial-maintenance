import { Inspeccion, ParametroCubicacion } from '../types';

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
  costoIntervencionTempranaUsd: number;
  costoNoIntervencionUsd: number;
  ahorroOportunoUsd: number;
  consecuenciaSiPosterga: string;
  trayectoria: YearProjectionPoint[];
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

export function projectAssetTimeline(params: {
  m2Superficie: number;
  m3Andamio: number;
  saludFallback: string;
  ultimaInspeccion?: Inspeccion;
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
  const { m2Superficie, m3Andamio, saludFallback, ultimaInspeccion, tarifas, baseYear = 2026 } = params;

  const pctInicial = ultimaInspeccion?.porcentaje_afectado ?? gradeToBasePct(ultimaInspeccion?.grado_corrosion, saludFallback);
  const gradoActual = (ultimaInspeccion?.grado_corrosion as TimelineProjectionResult['gradoActual']) ||
    pctToIsoGrade(pctInicial, Boolean(ultimaInspeccion?.requiere_reemplazo));

  // Tasa de avance anual real desde inspección o estimada según severidad actual
  const tasaBase = ultimaInspeccion?.tasa_avance_anual_pct && ultimaInspeccion.tasa_avance_anual_pct > 0
    ? ultimaInspeccion.tasa_avance_anual_pct
    : gradoActual === 'Ri 5' || gradoActual === 'Ri 4'
    ? 8
    : gradoActual === 'Ri 3'
    ? 6
    : 4;

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

  const trayectoria: YearProjectionPoint[] = anios.map((anio, idx) => {
    const pctProyectado = Math.min(100, Math.round(pctInicial + idx * tasaBase));
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
