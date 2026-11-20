'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Map, 
  Sliders, 
  CalendarDays, 
  Server, 
  Smartphone, 
  HardHat, 
  FileSpreadsheet,
  Sparkles,
  Menu,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export default function IngenieriaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'ingeniero' | 'inspector' | 'consulta'>('admin');
  
  // Por defecto colapsado a Icon Rail en /ingenieria/planos para maximizar el canvas
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const navItems = [
    {
      name: 'Planos y Planta',
      href: '/ingenieria/planos',
      icon: Map,
      description: 'Visor SVG y semáforo de activos'
    },
    {
      name: 'Parámetros y Cubicaciones',
      href: '/ingenieria/parametros',
      icon: Sliders,
      description: 'Matriz de criticidad y coeficientes'
    },
    {
      name: 'Campañas y Andamios',
      href: '/ingenieria/campanas',
      icon: CalendarDays,
      description: 'Optimización de andamio compartido'
    },
    {
      name: 'Presupuestos y SAP PM',
      href: '/ingenieria/presupuestos',
      icon: FileSpreadsheet,
      description: 'Plan plurianual y exportación ERP'
    },
    {
      name: 'Diagnóstico IA (Gemini)',
      href: '/ingenieria/diagnostico-ia',
      icon: Sparkles,
      description: 'Human-in-the-loop y comparador'
    },
    {
      name: 'Monitor de Infraestructura',
      href: '/ingenieria/sistema',
      icon: Server,
      description: 'Límites Render & Supabase (Admin)',
      adminOnly: true
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex relative overflow-hidden">
      {/* Botón flotante para abrir menú en móvil si está cerrado */}
      <div className="lg:hidden fixed top-2 left-2 z-50">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-1.5 bg-slate-900/90 text-amber-400 hover:text-white rounded-lg border border-slate-700 shadow-lg backdrop-blur"
          aria-label="Abrir menú"
        >
          {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Overlay Backdrop para móvil */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
        />
      )}

      {/* Barra Lateral Técnica */}
      <aside 
        className={`
          fixed lg:static top-0 bottom-0 left-0 z-40 bg-[#0d1322] border-r border-slate-800 flex flex-col justify-between transition-all duration-200 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0 w-64 p-4' : '-translate-x-full lg:translate-x-0'}
          ${!isMobileMenuOpen ? (isSidebarCollapsed ? 'lg:w-16 lg:p-2' : 'lg:w-60 lg:p-4') : ''}
        `}
      >
        <div className="space-y-4">
          {/* Logo y Botón Colapsar */}
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-black font-black flex-shrink-0">
                <HardHat className="w-4 h-4" />
              </div>
              {(!isSidebarCollapsed || isMobileMenuOpen) && (
                <div className="min-w-0">
                  <h1 className="text-xs font-black tracking-tight leading-none text-white truncate">INDUSTRIAL</h1>
                  <span className="text-[10px] font-mono font-bold text-amber-400">MAINTENANCE</span>
                </div>
              )}
            </Link>

            {/* Toggle collapse en Desktop */}
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden lg:flex p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
              title={isSidebarCollapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
            >
              {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Selector de Rol simulado */}
          {(!isSidebarCollapsed || isMobileMenuOpen) ? (
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 space-y-1">
              <div className="flex items-center justify-between text-[9px] text-slate-400">
                <span>ROL ACTIVO:</span>
                <span className="font-mono text-emerald-400 font-bold uppercase">{currentUserRole}</span>
              </div>
              <select
                value={currentUserRole}
                onChange={(e) => setCurrentUserRole(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 text-[11px] rounded p-1 text-slate-200 focus:outline-none"
              >
                <option value="admin">Admin (Total)</option>
                <option value="ingeniero">Ingeniero</option>
                <option value="inspector">Inspector</option>
                <option value="consulta">Consulta</option>
              </select>
            </div>
          ) : (
            <div className="hidden lg:flex justify-center" title={`Rol: ${currentUserRole}`}>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 my-1 animate-pulse" />
            </div>
          )}

          {/* Navegación */}
          <nav className="space-y-1">
            {(!isSidebarCollapsed || isMobileMenuOpen) && (
              <span className="px-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Módulos
              </span>
            )}
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={isSidebarCollapsed && !isMobileMenuOpen ? item.name : undefined}
                  className={`flex items-center rounded-lg text-xs font-semibold transition ${
                    isSidebarCollapsed && !isMobileMenuOpen
                      ? 'justify-center p-2'
                      : 'space-x-3 px-2.5 py-1.5'
                  } ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-500'}`} />
                  {(!isSidebarCollapsed || isMobileMenuOpen) && (
                    <div className="flex-1 min-w-0">
                      <span className="block text-slate-200 truncate">{item.name}</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Enlace Directo a App de Campo */}
          <div className="pt-1">
            <Link
              href="/campo"
              title="Abrir App de Campo"
              className={`flex items-center bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs font-semibold transition ${
                isSidebarCollapsed && !isMobileMenuOpen ? 'justify-center p-2' : 'space-x-2 px-2.5 py-1.5'
              }`}
            >
              <Smartphone className="w-4 h-4 text-amber-400 flex-shrink-0" />
              {(!isSidebarCollapsed || isMobileMenuOpen) && <span>App de Campo</span>}
            </Link>
          </div>
        </div>

        {/* Telemetría Cloud */}
        {(!isSidebarCollapsed || isMobileMenuOpen) && (
          <div className="border-t border-slate-800 pt-2 text-[10px] text-slate-500 space-y-0.5">
            <div className="flex items-center justify-between">
              <span>Stack Cloud:</span>
              <span className="text-emerald-400 font-mono">Vercel Edge</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Almacenamiento:</span>
              <span className="text-emerald-400 font-mono">Neon + B2</span>
            </div>
          </div>
        )}
      </aside>

      {/* Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {children}
      </div>
    </div>
  );
}
