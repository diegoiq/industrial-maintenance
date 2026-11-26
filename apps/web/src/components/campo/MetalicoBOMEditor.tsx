'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Search, Wrench } from 'lucide-react';
import {
  AccionMetalico,
  CatalogoMaterialItem,
  CategoriaMaterial,
  ClasificacionAlcance,
  ItemMetalicoBOM,
  ProvisionMaterial
} from '../../types/computo';

interface MetalicoBOMEditorProps {
  items: ItemMetalicoBOM[];
  catalogo: CatalogoMaterialItem[];
  onChange: (next: ItemMetalicoBOM[]) => void;
  defaultClasificacion?: ClasificacionAlcance;
}

const CATEGORIAS_METALICAS: { value: Exclude<CategoriaMaterial, 'CIVIL_HORMIGON'>; label: string }[] = [
  { value: 'PERFIL', label: 'Perfiles (UPN/IPN/L)' },
  { value: 'CANO', label: 'Caños ASTM' },
  { value: 'CHAPA_GRATING', label: 'Chapas / Grating' },
  { value: 'BARANDA_ESCALERA', label: 'Barandas / Escaleras' },
  { value: 'SOPORTERIA', label: 'Soportería' }
];

export function MetalicoBOMEditor({
  items,
  catalogo,
  onChange,
  defaultClasificacion = 'CRITICO'
}: MetalicoBOMEditorProps) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('ALL');
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [largoM, setLargoM] = useState<number>(3);
  const [anchoM, setAnchoM] = useState<number>(1);
  const [cantidad, setCantidad] = useState<number>(1);
  const [accion, setAccion] = useState<AccionMetalico>('REEMPLAZO_TOTAL');
  const [clasificacion, setClasificacion] = useState<ClasificacionAlcance>(defaultClasificacion);
  const [provision, setProvision] = useState<ProvisionMaterial>('CONTRATISTA');
  const [nota, setNota] = useState('');

  const metalCatalog = useMemo(
    () =>
      catalogo.filter((c) => {
        if (c.categoria === 'CIVIL_HORMIGON' || !c.activo) return false;
        if (catFilter !== 'ALL' && c.categoria !== catFilter) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          return c.codigo.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q);
        }
        return true;
      }),
    [catalogo, catFilter, search]
  );

  const selectedMat = useMemo(
    () => catalogo.find((c) => c.codigo === selectedCode) || metalCatalog[0],
    [catalogo, selectedCode, metalCatalog]
  );

  const computePesoTotal = (
    mat: CatalogoMaterialItem,
    qty: number,
    l?: number,
    a?: number
  ): number => {
    const base =
      mat.unidad === 'm'
        ? (l || 1) * qty
        : mat.unidad === 'm2'
        ? (l || 1) * (a || 1) * qty
        : qty;
    return Math.round(base * (mat.peso_unitario_kg || 0) * 100) / 100;
  };

  const handleAddLine = () => {
    if (!selectedMat || selectedMat.categoria === 'CIVIL_HORMIGON') return;
    const l = selectedMat.unidad === 'm' || selectedMat.unidad === 'm2' ? Math.max(0.1, largoM) : undefined;
    const a = selectedMat.unidad === 'm2' ? Math.max(0.1, anchoM) : undefined;
    const qty = Math.max(1, cantidad);
    const pesoTotal = computePesoTotal(selectedMat, qty, l, a);

    const newItem: ItemMetalicoBOM = {
      id: `bom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      categoria: selectedMat.categoria,
      codigo_catalogo: selectedMat.codigo,
      descripcion: selectedMat.descripcion,
      unidad: selectedMat.unidad === 'dm3' ? 'u' : selectedMat.unidad,
      largo_m: l,
      ancho_m: a,
      cantidad: qty,
      peso_unitario_kg: selectedMat.peso_unitario_kg,
      peso_total_kg: pesoTotal,
      complejidad: selectedMat.complejidad_default,
      accion,
      clasificacion,
      provision,
      nota: nota.trim() || undefined
    };

    onChange([...items, newItem]);
    setNota('');
  };

  const handleUpdateLine = (id: string, patch: Partial<ItemMetalicoBOM>) => {
    onChange(
      items.map((it) => {
        if (it.id !== id) return it;
        const merged = { ...it, ...patch };
        const base =
          merged.unidad === 'm'
            ? (merged.largo_m || 1) * merged.cantidad
            : merged.unidad === 'm2'
            ? (merged.largo_m || 1) * (merged.ancho_m || 1) * merged.cantidad
            : merged.cantidad;
        merged.peso_total_kg = Math.round(base * (merged.peso_unitario_kg || 0) * 100) / 100;
        return merged;
      })
    );
  };

  const handleRemoveLine = (id: string) => {
    onChange(items.filter((it) => it.id !== id));
  };

  const totalPeso = items.reduce((acc, it) => acc + (it.peso_total_kg || 0), 0);

  return (
    <div className="space-y-3 text-xs">
      {/* Buscador y alta de línea */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-amber-300 flex items-center space-x-1.5">
            <Wrench className="w-3.5 h-3.5" />
            <span>Agregar Material del Catálogo Maestro</span>
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            Peso BOM: <strong className="text-white">{totalPeso.toFixed(1)} kg</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar perfil, caño, chapa..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-2 py-1.5 text-white"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white"
          >
            <option value="ALL">Todas las categorías metálicas</option>
            {CATEGORIAS_METALICAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <select
          value={selectedMat?.codigo || ''}
          onChange={(e) => setSelectedCode(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-semibold"
        >
          {metalCatalog.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.codigo} — {m.descripcion} ({m.peso_unitario_kg} kg/{m.unidad})
            </option>
          ))}
        </select>

        {selectedMat && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
            {(selectedMat.unidad === 'm' || selectedMat.unidad === 'm2') && (
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">Largo (m)</span>
                <input
                  type="number"
                  step="0.1"
                  min={0.1}
                  value={largoM}
                  onChange={(e) => setLargoM(Math.max(0.1, Number(e.target.value)))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                />
              </div>
            )}
            {selectedMat.unidad === 'm2' && (
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">Ancho (m)</span>
                <input
                  type="number"
                  step="0.1"
                  min={0.1}
                  value={anchoM}
                  onChange={(e) => setAnchoM(Math.max(0.1, Number(e.target.value)))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                />
              </div>
            )}
            <div>
              <span className="text-[10px] text-slate-400 block mb-1">Cantidad</span>
              <input
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block mb-1">Acción</span>
              <select
                value={accion}
                onChange={(e) => setAccion(e.target.value as AccionMetalico)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white"
              >
                <option value="REEMPLAZO_TOTAL">Reemplazo Total</option>
                <option value="REFUERZO_EMPALME">Refuerzo / Empalme (0.7x)</option>
                <option value="SOLDADURA_MENOR">Soldadura Menor (0.35x)</option>
              </select>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block mb-1">Provisión Mat.</span>
              <select
                value={provision}
                onChange={(e) => setProvision(e.target.value as ProvisionMaterial)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white"
              >
                <option value="CONTRATISTA">Contratista</option>
                <option value="PLANTA">Planta</option>
              </select>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block mb-1">Prioridad</span>
              <select
                value={clasificacion}
                onChange={(e) => setClasificacion(e.target.value as ClasificacionAlcance)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white"
              >
                <option value="CRITICO">🔴 Crítico</option>
                <option value="SINERGIA">🟢 Sinergia</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota de ítem (ej: viga apoyo lado norte)..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
          />
          <button
            type="button"
            onClick={handleAddLine}
            disabled={!selectedMat}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black flex items-center space-x-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Agregar</span>
          </button>
        </div>
      </div>

      {/* Lista de líneas cargadas */}
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((it) => (
            <div
              key={it.id}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-amber-400">{it.codigo_catalogo}</span>
                  <span className="text-white font-semibold truncate">{it.descripcion}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      it.clasificacion === 'CRITICO'
                        ? 'bg-red-950 text-red-300 border border-red-700/50'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                    }`}
                  >
                    {it.clasificacion}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-2">
                  <span>
                    {it.cantidad} × {it.largo_m ? `${it.largo_m}m` : ''}
                    {it.ancho_m ? `×${it.ancho_m}m` : ''}
                    {!it.largo_m ? it.unidad : ''}
                  </span>
                  <span>·</span>
                  <span className="font-mono text-white font-bold">{it.peso_total_kg} kg</span>
                  <span>·</span>
                  <span>{it.accion}</span>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateLine(it.id, {
                        provision: it.provision === 'PLANTA' ? 'CONTRATISTA' : 'PLANTA'
                      })
                    }
                    className={`px-1.5 rounded font-bold border ${
                      it.provision === 'PLANTA'
                        ? 'bg-sky-950 text-sky-300 border-sky-700'
                        : 'bg-slate-900 text-amber-300 border-slate-700'
                    }`}
                  >
                    Prov: {it.provision}
                  </button>
                </div>
                {it.nota && <p className="text-[10px] text-slate-400 italic mt-0.5">{it.nota}</p>}
              </div>

              <button
                type="button"
                onClick={() => handleRemoveLine(it.id)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/40"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
