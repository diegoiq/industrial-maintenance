/**
 * Sistema de Autenticación Criptográfica HMAC-SHA256 (Edge & Node.js Compatible)
 * Protege todas las rutas web (/ingenieria, /campo) y la API (/api/sync-neon)
 * mediante cookies HttpOnly firmadas sin dependencias externas.
 */

import { NextRequest } from 'next/server';

export const SESSION_COOKIE_NAME = 'im_session';
export const USER_INFO_COOKIE_NAME = 'im_user';

export interface SessionPayload {
  nombre: string;
  rol: 'admin' | 'ingeniero' | 'inspector';
  iat: number;
  exp: number;
}

function getAuthSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    'industrial-maintenance-default-hmac-secret-2026-celulosa'
  );
}

function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  const encoder = new TextEncoder();
  const jsonStr = JSON.stringify(payload);
  const payloadB64 = bufferToBase64Url(encoder.encode(jsonStr));

  const key = await getCryptoKey(getAuthSecret());
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const signatureB64 = bufferToBase64Url(signatureBuffer);

  return `${payloadB64}.${signatureB64}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signatureB64] = parts;
  try {
    const encoder = new TextEncoder();
    const key = await getCryptoKey(getAuthSecret());
    const sigBytes = base64UrlToUint8Array(signatureB64);

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as unknown as BufferSource,
      encoder.encode(payloadB64)
    );
    if (!isValid) {
      console.warn('[auth] Firma HMAC inválida en token');
      return null;
    }

    const payloadBytes = base64UrlToUint8Array(payloadB64);
    const jsonStr = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(jsonStr) as SessionPayload;

    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch (err) {
    console.error('[auth] Error verificando token:', err);
    return null;
  }
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}
