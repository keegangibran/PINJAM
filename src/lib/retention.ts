import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';

export interface RetentionExecutionResult {
  success: boolean;
  code?: string;
  timestamp: string;
  retention_results: {
    deleted_document_photos: number;
    deleted_face_photos: number;
    deleted_loan_photos: number;
    expired_leaders_revoked: number;
  };
  storage_monitoring: {
    usage_bytes: number;
    usage_pct: number;
    warning_active: boolean;
    max_capacity_bytes: number;
  };
  keep_alive: boolean;
  failures: string[];
}

/**
 * Menghitung ukuran file dari daftar objek storage Supabase.
 */
function sumObjectBytes(files: Array<{ metadata?: { size?: number } | null }> | null): number {
  if (!files || !Array.isArray(files)) return 0;
  return files.reduce((acc, file) => acc + (file?.metadata?.size || 0), 0);
}

/**
 * Menjalankan tugas pemeliharaan terjadwal dan pembersihan retensi data (FR-20, NFR-08, NFR-10).
 * Bersifat idempoten dan aman terhadap partial failure.
 */
export async function executeRetentionAndMaintenance(options?: {
  force?: boolean;
}): Promise<RetentionExecutionResult> {
  const adminClient = createAdminClient();
  const startTime = new Date().toISOString();
  const failures: string[] = [];

  let deletedDocumentPhotosCount = 0;
  let deletedFacePhotosCount = 0;
  let deletedLoanPhotosCount = 0;
  let expiredLeadersRevokedCount = 0;

  // --------------------------------------------------------------------------
  // 0. Concurrency Protection (Mencegah eksekusi ganda simultan)
  // --------------------------------------------------------------------------
  const { data: lastRunSetting } = await adminClient
    .from('app_settings')
    .select('value')
    .eq('key', 'retention_last_run')
    .maybeSingle();

  const lastRunData = (lastRunSetting?.value as Record<string, unknown>) || {};
  if (!options?.force && lastRunData.status === 'RUNNING' && lastRunData.last_run_at) {
    const lastRunTime = new Date(String(lastRunData.last_run_at)).getTime();
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() - lastRunTime < fiveMinutes) {
      return {
        success: false,
        code: 'CRON_ALREADY_RUNNING',
        timestamp: startTime,
        retention_results: {
          deleted_document_photos: 0,
          deleted_face_photos: 0,
          deleted_loan_photos: 0,
          expired_leaders_revoked: 0,
        },
        storage_monitoring: {
          usage_bytes: 0,
          usage_pct: 0,
          warning_active: false,
          max_capacity_bytes: 1073741824,
        },
        keep_alive: true,
        failures: ['Tugas pembersihan retensi sedang berjalan di proses lain.'],
      };
    }
  }

  // Tandai status RUNNING
  await adminClient.from('app_settings').upsert({
    key: 'retention_last_run',
    value: {
      ...lastRunData,
      status: 'RUNNING',
      last_run_at: startTime,
    },
    description: 'Status proses retensi pemeliharaan sistem.',
    updated_at: startTime,
  });

  try {
    // --------------------------------------------------------------------------
    // 1. Pembersihan Foto Dokumen KTM/KTP Tertinggal (NFR-08)
    // Syarat: foto dokumen dihapus segera setelah keputusan (batas maksimal 24 jam).
    // --------------------------------------------------------------------------
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: studentsWithDocs } = await adminClient
      .from('students')
      .select('id, verification_document_path, registration_status, created_at')
      .not('verification_document_path', 'is', null);

    const eligibleDocStudents = (studentsWithDocs || []).filter((s) => {
      const isDecided = ['ACTIVE', 'REJECTED', 'RESUBMISSION_REQUIRED'].includes(
        s.registration_status
      );
      const isOver24h = new Date(s.created_at) < new Date(twentyFourHoursAgo);
      return isDecided || isOver24h;
    });

    for (const student of eligibleDocStudents) {
      if (!student.verification_document_path) continue;
      try {
        const { error: removeErr } = await adminClient.storage
          .from('smartprojex-media')
          .remove([student.verification_document_path]);

        if (!removeErr || removeErr.message?.toLowerCase().includes('not found')) {
          await adminClient
            .from('students')
            .update({ verification_document_path: null })
            .eq('id', student.id);
          deletedDocumentPhotosCount++;
        } else {
          failures.push(`Gagal hapus dokumen mahasiswa ${student.id}: ${removeErr.message}`);
        }
      } catch (err: unknown) {
        failures.push(`Error dokumen ${student.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // --------------------------------------------------------------------------
    // 2. Pembersihan Foto Wajah Mahasiswa INACTIVE > 90 Hari (NFR-08)
    // Syarat: akun INACTIVE dan deactivated_at < now() - 90 hari.
    // --------------------------------------------------------------------------
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: inactiveStudents } = await adminClient
      .from('students')
      .select('id, profile_photo_path, deactivated_at')
      .eq('registration_status', 'INACTIVE')
      .not('profile_photo_path', 'is', null)
      .lte('deactivated_at', ninetyDaysAgo);

    for (const student of inactiveStudents || []) {
      if (!student.profile_photo_path) continue;
      try {
        const { error: removeErr } = await adminClient.storage
          .from('smartprojex-media')
          .remove([student.profile_photo_path]);

        if (!removeErr || removeErr.message?.toLowerCase().includes('not found')) {
          await adminClient
            .from('students')
            .update({ profile_photo_path: null })
            .eq('id', student.id);
          deletedFacePhotosCount++;
        } else {
          failures.push(`Gagal hapus foto wajah mahasiswa ${student.id}: ${removeErr.message}`);
        }
      } catch (err: unknown) {
        failures.push(`Error wajah ${student.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // --------------------------------------------------------------------------
    // 3. Pembersihan Foto Transaksi Selesai > 180 Hari (NFR-08, GAP-05)
    // Syarat: status COMPLETED, returned_at < now() - 180 hari, kendala telah terselesaikan,
    // dan foto belum ditandai terhapus.
    // --------------------------------------------------------------------------
    const oneHundredEightyDaysAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const { data: candidateLoans } = await adminClient
      .from('loans')
      .select('id, borrow_photo_path, return_photo_path, return_condition, issue_resolved_at, returned_at')
      .eq('status', 'COMPLETED')
      .is('photos_deleted_at', null)
      .lte('returned_at', oneHundredEightyDaysAgo);

    // Filter kendala belum diselesaikan
    const eligibleLoans = (candidateLoans || []).filter((loan) => {
      const isIssueUnresolved =
        loan.return_condition === 'REPORTED_ISSUE' && loan.issue_resolved_at === null;
      if (isIssueUnresolved) return false;
      return !!(loan.borrow_photo_path || loan.return_photo_path);
    });

    for (const loan of eligibleLoans) {
      const pathsToDelete: string[] = [];
      if (loan.borrow_photo_path) pathsToDelete.push(loan.borrow_photo_path);
      if (loan.return_photo_path) pathsToDelete.push(loan.return_photo_path);

      if (pathsToDelete.length > 0) {
        try {
          const { error: removeErr } = await adminClient.storage
            .from('smartprojex-media')
            .remove(pathsToDelete);

          if (!removeErr || removeErr.message?.toLowerCase().includes('not found')) {
            await adminClient
              .from('loans')
              .update({
                borrow_photo_path: null,
                return_photo_path: null,
                photos_deleted_at: new Date().toISOString(),
              })
              .eq('id', loan.id);
            deletedLoanPhotosCount += pathsToDelete.length;
          } else {
            failures.push(`Gagal hapus foto transaksi ${loan.id}: ${removeErr.message}`);
          }
        } catch (err: unknown) {
          failures.push(`Error foto transaksi ${loan.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // --------------------------------------------------------------------------
    // 4. Kedaluwarsa & Pelepasan Ketua Kelas Akhir Semester (FR-20, D-07)
    // --------------------------------------------------------------------------
    const { data: termSetting } = await adminClient
      .from('app_settings')
      .select('value')
      .eq('key', 'academic_term')
      .maybeSingle();

    const termData = (termSetting?.value as { term_ends_at?: string }) || {};
    if (termData.term_ends_at && new Date(termData.term_ends_at) < new Date()) {
      const { data: classesWithLeaders } = await adminClient
        .from('classes')
        .select('id, leader_student_id, academic_term')
        .not('leader_student_id', 'is', null);

      for (const cls of classesWithLeaders || []) {
        if (!cls.leader_student_id) continue;
        try {
          // 1. Naikkan versi token QR mahasiswa agar token lama hangus
          const { data: std } = await adminClient
            .from('students')
            .select('qr_token_version')
            .eq('id', cls.leader_student_id)
            .single();

          if (std) {
            await adminClient
              .from('students')
              .update({ qr_token_version: (std.qr_token_version || 1) + 1 })
              .eq('id', cls.leader_student_id);
          }

          // 2. Lepas ketua kelas
          await adminClient
            .from('classes')
            .update({ leader_student_id: null, leader_since: null })
            .eq('id', cls.id);

          // 3. Catat audit log
          await recordAuditLog(adminClient, {
            action: 'LEADER_REVOKED',
            entityType: 'classes',
            entityId: cls.id,
            metadata: {
              reason: 'SEMESTER_EXPIRED',
              student_id: cls.leader_student_id,
              academic_term: cls.academic_term,
            },
          });

          expiredLeadersRevokedCount++;
        } catch (err: unknown) {
          failures.push(`Gagal melepas ketua kelas ${cls.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // --------------------------------------------------------------------------
    // 5. Pemantauan Kuota Storage & Peringatan 70% (NFR-10, PRD 7.1)
    // --------------------------------------------------------------------------
    const { data: storageSetting } = await adminClient
      .from('app_settings')
      .select('value')
      .eq('key', 'storage_monitoring')
      .maybeSingle();

    const storageConfig = (storageSetting?.value as {
      warning_threshold_pct?: number;
      max_capacity_bytes?: number;
    }) || {};

    const maxCapacityBytes = storageConfig.max_capacity_bytes || 1073741824; // 1 GB
    const warningThresholdPct = storageConfig.warning_threshold_pct || 70;

    let totalUsageBytes = 0;
    try {
      const [facesRes, docsRes, loansRes] = await Promise.all([
        adminClient.storage.from('smartprojex-media').list('faces', { limit: 1000 }),
        adminClient.storage.from('smartprojex-media').list('documents', { limit: 1000 }),
        adminClient.storage.from('smartprojex-media').list('loans', { limit: 1000 }),
      ]);

      totalUsageBytes =
        sumObjectBytes(facesRes.data) +
        sumObjectBytes(docsRes.data) +
        sumObjectBytes(loansRes.data);
    } catch {
      // Fallback perkiraan jika listing gagal
      totalUsageBytes = 0;
    }

    const usagePct = (totalUsageBytes / maxCapacityBytes) * 100;
    const roundedUsagePct = Math.round(usagePct * 100) / 100;
    const isWarningActive = usagePct >= warningThresholdPct;

    if (isWarningActive) {
      await recordAuditLog(adminClient, {
        action: 'STORAGE_WARNING',
        entityType: 'storage',
        metadata: {
          usage_bytes: totalUsageBytes,
          max_capacity_bytes: maxCapacityBytes,
          usage_pct: roundedUsagePct,
          threshold_pct: warningThresholdPct,
        },
      });
    }

    // Simpan pembaruan status storage ke app_settings
    await adminClient.from('app_settings').upsert({
      key: 'storage_monitoring',
      value: {
        ...storageConfig,
        current_usage_bytes: totalUsageBytes,
        current_usage_pct: roundedUsagePct,
        warning_active: isWarningActive,
        last_checked_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    });

    // --------------------------------------------------------------------------
    // 6. Kueri Ringan Keep-Alive Supabase Free-Tier (NFR-10, PRD 7.1)
    // --------------------------------------------------------------------------
    await adminClient.from('app_settings').select('key').limit(1);

    // --------------------------------------------------------------------------
    // 7. Simpan Hasil Akhir ke app_settings & Audit Log
    // --------------------------------------------------------------------------
    const statusOutcome = failures.length === 0 ? 'SUCCESS' : 'PARTIAL_FAILURE';
    const finalResult = {
      last_run_at: new Date().toISOString(),
      status: statusOutcome,
      deleted_document_photos: deletedDocumentPhotosCount,
      deleted_face_photos: deletedFacePhotosCount,
      deleted_loan_photos: deletedLoanPhotosCount,
      expired_leaders_revoked: expiredLeadersRevokedCount,
      storage_usage_bytes: totalUsageBytes,
      storage_usage_pct: roundedUsagePct,
      storage_warning_active: isWarningActive,
      failures: failures.length > 0 ? failures : null,
    };

    await adminClient.from('app_settings').upsert({
      key: 'retention_last_run',
      value: finalResult,
      description: 'Catatan status eksekusi tugas pembersihan retensi dan pemeliharaan sistem terakhir.',
      updated_at: new Date().toISOString(),
    });

    await recordAuditLog(adminClient, {
      action: 'RETENTION_CLEANUP_EXECUTED',
      entityType: 'storage',
      metadata: {
        status: statusOutcome,
        deleted_document_photos: deletedDocumentPhotosCount,
        deleted_face_photos: deletedFacePhotosCount,
        deleted_loan_photos: deletedLoanPhotosCount,
        expired_leaders_revoked: expiredLeadersRevokedCount,
        failures_count: failures.length,
      },
    });

    return {
      success: failures.length === 0,
      timestamp: startTime,
      retention_results: {
        deleted_document_photos: deletedDocumentPhotosCount,
        deleted_face_photos: deletedFacePhotosCount,
        deleted_loan_photos: deletedLoanPhotosCount,
        expired_leaders_revoked: expiredLeadersRevokedCount,
      },
      storage_monitoring: {
        usage_bytes: totalUsageBytes,
        usage_pct: roundedUsagePct,
        warning_active: isWarningActive,
        max_capacity_bytes: maxCapacityBytes,
      },
      keep_alive: true,
      failures,
    };
  } catch (fatalError: unknown) {
    const errorMsg = fatalError instanceof Error ? fatalError.message : String(fatalError);
    // Jika terjadi fatal error, update status FAILED agar tidak stuck di RUNNING
    await adminClient.from('app_settings').upsert({
      key: 'retention_last_run',
      value: {
        last_run_at: new Date().toISOString(),
        status: 'FAILED',
        error_message: errorMsg,
      },
      updated_at: new Date().toISOString(),
    });

    throw fatalError;
  }
}
