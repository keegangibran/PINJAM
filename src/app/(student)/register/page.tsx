import RegistrationForm from '@/components/registration/RegistrationForm';
import Link from 'next/link';

export default function StudentRegisterPage() {
  return (
    <div className="min-h-screen p-4 md:p-8 bg-slate-50 flex items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="text-center pb-6 border-b border-slate-100">
          <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            Registrasi Peminjam
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
            Pendaftaran Ketua Kelas
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Daftar mandiri menggunakan NIM dan pilih kelas baku sebelum verifikasi tatap muka di meja TU.
          </p>
        </div>

        <div className="mt-6">
          <RegistrationForm />
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
          Sudah memiliki akun?{' '}
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            Masuk di sini
          </Link>
        </div>
      </div>
    </div>
  );
}
