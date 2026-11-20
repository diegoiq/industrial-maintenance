'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Map, 
  Layers, 
  Sliders, 
  CalendarDays, 
  Server, 
  Smartphone, 
  HardHat, 
  ShieldCheck, 
  FileSpreadsheet,
  Sparkles,
  DollarSign
} from 'lucide-react';

export default function IngenieriaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'ingeniero' | 'inspector' | 'consulta'>('admin');

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Barra Lateral Técnica Desktop */}
      <aside className="w-64 bg-[#0d1322] border-r border-slate-800 flex flex-col justify-between p-4 flex-shrink-0">
        <div className="space-y-6">
          {/* Logo y Nombre del Sistema */}
          <Link href="/" className="flex items-center space-x-3 px-2 py-1">
            <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center text-black font-black">
              <HardHat className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight leading-none text-white">INDUSTRIAL</h1>
              <span className="text-[11px] font-mono font-bold text-amber-400">MAINTENANCE</span>
            </div>
          </Link>

          {/* Selector de Rol simulado para auditoría y RLS */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>ROL ACTIVO:</span>
              <span className="font-mono text-emerald-400 font-bold uppercase">{currentUserRole}</span>
            </div>
            <select
              value={currentUserRole}
              onChange={(e) => setCurrentUserRole(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 text-xs rounded p-1 text-slate-200 focus:outline-none"
            >
              <option value="admin">Admin (Acceso total & Telemetría)</option>
              <option value="ingeniero">Ingeniero (Validación & Planos)</option>
              <option value="inspector">Inspector (Carga en campo)</option>
              <option value="consulta">Consulta (Solo lectura)</option>
            </select>
          </div>

          {/* Menú de Navegación Completo */}
          <nav className="space-y-1">
            <span className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Módulos de Ingeniería
            </span>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                    isActive
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-500'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="block text-slate-200 truncate">{item.name}</span>
                    <span className="text-[10px] text-slate-500 block font-normal truncate">{item.description}</span>
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Enlace Directo a App de Campo */}
          <div className="pt-2">
            <span className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Acceso a Planta
            </span>
            <Link
              href="/campo"
              className="flex items-center space-x-3 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs font-semibold transition"
            >
              <Smartphone className="w-4 h-4 text-amber-400" />
              <span>Abrir App de Campo</span>
            </Link>
          </div>
        </div>

        {/* Pie de barra lateral */}
        <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-500 space-y-1">
          <div className="flex items-center justify-between">
            <span>Render Engine:</span>
            <span className="text-emerald-400 font-mono">En Línea (512 MB)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Supabase DB:</span>
            <span className="text-emerald-400 font-mono">Conectado</span>
          </div>
        </div>
      </aside>

      {/* Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
