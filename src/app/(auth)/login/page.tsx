'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSafeRedirectDestination } from '@/lib/auth/redirect';

function LoginForm() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const urlError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(urlError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || 'Login gagal. Silakan periksa kredensial Anda.');
        setLoading(false);
        return;
      }

      setIsRedirecting(true);
      const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const destination = getSafeRedirectDestination(returnUrl, data.redirectTo, baseOrigin, '/');
      window.location.replace(destination);
    } catch {
      setError('Terjadi gangguan jaringan saat menghubungi server.');
      setLoading(false);
      setIsRedirecting(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-center">
        <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
          PINJAM
        </span>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          Masuk ke Akun
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Gunakan email terdaftar untuk mahasiswa atau petugas TU.
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {isRedirecting && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-2.5">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent shrink-0"></span>
          <span>Autentikasi berhasil. Mengalihkan ke dasbor...</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Alamat Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@unimed.ac.id atau gmail.com"
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={loading || isRedirecting}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Kata Sandi
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={loading || isRedirecting}
          />
        </div>

        <button
          type="submit"
          disabled={loading || isRedirecting}
          className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isRedirecting ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              <span>Mengalihkan...</span>
            </>
          ) : loading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              <span>Memproses Masuk...</span>
            </>
          ) : (
            'Masuk Akun'
          )}
        </button>
      </form>

      <div className="mt-6 border-t border-slate-100 pt-6 text-center text-xs text-slate-500 space-y-2">
        <p>
          Ketua kelas baru?{' '}
          <Link href="/register" className="font-semibold text-blue-600 hover:underline">
            Daftar akun di sini
          </Link>
        </p>
        <p>
          <Link href="/" className="text-slate-400 hover:underline">
            ← Kembali ke Beranda
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-slate-50">
      <Suspense fallback={<div className="p-8 text-sm text-slate-500">Memuat formulir...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
