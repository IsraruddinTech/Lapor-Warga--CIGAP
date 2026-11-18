import {
  ReportItem,
  ReportNotification,
  ReportPhoto,
  ReportStatus,
  ReportTimelineStep,
} from '../types';

const BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const BULAN_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export type TrackingStatusGroup = 'all' | 'active' | 'attention' | 'resolved';

export const ACTIVE_TRACKING_STATUSES: ReadonlySet<ReportStatus> = new Set([
  'diterima',
  'diverifikasi',
  'dalam_peninjauan',
  'diteruskan_ke_dinas',
  'tindak_lanjut',
]);

export const ATTENTION_TRACKING_STATUSES: ReadonlySet<ReportStatus> = new Set([
  'karantina',
  'menunggu_tindak_lanjut',
  'ditolak',
]);

export function formatWibNow(date: Date = new Date()): string {
  // Format in WIB (Asia/Jakarta)
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    const day = get('day');
    const monthIdx = Math.max(0, Number(get('month')) - 1);
    const year = get('year');
    const hour = get('hour');
    const minute = get('minute');
    return `${day} ${BULAN_SHORT_ID[monthIdx]} ${year}, ${hour}:${minute} WIB`;
  } catch {
    return `${date.getDate()} ${BULAN_SHORT_ID[date.getMonth()]} ${date.getFullYear()} WIB`;
  }
}

export function formatIndonesianDate(isoDate?: string): string | null {
  if (!isoDate) return null;
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDate;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (monthIdx < 0 || monthIdx > 11) return isoDate;
  return `${day} ${BULAN_ID[monthIdx]} ${year}`;
}

export function parseReportTimestampMs(
  iso?: string,
  wibTimestamp?: string
): number | null {
  if (iso) {
    const parsedIso = Date.parse(iso);
    if (!Number.isNaN(parsedIso)) return parsedIso;
  }
  if (!wibTimestamp) return null;

  const trimmed = wibTimestamp.trim();
  const wibMatch = trimmed.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:,\s*(\d{1,2}):(\d{2}))?/
  );
  if (wibMatch) {
    const day = Number(wibMatch[1]);
    const monthToken = wibMatch[2].toLowerCase();
    const year = Number(wibMatch[3]);
    const hour = wibMatch[4] ? Number(wibMatch[4]) : 0;
    const minute = wibMatch[5] ? Number(wibMatch[5]) : 0;

    let monthIdx = BULAN_SHORT_ID.findIndex(
      (m) => m.toLowerCase() === monthToken
    );
    if (monthIdx === -1) {
      monthIdx = BULAN_ID.findIndex((m) => m.toLowerCase() === monthToken);
    }
    if (monthIdx !== -1) {
      // Interpret as WIB (+07:00)
      return Date.UTC(year, monthIdx, day, hour - 7, minute, 0);
    }
  }

  const fallbackParsed = Date.parse(trimmed);
  return Number.isNaN(fallbackParsed) ? null : fallbackParsed;
}

export function formatDurationMsIndonesian(diffMs: number): string | null {
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  const totalMinutes = Math.round(diffMs / 60000);
  if (totalMinutes < 1) return 'Kurang dari 1 menit';
  if (totalMinutes < 60) return `${totalMinutes} menit`;

  const totalHours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    return remMinutes > 0
      ? `${totalHours} jam ${remMinutes} menit`
      : `${totalHours} jam`;
  }

  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days} hari ${remHours} jam` : `${days} hari`;
}

export interface ActualCompletionInfo {
  completedAt: string | null;
  durationText: string | null;
  workResult: string | null;
}

export function getActualCompletionInfo(report: ReportItem): ActualCompletionInfo {
  if (report.status !== 'selesai') {
    return { completedAt: null, durationText: null, workResult: null };
  }

  const timeline = Array.isArray(report.timeline) ? report.timeline : [];
  const doneStep = [...timeline].reverse().find((step) => step.status === 'selesai');

  const completedAt =
    doneStep?.timestamp ||
    report.updatedAt ||
    formatIndonesianDate(report.estimatedCompletionDate) ||
    null;

  const startMs = parseReportTimestampMs(report.createdAtIso, report.createdAt);
  const endMs = parseReportTimestampMs(
    doneStep?.createdAtIso,
    doneStep?.timestamp || report.updatedAt
  );
  const durationText =
    startMs !== null && endMs !== null && endMs >= startMs
      ? formatDurationMsIndonesian(endMs - startMs)
      : null;

  const workResult =
    doneStep?.description?.trim() ||
    report.adminNotes?.trim() ||
    null;

  return {
    completedAt,
    durationText,
    workResult,
  };
}

export interface AgencyAssignmentInfo {
  department: string;
  isAssignedToAgency: boolean;
  assignmentStatus: string;
  assignedAt: string | null;
  officerName: string | null;
}

export function getAgencyAssignmentInfo(report: ReportItem): AgencyAssignmentInfo {
  const timeline = Array.isArray(report.timeline) ? report.timeline : [];
  const rawDept = report.assignedDepartment?.trim() || '';
  const isDefaultPoskoOnly =
    !rawDept ||
    rawDept === 'Posko Pelayanan Cepat Tanggap Ciputat' ||
    rawDept === 'Tim Audit Pemeriksaan Prioritas Posko CIGAP';

  const forwardStep = timeline.find(
    (s) => s.status === 'diteruskan_ke_dinas' || s.status === 'tindak_lanjut'
  );
  const isAssignedToAgency =
    !isDefaultPoskoOnly ||
    ['diteruskan_ke_dinas', 'tindak_lanjut', 'menunggu_tindak_lanjut', 'selesai'].includes(
      report.status
    );

  let assignmentStatus = 'Menunggu Verifikasi & Penugasan Posko';
  if (report.status === 'karantina') {
    assignmentStatus = 'Dalam Pemeriksaan Prioritas Posko';
  } else if (report.status === 'ditolak') {
    assignmentStatus = 'Tidak Diteruskan (Laporan Ditolak)';
  } else if (report.status === 'selesai') {
    assignmentStatus = 'Penugasan Dinas Tuntas';
  } else if (report.status === 'tindak_lanjut') {
    assignmentStatus = 'Sedang Ditangani Petugas Lapangan';
  } else if (report.status === 'menunggu_tindak_lanjut') {
    assignmentStatus = 'Koordinasi / Penjadwalan Lanjutan Dinas';
  } else if (report.status === 'diteruskan_ke_dinas' || isAssignedToAgency) {
    assignmentStatus = 'Telah Diteruskan ke Dinas Terkait';
  } else if (report.status === 'dalam_peninjauan') {
    assignmentStatus = 'Peninjauan Teknis Sebelum Disposisi';
  } else if (report.status === 'diverifikasi') {
    assignmentStatus = 'Terverifikasi — Menunggu Disposisi Dinas';
  }

  return {
    department: rawDept || 'Posko Terpadu CIGAP Kecamatan Ciputat',
    isAssignedToAgency,
    assignmentStatus,
    assignedAt: forwardStep?.timestamp || null,
    officerName: report.officerName?.trim() || null,
  };
}

export interface TimelineStageState {
  status: ReportStatus;
  isCurrent: boolean;
  isCompleted: boolean;
  isUpcoming: boolean;
}

/**
 * Derives visual progress strictly from actual recorded timeline statuses.
 * Never fakes skipped stages as completed.
 */
export function computeTimelineStageStates(
  report: ReportItem,
  workflowOrder: readonly ReportStatus[]
): TimelineStageState[] {
  const timeline = Array.isArray(report.timeline) ? report.timeline : [];
  const recordedStatuses = new Set<ReportStatus>(timeline.map((step) => step.status));

  return workflowOrder.map((st) => {
    const isCurrent = report.status === st;
    const isCompleted = !isCurrent && recordedStatuses.has(st);
    const isUpcoming = !isCurrent && !isCompleted;
    return {
      status: st,
      isCurrent,
      isCompleted,
      isUpcoming,
    };
  });
}

export function getChronologicalTimeline(report: ReportItem): ReportTimelineStep[] {
  const steps = Array.isArray(report.timeline) ? [...report.timeline] : [];
  return steps.sort((a, b) => {
    const msA = parseReportTimestampMs(a.createdAtIso, a.timestamp);
    const msB = parseReportTimestampMs(b.createdAtIso, b.timestamp);
    if (msA !== null && msB !== null && msA !== msB) {
      return msA - msB;
    }
    return 0;
  });
}

export interface ReportTrackingFilterCriteria {
  searchTerm?: string;
  statusGroup?: TrackingStatusGroup;
  detailedStatus?: string;
  kelurahan?: string;
}

export function matchesReportTrackingFilter(
  report: ReportItem,
  criteria: ReportTrackingFilterCriteria
): boolean {
  const search = (criteria.searchTerm || '').trim().toLowerCase();
  const matchesSearch =
    !search ||
    report.id.toLowerCase().includes(search) ||
    report.title.toLowerCase().includes(search) ||
    report.locationName.toLowerCase().includes(search) ||
    report.kelurahan.toLowerCase().includes(search);

  if (!matchesSearch) return false;

  const matchesKelurahan =
    !criteria.kelurahan ||
    criteria.kelurahan === 'all' ||
    report.kelurahan === criteria.kelurahan;

  if (!matchesKelurahan) return false;

  const detailedStatus = criteria.detailedStatus || 'all';
  if (detailedStatus !== 'all') {
    return report.status === detailedStatus;
  }

  const group = criteria.statusGroup || 'all';
  if (group === 'all') return true;
  if (group === 'resolved') return report.status === 'selesai';
  if (group === 'attention') {
    return ATTENTION_TRACKING_STATUSES.has(report.status) || Boolean(report.isDelayed);
  }
  if (group === 'active') {
    return (
      ACTIVE_TRACKING_STATUSES.has(report.status) ||
      report.status === 'menunggu_tindak_lanjut'
    );
  }
  return true;
}

export interface EstimationSummary {
  hasEstimate: boolean;
  formattedTargetDate: string | null;
  remainingText: string;
  isDelayed: boolean;
  delayNotice: string | null;
  disclaimer: string;
}

export function getEstimationSummary(report: ReportItem): EstimationSummary {
  const disclaimer =
    'Perkiraan ini merupakan estimasi petugas dan dapat berubah sesuai kondisi lapangan.';

  if (report.status === 'karantina') {
    return {
      hasEstimate: false,
      formattedTargetDate: null,
      remainingText: 'Menunggu pemeriksaan prioritas petugas posko (Karantina Audit).',
      isDelayed: false,
      delayNotice: null,
      disclaimer:
        'Laporan belum ditolak. Petugas akan memeriksa validitas data sebelum menentukan tindak lanjut.',
    };
  }

  if (report.status === 'ditolak') {
    return {
      hasEstimate: false,
      formattedTargetDate: null,
      remainingText: 'Laporan tidak diproses lebih lanjut (Ditolak).',
      isDelayed: false,
      delayNotice: null,
      disclaimer: report.rejectionReason || 'Laporan ditolak setelah verifikasi petugas.',
    };
  }

  if (report.status === 'selesai') {
    const completionInfo = getActualCompletionInfo(report);
    const actualDate =
      completionInfo.completedAt || report.updatedAt || report.createdAt;
    return {
      hasEstimate: Boolean(actualDate),
      formattedTargetDate: actualDate,
      remainingText: completionInfo.durationText
        ? `Ditangani dalam waktu ${completionInfo.durationText}.`
        : 'Penanganan telah selesai dilaksanakan.',
      isDelayed: false,
      delayNotice: null,
      disclaimer: 'Permasalahan telah ditangani dan diselesaikan oleh instansi terkait.',
    };
  }

  if (!report.estimatedCompletionDate) {
    return {
      hasEstimate: false,
      formattedTargetDate: null,
      remainingText: 'Estimasi penyelesaian sedang ditentukan oleh petugas.',
      isDelayed: Boolean(report.isDelayed),
      delayNotice: report.isDelayed
        ? 'Penanganan membutuhkan waktu tambahan. Estimasi penyelesaian sedang diperbarui petugas.'
        : null,
      disclaimer,
    };
  }

  const formattedDate = formatIndonesianDate(report.estimatedCompletionDate);

  // Compute day difference against local date (YYYY-MM-DD)
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const parts = report.estimatedCompletionDate.split('-').map(Number);
  const targetUtc =
    parts.length === 3 ? Date.UTC(parts[0], parts[1] - 1, parts[2]) : todayUtc;
  const diffDays = Math.round((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));

  let remainingText = '';
  if (diffDays > 1) {
    remainingText = `Diperkirakan selesai dalam ${diffDays} hari`;
  } else if (diffDays === 1) {
    remainingText = 'Diperkirakan selesai besok (1 hari lagi)';
  } else if (diffDays === 0) {
    remainingText = 'Diperkirakan selesai hari ini';
  } else {
    remainingText = `Melewati perkiraan awal ${Math.abs(diffDays)} hari — menunggu pembaruan petugas`;
  }

  const isDelayed = Boolean(report.isDelayed) || diffDays < 0;

  return {
    hasEstimate: true,
    formattedTargetDate: formattedDate,
    remainingText,
    isDelayed,
    delayNotice: report.isDelayed
      ? `Penanganan membutuhkan waktu tambahan. Estimasi penyelesaian telah diperbarui.${
          report.delayReason ? ` (${report.delayReason})` : ''
        }`
      : diffDays < 0
      ? 'Penanganan membutuhkan waktu tambahan. Menunggu pembaruan estimasi dari petugas.'
      : null,
    disclaimer,
  };
}

/**
 * Returns ONLY real reporter-attached photos for a report.
 * Never returns stock/random/auto-generated photos.
 */
export function getReportPhotos(report: ReportItem): ReportPhoto[] {
  if (Array.isArray(report.photos) && report.photos.length > 0) {
    return report.photos.filter((p) => Boolean(p && p.url && p.url.trim() !== ''));
  }
  if (report.photoUrl && report.photoUrl.trim() !== '') {
    return [
      {
        id: `primary-${report.id}`,
        url: report.photoUrl,
        caption: 'Foto bukti kondisi di lapangan yang dilampirkan pelapor',
        uploadedAt: report.createdAt,
      },
    ];
  }
  return [];
}

/**
 * Formats reporter display name safely for public map/tracking views (hides phone/email/address).
 */
export function getPublicReporterDisplay(report: ReportItem): string {
  if (report.isAnonymous) return 'Warga Ciputat (Anonim)';
  const name = (report.reporterName || 'Warga Ciputat').trim();
  return name;
}

export function getNotificationsForReport(
  notifications: ReportNotification[],
  reportId: string
): ReportNotification[] {
  return notifications
    .filter((n) => n.reportId === reportId)
    .sort((a, b) => (b.createdAtIso || '').localeCompare(a.createdAtIso || ''));
}
