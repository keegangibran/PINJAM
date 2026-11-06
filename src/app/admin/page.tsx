import Link from 'next/link';

export default function AdminDashboardPage() {
  return (
    <div className="min-h-screen p-8 bg-slate-50">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard Buku Besar Digital</h1>
            <p className="text-sm text-slate-500">Pemantauan inventaris, keterlambatan, dan riwayat transaksi.</p>
          </div>
          <Link href="/" className="text-xs text-blue-600 hover:underline">
            ← Kembali ke Beranda
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/admin/verifications" className="p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-400">
            <h2 className="font-semibold text-slate-800">Antrean Verifikasi</h2>
            <p className="text-xs text-slate-500 mt-1">Verifikasi tatap muka dan klaim ketua kelas (Fase 3)</p>
          </Link>

          <Link href="/admin/classes" className="p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-400">
            <h2 className="font-semibold text-slate-800">Manajemen Kelas</h2>
            <p className="text-xs text-slate-500 mt-1">Daftar kelas baku dan semester akademik (Fase 3/4)</p>
          </Link>

          <Link href="/admin/projectors" className="p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-400">
            <h2 className="font-semibold text-slate-800">Inventaris Proyektor</h2>
            <p className="text-xs text-slate-500 mt-1">Status aset unit dan cetak stiker QR (Fase 6)</p>
          </Link>
        </div>

        <div className="mt-8 p-6 bg-white rounded-xl border border-slate-200 text-center text-sm text-slate-500">
          Metrik inventaris real-time, daftar keterlambatan, dan ekspor CSV akan diimplementasikan pada Fase 6.
        </div>
      </div>
    </div>
  );
}
