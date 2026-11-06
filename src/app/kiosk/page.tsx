import Link from 'next/link';

export default function KioskPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-900 text-white">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-800/60 p-8 text-center backdrop-blur">
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400">
          Kiosk Meja TU Standby
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Kiosk Scanner Dual-Scan</h1>
        <p className="mt-2 text-sm text-slate-400">
          Pemindaian QR Mahasiswa, QR Proyektor, Foto Dokumentasi, dan Smart Toggle Otomatis.
        </p>

        <div className="my-8 flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/50 text-slate-500">
          Area Live Feed Kamera Webcam Laptop (Fase 5)
        </div>

        <p className="text-xs text-slate-400">
          Alur Dual-Scan transaksi atomik dan konfirmasi kondisi akan diimplementasikan pada Fase 5.
        </p>

        <div className="mt-6">
          <Link href="/" className="text-xs text-emerald-400 hover:underline">
            ← Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}

