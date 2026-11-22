/**
 * Utilidades de Seguridad Defensiva (OWASP Top 10)
 * - Sanitización de SVG contra Stored/DOM XSS (SEC-04)
 * - Sanitización de celdas CSV contra Formula Injection en SAP PM / Excel (SEC-07)
 * - Validación de identificadores y archivos en Backblaze B2 (SEC-05)
 * - Cabeceras de autenticación para sincronización con Neon Cloud (SEC-02)
 */

const SAFE_ID_REGEX = /^[a-zA-Z0-9_:-]{1,100}$/;

/**
 * Valida que un ID de entidad no contenga caracteres de Path Traversal (.., /, \)
 */
export function isValidEntityId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID_REGEX.test(id) && !id.includes('..');
}

/**
 * Sanitiza código SVG eliminando etiquetas ejecutables (<script>, <foreignObject>, <iframe>, <object>, <embed>)
 * y atributos de eventos inline (onload, onerror, onclick, etc.) o URIs javascript:/data:text/html.
 */
export function sanitizeSvgContent(rawSvg: string | null | undefined): string {
  if (!rawSvg || typeof rawSvg !== 'string') return '';

  return rawSvg
    // 1. Eliminar bloques peligrosos con contenido
    .replace(/<\s*(script|foreignObject|iframe|object|embed|applet|meta|link)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    // 2. Eliminar etiquetas peligrosas auto-cerradas o abiertas
    .replace(/<\s*\/?\s*(script|foreignObject|iframe|object|embed|applet|meta|link)\b[^>]*\/?>/gi, '')
    // 3. Eliminar cualquier atributo de evento on* (onload, onerror, onclick, onmouseover, etc.)
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // 4. Neutralizar URIs javascript: o data:text/html en href / xlink:href / src
    .replace(/\b(xlink:href|href|src)\s*=\s*(?:"\s*(?:javascript:|data:text\/html)[^"]*"|'\s*(?:javascript:|data:text\/html)[^']*')/gi, '');
}

/**
 * Neutraliza ataques de CSV Injection (Formula Injection) al exportar a Excel / SAP PM.
 * Escapa comillas dobles internas y prefija con comilla simple si comienza con =, +, -, @, \t o \r
 * (excepto números o cotas legítimas como +146.0m o coordenadas GPS negativas).
 */
export function sanitizeCsvCell(value: unknown, wrapQuotes = true): string {
  if (value === null || value === undefined) {
    return wrapQuotes ? '""' : '';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  let str = String(value).replace(/\r?\n/g, ' ').trim();

  const isFormulaTrigger = /^[=+\-@\t\r]/.test(str);
  const isSafeNumericOrCoord = /^[+-]?\d+(\.\d+)?(\s*m|,\s*[+-]?\d+(\.\d+)?)?$/i.test(str);

  if (isFormulaTrigger && !isSafeNumericOrCoord) {
    str = `'${str}`;
  }

  const escaped = str.replace(/"/g, '""');
  return wrapQuotes ? `"${escaped}"` : escaped;
}

/**
 * Valida un Data URL en base64 verificando su MIME contra una lista blanca y su peso máximo en bytes.
 */
export function validateBase64DataUrl(
  dataUrl: string,
  allowedMimePrefixes: string[],
  maxBytes: number
): { valid: boolean; mimeType: string; buffer: Buffer; error?: string } {
  const match = dataUrl.match(/^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    return { valid: false, mimeType: '', buffer: Buffer.alloc(0), error: 'Formato Data URL inválido' };
  }

  const mimeType = match[1].toLowerCase();
  const isAllowed = allowedMimePrefixes.some(allowed => mimeType === allowed || mimeType.startsWith(allowed));
  if (!isAllowed) {
    return { valid: false, mimeType, buffer: Buffer.alloc(0), error: `Tipo MIME no permitido: ${mimeType}` };
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.byteLength > maxBytes) {
    return {
      valid: false,
      mimeType,
      buffer: Buffer.alloc(0),
      error: `Archivo excede el tamaño máximo permitido (${Math.round(maxBytes / (1024 * 1024))} MB)`
    };
  }

  return { valid: true, mimeType, buffer };
}

/**
 * Construye las cabeceras de seguridad para peticiones cliente -> /api/sync-neon
 */
export function getSyncRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'industrial-maintenance-pwa'
  };

  const envToken = process.env.NEXT_PUBLIC_SYNC_API_TOKEN;
  const localToken = typeof window !== 'undefined' ? window.localStorage.getItem('industrial_sync_token') : null;
  const token = localToken || envToken;

  if (token) {
    headers['X-Sync-Token'] = token;
  }

  return headers;
}
