import Link from 'next/link';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Masuk Akun SmartProjex</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kerangka antarmuka autentikasi mahasiswa dan petugas.
        </p>
        <div className="mt-6 rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-600">
          Form autentikasi dan integrasi sesi Supabase Auth akan diimplementasikan pada Fase 3.
        </div>
        <div className="mt-4 text-center">
          <Link href="/" className="text-xs text-blue-600 hover:underline">
            ← Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}

