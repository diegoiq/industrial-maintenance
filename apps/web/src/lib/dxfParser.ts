/**
 * Parser de CAD DXF a SVG Vectorial Puro con Filtrado Inteligente de Capas
 * - Respeta capas apagadas (color negativo) y capas congeladas (frozen) de AutoCAD.
 * - Filtra capas no imprimibles (DEFPOINTS, VIEWPORTS, construction grids gigantes).
 * - Ignora entidades de Espacio Papel (Paper Space code 67=1).
 * - Ajusta el encuadre (Bounding Box) automáticamente a la fábrica real.
 */

export interface DxfParseResult {
  svgContent: string;
  width: number;
  height: number;
  viewBox: string;
  layerCount: number;
  entityCount: number;
  layers: { name: string; isOff: boolean; color: number }[];
}

export function parseDxfToSvg(dxfText: string): DxfParseResult {
  const lines = dxfText.split(/\r?\n/);
  let i = 0;

  // 1. Tablas de Capas (LAYER)
  const layerStatus = new Map<string, { isOff: boolean; color: number }>();

  // 2. Colección de entidades extraídas
  interface Point2D { x: number; y: number }
  interface CadLine { p1: Point2D; p2: Point2D; layer: string }
  interface CadPolyline { points: Point2D[]; closed: boolean; layer: string }
  interface CadCircle { center: Point2D; radius: number; layer: string }
  interface CadArc { center: Point2D; radius: number; startAngle: number; endAngle: number; layer: string }
  interface CadText { pos: Point2D; text: string; height: number; layer: string }

  const cadLines: CadLine[] = [];
  const cadPolylines: CadPolyline[] = [];
  const cadCircles: CadCircle[] = [];
  const cadArcs: CadArc[] = [];
  const cadTexts: CadText[] = [];
  const foundLayers = new Set<string>();

  let inTablesSection = false;
  let inLayerTable = false;
  let inEntitiesSection = false;

  // Paso 1: Leer Tablas de Capas (TABLES -> LAYER)
  while (i < lines.length - 1) {
    const code = lines[i]?.trim();
    const val = lines[i + 1]?.trim();
    i += 2;

    if (code === '0' && val === 'SECTION') {
      const nextCode = lines[i]?.trim();
      const nextVal = lines[i + 1]?.trim();
      if (nextCode === '2') {
        if (nextVal === 'TABLES') inTablesSection = true;
        else if (nextVal === 'ENTITIES') {
          inEntitiesSection = true;
          i += 2;
          break;
        }
        i += 2;
      }
    } else if (code === '0' && val === 'TABLE') {
      const nextCode = lines[i]?.trim();
      const nextVal = lines[i + 1]?.trim();
      if (nextCode === '2' && nextVal === 'LAYER') {
        inLayerTable = true;
        i += 2;
      }
    } else if (code === '0' && val === 'ENDTAB') {
      inLayerTable = false;
    } else if (code === '0' && val === 'ENDSEC') {
      inTablesSection = false;
    }

    if (inTablesSection && inLayerTable && code === '0' && val === 'LAYER') {
      let layerName = '';
      let color = 7;
      let flags = 0;

      while (i < lines.length - 1 && lines[i]?.trim() !== '0') {
        const c = lines[i]?.trim();
        const v = lines[i + 1]?.trim();
        i += 2;
        if (c === '2') layerName = v.toUpperCase();
        else if (c === '62') color = parseInt(v, 10);
        else if (c === '70') flags = parseInt(v, 10);
      }

      if (layerName) {
        // En DXF: si el color es negativo, la capa está OFF (apagada en AutoCAD).
        // Si flags & 1 === 1, la capa está FROZEN (congelada).
        const isOff = color < 0 || (flags & 1) === 1;
        layerStatus.set(layerName, { isOff, color: Math.abs(color) });
      }
    }
  }

  // Paso 2: Leer Entidades de Modelo
  while (i < lines.length - 1) {
    const code = lines[i]?.trim();
    const val = lines[i + 1]?.trim();
    i += 2;

    if (code === '0' && val === 'ENDSEC') {
      break;
    }

    if (code === '0') {
      const entityType = val;

      if (entityType === 'LINE') {
        let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        let layer = '0';
        let isPaperSpace = false;

        while (i < lines.length - 1 && lines[i]?.trim() !== '0') {
          const c = lines[i]?.trim();
          const v = lines[i + 1]?.trim();
          i += 2;
          if (c === '8') layer = v;
          else if (c === '67') isPaperSpace = v === '1';
          else if (c === '10') x1 = parseFloat(v);
          else if (c === '20') y1 = parseFloat(v);
          else if (c === '11') x2 = parseFloat(v);
          else if (c === '21') y2 = parseFloat(v);
        }

        const upLayer = layer.toUpperCase();
        foundLayers.add(layer);
        const lStatus = layerStatus.get(upLayer);

        // Descartar si está en Paper Space o si la capa está apagada/congelada en AutoCAD
        if (!isPaperSpace && (!lStatus || !lStatus.isOff) && !upLayer.includes('DEFPOINTS') && !upLayer.includes('VIEWPORT')) {
          if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
            cadLines.push({ p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, layer });
          }
        }
      } else if (entityType === 'LWPOLYLINE') {
        const points: Point2D[] = [];
        let closed = false;
        let layer = '0';
        let currentX = 0;
        let isPaperSpace = false;

        while (i < lines.length - 1 && lines[i]?.trim() !== '0') {
          const c = lines[i]?.trim();
          const v = lines[i + 1]?.trim();
          i += 2;
          if (c === '8') layer = v;
          else if (c === '67') isPaperSpace = v === '1';
          else if (c === '70') closed = (parseInt(v, 10) & 1) === 1;
          else if (c === '10') currentX = parseFloat(v);
          else if (c === '20') {
            const currentY = parseFloat(v);
            points.push({ x: currentX, y: currentY });
          }
        }

        const upLayer = layer.toUpperCase();
        foundLayers.add(layer);
        const lStatus = layerStatus.get(upLayer);

        if (!isPaperSpace && (!lStatus || !lStatus.isOff) && !upLayer.includes('DEFPOINTS') && !upLayer.includes('VIEWPORT')) {
          if (points.length >= 2) {
            cadPolylines.push({ points, closed, layer });
          }
        }
      } else if (entityType === 'CIRCLE') {
        let cx = 0, cy = 0, r = 0;
        let layer = '0';
        let isPaperSpace = false;

        while (i < lines.length - 1 && lines[i]?.trim() !== '0') {
          const c = lines[i]?.trim();
          const v = lines[i + 1]?.trim();
          i += 2;
          if (c === '8') layer = v;
          else if (c === '67') isPaperSpace = v === '1';
          else if (c === '10') cx = parseFloat(v);
          else if (c === '20') cy = parseFloat(v);
          else if (c === '40') r = parseFloat(v);
        }

        const upLayer = layer.toUpperCase();
        foundLayers.add(layer);
        const lStatus = layerStatus.get(upLayer);

        // Descartar si está apagado o si es un círculo astronómico de agrimensura/satélite
        if (!isPaperSpace && (!lStatus || !lStatus.isOff) && !upLayer.includes('DEFPOINTS') && !upLayer.includes('VIEWPORT')) {
          if (r > 0 && r < 5000) { // Limitar círculos gigantes que deforman el encuadre
            cadCircles.push({ center: { x: cx, y: cy }, radius: r, layer });
          }
        }
      } else if (entityType === 'ARC') {
        let cx = 0, cy = 0, r = 0, startA = 0, endA = 360;
        let layer = '0';
        let isPaperSpace = false;

        while (i < lines.length - 1 && lines[i]?.trim() !== '0') {
          const c = lines[i]?.trim();
          const v = lines[i + 1]?.trim();
          i += 2;
          if (c === '8') layer = v;
          else if (c === '67') isPaperSpace = v === '1';
          else if (c === '10') cx = parseFloat(v);
          else if (c === '20') cy = parseFloat(v);
          else if (c === '40') r = parseFloat(v);
          else if (c === '50') startA = parseFloat(v);
          else if (c === '51') endA = parseFloat(v);
        }

        const upLayer = layer.toUpperCase();
        foundLayers.add(layer);
        const lStatus = layerStatus.get(upLayer);

        if (!isPaperSpace && (!lStatus || !lStatus.isOff) && !upLayer.includes('DEFPOINTS') && !upLayer.includes('VIEWPORT')) {
          if (r > 0 && r < 5000) {
            cadArcs.push({ center: { x: cx, y: cy }, radius: r, startAngle: startA, endAngle: endA, layer });
          }
        }
      } else if (entityType === 'TEXT' || entityType === 'MTEXT') {
        let tx = 0, ty = 0, h = 10, textContent = '';
        let layer = '0';
        let isPaperSpace = false;

        while (i < lines.length - 1 && lines[i]?.trim() !== '0') {
          const c = lines[i]?.trim();
          const v = lines[i + 1]?.trim();
          i += 2;
          if (c === '8') layer = v;
          else if (c === '67') isPaperSpace = v === '1';
          else if (c === '10') tx = parseFloat(v);
          else if (c === '20') ty = parseFloat(v);
          else if (c === '40') h = parseFloat(v);
          else if (c === '1') textContent = v;
        }

        const upLayer = layer.toUpperCase();
        foundLayers.add(layer);
        const lStatus = layerStatus.get(upLayer);

        if (!isPaperSpace && (!lStatus || !lStatus.isOff) && !upLayer.includes('DEFPOINTS')) {
          if (textContent) {
            cadTexts.push({ pos: { x: tx, y: ty }, text: textContent, height: h, layer });
          }
        }
      }
    }
  }

  // Paso 3: Calcular Bounding Box focalizado en la fábrica real (sin cuadrículas gigantes periféricas)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function updateBounds(x: number, y: number) {
    if (isNaN(x) || isNaN(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  for (const l of cadLines) {
    updateBounds(l.p1.x, l.p1.y);
    updateBounds(l.p2.x, l.p2.y);
  }
  for (const pl of cadPolylines) {
    for (const p of pl.points) updateBounds(p.x, p.y);
  }
  for (const c of cadCircles) {
    updateBounds(c.center.x - c.radius, c.center.y - c.radius);
    updateBounds(c.center.x + c.radius, c.center.y + c.radius);
  }
  for (const a of cadArcs) {
    updateBounds(a.center.x - a.radius, a.center.y - a.radius);
    updateBounds(a.center.x + a.radius, a.center.y + a.radius);
  }

  if (minX === Infinity || maxX === -Infinity || minX === maxX) {
    minX = 0; maxX = 1600;
    minY = 0; maxY = 900;
  }

  const padding = Math.max(30, (maxX - minX) * 0.04);
  const vbW = Math.round((maxX - minX) + padding * 2) || 1600;
  const vbH = Math.round((maxY - minY) + padding * 2) || 900;

  // Paso 4: Generar SVG con colores por defecto oscuros de ingeniería
  const svgElements: string[] = [];

  for (const l of cadLines) {
    const y1 = maxY - (l.p1.y - minY);
    const y2 = maxY - (l.p2.y - minY);
    svgElements.push(`<line x1="${l.p1.x.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${l.p2.x.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#cbd5e1" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`);
  }

  for (const pl of cadPolylines) {
    const pts = pl.points.map(p => `${p.x.toFixed(1)},${(maxY - (p.y - minY)).toFixed(1)}`).join(' ');
    if (pl.closed) {
      svgElements.push(`<polygon points="${pts}" fill="none" stroke="#38bdf8" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`);
    } else {
      svgElements.push(`<polyline points="${pts}" fill="none" stroke="#94a3b8" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`);
    }
  }

  for (const c of cadCircles) {
    const cy = maxY - (c.center.y - minY);
    svgElements.push(`<circle cx="${c.center.x.toFixed(1)}" cy="${cy.toFixed(1)}" r="${c.radius.toFixed(1)}" fill="none" stroke="#f59e0b" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`);
  }

  for (const a of cadArcs) {
    const cy = maxY - (a.center.y - minY);
    const r = a.radius;
    const sRad = (a.startAngle * Math.PI) / 180;
    const eRad = (a.endAngle * Math.PI) / 180;
    const x1 = a.center.x + r * Math.cos(sRad);
    const y1 = cy - r * Math.sin(sRad);
    const x2 = a.center.x + r * Math.cos(eRad);
    const y2 = cy - r * Math.sin(eRad);
    const largeArc = Math.abs(a.endAngle - a.startAngle) > 180 ? 1 : 0;
    svgElements.push(`<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${largeArc} 0 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="#e2e8f0" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`);
  }

  for (const t of cadTexts) {
    const ty = maxY - (t.pos.y - minY);
    const cleanText = t.text.replace(/\\A[0-9];/g, '').replace(/%%c/g, 'Ø').replace(/[{}]/g, '');
    svgElements.push(`<text x="${t.pos.x.toFixed(1)}" y="${ty.toFixed(1)}" fill="#94a3b8" font-family="monospace" font-size="${Math.max(9, t.height).toFixed(1)}" font-weight="bold">${escapeXml(cleanText)}</text>`);
  }

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - padding} ${minY - padding} ${vbW} ${vbH}" width="100%" height="100%">
    <rect x="${minX - padding}" y="${minY - padding}" width="${vbW}" height="${vbH}" fill="#0b1120"/>
    <g id="cad-clean-entities">
      ${svgElements.join('\n      ')}
    </g>
  </svg>`;

  return {
    svgContent,
    width: vbW,
    height: vbH,
    viewBox: `${minX - padding} ${minY - padding} ${vbW} ${vbH}`,
    layerCount: foundLayers.size,
    entityCount: cadLines.length + cadPolylines.length + cadCircles.length + cadArcs.length + cadTexts.length,
    layers: Array.from(foundLayers).map(name => ({
      name,
      isOff: layerStatus.get(name.toUpperCase())?.isOff || false,
      color: layerStatus.get(name.toUpperCase())?.color || 7
    }))
  };
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
