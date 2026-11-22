'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  HardHat,
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Smartphone,
  MonitorCheck,
  Loader2
} from 'lucide-react';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next') || '';

  const [nombre, setNombre] = useState('');
  const [clave, setClave] = useState('');
  const [showClave, setShowClave] = useState(false);
  const [destinoPreferido, setDestinoPreferido] = useState<'/ingenieria/planos' | '/campo'>(
    nextParam.startsWith('/campo') ? '/campo' : '/ingenieria/planos'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim() || (destinoPreferido === '/campo' ? 'Inspector de Campo' : 'Ingeniería de Planta'),
          clave,
          destino: nextParam || destinoPreferido
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Clave de acceso incorrecta.');
        setIsLoading(false);
        return;
      }

      if (typeof window !== 'undefined' && data.user) {
        window.localStorage.setItem('im_user_profile', JSON.stringify(data.user));
      }

      router.push(data.redirectTo || destinoPreferido);
      router.refresh();
    } catch {
      setError('Error de conexión con el servidor de autenticación.');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-slate-900/95 border-2 border-amber-500/60 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md">
      {/* Cabecera */}
      <div className="bg-slate-950 px-6 py-5 border-b border-slate-800 text-center space-y-2">
        <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center text-black mx-auto shadow-lg shadow-amber-500/20">
          <HardHat className="w-7 h-7" />
        </div>
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400 block">
            ACCESO PROTEGIDO · PLANTA INDUSTRIAL
          </span>
          <h1 className="text-xl font-black text-white tracking-tight mt-0.5">
            INDUSTRIAL <span className="text-amber-500">MAINTENANCE</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Integridad de Activos, Planos Georreferenciados y Relevamiento ISO 4628
          </p>
        </div>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
        {error && (
          <div className="p-3 bg-red-950/90 border border-red-500/70 rounded-xl text-red-200 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {/* Selector de Entorno al Ingresar */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
            1. Entorno de Trabajo
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDestinoPreferido('/ingenieria/planos')}
              className={`p-2.5 rounded-xl border text-left transition flex items-center space-x-2 ${
                destinoPreferido === '/ingenieria/planos'
                  ? 'bg-sky-500/20 border-sky-400 text-white font-bold shadow'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <MonitorCheck className="w-4 h-4 text-sky-400 flex-shrink-0" />
              <div>
                <span className="block text-xs">Ingeniería</span>
                <span className="text-[10px] text-slate-400 font-normal">Planos & ERP</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDestinoPreferido('/campo')}
              className={`p-2.5 rounded-xl border text-left transition flex items-center space-x-2 ${
                destinoPreferido === '/campo'
                  ? 'bg-amber-500/20 border-amber-400 text-white font-bold shadow'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <div>
                <span className="block text-xs">App Campo</span>
                <span className="text-[10px] text-slate-400 font-normal">Celular / GPS</span>
              </div>
            </button>
          </div>
        </div>

        {/* Nombre del Operador / Ingeniero */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
            2. Nombre del Ingeniero / Inspector
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Ing. Diego / Inspector Turno A"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-white text-xs focus:border-amber-400 focus:outline-none"
            />
          </div>
          <span className="text-[10px] text-slate-500 block">
            Quedará registrado en las inspecciones y en el Informe Preliminar.
          </span>
        </div>

        {/* Clave / PIN de Planta */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
            3. Clave de Seguridad / PIN de Planta *
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type={showClave ? 'text' : 'password'}
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              placeholder="Ingresa la clave de acceso..."
              required
              autoFocus
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-10 py-2.5 text-white font-mono text-sm focus:border-amber-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowClave(!showClave)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              tabIndex={-1}
            >
              {showClave ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !clave.trim()}
          className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center justify-center space-x-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verificando Credencial...</span>
            </>
          ) : (
            <>
              <span>Ingresar a la Plataforma</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-center space-x-1.5 text-[10px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span>Sesión cifrada HMAC-SHA256 · Persistente 30 días para trabajo Offline</span>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-[#0b0f19] to-slate-950 flex flex-col items-center justify-center p-4 text-white">
      <Suspense fallback={<div className="text-xs text-slate-400 font-mono">Cargando control de acceso...</div>}>
        <LoginFormContent />
      </Suspense>
    </main>
  );
}
