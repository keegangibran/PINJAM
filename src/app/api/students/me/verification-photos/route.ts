import { requireStudent } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { dataUrlToBlob, isValidImageMimeType } from '@/lib/image';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const verificationPhotosSchema = z.object({
  face_photo_base64: z.string().min(100, 'Foto wajah referensi wajib diambil secara langsung.'),
  document_photo_base64: z.string().min(100, 'Foto kartu identitas wajib diambil secara langsung.'),
  document_type: z.enum(['KTM', 'KTP']),
});

export async function POST(request: Request) {
  try {
    const userContext = await requireStudent();
    const studentProfile = userContext.studentProfile;

    if (!studentProfile) {
      return NextResponse.json(
        { error: { code: 'PROFILE_NOT_FOUND', message: 'Profil mahasiswa tidak ditemukan.' } },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = verificationPhotosSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { face_photo_base64, document_photo_base64, document_type } = parsed.data;
    const adminClient = createAdminClient();

    // 1. Ambil data mahasiswa terkini dari DB
    const { data: student, error: studentError } = await adminClient
      .from('students')
      .select('id, registration_status, verification_document_path, profile_photo_path')
      .eq('id', studentProfile.id)
      .single();

    if (studentError || !student) {
      return NextResponse.json(
        { error: { code: 'STUDENT_NOT_FOUND', message: 'Data mahasiswa tidak ditemukan.' } },
        { status: 404 }
      );
    }

    // Hanya mahasiswa dalam proses registrasi/perbaikan yang dapat mengunggah foto
    const allowedStatuses = ['UNVERIFIED_EMAIL', 'PENDING_DOCUMENT', 'RESUBMISSION_REQUIRED', 'PENDING_REVIEW'];
    if (!allowedStatuses.includes(student.registration_status)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_STATUS',
            message: `Akun Anda berstatus ${student.registration_status}. Pengunggahan foto verifikasi tidak diizinkan.`,
          },
        },
        { status: 403 }
      );
    }

    // Cegah bypass verifikasi email: jika status akun masih UNVERIFIED_EMAIL dan sesi auth belum terkonfirmasi
    if (student.registration_status === 'UNVERIFIED_EMAIL' && !userContext.emailConfirmed) {
      return NextResponse.json(
        {
          error: {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Email belum diverifikasi. Silakan konfirmasi tautan di email Anda terlebih dahulu sebelum mengunggah foto verifikasi.',
          },
        },
        { status: 403 }
      );
    }

    // Batasan ukuran file: maksimal 2 MB, minimal 1 KB
    const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
    const MIN_PHOTO_BYTES = 1000;

    // 2. Dekode dan validasi foto wajah
    const faceBlob = dataUrlToBlob(face_photo_base64);
    if (!isValidImageMimeType(faceBlob.type)) {
      return NextResponse.json(
        { error: { code: 'INVALID_MIME', message: 'Format foto wajah harus JPEG, PNG, atau WebP.' } },
        { status: 400 }
      );
    }

    if (faceBlob.size > MAX_PHOTO_BYTES || faceBlob.size < MIN_PHOTO_BYTES) {
      return NextResponse.json(
        { error: { code: 'INVALID_FILE_SIZE', message: 'Ukuran foto wajah harus antara 1 KB hingga 2 MB.' } },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const facePath = `faces/face_${student.id}_${timestamp}.jpg`;
    const faceBuffer = Buffer.from(await faceBlob.arrayBuffer());

    const { error: faceUploadError } = await adminClient.storage
      .from('smartprojex-media')
      .upload(facePath, faceBuffer, {
        contentType: faceBlob.type || 'image/jpeg',
        upsert: true,
      });

    if (faceUploadError) {
      return NextResponse.json(
        { error: { code: 'FACE_UPLOAD_FAILED', message: `Gagal menyimpan foto wajah: ${faceUploadError.message}` } },
        { status: 500 }
      );
    }

    // 3. Dekode dan validasi foto kartu identitas (KTM / KTP)
    const docBlob = dataUrlToBlob(document_photo_base64);
    if (!isValidImageMimeType(docBlob.type)) {
      // Compensating delete foto wajah jika foto dokumen gagal validasi
      await adminClient.storage.from('smartprojex-media').remove([facePath]);
      return NextResponse.json(
        { error: { code: 'INVALID_MIME', message: 'Format foto dokumen harus JPEG, PNG, atau WebP.' } },
        { status: 400 }
      );
    }

    if (docBlob.size > MAX_PHOTO_BYTES || docBlob.size < MIN_PHOTO_BYTES) {
      await adminClient.storage.from('smartprojex-media').remove([facePath]);
      return NextResponse.json(
        { error: { code: 'INVALID_FILE_SIZE', message: 'Ukuran foto kartu identitas harus antara 1 KB hingga 2 MB.' } },
        { status: 400 }
      );
    }

    const docPath = `documents/doc_${student.id}_${timestamp}.jpg`;
    const docBuffer = Buffer.from(await docBlob.arrayBuffer());

    const { error: docUploadError } = await adminClient.storage
      .from('smartprojex-media')
      .upload(docPath, docBuffer, {
        contentType: docBlob.type || 'image/jpeg',
        upsert: true,
      });

    if (docUploadError) {
      await adminClient.storage.from('smartprojex-media').remove([facePath]);
      return NextResponse.json(
        { error: { code: 'DOC_UPLOAD_FAILED', message: `Gagal menyimpan foto kartu identitas: ${docUploadError.message}` } },
        { status: 500 }
      );
    }

    // 4. Bersihkan dokumen identitas lama dan foto wajah lama jika ada (retensi & mencegah file yatim saat resubmission)
    if (student.verification_document_path && student.verification_document_path !== docPath) {
      try {
        await adminClient.storage
          .from('smartprojex-media')
          .remove([student.verification_document_path]);
      } catch {
        // Non-blocking cleanup
      }
    }

    if (student.profile_photo_path && student.profile_photo_path !== facePath) {
      try {
        await adminClient.storage
          .from('smartprojex-media')
          .remove([student.profile_photo_path]);
      } catch {
        // Non-blocking cleanup
      }
    }

    // 5. Perbarui status mahasiswa menjadi PENDING_REVIEW
    const now = new Date().toISOString();
    const { error: updateError } = await adminClient
      .from('students')
      .update({
        profile_photo_path: facePath,
        verification_document_path: docPath,
        verification_document_type: document_type,
        registration_status: 'PENDING_REVIEW',
        updated_at: now,
      })
      .eq('id', student.id);

    if (updateError) {
      return NextResponse.json(
        { error: { code: 'UPDATE_FAILED', message: updateError.message } },
        { status: 500 }
      );
    }

    // 6. Catat audit log pengajuan verifikasi mandiri
    await recordAuditLog(adminClient, {
      action: 'STUDENT_VERIFICATION_SUBMITTED',
      entityType: 'students',
      entityId: student.id,
      actorStudentId: student.id,
      metadata: {
        document_type,
        status: 'PENDING_REVIEW',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Foto wajah dan kartu identitas berhasil dikirim. Permohonan Anda sedang menunggu pemeriksaan admin.',
      data: {
        student_id: student.id,
        registration_status: 'PENDING_REVIEW',
      },
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}
