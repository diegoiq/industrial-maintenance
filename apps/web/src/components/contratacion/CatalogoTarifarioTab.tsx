'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Save, Search, Trash2, Edit3, CheckCircle2 } from 'lucide-react';
import {
  CatalogoMaterialItem,
  CategoriaMaterial,
  ComplejidadCaldereria,
  TarifarioIntervencion
} from '../../types/computo';

interface CatalogoTarifarioTabProps {
  catalogo: CatalogoMaterialItem[];
  tarifario: TarifarioIntervencion;
  onCatalogoChange: (items: CatalogoMaterialItem[]) => void;
  onTarifarioChange: (next: TarifarioIntervencion) => void;
}

const CATEGORIAS: CategoriaMaterial[] = [
  'PERFIL',
  'CANO',
  'CHAPA_GRATING',
  'BARANDA_ESCALERA',
  'SOPORTERIA',
  'CIVIL_HORMIGON'
];

export function CatalogoTarifarioTab({
  catalogo,
  tarifario,
  onCatalogoChange,
  onTarifarioChange
}: CatalogoTarifarioTabProps) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('ALL');
  const [editingItem, setEditingItem] = useState<CatalogoMaterialItem | null>(null);
  const [isSavingMat, setIsSavingMat] = useState(false);
  const [isSavingTarif, setIsSavingTarif] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [localTarif, setLocalTarif] = useState<TarifarioIntervencion>(tarifario);

  const filtered = useMemo(() => {
    return catalogo.filter((c) => {
      if (catFilter !== 'ALL' && c.categoria !== catFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return c.codigo.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q);
      }
      return true;
    });
  }, [catalogo, catFilter, search]);

  const startNewMaterial = () => {
    setEditingItem({
      codigo: '',
      categoria: 'PERFIL',
      descripcion: '',
      unidad: 'm',
      peso_unitario_kg: 10,
      presentacion_comercial: 'Barra 6 m',
      factor_comercial: 6,
      complejidad_default: 'ESTRUCTURAL',
      precio_ref_material: 2.3,
      activo: true
    });
  };

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.codigo.trim() || !editingItem.descripcion.trim()) return;
    setIsSavingMat(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/catalogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingItem)
      });
      const json = await res.json();
      if (res.ok && json.success && json.item) {
        const idx = catalogo.findIndex((c) => c.codigo === json.item.codigo);
        const next =
          idx >= 0
            ? catalogo.map((c) => (c.codigo === json.item.codigo ? json.item : c))
            : [...catalogo, json.item];
        onCatalogoChange(next);
        setEditingItem(null);
        setStatusMsg(`✅ Material ${json.item.codigo} guardado en Neon.`);
      } else {
        setStatusMsg(`Error: ${json.error || 'No se pudo guardar'}`);
      }
    } finally {
      setIsSavingMat(false);
    }
  };

  const handleDeleteMaterial = async (codigo: string) => {
    if (!window.confirm(`¿Eliminar ${codigo} del Catálogo Maestro?`)) return;
    const res = await fetch(`/api/catalogo?codigo=${encodeURIComponent(codigo)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      onCatalogoChange(catalogo.filter((c) => c.codigo !== codigo));
    }
  };

  const handleSaveTarifario = async () => {
    setIsSavingTarif(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/tarifario', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tarifario: localTarif })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        onTarifarioChange(json.tarifario);
        setStatusMsg('✅ Tarifario Schedule of Rates actualizado en Neon.');
      } else {
        setStatusMsg(`Error: ${json.error || 'No se pudo guardar tarifario'}`);
      }
    } finally {
      setIsSavingTarif(false);
    }
  };

  const updateTarifField = (key: keyof TarifarioIntervencion, val: any) => {
    setLocalTarif((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <div className="space-y-6">
      {statusMsg && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* SECCIÓN 1: CATÁLOGO MAESTRO VIVO */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-white">
              Catálogo Maestro de Materiales (Neon PostgreSQL)
            </h3>
            <p className="text-xs text-slate-400">
              Pesos teóricos y presentaciones comerciales. Se sincroniza offline a /campo.
            </p>
          </div>
          <button
            type="button"
            onClick={startNewMaterial}
            className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Material / Perfil</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código o descripción..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
          >
            <option value="ALL">Todas las categorías ({catalogo.length})</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {editingItem && (
          <form
            onSubmit={handleSaveMaterial}
            className="bg-slate-950 border border-amber-500/40 rounded-xl p-4 space-y-3 text-xs"
          >
            <h4 className="font-bold text-amber-400 uppercase">
              {editingItem.id ? `Editar ${editingItem.codigo}` : 'Alta de Nuevo Material'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Código *</label>
                <input
                  required
                  type="text"
                  value={editingItem.codigo}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, codigo: e.target.value.toUpperCase() })
                  }
                  placeholder="Ej: INOX_2_S10"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-slate-400 block mb-1">Descripción *</label>
                <input
                  required
                  type="text"
                  value={editingItem.descripcion}
                  onChange={(e) => setEditingItem({ ...editingItem, descripcion: e.target.value })}
                  placeholder="Ej: Caño Inox 316L 2&quot; Sch10"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Categoría</label>
                <select
                  value={editingItem.categoria}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      categoria: e.target.value as CategoriaMaterial
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Unidad</label>
                <select
                  value={editingItem.unidad}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      unidad: e.target.value as CatalogoMaterialItem['unidad']
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="m">m</option>
                  <option value="m2">m2</option>
                  <option value="u">u</option>
                  <option value="dm3">dm3</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Peso Unit. (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={editingItem.peso_unitario_kg}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, peso_unitario_kg: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Presentación Comercial</label>
                <input
                  type="text"
                  value={editingItem.presentacion_comercial}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, presentacion_comercial: e.target.value })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Factor Comercial</label>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={editingItem.factor_comercial}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, factor_comercial: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Complejidad Default</label>
                <select
                  value={editingItem.complejidad_default}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      complejidad_default: e.target.value as ComplejidadCaldereria
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="LIVIANO">LIVIANO</option>
                  <option value="ESTRUCTURAL">ESTRUCTURAL</option>
                  <option value="CANERIA">CANERIA</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Precio Ref. Material</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={editingItem.precio_ref_material ?? 0}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, precio_ref_material: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingMat}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 text-black font-black"
              >
                {isSavingMat ? 'Guardando...' : 'Guardar Material'}
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0">
              <tr>
                <th className="p-2.5">Código</th>
                <th className="p-2.5">Categoría</th>
                <th className="p-2.5">Descripción</th>
                <th className="p-2.5">Peso Unit.</th>
                <th className="p-2.5">Presentación</th>
                <th className="p-2.5">Complejidad</th>
                <th className="p-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((m) => (
                <tr key={m.codigo} className="hover:bg-slate-950/60">
                  <td className="p-2.5 font-mono font-bold text-amber-400">{m.codigo}</td>
                  <td className="p-2.5 text-slate-400">{m.categoria}</td>
                  <td className="p-2.5 text-white font-medium">{m.descripcion}</td>
                  <td className="p-2.5 font-mono text-emerald-300">
                    {m.peso_unitario_kg} kg/{m.unidad}
                  </td>
                  <td className="p-2.5 text-slate-300">
                    {m.presentacion_comercial} (×{m.factor_comercial})
                  </td>
                  <td className="p-2.5 font-mono text-[11px]">{m.complejidad_default}</td>
                  <td className="p-2.5 text-right space-x-1">
                    <button
                      type="button"
                      onClick={() => setEditingItem(m)}
                      className="p-1 text-sky-400 hover:bg-sky-950/50 rounded"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMaterial(m.codigo)}
                      className="p-1 text-red-400 hover:bg-red-950/50 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECCIÓN 2: TARIFARIO EDITABLE (SCHEDULE OF RATES) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-black text-white">
              Tarifario Base (Schedule of Rates)
            </h3>
            <p className="text-xs text-slate-400">
              Precios unitarios referenciales por disciplina para presupuestación interna.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={localTarif.moneda}
              onChange={(e) => updateTarifField('moneda', e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
            >
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
            <button
              type="button"
              disabled={isSavingTarif}
              onClick={handleSaveTarifario}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center space-x-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{isSavingTarif ? 'Guardando...' : 'Guardar Tarifario'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {/* 1. Pintura */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
            <h4 className="font-bold text-amber-400 uppercase">1. Pintura ({localTarif.moneda}/m²)</h4>
            {(
              [
                ['pintura_st3_parcheo_m2', 'St 3 Parcheo / m²'],
                ['pintura_st3_integral_m2', 'St 3 Integral / m²'],
                ['pintura_sa25_integral_m2', 'Sa 2½ Integral / m²'],
                ['pintura_uhp_integral_m2', 'UHP Integral / m²'],
                ['pintura_overcoat_m2', 'Overcoat / m²'],
                ['factor_solape_parcheo', 'Factor Solape Parcheo']
              ] as [keyof TarifarioIntervencion, string][]
            ).map(([k, label]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <span className="text-slate-300">{label}</span>
                <input
                  type="number"
                  step="0.1"
                  value={localTarif[k] as number}
                  onChange={(e) => updateTarifField(k, Number(e.target.value))}
                  className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-mono text-white"
                />
              </div>
            ))}
          </div>

          {/* 2. Accesos */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
            <h4 className="font-bold text-sky-400 uppercase">2. Accesos y Andamios</h4>
            {(
              [
                ['andamio_armado_0_6m_m3', 'Armado 0–6m (/m³)'],
                ['andamio_armado_6_12m_m3', 'Armado 6–12m (/m³)'],
                ['andamio_armado_mas_12m_m3', 'Armado >12m (/m³)'],
                ['andamio_alquiler_m3_dia', 'Alquiler (/m³·día)'],
                ['andamio_recargo_interferencia', 'Recargo Interferencia (×)'],
                ['torre_movil_armado_u', 'Torre Móvil Armado (/u)'],
                ['torre_movil_dia', 'Torre Móvil Día (/día)'],
                ['pem_tijera_jornada', 'PEM Tijera (/jornada)'],
                ['pem_brazo_jornada', 'PEM Brazo Art. (/jornada)']
              ] as [keyof TarifarioIntervencion, string][]
            ).map(([k, label]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <span className="text-slate-300">{label}</span>
                <input
                  type="number"
                  step="0.05"
                  value={localTarif[k] as number}
                  onChange={(e) => updateTarifField(k, Number(e.target.value))}
                  className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-mono text-white"
                />
              </div>
            ))}
          </div>

          {/* 3. Calderería, Civil y Generales */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
            <h4 className="font-bold text-emerald-400 uppercase">3. Calderería, Civil y Grales.</h4>
            {(
              [
                ['acero_material_kg', 'Acero Material Ref. (/kg)'],
                ['caldereria_mo_liviano_kg', 'MO Calderería Liviano (/kg)'],
                ['caldereria_mo_estructural_kg', 'MO Calderería Estruct. (/kg)'],
                ['caldereria_mo_caneria_kg', 'MO Cañería (/kg)'],
                ['desperdicio_metalico_pct', 'Desperdicio Metálico (%)'],
                ['civil_mortero_dm3', 'Civil Mortero (/dm³)'],
                ['civil_junta_ml', 'Civil Junta (/ml)'],
                ['civil_fisura_ml', 'Civil Fisura (/ml)'],
                ['civil_revestimiento_m2', 'Civil Revestimiento (/m²)'],
                ['movilizacion_suma_alzada', 'Movilización (Suma Alzada)'],
                ['bolsa_hh_contingencia_pct', 'Bolsa HH Contingencia (%)']
              ] as [keyof TarifarioIntervencion, string][]
            ).map(([k, label]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <span className="text-slate-300">{label}</span>
                <input
                  type="number"
                  step="0.1"
                  value={localTarif[k] as number}
                  onChange={(e) => updateTarifField(k, Number(e.target.value))}
                  className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-mono text-white"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
