import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUserContext } from '@/lib/auth/guards';
import StaffManagementView from '@/components/admin/StaffManagementView';

export const metadata = {
  title: 'Manajemen Staf & Petugas TU - PINJAM Admin',
  description: 'Kelola akun staf TU dan Administrator sistem peminjaman proyektor.',
};

export default async function AdminStaffPage() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect('/login?returnUrl=/admin/staff');
    return null;
  }

  // Hanya peran ADMIN aktif yang berwenang mengelola akun petugas
  if (context.role !== 'ADMIN' || !context.staffProfile?.isActive) {
    redirect('/admin');
    return null;
  }

  return <StaffManagementView currentStaffId={context.staffProfile.id} />;
}
