import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
        <div className="text-center">
          <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            Fase 1 — Fondasi
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            SmartProjex
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Sistem Peminjaman Proyektor Pintar Berbasis Dual-Scan & Verifikasi Tatap Muka
          </p>
        </div>

        <div className="mt-8 grid gap-3">
          <Link
            href="/my-qr"
            className="flex items-center justify-between rounded-xl border border-slate-200 p-4 transition-colors hover:bg-slate-50"
          >
            <div>
              <p className="font-semibold text-slate-800">QR Pass Ketua Kelas</p>
              <p className="text-xs text-slate-500">Tampilan mobile token bertanda tangan</p>
            </div>
            <span className="text-slate-400">→</span>
          </Link>

          <Link
            href="/kiosk"
            className="flex items-center justify-between rounded-xl border border-slate-200 p-4 transition-colors hover:bg-slate-50"
          >
            <div>
              <p className="font-semibold text-slate-800">Kiosk Scanner TU</p>
              <p className="text-xs text-slate-500">Dual-scan webcam laptop meja petugas</p>
            </div>
            <span className="text-slate-400">→</span>
          </Link>

          <Link
            href="/admin"
            className="flex items-center justify-between rounded-xl border border-slate-200 p-4 transition-colors hover:bg-slate-50"
          >
            <div>
              <p className="font-semibold text-slate-800">Dashboard Admin & TU</p>
              <p className="text-xs text-slate-500">Buku besar digital, inventaris, dan audit</p>
            </div>
            <span className="text-slate-400">→</span>
          </Link>

          <Link
            href="/login"
            className="flex items-center justify-between rounded-xl border border-slate-200 p-4 transition-colors hover:bg-slate-50"
          >
            <div>
              <p className="font-semibold text-slate-800">Masuk Akun</p>
              <p className="text-xs text-slate-500">Autentikasi Mahasiswa & Petugas</p>
            </div>
            <span className="text-slate-400">→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}

