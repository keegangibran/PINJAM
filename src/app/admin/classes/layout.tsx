import 'server-only';
import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUserContext } from '@/lib/auth/guards';

export default async function AdminClassesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    redirect('/login?returnUrl=/admin/classes');
  }

  // PRD 3.3: Hanya Administrator yang berhak mengelola kelas & rombel
  if (userContext.role !== 'ADMIN') {
    redirect('/admin?error=FORBIDDEN_ADMIN_ONLY');
  }

  return <>{children}</>;
}
