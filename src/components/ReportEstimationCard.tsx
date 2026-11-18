import React from 'react';
import {
  Building2,
  Calendar,
  Clock,
  Hourglass,
  AlertTriangle,
  UserCheck,
  Info,
  CheckCircle2,
  Timer,
  ClipboardCheck,
} from 'lucide-react';
import { ReportItem } from '../types';
import {
  getEstimationSummary,
  getActualCompletionInfo,
  getAgencyAssignmentInfo,
} from '../utils/reportHelpers';
import { STATUS_LABELS } from '../data/mockReports';

interface ReportEstimationCardProps {
  report: ReportItem;
  showAgencyBox?: boolean;
}

export const ReportEstimationCard: React.FC<ReportEstimationCardProps> = ({
  report,
  showAgencyBox = true,
}) => {
  const est = getEstimationSummary(report);
  const completionInfo = getActualCompletionInfo(report);
  const agency = getAgencyAssignmentInfo(report);
  const statusInfo = STATUS_LABELS[report.status];
  const isCompleted = report.status === 'selesai';

  return (
    <div className="space-y-3">
      {/* 1. Informasi Dinas & Penugasan */}
      {showAgencyBox && (
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2.5">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 shrink-0">
                <Building2 size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Informasi Dinas &amp; Penugasan
                </div>
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug mt-0.5">
                  {agency.department}
                </div>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border shrink-0 ${
                statusInfo?.badgeClass || ''
              }`}
            >
              {statusInfo?.shortLabel || report.status}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-700/70 text-xs">
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                Status Penugasan
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {agency.assignmentStatus}
              </span>
            </div>

            {agency.assignedAt && (
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Tanggal Penugasan
                </span>
                <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                  {agency.assignedAt}
                </span>
              </div>
            )}

            {agency.officerName && (
              <div className="sm:col-span-2 flex items-center gap-1.5 pt-0.5">
                <UserCheck
                  size={14}
                  className="text-emerald-600 dark:text-emerald-400 shrink-0"
                />
                <span className="text-slate-500 dark:text-slate-400">Petugas:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {agency.officerName}
                </span>
              </div>
            )}
          </div>

          {report.adminNotes && (
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/70 text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
              <span className="font-bold text-slate-900 dark:text-white">
                Catatan Tindak Lanjut:{' '}
              </span>
              <span>{report.adminNotes}</span>
            </div>
          )}
        </div>
      )}

      {/* 2. Estimasi Penyelesaian (Aktif) ATAU Informasi Penyelesaian Aktual (Selesai) */}
      <div
        className={`p-4 rounded-2xl border space-y-2.5 ${
          est.isDelayed
            ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/80'
            : isCompleted
            ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/80'
            : 'bg-sky-50/60 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/70'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
            {isCompleted ? (
              <CheckCircle2
                size={15}
                className="text-emerald-600 dark:text-emerald-400 shrink-0"
              />
            ) : (
              <Hourglass
                size={14}
                className="text-sky-600 dark:text-sky-400 shrink-0"
              />
            )}
            <span>
              {isCompleted
                ? 'Ringkasan Penyelesaian Aktual'
                : 'Estimasi Waktu Penyelesaian'}
            </span>
          </div>
          {isCompleted ? (
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white">
              Tuntas
            </span>
          ) : (
            est.hasEstimate &&
            report.status !== 'ditolak' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                Perkiraan
              </span>
            )
          )}
        </div>

        {/* Completed report details: actual date, handling duration, work result */}
        {isCompleted ? (
          <div className="space-y-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {completionInfo.completedAt && (
                <div className="flex items-start gap-2">
                  <Calendar
                    size={14}
                    className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                  />
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Tanggal Selesai Aktual
                    </div>
                    <div className="font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {completionInfo.completedAt}
                    </div>
                  </div>
                </div>
              )}

              {completionInfo.durationText && (
                <div className="flex items-start gap-2">
                  <Timer
                    size={14}
                    className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                  />
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Durasi Penanganan
                    </div>
                    <div className="font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {completionInfo.durationText}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {completionInfo.workResult && (
              <div className="pt-2 border-t border-emerald-200/70 dark:border-emerald-800/60 flex items-start gap-2">
                <ClipboardCheck
                  size={14}
                  className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                />
                <div className="leading-relaxed text-slate-700 dark:text-slate-200">
                  <span className="font-bold text-slate-900 dark:text-white">
                    Hasil Pekerjaan:{' '}
                  </span>
                  <span>{completionInfo.workResult}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Delay Alert Banner */}
            {est.delayNotice && (
              <div className="p-2.5 rounded-xl bg-amber-100/80 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2 font-semibold">
                <AlertTriangle
                  size={14}
                  className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                />
                <span>{est.delayNotice}</span>
              </div>
            )}

            {/* Main Estimate */}
            {est.hasEstimate && est.formattedTargetDate ? (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <Calendar
                    size={14}
                    className="text-sky-600 dark:text-sky-400 shrink-0"
                  />
                  <span>
                    Target selesai: {est.formattedTargetDate}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                  <Clock size={14} className="text-amber-500 shrink-0" />
                  <span>{est.remainingText}</span>
                </div>
              </div>
            ) : (
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-start gap-2">
                <Clock size={14} className="text-slate-400 shrink-0 mt-0.5" />
                <span>{est.remainingText}</span>
              </div>
            )}
          </>
        )}

        {/* Dates metadata */}
        <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <div>
            <span className="font-semibold">Diterima:</span>{' '}
            <span className="font-mono tabular-nums">{report.createdAt}</span>
          </div>
          <div>
            <span className="font-semibold">Diperbarui:</span>{' '}
            <span className="font-mono tabular-nums">
              {report.estimatedUpdatedAt || report.updatedAt || report.createdAt}
            </span>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
          <Info size={12} className="shrink-0 mt-0.5 text-slate-400" />
          <span>{est.disclaimer}</span>
        </div>
      </div>
    </div>
  );
};
