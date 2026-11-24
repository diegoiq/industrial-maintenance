import { NextRequest, NextResponse } from 'next/server';
import { getSignedB2Url } from '@/lib/b2';

export const dynamic = 'force-dynamic';

const SAFE_B2_KEY_REGEX = /^(planos|inspecciones|hitos)\/[a-zA-Z0-9_:-]+(?:\/[a-zA-Z0-9_.-]+)?\.[a-z0-9]+$/;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');

  if (!key || key.includes('..') || !SAFE_B2_KEY_REGEX.test(key)) {
    return NextResponse.json(
      { success: false, error: 'Clave de archivo inválida.' },
      { status: 400 }
    );
  }

  try {
    const signedUrl = await getSignedB2Url(key, 3600);
    const res = NextResponse.redirect(signedUrl, 302);
    res.headers.set('Cache-Control', 'private, max-age=3000');
    return res;
  } catch (err) {
    console.error('Error generando URL firmada de Backblaze B2:', err);
    return NextResponse.json(
      { success: false, error: 'No se pudo obtener el archivo desde Backblaze B2.' },
      { status: 500 }
    );
  }
}
