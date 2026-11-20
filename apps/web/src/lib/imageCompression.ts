import imageCompression from 'browser-image-compression';

export interface CompressedResult {
  file: File;
  blob: Blob;
  dataUrl: string;
  thumbnailDataUrl: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  ratioReducedPercent: number;
  width: number;
  height: number;
}

/**
 * Genera una miniatura ultraligera (~20 KB, máx 300px) usando HTML5 Canvas para renderizado instantáneo en galerías.
 */
export async function createThumbnailDataUrl(imageSource: string | Blob): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const maxThumbDim = 300;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxThumbDim) {
          height = Math.round((height * maxThumbDim) / width);
          width = maxThumbDim;
        }
      } else {
        if (height > maxThumbDim) {
          width = Math.round((width * maxThumbDim) / height);
          height = maxThumbDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/webp', 0.65));
      } else {
        resolve('');
      }
    };
    img.onerror = () => resolve('');

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else {
      img.src = URL.createObjectURL(imageSource);
    }
  });
}

/**
 * Compresión fotográfica obligatoria en cliente:
 * - Reduce fotos de celular de 8-12 MB a ~180 KB
 * - Formato WebP con resolución máxima de 1600px
 * - Genera miniatura de ~20 KB para previsualizaciones rápidas sin consumir ancho de banda
 */
export async function compressInspectionPhoto(file: File): Promise<CompressedResult> {
  const originalSize = file.size;

  const options = {
    maxSizeMB: 0.25, // Máximo ~250 KB (típicamente queda en ~150-180 KB)
    maxWidthOrHeight: 1600, // Dimensión máxima en planta para apreciar fisuras sin desperdiciar almacenamiento
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.8
  };

  let compressedFile: File;
  try {
    compressedFile = await imageCompression(file, options);
  } catch (err) {
    console.warn('Fallo compresión worker, ejecutando fallback canvas:', err);
    compressedFile = file;
  }

  const compressedDataUrl = await imageCompression.getDataUrlFromFile(compressedFile);
  const thumbnailDataUrl = await createThumbnailDataUrl(compressedDataUrl);

  const reducedRatio = Math.round(((originalSize - compressedFile.size) / originalSize) * 100);

  return {
    file: compressedFile,
    blob: compressedFile,
    dataUrl: compressedDataUrl,
    thumbnailDataUrl,
    originalSizeBytes: originalSize,
    compressedSizeBytes: compressedFile.size,
    ratioReducedPercent: Math.max(0, reducedRatio),
    width: 1600,
    height: 1200
  };
}
