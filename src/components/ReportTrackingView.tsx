import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  MapPin,
  Clock,
  ThumbsUp,
  ShieldCheck,
  Share2,
  Send,
  ShieldAlert,
  HelpCircle,
  ArrowLeft,
  List,
  PlusCircle,
  Printer,
  Bell,
  Calendar,
  Tag,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import {
  ReportItem,
  UserFeedback,
  ThemeAccent,
  ReportNotification,
} from '../types';
import {
  STATUS_LABELS,
  CATEGORY_LABELS,
  CIPUTAT_KELURAHAN_LIST,
} from '../data/mockReports';
import { AntiFraudInfoModal } from './AntiFraudInfoModal';
import { BeforeAfterComparison } from './BeforeAfterComparison';
import { DispositionLetterModal } from './DispositionLetterModal';
import { ReportPhotoGallery } from './ReportPhotoGallery';
import { ReportStatusTimeline } from './ReportStatusTimeline';
import { ReportEstimationCard } from './ReportEstimationCard';
import {
  getReportPhotos,
  getNotificationsForReport,
  getChronologicalTimeline,
  matchesReportTrackingFilter,
  TrackingStatusGroup,
} from '../utils/reportHelpers';
import { generateCitizenShareWhatsAppUrl } from '../utils/whatsappNotification';
import { getThemeColors } from '../utils/themeColors';

const SUBMITTED_FEEDBACK_STORAGE_KEY = 'cigap_submitted_feedback_ids';

const HANDLING_ASPECT_OPTIONS = [
  'Respon Cepat',
  'Hasil Rapi & Tuntas',
  'Petugas Komunikatif',
  'Perlu Peningkatan',
] as const;

const DETAILED_STATUS_OPTIONS: string[] = [
  'diterima',
  'karantina',
  'diverifikasi',
  'dalam_peninjauan',
  'diteruskan_ke_dinas',
  'tindak_lanjut',
  'menunggu_tindak_lanjut',
  'selesai',
  'ditolak',
];

interface ReportTrackingProps {
  reports: ReportItem[];
  notifications?: ReportNotification[];
  isAdmin?: boolean;
  onUpvoteReport: (reportId: string) => void;
  onSubmitFeedback: (reportId: string, feedback: UserFeedback) => Promise<void> | void;
  onMarkNotificationRead?: (notificationId: string) => void;
  onOpenCreateReport: () => void;
  selectedReportId?: string | null;
  elderlyMode?: boolean;
  accent?: ThemeAccent;
}

export const ReportTrackingView: React.FC<ReportTrackingProps> = ({
  reports,
  notifications = [],
  isAdmin = false,
  onUpvoteReport,
  onSubmitFeedback,
  onMarkNotificationRead,
  onOpenCreateReport,
  selectedReportId,
  elderlyMode,
  accent = 'blue',
}) => {
  const themeColors = getThemeColors(accent);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusGroup, setStatusGroup] = useState<TrackingStatusGroup>('all');
  const [detailedStatusFilter, setDetailedStatusFilter] = useState<string>('all');
  const [kelurahanFilter, setKelurahanFilter] = useState<string>('all');
  const [activeReportId, setActiveReportId] = useState<string | null>(
    selectedReportId || (reports[0]?.id ?? null)
  );
  const [mobileTab, setMobileTab] = useState<'list' | 'detail'>(
    selectedReportId ? 'detail' : 'list'
  );
  const [isAntiFraudModalOpen, setIsAntiFraudModalOpen] = useState(false);
  const [isDispositionModalOpen, setIsDispositionModalOpen] = useState(false);

  // Sync active report whenever parent navigates to a specific report ID
  useEffect(() => {
    if (selectedReportId) {
      setActiveReportId(selectedReportId);
      setMobileTab('detail');
    }
  }, [selectedReportId]);

  // Close admin-only modals if officer session is locked
  useEffect(() => {
    if (!isAdmin && isDispositionModalOpen) {
      setIsDispositionModalOpen(false);
    }
  }, [isAdmin, isDispositionModalOpen]);

  // Feedback form state for active report
  const [ratingVal, setRatingVal] = useState(5);
  const [handlingAspect, setHandlingAspect] = useState<string>('Respon Cepat');
  const [commentVal, setCommentVal] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccessMsg, setFeedbackSuccessMsg] = useState<string | null>(null);
  const [submittedFeedbackIds, setSubmittedFeedbackIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(SUBMITTED_FEEDBACK_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string');
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });

  // Reset transient feedback inputs when switching reports
  useEffect(() => {
    setRatingVal(5);
    setHandlingAspect('Respon Cepat');
    setCommentVal('');
    setReviewerName('');
    setFeedbackError(null);
    setFeedbackSuccessMsg(null);
  }, [activeReportId]);

  // Filter reports using shared unified criteria
  const filteredReports = useMemo(
    () =>
      reports.filter((r) =>
        matchesReportTrackingFilter(r, {
          searchTerm,
          statusGroup,
          detailedStatus: detailedStatusFilter,
          kelurahan: kelurahanFilter,
        })
      ),
    [reports, searchTerm, statusGroup, detailedStatusFilter, kelurahanFilter]
  );

  // Status group counts (respecting current search & kelurahan filter so counts feel helpful and truthful)
  const groupCounts = useMemo(() => {
    const base = reports.filter((r) =>
      matchesReportTrackingFilter(r, {
        searchTerm,
        kelurahan: kelurahanFilter,
      })
    );
    return {
      all: base.length,
      active: base.filter((r) =>
        matchesReportTrackingFilter(r, { statusGroup: 'active' })
      ).length,
      attention: base.filter((r) =>
        matchesReportTrackingFilter(r, { statusGroup: 'attention' })
      ).length,
      resolved: base.filter((r) =>
        matchesReportTrackingFilter(r, { statusGroup: 'resolved' })
      ).length,
    };
  }, [reports, searchTerm, kelurahanFilter]);

  const activeReport =
    reports.find((r) => r.id === activeReportId) ||
    filteredReports[0] ||
    reports[0] ||
    null;

  const hasActiveFilter =
    searchTerm.trim() !== '' ||
    statusGroup !== 'all' ||
    detailedStatusFilter !== 'all' ||
    kelurahanFilter !== 'all';

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusGroup('all');
    setDetailedStatusFilter('all');
    setKelurahanFilter('all');
  };

  const handleSelectMainGroup = (group: TrackingStatusGroup) => {
    setStatusGroup(group);
    setDetailedStatusFilter('all');
  };

  const handleSelectDetailedStatus = (val: string) => {
    setDetailedStatusFilter(val);
    if (val !== 'all') {
      setStatusGroup('all');
    }
  };

  const handleSendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReport || activeReport.status !== 'selesai') return;
    if (activeReport.feedback || submittedFeedbackIds.includes(activeReport.id)) {
      setFeedbackError('Ulasan untuk laporan ini sudah pernah dikirim dan tercatat.');
      return;
    }

    setFeedbackError(null);
    setFeedbackSuccessMsg(null);
    setIsSubmittingFeedback(true);

    const newFeedback: UserFeedback = {
      rating: ratingVal,
      handlingAspect,
      comment:
        commentVal.trim() ||
        `Penilaian warga: ${handlingAspect}. Terima kasih atas penanganan laporan ini.`,
      createdAt: 'Baru saja',
      civicName: reviewerName.trim() || 'Warga Ciputat',
      upvotes: 0,
    };

    try {
      await onSubmitFeedback(activeReport.id, newFeedback);
      const nextSubmitted = Array.from(
        new Set([...submittedFeedbackIds, activeReport.id])
      );
      setSubmittedFeedbackIds(nextSubmitted);
      try {
        localStorage.setItem(
          SUBMITTED_FEEDBACK_STORAGE_KEY,
          JSON.stringify(nextSubmitted)
        );
      } catch {
        // ignore storage errors
      }
      setCommentVal('');
      setFeedbackSuccessMsg('Terima kasih! Ulasan dan penilaian Anda telah tersimpan.');
    } catch (err) {
      setFeedbackError(
        err instanceof Error
          ? err.message
          : 'Gagal mengirim ulasan. Silakan coba beberapa saat lagi.'
      );
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const mainStatusChips: Array<{ id: TrackingStatusGroup; label: string; count: number }> = [
    { id: 'all', label: 'Semua Laporan', count: groupCounts.all },
    { id: 'active', label: 'Aktif', count: groupCounts.active },
    { id: 'attention', label: 'Perlu Perhatian', count: groupCounts.attention },
    { id: 'resolved', label: 'Selesai', count: groupCounts.resolved },
  ];

  // Derived evidence metadata for active report
  const reporterPhotos = activeReport ? getReportPhotos(activeReport) : [];
  const chronologicalSteps = activeReport ? getChronologicalTimeline(activeReport) : [];
  const resolvedStep = chronologicalSteps
    .slice()
    .reverse()
    .find((step) => step.status === 'selesai' || Boolean(step.photoUrl));
  const beforeDate = reporterPhotos[0]?.uploadedAt || activeReport?.createdAt;
  const afterDate = resolvedStep?.timestamp || activeReport?.updatedAt;
  const actionNote = resolvedStep?.description || activeReport?.adminNotes;

  const isCompletedActive = activeReport?.status === 'selesai';
  const alreadyRatedLocally = activeReport
    ? submittedFeedbackIds.includes(activeReport.id)
    : false;

  return (
    <div className="space-y-5 overflow-x-hidden">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-sky-900 text-white rounded-3xl p-5 sm:p-7 shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-2.5">
          <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-200 border border-sky-400/30">
            Transparansi Pelayanan Publik Ciputat
          </span>
          <h1
            className={`${
              elderlyMode ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'
            } font-extrabold tracking-tight text-white`}
          >
            Lacak Status &amp; Riwayat Pengaduan
          </h1>
          <p
            className={`${
              elderlyMode ? 'text-base' : 'text-xs sm:text-sm'
            } text-slate-200 leading-relaxed`}
          >
            Pantau perkembangan penanganan pengaduan secara terbuka mulai dari laporan diterima, tindak lanjut dinas, hingga bukti penyelesaian di lapangan.
          </p>

          {/* Search bar within banner */}
          <div className="pt-1.5 max-w-xl">
            <div className="relative">
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                size={17}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari nomor tiket (#CPT-...), judul, atau nama jalan..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white placeholder-slate-300 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Primary 4 Status Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
              <Filter size={13} /> Status:
            </span>
            {mainStatusChips.map((chip) => {
              const isChipSelected =
                detailedStatusFilter === 'all' && statusGroup === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => handleSelectMainGroup(chip.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isChipSelected
                      ? `${themeColors.primaryBtn} text-white shadow-xs`
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{chip.label}</span>
                  <span
                    className={`font-mono tabular-nums text-[10px] px-1.5 py-0.2 rounded-md ${
                      isChipSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Action CTA */}
          <button
            type="button"
            onClick={onOpenCreateReport}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold ${themeColors.primaryBtn} text-white flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0`}
          >
            <PlusCircle size={14} />
            <span>Buat Laporan</span>
          </button>
        </div>

        {/* Advanced Status Dropdown + Kelurahan Filter */}
        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-semibold">
                Status Rinci:
              </span>
              <select
                value={detailedStatusFilter}
                onChange={(e) => handleSelectDetailedStatus(e.target.value)}
                aria-label="Filter status lanjutan"
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="all">Semua Status Rinci</option>
                {DETAILED_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABELS[st]?.shortLabel || STATUS_LABELS[st]?.label || st} —{' '}
                    {STATUS_LABELS[st]?.label || st}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-semibold">
                Kelurahan:
              </span>
              <select
                value={kelurahanFilter}
                onChange={(e) => setKelurahanFilter(e.target.value)}
                aria-label="Filter wilayah kelurahan"
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="all">Semua Kelurahan (7)</option>
                {CIPUTAT_KELURAHAN_LIST.map((k) => (
                  <option key={k} value={k}>
                    Kelurahan {k}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>Reset Filter</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Tab Switcher (Visible only on < lg) */}
      <div className="lg:hidden flex rounded-2xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setMobileTab('list')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            mobileTab === 'list'
              ? `bg-white dark:bg-slate-900 ${themeColors.textAccent} shadow-xs`
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <List size={14} />
          <span>Daftar Laporan ({filteredReports.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('detail')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            mobileTab === 'detail'
              ? `bg-white dark:bg-slate-900 ${themeColors.textAccent} shadow-xs`
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Clock size={14} />
          <span className="truncate">
            Detail {activeReport ? `#${activeReport.id}` : 'Laporan'}
          </span>
        </button>
      </div>

      {/* 2-Column Desktop Layout: Left List (5 cols), Right Detail (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Side: Report Cards List */}
        <div
          className={`lg:col-span-5 space-y-3 min-w-0 ${
            mobileTab === 'detail' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              Menampilkan {filteredReports.length} laporan
            </span>
            <button
              type="button"
              onClick={onOpenCreateReport}
              className={`text-xs font-bold ${themeColors.textAccent} hover:underline cursor-pointer`}
            >
              + Buat Laporan Baru
            </button>
          </div>

          {filteredReports.length === 0 ? (
            <div className="p-7 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                Tidak ada laporan yang cocok dengan filter status atau kelurahan yang dipilih.
              </p>
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold ${themeColors.badge} cursor-pointer`}
                >
                  Tampilkan Semua Laporan
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredReports.map((item) => {
                const isSelected = activeReport?.id === item.id;
                const statusInfo = STATUS_LABELS[item.status];
                const categoryInfo = CATEGORY_LABELS[item.category];
                const shortDate = item.createdAt.split(',')[0] || item.createdAt;

                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setActiveReportId(item.id);
                      setMobileTab('detail');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveReportId(item.id);
                        setMobileTab('detail');
                      }
                    }}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all text-left ${
                      isSelected
                        ? `bg-white dark:bg-slate-900 ${themeColors.cardBorderActive} ring-1 ring-sky-500/20`
                        : 'bg-white dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {/* Card Top Row: Ticket + Status + Date */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span
                          className={`font-mono tabular-nums text-xs font-bold ${themeColors.textAccent}`}
                        >
                          #{item.id}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                            statusInfo?.badgeClass || ''
                          }`}
                        >
                          {statusInfo?.shortLabel || item.status}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                        {shortDate}
                      </span>
                    </div>

                    {/* Title (max 2 lines cleanly) */}
                    <h3
                      className={`${
                        elderlyMode ? 'text-base' : 'text-sm'
                      } font-bold text-slate-900 dark:text-white mt-2 line-clamp-2 leading-snug`}
                    >
                      {item.title}
                    </h3>

                    {/* Location & Kelurahan */}
                    <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5 mt-1.5 min-w-0">
                      <MapPin size={12} className="text-rose-500 shrink-0" />
                      <span className="truncate">
                        Kel. {item.kelurahan} • {item.locationName}
                      </span>
                    </p>

                    {/* Footer: Category + Single Upvote Count */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1 truncate">
                        <Tag size={11} className="text-slate-400 shrink-0" />
                        <span className="truncate">
                          {categoryInfo?.label || item.category}
                        </span>
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpvoteReport(item.id);
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 ${themeColors.hoverSubtleBg} text-slate-700 dark:text-slate-200 ${themeColors.hoverText} text-[11px] font-bold font-mono tabular-nums shrink-0 cursor-pointer transition-colors`}
                        title="Dukung laporan ini"
                      >
                        <ThumbsUp size={12} />
                        <span>{item.upvotes}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Active Detailed Tracking Inspector */}
        <div
          className={`lg:col-span-7 min-w-0 ${
            mobileTab === 'list' ? 'hidden lg:block' : 'block'
          }`}
        >
          {activeReport ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-6 space-y-6">
              {/* Mobile Back Button to list */}
              <button
                type="button"
                onClick={() => setMobileTab('list')}
                className={`lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold ${themeColors.badge} cursor-pointer`}
              >
                <ArrowLeft size={14} />
                <span>Kembali ke Daftar Laporan</span>
              </button>

              {/* Detail Header with Clear Hierarchy */}
              <div className="border-b border-slate-200 dark:border-slate-800 pb-5 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`font-mono tabular-nums text-xs font-bold ${themeColors.badge} px-2.5 py-1 rounded-lg`}
                  >
                    #{activeReport.id}
                  </span>
                  <span
                    className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full border ${
                      STATUS_LABELS[activeReport.status]?.badgeClass || ''
                    }`}
                  >
                    {STATUS_LABELS[activeReport.status]?.label || activeReport.status}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                      CATEGORY_LABELS[activeReport.category]?.color ||
                      'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {CATEGORY_LABELS[activeReport.category]?.label || activeReport.category}
                  </span>
                  {activeReport.subtype && (
                    <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {activeReport.subtype}
                    </span>
                  )}
                </div>

                {/* Moderately sized, crisp detail title */}
                <h2
                  className={`${
                    elderlyMode ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'
                  } font-bold text-slate-900 dark:text-white leading-snug break-words`}
                >
                  {activeReport.title}
                </h2>

                {/* Location & Date Metadata */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-200/70 dark:border-slate-800">
                  <div className="flex items-start gap-2 min-w-0">
                    <MapPin size={14} className="text-rose-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white break-words">
                        {activeReport.locationName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Kelurahan {activeReport.kelurahan}, Kec. Ciputat
                      </div>
                      {activeReport.landmarkNote && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Patokan: {activeReport.landmarkNote}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Calendar
                      size={14}
                      className="text-sky-600 dark:text-sky-400 shrink-0 mt-0.5"
                    />
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Tanggal Laporan Masuk
                      </div>
                      <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                        {activeReport.createdAt}
                      </div>
                    </div>
                  </div>
                </div>

                {activeReport.serviceAreaStatus === 'luar_wilayah' && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[11px] font-semibold">
                    Titik laporan berada di luar batas wilayah layanan Kec. Ciputat (ditinjau petugas).
                  </div>
                )}

                {/* Officer-Only Verification Audit Pill (NEVER rendered to citizens) */}
                {isAdmin && activeReport.verification && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 ${
                        activeReport.verification.isSuspectedFake
                          ? 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200'
                          : activeReport.verification.trustScore >= 80
                          ? themeColors.badge
                          : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200'
                      }`}
                    >
                      {activeReport.verification.isSuspectedFake ? (
                        <ShieldAlert size={13} />
                      ) : (
                        <ShieldCheck size={13} />
                      )}
                      <span className="font-mono tabular-nums">
                        Audit Petugas: Indeks Keaslian {activeReport.verification.trustScore}% (
                        {activeReport.verification.verdict === 'valid'
                          ? 'Terverifikasi Asli'
                          : activeReport.verification.verdict === 'perlu_tinjauan'
                          ? 'Pemeriksaan Tambahan'
                          : 'Karantina Pemeriksaan'}
                        )
                      </span>
                    </span>
                  </div>
                )}

                {/* Citizen vs Officer Action Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {/* Citizen Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={generateCitizenShareWhatsAppUrl(activeReport)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-xs text-white flex items-center gap-1.5 transition-colors shadow-xs"
                      title="Bagikan progres laporan ini ke WhatsApp"
                    >
                      <Share2 size={14} />
                      <span>Bagikan WA</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => onUpvoteReport(activeReport.id)}
                      className={`px-3.5 py-2 rounded-xl ${themeColors.badge} hover:opacity-90 font-bold text-xs font-mono tabular-nums flex items-center gap-1.5 cursor-pointer`}
                      title="Berikan dukungan untuk laporan ini"
                    >
                      <ThumbsUp size={14} />
                      <span>Dukung ({activeReport.upvotes})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsAntiFraudModalOpen(true)}
                      className="px-2.5 py-2 rounded-xl text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <HelpCircle size={13} />
                      <span>Alur Verifikasi</span>
                    </button>
                  </div>

                  {/* Officer-Only Action: Cetak Disposisi */}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setIsDispositionModalOpen(true)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                      title="Cetak Berita Acara & Lembar Disposisi Resmi (Khusus Petugas)"
                    >
                      <Printer size={14} />
                      <span>Cetak Disposisi</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Section A & B: Bukti Penanganan & Galeri Foto Pelapor (Tanpa Duplikasi) */}
              <div className="space-y-5">
                {activeReport.resolvedPhotoUrl ? (
                  <>
                    <BeforeAfterComparison
                      beforeUrl={reporterPhotos[0]?.url}
                      afterUrl={activeReport.resolvedPhotoUrl}
                      beforeDate={beforeDate}
                      afterDate={afterDate}
                      actionNote={actionNote}
                      category={activeReport.category}
                      title={activeReport.title}
                      accent={accent}
                      elderlyMode={elderlyMode}
                    />

                    {reporterPhotos.length > 1 && (
                      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Galeri Foto Pelapor ({reporterPhotos.length})
                        </h4>
                        <ReportPhotoGallery report={activeReport} />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Galeri Foto Pelapor ({reporterPhotos.length})
                    </h4>
                    <ReportPhotoGallery report={activeReport} />
                  </div>
                )}
              </div>

              {/* Informasi Dinas Penanggung Jawab & Estimasi / Penyelesaian Aktual */}
              <ReportEstimationCard report={activeReport} />

              {/* Uraian Pengaduan Warga */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Deskripsi Pengaduan Warga
                </div>
                <p
                  className={`${
                    elderlyMode ? 'text-base' : 'text-xs sm:text-sm'
                  } text-slate-700 dark:text-slate-200 leading-relaxed break-words`}
                >
                  {activeReport.description}
                </p>
              </div>

              {/* Progress Penanganan & Riwayat Proses */}
              <ReportStatusTimeline report={activeReport} isAdmin={isAdmin} />

              {/* Notification History for this Report */}
              {(() => {
                const reportNotifs = getNotificationsForReport(
                  notifications,
                  activeReport.id
                );
                return (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Bell size={14} className={themeColors.textAccent} />
                      <span>Notifikasi Laporan ({reportNotifs.length})</span>
                    </h4>
                    {reportNotifs.length === 0 ? (
                      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                        Tidak ada pembaruan notifikasi untuk laporan ini.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {reportNotifs.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => {
                              if (!n.isRead && onMarkNotificationRead) {
                                onMarkNotificationRead(n.id);
                              }
                            }}
                            className={`p-3 rounded-2xl border text-xs flex items-start justify-between gap-2.5 transition-colors ${
                              !n.isRead
                                ? 'bg-sky-50/80 dark:bg-sky-950/35 border-sky-200 dark:border-sky-800 cursor-pointer hover:bg-sky-50'
                                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    !n.isRead
                                      ? 'bg-sky-600 text-white'
                                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  {!n.isRead ? 'Baru' : 'Dibaca'}
                                </span>
                                <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                                  {n.timestamp}
                                </span>
                              </div>
                              <div className="font-semibold text-slate-900 dark:text-white leading-snug">
                                {n.message}
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                                STATUS_LABELS[n.status]?.badgeClass || ''
                              }`}
                            >
                              {STATUS_LABELS[n.status]?.shortLabel || n.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Ulasan & Penilaian Masyarakat (HANYA muncul jika status === 'selesai') */}
              {isCompletedActive && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <span>Ulasan &amp; Penilaian Masyarakat</span>
                    </h4>
                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      Laporan Tuntas
                    </span>
                  </div>

                  {/* Existing Public Review */}
                  {activeReport.feedback ? (
                    <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/70 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-xs font-bold font-mono tabular-nums text-amber-900 dark:text-amber-300">
                            Penilaian: {activeReport.feedback.rating}.0 / 5.0
                          </span>
                          {activeReport.feedback.handlingAspect && (
                            <span className="px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                              {activeReport.feedback.handlingAspect}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {activeReport.feedback.createdAt}
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                        &ldquo;{activeReport.feedback.comment}&rdquo;
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-amber-200/60 dark:border-amber-800/40">
                        <span className="font-semibold">
                          Pelapor / Warga: {activeReport.feedback.civicName}
                        </span>
                        <span>Satu penilaian per laporan telah tercatat</span>
                      </div>
                    </div>
                  ) : alreadyRatedLocally ? (
                    <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 font-semibold flex items-center gap-2">
                      <CheckCircle2 size={15} className="shrink-0" />
                      <span>
                        Anda sudah memberikan penilaian untuk laporan ini. Terima kasih atas partisipasi Anda.
                      </span>
                    </div>
                  ) : (
                    /* Completed Report Review Form */
                    <form
                      onSubmit={handleSendFeedback}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3"
                    >
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Berikan penilaian Anda terhadap hasil penanganan laporan yang telah selesai:
                      </div>

                      {/* Numeric satisfaction rating selector */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((score) => (
                          <button
                            key={score}
                            type="button"
                            onClick={() => setRatingVal(score)}
                            className={`w-8 h-8 rounded-xl text-xs font-black font-mono tabular-nums border transition-all cursor-pointer ${
                              score <= ratingVal
                                ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:border-amber-400'
                            }`}
                          >
                            {score}
                          </button>
                        ))}
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 ml-2 font-mono tabular-nums">
                          {ratingVal}/5 ({ratingVal === 5 ? 'Sangat Puas' : ratingVal >= 4 ? 'Puas' : ratingVal === 3 ? 'Cukup' : 'Kurang Puas'})
                        </span>
                      </div>

                      {/* Handling quality assessment */}
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          Penilaian Penanganan:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {HANDLING_ASPECT_OPTIONS.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setHandlingAspect(opt)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                                handlingAspect === opt
                                  ? `${themeColors.badge}`
                                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={reviewerName}
                          onChange={(e) => setReviewerName(e.target.value)}
                          placeholder="Nama Anda (opsional, misal: Warga Ciputat)"
                          className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                        <input
                          type="text"
                          value={commentVal}
                          onChange={(e) => setCommentVal(e.target.value)}
                          placeholder="Tulis komentar tambahan (opsional)..."
                          className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                      </div>

                      {feedbackError && (
                        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                          <AlertCircle size={14} className="shrink-0" />
                          <span>{feedbackError}</span>
                        </div>
                      )}

                      {feedbackSuccessMsg && (
                        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle2 size={14} className="shrink-0" />
                          <span>{feedbackSuccessMsg}</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isSubmittingFeedback}
                        className={`px-4 py-2 rounded-xl text-xs font-bold ${themeColors.primaryBtn} text-white flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-60`}
                      >
                        <Send size={13} />
                        <span>
                          {isSubmittingFeedback ? 'Mengirim Penilaian...' : 'Kirim Penilaian Warga'}
                        </span>
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-slate-500 text-sm">
              Pilih salah satu laporan di sebelah kiri untuk melihat detail pelacakan lengkap.
            </div>
          )}
        </div>
      </div>

      {/* Modal Edukasi Anti-Laporan Palsu */}
      <AntiFraudInfoModal
        isOpen={isAntiFraudModalOpen}
        onClose={() => setIsAntiFraudModalOpen(false)}
        elderlyMode={elderlyMode}
      />

      {/* Modal Cetak Berita Acara & Lembar Disposisi Resmi (HANYA untuk petugas terautentikasi) */}
      {isAdmin && (
        <DispositionLetterModal
          isOpen={isDispositionModalOpen}
          report={activeReport}
          onClose={() => setIsDispositionModalOpen(false)}
          accent={accent}
        />
      )}
    </div>
  );
};
