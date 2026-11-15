import React from 'react';

export default function StudentQrLoading() {
  return (
    <div
      className="min-h-screen bg-slate-100 flex flex-col justify-between p-4 sm:p-6 text-slate-800"
      role="status"
      aria-label="Memuat QR Pass Mahasiswa"
    >
      <div className="max-w-md w-full mx-auto space-y-4">
        {/* Header App Bar Skeleton */}
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </span>
            <span className="text-sm font-bold text-slate-900 tracking-tight">PINJAM Pass</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-6 w-14 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-6 w-14 bg-slate-100 rounded-lg animate-pulse" />
          </div>
        </div>

        {/* Main QR Card Skeleton */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 text-center space-y-6">
          {/* Identity Skeleton */}
          <div className="space-y-2 flex flex-col items-center">
            <div className="h-5 w-24 bg-blue-100 rounded-full animate-pulse" />
            <div className="h-6 w-44 bg-slate-200 rounded-lg animate-pulse" />
            <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
          </div>

          {/* QR Box Container Placeholder */}
          <div className="relative mx-auto w-56 h-56 sm:w-64 sm:h-64 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-4">
            <div className="h-10 w-10 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mb-3" />
            <p className="text-xs font-semibold text-slate-700">Menyiapkan QR Pass aman...</p>
            <p className="text-[10px] text-slate-400 mt-1">Verifikasi sesi kriptografi</p>
          </div>

          {/* Timer & Security Skeleton */}
          <div className="space-y-2">
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-slate-300 rounded-full w-2/3 animate-pulse" />
            </div>
            <div className="h-4 w-40 bg-slate-100 rounded mx-auto animate-pulse" />
          </div>

          {/* Action Buttons Skeleton */}
          <div className="pt-2 border-t border-slate-100 flex gap-2">
            <div className="h-9 flex-1 bg-slate-100 rounded-xl animate-pulse" />
            <div className="h-9 flex-1 bg-slate-100 rounded-xl animate-pulse" />
          </div>
        </div>

        {/* Security Notice Card */}
        <div className="rounded-2xl border border-slate-200 bg-white/60 p-4 text-center text-xs text-slate-500">
          <p className="font-semibold text-slate-700">QR Pass Dinamis PINJAM</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Hanya ketua kelas aktif yang dapat meminjam proyektor perkuliahan.
          </p>
        </div>
      </div>

      <div className="text-center py-2 text-[11px] text-slate-400">
        PINJAM &copy; {new Date().getFullYear()} — Universitas Negeri Medan
      </div>
    </div>
  );
}
