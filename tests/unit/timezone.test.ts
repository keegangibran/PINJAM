import { describe, it, expect } from 'vitest';
import {
  getWibDateParts,
  createWibDate,
  calculateEndOfOperationalDay,
  calculateDueAt,
  isOverdue,
  formatWib,
} from '@/lib/timezone';

describe('Timezone Module (src/lib/timezone.ts)', () => {
  it('B-1: Mengurai timestamp UTC ke tanggal dan jam WIB secara akurat (+7 jam)', () => {
    // 03:00 UTC = 10:00 WIB di hari yang sama
    const utcDate = new Date('2026-11-06T03:30:45Z');
    const wib = getWibDateParts(utcDate);

    expect(wib.year).toBe(2026);
    expect(wib.month).toBe(11);
    expect(wib.day).toBe(6);
    expect(wib.hour).toBe(10);
    expect(wib.minute).toBe(30);
    expect(wib.second).toBe(45);
  });

  it('B-2: Menangani pergantian tanggal lintas batas midnight UTC (UTC sore = WIB esok hari)', () => {
    // 2026-11-06 pukul 18:00 UTC = 2026-11-07 pukul 01:00 WIB (tanggal berganti!)
    const lateUtc = new Date('2026-11-06T18:00:00Z');
    const wib = getWibDateParts(lateUtc);

    expect(wib.year).toBe(2026);
    expect(wib.month).toBe(11);
    expect(wib.day).toBe(7); // Tanggal 7 di WIB
    expect(wib.hour).toBe(1); // Jam 01:00 WIB
  });

  it('B-3: Membuat objek Date dengan offset WIB (+07:00) yang tepat', () => {
    const date = createWibDate({
      year: 2026,
      month: 11,
      day: 6,
      hour: 17,
      minute: 0,
      second: 0,
    });

    // 17:00 WIB = 10:00 UTC
    expect(date.toISOString()).toBe('2026-11-06T10:00:00.000Z');
  });

  it('B-4: Menghitung batas operasional TU (17:00 WIB) pada hari peminjaman', () => {
    // Pinjam pukul 09:15 WIB (02:15 UTC)
    const borrowedAt = new Date('2026-11-06T02:15:00Z');
    const endOfTu = calculateEndOfOperationalDay(borrowedAt, 17, 0);

    // Harus jatuh pada 17:00 WIB (10:00 UTC) pada tanggal 6 Nov 2026
    expect(endOfTu.toISOString()).toBe('2026-11-06T10:00:00.000Z');
  });

  it('B-5: Menghitung default due_at jika peminjaman dilakukan sebelum jam tutup operasional TU', () => {
    // Pinjam jam 10:00 WIB pada 6 Nov 2026 (03:00 UTC)
    const borrowedAt = new Date('2026-11-06T03:00:00Z');
    const dueAt = calculateDueAt(borrowedAt);

    // due_at harus tepat pukul 17:00 WIB hari itu (10:00 UTC)
    expect(dueAt.toISOString()).toBe('2026-11-06T10:00:00.000Z');
  });

  it('B-6: Menghitung fallback due_at jika peminjaman dilakukan pada atau setelah jam operasional TU', () => {
    // Pinjam jam 17:30 WIB pada 6 Nov 2026 (10:30 UTC)
    const borrowedAt = new Date('2026-11-06T10:30:00Z');
    // Default fallback = 2 jam
    const dueAt = calculateDueAt(borrowedAt, { fallbackHours: 2 });

    // 10:30 UTC + 2 jam = 12:30 UTC (19:30 WIB)
    expect(dueAt.toISOString()).toBe('2026-11-06T12:30:00.000Z');
  });

  it('B-7: Memvalidasi fungsi status keterlambatan (isOverdue)', () => {
    const dueAt = new Date('2026-11-06T10:00:00Z'); // 17:00 WIB

    // Masih jam 16:59 WIB (09:59 UTC) -> Belum terlambat
    const beforeDue = new Date('2026-11-06T09:59:00Z');
    expect(isOverdue(dueAt, beforeDue)).toBe(false);

    // Tepat jam 17:00 WIB (10:00 UTC) -> Belum lewat
    expect(isOverdue(dueAt, dueAt)).toBe(false);

    // Lewat 1 detik (10:00:01 UTC) -> Terlambat
    const afterDue = new Date('2026-11-06T10:00:01Z');
    expect(isOverdue(dueAt, afterDue)).toBe(true);
  });

  it('B-8: Memformat waktu ke string WIB Bahasa Indonesia secara konsisten', () => {
    const date = new Date('2026-11-06T07:30:00Z'); // 14:30 WIB

    const formatted = formatWib(date, 'short');
    expect(formatted).toContain('WIB');
    expect(formatted).toContain('14');
    expect(formatted).toContain('30');
    expect(formatted).toContain('2026');

    const timeOnly = formatWib(date, 'time');
    expect(timeOnly).toBe('14.30 WIB');
  });
});

