'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  QrCode, 
  Layers, 
  Map, 
  Upload, 
  Trash2,
  Plus,
  Settings,
  Lock,
  Pencil,
  Ruler,
  Globe,
  ExternalLink,
  Check
} from 'lucide-react';
import { ZonaInspeccion, Elemento, EstadoSemaforo, Plano, HitoGeografico } from '../../types';
import { 
  getOrInitGeoreferencia, 
  pixelToLatLng, 
  getPolygonCentroid, 
  calculatePolygonAreaM2, 
  calculatePolygonPerimeterM 
} from '../../lib/georeferenceEngine';

interface ZoneDrawerProps {
  zona?: ZonaInspeccion;
  elemento?: Elemento;
  currentPlano?: Plano;
  hitos?: HitoGeografico[];
  planos?: Plano[];
  isEditingPolygon?: boolean;
  onClose: () => void;
  onOpenQRModal: (elemento: Elemento) => void;
  onOpenCubicarModal?: (elemento: Elemento) => void;
  onSelectPlano?: (planoId: string) => void;
  onOpenUploadPlanModal?: () => void;
  onAddVertexToZone?: (zonaId: string) => void;
  onDeleteZone?: (zonaId: string) => void;
  onToggleEditPolygon?: () => void;
  onOpenEditZoneModal?: (zona: ZonaInspeccion) => void;
  onUpdateZoneData?: (updatedZona: ZonaInspeccion) => void;
  onUpdateElementoData?: (updatedElem: Elemento) => void;
}

export const ZoneDrawer: React.FC<ZoneDrawerProps> = ({
  zona,
  elemento,
  currentPlano,
  hitos = [],
  planos = [],
  isEditingPolygon = false,
  onClose,
  onOpenQRModal,
  onSelectPlano,
  onOpenUploadPlanModal,
  onAddVertexToZone,
  onDeleteZone,
  onToggleEditPolygon,
  onOpenEditZoneModal,
  onUpdateZoneData,
  onUpdateElementoData
}) => {
  const [isEditingGps, setIsEditingGps] = useState(false);
  const [manualLat, setManualLat] = useState<string>('');
  const [manualLng, setManualLng] = useState<string>('');

  useEffect(() => {
    setIsEditingGps(false);
  }, [zona?.id, elemento?.id]);

  if (!zona && !elemento) return null;

  const geoCal = getOrInitGeoreferencia(currentPlano, hitos);

  // Coordenadas GPS de la Zona (override manual o calculadas desde su centroide en la capa Maps)
  const zonaCentroid = zona ? getPolygonCentroid(zona.poligono_svg?.puntos || []) : { x: 0, y: 0 };
  const zonaAutoGps = zona ? pixelToLatLng(zonaCentroid.x, zonaCentroid.y, geoCal) : null;
  const zonaGps = zona?.coordenadas_gps_override || zonaAutoGps;

  // Superficie y perímetro reales calculados desde la calibración geodésica
  const calculatedAreaM2 = zona ? calculatePolygonAreaM2(zona.poligono_svg?.puntos || [], geoCal) : 0;
  const calculatedPerimM = zona ? calculatePolygonPerimeterM(zona.poligono_svg?.puntos || [], geoCal) : 0;

  // Coordenadas GPS del Elemento (override manual o calculadas desde su pin)
  const elemAutoGps = elemento ? pixelToLatLng(elemento.coordenadas_pin.x, elemento.coordenadas_pin.y, geoCal) : null;
  const elemGps = elemento?.coordenadas_gps || elemAutoGps;

  const handleStartEditGps = () => {
    const targetGps = elemento ? elemGps : zonaGps;
    setManualLat(String(targetGps?.lat || ''));
    setManualLng(String(targetGps?.lng || ''));
    setIsEditingGps(true);
  };

  const handleSaveManualGps = () => {
    const latNum = parseFloat(manualLat);
    const lngNum = parseFloat(manualLng);
    if (isNaN(latNum) || isNaN(lngNum)) return;

    if (elemento && onUpdateElementoData) {
      onUpdateElementoData({
        ...elemento,
        coordenadas_gps: { lat: latNum, lng: lngNum }
      });
    } else if (zona && onUpdateZoneData) {
      onUpdateZoneData({
        ...zona,
        coordenadas_gps_override: { lat: latNum, lng: lngNum }
      });
    }
    setIsEditingGps(false);
  };

  const handleApplyCalculatedArea = () => {
    if (!zona || !onUpdateZoneData || calculatedAreaM2 <= 0) return;
    onUpdateZoneData({
      ...zona,
      superficie_estimada_m2: Math.round(calculatedAreaM2)
    });
  };

  const planoRelacionado = zona && planos.length > 0 
    ? planos.find(p => p.id !== zona.plano_id && (
        p.titulo.toLowerCase().includes(zona.codigo.toLowerCase()) ||
        p.titulo.toLowerCase().includes(zona.nombre.toLowerCase()) ||
        zona.nombre.toLowerCase().includes(p.titulo.toLowerCase())
      ))
    : undefined;

  const getSemaforoBadge = (estado: EstadoSemaforo) => {
    switch (estado) {
      case 'rojo':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-950 text-red-300 border border-red-500">CRÍTICO / REEMPLAZO</span>;
      case 'naranja':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-orange-950 text-orange-300 border border-orange-500">CORROSIÓN SEVERA</span>;
      case 'amarillo':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-950 text-amber-300 border border-amber-500">DETERIORO INCIPIENTE</span>;
      case 'verde':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-500">CONDICIÓN NORMAL</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">SIN RELEVAR</span>;
    }
  };

  const activeGps = elemento ? elemGps : zonaGps;
  const hasManualOverride = elemento ? !!elemento.coordenadas_gps : !!zona?.coordenadas_gps_override;

  return (
    <aside className="
      fixed md:absolute bottom-0 right-0 z-30
      w-full md:w-80 lg:w-96
      max-h-[75vh] md:max-h-[92%]
      bg-slate-900/95 backdrop-blur-md border border-slate-700/80
      rounded-t-2xl md:rounded-2xl
      p-4 md:p-5 flex flex-col justify-between overflow-y-auto shadow-2xl
      md:m-3
    ">
      <div className="space-y-4">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-mono text-sky-400 font-bold uppercase tracking-wider">
                {elemento ? 'Ficha de Activo Físico' : 'Zona de Inspección'}
              </span>
              {zona && (
                <span className="bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded border border-sky-500/40 text-[11px] font-mono font-bold">
                  {zona.codigo}
                </span>
              )}
              {zona?.area_planta && (
                <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40 text-[10px] font-bold">
                  {zona.area_planta}
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-white leading-tight mt-1">
              {elemento ? elemento.tag_codigo : zona?.nombre}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BLOQUE DE GEORREFERENCIACIÓN MAPS (Automática + Opción de Edición Manual) */}
        {activeGps && (
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-2.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-300 flex items-center space-x-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span>{hasManualOverride ? 'GPS Editado Manualmente' : 'GPS Calculado desde Capa Maps'}</span>
              </span>
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={handleStartEditGps}
                  className="text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
                  title="Corregir coordenadas GPS manualmente si hay diferencia"
                >
                  ✏️ Editar
                </button>
                <a
                  href={`https://www.google.com/maps?q=${activeGps.lat},${activeGps.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] px-1.5 py-0.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 rounded border border-emerald-500/40 flex items-center space-x-0.5"
                >
                  <span>Maps</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>

            {!isEditingGps ? (
              <div className="font-mono text-[11px] text-emerald-200 flex items-center justify-between">
                <span>Lat: {activeGps.lat.toFixed(6)}</span>
                <span>Lng: {activeGps.lng.toFixed(6)}</span>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    step="any"
                    value={manualLat}
                    onChange={(e) => setManualLat(e.target.value)}
                    placeholder="Latitud"
                    className="bg-slate-950 border border-emerald-500/50 rounded px-2 py-1 text-[11px] font-mono text-white"
                  />
                  <input
                    type="number"
                    step="any"
                    value={manualLng}
                    onChange={(e) => setManualLng(e.target.value)}
                    placeholder="Longitud"
                    className="bg-slate-950 border border-emerald-500/50 rounded px-2 py-1 text-[11px] font-mono text-white"
                  />
                </div>
                <div className="flex justify-end space-x-1.5">
                  <button
                    type="button"
                    onClick={() => setIsEditingGps(false)}
                    className="px-2 py-0.5 text-[10px] text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveManualGps}
                    className="px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-[10px] flex items-center space-x-1"
                  >
                    <Check className="w-3 h-3" />
                    <span>Guardar GPS</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Métricas en vivo de la Zona / Paquete de Intervención */}
        {zona && !elemento && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Layers className="w-4 h-4 text-sky-400" />
                <span>Paquete {zona.codigo}</span>
              </h4>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                {zona.nombre_nivel || `Cota +${((zona.cota_nivel || 146000) / 1000).toFixed(3)} m`}
              </span>
            </div>

            {/* Disciplinas involucradas */}
            {zona.disciplinas_involucradas && zona.disciplinas_involucradas.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Disciplinas Involucradas:</span>
                <div className="flex flex-wrap gap-1">
                  {zona.disciplinas_involucradas.map(d => (
                    <span key={d} className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] border border-slate-700 capitalize">
                      {d.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tarjetas de Métricas de Ingeniería */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Salud a Priori</span>
                <span className={`text-xs font-extrabold uppercase block mt-0.5 ${
                  zona.estado_salud_apriori === 'critico' ? 'text-red-400' :
                  zona.estado_salud_apriori === 'malo' ? 'text-orange-400' :
                  zona.estado_salud_apriori === 'regular' ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {zona.estado_salud_apriori || 'Regular'}
                </span>
                <span className="text-[10px] text-slate-500 block">Perímetro: {calculatedPerimM} m</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Superficie Estimada</span>
                <span className="text-base font-bold text-white">{zona.superficie_estimada_m2 || calculatedAreaM2 || 250} m²</span>
                {calculatedAreaM2 > 0 && Math.abs((zona.superficie_estimada_m2 || 0) - calculatedAreaM2) > 5 && (
                  <button
                    type="button"
                    onClick={handleApplyCalculatedArea}
                    className="text-[9px] text-emerald-400 hover:underline block text-left font-mono"
                    title="Aplicar superficie geométrica calculada según escala Maps"
                  >
                    ⚡ Polígono: {calculatedAreaM2} m² (Usar)
                  </button>
                )}
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Envolvente Andamio</span>
                <span className="text-base font-bold text-purple-300">{zona.nivel_acceso_andamio?.envolvente_m3 || 180} m³</span>
                <span className="text-[10px] text-purple-400 block capitalize">{zona.nivel_acceso_andamio?.tipo_acceso?.replace('_', ' ') || 'Andamio'}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Altura / Parada</span>
                <span className="text-base font-bold text-amber-400">{zona.nivel_acceso_andamio?.altura_mts || 6.5} m</span>
                <span className="text-[10px] text-slate-400 block">
                  {zona.nivel_acceso_andamio?.requiere_parada ? 'Requiere parada' : 'En marcha'}
                </span>
              </div>
            </div>

            {/* BOTÓN PROMINENTE: EDITAR DATOS Y CÁLCULO DE ANDAMIO */}
            {onOpenEditZoneModal && (
              <button
                type="button"
                onClick={() => onOpenEditZoneModal(zona)}
                className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center space-x-2 transition shadow-lg"
              >
                <Settings className="w-4 h-4" />
                <span>Editar Parámetros y Andamio</span>
              </button>
            )}

            {/* Control de Contorno y Ajuste de Geometría de la Zona */}
            <div className="bg-slate-950 p-3 rounded-xl border border-sky-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-sky-400 flex items-center space-x-1.5">
                  <Ruler className="w-3.5 h-3.5" />
                  <span>Contorno ({zona.poligono_svg?.puntos?.length || 0} vértices)</span>
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                  isEditingPolygon 
                    ? 'text-amber-300 bg-amber-950/80 border-amber-600 animate-pulse' 
                    : 'text-slate-400 bg-slate-900 border-slate-700'
                }`}>
                  {isEditingPolygon ? '✏️ Editando' : '🔒 Bloqueado'}
                </span>
              </div>

              <div className="flex items-center space-x-2 pt-0.5">
                {onToggleEditPolygon && (
                  <button
                    type="button"
                    onClick={onToggleEditPolygon}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg font-extrabold text-xs flex items-center justify-center space-x-1.5 transition shadow ${
                      isEditingPolygon
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
                        : 'bg-sky-600 hover:bg-sky-500 text-white'
                    }`}
                  >
                    {isEditingPolygon ? (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Bloquear</span>
                      </>
                    ) : (
                      <>
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Modificar Contorno</span>
                      </>
                    )}
                  </button>
                )}

                {isEditingPolygon && onAddVertexToZone && (
                  <button
                    type="button"
                    onClick={() => onAddVertexToZone(zona.id)}
                    className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 font-semibold text-xs rounded-lg flex items-center justify-center space-x-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Vértice</span>
                  </button>
                )}

                {onDeleteZone && (
                  <button
                    type="button"
                    onClick={() => onDeleteZone(zona.id)}
                    className="py-1.5 px-2 bg-red-950/50 hover:bg-red-900/80 border border-red-800/50 text-red-300 font-semibold text-xs rounded-lg flex items-center justify-center transition"
                    title="Eliminar esta zona"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Desplazamiento Local de toda la Zona en Bloque (Offset X / Y) */}
              {onUpdateZoneData && (
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Desplazar Zona en Bloque:</span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => {
                        const shifted = (zona.poligono_svg?.puntos || []).map(p => ({ x: p.x - 8, y: p.y }));
                        onUpdateZoneData({ ...zona, poligono_svg: { puntos: shifted } });
                      }}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-sky-300 font-mono"
                      title="Mover zona a la izquierda"
                    >
                      ◄ -X
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const shifted = (zona.poligono_svg?.puntos || []).map(p => ({ x: p.x + 8, y: p.y }));
                        onUpdateZoneData({ ...zona, poligono_svg: { puntos: shifted } });
                      }}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-sky-300 font-mono"
                      title="Mover zona a la derecha"
                    >
                      +X ►
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const shifted = (zona.poligono_svg?.puntos || []).map(p => ({ x: p.x, y: p.y - 8 }));
                        onUpdateZoneData({ ...zona, poligono_svg: { puntos: shifted } });
                      }}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-sky-300 font-mono"
                      title="Mover zona hacia arriba"
                    >
                      ▲ -Y
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const shifted = (zona.poligono_svg?.puntos || []).map(p => ({ x: p.x, y: p.y + 8 }));
                        onUpdateZoneData({ ...zona, poligono_svg: { puntos: shifted } });
                      }}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-sky-300 font-mono"
                      title="Mover zona hacia abajo"
                    >
                      ▼ +Y
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Drill-down: Conectar Layout General con Plano de Detalle de Nave */}
            <div className="pt-1">
              {planoRelacionado ? (
                <button
                  type="button"
                  onClick={() => onSelectPlano?.(planoRelacionado.id)}
                  className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg flex items-center justify-center space-x-2 transition shadow-md"
                >
                  <Map className="w-4 h-4" />
                  <span>Abrir Plano de Detalle ({planoRelacionado.titulo})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenUploadPlanModal?.()}
                  className="w-full py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-sky-300 font-semibold text-xs rounded-lg flex items-center justify-center space-x-1.5 border border-slate-700 transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>+ Subir Plano de Detalle para esta Zona</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Detalle Técnico del Elemento Seleccionado */}
        {elemento && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Estado Actual:</span>
              {getSemaforoBadge(elemento.estado_actual)}
            </div>

            <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between border-b border-slate-800 pb-1">
                <span className="text-slate-400">Código ERP / SAP:</span>
                <span className="font-mono text-slate-200">{elemento.codigo_equipo_erp || 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1">
                <span className="text-slate-400">Tipo de Activo:</span>
                <span className="capitalize text-slate-200">{elemento.tipo_elemento.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1">
                <span className="text-slate-400">Perfil Estructural:</span>
                <span className="font-mono font-bold text-amber-400">{elemento.geometria_parametros.perfil || 'Estándar'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-1">
                <span className="text-slate-400">Superficie geométrica:</span>
                <span className="text-slate-200">{elemento.geometria_parametros.m2_superficie} m²</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenQRModal(elemento)}
              className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg flex items-center justify-center space-x-2 transition shadow-lg"
            >
              <QrCode className="w-4 h-4" />
              <span>Generar Etiqueta QR Imprimible</span>
            </button>
          </div>
        )}
      </div>

      {/* Pie del Drawer */}
      <div className="pt-3 mt-3 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between">
        <span>Cloud: Neon + Backblaze B2</span>
        <span className="font-mono">Escala: {geoCal.metersPerPixel.toFixed(3)} m/px</span>
      </div>
    </aside>
  );
};
