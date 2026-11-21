'use client';
/* eslint-disable @next/next/no-img-element */

import React from 'react';
import { User, IdCard, GraduationCap, Mail, RotateCcw, Send, CheckCircle2 } from 'lucide-react';

interface ReviewStepProps {
  studentData: {
    name: string;
    nim: string;
    email: string;
    className: string;
  };
  facePhotoUrl: string;
  documentPhotoUrl: string;
  documentType: 'KTM' | 'KTP';
  submitting: boolean;
  error: string | null;
  onEditData: () => void;
  onRetakeFace: () => void;
  onRetakeDocument: () => void;
  onSubmit: () => void;
}

export default function ReviewStep({
  studentData,
  facePhotoUrl,
  documentPhotoUrl,
  documentType,
  submitting,
  error,
  onEditData,
  onRetakeFace,
  onRetakeDocument,
  onSubmit,
}: ReviewStepProps) {
  return (
    <div className="w-full space-y-6">
      <div className="text-center">
        <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
          Tahap 4 dari 4
        </span>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
          Pemeriksaan Akhir & Konfirmasi
        </h2>
        <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
          Periksa kembali kebenaran data dan foto sebelum dikirimkan ke petugas Admin/TU untuk diverifikasi.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Ringkasan Data Mahasiswa */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <User size={14} className="text-blue-600" />
            <span>Identitas Mahasiswa</span>
          </h3>
          <button
            type="button"
            onClick={onEditData}
            disabled={submitting}
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
          >
            <RotateCcw size={12} />
            <span>Ubah Data</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-slate-500 block">Nama Lengkap:</span>
            <span className="font-semibold text-slate-900">{studentData.name}</span>
          </div>
          <div>
            <span className="text-slate-500 block">NIM:</span>
            <span className="font-mono font-semibold text-slate-900">{studentData.nim}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Email Terverifikasi:</span>
            <span className="font-medium text-slate-800 flex items-center gap-1.5">
              <Mail size={12} className="text-slate-400" />
              <span>{studentData.email}</span>
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Kelas Akademik:</span>
            <span className="font-medium text-slate-800 flex items-center gap-1.5">
              <GraduationCap size={12} className="text-slate-400" />
              <span>{studentData.className}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Ringkasan Foto Wajah & Foto Kartu */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Foto Wajah */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h4 className="text-xs font-bold text-slate-800">Foto Wajah Referensi</h4>
              <button
                type="button"
                onClick={onRetakeFace}
                disabled={submitting}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
              >
                <RotateCcw size={12} />
                <span>Foto Ulang</span>
              </button>
            </div>
            <div className="aspect-[3/4] rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center border border-slate-200 shadow-inner">
              <img
                src={facePhotoUrl}
                alt="Foto Wajah Mahasiswa"
                className="w-full h-full object-cover"
                style={{ transform: 'none' }}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 text-center">
            Orientasi normal (tanpa mirror)
          </p>
        </div>

        {/* Foto Dokumen */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <IdCard size={14} className="text-blue-600" />
                <span>Foto Kartu ({documentType})</span>
              </h4>
              <button
                type="button"
                onClick={onRetakeDocument}
                disabled={submitting}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
              >
                <RotateCcw size={12} />
                <span>Foto Ulang</span>
              </button>
            </div>
            <div className="aspect-[3/4] rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center border border-slate-200 shadow-inner">
              <img
                src={documentPhotoUrl}
                alt={`Foto Kartu ${documentType}`}
                className="w-full h-full object-contain"
                style={{ transform: 'none' }}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 text-center">
            Dihapus permanen setelah pemeriksaan admin
          </p>
        </div>
      </div>

      {/* Catatan Privasi & Kebijakan */}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-start gap-2.5">
        <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Setelah permohonan dikirim, admin/petugas TU akan memeriksa kesesuaian identitas dan menetapkan status akun Anda. Foto kartu identitas Anda akan dihapus segera setelah verifikasi.
        </p>
      </div>

      {/* Tombol Kirim Permohonan */}
      <button
        type="button"
        disabled={submitting}
        onClick={onSubmit}
        className="w-full rounded-xl bg-blue-600 py-3 px-4 text-xs font-semibold text-white shadow-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Send size={15} />
        <span>{submitting ? 'Mengirimkan Permohonan Verifikasi...' : 'Kirim Permohonan Verifikasi ke Admin'}</span>
      </button>
    </div>
  );
}
