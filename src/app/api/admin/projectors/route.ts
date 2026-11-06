import { NextRequest, NextResponse } from 'next/server';
import { requireStaff, requireAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { z } from 'zod';

const createProjectorSchema = z.object({
  code: z
    .string()
    .min(2, 'Kode proyektor minimal 2 karakter')
    .max(30, 'Kode proyektor maksimal 30 karakter')
    .transform((val) => val.trim().toUpperCase()),
  name: z
    .string()
    .min(2, 'Nama proyektor minimal 2 karakter')
    .max(100, 'Nama proyektor maksimal 100 karakter')
    .transform((val) => val.trim()),
  notes: z.string().optional().nullable(),
});

export async function GET() {
  try {
    await requireStaff();
    const adminClient = createAdminClient();

    const { data: rawProjectors, error } = await adminClient
      .from('projectors')
      .select(`
        id,
        code,
        name,
        status,
        notes,
        created_at,
        updated_at,
        loans (
          id,
          borrowed_at,
          due_at,
          status,
          student:students (
            id,
            name,
            nim
          )
        )
      `)
      .order('code', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: { code: 'FETCH_PROJECTORS_FAILED', message: error.message } },
        { status: 500 }
      );
    }

    type RawProj = (typeof rawProjectors)[number];
    type LoanItem = { id: string; status: string; borrowed_at: string; due_at: string; student: unknown };

    const projectors = (rawProjectors || []).map((proj: RawProj) => {
      const activeLoan = (proj.loans as unknown as LoanItem[] | null)?.find(
        (l: LoanItem) => l.status === 'ACTIVE'
      );
      return {
        id: proj.id,
        code: proj.code,
        name: proj.name,
        status: proj.status,
        notes: proj.notes,
        created_at: proj.created_at,
        updated_at: proj.updated_at,
        active_loan: activeLoan
          ? {
              id: activeLoan.id,
              borrowed_at: activeLoan.borrowed_at,
              due_at: activeLoan.due_at,
              student: activeLoan.student,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      projectors,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED_OR_ERROR', message } },
      { status: statusCode }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await requireAdmin();
    const body = await request.json();
    const parseResult = createProjectorSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parseResult.error.issues[0]?.message || 'Input tidak valid',
          },
        },
        { status: 400 }
      );
    }

    const { code, name, notes } = parseResult.data;
    const adminClient = createAdminClient();

    // Periksa keunikan kode proyektor
    const { data: existing } = await adminClient
      .from('projectors')
      .select('id')
      .eq('code', code)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          error: {
            code: 'PROJECTOR_CODE_EXISTS',
            message: `Proyektor dengan kode "${code}" sudah terdaftar.`,
          },
        },
        { status: 409 }
      );
    }

    // Simpan unit proyektor baru
    const { data: newProjector, error: insertError } = await adminClient
      .from('projectors')
      .insert({
        code,
        name,
        notes: notes || null,
        status: 'AVAILABLE',
      })
      .select()
      .single();

    if (insertError || !newProjector) {
      return NextResponse.json(
        {
          error: {
            code: 'CREATE_PROJECTOR_FAILED',
            message: insertError?.message || 'Gagal menambahkan unit proyektor.',
          },
        },
        { status: 500 }
      );
    }

    // Catat log status awal
    await adminClient.from('projector_status_logs').insert({
      projector_id: newProjector.id,
      from_status: 'AVAILABLE',
      to_status: 'AVAILABLE',
      reason: 'Aset proyektor baru didaftarkan',
      changed_by: authContext.staffProfile?.id || null,
    });

    // Catat audit log
    await recordAuditLog(adminClient, {
      action: 'PROJECTOR_ASSET_MODIFIED',
      entityType: 'projectors',
      entityId: newProjector.id,
      actorStaffId: authContext.staffProfile?.id || null,
      metadata: {
        code,
        name,
        action_type: 'CREATE',
      },
    });

    return NextResponse.json(
      {
        success: true,
        projector: newProjector,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED_OR_ERROR', message } },
      { status: statusCode }
    );
  }
}
