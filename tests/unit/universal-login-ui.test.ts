import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LoginForm from '@/components/auth/LoginForm';

// Mock next/navigation
let mockSearchParams = new Map<string, string>();

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) ?? null,
  }),
}));

describe('Universal Login UI (src/components/auth/LoginForm.tsx)', () => {
  beforeEach(() => {
    mockSearchParams.clear();
    vi.restoreAllMocks();
  });

  describe('1. Universal Elements & Structure (SSR & Initial Render)', () => {
    it('renders the universal title "Masuk ke Akun"', () => {
      const html = renderToStaticMarkup(React.createElement(LoginForm));
      expect(html).toContain('Masuk ke Akun');
      expect(html).toContain('<h1 class="mt-3 text-2xl font-bold tracking-tight text-slate-900">Masuk ke Akun</h1>');
    });

    it('renders the universal description without role bias', () => {
      const html = renderToStaticMarkup(React.createElement(LoginForm));
      expect(html).toContain('Masuk dengan akun terdaftar untuk mahasiswa, petugas, atau administrator.');
    });

    it('does NOT contain role selectors, role tabs, or role dropdowns', () => {
      const html = renderToStaticMarkup(React.createElement(LoginForm));
      // No select element
      expect(html).not.toContain('<select');
      // No role dropdown or tab options
      expect(html).not.toContain('role="tab"');
      expect(html).not.toContain('Sebagai Mahasiswa');
      expect(html).not.toContain('Sebagai Petugas');
      expect(html).not.toContain('Sebagai Admin');
      expect(html).not.toContain('Pilih Peran');
      expect(html).not.toContain('Pilih Role');
    });

    it('renders PINJAM system badge', () => {
      const html = renderToStaticMarkup(React.createElement(LoginForm));
      expect(html).toContain('PINJAM');
    });

    it('applies responsive card styling (p-6 sm:p-8)', () => {
      const html = renderToStaticMarkup(React.createElement(LoginForm));
      expect(html).toContain('p-6 sm:p-8');
      expect(html).toContain('max-w-md');
    });

    it('renders navigation link to /register and removes legacy home backlink', () => {
      const html = renderToStaticMarkup(React.createElement(LoginForm));
      expect(html).toContain('href="/register"');
      expect(html).toContain('Daftar akun di sini');
      // Legacy "← Kembali ke Beranda" link is removed because / is now the login page
      expect(html).not.toContain('← Kembali ke Beranda');
    });

    it('renders LoginForm in container with proper styling', () => {
      const html = renderToStaticMarkup(React.createElement(LoginForm));
      expect(html).toContain('Masuk ke Akun');
      expect(html).toContain('rounded-2xl');
      expect(html).toContain('bg-white');
    });
  });

  describe('2. Accessibility & Form Labels', () => {
    it('properly links Alamat Email label to input via htmlFor="email" and id="email"', () => {
      const html = renderToStaticMarkup(React.createElement(LoginForm));
      expect(html).toContain('for="email"');
      expect(html).toContain('Alamat Email');
      expect(html).toContain('id="email"');
      expect(html).toContain('name="email"');
      expect(html).toContain('type="email"');
    });

    it('renders the responsive placeholder for email input', () => {
      const html = renderToStaticMarkup(React.createElement(LoginForm));
      expect(html).toContain('placeholder="nama@unimed.ac.id atau email terdaftar"');
    });

    it('properly links Kata Sandi label to input via htmlFor="password" and id="password"', () => {
      const html = renderToStaticMarkup(React.createElement(LoginForm));
      expect(html).toContain('for="password"');
      expect(html).toContain('Kata Sandi');
      expect(html).toContain('id="password"');
      expect(html).toContain('name="password"');
    });

    it('renders submit button with initial label "Masuk Akun"', () => {
      const html = renderToStaticMarkup(React.createElement(LoginForm));
      expect(html).toContain('type="submit"');
      expect(html).toContain('Masuk Akun');
    });
  });

  describe('3. Error Banner Accessibility', () => {
    it('renders error banner with role="alert" and aria-live="assertive" when error is present', () => {
      mockSearchParams.set('error', 'Sesi Anda telah kedaluwarsa. Silakan masuk kembali.');
      const html = renderToStaticMarkup(React.createElement(LoginForm));

      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain('Sesi Anda telah kedaluwarsa. Silakan masuk kembali.');
    });

    it('does NOT render error banner when there is no error', () => {
      const html = renderToStaticMarkup(React.createElement(LoginForm));
      expect(html).not.toContain('role="alert"');
    });
  });
});

describe('Universal Login Client Logic & Hooks (Interactions)', () => {
  // Setup React internals hook harness for Node environment testing of interactions
  const clientInternals = (
    React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
        H: unknown;
      };
    }
  ).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

  interface HarnessState {
    email: string;
    password: string;
    loading: boolean;
    isRedirecting: boolean;
    error: string | null;
    isSubmittingRef: { current: boolean };
  }

  function setupHarness(initialSearchParams = new Map<string, string>()) {
    mockSearchParams = initialSearchParams;

    const stateValues: HarnessState = {
      email: '',
      password: '',
      loading: false,
      isRedirecting: false,
      error: initialSearchParams.get('error') ?? null,
      isSubmittingRef: { current: false },
    };

    let stateIndex = 0;
    const stateList: Array<{
      get: () => unknown;
      set: (val: unknown) => void;
    }> = [
      { get: () => stateValues.email, set: (v) => { stateValues.email = v as string; } },
      { get: () => stateValues.password, set: (v) => { stateValues.password = v as string; } },
      { get: () => stateValues.loading, set: (v) => { stateValues.loading = v as boolean; } },
      { get: () => stateValues.isRedirecting, set: (v) => { stateValues.isRedirecting = v as boolean; } },
      { get: () => stateValues.error, set: (v) => { stateValues.error = v as string | null; } },
    ];

    if (clientInternals) {
      clientInternals.H = {
        useState: (initial: unknown) => {
          const idx = stateIndex++;
          const item = stateList[idx];
          if (!item) {
            let localVal = typeof initial === 'function' ? (initial as () => unknown)() : initial;
            return [localVal, (updater: unknown) => {
              localVal = typeof updater === 'function' ? (updater as (p: unknown) => unknown)(localVal) : updater;
            }];
          }
          return [
            item.get(),
            (updater: unknown) => {
              const current = item.get();
              const next = typeof updater === 'function' ? (updater as (p: unknown) => unknown)(current) : updater;
              item.set(next);
            },
          ];
        },
        useRef: (initial: unknown) => {
          return stateValues.isSubmittingRef;
        },
        useId: () => 'login-test-id',
      };
    }

    const replaceSpy = vi.fn();
    const originalWindow = global.window;
    // Mock window.location
    (global as unknown as { window: unknown }).window = {
      location: {
        origin: 'http://localhost:3000',
        replace: replaceSpy,
      },
    };

    const render = () => {
      stateIndex = 0;
      return (LoginForm as unknown as () => React.ReactElement<{ children: React.ReactNode[] }>)();
    };

    const cleanup = () => {
      (global as unknown as { window: unknown }).window = originalWindow;
    };

    return {
      stateValues,
      render,
      replaceSpy,
      cleanup,
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits returnUrl in body payload when returnUrl is in searchParams', async () => {
    const params = new Map<string, string>();
    params.set('returnUrl', '/admin/projectors');
    const harness = setupHarness(params);

    harness.stateValues.email = 'staff@unimed.ac.id';
    harness.stateValues.password = 'StaffPass123!';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ redirectTo: '/kiosk' }),
    });
    global.fetch = fetchMock;

    const vdom = harness.render();
    const children = React.Children.toArray(vdom.props.children);
    const formElement = children.find(
      (c) => React.isValidElement(c) && c.type === 'form'
    ) as React.ReactElement<{ onSubmit: (e: React.FormEvent) => Promise<void> }>;

    expect(formElement).toBeDefined();

    const mockPreventDefault = vi.fn();
    await formElement.props.onSubmit({ preventDefault: mockPreventDefault } as unknown as React.FormEvent);

    expect(mockPreventDefault).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'staff@unimed.ac.id',
        password: 'StaffPass123!',
        returnUrl: '/admin/projectors',
      }),
    });

    // Validates that it redirected to the server's redirectTo (/kiosk)
    expect(harness.replaceSpy).toHaveBeenCalledWith('/kiosk');
    harness.cleanup();
  });

  it('sends undefined for returnUrl when no returnUrl query param exists', async () => {
    const harness = setupHarness(new Map());
    harness.stateValues.email = 'student@unimed.ac.id';
    harness.stateValues.password = 'StudentPass123!';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ redirectTo: '/my-qr' }),
    });
    global.fetch = fetchMock;

    const vdom = harness.render();
    const children = React.Children.toArray(vdom.props.children);
    const formElement = children.find(
      (c) => React.isValidElement(c) && c.type === 'form'
    ) as React.ReactElement<{ onSubmit: (e: React.FormEvent) => Promise<void> }>;

    await formElement.props.onSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'student@unimed.ac.id',
        password: 'StudentPass123!',
      }),
    });

    expect(harness.replaceSpy).toHaveBeenCalledWith('/my-qr');
    harness.cleanup();
  });

  it('trusts server redirectTo and does not override it on client side', async () => {
    // When a student requests returnUrl="/admin" (unauthorized), Phase 1 server resolves to "/my-qr".
    // The client UI must strictly navigate to data.redirectTo ("/my-qr") without overriding to "/admin".
    const params = new Map<string, string>();
    params.set('returnUrl', '/admin');
    const harness = setupHarness(params);

    harness.stateValues.email = 'student@unimed.ac.id';
    harness.stateValues.password = 'StudentPass123!';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ redirectTo: '/my-qr' }),
    });
    global.fetch = fetchMock;

    const vdom = harness.render();
    const children = React.Children.toArray(vdom.props.children);
    const formElement = children.find(
      (c) => React.isValidElement(c) && c.type === 'form'
    ) as React.ReactElement<{ onSubmit: (e: React.FormEvent) => Promise<void> }>;

    await formElement.props.onSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);

    expect(harness.replaceSpy).toHaveBeenCalledWith('/my-qr');
    expect(harness.replaceSpy).not.toHaveBeenCalledWith('/admin');
    harness.cleanup();
  });

  it('synchronous guard isSubmittingRef prevents duplicate submission while request is pending', async () => {
    const harness = setupHarness(new Map());
    harness.stateValues.email = 'admin@unimed.ac.id';
    harness.stateValues.password = 'AdminPass123!';

    let resolveFetch: (value: unknown) => void;
    const slowFetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    const fetchMock = vi.fn().mockImplementation(() => slowFetchPromise);
    global.fetch = fetchMock;

    const vdom = harness.render();
    const children = React.Children.toArray(vdom.props.children);
    const formElement = children.find(
      (c) => React.isValidElement(c) && c.type === 'form'
    ) as React.ReactElement<{ onSubmit: (e: React.FormEvent) => Promise<void> }>;

    // Trigger first submission (in flight)
    const firstSubmit = formElement.props.onSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);

    expect(harness.stateValues.isSubmittingRef.current).toBe(true);

    // Trigger second submission concurrently while first is in flight
    const secondSubmit = formElement.props.onSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);

    // Only one fetch call must have been made
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Resolve fetch
    resolveFetch!({
      ok: true,
      json: async () => ({ redirectTo: '/admin' }),
    });

    await Promise.all([firstSubmit, secondSubmit]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(harness.replaceSpy).toHaveBeenCalledWith('/admin');
    harness.cleanup();
  });

  it('displays specific error message for ACCOUNT_DISABLED error code', async () => {
    const harness = setupHarness(new Map());
    harness.stateValues.email = 'disabled.staff@unimed.ac.id';
    harness.stateValues.password = 'StaffPass123!';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'Akun petugas Anda telah dinonaktifkan oleh administrator. Silakan hubungi administrator.',
        },
      }),
    });
    global.fetch = fetchMock;

    const vdom = harness.render();
    const children = React.Children.toArray(vdom.props.children);
    const formElement = children.find(
      (c) => React.isValidElement(c) && c.type === 'form'
    ) as React.ReactElement<{ onSubmit: (e: React.FormEvent) => Promise<void> }>;

    await formElement.props.onSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);

    expect(harness.stateValues.error).toBe(
      'Akun petugas Anda telah dinonaktifkan oleh administrator. Silakan hubungi administrator.'
    );
    expect(harness.stateValues.loading).toBe(false);
    expect(harness.stateValues.isSubmittingRef.current).toBe(false);
    expect(harness.replaceSpy).not.toHaveBeenCalled();
    harness.cleanup();
  });

  it('displays generic backend error message on 401 invalid credentials', async () => {
    const harness = setupHarness(new Map());
    harness.stateValues.email = 'user@unimed.ac.id';
    harness.stateValues.password = 'WrongPassword';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email atau kata sandi salah.',
        },
      }),
    });
    global.fetch = fetchMock;

    const vdom = harness.render();
    const children = React.Children.toArray(vdom.props.children);
    const formElement = children.find(
      (c) => React.isValidElement(c) && c.type === 'form'
    ) as React.ReactElement<{ onSubmit: (e: React.FormEvent) => Promise<void> }>;

    await formElement.props.onSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);

    expect(harness.stateValues.error).toBe('Email atau kata sandi salah.');
    expect(harness.stateValues.loading).toBe(false);
    expect(harness.stateValues.isSubmittingRef.current).toBe(false);
    harness.cleanup();
  });

  it('handles network error and displays network failure message', async () => {
    const harness = setupHarness(new Map());
    harness.stateValues.email = 'user@unimed.ac.id';
    harness.stateValues.password = 'Secret123!';

    const fetchMock = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    global.fetch = fetchMock;

    const vdom = harness.render();
    const children = React.Children.toArray(vdom.props.children);
    const formElement = children.find(
      (c) => React.isValidElement(c) && c.type === 'form'
    ) as React.ReactElement<{ onSubmit: (e: React.FormEvent) => Promise<void> }>;

    await formElement.props.onSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);

    expect(harness.stateValues.error).toBe('Terjadi gangguan jaringan saat menghubungi server.');
    expect(harness.stateValues.loading).toBe(false);
    expect(harness.stateValues.isSubmittingRef.current).toBe(false);
    expect(harness.replaceSpy).not.toHaveBeenCalled();
    harness.cleanup();
  });

  it('rejects invalid or unsafe redirectTo received from server response', async () => {
    const harness = setupHarness(new Map());
    harness.stateValues.email = 'user@unimed.ac.id';
    harness.stateValues.password = 'Secret123!';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ redirectTo: 'https://evil.attacker.com/malicious' }),
    });
    global.fetch = fetchMock;

    const vdom = harness.render();
    const children = React.Children.toArray(vdom.props.children);
    const formElement = children.find(
      (c) => React.isValidElement(c) && c.type === 'form'
    ) as React.ReactElement<{ onSubmit: (e: React.FormEvent) => Promise<void> }>;

    await formElement.props.onSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);

    expect(harness.stateValues.error).toBe('Tujuan pengalihan tidak valid dari server.');
    expect(harness.stateValues.loading).toBe(false);
    expect(harness.stateValues.isSubmittingRef.current).toBe(false);
    expect(harness.replaceSpy).not.toHaveBeenCalled();
    harness.cleanup();
  });
});
