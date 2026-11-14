import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getSafeNextPath } from '@/lib/auth/redirect';

// Mock server-only before any imports that might pull it in
vi.mock('server-only', () => ({}));

// Mock Supabase clients for route integration tests
const mockExchangeCodeForSession = vi.fn();
const mockAdminSelect = vi.fn();
const mockAdminUpdate = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'students') {
        return {
          select: mockAdminSelect,
          update: mockAdminUpdate,
        };
      }
      return { select: vi.fn(), update: vi.fn() };
    }),
  })),
}));

import { GET as handleAuthCallback } from '@/app/auth/callback/route';

describe('Auth Callback Open Redirect Prevention & Path Sanitization', () => {
  const baseRequestUrl = new URL('https://pinjam.vercel.app/auth/callback');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Unit Tests — getSafeNextPath Helper', () => {
    it('returns /login when rawNext is null or undefined', () => {
      expect(getSafeNextPath(null, baseRequestUrl)).toBe('/login');
      expect(getSafeNextPath(undefined, baseRequestUrl)).toBe('/login');
    });

    it('returns /login when rawNext is empty string or non-string', () => {
      expect(getSafeNextPath('', baseRequestUrl)).toBe('/login');
    });

    it('accepts valid internal relative path /dashboard', () => {
      expect(getSafeNextPath('/dashboard', baseRequestUrl)).toBe('/dashboard');
    });

    it('accepts valid internal path with query parameters /login?verified=true', () => {
      expect(getSafeNextPath('/login?verified=true', baseRequestUrl)).toBe('/login?verified=true');
    });

    it('accepts valid internal multi-segment path /admin/projectors', () => {
      expect(getSafeNextPath('/admin/projectors', baseRequestUrl)).toBe('/admin/projectors');
    });

    it('preserves query parameters and hash anchors on valid internal paths', () => {
      const complexPath = '/admin/loans?status=ACTIVE&term=2026-GANJIL#section-table';
      expect(getSafeNextPath(complexPath, baseRequestUrl)).toBe(complexPath);
    });

    it('rejects external absolute HTTP/HTTPS URLs (e.g. https://evil.com)', () => {
      expect(getSafeNextPath('https://evil.com', baseRequestUrl)).toBe('/login');
      expect(getSafeNextPath('http://evil.com', baseRequestUrl)).toBe('/login');
      expect(getSafeNextPath('https://evil.com/phishing', baseRequestUrl)).toBe('/login');
    });

    it('rejects protocol-relative URLs (e.g. //evil.com)', () => {
      expect(getSafeNextPath('//evil.com', baseRequestUrl)).toBe('/login');
      expect(getSafeNextPath('//evil.com/path', baseRequestUrl)).toBe('/login');
    });

    it('rejects triple-slash URLs (e.g. ///evil.com)', () => {
      expect(getSafeNextPath('///evil.com', baseRequestUrl)).toBe('/login');
    });

    it('rejects URLs containing backslashes that could trigger browser host confusion', () => {
      expect(getSafeNextPath('/\\evil.com', baseRequestUrl)).toBe('/login');
      expect(getSafeNextPath('\\/evil.com', baseRequestUrl)).toBe('/login');
      expect(getSafeNextPath('\\\\evil.com', baseRequestUrl)).toBe('/login');
      expect(getSafeNextPath('/dashboard\\evil', baseRequestUrl)).toBe('/login');
    });

    it('rejects URLs with different origins matching domain prefixes or subdomains', () => {
      expect(getSafeNextPath('https://pinjam.vercel.app.evil.com', baseRequestUrl)).toBe('/login');
      expect(getSafeNextPath('https://evil-pinjam.vercel.app', baseRequestUrl)).toBe('/login');
      expect(getSafeNextPath('https://attacker.com/auth/callback', baseRequestUrl)).toBe('/login');
    });

    it('rejects non-HTTP/HTTPS pseudo-protocols', () => {
      expect(getSafeNextPath('javascript:alert(document.cookie)', baseRequestUrl)).toBe('/login');
      expect(getSafeNextPath('data:text/html,<script>evil()</script>', baseRequestUrl)).toBe('/login');
      expect(getSafeNextPath('vbscript:msgbox(1)', baseRequestUrl)).toBe('/login');
    });
  });

  describe('2. Integration Tests — GET /auth/callback Route Handler', () => {
    it('redirects to /login when no code and no next parameter provided', async () => {
      const req = new NextRequest('https://pinjam.vercel.app/auth/callback');
      const response = await handleAuthCallback(req);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://pinjam.vercel.app/login');
    });

    it('redirects to safe internal path /dashboard when valid next is provided without code', async () => {
      const req = new NextRequest('https://pinjam.vercel.app/auth/callback?next=/dashboard');
      const response = await handleAuthCallback(req);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://pinjam.vercel.app/dashboard');
    });

    it('redirects to /login when malicious next=https://evil.com is provided', async () => {
      const req = new NextRequest('https://pinjam.vercel.app/auth/callback?next=https://evil.com');
      const response = await handleAuthCallback(req);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://pinjam.vercel.app/login');
    });

    it('redirects to /login when malicious next=//evil.com is provided', async () => {
      const req = new NextRequest('https://pinjam.vercel.app/auth/callback?next=//evil.com');
      const response = await handleAuthCallback(req);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://pinjam.vercel.app/login');
    });

    it('redirects to /login when backslash-crafted next=/\\evil.com is provided', async () => {
      const req = new NextRequest('https://pinjam.vercel.app/auth/callback?next=/\\evil.com');
      const response = await handleAuthCallback(req);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://pinjam.vercel.app/login');
    });

    it('redirects to /login with error query when exchangeCodeForSession fails', async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: new Error('Invalid or expired code'),
      });

      const req = new NextRequest('https://pinjam.vercel.app/auth/callback?code=bad-auth-code&next=/dashboard');
      const response = await handleAuthCallback(req);

      expect(response.status).toBe(307);
      const location = response.headers.get('location') || '';
      expect(location).toContain('/login?error=');
      expect(location).toContain(encodeURIComponent('Verifikasi email gagal atau tautan telah kedaluwarsa.'));
    });

    it('successfully processes valid code, synchronizes UNVERIFIED_EMAIL student, and redirects to safe next destination', async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: {
          user: { id: 'usr-student-001' },
          session: { access_token: 'valid-token' },
        },
        error: null,
      });

      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'std-uuid-001', registration_status: 'UNVERIFIED_EMAIL' },
        error: null,
      });
      const mockEqAuth = vi.fn().mockReturnValue({ single: mockSingle });
      mockAdminSelect.mockReturnValue({ eq: mockEqAuth });

      const mockEqUpdate = vi.fn().mockResolvedValue({ error: null });
      mockAdminUpdate.mockReturnValue({ eq: mockEqUpdate });

      const req = new NextRequest('https://pinjam.vercel.app/auth/callback?code=valid-code&next=/admin/projectors?tab=active');
      const response = await handleAuthCallback(req);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://pinjam.vercel.app/admin/projectors?tab=active');

      // Verifikasi sinkronisasi status mahasiswa ke PENDING_DOCUMENT
      expect(mockAdminUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          registration_status: 'PENDING_DOCUMENT',
        })
      );
      expect(mockEqUpdate).toHaveBeenCalledWith('id', 'std-uuid-001');
    });

    it('neutralizes malicious next parameter to /login even during successful code exchange', async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({
        data: {
          user: { id: 'usr-student-002' },
          session: { access_token: 'valid-token' },
        },
        error: null,
      });

      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'std-uuid-002', registration_status: 'ACTIVE' },
        error: null,
      });
      mockAdminSelect.mockReturnValue({ eq: vi.fn().mockReturnValue({ single: mockSingle }) });

      const req = new NextRequest('https://pinjam.vercel.app/auth/callback?code=valid-code&next=https://malicious-site.com');
      const response = await handleAuthCallback(req);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('https://pinjam.vercel.app/login');
    });
  });
});

