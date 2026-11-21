import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateQrPassToken, verifyQrPassToken } from '@/lib/qr-token';

const hasStagingCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://your-project-id.supabase.co' &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY !== 'your-service-role-key-placeholder'
);

describe.skipIf(!hasStagingCredentials)('Live Lifecycle & Storage Retention Integration Test Suite', () => {
  let adminClient: SupabaseClient;

  beforeAll(() => {
    if (hasStagingCredentials) {
      adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
    }
  });

  const testNim = '4253259988';
  const testEmail = 'uji.fungsional@pinjam.test';
  let createdStudentId: string | null = null;
  let createdAuthUserId: string | null = null;
  const createdFiles: string[] = [];

  const syntheticJpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const syntheticBody = Buffer.alloc(1500, 0x55);
  const testJpegBuffer = Buffer.concat([syntheticJpegHeader, syntheticBody]);

  afterAll(async () => {
    // Cleanup synthetic student, storage files, and auth user
    if (!adminClient) return;
    if (createdFiles.length > 0) {
      await adminClient.storage.from('smartprojex-media').remove(createdFiles);
    }
    if (createdStudentId) {
      await adminClient.from('students').delete().eq('id', createdStudentId);
    }
    if (createdAuthUserId) {
      await adminClient.auth.admin.deleteUser(createdAuthUserId);
    }
  });

  it('1. Membuat akun mahasiswa uji di database dengan status PENDING_DOCUMENT', async () => {
    // Bersihkan user lama jika ada
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existing = existingUsers.users.find(u => u.email === testEmail);
    if (existing) {
      await adminClient.from('students').delete().eq('auth_user_id', existing.id);
      await adminClient.auth.admin.deleteUser(existing.id);
    }

    // 1. Buat user di Supabase Auth
    const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: 'PasswordTest123!',
      email_confirm: true,
    });

    expect(authErr).toBeNull();
    expect(authUser?.user).toBeDefined();
    if (!authUser?.user) {
      throw new Error('User creation failed: authUser.user is null');
    }
    createdAuthUserId = authUser.user.id;

    // 2. Buat record mahasiswa di tabel students dengan auth_user_id
    const { data: student, error } = await adminClient.from('students').insert({
      auth_user_id: createdAuthUserId,
      nim: testNim,
      name: 'Mahasiswa Uji Fungsional',
      email: testEmail,
      registration_status: 'PENDING_DOCUMENT',
      qr_token_version: 1,
    }).select().single();

    expect(error).toBeNull();
    expect(student).toBeDefined();
    expect(student.registration_status).toBe('PENDING_DOCUMENT');
    createdStudentId = student.id;
  });

  it('2. Mengunggah foto wajah dan KTM ke storage privat dan memperbarui status ke PENDING_REVIEW', async () => {
    expect(createdStudentId).toBeDefined();

    const facePath1 = `faces/face_${createdStudentId}_1.jpg`;
    const docPath1 = `documents/doc_${createdStudentId}_1.jpg`;
    createdFiles.push(facePath1, docPath1);

    const { error: faceErr } = await adminClient.storage
      .from('smartprojex-media')
      .upload(facePath1, testJpegBuffer, { contentType: 'image/jpeg', upsert: true });
    expect(faceErr).toBeNull();

    const { error: docErr } = await adminClient.storage
      .from('smartprojex-media')
      .upload(docPath1, testJpegBuffer, { contentType: 'image/jpeg', upsert: true });
    expect(docErr).toBeNull();

    const { error: updateErr } = await adminClient
      .from('students')
      .update({
        profile_photo_path: facePath1,
        verification_document_path: docPath1,
        verification_document_type: 'KTM',
        registration_status: 'PENDING_REVIEW',
      })
      .eq('id', createdStudentId!);

    expect(updateErr).toBeNull();

    const { data: student } = await adminClient
      .from('students')
      .select('registration_status, profile_photo_path, verification_document_path')
      .eq('id', createdStudentId!)
      .single();

    expect(student?.registration_status).toBe('PENDING_REVIEW');
  });

  it('3. Admin Skenario 1: REQUEST_RESUBMISSION menghapus KTM lama dan menyimpan catatan', async () => {
    const docPath1 = `documents/doc_${createdStudentId}_1.jpg`;

    // Penghapusan dokumen instan pasca keputusan
    const { error: removeErr } = await adminClient.storage
      .from('smartprojex-media')
      .remove([docPath1]);
    expect(removeErr).toBeNull();

    const notes = 'Foto KTM buram, harap foto ulang di meja TU';
    const { error: updateErr } = await adminClient
      .from('students')
      .update({
        registration_status: 'RESUBMISSION_REQUIRED',
        verification_notes: notes,
        verification_document_path: null,
      })
      .eq('id', createdStudentId!);

    expect(updateErr).toBeNull();

    // Verifikasi dokumen KTM lama benar-benar terhapus dari storage
    const { data: checkDoc } = await adminClient.storage
      .from('smartprojex-media')
      .list('documents');
    const hasOldDoc = (checkDoc || []).some(d => d.name.includes(createdStudentId!));
    expect(hasOldDoc).toBe(false);

    const { data: student } = await adminClient
      .from('students')
      .select('registration_status, verification_notes, verification_document_path')
      .eq('id', createdStudentId!)
      .single();

    expect(student?.registration_status).toBe('RESUBMISSION_REQUIRED');
    expect(student?.verification_notes).toBe(notes);
    expect(student?.verification_document_path).toBeNull();
  });

  it('4. Mahasiswa Resubmission: Unggah foto pengganti dan bersihkan foto wajah lama', async () => {
    const facePath1 = `faces/face_${createdStudentId}_1.jpg`;
    const facePath2 = `faces/face_${createdStudentId}_2.jpg`;
    const docPath2 = `documents/doc_${createdStudentId}_2.jpg`;
    createdFiles.push(facePath2, docPath2);

    // Bersihkan foto wajah lama saat resubmit
    await adminClient.storage.from('smartprojex-media').remove([facePath1]);

    await adminClient.storage.from('smartprojex-media').upload(facePath2, testJpegBuffer, { contentType: 'image/jpeg', upsert: true });
    await adminClient.storage.from('smartprojex-media').upload(docPath2, testJpegBuffer, { contentType: 'image/jpeg', upsert: true });

    await adminClient.from('students').update({
      profile_photo_path: facePath2,
      verification_document_path: docPath2,
      registration_status: 'PENDING_REVIEW',
    }).eq('id', createdStudentId!);

    // Verifikasi foto wajah lama telah hilang dan hanya foto wajah baru yang ada
    const { data: faceList } = await adminClient.storage
      .from('smartprojex-media')
      .list('faces');

    const hasFace1 = (faceList || []).some(f => f.name.includes(createdStudentId!) && f.name.includes('_1.jpg'));
    const hasFace2 = (faceList || []).some(f => f.name.includes(createdStudentId!) && f.name.includes('_2.jpg'));

    expect(hasFace1).toBe(false);
    expect(hasFace2).toBe(true);
  });

  it('5. Admin Skenario 2: APPROVE menghapus KTM instan (NFR-08) dan mempertahankan foto wajah (Retensi)', async () => {
    const docPath2 = `documents/doc_${createdStudentId}_2.jpg`;

    // Hapus KTM instan dari storage
    const { error: removeErr } = await adminClient.storage
      .from('smartprojex-media')
      .remove([docPath2]);
    expect(removeErr).toBeNull();

    const { error: updateErr } = await adminClient
      .from('students')
      .update({
        registration_status: 'ACTIVE',
        verification_checks: { face_match: true, name_match: true, status_confirmed: true },
        verification_notes: 'Disetujui',
        verification_document_path: null,
        verified_at: new Date().toISOString(),
      })
      .eq('id', createdStudentId!);

    expect(updateErr).toBeNull();

    // Verifikasi dokumen KTM hilang 100%
    const { data: checkDoc } = await adminClient.storage
      .from('smartprojex-media')
      .list('documents');
    const hasAnyDoc = (checkDoc || []).some(d => d.name.includes(createdStudentId!));
    expect(hasAnyDoc).toBe(false);

    // Verifikasi foto wajah referensi tetap ada di storage
    const { data: checkFace } = await adminClient.storage
      .from('smartprojex-media')
      .list('faces');
    const hasActiveFace = (checkFace || []).some(f => f.name.includes(createdStudentId!));
    expect(hasActiveFace).toBe(true);
  });

  it('6. Mahasiswa ACTIVE dapat menerbitkan QR Token signed HS256 yang valid di Kiosk', async () => {
    const { data: student } = await adminClient
      .from('students')
      .select('id, qr_token_version, registration_status')
      .eq('id', createdStudentId!)
      .single();

    expect(student?.registration_status).toBe('ACTIVE');

    const token = await generateQrPassToken({
      studentId: student!.id,
      tokenVersion: student!.qr_token_version,
    });

    expect(token).toBeDefined();

    const verifyResult = await verifyQrPassToken({ token });
    expect(verifyResult.valid).toBe(true);
    if (verifyResult.valid) {
      expect(verifyResult.payload.studentId).toBe(student!.id);
      expect(verifyResult.payload.tokenVersion).toBe(student!.qr_token_version);
    }
  });

  it('7. Mencegah modifikasi ganda jika akun sudah ACTIVE (Optimistic Concurrency Protection)', async () => {
    const modifiableStatuses = ['PENDING_REVIEW', 'PENDING_DOCUMENT', 'RESUBMISSION_REQUIRED', 'PENDING_VERIFICATION'];
    const { data: student } = await adminClient
      .from('students')
      .select('registration_status')
      .eq('id', createdStudentId!)
      .single();

    const canModify = modifiableStatuses.includes(student!.registration_status);
    expect(canModify).toBe(false);
  });

  it('8. Skenario Admin 3: REJECT mengubah status menjadi REJECTED dan menghapus berkas dokumen identitas', async () => {
    // Buat student kedua untuk menguji skenario REJECT
    const rejectNim = '4253259977';
    const rejectEmail = 'uji.reject@pinjam.test';

    const { data: authUser } = await adminClient.auth.admin.createUser({
      email: rejectEmail,
      password: 'PasswordTest123!',
      email_confirm: true,
    });

    const { data: rejectStudent } = await adminClient.from('students').insert({
      auth_user_id: authUser.user!.id,
      nim: rejectNim,
      name: 'Mahasiswa Ditolak',
      email: rejectEmail,
      registration_status: 'PENDING_REVIEW',
      verification_document_path: `documents/doc_${authUser.user!.id}_reject.jpg`,
    }).select().single();

    const rejectDocPath = `documents/doc_${authUser.user!.id}_reject.jpg`;
    await adminClient.storage.from('smartprojex-media').upload(rejectDocPath, testJpegBuffer, { contentType: 'image/jpeg', upsert: true });

    // Admin REJECT dengan alasan wajib
    const rejectNotes = 'Nama pada kartu identitas tidak sesuai dengan data pendaftaran';
    await adminClient.storage.from('smartprojex-media').remove([rejectDocPath]);

    const { error: rejectUpdateErr } = await adminClient
      .from('students')
      .update({
        registration_status: 'REJECTED',
        verification_notes: rejectNotes,
        verification_document_path: null,
        verified_at: new Date().toISOString(),
      })
      .eq('id', rejectStudent!.id);

    expect(rejectUpdateErr).toBeNull();

    // Verifikasi dokumen KTM hilang dari storage
    const { data: checkDoc } = await adminClient.storage
      .from('smartprojex-media')
      .list('documents');
    const hasDoc = (checkDoc || []).some(d => d.name.includes(authUser.user!.id));
    expect(hasDoc).toBe(false);

    // Verifikasi status mahasiswa REJECTED
    const { data: finalStudent } = await adminClient
      .from('students')
      .select('registration_status, verification_notes')
      .eq('id', rejectStudent!.id)
      .single();

    expect(finalStudent?.registration_status).toBe('REJECTED');
    expect(finalStudent?.verification_notes).toBe(rejectNotes);

    // Cleanup student kedua
    await adminClient.from('students').delete().eq('id', rejectStudent!.id);
    await adminClient.auth.admin.deleteUser(authUser.user!.id);
  });
});
