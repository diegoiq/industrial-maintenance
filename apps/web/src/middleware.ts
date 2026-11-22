import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Permitir archivos estáticos, _next, rutas de auth y la pantalla de login
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/login' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  // Si no hay sesión válida
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'No autorizado. Inicie sesión con su clave de planta.' },
        { status: 401 }
      );
    }

    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Control de Acceso Basado en Roles (RBAC):
  // Un usuario con PIN exclusivo de 'inspector' no puede borrar registros maestros en la nube
  if (session.rol === 'inspector') {
    if (pathname.startsWith('/api/sync-neon') && req.method === 'DELETE') {
      return NextResponse.json(
        { success: false, error: 'Permiso insuficiente: solo Ingeniería/Admin puede eliminar zonas o planos.' },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/campo/:path*',
    '/ingenieria/:path*',
    '/api/sync-neon/:path*',
    '/api/media/:path*'
  ]
};
