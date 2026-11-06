import Link from 'next/link';

export default function MyQrPassPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
        <h1 className="text-xl font-bold text-slate-900">QR Pass Ketua Kelas</h1>
        <p className="mt-1 text-xs text-slate-500">
          Token bertanda tangan 60 detik (tampilan mobile peminjam proyektor).
        </p>

        <div className="my-6 flex h-56 w-full items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
          Placeholder Layar QR Code (Fase 4)
        </div>

        <p className="text-xs text-slate-500">
          Tampilan QR Pass dengan hitung mundur otomatis dan tombol cabut QR akan diimplementasikan pada Fase 4.
        </p>

        <div className="mt-6">
          <Link href="/" className="text-xs text-blue-600 hover:underline">
            ← Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
