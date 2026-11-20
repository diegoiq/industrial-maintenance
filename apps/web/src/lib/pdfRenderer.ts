/**
 * Renderizador de Planos PDF a Imagen de Alta Resolución (Canvas / WebP)
 * Permite convertir planos de ingeniería y layouts en PDF a imágenes nítidas
 * para que puedan ser renderizados de forma interactiva con pines y polígonos.
 */

export interface RenderedPdfLayout {
  dataUrl: string;
  width: number;
  height: number;
  totalPages: number;
  pageNumber: number;
}

export interface RenderedPdfSvg {
  svgContent: string;
  width: number;
  height: number;
  totalPages: number;
  pageNumber: number;
}

/**
 * Carga el buffer de datos desde cualquier formato de origen compatible
 */
async function loadPdfBuffer(source: File | Blob | string | ArrayBuffer): Promise<ArrayBuffer> {
  if (source instanceof ArrayBuffer) {
    return source;
  }
  if (source instanceof Blob) {
    return await source.arrayBuffer();
  }
  if (typeof source === 'string') {
    if (source.startsWith('data:')) {
      const base64Index = source.indexOf(';base64,');
      if (base64Index !== -1) {
        const base64 = source.substring(base64Index + 8);
        const binaryStr = window.atob(base64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        return bytes.buffer;
      }
    }
    const response = await fetch(source);
    return await response.arrayBuffer();
  }
  throw new Error("Formato de fuente PDF no soportado.");
}

/**
 * Carga dinámica de PDF.js para garantizar soporte tanto con paquete local como con CDN
 */
async function getPdfJsLib(): Promise<any> {
  if (typeof window === 'undefined') return null;

  // 1. Si ya está cargado globalmente en window
  if ((window as any).pdfjsLib) {
    return (window as any).pdfjsLib;
  }

  // 2. Intentar cargar desde el paquete instalado
  try {
    const pdfjs = await import('pdfjs-dist');
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
    }
    return pdfjs;
  } catch (err) {
    console.warn("Fallo importación local pdfjs-dist, cargando script CDN...", err);
  }

  // 3. Fallback CDN en tiempo de ejecución
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(lib);
      } else {
        reject(new Error("No se pudo inicializar pdfjsLib desde CDN."));
      }
    };
    script.onerror = () => reject(new Error("Error al descargar biblioteca PDF.js"));
    document.head.appendChild(script);
  });
}

/**
 * Convierte una página de un archivo PDF a imagen WebP de alta resolución (2x / 3x)
 * @param source Archivo File, Blob, DataURL en base64 o ArrayBuffer
 * @param pageNum Número de página a renderizar (por defecto 1, que suele ser el layout general)
 * @param targetScale Escala de renderizado (2.0 o 2.5 para planos industriales grandes)
 */
export async function convertPdfPageToImage(
  source: File | Blob | string | ArrayBuffer,
  pageNum = 1,
  targetScale = 3.2,
  maxDimension = 7680
): Promise<RenderedPdfLayout> {
  const pdfjsLib = await getPdfJsLib();
  if (!pdfjsLib) {
    throw new Error("El motor PDF no está disponible en este entorno.");
  }

  const dataBuffer = await loadPdfBuffer(source);
  const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  const validPageNum = Math.min(Math.max(1, pageNum), totalPages);
  const page = await pdfDoc.getPage(validPageNum);

  // Escala para planos industriales de alta definición (hasta 7680px para máxima nitidez en zoom)
  const baseViewport = page.getViewport({ scale: 1.0 });
  let effectiveScale = targetScale;
  if (baseViewport.width * effectiveScale > maxDimension || baseViewport.height * effectiveScale > maxDimension) {
    effectiveScale = Math.min(maxDimension / baseViewport.width, maxDimension / baseViewport.height);
  }

  const viewport = page.getViewport({ scale: effectiveScale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d', { alpha: false });

  if (!ctx) {
    throw new Error("No se pudo inicializar el contexto 2D para renderizar el PDF.");
  }

  // Fondo blanco para planos de arquitectura e ingeniería
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const renderContext = {
    canvasContext: ctx,
    viewport: viewport
  };

  await page.render(renderContext).promise;

  // Exportar como WebP optimizado con máxima calidad (0.95)
  const dataUrl = canvas.toDataURL('image/webp', 0.95);

  return {
    dataUrl,
    width: Math.round(viewport.width),
    height: Math.round(viewport.height),
    totalPages,
    pageNumber: validPageNum
  };
}

/**
 * Convierte una página de un archivo PDF a SVG Vectorial Puro (SVGGraphics)
 * Proporciona nitidez infinita sin pixelación al hacer zoom, idéntica a la vista
 * nativa del navegador y a AutoCAD.
 */
export async function convertPdfPageToSvg(
  source: File | Blob | string | ArrayBuffer,
  pageNum = 1
): Promise<RenderedPdfSvg> {
  const pdfjsLib = await getPdfJsLib();
  if (!pdfjsLib) {
    throw new Error("El motor PDF no está disponible en este entorno.");
  }

  const dataBuffer = await loadPdfBuffer(source);
  const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  const validPageNum = Math.min(Math.max(1, pageNum), totalPages);
  const page = await pdfDoc.getPage(validPageNum);

  // Viewport a escala 1.0 estándar de ingeniería
  const viewport = page.getViewport({ scale: 1.0 });

  const opList = await page.getOperatorList();
  const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
  const svgElement: SVGSVGElement = await svgGfx.getSVG(opList, viewport);

  const width = Math.round(viewport.width);
  const height = Math.round(viewport.height);

  // Asegurar atributos estándar de dimensiones y viewBox para SVG embebible
  svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svgElement.setAttribute('x', '0');
  svgElement.setAttribute('y', '0');
  svgElement.setAttribute('width', '100%');
  svgElement.setAttribute('height', '100%');
  svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Insertar un fondo blanco en el SVG para planos de ingeniería
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', '0');
  bgRect.setAttribute('y', '0');
  bgRect.setAttribute('width', `${width}`);
  bgRect.setAttribute('height', `${height}`);
  bgRect.setAttribute('fill', '#ffffff');
  if (svgElement.firstChild) {
    svgElement.insertBefore(bgRect, svgElement.firstChild);
  } else {
    svgElement.appendChild(bgRect);
  }

  const serializer = new XMLSerializer();
  const svgContent = serializer.serializeToString(svgElement);

  return {
    svgContent,
    width,
    height,
    totalPages,
    pageNumber: validPageNum
  };
}

/**
 * Rota una imagen en dataURL 90 grados (en sentido horario o antihorario)
 * Invirtiendo ancho y alto en el canvas.
 */
export async function rotateImageDataUrl(
  dataUrl: string,
  clockwise = true
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Al rotar 90 grados, ancho y alto se intercambian
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl, width: img.width, height: img.height });
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (clockwise) {
        ctx.translate(canvas.width, 0);
        ctx.rotate(Math.PI / 2);
      } else {
        ctx.translate(0, canvas.height);
        ctx.rotate(-Math.PI / 2);
      }

      ctx.drawImage(img, 0, 0);

      resolve({
        dataUrl: canvas.toDataURL('image/webp', 0.95),
        width: canvas.width,
        height: canvas.height
      });
    };
    img.onerror = () => resolve({ dataUrl, width: 1600, height: 900 });
    img.src = dataUrl;
  });
}
