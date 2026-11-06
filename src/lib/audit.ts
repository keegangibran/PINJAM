import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Daftar tindakan audit sistem yang diwajibkan oleh PRD Revisi 3 (FR-19).
 */
export type AuditAction =
  | 'VERIFICATION_DECIDED'
  | 'LEADER_CLAIM_DECIDED'
  | 'LEADER_TRANSFERRED'
  | 'LEADER_REVOKED'
  | 'QR_REVOKED'
  | 'PHOTO_SIGNED_URL'
  | 'MANUAL_LOOKUP'
  | 'LOAN_BORROWED'
  | 'LOAN_RETURNED'
  | 'LOAN_RETURNED_WITH_ISSUE'
  | 'PROJECTOR_STATUS_CHANGED'
  | 'PROJECTOR_ASSET_MODIFIED'
  | 'SETTINGS_UPDATED';

export interface AuditLogParams {
  action: AuditAction;
  entityType: 'students' | 'classes' | 'projectors' | 'loans' | 'class_leader_claims' | 'storage' | 'app_settings';
  entityId?: string | null;
  actorStaffId?: string | null;
  actorStudentId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SanitizedAuditEntry {
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  actor_staff_id: string | null;
  actor_student_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Daftar kunci data sensitif dan PII yang DILARANG KERAS dicatat ke dalam audit_logs.
 */
const SENSITIVE_METADATA_KEYS = new Set([
  'password',
  'token',
  'qr_token',
  'student_token',
  'jwt',
  'secret',
  'nik',
  'nim',
  'authorization',
  'cookie',
  'base64',
  'photo_base64',
  'face_photo_base64',
  'document_photo_base64',
]);

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    SENSITIVE_METADATA_KEYS.has(lower) ||
    lower.includes('secret') ||
    lower.includes('password') ||
    lower.includes('token') ||
    lower.includes('base64') ||
    lower.includes('cookie') ||
    lower.includes('nim') ||
    lower.includes('nik')
  );
}

/**
 * Membersihkan metadata audit secara rekursif dari informasi sensitif, token, dan data gambar base64.
 */
export function sanitizeAuditMetadata(
  data?: Record<string, unknown>
): Record<string, unknown> {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    // Hapus field sensitif
    if (isSensitiveKey(key)) {
      continue;
    }

    // Jika string menyerupai format data base64 atau token JWS, abaikan
    if (typeof value === 'string') {
      if (value.startsWith('data:image/') || value.length > 500) {
        continue;
      }
      sanitized[key] = value;
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Mempersiapkan entri audit log terstruktur yang siap disimpan ke tabel audit_logs.
 */
export function prepareAuditEntry(params: AuditLogParams): SanitizedAuditEntry {
  return {
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    actor_staff_id: params.actorStaffId ?? null,
    actor_student_id: params.actorStudentId ?? null,
    metadata: sanitizeAuditMetadata(params.metadata),
    created_at: new Date().toISOString(),
  };
}

/**
 * Menyimpan rekaman audit log ke tabel audit_logs melalui Supabase Client.
 * Melempar error jika penulisan audit gagal untuk aksi keamanan kritis (fail-secure).
 */
export async function recordAuditLog(
  supabase: SupabaseClient,
  params: AuditLogParams
): Promise<{ success: boolean; id?: string; error?: string }> {
  const entry = prepareAuditEntry(params);

  const { data, error } = await supabase
    .from('audit_logs')
    .insert(entry)
    .select('id')
    .single();

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: true,
    id: data?.id,
  };
}
