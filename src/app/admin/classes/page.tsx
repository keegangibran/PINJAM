'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ClassItem {
  id: string;
  study_program: string;
  cohort_year: number;
  section: string;
  academic_term: string;
  is_active: boolean;
  leader_student_id: string | null;
  leader_since: string | null;
  leader?: {
    id: string;
    name: string;
    nim: string;
    email: string;
    registration_status: string;
  } | null;
}

export default function AdminClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTerm, setSelectedTerm] = useState<string>('ALL');

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [releaseModalClass, setReleaseModalClass] = useState<ClassItem | null>(null);
  const [releaseReason, setReleaseReason] = useState('');

  // Form State Tambah Kelas
  const [formProdi, setFormProdi] = useState('');
  const [formAngkatan, setFormAngkatan] = useState(new Date().getFullYear());
  const [formRombel, setFormRombel] = useState('A');
  const [formSemester, setFormSemester] = useState('2026/2027-GANJIL');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Form State Salin Semester
  const [sourceTerm, setSourceTerm] = useState('');
  const [targetTerm, setTargetTerm] = useState('');

  const fetchClasses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/classes');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Gagal memuat data kelas.');
      } else {
        setClasses(data.data || []);
      }
    } catch {
      setError('Gangguan jaringan saat memuat data kelas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    try {
      const res = await fetch('/api/admin/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          study_program: formProdi,
          cohort_year: Number(formAngkatan),
          section: formRombel,
          academic_term: formSemester,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error?.message || 'Gagal menambahkan kelas.');
      } else {
        setShowAddModal(false);
        setFormProdi('');
        fetchClasses();
      }
    } catch {
      alert('Terjadi kesalahan sistem.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleActive = async (cls: ClassItem) => {
    if (!confirm(`Ubah status keaktifan kelas ${cls.study_program} ${cls.cohort_year}-${cls.section}?`)) {
      return;
    }
    try {
      const res = await fetch('/api/admin/classes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cls.id, is_active: !cls.is_active }),
      });
      if (res.ok) fetchClasses();
    } catch {
      alert('Gagal memperbarui status kelas.');
    }
  };

  const handleReleaseLeader = async () => {
    if (!releaseModalClass) return;
    try {
      const res = await fetch('/api/admin/classes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: releaseModalClass.id,
          release_leader: true,
          release_reason: releaseReason || 'Pelepasan manual oleh administrator',
        }),
      });
      if (res.ok) {
        setReleaseModalClass(null);
        setReleaseReason('');
        fetchClasses();
      } else {
        const data = await res.json();
        alert(data.error?.message || 'Gagal melepas ketua kelas.');
      }
    } catch {
      alert('Terjadi kesalahan.');
    }
  };

  const handleCopyTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    try {
      const res = await fetch('/api/admin/classes/copy-term', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_term: sourceTerm, target_term: targetTerm }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error?.message || 'Gagal menyalin kelas semester.');
      } else {
        alert(data.message);
        setShowCopyModal(false);
        fetchClasses();
      }
    } catch {
      alert('Terjadi kesalahan sistem.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const terms = Array.from(new Set(classes.map((c) => c.academic_term)));

  const filteredClasses = classes.filter((c) => {
    const matchSearch =
      c.study_program.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.section.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.cohort_year.toString().includes(searchTerm) ||
      (c.leader?.name && c.leader.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.leader?.nim && c.leader.nim.includes(searchTerm));

    const matchTerm = selectedTerm === 'ALL' || c.academic_term === selectedTerm;
    return matchSearch && matchTerm;
  });

  return (
    <div className="min-h-screen p-6 md:p-8 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                Admin Panel
              </span>
              <h1 className="text-2xl font-bold text-slate-900">Manajemen Kelas & Semester</h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Pengelolaan daftar kelas baku kombinasi prodi, angkatan, rombel, dan penetapan ketua kelas.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50"
            >
              ← Kembali ke Dashboard
            </Link>
            <button
              onClick={() => {
                setSourceTerm(terms[0] || '2026/2027-GANJIL');
                setShowCopyModal(true);
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50"
            >
              Salin ke Semester Baru
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700"
            >
              + Tambah Kelas Baku
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Cari prodi, rombel, angkatan, atau nama/NIM ketua..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">Semua Semester ({classes.length} kelas)</option>
            {terms.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Content Table */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">Memuat data kelas baku...</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-600">{error}</div>
          ) : filteredClasses.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              Tidak ada data kelas yang cocok dengan pencarian.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Program Studi</th>
                    <th className="py-3 px-4">Angkatan</th>
                    <th className="py-3 px-4">Rombel</th>
                    <th className="py-3 px-4">Semester</th>
                    <th className="py-3 px-4">Ketua Kelas Aktif</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClasses.map((cls) => (
                    <tr key={cls.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-semibold text-slate-900">{cls.study_program}</td>
                      <td className="py-3 px-4 text-slate-600">{cls.cohort_year}</td>
                      <td className="py-3 px-4 font-bold text-blue-600">{cls.section}</td>
                      <td className="py-3 px-4 text-slate-600">{cls.academic_term}</td>
                      <td className="py-3 px-4">
                        {cls.leader ? (
                          <div>
                            <p className="font-semibold text-slate-900">{cls.leader.name}</p>
                            <p className="text-slate-500 font-mono text-[11px]">{cls.leader.nim}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Belum ada ketua</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            cls.is_active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {cls.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {cls.leader && (
                          <button
                            onClick={() => {
                              setReleaseModalClass(cls);
                              setReleaseReason('');
                            }}
                            className="text-amber-600 hover:text-amber-700 font-medium text-[11px]"
                          >
                            Lepas Ketua
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleActive(cls)}
                          className="text-slate-600 hover:text-slate-900 font-medium text-[11px]"
                        >
                          {cls.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Tambah Kelas */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Tambah Kelas Baku Baru</h2>
            <p className="text-xs text-slate-500 mt-1">
              Daftar kelas baku memastikan mahasiswa memilih rombel tetap tanpa input bebas.
            </p>

            <form onSubmit={handleCreateClass} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Program Studi</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pendidikan Matematika"
                  value={formProdi}
                  onChange={(e) => setFormProdi(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun Angkatan</label>
                  <input
                    type="number"
                    required
                    min={2000}
                    max={2100}
                    value={formAngkatan}
                    onChange={(e) => setFormAngkatan(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Rombel / Kelas</label>
                  <input
                    type="text"
                    required
                    placeholder="A / B / C"
                    value={formRombel}
                    onChange={(e) => setFormRombel(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Semester Akademik</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 2026/2027-GANJIL"
                  value={formSemester}
                  onChange={(e) => setFormSemester(e.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50"
                >
                  {formSubmitting ? 'Menyimpan...' : 'Simpan Kelas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Salin Semester Baru */}
      {showCopyModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Salin Kelas ke Semester Baru</h2>
            <p className="text-xs text-slate-500 mt-1">
              Menyalin seluruh kelas aktif dari semester sumber ke semester target baru tanpa ketua kelas (FR-01F).
            </p>

            <form onSubmit={handleCopyTerm} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Semester Sumber Asal</label>
                <input
                  type="text"
                  required
                  value={sourceTerm}
                  onChange={(e) => setSourceTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Semester Target Baru</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 2026/2027-GENAP"
                  value={targetTerm}
                  onChange={(e) => setTargetTerm(e.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCopyModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50"
                >
                  {formSubmitting ? 'Menyalin...' : 'Mulai Salin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Pelepasan Ketua Kelas */}
      {releaseModalClass && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Konfirmasi Pelepasan Ketua Kelas</h2>
            <p className="text-xs text-slate-600 mt-2">
              Anda akan melepas jabatan ketua kelas untuk:{' '}
              <strong className="text-slate-900">
                {releaseModalClass.leader?.name} ({releaseModalClass.leader?.nim})
              </strong>{' '}
              pada kelas {releaseModalClass.study_program} {releaseModalClass.cohort_year}-{releaseModalClass.section}.
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl mt-3 border border-amber-200">
              Perhatian: Tindakan ini akan langsung menaikkan versi token QR mahasiswa bersangkutan sehingga QR Pass aktifnya langsung gugur dan tercatat di audit log.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alasan Pelepasan (Wajib dicatat di audit log)
              </label>
              <textarea
                required
                rows={2}
                placeholder="Contoh: Mengundurkan diri / mutasi rombel / permintaan prodi"
                value={releaseReason}
                onChange={(e) => setReleaseReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReleaseModalClass(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleReleaseLeader}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl"
              >
                Lepas Jabatan Ketua
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
