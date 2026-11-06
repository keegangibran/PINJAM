import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { dataUrlToBlob, isValidImageMimeType } from '@/lib/image';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const uploadPhotosSchema = z.object({
  face_photo_base64: z.string().min(100, 'Foto wajah referensi wajib diambil'),
  document_photo_base64: z.string().min(100, 'Foto dokumen identitas wajib diambil'),
  document_type: z.enum(['KTM', 'KTP']),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ studentId: string }> }
) {
  try {
    await requireStaff();
    const { studentId } = await context.params;

    if (!studentId) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'ID mahasiswa tidak valid.' } },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = uploadPhotosSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { face_photo_base64, document_photo_base64, document_type } = parsed.data;
    const adminClient = createAdminClient();

    // 1. Periksa keberadaan mahasiswa
    const { data: student, error: studentError } = await adminClient
      .from('students')
      .select('id, registration_status')
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      return NextResponse.json(
        { error: { code: 'STUDENT_NOT_FOUND', message: 'Mahasiswa tidak ditemukan.' } },
        { status: 404 }
      );
    }

    // 2. Dekode dan simpan foto wajah ke prefix faces/
    const faceBlob = dataUrlToBlob(face_photo_base64);
    if (!isValidImageMimeType(faceBlob.type)) {
      return NextResponse.json(
        { error: { code: 'INVALID_MIME', message: 'Format foto wajah harus JPEG, PNG, atau WebP.' } },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const facePath = `faces/face_${studentId}_${timestamp}.jpg`;
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

    // 3. Dekode dan simpan foto dokumen identitas ke prefix documents/
    const docBlob = dataUrlToBlob(document_photo_base64);
    if (!isValidImageMimeType(docBlob.type)) {
      // Compensating delete face photo jika gagal
      await adminClient.storage.from('smartprojex-media').remove([facePath]);
      return NextResponse.json(
        { error: { code: 'INVALID_MIME', message: 'Format foto dokumen harus JPEG, PNG, atau WebP.' } },
        { status: 400 }
      );
    }

    const docPath = `documents/doc_${studentId}_${timestamp}.jpg`;
    const docBuffer = Buffer.from(await docBlob.arrayBuffer());

    const { error: docUploadError } = await adminClient.storage
      .from('smartprojex-media')
      .upload(docPath, docBuffer, {
        contentType: docBlob.type || 'image/jpeg',
        upsert: true,
      });

    if (docUploadError) {
      // Compensating cleanup
      await adminClient.storage.from('smartprojex-media').remove([facePath]);
      return NextResponse.json(
        { error: { code: 'DOC_UPLOAD_FAILED', message: `Gagal menyimpan foto dokumen: ${docUploadError.message}` } },
        { status: 500 }
      );
    }

    // 4. Perbarui status mahasiswa menjadi PENDING_REVIEW
    const { error: updateError } = await adminClient
      .from('students')
      .update({
        profile_photo_path: facePath,
        verification_document_path: docPath,
        verification_document_type: document_type,
        registration_status: 'PENDING_REVIEW',
        updated_at: new Date().toISOString(),
      })
      .eq('id', studentId);

    if (updateError) {
      return NextResponse.json(
        { error: { code: 'UPDATE_FAILED', message: updateError.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Foto wajah dan dokumen identitas berhasil disimpan.',
      data: {
        profile_photo_path: facePath,
        verification_document_path: docPath,
        status: 'PENDING_REVIEW',
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
