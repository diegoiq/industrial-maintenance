'use client';

import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, DollarSign, ShoppingCart } from 'lucide-react';
import { Inspeccion, ZonaInspeccion } from '../../types';
import { CatalogoMaterialItem, TarifarioIntervencion } from '../../types/computo';
import { consolidarListaCompras, generarBoQContratista } from '../../lib/computoEngine';
import { sanitizeCsvCell } from '../../lib/security';

interface BoqComprasTabProps {
  inspecciones: Inspeccion[];
  zonasById: Record<string, ZonaInspeccion>;
  catalogo: CatalogoMaterialItem[];
  tarifario: TarifarioIntervencion;
}

export function BoqComprasTab({
  inspecciones,
  zonasById,
  catalogo,
  tarifario
}: BoqComprasTabProps) {
  const [provFilter, setProvFilter] = useState<'TODAS' | 'PLANTA' | 'CONTRATISTA'>('TODAS');

  const boq = useMemo(
    () => generarBoQContratista(inspecciones, zonasById, tarifario),
    [inspecciones, zonasById, tarifario]
  );

  const compras = useMemo(
    () => consolidarListaCompras(inspecciones, catalogo, tarifario.desperdicio_metalico_pct),
    [inspecciones, catalogo, tarifario.desperdicio_metalico_pct]
  );

  const comprasFiltered = useMemo(() => {
    if (provFilter === 'PLANTA') return compras.provisionPlanta;
    if (provFilter === 'CONTRATISTA') return compras.provisionContratista;
    return [...compras.provisionPlanta, ...compras.provisionContratista];
  }, [compras, provFilter]);

  const downloadCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const bom = '\uFEFF';
    const content =
      bom +
      [
        headers.join(';'),
        ...rows.map((r) => r.map((c) => sanitizeCsvCell(c, typeof c === 'string')).join(';'))
      ].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportBoqCiego = () => {
    downloadCsv(
      `BOQ_CIEGO_LICITACION_${new Date().toISOString().slice(0, 10)}.csv`,
      ['CODIGO', 'DISCIPLINA', 'DESCRIPCION', 'UNIDAD', 'CANTIDAD', 'PRECIO_UNITARIO_OFERENTE', 'SUBTOTAL'],
      [
        ...boq.items.map((i) => [
          i.codigo,
          i.disciplinaLabel,
          i.descripcion,
          i.unidad,
          i.cantidad,
          '',
          ''
        ]),
        ['GRAL-MOV', '6. Generales', 'Movilización / Obrador / Permisos / Seguridad', 'Global', 1, '', '']
      ]
    );
  };

  const handleExportBoqValorizado = () => {
    downloadCsv(
      `PRESUPUESTO_INTERNO_${tarifario.moneda}_${new Date().toISOString().slice(0, 10)}.csv`,
      ['CODIGO', 'DISCIPLINA', 'DESCRIPCION', 'UNIDAD', 'CANTIDAD', `PU_${tarifario.moneda}`, `SUBTOTAL_${tarifario.moneda}`],
      [
        ...boq.items.map((i) => [
          i.codigo,
          i.disciplinaLabel,
          i.descripcion,
          i.unidad,
          i.cantidad,
          i.precioUnitario,
          i.subtotal
        ]),
        ['GRAL-MOV', '6. Generales', 'Movilización / Obrador / Seguridad', 'Global', 1, boq.movilizacion, boq.movilizacion],
        ['GRAL-HH-CONT', '6. Generales', `Bolsa HH Contingencia (${tarifario.bolsa_hh_contingencia_pct}% c/ autorización)`, '%', 1, boq.contingenciaHH, boq.contingenciaHH]
      ]
    );
  };

  const handleExportCompras = () => {
    downloadCsv(
      `LISTA_COMPRAS_BOM_${provFilter}_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'PROVISION',
        'CODIGO',
        'DESCRIPCION',
        'UNIDAD',
        'CANT_NETA',
        'CANT_CON_DESPERDICIO',
        'PESO_TEORICO_KG',
        'PRESENTACION_COMERCIAL',
        'UNIDADES_COMERCIALES_A_COMPRAR',
        'ZONAS'
      ],
      comprasFiltered.map((c) => [
        c.provision,
        c.codigo_catalogo,
        c.descripcion,
        c.unidad,
        c.cantidad_neta,
        c.cantidad_con_desperdicio,
        c.peso_teorico_total_kg,
        c.presentacion_comercial,
        c.unidades_comerciales,
        c.zonas.join(', ')
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Planilla de Cotización (BoQ) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-black text-white">
              Planilla de Cotización por Precios Unitarios (Schedule of Rates / BoQ)
            </h3>
            <p className="text-xs text-slate-400">
              Cantidades consolidadas de {inspecciones.length} frente(s) seleccionado(s).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportBoqCiego}
              className="px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-black text-xs flex items-center space-x-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>📄 Exportar BoQ Ciego (Para Contratistas)</span>
            </button>
            <button
              type="button"
              onClick={handleExportBoqValorizado}
              className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center space-x-1.5"
            >
              <DollarSign className="w-4 h-4" />
              <span>💰 Exportar Presupuesto Interno ({tarifario.moneda})</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
              <tr>
                <th className="p-2.5">Código</th>
                <th className="p-2.5">Disciplina</th>
                <th className="p-2.5">Descripción</th>
                <th className="p-2.5">Unidad</th>
                <th className="p-2.5 text-right">Cantidad</th>
                <th className="p-2.5 text-right">PU ({tarifario.moneda})</th>
                <th className="p-2.5 text-right">Subtotal ({tarifario.moneda})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {boq.items.map((item) => (
                <tr key={item.codigo} className="hover:bg-slate-950/60">
                  <td className="p-2.5 font-mono font-bold text-amber-400">{item.codigo}</td>
                  <td className="p-2.5 text-slate-300">{item.disciplinaLabel}</td>
                  <td className="p-2.5 text-white">{item.descripcion}</td>
                  <td className="p-2.5 font-mono text-slate-400">{item.unidad}</td>
                  <td className="p-2.5 text-right font-mono font-bold text-white">{item.cantidad.toLocaleString()}</td>
                  <td className="p-2.5 text-right font-mono text-slate-300">{item.precioUnitario.toLocaleString()}</td>
                  <td className="p-2.5 text-right font-mono font-bold text-emerald-300">{item.subtotal.toLocaleString()}</td>
                </tr>
              ))}
              {boq.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500">
                    No hay ítems computables en los frentes seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
            {boq.items.length > 0 && (
              <tfoot className="bg-slate-950 border-t border-slate-700 font-mono text-xs">
                <tr>
                  <td colSpan={6} className="p-2.5 text-right text-slate-400">Subtotal Directo Contratista:</td>
                  <td className="p-2.5 text-right font-bold text-white">{boq.subtotalDirecto.toLocaleString()} {tarifario.moneda}</td>
                </tr>
                <tr>
                  <td colSpan={6} className="p-2.5 text-right text-slate-400">Movilización / Obrador / Seguridad:</td>
                  <td className="p-2.5 text-right text-slate-200">{boq.movilizacion.toLocaleString()} {tarifario.moneda}</td>
                </tr>
                <tr>
                  <td colSpan={6} className="p-2.5 text-right text-slate-400">Bolsa HH Contingencia ({tarifario.bolsa_hh_contingencia_pct}%):</td>
                  <td className="p-2.5 text-right text-slate-200">{boq.contingenciaHH.toLocaleString()} {tarifario.moneda}</td>
                </tr>
                <tr className="text-sm font-black text-emerald-400">
                  <td colSpan={6} className="p-3 text-right">TOTAL ESTIMADO CONTRATO:</td>
                  <td className="p-3 text-right">{boq.totalContrato.toLocaleString()} {tarifario.moneda}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Lista de Compras de Materiales (BOM) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-black text-white flex items-center space-x-2">
              <ShoppingCart className="w-4 h-4 text-amber-400" />
              <span>Lista de Compras de Materiales (BOM Consolidado)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Incluye {tarifario.desperdicio_metalico_pct}% de desperdicio y redondeo comercial (barras de 6 m, hojas 2.98 m², paneles 6 m²).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['TODAS', 'PLANTA', 'CONTRATISTA'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvFilter(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  provFilter === p
                    ? 'bg-amber-500 text-black border-amber-400'
                    : 'bg-slate-950 text-slate-300 border-slate-800'
                }`}
              >
                {p === 'TODAS' ? 'Todas' : p === 'PLANTA' ? 'Provisión Planta' : 'Provisión Contratista'}
              </button>
            ))}
            <button
              type="button"
              onClick={handleExportCompras}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-bold text-xs"
            >
              Exportar CSV Compras
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
              <tr>
                <th className="p-2.5">Provisión</th>
                <th className="p-2.5">Código</th>
                <th className="p-2.5">Descripción</th>
                <th className="p-2.5 text-right">Cant. Neta</th>
                <th className="p-2.5 text-right">c/ Desp. ({tarifario.desperdicio_metalico_pct}%)</th>
                <th className="p-2.5 text-right">Peso Teórico</th>
                <th className="p-2.5">Presentación</th>
                <th className="p-2.5 text-right">A Comprar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {comprasFiltered.map((row) => (
                <tr key={`${row.provision}-${row.codigo_catalogo}`} className="hover:bg-slate-950/60">
                  <td className="p-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        row.provision === 'PLANTA'
                          ? 'bg-sky-950 text-sky-300 border border-sky-700'
                          : 'bg-amber-950 text-amber-300 border border-amber-700'
                      }`}
                    >
                      {row.provision}
                    </span>
                  </td>
                  <td className="p-2.5 font-mono font-bold text-white">{row.codigo_catalogo}</td>
                  <td className="p-2.5 text-slate-300">{row.descripcion}</td>
                  <td className="p-2.5 text-right font-mono">
                    {row.cantidad_neta} {row.unidad}
                  </td>
                  <td className="p-2.5 text-right font-mono text-slate-300">
                    {row.cantidad_con_desperdicio} {row.unidad}
                  </td>
                  <td className="p-2.5 text-right font-mono text-amber-300">
                    {row.peso_teorico_total_kg} kg
                  </td>
                  <td className="p-2.5 text-slate-400">{row.presentacion_comercial}</td>
                  <td className="p-2.5 text-right font-mono font-black text-emerald-400">
                    {row.unidades_comerciales} u
                  </td>
                </tr>
              ))}
              {comprasFiltered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-500">
                    No hay materiales metálicos cargados en el BOM de las zonas seleccionadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
