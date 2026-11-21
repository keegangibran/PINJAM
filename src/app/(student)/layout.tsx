import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUserContext } from '@/lib/auth/guards';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  let context;
  try {
    context = await getCurrentUserContext();
  } catch {
    context = null;
  }

  // Jika akun petugas/admin mencoba membuka area mahasiswa, arahkan ke portal yang sesuai
  if (context && (context.role === 'ADMIN' || context.role === 'STAFF')) {
    redirect(context.role === 'ADMIN' ? '/admin' : '/kiosk');
  }

  return <>{children}</>;
}
