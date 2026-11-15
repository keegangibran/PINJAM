import React from 'react';

export default function AdminLoading() {
  return (
    <div
      className="min-h-screen p-6 md:p-8 bg-slate-50 text-slate-900"
      role="status"
      aria-label="Memuat Dasbor Tata Usaha"
    >
      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto space-y-6">
        {/* Navigation & Title Header Skeleton */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                Panel Petugas & Admin
              </span>
              <div className="h-7 w-64 bg-slate-200 rounded-lg animate-pulse" />
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Menyiapkan data operasional dan status peminjaman...
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="h-8 w-28 bg-slate-200 rounded-lg animate-pulse" />
            <div className="h-8 w-28 bg-slate-200 rounded-lg animate-pulse" />
            <div className="h-8 w-32 bg-slate-200 rounded-lg animate-pulse" />
            <div className="h-8 w-20 bg-slate-200 rounded-lg animate-pulse" />
          </div>
        </div>

        {/* 5 Summary Stat Cards Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          {[
            { label: 'Total Unit', border: 'border-slate-200' },
            { label: 'Tersedia', border: 'border-emerald-200' },
            { label: 'Sedang Dipinjam', border: 'border-blue-200' },
            { label: 'Terlambat', border: 'border-rose-200' },
            { label: 'Pemeliharaan', border: 'border-amber-200' },
          ].map((item, idx) => (
            <div
              key={idx}
              className={`bg-white p-4 rounded-2xl border ${item.border} shadow-sm space-y-2`}
            >
              <span className="text-xs font-semibold text-slate-400">{item.label}</span>
              <div className="h-8 w-16 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Table & Filter Bar Skeleton */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-44 bg-slate-200 rounded-lg animate-pulse" />
              <div className="h-8 w-28 bg-slate-100 rounded-lg animate-pulse" />
            </div>
            <div className="h-8 w-56 bg-slate-100 rounded-lg animate-pulse" />
          </div>

          {/* Table Rows Skeleton */}
          <div className="divide-y divide-slate-100 p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="flex items-center justify-between py-2 gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="h-10 w-10 bg-slate-200 rounded-xl animate-pulse shrink-0" />
                  <div className="space-y-1.5 flex-1 max-w-xs">
                    <div className="h-4 w-3/4 bg-slate-200 rounded animate-pulse" />
                    <div className="h-3 w-1/2 bg-slate-100 rounded animate-pulse" />
                  </div>
                </div>
                <div className="h-4 w-28 bg-slate-100 rounded animate-pulse hidden sm:block" />
                <div className="h-4 w-24 bg-slate-100 rounded animate-pulse hidden md:block" />
                <div className="h-6 w-20 bg-slate-200 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
