import Link from 'next/link';

export default function AdminProjectorsPage() {
  return (
    <div className="min-h-screen p-8 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <h1 className="text-xl font-bold text-slate-900">Manajemen Inventaris Proyektor</h1>
          <Link href="/admin" className="text-xs text-blue-600 hover:underline">
            ← Kembali ke Dashboard
          </Link>
        </div>
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Pengelolaan unit proyektor fisik, riwayat status unit, dan pembuatan stiker QR unit akan diimplementasikan pada Fase 6.
        </div>
      </div>
    </div>
  );
}

