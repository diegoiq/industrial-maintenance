'use client';

import React from 'react';
import { X, Eye } from 'lucide-react';

interface Iso4628VisualGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGrade: string;
  onSelectGrade: (grade: string) => void;
}

const ISO_GRADES = [
  {
    grade: 'Ri 0',
    pct: '0%',
    astm: 'ASTM 10',
    title: 'Sin corrosión visible',
    desc: 'Recubrimiento íntegro sin puntos de óxido ni ampollamiento.',
    dots: [] as [number, number, number][]
  },
  {
    grade: 'Ri 1',
    pct: '~0.05%',
    astm: 'ASTM 9',
    title: 'Picaduras aisladas mínimas',
    desc: 'Puntos de óxido muy dispersos (menos de 1 punto por cada 10 cm²).',
    dots: [[25, 28, 2.2], [72, 62, 2], [50, 18, 1.8]] as [number, number, number][]
  },
  {
    grade: 'Ri 2',
    pct: '~0.5%',
    astm: 'ASTM 7–8',
    title: 'Corrosión puntual dispersa',
    desc: 'Manchas puntuales visibles sin descascaramiento generalizado.',
    dots: [
      [18, 22, 3], [45, 32, 2.5], [76, 20, 3],
      [30, 68, 2.8], [66, 74, 3.2], [85, 55, 2.5]
    ] as [number, number, number][]
  },
  {
    grade: 'Ri 3',
    pct: '~1%',
    astm: 'ASTM 6',
    title: 'Óxido moderado localizado',
    desc: 'Núcleos de óxido frecuentes con inicio de ampollamiento en bordes.',
    dots: [
      [15, 20, 4.5], [35, 18, 3.5], [58, 25, 5], [82, 22, 4],
      [22, 52, 5.5], [48, 48, 4], [74, 58, 5], [30, 80, 4.5],
      [62, 82, 5], [86, 78, 3.8]
    ] as [number, number, number][]
  },
  {
    grade: 'Ri 4',
    pct: '~8%',
    astm: 'ASTM 4',
    title: 'Corrosión severa / laminar',
    desc: 'Placas de óxido extendidas y desprendimiento claro de película.',
    dots: [
      [18, 20, 9], [44, 24, 8], [75, 20, 10],
      [24, 54, 11], [54, 52, 9.5], [82, 56, 8.5],
      [18, 82, 8], [48, 80, 10], [78, 82, 9]
    ] as [number, number, number][]
  },
  {
    grade: 'Ri 5',
    pct: '40% – 50%+',
    astm: 'ASTM 1–2',
    title: 'Pérdida crítica / perforación',
    desc: 'Falla generalizada del sistema con oxidación profunda o picado severo.',
    dots: [
      [22, 24, 17], [60, 22, 18], [84, 36, 13],
      [26, 60, 18], [62, 62, 19], [42, 84, 15], [80, 82, 16]
    ] as [number, number, number][]
  }
];

export function Iso4628VisualGuideModal({
  isOpen,
  onClose,
  currentGrade,
  onSelectGrade
}: Iso4628VisualGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl p-4 space-y-3 text-white">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center space-x-2">
            <Eye className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide">Guía Visual ISO 4628 / ASTM D610</h3>
              <p className="text-[11px] text-slate-400">Referencia 100% offline · Tocá un grado para seleccionarlo</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {ISO_GRADES.map((item) => {
            const active = currentGrade === item.grade;
            return (
              <button
                key={item.grade}
                type="button"
                onClick={() => {
                  onSelectGrade(item.grade);
                  onClose();
                }}
                className={`text-left rounded-xl p-2.5 border transition space-y-2 ${
                  active
                    ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/50'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-sm text-amber-400">{item.grade}</span>
                  <span className="text-[10px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-200">
                    {item.pct} · {item.astm}
                  </span>
                </div>

                {/* Esquema SVG offline de densidad de óxido sobre placa pintada */}
                <svg viewBox="0 0 100 100" className="w-full h-20 rounded-lg border border-slate-700 bg-slate-300">
                  <rect width="100" height="100" fill="#cbd5e1" />
                  {item.dots.map(([cx, cy, r], i) => (
                    <g key={i}>
                      <circle cx={cx} cy={cy} r={r * 1.25} fill="#9a3412" opacity={0.45} />
                      <circle cx={cx} cy={cy} r={r} fill="#7c2d12" />
                    </g>
                  ))}
                </svg>

                <div>
                  <span className="text-xs font-bold text-white block leading-tight">{item.title}</span>
                  <span className="text-[10px] text-slate-400 leading-snug block mt-0.5">{item.desc}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
