'use client';

import React from 'react';
import Link from 'next/link';
import { Smartphone, MonitorCheck, ShieldCheck, Database, Layers, Wrench, HardHat, Server } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-[#0b0f19] to-slate-950 flex flex-col items-center justify-center p-6 text-white">
      <div className="max-w-4xl w-full space-y-8">
        {/* Banner institucional */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-semibold">
            <HardHat className="w-4 h-4" />
            <span>USO INTERNO DE PLANTA INDUSTRIAL</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            INDUSTRIAL <span className="text-amber-500">MAINTENANCE</span>
          </h1>
          <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto">
            Plataforma de Integridad de Activos, Gestión de Corrosión ISO 4628 y Planificación de Mantenimiento con soporte Offline e infraestructura optimizada.
          </p>
        </div>

        {/* Selector de Entorno Dual */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          {/* Tarjeta Entorno Campo (Mobile-First / PWA) */}
          <Link
            href="/campo"
            className="group relative bg-slate-900 border-2 border-amber-500/50 hover:border-amber-400 rounded-2xl p-6 transition-all hover:scale-[1.02] shadow-xl hover:shadow-amber-500/10 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Smartphone className="w-7 h-7" />
              </div>
              <div>
                <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider block">
                  Rol: Inspector de Campo
                </span>
                <h2 className="text-2xl font-bold text-white group-hover:text-amber-300 transition">
                  App de Campo (/campo)
                </h2>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Entorno móvil de alto contraste optimizado para planta. 100% offline con Dexie.js, compresión WebP automática en cliente, escaneo QR y anotación de deterioros sobre fotos.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-2">
                <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 font-mono">IndexedDB</span>
                <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 font-mono">WebP ~180KB</span>
                <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 font-mono">Offline-First</span>
                <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 font-mono">SyncManager</span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-bold text-amber-400">
              <span>Ingresar al modo inspección</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </Link>

          {/* Tarjeta Entorno Ingeniería (Desktop) */}
          <Link
            href="/ingenieria/planos"
            className="group relative bg-slate-900 border-2 border-sky-500/50 hover:border-sky-400 rounded-2xl p-6 transition-all hover:scale-[1.02] shadow-xl hover:shadow-sky-500/10 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                <MonitorCheck className="w-7 h-7" />
              </div>
              <div>
                <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-wider block">
                  Rol: Ingeniero / Admin / Supervisión
                </span>
                <h2 className="text-2xl font-bold text-white group-hover:text-sky-300 transition">
                  Panel de Ingeniería (/ingenieria)
                </h2>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Visor interactivo de planos SVG con polígonos de zonas y pines con semáforo dinámico. Cálculo de cubicaciones, campañas de andamios y monitor preventivo de infraestructura.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-2">
                <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 font-mono">SVG Interactivo</span>
                <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 font-mono">Etiquetas QR</span>
                <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 font-mono">Telemetría Free Tier</span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-bold text-sky-400">
              <span>Abrir consola técnica de ingeniería</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </Link>
        </div>

        {/* Acceso directo a Módulo de Infraestructura */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-3">
            <Server className="w-5 h-5 text-purple-400 flex-shrink-0" />
            <div>
              <span className="font-bold text-white block">Monitor de Salud y Límites de Infraestructura (/ingenieria/sistema)</span>
              <span className="text-slate-400">Control preventivo de cuotas Supabase (500MB DB, 1GB Storage) y Render (512MB RAM).</span>
            </div>
          </div>
          <Link
            href="/ingenieria/sistema"
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold whitespace-nowrap transition"
          >
            Ver Telemetría
          </Link>
        </div>
      </div>
    </main>
  );
}
