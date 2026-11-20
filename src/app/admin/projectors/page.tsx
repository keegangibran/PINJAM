'use client';

import React, { Suspense } from 'react';
import {
  AdminProjectorsContent,
  AdminProjectorsSkeleton,
} from '@/components/admin/ProjectorsInventoryView';

export default function AdminProjectorsPage() {
  return (
    <Suspense fallback={<AdminProjectorsSkeleton />}>
      <AdminProjectorsContent />
    </Suspense>
  );
}
