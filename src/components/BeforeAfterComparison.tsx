import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Sliders,
  Columns,
  Maximize2,
  X,
  ArrowLeftRight,
  Calendar,
  FileText,
} from 'lucide-react';
import { ThemeAccent, ReportCategory } from '../types';

interface BeforeAfterComparisonProps {
  beforeUrl?: string;
  afterUrl?: string;
  beforeDate?: string;
  afterDate?: string;
  actionNote?: string;
  category: ReportCategory;
  title: string;
  accent?: ThemeAccent;
  elderlyMode?: boolean;
}

export const BeforeAfterComparison: React.FC<BeforeAfterComparisonProps> = ({
  beforeUrl,
  afterUrl,
  beforeDate,
  afterDate,
  actionNote,
  title,
}) => {
  const [viewMode, setViewMode] = useState<'side' | 'slider'>('side');
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [zoomTarget, setZoomTarget] = useState<'before' | 'after'>(
    beforeUrl ? 'before' : 'after'
  );

  // Only after photo exists (reporter did not attach initial photo)
  if (!beforeUrl && afterUrl) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 size={14} />
            <span>Bukti Hasil Penanganan Petugas</span>
          </div>
          {afterDate && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums flex items-center gap-1">
              <Calendar size={12} />
              <span>{afterDate}</span>
            </span>
          )}
        </div>

        <div className="relative rounded-2xl overflow-hidden border border-emerald-200 dark:border-emerald-800 bg-slate-100 dark:bg-slate-800 group">
          <img
            src={afterUrl}
            alt="Foto Hasil Penanganan Petugas"
            className="w-full h-56 sm:h-64 object-cover cursor-zoom-in transition-transform duration-300 group-hover:scale-[1.02]"
            referrerPolicy="no-referrer"
            onClick={() => {
              setZoomTarget('after');
              setIsZoomOpen(true);
            }}
          />
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600/95 text-white shadow-sm">
            Sesudah Penanganan
          </div>
          <button
            type="button"
            onClick={() => {
              setZoomTarget('after');
              setIsZoomOpen(true);
            }}
            className="absolute bottom-3 right-3 p-2 rounded-xl bg-black/65 hover:bg-black/85 text-white backdrop-blur-sm transition-colors cursor-pointer"
            title="Perbesar Foto"
          >
            <Maximize2 size={15} />
          </button>
        </div>

        {actionNote && (
          <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 text-xs text-slate-700 dark:text-slate-200 flex items-start gap-2">
            <FileText size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-900 dark:text-white">Keterangan Tindakan: </span>
              <span>{actionNote}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Only before photo exists (no officer resolution photo yet)
  if (beforeUrl && !afterUrl) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <AlertCircle size={14} className="text-amber-500" />
            Dokumentasi Bukti Lapangan
          </span>
          {beforeDate && (
            <span className="text-[11px] font-mono tabular-nums font-normal normal-case">
              {beforeDate}
            </span>
          )}
        </div>
        <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 group">
          <img
            src={beforeUrl}
            alt="Foto Kondisi Awal Masalah"
            className="w-full h-56 sm:h-64 object-cover group-hover:scale-[1.02] transition-transform duration-300 cursor-zoom-in"
            referrerPolicy="no-referrer"
            onClick={() => {
              setZoomTarget('before');
              setIsZoomOpen(true);
            }}
          />
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-600/95 text-white shadow-sm">
            Kondisi Awal (Aduan Warga)
          </div>
          <button
            type="button"
            onClick={() => {
              setZoomTarget('before');
              setIsZoomOpen(true);
            }}
            className="absolute bottom-3 right-3 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-colors cursor-pointer"
            title="Perbesar Foto"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    );
  }

  if (!beforeUrl && !afterUrl) {
    return null;
  }

  // Both Before & After photos exist
  return (
    <div className="space-y-3">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Bukti Sebelum &amp; Sesudah Penanganan</span>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">
          <button
            type="button"
            onClick={() => setViewMode('side')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'side'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Columns size={13} />
            <span>Berdampingan</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('slider')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'slider'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sliders size={13} />
            <span>Slider Belah</span>
          </button>
        </div>
      </div>

      {/* Mode 1: Side-by-Side View */}
      {viewMode === 'side' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Sebelum */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Sebelum Penanganan
              </span>
              {beforeDate && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                  {beforeDate}
                </span>
              )}
            </div>
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 group h-48 sm:h-56">
              <img
                src={beforeUrl}
                alt="Kondisi Awal Laporan"
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300 cursor-zoom-in"
                referrerPolicy="no-referrer"
                onClick={() => {
                  setZoomTarget('before');
                  setIsZoomOpen(true);
                }}
              />
              <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-rose-600/95 text-white shadow-sm">
                Kondisi Awal
              </div>
              <button
                type="button"
                onClick={() => {
                  setZoomTarget('before');
                  setIsZoomOpen(true);
                }}
                className="absolute bottom-2.5 right-2.5 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm cursor-pointer"
                title="Perbesar foto kondisi awal"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>

          {/* Sesudah */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Sesudah Penanganan
              </span>
              {afterDate && (
                <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-mono tabular-nums truncate">
                  {afterDate}
                </span>
              )}
            </div>
            <div className="relative rounded-2xl overflow-hidden border border-emerald-400/70 dark:border-emerald-700 bg-slate-100 dark:bg-slate-800 group h-48 sm:h-56">
              <img
                src={afterUrl}
                alt="Hasil Penanganan Petugas"
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300 cursor-zoom-in"
                referrerPolicy="no-referrer"
                onClick={() => {
                  setZoomTarget('after');
                  setIsZoomOpen(true);
                }}
              />
              <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-600/95 text-white shadow-sm flex items-center gap-1">
                <CheckCircle2 size={11} /> Hasil Petugas
              </div>
              <button
                type="button"
                onClick={() => {
                  setZoomTarget('after');
                  setIsZoomOpen(true);
                }}
                className="absolute bottom-2.5 right-2.5 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm cursor-pointer"
                title="Perbesar foto hasil penanganan"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: Interactive Split Slider (pixel-aligned clipPath) */}
      {viewMode === 'slider' && (
        <div className="space-y-2">
          <div className="relative w-full h-64 sm:h-72 rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-900 select-none cursor-ew-resize">
            {/* Background: After (Sesudah) */}
            <img
              src={afterUrl}
              alt="Sesudah Penanganan"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              referrerPolicy="no-referrer"
            />
            <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase bg-emerald-600/95 text-white shadow-sm flex items-center gap-1 pointer-events-none">
              <CheckCircle2 size={12} /> Sesudah
            </div>

            {/* Foreground: Before (Sebelum) using clipPath so geometry stays 1:1 */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
            >
              <img
                src={beforeUrl}
                alt="Sebelum Penanganan"
                className="absolute inset-0 w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase bg-rose-600/95 text-white shadow-sm pointer-events-none">
                Sebelum
              </div>
            </div>

            {/* Split Divider Line & Handle */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.6)] z-20 pointer-events-none flex items-center justify-center"
              style={{ left: `${sliderPosition}%` }}
            >
              <div className="w-8 h-8 -ml-0.5 rounded-full bg-white text-slate-900 shadow-lg flex items-center justify-center border-2 border-sky-600 shrink-0">
                <ArrowLeftRight size={14} />
              </div>
            </div>

            {/* Range Input Overlay for Dragging */}
            <input
              type="range"
              min="0"
              max="100"
              value={sliderPosition}
              onChange={(e) => setSliderPosition(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30"
              aria-label="Geser untuk membandingkan foto sebelum dan sesudah"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
            <span>
              {beforeDate ? `Sebelum: ${beforeDate}` : 'Kondisi Awal'}
            </span>
            <span className="font-mono tabular-nums font-bold text-sky-600 dark:text-sky-400">
              Posisi Slider: {sliderPosition}%
            </span>
            <span>
              {afterDate ? `Sesudah: ${afterDate}` : 'Hasil Petugas'}
            </span>
          </div>
        </div>
      )}

      {/* Keterangan Tindakan */}
      {actionNote && (
        <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-xs text-slate-700 dark:text-slate-200 flex items-start gap-2">
          <FileText size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-slate-900 dark:text-white">Keterangan Tindakan: </span>
            <span>{actionNote}</span>
          </div>
        </div>
      )}

      {/* Lightbox / Zoom Modal */}
      {isZoomOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIsZoomOpen(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white pb-3 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-bold shrink-0 ${
                    zoomTarget === 'before' ? 'bg-rose-600' : 'bg-emerald-600'
                  }`}
                >
                  {zoomTarget === 'before' ? 'SEBELUM PENANGANAN' : 'SESUDAH PENANGANAN'}
                </span>
                <span className="text-xs text-slate-300 font-medium truncate">
                  {title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsZoomOpen(false)}
                className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <img
              src={zoomTarget === 'before' ? beforeUrl : afterUrl}
              alt="Preview Zoom"
              className="max-h-[75vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-white/20"
              referrerPolicy="no-referrer"
            />

            <div className="pt-3 flex flex-wrap items-center justify-center gap-2">
              {beforeUrl && (
                <button
                  type="button"
                  onClick={() => setZoomTarget('before')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    zoomTarget === 'before'
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  Lihat Foto Sebelum{beforeDate ? ` (${beforeDate})` : ''}
                </button>
              )}
              {afterUrl && (
                <button
                  type="button"
                  onClick={() => setZoomTarget('after')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    zoomTarget === 'after'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  Lihat Foto Sesudah{afterDate ? ` (${afterDate})` : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
