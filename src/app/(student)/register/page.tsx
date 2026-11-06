import Link from 'next/link';

export default function StudentRegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Registrasi Ketua Kelas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pendaftaran mandiri mahasiswa dengan pemilihan kelas baku dan verifikasi email.
        </p>
        <div className="mt-6 rounded-lg bg-blue-50 p-4 text-xs text-blue-700">
          Form pendaftaran mahasiswa dan persetujuan foto verifikasi akan diimplementasikan pada Fase 3.
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

