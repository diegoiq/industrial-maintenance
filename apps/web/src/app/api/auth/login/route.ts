import { NextRequest, NextResponse } from 'next/server';
import {
  signSessionToken,
  SESSION_COOKIE_NAME,
  USER_INFO_COOKIE_NAME,
  SessionPayload
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clave, nombre, destino } = body as {
      clave?: string;
      nombre?: string;
      destino?: string;
    };

    const cleanClave = (clave || '').trim();
    const cleanNombre = (nombre || '').trim() || 'Ingeniería Planta';

    if (!cleanClave) {
      return NextResponse.json(
        { success: false, error: 'Ingresa la clave o PIN de acceso de planta.' },
        { status: 400 }
      );
    }

    // Claves configurables por variables de entorno en Vercel/.env.local con valores por defecto seguros de planta
    const adminKey = (process.env.PLANT_ADMIN_KEY || 'PLANTA2026').trim();
    const fieldKey = (process.env.PLANT_FIELD_KEY || 'CAMPO2026').trim();

    let rol: 'admin' | 'inspector' | null = null;

    if (cleanClave === adminKey) {
      rol = 'admin';
    } else if (cleanClave === fieldKey) {
      rol = 'inspector';
    }

    if (!rol) {
      // Pequeña pausa defensiva contra fuerza bruta
      await new Promise(r => setTimeout(r, 450));
      return NextResponse.json(
        { success: false, error: 'Clave o PIN de planta incorrecto. Acceso denegado.' },
        { status: 401 }
      );
    }

    const now = Date.now();
    const maxAgeSeconds = 60 * 60 * 24 * 30; // 30 días de sesión persistente para operación en campo

    const payload: SessionPayload = {
      nombre: cleanNombre,
      rol,
      iat: now,
      exp: now + maxAgeSeconds * 1000
    };

    const token = await signSessionToken(payload);
    const isProd = process.env.NODE_ENV === 'production';

    const defaultRedirect = rol === 'inspector' ? '/campo' : '/ingenieria/planos';
    const safeRedirect =
      destino && destino.startsWith('/') && !destino.startsWith('//') && destino !== '/login'
        ? (rol === 'inspector' && destino.startsWith('/ingenieria') ? '/campo' : destino)
        : defaultRedirect;

    const res = NextResponse.json({
      success: true,
      user: {
        nombre: cleanNombre,
        rol
      },
      redirectTo: safeRedirect
    });

    // Cookie criptográfica HttpOnly (no accesible por scripts XSS)
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSeconds
    });

    // Cookie informativa ligera para mostrar el nombre del inspector/ingeniero en la UI
    res.cookies.set(
      USER_INFO_COOKIE_NAME,
      encodeURIComponent(JSON.stringify({ nombre: cleanNombre, rol })),
      {
        httpOnly: false,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: maxAgeSeconds
      }
    );

    return res;
  } catch (err) {
    console.error('Error en login:', err);
    return NextResponse.json(
      { success: false, error: 'Error procesando autenticación.' },
      { status: 500 }
    );
  }
}
