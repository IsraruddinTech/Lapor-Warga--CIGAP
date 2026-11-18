import React from 'react';
import {
  Check,
  Clock,
  FileCheck2,
  SearchCheck,
  Forward,
  Wrench,
  Hourglass,
  CheckCircle2,
  XCircle,
  Inbox,
  ShieldAlert,
  Lock,
} from 'lucide-react';
import { ReportItem, ReportStatus } from '../types';
import { STATUS_LABELS, STATUS_WORKFLOW_ORDER } from '../data/mockReports';
import {
  computeTimelineStageStates,
  getChronologicalTimeline,
} from '../utils/reportHelpers';

interface ReportStatusTimelineProps {
  report: ReportItem;
  compact?: boolean;
  isAdmin?: boolean;
}

export function getStatusIcon(status: ReportStatus, size = 14) {
  switch (status) {
    case 'diterima':
      return <Inbox size={size} />;
    case 'karantina':
      return <ShieldAlert size={size} />;
    case 'diverifikasi':
      return <FileCheck2 size={size} />;
    case 'dalam_peninjauan':
      return <SearchCheck size={size} />;
    case 'diteruskan_ke_dinas':
      return <Forward size={size} />;
    case 'tindak_lanjut':
      return <Wrench size={size} />;
    case 'menunggu_tindak_lanjut':
      return <Hourglass size={size} />;
    case 'selesai':
      return <CheckCircle2 size={size} />;
    case 'ditolak':
      return <XCircle size={size} />;
    default:
      return <Clock size={size} />;
  }
}

export function getStatusDotBg(status: ReportStatus): string {
  const group = STATUS_LABELS[status]?.markerGroup || 'blue';
  switch (group) {
    case 'blue':
      return 'bg-blue-600 text-white ring-blue-200 dark:ring-blue-900';
    case 'purple':
      return 'bg-purple-600 text-white ring-purple-200 dark:ring-purple-900';
    case 'orange':
      return 'bg-amber-500 text-white ring-amber-200 dark:ring-amber-900';
    case 'green':
      return 'bg-emerald-600 text-white ring-emerald-200 dark:ring-emerald-900';
    case 'red':
      return 'bg-rose-600 text-white ring-rose-200 dark:ring-rose-900';
  }
}

export const ReportStatusTimeline: React.FC<ReportStatusTimelineProps> = ({
  report,
  compact = false,
  isAdmin = false,
}) => {
  const isRejected = report.status === 'ditolak';
  const isQuarantined = report.status === 'karantina';
  const stageStates = computeTimelineStageStates(report, STATUS_WORKFLOW_ORDER);
  const chronologicalSteps = getChronologicalTimeline(report);
  const recordedCount = stageStates.filter((s) => s.isCompleted || s.isCurrent).length;

  return (
    <div className="space-y-4">
      {/* 1. Progress Penanganan (berdasarkan riwayat status sebenarnya) */}
      {isRejected ? (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-extrabold text-rose-700 dark:text-rose-300 uppercase">
            <XCircle size={15} />
            <span>Status: Laporan Ditolak Final</span>
          </div>
          <p className="text-xs text-rose-800 dark:text-rose-200 leading-relaxed">
            <strong>Alasan Penolakan:</strong>{' '}
            {report.rejectionReason ||
              (isAdmin ? report.verification?.rejectionReason : undefined) ||
              report.adminNotes ||
              'Laporan tidak dapat diproses karena data tidak memenuhi ketentuan verifikasi.'}
          </p>
        </div>
      ) : isQuarantined ? (
        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-extrabold text-amber-800 dark:text-amber-300 uppercase">
            <ShieldAlert size={15} />
            <span>Status: Dalam Karantina Pemeriksaan Prioritas</span>
          </div>
          <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            Laporan ini belum ditolak dan sedang menunggu pemeriksaan manual oleh petugas Posko CIGAP untuk memastikan kelengkapan lokasi atau isi laporan sebelum diputuskan diterima atau ditolak.
          </p>
        </div>
      ) : (
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
            <span>Progress Penanganan Laporan</span>
            <span className="text-sky-600 dark:text-sky-400 font-mono tabular-nums">
              {STATUS_LABELS[report.status]?.label || report.status} ({recordedCount} tahapan dilalui)
            </span>
          </div>

          <div
            className={`grid ${
              compact ? 'grid-cols-7 gap-1' : 'grid-cols-4 sm:grid-cols-7 gap-2'
            }`}
          >
            {stageStates.map(({ status: st, isCurrent, isCompleted }) => {
              const info = STATUS_LABELS[st];
              const isCurrentDone = isCurrent && st === 'selesai';

              return (
                <div key={st} className="flex flex-col items-center text-center gap-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all border ${
                      isCurrent
                        ? `${getStatusDotBg(st)} border-white ring-4 shadow-sm`
                        : isCompleted
                        ? 'bg-emerald-500 text-white border-emerald-400'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 border-slate-300 dark:border-slate-600'
                    }`}
                    title={`${info.label} (${
                      isCurrent ? 'Status saat ini' : isCompleted ? 'Sudah dilalui' : 'Belum dilalui'
                    })`}
                  >
                    {(isCompleted || isCurrentDone) && (!isCurrent || isCurrentDone) ? (
                      <Check size={12} strokeWidth={3} />
                    ) : (
                      getStatusIcon(st, 12)
                    )}
                  </div>
                  <span
                    className={`text-[10px] leading-tight font-semibold line-clamp-2 ${
                      isCurrent
                        ? isCurrentDone
                          ? 'text-emerald-700 dark:text-emerald-300 font-bold'
                          : 'text-slate-900 dark:text-white font-bold'
                        : isCompleted
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {info.shortLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Riwayat Proses Kronologis */}
      <div className="space-y-2.5">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Clock size={13} />
          <span>Riwayat Proses ({chronologicalSteps.length})</span>
        </div>

        {chronologicalSteps.length === 0 ? (
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-500">
            Belum ada riwayat perubahan status yang tercatat.
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
            {chronologicalSteps.map((step, idx) => {
              const isLatest = idx === chronologicalSteps.length - 1;
              const statusMeta = STATUS_LABELS[step.status];

              return (
                <div key={step.id} className="relative">
                  <div
                    className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center ${
                      isLatest
                        ? `${getStatusDotBg(step.status)} ring-4 shadow-xs`
                        : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                    }`}
                  >
                    {getStatusIcon(step.status, 11)}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {step.title || statusMeta?.label || step.status}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {step.timestamp}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {step.description}
                    </p>
                    <div className="text-[11px] font-semibold text-sky-700 dark:text-sky-400">
                      Petugas / Kanal: {step.actor}
                    </div>
                    {step.photoUrl && (
                      <div className="mt-1.5 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-w-[220px]">
                        <img
                          src={step.photoUrl}
                          alt="Lampiran dokumentasi tindak lanjut"
                          className="w-full h-24 object-cover"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Catatan Audit Internal (HANYA untuk petugas terautentikasi) */}
      {isAdmin && report.internalNotes && (
        <div className="p-3.5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/80 space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
            <Lock size={12} />
            <span>Informasi Internal Petugas (Tidak Tampil ke Publik)</span>
          </div>
          <p className="text-xs text-purple-900 dark:text-purple-100 leading-relaxed break-words">
            {report.internalNotes}
          </p>
        </div>
      )}
    </div>
  );
};
