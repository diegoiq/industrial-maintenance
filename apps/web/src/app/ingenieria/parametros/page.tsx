'use client';

import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Calculator,
  ShieldAlert,
  History,
  CheckCircle2,
  TrendingUp,
  FileSpreadsheet,
  Upload,
  ClipboardPaste,
  Plus,
  Search,
  Building2,
  Wrench,
  RotateCcw,
  X
} from 'lucide-react';
import { db } from '../../../lib/db';
import { INITIAL_PARAMETROS } from '../../../lib/mockData';
import { ParametroCubicacion, ZonaInspeccion, Inspeccion, Plano } from '../../../types';
import { calculatePolygonAreaM2, getOrInitGeoreferencia } from '../../../lib/georeferenceEngine';
import {
  MaterialCatalogItem,
  MaterialCategoria,
  DEFAULT_MATERIALS_CATALOG,
  loadMaterialsCatalog,
  saveMaterialsCatalog,
  downloadMaterialsExcelTemplate,
  parseAndMergeMaterialsFromText
} from '../../../lib/materialsCatalog';

export default function ParametrosCubicacionPage() {
  const [parametros, setParametros] = useState<ParametroCubicacion[]>(INITIAL_PARAMETROS);
  const [catalog, setCatalog] = useState<MaterialCatalogItem[]>(DEFAULT_MATERIALS_CATALOG);
  const [catFilter, setCatFilter] = useState<'todos' | MaterialCategoria>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  const [auditLog, setAuditLog] = useState<{ id: string; clave: string; valAnterior: number; valNuevo: number; fecha: string; usuario: string }[]>([]);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Modal de Pegado Rápido desde Excel (Ctrl+V) o Alta Manual
  const [isExcelPasteOpen, setIsExcelPasteOpen] = useState(false);
  const [excelPasteText, setExcelPasteText] = useState('');
  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [newMatCodigo, setNewMatCodigo] = useState('');
  const [newMatCategoria, setNewMatCategoria] = useState<MaterialCategoria>('perfil_metalico');
  const [newMatNombre, setNewMatNombre] = useState('');
  const [newMatUnidad, setNewMatUnidad] = useState('m');
  const [newMatPrecio, setNewMatPrecio] = useState<number>(50);
  const [newMatPeso, setNewMatPeso] = useState<number>(20);
  const [newMatHh, setNewMatHh] = useState<number>(1.5);

  // Simulador Dual conectado a Zonas e Inspecciones Reales
  const [zonasReales, setZonasReales] = useState<ZonaInspeccion[]>([]);
  const [planosReales, setPlanosReales] = useState<Plano[]>([]);
  const [inspeccionesReales, setInspeccionesReales] = useState<Inspeccion[]>([]);
  const [selectedZonaSimId, setSelectedZonaSimId] = useState<string>('manual');
  const [simDisciplina, setSimDisciplina] = useState<'metalico' | 'civil'>('metalico');
  const [selectedMaterialCode, setSelectedMaterialCode] = useState<string>('W12X50');
  const [cantidadUnidad, setCantidadUnidad] = useState<number>(7.2); // metros en perfiles o m2/ml/m3 en civil
  const [m2SuperficieManual, setM2SuperficieManual] = useState<number>(18.5);
  const [gradoCorrosion, setGradoCorrosion] = useState<string>('Ri 4');
  const [porcentajeAfectado, setPorcentajeAfectado] = useState<number>(30);
  const [requiereReemplazo, setRequiereReemplazo] = useState<boolean>(true);
  const [alturaAccesoM, setAlturaAccesoM] = useState<number>(8.5);
  const [envolventeM3, setEnvolventeM3] = useState<number>(160.0);

  // Matriz de Criticidad
  const [severidadDeterioro, setSeveridadDeterioro] = useState<number>(4);
  const [criticidadActivo, setCriticidadActivo] = useState<number>(5);

  // Cargar parámetros reales desde IndexedDB + Catálogo de Materiales + Zonas Reales
  useEffect(() => {
    const init = async () => {
      let storedParams = await db.parametros.toArray();
      if (storedParams.length === 0) {
        for (const p of INITIAL_PARAMETROS) {
          await db.parametros.put(p);
        }
        storedParams = INITIAL_PARAMETROS;
      }
      setParametros(storedParams);
      setCatalog(loadMaterialsCatalog());

      const [loadedZonas, loadedPlanos, loadedInspecciones] = await Promise.all([
        db.zonas.toArray(),
        db.planos.toArray(),
        db.inspecciones.toArray()
      ]);
      setZonasReales(loadedZonas);
      setPlanosReales(loadedPlanos);
      setInspeccionesReales(loadedInspecciones);
    };
    init();
  }, []);

  // Al elegir una Zona real de la planta, carga automáticamente sus m², andamios, % afectado y severidad de campo
  const handleSelectZonaForCubicacion = (zonaId: string) => {
    setSelectedZonaSimId(zonaId);
    if (zonaId === 'manual') return;

    const zona = zonasReales.find(z => z.id === zonaId);
    if (!zona) return;

    const plano = planosReales.find(p => p.id === zona.plano_id);
    const geoCal = getOrInitGeoreferencia(plano);
    const calcM2 = calculatePolygonAreaM2(zona.poligono_svg?.puntos || [], geoCal);
    const m2Real = zona.superficie_estimada_m2 && zona.superficie_estimada_m2 > 0 ? zona.superficie_estimada_m2 : (calcM2 || 250);

    const inspZona = inspeccionesReales.filter(i => i.zona_id === zona.id || i.elemento_id === `ZONA:${zona.codigo}`);
    const ultimaInsp = inspZona[0];

    const grado = ultimaInsp?.grado_corrosion || (zona.estado_salud_apriori === 'critico' ? 'Ri 5' : zona.estado_salud_apriori === 'malo' ? 'Ri 4' : 'Ri 3');
    const pct = ultimaInsp ? ultimaInsp.porcentaje_afectado : (zona.estado_salud_apriori === 'critico' ? 60 : zona.estado_salud_apriori === 'malo' ? 40 : zona.estado_salud_apriori === 'bueno' ? 15 : 25);

    setM2SuperficieManual(Math.round(m2Real));
    setCantidadUnidad(Math.round(m2Real * 0.25));
    setEnvolventeM3(zona.nivel_acceso_andamio?.envolvente_m3 || 180);
    setAlturaAccesoM(zona.nivel_acceso_andamio?.altura_mts || 6.5);
    setGradoCorrosion(grado);
    setPorcentajeAfectado(pct);
    setRequiereReemplazo(!!ultimaInsp?.requiere_reemplazo || zona.estado_salud_apriori === 'critico');

    // Conecta automáticamente la severidad de la Matriz de Criticidad con el grado ISO 4628 de campo
    const sevFromRi = grado.includes('5') ? 5 : grado.includes('4') ? 4 : grado.includes('3') ? 3 : grado.includes('2') ? 2 : 1;
    setSeveridadDeterioro(sevFromRi);
  };

  const notify = (msg: string) => {
    setSaveNotice(msg);
    setTimeout(() => setSaveNotice(null), 4500);
  };

  // Sincroniza tarifas clave del catálogo hacia db.parametros (usado por Campañas y Presupuestos)
  const syncKeyCatalogPricesToParams = async (updatedCatalog: MaterialCatalogItem[]) => {
    const mapping: Record<string, string> = {
      'MO-OFICIAL': 'costo_hh_oficial_montador',
      'PINT-MASTIC': 'costo_m2_sistema_epoxi_poliuretano',
      'AND-TUBULAR': 'costo_m3_andamio_mes'
    };

    const nextParams = [...parametros];
    let changed = false;
    for (const [matCode, paramKey] of Object.entries(mapping)) {
      const mat = updatedCatalog.find(m => m.codigo.toUpperCase() === matCode);
      const pIdx = nextParams.findIndex(p => p.clave === paramKey);
      if (mat && pIdx !== -1 && nextParams[pIdx].valor_numerico !== mat.precio_usd) {
        nextParams[pIdx] = { ...nextParams[pIdx], valor_numerico: mat.precio_usd };
        await db.parametros.put(nextParams[pIdx]);
        changed = true;
      }
    }
    if (changed) setParametros(nextParams);
  };

  const handleUpdateParametro = async (id: string, nuevoValor: number) => {
    const item = parametros.find(p => p.id === id);
    if (!item) return;

    const valAnterior = item.valor_numerico;
    const updatedItem = { ...item, valor_numerico: nuevoValor };
    await db.parametros.put(updatedItem);
    setParametros(prev => prev.map(p => (p.id === id ? updatedItem : p)));

    setAuditLog(prev => [
      {
        id: `aud_${Date.now()}`,
        clave: item.clave,
        valAnterior,
        valNuevo: nuevoValor,
        fecha: new Date().toLocaleTimeString(),
        usuario: 'Ing. Mantenimiento'
      },
      ...prev
    ]);

    notify(`Parámetro "${item.clave}" guardado en memoria local (impacta Campañas y Presupuestos).`);
  };

  const handleUpdateCatalogPrice = async (id: string, newPrice: number) => {
    const updated = catalog.map(m => (m.id === id ? { ...m, precio_usd: newPrice } : m));
    setCatalog(updated);
    saveMaterialsCatalog(updated);
    await syncKeyCatalogPricesToParams(updated);
  };

  const handleUploadExcelCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = reader.result as string;
      const res = parseAndMergeMaterialsFromText(text, catalog);
      setCatalog(res.updatedCatalog);
      saveMaterialsCatalog(res.updatedCatalog);
      await syncKeyCatalogPricesToParams(res.updatedCatalog);
      notify(`Excel procesado: ${res.updatedCount} precios actualizados, ${res.addedCount} materiales nuevos agregados.`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleProcessExcelPaste = async () => {
    if (!excelPasteText.trim()) return;
    const res = parseAndMergeMaterialsFromText(excelPasteText, catalog);
    setCatalog(res.updatedCatalog);
    saveMaterialsCatalog(res.updatedCatalog);
    await syncKeyCatalogPricesToParams(res.updatedCatalog);
    setIsExcelPasteOpen(false);
    setExcelPasteText('');
    notify(`Lista pegada desde Excel: ${res.updatedCount} precios actualizados, ${res.addedCount} ítems agregados.`);
  };

  const handleAddCustomMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatCodigo.trim() || !newMatNombre.trim()) return;
    const newItem: MaterialCatalogItem = {
      id: `mat-custom-${Date.now()}`,
      codigo: newMatCodigo.trim().toUpperCase(),
      categoria: newMatCategoria,
      nombre: newMatNombre.trim(),
      unidad: newMatUnidad.trim() || 'u',
      precio_usd: newMatPrecio,
      peso_kg_por_unidad: newMatPeso,
      superficie_m2_por_unidad: newMatCategoria === 'civil_hormigon' ? 1 : 0.8,
      hh_unitaria: newMatHh,
      notas: 'Agregado manualmente'
    };
    const updated = [newItem, ...catalog];
    setCatalog(updated);
    saveMaterialsCatalog(updated);
    setIsAddMaterialOpen(false);
    setNewMatCodigo('');
    setNewMatNombre('');
    notify(`Material "${newItem.codigo}" agregado al catálogo.`);
  };

  const handleResetCatalog = async () => {
    if (!window.confirm('¿Restablecer el catálogo de materiales y precios USD a los valores base de fábrica?')) return;
    setCatalog(DEFAULT_MATERIALS_CATALOG);
    saveMaterialsCatalog(DEFAULT_MATERIALS_CATALOG);
    await syncKeyCatalogPricesToParams(DEFAULT_MATERIALS_CATALOG);
    notify('Catálogo restablecido a valores base.');
  };

  // Cálculo de Criticidad
  const valorCriticidad = severidadDeterioro * criticidadActivo;
  const prioridadIntervencion =
    valorCriticidad >= 16
      ? { etiqueta: 'P1 - INMEDIATO (Parada de Planta)', color: 'bg-red-950 text-red-300 border-red-500' }
      : valorCriticidad >= 9
      ? { etiqueta: 'P2 - ALTA (Campaña Anual Actual)', color: 'bg-amber-950 text-amber-300 border-amber-500' }
      : valorCriticidad >= 4
      ? { etiqueta: 'P3 - MEDIA (Monitoreo 12-24 meses)', color: 'bg-sky-950 text-sky-300 border-sky-500' }
      : { etiqueta: 'P4 - BAJA (Inspección Rutinaria)', color: 'bg-emerald-950 text-emerald-300 border-emerald-500' };

  // Tarifas globales
  const hhM2Pintura = parametros.find(p => p.clave === 'hh_por_m2_pintura_epoxi')?.valor_numerico || 0.45;
  const tarifaHH = parametros.find(p => p.clave === 'costo_hh_oficial_montador')?.valor_numerico || 28.5;
  const costoM2Pintura = parametros.find(p => p.clave === 'costo_m2_sistema_epoxi_poliuretano')?.valor_numerico || 18.2;
  const costoM3Andamio = parametros.find(p => p.clave === 'costo_m3_andamio_mes')?.valor_numerico || 12.0;

  // Materiales filtrados para el simulador según disciplina
  const simMaterials = catalog.filter(m =>
    simDisciplina === 'metalico' ? m.categoria === 'perfil_metalico' : m.categoria === 'civil_hormigon'
  );
  const activeSimMaterial =
    simMaterials.find(m => m.codigo === selectedMaterialCode) || simMaterials[0] || catalog[0];

  // Cálculos del Simulador Dual (Metálico vs Civil)
  const m3CalculadoAndamio = alturaAccesoM > 2.0 ? envolventeM3 : 0;
  const hhAndamio = m3CalculadoAndamio * 0.05;

  let m2CalculadoPintura = 0;
  let kgCalculadoAcero = 0;
  let hhEjecucion = 0;
  let costoMateriales = 0;

  if (simDisciplina === 'metalico') {
    const supBase =
      activeSimMaterial.superficie_m2_por_unidad > 0
        ? Math.max(m2SuperficieManual, cantidadUnidad * activeSimMaterial.superficie_m2_por_unidad)
        : m2SuperficieManual;
    m2CalculadoPintura = Number((supBase * (porcentajeAfectado / 100) * 1.25).toFixed(2));
    kgCalculadoAcero = requiereReemplazo
      ? Number((cantidadUnidad * activeSimMaterial.peso_kg_por_unidad * (porcentajeAfectado / 100)).toFixed(2))
      : 0;

    const costoReemplazoMetal = requiereReemplazo
      ? cantidadUnidad * (porcentajeAfectado / 100) * activeSimMaterial.precio_usd
      : 0;
    costoMateriales = Number(((m2CalculadoPintura * costoM2Pintura) + costoReemplazoMetal).toFixed(2));

    const hhPintura = m2CalculadoPintura * hhM2Pintura;
    const hhMontaje = requiereReemplazo ? cantidadUnidad * (porcentajeAfectado / 100) * activeSimMaterial.hh_unitaria : 0;
    hhEjecucion = hhPintura + hhMontaje;
  } else {
    // Disciplina Civil / Hormigón / Juntas
    const factorCiv = Math.max(0.1, porcentajeAfectado / 100);
    const cantidadEfectiva = cantidadUnidad * (requiereReemplazo ? 1 : factorCiv);
    costoMateriales = Number((cantidadEfectiva * activeSimMaterial.precio_usd).toFixed(2));
    hhEjecucion = cantidadEfectiva * activeSimMaterial.hh_unitaria;
    m2CalculadoPintura = activeSimMaterial.unidad === 'm2' ? Number(cantidadEfectiva.toFixed(2)) : 0;
  }

  const hhTotal = Number(((hhEjecucion + hhAndamio) * 1.1).toFixed(1));
  const costoManoObra = Number((hhTotal * tarifaHH).toFixed(2));
  const costoAndamio = Number((m3CalculadoAndamio * costoM3Andamio).toFixed(2));
  const costoTotalEstimado = Number((costoMateriales + costoManoObra + costoAndamio).toFixed(2));

  const filteredCatalog = catalog.filter(item => {
    const matchCat = catFilter === 'todos' || item.categoria === catFilter;
    const q = searchTerm.trim().toLowerCase();
    const matchSearch =
      !q ||
      item.codigo.toLowerCase().includes(q) ||
      item.nombre.toLowerCase().includes(q) ||
      (item.notas || '').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-6 overflow-y-auto">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
            MÓDULO 4 · INGENIERÍA, MATERIALES & COSTOS (METÁLICO + CIVIL)
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight mt-1">
            Catálogo de Materiales (USD), Coeficientes y Cubicaciones
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Administra precios unitarios en dólares desde tus planillas Excel (perfiles metálicos, cañerías, hormigón, morteros, juntas, pinturas y andamios) y simula cubicaciones en tiempo real.
          </p>
        </div>
      </div>

      {saveNotice && (
        <div className="p-3 bg-emerald-950 border border-emerald-500/60 rounded-xl text-emerald-200 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{saveNotice}</span>
        </div>
      )}

      {/* SECCIÓN 1: CATÁLOGO MAESTRO DE MATERIALES Y ACTUALIZACIÓN DESDE EXCEL (USD) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Lista de Precios de Materiales y Perfiles ({catalog.length} ítems en USD)</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Descarga la plantilla para Excel, actualiza tus precios en USD y súbela o pega las filas directamente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadMaterialsExcelTemplate(catalog)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 font-bold text-xs rounded-lg flex items-center space-x-1.5 transition"
              title="Descarga el catálogo actual en formato CSV listo para abrir y editar en Microsoft Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Descargar Plantilla Excel</span>
            </button>

            <label className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer shadow transition">
              <Upload className="w-3.5 h-3.5" />
              <span>Subir CSV Excel</span>
              <input type="file" accept=".csv,.txt,.tsv" onChange={handleUploadExcelCsv} className="hidden" />
            </label>

            <button
              type="button"
              onClick={() => setIsExcelPasteOpen(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg flex items-center space-x-1.5 shadow transition"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Pegar desde Excel</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddMaterialOpen(true)}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg flex items-center space-x-1 shadow transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Ítem</span>
            </button>

            <button
              type="button"
              onClick={handleResetCatalog}
              className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 rounded-lg"
              title="Restablecer precios base"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filtros de Categoría y Buscador */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'todos', label: 'Todos' },
                { id: 'perfil_metalico', label: '🔩 Metálicos / Perfiles' },
                { id: 'civil_hormigon', label: '🏗️ Civiles / Hormigón' },
                { id: 'pintura_recubrimiento', label: '🎨 Pinturas' },
                { id: 'andamio_acceso', label: '🪜 Andamios' },
                { id: 'mano_obra', label: '👷 Mano de Obra' }
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCatFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  catFilter === tab.id
                    ? 'bg-amber-500 text-black'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar código (W12, H-30, IPE...)"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Tabla editable de Catálogo */}
        <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-950 z-10">
              <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                <th className="p-2.5">Código</th>
                <th className="p-2.5">Descripción / Material</th>
                <th className="p-2.5">Categoría</th>
                <th className="p-2.5">Peso / Sup.</th>
                <th className="p-2.5">Unidad</th>
                <th className="p-2.5">Precio Unitario (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredCatalog.map(item => (
                <tr key={item.id} className="hover:bg-slate-950/50">
                  <td className="p-2.5 font-mono font-bold text-amber-400">{item.codigo}</td>
                  <td className="p-2.5">
                    <span className="font-semibold text-slate-200 block">{item.nombre}</span>
                    {item.notas && <span className="text-[10px] text-slate-500">{item.notas}</span>}
                  </td>
                  <td className="p-2.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                      {item.categoria.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-2.5 font-mono text-[11px] text-slate-400">
                    {item.peso_kg_por_unidad > 0 ? `${item.peso_kg_por_unidad} kg/${item.unidad}` : '-'}
                  </td>
                  <td className="p-2.5 font-mono text-slate-300">{item.unidad}</td>
                  <td className="p-2.5">
                    <div className="flex items-center space-x-1">
                      <span className="text-emerald-400 font-mono font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={item.precio_usd}
                        onChange={(e) => handleUpdateCatalogPrice(item.id, parseFloat(e.target.value) || 0)}
                        className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-400"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECCIÓN 2: COEFICIENTES GLOBALES + MATRIZ DE CRITICIDAD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Coeficientes Paramétricos Globales (Alimentan Campañas y SAP PM)</span>
            </h3>
            <span className="text-xs text-slate-500 font-mono">IndexedDB: db.parametros</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                  <th className="pb-2">Clave Parámetro</th>
                  <th className="pb-2">Categoría</th>
                  <th className="pb-2">Valor Numérico</th>
                  <th className="pb-2">Unidad</th>
                  <th className="pb-2">Descripción Técnica</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {parametros.map(param => (
                  <tr key={param.id} className="hover:bg-slate-950/40">
                    <td className="py-2.5 font-mono font-bold text-slate-200">{param.clave}</td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                        {param.categoria}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <input
                        type="number"
                        step="0.01"
                        value={param.valor_numerico}
                        onChange={(e) => handleUpdateParametro(param.id, parseFloat(e.target.value) || 0)}
                        className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-400"
                      />
                    </td>
                    <td className="py-2.5 font-mono text-slate-400">{param.unidad}</td>
                    <td className="py-2.5 text-slate-400 text-[11px] max-w-xs">{param.descripcion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {auditLog.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <History className="w-3.5 h-3.5 text-sky-400" />
                <span>Auditoría de Cambios Recientes</span>
              </span>
              <div className="space-y-1 max-h-28 overflow-y-auto font-mono text-[11px]">
                {auditLog.map(item => (
                  <div key={item.id} className="bg-slate-950 p-1.5 rounded border border-slate-800/80 flex items-center justify-between text-slate-300">
                    <span>
                      <strong className="text-amber-400">{item.clave}</strong>: {item.valAnterior} → <strong className="text-emerald-400">{item.valNuevo}</strong>
                    </span>
                    <span className="text-slate-500">{item.usuario} · {item.fecha}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Matriz de Criticidad */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span>Matriz de Criticidad</span>
              </h3>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-white">
                Valor: {valorCriticidad} / 25
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-300">Severidad del Deterioro:</span>
                <span className="font-bold text-amber-400">Nivel {severidadDeterioro} / 5</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSeveridadDeterioro(n)}
                    className={`py-1.5 rounded font-mono font-bold text-xs transition ${
                      severidadDeterioro === n ? 'bg-amber-500 text-black' : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-300">Criticidad del Activo (Planta):</span>
                <span className="font-bold text-amber-400">Nivel {criticidadActivo} / 5</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCriticidadActivo(n)}
                    className={`py-1.5 rounded font-mono font-bold text-xs transition ${
                      criticidadActivo === n ? 'bg-amber-500 text-black' : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
              <div className="grid grid-cols-5 gap-1 text-center font-mono text-[10px]">
                {[5, 4, 3, 2, 1].map(row => (
                  <React.Fragment key={row}>
                    {[1, 2, 3, 4, 5].map(col => {
                      const score = row * col;
                      const isCurrent = row === severidadDeterioro && col === criticidadActivo;
                      const cellColor =
                        score >= 16
                          ? 'bg-red-500/30 text-red-200 border-red-500'
                          : score >= 9
                          ? 'bg-amber-500/30 text-amber-200 border-amber-500'
                          : score >= 4
                          ? 'bg-sky-500/30 text-sky-200 border-sky-500'
                          : 'bg-emerald-500/30 text-emerald-200 border-emerald-500';

                      return (
                        <div
                          key={`${row}-${col}`}
                          className={`p-1.5 rounded border ${cellColor} ${isCurrent ? 'ring-2 ring-white font-black scale-110' : 'opacity-70'}`}
                        >
                          {score}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          <div className={`p-3 rounded-lg border text-xs font-bold text-center mt-3 ${prioridadIntervencion.color}`}>
            <span className="block text-[10px] opacity-80 uppercase">Prioridad Calculada:</span>
            <span className="text-sm">{prioridadIntervencion.etiqueta}</span>
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: CUBICADOR REAL POR ZONA RELEVADA & SIMULADOR DUAL (METÁLICO + CIVIL) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <Calculator className="w-5 h-5 text-sky-400" />
              <h3 className="text-base font-bold text-white">Cubicador Paramétrico (Conectado a Zonas y Relevamientos Reales)</h3>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Elige una Zona real de tu planta para calcular sus metrados físicos y costos en USD según lo relevado en campo, o simula manualmente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {zonasReales.length > 0 && (
              <select
                value={selectedZonaSimId}
                onChange={(e) => handleSelectZonaForCubicacion(e.target.value)}
                className="bg-slate-950 border border-emerald-500/60 text-emerald-300 font-mono font-bold text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
              >
                <option value="manual">🧪 Modo Simulación Manual</option>
                {zonasReales.map(z => (
                  <option key={z.id} value={z.id}>
                    📍 Cargar Zona Real: {z.codigo} — {z.nombre}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setSimDisciplina('metalico');
                setSelectedMaterialCode('W12X50');
              }}
              className={`px-3 py-1 rounded font-bold flex items-center space-x-1.5 transition ${
                simDisciplina === 'metalico' ? 'bg-sky-500 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Metálico / Estructuras</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSimDisciplina('civil');
                setSelectedMaterialCode('CIV-MORTERO');
              }}
              className={`px-3 py-1 rounded font-bold flex items-center space-x-1.5 transition ${
                simDisciplina === 'civil' ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Civil / Hormigón / Juntas</span>
            </button>
          </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Columna 1: Variables */}
          <div className="space-y-3 text-xs">
            <span className="font-bold text-slate-300 block uppercase tracking-wider text-[11px]">
              Variables ({simDisciplina === 'metalico' ? 'Perfil / Cañería / Chapa' : 'Elemento Civil / Hormigón'})
            </span>

            <div>
              <label className="text-slate-400 block mb-1">Material del Catálogo (Precios USD)</label>
              <select
                value={activeSimMaterial?.codigo || ''}
                onChange={(e) => setSelectedMaterialCode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono text-xs"
              >
                {simMaterials.map(m => (
                  <option key={m.id} value={m.codigo}>
                    {m.codigo} — {m.nombre} (${m.precio_usd}/{m.unidad})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">
                  Cantidad ({activeSimMaterial?.unidad || 'm'})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={cantidadUnidad}
                  onChange={(e) => setCantidadUnidad(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">
                  {simDisciplina === 'metalico' ? 'Sup. Ref (m²)' : '% Deteriorado'}
                </label>
                {simDisciplina === 'metalico' ? (
                  <input
                    type="number"
                    value={m2SuperficieManual}
                    onChange={(e) => setM2SuperficieManual(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono"
                  />
                ) : (
                  <input
                    type="number"
                    value={porcentajeAfectado}
                    onChange={(e) => setPorcentajeAfectado(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono"
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {simDisciplina === 'metalico' && (
                <div>
                  <label className="text-slate-400 block mb-1">% Deteriorado</label>
                  <input
                    type="number"
                    value={porcentajeAfectado}
                    onChange={(e) => setPorcentajeAfectado(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono"
                  />
                </div>
              )}
              <div className={simDisciplina === 'civil' ? 'col-span-2' : ''}>
                <label className="text-slate-400 block mb-1">Andamio Envolvente (m³)</label>
                <input
                  type="number"
                  value={envolventeM3}
                  onChange={(e) => setEnvolventeM3(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded border border-slate-800">
              <span className="text-slate-300 font-semibold">
                {simDisciplina === 'metalico' ? '¿Reemplazo de Perfil / Chapa?' : '¿Intervención 100% del Elemento?'}
              </span>
              <input
                type="checkbox"
                checked={requiereReemplazo}
                onChange={(e) => setRequiereReemplazo(e.target.checked)}
                className="w-4 h-4 accent-red-500 rounded"
              />
            </div>
          </div>

          {/* Columna 2: Metrados */}
          <div className="space-y-3 text-xs">
            <span className="font-bold text-slate-300 block uppercase tracking-wider text-[11px]">
              Metrados Físicos Estimados
            </span>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 font-mono">
              {simDisciplina === 'metalico' ? (
                <>
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Pintura (Saniado + Epoxi):</span>
                    <span className="text-base font-bold text-sky-400">{m2CalculadoPintura} m²</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Acero para Reemplazo:</span>
                    <span className="text-base font-bold text-red-400">{kgCalculadoAcero} kg</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Volumen/Área Civil:</span>
                  <span className="text-base font-bold text-amber-400">
                    {cantidadUnidad} {activeSimMaterial?.unidad}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Andamio Multidireccional:</span>
                <span className="text-base font-bold text-purple-400">{m3CalculadoAndamio} m³</span>
              </div>
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-slate-400 font-sans font-bold">Total Horas-Hombre (HH):</span>
                <span className="text-xl font-black text-amber-400">{hhTotal} HH</span>
              </div>
            </div>
          </div>

          {/* Columna 3: Presupuesto */}
          <div className="space-y-3 text-xs flex flex-col justify-between">
            <div>
              <span className="font-bold text-slate-300 block uppercase tracking-wider text-[11px] mb-3">
                Presupuesto Unitario Proyectado
              </span>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Materiales y Consumibles:</span>
                  <span className="font-mono font-bold text-slate-200">${costoMateriales.toLocaleString()} USD</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Mano de Obra Calificada:</span>
                  <span className="font-mono font-bold text-slate-200">${costoManoObra.toLocaleString()} USD</span>
                </div>
                <div className="flex justify-between text-xs border-b border-slate-800 pb-3">
                  <span className="text-slate-400">Alquiler y Armado Andamios:</span>
                  <span className="font-mono font-bold text-slate-200">${costoAndamio.toLocaleString()} USD</span>
                </div>

                <div className="pt-2">
                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">Costo Total Estimado:</span>
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    ${costoTotalEstimado.toLocaleString()} USD
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Incluye factor de contingencia del 10%
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-xs flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 flex-shrink-0 text-amber-400" />
              <span>
                Precios conectados al catálogo actual y a <strong>Campañas / Presupuestos SAP PM</strong>.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: PEGAR DIRECTO DESDE EXCEL (Ctrl+V) */}
      {isExcelPasteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-slate-900 border-2 border-indigo-500 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800 border-b border-slate-700">
              <div className="flex items-center space-x-2 text-white font-bold text-sm">
                <ClipboardPaste className="w-4 h-4 text-indigo-400" />
                <span>Pegar Lista de Precios desde Excel (USD)</span>
              </div>
              <button onClick={() => setIsExcelPasteOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Copia tus filas directamente en Excel (<code className="text-amber-300">Ctrl+C</code>) y pégalas aquí abajo (<code className="text-amber-300">Ctrl+V</code>). Acepta:
              </p>
              <ul className="list-disc pl-5 text-slate-400 space-y-1 text-[11px]">
                <li><strong>Formato Rápido (2 columnas):</strong> <code className="text-emerald-300">CODIGO</code> | <code className="text-emerald-300">PRECIO_USD</code> (ej: <code className="font-mono">W12X50   265.00</code>)</li>
                <li><strong>Plantilla Completa (9 columnas):</strong> la que descargas con <em>Descargar Plantilla Excel</em> (actualiza o agrega ítems nuevos).</li>
              </ul>

              <textarea
                rows={7}
                value={excelPasteText}
                onChange={(e) => setExcelPasteText(e.target.value)}
                placeholder={"W12X50\t265.00\nCIV-H30\t195.50\nPINT-MASTIC\t19.80"}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 font-mono text-xs text-emerald-300 focus:border-indigo-400 focus:outline-none"
              />

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExcelPasteOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleProcessExcelPaste}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow"
                >
                  Actualizar Catálogo en USD
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AGREGAR NUEVO MATERIAL / PERFIL MANUAL */}
      {isAddMaterialOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border-2 border-sky-500 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800 border-b border-slate-700">
              <span className="text-white font-bold text-sm">Agregar Nuevo Material / Perfil</span>
              <button onClick={() => setIsAddMaterialOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomMaterial} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Código *</label>
                  <input
                    type="text"
                    required
                    value={newMatCodigo}
                    onChange={(e) => setNewMatCodigo(e.target.value)}
                    placeholder="Ej: IPE360 / CIV-EPOXI"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Categoría</label>
                  <select
                    value={newMatCategoria}
                    onChange={(e) => setNewMatCategoria(e.target.value as MaterialCategoria)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  >
                    <option value="perfil_metalico">Perfil / Metálico</option>
                    <option value="civil_hormigon">Civil / Hormigón</option>
                    <option value="pintura_recubrimiento">Pintura / Recubrimiento</option>
                    <option value="andamio_acceso">Andamio / Acceso</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Descripción *</label>
                <input
                  type="text"
                  required
                  value={newMatNombre}
                  onChange={(e) => setNewMatNombre(e.target.value)}
                  placeholder="Ej: Viga Europea IPE 360 / Hormigón H-35..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Unidad</label>
                  <input
                    type="text"
                    value={newMatUnidad}
                    onChange={(e) => setNewMatUnidad(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">USD</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newMatPrecio}
                    onChange={(e) => setNewMatPrecio(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-emerald-400 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">kg/u</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newMatPeso}
                    onChange={(e) => setNewMatPeso(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">HH/u</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newMatHh}
                    onChange={(e) => setNewMatHh(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setIsAddMaterialOpen(false)} className="px-3 py-1.5 text-slate-400">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-black font-bold rounded-lg">
                  Agregar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
