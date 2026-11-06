'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Link from 'next/link';

interface QrData {
  token: string;
  token_version: number;
  expires_at: string;
  expires_in: number;
  student: {
    id: string;
    name: string;
    nim: string;
    profile_photo_path: string | null;
    class: {
      id: string;
      study_program: string;
      cohort_year: number;
      section: string;
      academic_term: string;
    };
  };
}

interface Classmate {
  id: string;
  name: string;
  nim: string;
}

export default function MyQrPassPage() {
  const [qrData, setQrData] = useState<QrData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  // Modals
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeSuccessMessage, setRevokeSuccessMessage] = useState<string | null>(null);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [classmates, setClassmates] = useState<Classmate[]>([]);
  const [loadingClassmates, setLoadingClassmates] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [transferReason, setTransferReason] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<boolean>(false);

  // Monitor network status
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Live real-time clock for moving visual watermark
  useEffect(() => {
    const clockInterval = setInterval(() => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + `.${Math.floor(now.getMilliseconds() / 100)}`
      );
    }, 100);
    return () => clearInterval(clockInterval);
  }, []);

  // Fetch QR Token
  const fetchQrToken = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/students/me/qr');
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || { code: 'FETCH_ERROR', message: 'Gagal memuat QR Pass.' });
        setQrData(null);
      } else {
        setQrData(json.data);
        setTimeLeft(json.data.expires_in || 60);
        setError(null);
      }
    } catch {
      setError({
        code: 'NETWORK_ERROR',
        message: 'Tidak dapat menghubungi server. Periksa sambungan internet ponsel Anda.',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchQrToken();
  }, [fetchQrToken]);

  // Countdown timer & auto-refresh at 45s (sisa 15s)
  const isFetchingRef = useRef(false);
  useEffect(() => {
    if (!qrData || error) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (!isFetchingRef.current) {
            isFetchingRef.current = true;
            fetchQrToken(true).finally(() => {
              isFetchingRef.current = false;
            });
          }
          return 60;
        }

        // Auto-refresh seamlessly saat sisa waktu 15 detik (token telah berusia 45 detik)
        if (prev === 15 && !isFetchingRef.current) {
          isFetchingRef.current = true;
          fetchQrToken(true).finally(() => {
            isFetchingRef.current = false;
          });
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [qrData, error, fetchQrToken]);

  // Emergency Revoke QR
  const handleRevokeQr = async () => {
    setIsRevoking(true);
    try {
      const res = await fetch('/api/students/me/qr/revoke', {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error?.message || 'Gagal mencabut QR Pass.');
      } else {
        setShowRevokeModal(false);
        setRevokeSuccessMessage(
          `QR Pass berhasil dicabut. Versi token dinaikkan ke versi ${data.data.new_version}. QR baru telah diterbitkan.`
        );
        fetchQrToken(false);
        setTimeout(() => setRevokeSuccessMessage(null), 6000);
      }
    } catch {
      alert('Terjadi kesalahan jaringan saat mencabut QR Pass.');
    } finally {
      setIsRevoking(false);
    }
  };

  // Open Transfer Modal & fetch eligible classmates
  const handleOpenTransferModal = async () => {
    setShowTransferModal(true);
    setLoadingClassmates(true);
    setTransferError(null);
    try {
      const res = await fetch('/api/students/me/classmates');
      const json = await res.json();
      if (res.ok) {
        setClassmates(json.data || []);
      } else {
        setTransferError(json.error?.message || 'Gagal memuat daftar rekan sekelas.');
      }
    } catch {
      setTransferError('Gangguan jaringan saat memuat rekan sekelas.');
    } finally {
      setLoadingClassmates(false);
    }
  };

  // Execute Transfer
  const handleExecuteTransfer = async () => {
    if (!selectedTargetId) {
      setTransferError('Pilih salah satu rekan sekelas untuk menerima jabatan ketua.');
      return;
    }

    setIsTransferring(true);
    setTransferError(null);
    try {
      const res = await fetch('/api/students/me/leader/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_student_id: selectedTargetId,
          reason: transferReason || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setTransferError(json.error?.message || 'Gagal mengalihkan jabatan ketua kelas.');
      } else {
        setTransferSuccess(true);
      }
    } catch {
      setTransferError('Terjadi gangguan jaringan saat memproses serah-terima jabatan.');
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between p-4 sm:p-6 text-slate-800">
      <div className="max-w-md w-full mx-auto space-y-4">
        {/* Header App Bar */}
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-sm font-bold text-slate-900 tracking-tight">SmartProjex Pass</span>
          </div>
          <Link
            href="/"
            className="text-xs text-slate-500 hover:text-slate-800 font-medium px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Beranda
          </Link>
        </div>

        {/* Offline Warning Banner */}
        {!isOnline && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2 shadow-sm">
            <span className="text-base">⚠️</span>
            <div>
              <p className="font-semibold">Ponsel Offline</p>
              <p className="mt-0.5">
                Koneksi internet terputus. QR Pass tidak dapat diperbarui secara otomatis. Pastikan ponsel terhubung ke WiFi kampus atau data seluler.
              </p>
            </div>
          </div>
        )}

        {/* Success Toast */}
        {revokeSuccessMessage && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-start gap-2 shadow-sm animate-fade-in">
            <span className="text-base">✅</span>
            <p>{revokeSuccessMessage}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 text-center space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-sm text-slate-500">Menghasilkan QR Pass aman...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto text-xl">
              ✕
            </div>
            <h2 className="text-base font-bold text-slate-900">QR Pass Tidak Tersedia</h2>
            <p className="text-xs text-slate-600 leading-relaxed">{error.message}</p>

            {error.code === 'ACCOUNT_NOT_ACTIVE' && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-left text-xs text-blue-800">
                <p className="font-semibold mb-1">Menunggu Verifikasi Tatap Muka:</p>
                <p>
                  Silakan kunjungi loket Tata Usaha (TU) dengan membawa KTM fisik atau KTP asli Anda untuk menyelesaikan verifikasi identitas ketua kelas.
                </p>
              </div>
            )}

            {error.code === 'NOT_CLASS_LEADER' && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-left text-xs text-amber-800">
                <p className="font-semibold mb-1">Status Bukan Ketua Kelas Aktif:</p>
                <p>
                  QR Pass peminjaman hanya dapat diakses oleh ketua kelas aktif yang terdaftar pada semester berjalan.
                </p>
              </div>
            )}

            <button
              onClick={() => fetchQrToken(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
            >
              Coba Muat Ulang
            </button>
          </div>
        )}

        {/* Active QR Pass Card */}
        {!loading && qrData && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 text-center space-y-5">
            {/* Student Identity Section */}
            <div className="space-y-1">
              <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
                Ketua Kelas Aktif
              </span>
              <h1 className="text-lg font-bold text-slate-900 pt-1">{qrData.student.name}</h1>
              <p className="text-xs font-mono text-slate-500">NIM: {qrData.student.nim}</p>
              <p className="text-xs text-slate-600 font-medium">
                {qrData.student.class.study_program} ({qrData.student.class.cohort_year}-{qrData.student.class.section})
              </p>
              <p className="text-[11px] text-slate-400 font-mono">{qrData.student.class.academic_term}</p>
            </div>

            {/* QR Code Container with 220px+ with Quiet Zone */}
            <div className="relative mx-auto flex flex-col items-center justify-center p-4 bg-white rounded-2xl border-2 border-slate-100 shadow-inner w-[260px] h-[260px]">
              <QRCodeSVG
                value={qrData.token}
                size={220}
                level="M"
                marginSize={2}
                bgColor="#ffffff"
                fgColor="#0f172a"
              />

              {/* Dynamic Animated Pulse Ring */}
              <div
                className={`absolute inset-0 rounded-2xl border-2 pointer-events-none transition-colors duration-500 ${
                  timeLeft <= 10 ? 'border-red-400 animate-pulse' : 'border-emerald-300'
                }`}
              />
            </div>

            {/* Visual Moving Clock Watermark & Token Refresh Status */}
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-slate-500">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>WAKTU AKTIF: {currentTimeStr || '00:00:00'} WIB</span>
              </div>
              <p className="text-[10px] text-slate-400">
                Token Kriptografis v{qrData.token_version} (Berubah otomatis tiap 60 detik)
              </p>
            </div>

            {/* Countdown Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-semibold px-1">
                <span className="text-slate-500">Sisa Masa Berlaku QR:</span>
                <span className={timeLeft <= 10 ? 'text-red-600 font-mono font-bold' : 'text-blue-600 font-mono'}>
                  {timeLeft} detik {isRefreshing && '(Memperbarui...)'}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                    timeLeft <= 10 ? 'bg-red-500' : 'bg-blue-600'
                  }`}
                  style={{ width: `${(timeLeft / 60) * 100}%` }}
                />
              </div>
            </div>

            {/* Brightness Instruction */}
            <div className="rounded-xl bg-blue-50/70 border border-blue-100 p-2.5 text-[11px] text-blue-700 flex items-center justify-center gap-2">
              <span>💡</span>
              <span>Naikkan kecerahan layar ponsel agar mudah dipindai di Kiosk.</span>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setShowRevokeModal(true)}
                className="w-full py-2.5 px-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
              >
                <span>🚫</span>
                <span>Cabut QR</span>
              </button>

              <button
                type="button"
                onClick={handleOpenTransferModal}
                className="w-full py-2.5 px-3 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <span>🔄</span>
                <span>Alihkan Jabatan</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Emergency Revoke Confirmation Modal */}
      {showRevokeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl space-y-4 animate-scale-up">
            <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto text-xl">
              ⚠️
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Cabut QR Pass Sekarang?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tindakan darurat ini akan menaikkan versi token akun Anda di server. Seluruh QR Code lama (termasuk tangkapan layar) akan langsung gugur dan ditolak oleh Kiosk.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isRevoking}
                onClick={() => setShowRevokeModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isRevoking}
                onClick={handleRevokeQr}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isRevoking ? 'Mencabut...' : 'Ya, Cabut QR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Leadership Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl space-y-4 animate-scale-up max-h-[90vh] overflow-y-auto">
            {!transferSuccess ? (
              <>
                <div className="text-center space-y-1">
                  <span className="text-2xl">🔄</span>
                  <h3 className="text-base font-bold text-slate-900">Serah-Terima Jabatan Ketua Kelas</h3>
                  <p className="text-xs text-slate-500">
                    Pilih salah satu rekan sekelas berstatus aktif untuk dijadikan ketua kelas baru.
                  </p>
                </div>

                {transferError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {transferError}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Pilih Rekan Sekelas (Wajib ACTIVE):
                    </label>
                    {loadingClassmates ? (
                      <div className="py-6 text-center text-xs text-slate-400">
                        Memuat daftar mahasiswa sekelas...
                      </div>
                    ) : classmates.length === 0 ? (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 text-center">
                        Tidak ada rekan sekelas lain yang berstatus ACTIVE saat ini.
                      </div>
                    ) : (
                      <select
                        value={selectedTargetId}
                        onChange={(e) => setSelectedTargetId(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">-- Pilih Mahasiswa Penerima --</option>
                        {classmates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.nim})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Alasan Serah-Terima (Opsional):
                    </label>
                    <textarea
                      value={transferReason}
                      onChange={(e) => setTransferReason(e.target.value)}
                      placeholder="Contoh: Pengunduran diri, pergantian kepengurusan rombel..."
                      rows={2}
                      className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                    <strong>Peringatan Penting:</strong> Pengalihan jabatan berlaku seketika (FR-01E). Status ketua kelas dan hak akses QR Pass Anda akan dicabut seketika setelah tombol ditekan.
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isTransferring}
                    onClick={() => setShowTransferModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={isTransferring || !selectedTargetId || classmates.length === 0}
                    onClick={handleExecuteTransfer}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isTransferring ? 'Memproses...' : 'Alihkan Sekarang'}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center space-y-4 py-4">
                <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-xl">
                  ✓
                </div>
                <h3 className="text-base font-bold text-slate-900">Serah-Terima Jabatan Berhasil!</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Jabatan ketua kelas telah dipindahkan ke rekan sekelas Anda. QR Pass lama Anda telah dicabut secara atomik.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowTransferModal(false);
                    setTransferSuccess(false);
                    fetchQrToken(false);
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
                >
                  Selesai
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="text-center py-4 text-[11px] text-slate-400">
        SmartProjex TU Fakultas • Gunakan di Layar HP
      </div>
    </div>
  );
}
