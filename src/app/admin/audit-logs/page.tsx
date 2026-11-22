import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUserContext } from '@/lib/auth/guards';
import AuditLogsView from '@/components/admin/AuditLogsView';

export const metadata = {
  title: 'Jejak Audit Sistem - PINJAM Admin',
  description: 'Catatan jejak audit append-only seluruh tindakan keamanan dan transaksi PINJAM.',
};

export default async function AdminAuditLogsPage() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect('/login?returnUrl=/admin/audit-logs');
    return null;
  }

  // Hanya peran ADMIN aktif yang berwenang meninjau jejak audit (FR-19 / NFR-03)
  if (context.role !== 'ADMIN' || !context.staffProfile?.isActive) {
    redirect('/admin');
    return null;
  }

  return <AuditLogsView />;
}
