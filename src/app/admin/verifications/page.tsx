import Link from 'next/link';

export default function AdminVerificationsPage() {
  return (
    <div className="min-h-screen p-8 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <h1 className="text-xl font-bold text-slate-900">Antrean Verifikasi Tatap Muka</h1>
          <Link href="/admin" className="text-xs text-blue-600 hover:underline">
            ← Kembali ke Dashboard
          </Link>
        </div>
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Antrean verifikasi foto wajah, foto dokumen (KTM/KTP), 3 centang pemeriksaan, dan klaim ketua kelas akan diimplementasikan pada Fase 3.
        </div>
      </div>
    </div>
  );
}
