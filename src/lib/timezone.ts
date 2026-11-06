/**
 * Modul Utilitas Zona Waktu Asia/Jakarta (WIB).
 * Seluruh kalkulasi waktu bisnis SmartProjex wajib mengacu pada WIB (UTC+7),
 * independen dari timezone lokal mesin developer, server CI, atau Vercel (UTC).
 */

export const WIB_TIMEZONE = 'Asia/Jakarta';

// Default jam operasional TU dari PRD (dapat dikonfigurasi lewat parameter)
export const DEFAULT_TU_CLOSING_HOUR = 17; // 17:00 WIB
export const DEFAULT_TU_CLOSING_MINUTE = 0;
export const DEFAULT_FALLBACK_HOURS = 2; // Bila pinjam >= jam tutup

export interface WibDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * Mengurai tanggal/timestamp menjadi komponen kalender WIB (Asia/Jakarta)
 * tanpa terpengaruh oleh timezone mesin lokal.
 */
export function getWibDateParts(dateInput: Date | string | number): WibDateTimeParts {
  const date = typeof dateInput === 'string' || typeof dateInput === 'number'
    ? new Date(dateInput)
    : dateInput;

  if (isNaN(date.getTime())) {
    throw new Error('Format tanggal/timestamp tidak valid.');
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: WIB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, number> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      partMap[part.type] = parseInt(part.value, 10);
    }
  }

  return {
    year: partMap.year,
    month: partMap.month,
    day: partMap.day,
    hour: partMap.hour === 24 ? 0 : partMap.hour,
    minute: partMap.minute,
    second: partMap.second,
  };
}

/**
 * Membuat objek Date dari komponen waktu WIB yang ditentukan.
 * Format ISO dengan offset eksplisit +07:00 menjamin kepastian konversi ke UTC.
 */
export function createWibDate(params: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  second?: number;
}): Date {
  const { year, month, day, hour, minute = 0, second = 0 } = params;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const isoWithWibOffset = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+07:00`;

  return new Date(isoWithWibOffset);
}

/**
 * Menghitung akhir jam operasional TU pada tanggal WIB bersangkutan.
 */
export function calculateEndOfOperationalDay(
  dateInput: Date | string | number,
  closingHour = DEFAULT_TU_CLOSING_HOUR,
  closingMinute = DEFAULT_TU_CLOSING_MINUTE
): Date {
  const wibParts = getWibDateParts(dateInput);

  return createWibDate({
    year: wibParts.year,
    month: wibParts.month,
    day: wibParts.day,
    hour: closingHour,
    minute: closingMinute,
    second: 0,
  });
}

/**
 * Menghitung batas waktu pengembalian default (due_at) untuk transaksi peminjaman baru.
 * Default PRD: Akhir jam operasional TU pada hari peminjaman (17:00 WIB).
 * Jika peminjaman dilakukan pada atau setelah jam operasional TU, diberikan durasi fallback
 * (mis. +2 jam dari waktu pinjam).
 */
export function calculateDueAt(
  borrowedAt: Date | string | number,
  options?: {
    closingHour?: number;
    closingMinute?: number;
    fallbackHours?: number;
  }
): Date {
  const closingHour = options?.closingHour ?? DEFAULT_TU_CLOSING_HOUR;
  const closingMinute = options?.closingMinute ?? DEFAULT_TU_CLOSING_MINUTE;
  const fallbackHours = options?.fallbackHours ?? DEFAULT_FALLBACK_HOURS;

  const borrowDate = typeof borrowedAt === 'string' || typeof borrowedAt === 'number'
    ? new Date(borrowedAt)
    : borrowedAt;

  if (isNaN(borrowDate.getTime())) {
    throw new Error('Format waktu pinjam (borrowedAt) tidak valid.');
  }

  const endOfOperational = calculateEndOfOperationalDay(borrowDate, closingHour, closingMinute);

  // Jika waktu pinjam masih sebelum jam tutup operasional, due_at adalah jam operasional hari itu
  if (borrowDate.getTime() < endOfOperational.getTime()) {
    return endOfOperational;
  }

  // Jika pinjam pada atau setelah jam operasional (lembur/kelas malam), gunakan fallback durasi jam
  return new Date(borrowDate.getTime() + fallbackHours * 60 * 60 * 1000);
}

/**
 * Memeriksa apakah suatu transaksi peminjaman telah melewati batas waktu (terlambat).
 */
export function isOverdue(
  dueAt: Date | string | number,
  nowInput: Date | string | number = new Date()
): boolean {
  const dueDate = typeof dueAt === 'string' || typeof dueAt === 'number' ? new Date(dueAt) : dueAt;
  const nowDate = typeof nowInput === 'string' || typeof nowInput === 'number' ? new Date(nowInput) : nowInput;

  return nowDate.getTime() > dueDate.getTime();
}

/**
 * Memformat tanggal ke string representasi WIB Bahasa Indonesia.
 * Contoh: "06 Nov 2026, 14:30 WIB"
 */
export function formatWib(
  dateInput: Date | string | number,
  style: 'full' | 'short' | 'time' | 'date' = 'short'
): string {
  const date = typeof dateInput === 'string' || typeof dateInput === 'number'
    ? new Date(dateInput)
    : dateInput;

  if (isNaN(date.getTime())) {
    return '-';
  }

  if (style === 'time') {
    return (
      new Intl.DateTimeFormat('id-ID', {
        timeZone: WIB_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date) + ' WIB'
    );
  }

  if (style === 'date') {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: WIB_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  return (
    new Intl.DateTimeFormat('id-ID', {
      timeZone: WIB_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date) + ' WIB'
  );
}

