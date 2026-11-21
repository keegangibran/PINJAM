import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUserContext } from '@/lib/auth/guards';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let context;
  try {
    context = await getCurrentUserContext();
  } catch {
    redirect('/login?returnUrl=/admin');
  }

  if (!context) {
    redirect('/login?returnUrl=/admin');
  }

  // 1. Mahasiswa dilarang keras mengakses area administratif
  if (context.role !== 'ADMIN' && context.role !== 'STAFF') {
    redirect('/my-qr');
  }

  // 2. Akun staf nonaktif dilarang mengakses
  if (!context.staffProfile || !context.staffProfile.isActive) {
    redirect('/login?error=ACCOUNT_DISABLED');
  }

  return <>{children}</>;
}
