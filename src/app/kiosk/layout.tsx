import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUserContext } from '@/lib/auth/guards';

export default async function KioskLayout({ children }: { children: React.ReactNode }) {
  let context;
  try {
    context = await getCurrentUserContext();
  } catch {
    redirect('/login?returnUrl=/kiosk');
  }

  if (!context) {
    redirect('/login?returnUrl=/kiosk');
  }

  // Hanya staf TU atau Admin aktif yang diizinkan mengoperasikan Kiosk
  if (context.role !== 'ADMIN' && context.role !== 'STAFF') {
    redirect('/my-qr');
  }

  if (!context.staffProfile || !context.staffProfile.isActive) {
    redirect('/login?error=ACCOUNT_DISABLED');
  }

  return <>{children}</>;
}
