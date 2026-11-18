import type {
  ReportCategory,
  KelurahanCiputat,
  ReportItem,
  ReportPhoto,
  FakeReportVerification,
  VerificationFactorDetail,
  SimilarReportRef,
  VerificationTriageDecision,
  ServiceAreaStatus,
} from '../types.ts';
import {
  CIPUTAT_BOUNDS,
  isValidGeoCoordinate,
  isWithinCiputatBounds,
  buildFallbackLocationLabel,
  calculateDistanceMeters,
  detectKelurahanFromCoords,
} from './ciputatGeo.ts';

export {
  CIPUTAT_BOUNDS,
  isValidGeoCoordinate,
  isWithinCiputatBounds,
  buildFallbackLocationLabel,
  calculateDistanceMeters,
};

/**
 * Kata Kunci Konteks Lingkungan & Fasilitas Publik (mendukung istilah teknis maupun bahasa sehari-hari)
 */
const CIVIC_KEYWORDS = [
  'jalan', 'rusak', 'aspal', 'lubang', 'berlubang', 'amblas', 'paving', 'retak', 'licin', 'becek',
  'lampu', 'pju', 'mati', 'padam', 'gelap', 'tiang', 'bohlam', 'kabel', 'listrik',
  'sampah', 'bau', 'tumpukan', 'limbah', 'liar', 'plastik', 'kotor', 'bersih', 'tps',
  'drainase', 'banjir', 'genangan', 'air', 'got', 'saluran', 'selokan', 'mampet', 'tersumbat', 'gorong', 'meluap', 'bocor',
  'trotoar', 'fasilitas', 'tutup', 'grating', 'halte', 'taman', 'pagar', 'pohon', 'tumbang', 'miring',
  'kelurahan', 'pelayanan', 'antrean', 'antri', 'ktp', 'kk', 'loket', 'petugas', 'kantor', 'layanan',
  'macet', 'parkir', 'bising', 'aman', 'rawan', 'bahaya', 'gang', 'warga', 'sekolah', 'pasar', 'jembatan', 'rambu'
];

/**
 * Pola Teks Terindikasi Spam / Gibberish / Konten Terlarang
 * (Menjadi indikator pemeriksaan prioritas petugas, bukan satu-satunya dasar penolakan final)
 */
const REPEATED_CHAR_PATTERN = /(.)\1{4,}/i;
const LEADING_TEST_PATTERN = /^(test|testing|coba|cobaan|asdf|qwerty|12345|halo|hai|p|tes)\b/i;
const SPAM_KEYWORD_PATTERN = /\b(asdf|asdfghjkl|qwerty|zxcvbn|judi|slot|gacor|pinjol|promo|diskon|bokep|porno)\b/i;

export interface VerificationInput {
  title: string;
  description?: string;
  category: ReportCategory;
  kelurahan?: KelurahanCiputat;
  coordinates?: { lat: number; lng: number } | null;
  photoUrl?: string;
  photos?: ReportPhoto[];
  reporterPhone?: string;
  isAnonymous?: boolean;
  existingReports?: ReportItem[];
}

/**
 * Algoritma Tunggal Penilaian Keaslian & Triage Laporan CIGAP
 * Dapat dijalankan identik di browser (estimasi) maupun Node.js backend (otoritatif).
 */
export function verifyReportAuthenticity(input: VerificationInput): FakeReportVerification {
  const reasons: string[] = [];
  const factors: VerificationFactorDetail[] = [];
  let trustScore = 100;
  let antiSpamScore = 100;

  const safeTitle = typeof input?.title === 'string' ? input.title.trim() : '';
  const safeDescription = typeof input?.description === 'string' ? input.description.trim() : '';
  const safePhotoUrl = typeof input?.photoUrl === 'string' ? input.photoUrl.trim() : '';
  const safePhotos = Array.isArray(input?.photos) ? input.photos : [];
  const hasPhoto =
    safePhotoUrl.length > 0 ||
    safePhotos.some((p) => p && typeof p.url === 'string' && p.url.trim().length > 0);
  const isAnonymous = Boolean(input?.isAnonymous);
  const safePhone = typeof input?.reporterPhone === 'string' ? input.reporterPhone.trim() : '';

  // 1. Validasi Koordinat Geografis & Batas Wilayah Poligon 7 Kelurahan Kecamatan Ciputat
  const coordsValid = isValidGeoCoordinate(input?.coordinates);
  let serviceAreaValid = false;
  let serviceAreaStatus: ServiceAreaStatus = 'tidak_diketahui';
  let detectedKelurahan: KelurahanCiputat | null = null;

  if (!coordsValid) {
    trustScore -= 35;
    const msg = 'Koordinat lokasi tidak valid atau tidak terbaca dengan benar.';
    reasons.push(msg);
    factors.push({
      key: 'location',
      label: 'Validasi Koordinat & Wilayah',
      impact: -35,
      status: 'perhatian',
      detail: msg,
    });
  } else {
    const geoDetection = detectKelurahanFromCoords(input.coordinates.lat, input.coordinates.lng);
    serviceAreaStatus = geoDetection.serviceAreaStatus;
    detectedKelurahan = geoDetection.detectedKelurahan;
    serviceAreaValid = geoDetection.isWithinServiceArea;

    if (serviceAreaStatus === 'luar_wilayah') {
      // Penandaan luar cakupan untuk petugas — tidak mengurangi Trust Index atau menuduh laporan palsu
      const msg =
        'Titik koordinat terdeteksi di luar batas wilayah layanan Kecamatan Ciputat. Ditandai untuk verifikasi cakupan petugas (tidak memengaruhi Trust Index atau dianggap laporan palsu).';
      reasons.push(msg);
      factors.push({
        key: 'location',
        label: 'Validasi Wilayah Layanan',
        impact: 0,
        status: 'netral',
        detail: msg,
      });
    } else if (serviceAreaStatus === 'batas_wilayah') {
      const msg = detectedKelurahan
        ? `Titik koordinat berada tepat di perbatasan wilayah layanan (sekitar Kel. ${detectedKelurahan}, Kec. Ciputat).`
        : 'Titik koordinat berada di area perbatasan wilayah layanan Kecamatan Ciputat.';
      reasons.push(msg);
      factors.push({
        key: 'location',
        label: 'Validasi Wilayah Layanan',
        impact: 0,
        status: 'netral',
        detail: msg,
      });
    } else if (serviceAreaStatus === 'dalam_wilayah') {
      factors.push({
        key: 'location',
        label: 'Validasi Wilayah Layanan',
        impact: 0,
        status: 'positif',
        detail: detectedKelurahan
          ? `Koordinat terverifikasi berada di dalam poligon wilayah layanan Kel. ${detectedKelurahan}, Kecamatan Ciputat.`
          : 'Koordinat berada di dalam batas wilayah layanan Kecamatan Ciputat.',
      });
    } else {
      factors.push({
        key: 'location',
        label: 'Validasi Wilayah Layanan',
        impact: 0,
        status: 'netral',
        detail: 'Status batas wilayah layanan belum dapat dipastikan secara otomatis; perlu konfirmasi petugas.',
      });
    }
  }

  // 2. Kelengkapan Foto Bukti (Tidak melampirkan foto bukan berarti laporan palsu)
  let photoAuthenticity = false;
  if (!hasPhoto) {
    trustScore -= 15;
    const msg =
      'Tidak melampirkan foto bukti lapangan (tidak otomatis menandakan laporan palsu; petugas dapat memverifikasi di lapangan).';
    reasons.push(msg);
    factors.push({
      key: 'photo',
      label: 'Kelengkapan Foto Bukti',
      impact: -15,
      status: 'netral',
      detail: msg,
    });
  } else {
    photoAuthenticity = true;
    factors.push({
      key: 'photo',
      label: 'Kelengkapan Foto Bukti',
      impact: 0,
      status: 'positif',
      detail: 'Foto bukti kondisi lapangan terlampir.',
    });
  }

  // 3. Analisis Pola Spam & Kualitas Narasi (Bahasa sehari-hari tetap dianggap valid)
  const combinedText = `${safeTitle} ${safeDescription}`.trim().toLowerCase();
  const titleLower = safeTitle.toLowerCase();
  const descLower = safeDescription.toLowerCase();

  if (safeTitle.length < 6) {
    antiSpamScore -= 15;
  }
  if (safeDescription.length > 0 && safeDescription.length < 12) {
    antiSpamScore -= 10;
  } else if (safeDescription.length === 0) {
    antiSpamScore -= 10;
  }

  const hasSpamPattern =
    REPEATED_CHAR_PATTERN.test(combinedText) ||
    LEADING_TEST_PATTERN.test(titleLower) ||
    (descLower.length > 0 && LEADING_TEST_PATTERN.test(descLower)) ||
    SPAM_KEYWORD_PATTERN.test(combinedText);

  const matchedKeywords = CIVIC_KEYWORDS.filter((kw) => combinedText.includes(kw));

  let textImpact = 0;
  const textNotes: string[] = [];

  if (hasSpamPattern) {
    antiSpamScore -= 55;
    trustScore -= 51;
    textImpact -= 51;
    const spamMsg =
      'Terdeteksi pola kata acak/uji coba/spam pada narasi laporan (indikator pemeriksaan prioritas petugas, bukan penolakan otomatis).';
    reasons.push(spamMsg);
    textNotes.push(spamMsg);
  }

  if (matchedKeywords.length === 0) {
    antiSpamScore -= 10;
    trustScore -= 5;
    textImpact -= 5;
    const kwMsg =
      'Narasi menggunakan bahasa umum tanpa kata kunci fasilitas standar (tetap dapat diproses sebagai laporan valid).';
    reasons.push(kwMsg);
    textNotes.push(kwMsg);
  }

  factors.push({
    key: 'text_quality',
    label: 'Analisis Narasi & Pola Spam',
    impact: textImpact,
    status: hasSpamPattern ? 'perhatian' : matchedKeywords.length > 0 ? 'positif' : 'netral',
    detail:
      textNotes.length > 0
        ? textNotes.join(' ')
        : 'Narasi laporan jelas, informatif, dan bebas pola spam.',
  });

  // 4. Deteksi Laporan Serupa dalam Radius 250 Meter (Informasi Petugas — ZERO Penalti)
  let duplicateRisk: 'rendah' | 'sedang' | 'tinggi' = 'rendah';
  let duplicateReportId: string | undefined;
  let similarReports: SimilarReportRef[] = [];

  if (coordsValid && Array.isArray(input?.existingReports) && input.existingReports.length > 0) {
    const nearbyMatches: SimilarReportRef[] = [];

    for (const rep of input.existingReports) {
      if (!rep || rep.status === 'ditolak') continue;
      if (rep.category !== input.category) continue;
      if (!isValidGeoCoordinate(rep.coordinates)) continue;

      const distance = Math.round(
        calculateDistanceMeters(
          input.coordinates.lat,
          input.coordinates.lng,
          rep.coordinates.lat,
          rep.coordinates.lng
        )
      );

      if (distance <= 250) {
        nearbyMatches.push({
          id: rep.id,
          title: rep.title,
          distanceMeters: distance,
          status: rep.status,
        });
      }
    }

    nearbyMatches.sort((a, b) => a.distanceMeters - b.distanceMeters);
    similarReports = nearbyMatches.slice(0, 5);

    if (nearbyMatches.length >= 2) {
      duplicateRisk = 'tinggi';
      duplicateReportId = nearbyMatches[0].id;
      reasons.push(
        `Informasi laporan serupa: ditemukan ${nearbyMatches.length} pengaduan kategori sama dalam radius <250m (terdekat #${nearbyMatches[0].id}). Tidak mengurangi Trust Index; petugas dapat mempertimbangkan penggabungan atau penguatan prioritas.`
      );
    } else if (nearbyMatches.length === 1) {
      duplicateRisk = 'sedang';
      duplicateReportId = nearbyMatches[0].id;
      reasons.push(
        `Informasi laporan serupa: terdapat 1 pengaduan kategori sama di radius ${nearbyMatches[0].distanceMeters}m (#${nearbyMatches[0].id}). Dapat dijadikan penguat penanganan tanpa penalti skor.`
      );
    }
  }

  factors.push({
    key: 'duplicate_cluster',
    label: 'Laporan Serupa (<250m)',
    impact: 0,
    status: similarReports.length > 0 ? 'netral' : 'positif',
    detail:
      similarReports.length > 0
        ? `Terdapat ${similarReports.length} laporan serupa di sekitar lokasi (terdekat #${similarReports[0].id}, ${similarReports[0].distanceMeters}m). Hanya sebagai informasi penggabungan/dukungan (0 penalti).`
        : 'Belum ditemukan laporan serupa pada radius 250 meter.',
  });

  // 5. Kontak & Anonimitas Pelapor (Anonimitas & tanpa nomor telepon tetap diizinkan tanpa penalti)
  let contactVerified = false;
  let contactImpact = 0;
  let contactDetail = '';
  let contactStatus: VerificationFactorDetail['status'] = 'positif';

  if (isAnonymous) {
    contactVerified = true;
    contactDetail = 'Pelapor menggunakan mode anonim (diperbolehkan penuh tanpa penalti).';
  } else if (safePhone.length > 0) {
    const cleanPhone = safePhone.replace(/[\s-]/g, '');
    const phoneRegex = /^(\+62|62|08)[1-9][0-9]{7,11}$/;
    if (phoneRegex.test(cleanPhone)) {
      contactVerified = true;
      contactDetail = 'Nomor telepon / WhatsApp pelapor valid untuk klarifikasi petugas.';
    } else {
      trustScore -= 5;
      contactImpact = -5;
      contactStatus = 'netral';
      const phoneMsg =
        'Format nomor telepon tidak mengikuti standar Indonesia (hanya memengaruhi kemudahan klarifikasi, bukan indikasi laporan palsu).';
      reasons.push(phoneMsg);
      contactDetail = phoneMsg;
    }
  } else {
    contactStatus = 'netral';
    contactDetail = 'Pelapor memilih tidak mencantumkan nomor telepon (diizinkan tanpa penalti).';
  }

  factors.push({
    key: 'contact',
    label: 'Kontak & Anonimitas Pelapor',
    impact: contactImpact,
    status: contactStatus,
    detail: contactDetail,
  });

  // 6. Normalisasi Skor & Penentuan Klasifikasi Triage
  trustScore = Math.max(10, Math.min(100, trustScore));
  antiSpamScore = Math.max(0, Math.min(100, antiSpamScore));

  const isQuarantined = trustScore < 50;
  const requiresAdditionalReview = trustScore >= 50 && trustScore < 80;
  const isSuspectedFake = isQuarantined;

  let verdict: FakeReportVerification['verdict'] = 'valid';
  let triageDecision: VerificationTriageDecision = 'verifikasi_normal';

  if (trustScore >= 80) {
    verdict = 'valid';
    triageDecision = 'verifikasi_normal';
  } else if (trustScore >= 50) {
    verdict = 'perlu_tinjauan';
    triageDecision = 'pemeriksaan_tambahan';
  } else {
    verdict = 'terindikasi_palsu';
    triageDecision = 'karantina_prioritas';
  }

  return {
    trustScore,
    isSuspectedFake,
    verdict,
    triageDecision,
    isQuarantined,
    requiresAdditionalReview,
    serviceAreaValid,
    serviceAreaStatus,
    detectedKelurahan,
    reasons:
      reasons.length > 0
        ? reasons
        : ['Seluruh parameter pemeriksaan memenuhi standar verifikasi normal CIGAP.'],
    factors,
    similarReports,
    checks: {
      gpsRadiusValid: serviceAreaValid,
      photoAuthenticity,
      antiSpamScore,
      contactVerified,
      duplicateClusterRisk: duplicateRisk,
    },
    duplicateClusterReportId: duplicateReportId,
  };
}
