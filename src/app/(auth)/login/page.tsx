import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUserContext } from '@/lib/auth/guards';
import { getRoleSafeRedirectDestination, type AuthUserRole } from '@/lib/auth/redirect';
import LoginForm from '@/components/auth/LoginForm';

interface LoginPageProps {
  searchParams: Promise<{ returnUrl?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  let destination: string | null = null;

  try {
    const context = await getCurrentUserContext();
    if (context) {
      let effectiveRole: AuthUserRole = context.role;
      if (!context.staffProfile && !context.studentProfile) {
        effectiveRole = 'ORPHAN';
      }
      destination = getRoleSafeRedirectDestination(
        resolvedSearchParams.returnUrl,
        effectiveRole
      );
    }
  } catch {
    destination = null;
  }

  if (destination) {
    redirect(destination);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-slate-50">
      <Suspense fallback={<div className="p-8 text-sm text-slate-500">Memuat formulir...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
