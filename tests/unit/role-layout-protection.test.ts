import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

vi.mock('server-only', () => ({}));

import * as guards from '@/lib/auth/guards';
import AdminLayout from '@/app/admin/layout';
import AdminClassesLayout from '@/app/admin/classes/layout';
import KioskLayout from '@/app/kiosk/layout';
import StudentLayout from '@/app/(student)/layout';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

describe('Server-Side Route Layout Protection & Role Authorization Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AdminLayout (src/app/admin/layout.tsx)', () => {
    it('redirects unauthenticated users to /login?returnUrl=/admin', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce(null);

      await expect(
        AdminLayout({ children: React.createElement('div', null, 'Admin Content') })
      ).rejects.toThrow('NEXT_REDIRECT:/login?returnUrl=/admin');

      expect(mockRedirect).toHaveBeenCalledWith('/login?returnUrl=/admin');
    });

    it('redirects students trying to access /admin to /my-qr', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-student',
        email: 'mhs@kampus.ac.id',
        role: 'STUDENT',
        studentProfile: {
          id: 'stu-1',
          nim: '12345678',
          name: 'Student Name',
          registrationStatus: 'ACTIVE',
          currentClassId: 'cls-1',
        },
      });

      await expect(
        AdminLayout({ children: React.createElement('div', null, 'Admin Content') })
      ).rejects.toThrow('NEXT_REDIRECT:/my-qr');

      expect(mockRedirect).toHaveBeenCalledWith('/my-qr');
    });

    it('redirects inactive staff to /login?error=ACCOUNT_DISABLED', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-staff',
        email: 'staff@kampus.ac.id',
        role: 'STAFF',
        staffProfile: {
          id: 'stf-1',
          name: 'Staff Budi',
          role: 'STAFF',
          isActive: false, // Inactive!
        },
      });

      await expect(
        AdminLayout({ children: React.createElement('div', null, 'Admin Content') })
      ).rejects.toThrow('NEXT_REDIRECT:/login?error=ACCOUNT_DISABLED');

      expect(mockRedirect).toHaveBeenCalledWith('/login?error=ACCOUNT_DISABLED');
    });

    it('allows active admin and renders children', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-admin',
        email: 'admin@kampus.ac.id',
        role: 'ADMIN',
        staffProfile: {
          id: 'adm-1',
          name: 'Admin Utama',
          role: 'ADMIN',
          isActive: true,
        },
      });

      const element = await AdminLayout({
        children: React.createElement('div', { id: 'admin-child' }, 'Admin Protected'),
      });

      expect(element).not.toBeNull();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe('KioskLayout (src/app/kiosk/layout.tsx)', () => {
    it('redirects unauthenticated users to /login?returnUrl=/kiosk', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce(null);

      await expect(
        KioskLayout({ children: React.createElement('div', null, 'Kiosk Content') })
      ).rejects.toThrow('NEXT_REDIRECT:/login?returnUrl=/kiosk');

      expect(mockRedirect).toHaveBeenCalledWith('/login?returnUrl=/kiosk');
    });

    it('redirects student users attempting to access /kiosk to /my-qr', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-student',
        email: 'mhs@kampus.ac.id',
        role: 'STUDENT',
        studentProfile: {
          id: 'stu-1',
          nim: '12345678',
          name: 'Student Name',
          registrationStatus: 'ACTIVE',
          currentClassId: 'cls-1',
        },
      });

      await expect(
        KioskLayout({ children: React.createElement('div', null, 'Kiosk Content') })
      ).rejects.toThrow('NEXT_REDIRECT:/my-qr');

      expect(mockRedirect).toHaveBeenCalledWith('/my-qr');
    });

    it('allows active staff to operate Kiosk', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-staff',
        email: 'petugas@kampus.ac.id',
        role: 'STAFF',
        staffProfile: {
          id: 'stf-1',
          name: 'Petugas TU',
          role: 'STAFF',
          isActive: true,
        },
      });

      const element = await KioskLayout({
        children: React.createElement('div', { id: 'kiosk-child' }, 'Kiosk Standby'),
      });

      expect(element).not.toBeNull();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe('StudentLayout (src/app/(student)/layout.tsx)', () => {
    it('redirects admin trying to open student pages to /admin', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-admin',
        email: 'admin@kampus.ac.id',
        role: 'ADMIN',
        staffProfile: {
          id: 'adm-1',
          name: 'Admin Utama',
          role: 'ADMIN',
          isActive: true,
        },
      });

      await expect(
        StudentLayout({ children: React.createElement('div', null, 'Student Area') })
      ).rejects.toThrow('NEXT_REDIRECT:/admin');

      expect(mockRedirect).toHaveBeenCalledWith('/admin');
    });

    it('redirects staff trying to open student pages to /kiosk', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-staff',
        email: 'staff@kampus.ac.id',
        role: 'STAFF',
        staffProfile: {
          id: 'stf-1',
          name: 'Petugas Budi',
          role: 'STAFF',
          isActive: true,
        },
      });

      await expect(
        StudentLayout({ children: React.createElement('div', null, 'Student Area') })
      ).rejects.toThrow('NEXT_REDIRECT:/kiosk');

      expect(mockRedirect).toHaveBeenCalledWith('/kiosk');
    });

    it('allows student to view student area', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-student',
        email: 'mhs@kampus.ac.id',
        role: 'STUDENT',
        studentProfile: {
          id: 'stu-1',
          nim: '12345678',
          name: 'Student Name',
          registrationStatus: 'ACTIVE',
          currentClassId: 'cls-1',
        },
      });

      const element = await StudentLayout({
        children: React.createElement('div', { id: 'student-child' }, 'My QR'),
      });

      expect(element).not.toBeNull();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe('AdminClassesLayout (src/app/admin/classes/layout.tsx)', () => {
    it('redirects unauthenticated users to /login?returnUrl=/admin/classes', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce(null);

      await expect(
        AdminClassesLayout({ children: React.createElement('div', null, 'Classes Content') })
      ).rejects.toThrow('NEXT_REDIRECT:/login?returnUrl=/admin/classes');

      expect(mockRedirect).toHaveBeenCalledWith('/login?returnUrl=/admin/classes');
    });

    it('redirects STAFF users to /admin?error=FORBIDDEN_ADMIN_ONLY (PRD 3.3)', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-staff',
        email: 'staff@kampus.ac.id',
        role: 'STAFF',
        staffProfile: {
          id: 'stf-1',
          name: 'Petugas Budi',
          role: 'STAFF',
          isActive: true,
        },
      });

      await expect(
        AdminClassesLayout({ children: React.createElement('div', null, 'Classes Content') })
      ).rejects.toThrow('NEXT_REDIRECT:/admin?error=FORBIDDEN_ADMIN_ONLY');

      expect(mockRedirect).toHaveBeenCalledWith('/admin?error=FORBIDDEN_ADMIN_ONLY');
    });

    it('allows ADMIN users to view classes management', async () => {
      vi.spyOn(guards, 'getCurrentUserContext').mockResolvedValueOnce({
        userId: 'usr-admin',
        email: 'admin@kampus.ac.id',
        role: 'ADMIN',
        staffProfile: {
          id: 'adm-1',
          name: 'Admin Utama',
          role: 'ADMIN',
          isActive: true,
        },
      });

      const element = await AdminClassesLayout({
        children: React.createElement('div', { id: 'classes-child' }, 'Manage Classes'),
      });

      expect(element).not.toBeNull();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });
});
