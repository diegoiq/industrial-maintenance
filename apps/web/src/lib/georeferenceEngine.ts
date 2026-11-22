import { PlanoGeoreferencia, HitoGeografico, Plano } from '../types';

/**
 * Factores geodésicos WGS84 para conversión precisa metros <-> grados en una latitud dada
 */
export function getMetersPerDegree(latDeg: number): { metersPerDegLat: number; metersPerDegLng: number } {
  const latRad = (latDeg * Math.PI) / 180;
  const metersPerDegLat = 111132.92 - 559.82 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad);
  const metersPerDegLng = 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad);
  return {
    metersPerDegLat: Math.max(1, metersPerDegLat),
    metersPerDegLng: Math.max(1, metersPerDegLng)
  };
}

/**
 * Obtiene o inicializa una configuración de georreferencia para el plano.
 * Si el plano tiene al menos 2 hitos con coordenadas en el plano, calcula automáticamente
 * la escala y orientación; si tiene 1 hito (ej. G1), lo usa como ancla inicial.
 */
export function getOrInitGeoreferencia(plano?: Plano, hitos: HitoGeografico[] = []): PlanoGeoreferencia {
  if (plano?.georeferencia) {
    return plano.georeferencia;
  }

  const vbW = plano?.dimensiones_viewbox?.width || 7680;
  const vbH = plano?.dimensiones_viewbox?.height || 5433;
  const hitosConPunto = hitos.filter(h => h.coordenadas_plano && !isNaN(h.lat) && !isNaN(h.lng));

  if (hitosConPunto.length >= 2) {
    return calibrateFromTwoPoints(
      {
        x: hitosConPunto[0].coordenadas_plano!.x,
        y: hitosConPunto[0].coordenadas_plano!.y,
        lat: hitosConPunto[0].lat,
        lng: hitosConPunto[0].lng
      },
      {
        x: hitosConPunto[1].coordenadas_plano!.x,
        y: hitosConPunto[1].coordenadas_plano!.y,
        lat: hitosConPunto[1].lat,
        lng: hitosConPunto[1].lng
      }
    );
  }

  if (hitosConPunto.length === 1) {
    const h = hitosConPunto[0];
    return {
      anchorLat: h.lat,
      anchorLng: h.lng,
      anchorPixelX: h.coordenadas_plano!.x,
      anchorPixelY: h.coordenadas_plano!.y,
      metersPerPixel: 0.065, // Escala típica ~500m en 7680px
      rotationDeg: 0,
      satelliteOpacity: 0.65,
      invertCadLines: false
    };
  }

  // Default: Planta Celulosa Puerto Esperanza, Misiones
  return {
    anchorLat: -25.98656,
    anchorLng: -54.63950,
    anchorPixelX: Math.round(vbW * 0.35),
    anchorPixelY: Math.round(vbH * 0.55),
    metersPerPixel: 0.065,
    rotationDeg: 0,
    satelliteOpacity: 0.65,
    invertCadLines: false
  };
}

/**
 * Convierte coordenadas de píxeles del plano CAD (x, y) a coordenadas terrestres WGS84 (lat, lng)
 */
export function pixelToLatLng(
  x: number,
  y: number,
  cal: PlanoGeoreferencia
): { lat: number; lng: number } {
  const dxPx = x - cal.anchorPixelX;
  const dyPx = y - cal.anchorPixelY; // En SVG +Y va hacia abajo (Sur)

  const theta = ((cal.rotationDeg || 0) * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // Vector en plano antes de rotar: Este = +dxPx, Norte = -dyPx
  const eastUnrotatedM = dxPx * cal.metersPerPixel;
  const northUnrotatedM = -dyPx * cal.metersPerPixel;

  // Rotación horaria respecto al Norte geográfico
  const eastM = eastUnrotatedM * cosT + northUnrotatedM * sinT;
  const northM = -eastUnrotatedM * sinT + northUnrotatedM * cosT;

  const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree(cal.anchorLat);

  return {
    lat: Number((cal.anchorLat + northM / metersPerDegLat).toFixed(6)),
    lng: Number((cal.anchorLng + eastM / metersPerDegLng).toFixed(6))
  };
}

/**
 * Convierte coordenadas GPS WGS84 (lat, lng) a coordenadas de píxeles del plano CAD (x, y)
 */
export function latLngToPixel(
  lat: number,
  lng: number,
  cal: PlanoGeoreferencia
): { x: number; y: number } {
  const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree(cal.anchorLat);

  const northM = (lat - cal.anchorLat) * metersPerDegLat;
  const eastM = (lng - cal.anchorLng) * metersPerDegLng;

  const theta = ((cal.rotationDeg || 0) * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // Rotación inversa
  const eastUnrotatedM = eastM * cosT - northM * sinT;
  const northUnrotatedM = eastM * sinT + northM * cosT;

  const scale = Math.max(0.0001, cal.metersPerPixel);
  const dxPx = eastUnrotatedM / scale;
  const dyPx = -northUnrotatedM / scale;

  return {
    x: Math.round(cal.anchorPixelX + dxPx),
    y: Math.round(cal.anchorPixelY + dyPx)
  };
}

/**
 * Calibra automáticamente escala (metros/píxel) y rotación (°) a partir de 2 puntos GPS ubicados en el plano
 */
export function calibrateFromTwoPoints(
  p1: { x: number; y: number; lat: number; lng: number },
  p2: { x: number; y: number; lat: number; lng: number }
): PlanoGeoreferencia {
  const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree((p1.lat + p2.lat) / 2);

  const dNorthM = (p2.lat - p1.lat) * metersPerDegLat;
  const dEastM = (p2.lng - p1.lng) * metersPerDegLng;
  const realDistM = Math.hypot(dEastM, dNorthM);

  const dxPx = p2.x - p1.x;
  const dyPx = p2.y - p1.y;
  const pixelDist = Math.hypot(dxPx, dyPx);

  const metersPerPixel = pixelDist > 1 && realDistM > 0.5 ? Number((realDistM / pixelDist).toFixed(5)) : 0.065;

  // Ángulo en el plano (Este = +dx, Norte = -dy) vs Ángulo geográfico real
  const anglePlanRad = Math.atan2(dxPx, -dyPx);
  const angleGeoRad = Math.atan2(dEastM, dNorthM);
  let rotationDeg = ((angleGeoRad - anglePlanRad) * 180) / Math.PI;
  while (rotationDeg > 180) rotationDeg -= 360;
  while (rotationDeg < -180) rotationDeg += 360;

  return {
    anchorLat: p1.lat,
    anchorLng: p1.lng,
    anchorPixelX: p1.x,
    anchorPixelY: p1.y,
    metersPerPixel,
    rotationDeg: Number(rotationDeg.toFixed(2)),
    satelliteOpacity: 0.65,
    invertCadLines: false
  };
}

/**
 * Calibra la proporción del plano conociendo la distancia en metros entre 2 puntos (A y B)
 */
export function calibrateFromDistance(
  currentCal: PlanoGeoreferencia,
  pA: { x: number; y: number },
  pB: { x: number; y: number },
  realDistanceMeters: number
): PlanoGeoreferencia {
  const pixelDist = Math.hypot(pB.x - pA.x, pB.y - pA.y);
  if (pixelDist < 1 || realDistanceMeters <= 0) return currentCal;
  return {
    ...currentCal,
    metersPerPixel: Number((realDistanceMeters / pixelDist).toFixed(5))
  };
}

/**
 * Calcula el centroide (x, y) de un polígono
 */
export function getPolygonCentroid(puntos: { x: number; y: number }[]): { x: number; y: number } {
  if (!puntos || puntos.length === 0) return { x: 0, y: 0 };
  const sum = puntos.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return {
    x: Math.round(sum.x / puntos.length),
    y: Math.round(sum.y / puntos.length)
  };
}

/**
 * Calcula el área real en m² de un polígono de zona usando la fórmula de Gauss (Shoelace) y la escala georreferenciada
 */
export function calculatePolygonAreaM2(
  puntos: { x: number; y: number }[],
  cal?: PlanoGeoreferencia
): number {
  if (!puntos || puntos.length < 3) return 0;
  let areaPx2 = 0;
  for (let i = 0; i < puntos.length; i++) {
    const j = (i + 1) % puntos.length;
    areaPx2 += puntos[i].x * puntos[j].y;
    areaPx2 -= puntos[j].x * puntos[i].y;
  }
  areaPx2 = Math.abs(areaPx2) / 2;
  const scale = cal?.metersPerPixel || 0.065;
  return Math.round(areaPx2 * scale * scale * 10) / 10;
}

/**
 * Calcula el perímetro real en metros de un polígono
 */
export function calculatePolygonPerimeterM(
  puntos: { x: number; y: number }[],
  cal?: PlanoGeoreferencia
): number {
  if (!puntos || puntos.length < 2) return 0;
  let perimPx = 0;
  for (let i = 0; i < puntos.length; i++) {
    const j = (i + 1) % puntos.length;
    perimPx += Math.hypot(puntos[j].x - puntos[i].x, puntos[j].y - puntos[i].y);
  }
  const scale = cal?.metersPerPixel || 0.065;
  return Math.round(perimPx * scale * 10) / 10;
}

/**
 * Determina si un punto (x, y) en el plano cae dentro del polígono de una Zona (Ray-Casting)
 */
export function isPointInPolygon(
  pt: { x: number; y: number },
  polygon: { x: number; y: number }[]
): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 0.00001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Genera una grilla de tiles satelitales Web Mercator (Esri World Imagery / Google Hybrid)
 * proyectada exactamente en coordenadas de píxeles del ViewBox del plano CAD.
 * Esto permite renderizar el mapa satelital real DENTRO del mismo SVG como capa inferior,
 * acompañando el Pan & Zoom de 1x a 40x sin ningún desfasaje!
 */
export interface SatelliteTileQuad {
  key: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getSatelliteTilesForPlan(
  vbWidth: number,
  vbHeight: number,
  cal: PlanoGeoreferencia,
  tileSource: 'esri' | 'osm' = 'esri'
): { tiles: SatelliteTileQuad[]; rotationDeg: number; anchorX: number; anchorY: number } {
  // Calculamos el zoom satelital óptimo según metersPerPixel (en lat ~26°, z=18 es ~0.53m/px, z=19 es ~0.26m/px)
  const z = 18;
  const n = Math.pow(2, z);

  const latLngToTileFloat = (lat: number, lng: number) => {
    const latRad = (lat * Math.PI) / 180;
    const xTile = ((lng + 180) / 360) * n;
    const yTile = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
    return { xTile, yTile };
  };

  const tileToLatLng = (xTile: number, yTile: number) => {
    const lng = (xTile / n) * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * yTile) / n)));
    const lat = (latRad * 180) / Math.PI;
    return { lat, lng };
  };

  // Calculamos en un sistema sin rotación alrededor del anchor para proyectar los tiles ortogonales
  const unrotatedCal: PlanoGeoreferencia = { ...cal, rotationDeg: 0 };
  const topLeftGps = pixelToLatLng(-vbWidth * 0.25, -vbHeight * 0.25, unrotatedCal);
  const bottomRightGps = pixelToLatLng(vbWidth * 1.25, vbHeight * 1.25, unrotatedCal);

  const tl = latLngToTileFloat(topLeftGps.lat, topLeftGps.lng);
  const br = latLngToTileFloat(bottomRightGps.lat, bottomRightGps.lng);

  let minX = Math.floor(Math.min(tl.xTile, br.xTile));
  let maxX = Math.floor(Math.max(tl.xTile, br.xTile));
  let minY = Math.floor(Math.min(tl.yTile, br.yTile));
  let maxY = Math.floor(Math.max(tl.yTile, br.yTile));

  // Limitar a una grilla máxima de 7x7 tiles para carga instantánea
  const centerX = Math.floor((minX + maxX) / 2);
  const centerY = Math.floor((minY + maxY) / 2);
  if (maxX - minX > 6) { minX = centerX - 3; maxX = centerX + 3; }
  if (maxY - minY > 6) { minY = centerY - 3; maxY = centerY + 3; }

  const tiles: SatelliteTileQuad[] = [];
  for (let tx = minX; tx <= maxX; tx++) {
    for (let ty = minY; ty <= maxY; ty++) {
      const nwGps = tileToLatLng(tx, ty);
      const seGps = tileToLatLng(tx + 1, ty + 1);
      const nwPx = latLngToPixel(nwGps.lat, nwGps.lng, unrotatedCal);
      const sePx = latLngToPixel(seGps.lat, seGps.lng, unrotatedCal);

      const url = tileSource === 'esri'
        ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`
        : `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`;

      tiles.push({
        key: `${tileSource}-${z}-${tx}-${ty}`,
        url,
        x: nwPx.x,
        y: nwPx.y,
        width: Math.max(1, sePx.x - nwPx.x + 0.8),
        height: Math.max(1, sePx.y - nwPx.y + 0.8)
      });
    }
  }

  return {
    tiles,
    rotationDeg: -(cal.rotationDeg || 0),
    anchorX: cal.anchorPixelX,
    anchorY: cal.anchorPixelY
  };
}
