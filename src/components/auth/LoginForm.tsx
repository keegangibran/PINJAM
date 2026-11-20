'use client';

import React, { useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSafeNextPath } from '@/lib/auth/redirect';
import PasswordInput from '@/components/ui/PasswordInput';

export function LoginForm() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const urlError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(urlError);

  // Synchronous guard against double submission
  const isSubmittingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Guard sinkron: cegah multiple submission jika request sebelumnya masih berjalan
    if (isSubmittingRef.current || loading || isRedirecting) {
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnUrl: returnUrl || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.code === 'ACCOUNT_DISABLED') {
          setError(
            data.error?.message ||
              'Akun petugas Anda telah dinonaktifkan oleh administrator. Silakan hubungi administrator.'
          );
        } else {
          setError(data.error?.message || 'Login gagal. Silakan periksa kredensial Anda.');
        }
        setLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      // Validasi keberadaan redirectTo yang sah dari server (server adalah sumber otoritatif)
      const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const safeDestination =
        data.redirectTo && typeof data.redirectTo === 'string'
          ? getSafeNextPath(data.redirectTo, new URL(baseOrigin), '')
          : '';

      if (!safeDestination) {
        setError('Tujuan pengalihan tidak valid dari server.');
        setLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      setIsRedirecting(true);
      // Jangan reset isSubmittingRef saat proses navigasi berlangsung
      window.location.replace(safeDestination);
    } catch {
      setError('Terjadi gangguan jaringan saat menghubungi server.');
      setLoading(false);
      setIsRedirecting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
      <div className="text-center">
        <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
          PINJAM
        </span>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          Masuk ke Akun
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Masuk dengan akun terdaftar untuk mahasiswa, petugas, atau administrator.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
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
          <label
            htmlFor="email"
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Alamat Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@unimed.ac.id atau email terdaftar"
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={loading || isRedirecting}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Kata Sandi
          </label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
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

      <div className="mt-6 border-t border-slate-100 pt-6 text-center text-xs text-slate-500">
        <p>
          Ketua kelas baru?{' '}
          <Link href="/register" className="font-semibold text-blue-600 hover:underline">
            Daftar akun di sini
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginForm;
