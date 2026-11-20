import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import {
  Modal,
  getFocusableElements,
  setupModalFocusTrap,
  FOCUSABLE_SELECTOR,
} from '@/components/ui/Modal';

// Mock element helper for Node.js environment
interface MockNode {
  tagName: string;
  tabIndex: number;
  attributes: Record<string, string>;
  style: { display?: string; visibility?: string };
  children: MockNode[];
  parentElement: MockNode | null;
  focusCount: number;
  hasAttribute: (name: string) => boolean;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, val: string) => void;
  removeAttribute: (name: string) => void;
  focus: () => void;
  blur: () => void;
  contains: (target: unknown) => boolean;
  querySelectorAll: <T = HTMLElement>(selector: string) => T[];
}

function createMockElement(
  tag: string,
  attrs: Record<string, string> = {},
  tabIndex = 0
): MockNode {
  const node: MockNode = {
    tagName: tag.toUpperCase(),
    tabIndex,
    attributes: { ...attrs },
    style: {},
    children: [],
    parentElement: null,
    focusCount: 0,
    hasAttribute(name: string) {
      return name in this.attributes;
    },
    getAttribute(name: string) {
      return this.attributes[name] ?? null;
    },
    setAttribute(name: string, val: string) {
      this.attributes[name] = val;
    },
    removeAttribute(name: string) {
      delete this.attributes[name];
    },
    focus() {
      this.focusCount += 1;
      if (typeof global.document !== 'undefined') {
        (global.document as unknown as { activeElement: unknown }).activeElement = this;
      }
    },
    blur() {
      if (
        typeof global.document !== 'undefined' &&
        (global.document as unknown as { activeElement: unknown }).activeElement === this
      ) {
        (global.document as unknown as { activeElement: unknown }).activeElement = null;
      }
    },
    contains(target: unknown) {
      if (target === this) return true;
      for (const child of this.children) {
        if (child.contains(target)) return true;
      }
      return false;
    },
    querySelectorAll<T = HTMLElement>(_selector: string): T[] {
      const results: MockNode[] = [];
      function traverse(parent: MockNode) {
        for (const child of parent.children) {
          results.push(child);
          traverse(child);
        }
      }
      traverse(this);
      return results as unknown as T[];
    },
  };

  return node;
}

describe('Modal Accessibility & Focus Trap Hardening (Fase 1.1)', () => {
  let listeners: Record<string, ((e: unknown) => void)[]> = {};
  let originalWindow: typeof global.window;
  let originalDocument: typeof global.document;

  beforeEach(() => {
    listeners = {};

    const mockDoc = {
      body: {
        style: {
          overflow: '',
        },
      },
      activeElement: null as unknown,
    };

    const mockWin = {
      addEventListener: vi.fn((event: string, fn: (e: unknown) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(fn);
      }),
      removeEventListener: vi.fn((event: string, fn: (e: unknown) => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((l) => l !== fn);
        }
      }),
    };

    originalWindow = global.window;
    originalDocument = global.document;

    (global as unknown as { window: unknown }).window = mockWin;
    (global as unknown as { document: unknown }).document = mockDoc;
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
    vi.restoreAllMocks();
  });

  function triggerKeyDown(key: string, shiftKey = false) {
    const event = {
      key,
      shiftKey,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };

    const keydownListeners = [...(listeners['keydown'] || [])];
    for (const fn of keydownListeners) {
      fn(event);
    }

    return event;
  }

  describe('Focusable Elements Discovery & Filtering (getFocusableElements)', () => {
    it('filters out disabled, hidden, aria-hidden, and tabIndex=-1 elements', () => {
      const container = createMockElement('div');

      const normalBtn = createMockElement('button');
      const disabledBtn = createMockElement('button', { disabled: '' });
      const hiddenInput = createMockElement('input', { hidden: '' });
      const ariaHiddenLink = createMockElement('a', { 'aria-hidden': 'true', href: '#' });
      const negativeTabEl = createMockElement('div', { tabindex: '-1' }, -1);
      const displayNoneBtn = createMockElement('button');
      displayNoneBtn.style.display = 'none';

      container.children = [
        normalBtn,
        disabledBtn,
        hiddenInput,
        ariaHiddenLink,
        negativeTabEl,
        displayNoneBtn,
      ];

      const focusable = getFocusableElements(container as unknown as HTMLElement);

      expect(focusable).toHaveLength(1);
      expect(focusable[0]).toBe(normalBtn);
    });

    it('returns empty array when container is null', () => {
      expect(getFocusableElements(null)).toEqual([]);
    });
  });

  describe('8 Interaction Test Scenarios (Fase 1.1 Requirements)', () => {
    // 1. Fokus masuk ke modal ketika dibuka
    it('1. Fokus masuk ke modal ketika dibuka (fokus pada elemen interaktif pertama)', () => {
      const triggerBtn = createMockElement('button');
      triggerBtn.focus();
      expect(global.document.activeElement).toBe(triggerBtn);

      const modalContainer = createMockElement('div', { role: 'dialog' }, -1);
      const closeBtn = createMockElement('button', { 'aria-label': 'Tutup dialog' });
      const inputField = createMockElement('input', { type: 'text' });
      modalContainer.children = [closeBtn, inputField];

      const onClose = vi.fn();

      setupModalFocusTrap({
        dialogElement: modalContainer as unknown as HTMLElement,
        onClose,
      });

      expect(closeBtn.focusCount).toBe(1);
      expect(global.document.activeElement).toBe(closeBtn);
    });

    it('1b. Fokus menghargai autofocus dan initialFocusElement', () => {
      const modalContainer = createMockElement('div', { role: 'dialog' }, -1);
      const closeBtn = createMockElement('button');
      const autofocusInput = createMockElement('input', { autofocus: '' });
      modalContainer.children = [closeBtn, autofocusInput];

      setupModalFocusTrap({
        dialogElement: modalContainer as unknown as HTMLElement,
        onClose: vi.fn(),
      });

      expect(autofocusInput.focusCount).toBe(1);
      expect(global.document.activeElement).toBe(autofocusInput);

      // Testing initialFocusElement
      const customFocusBtn = createMockElement('button');
      modalContainer.children.push(customFocusBtn);

      setupModalFocusTrap({
        dialogElement: modalContainer as unknown as HTMLElement,
        initialFocusElement: customFocusBtn as unknown as HTMLElement,
        onClose: vi.fn(),
      });

      expect(customFocusBtn.focusCount).toBe(1);
      expect(global.document.activeElement).toBe(customFocusBtn);
    });

    // 2. Tab tidak dapat keluar dari modal
    it('2. Tab tidak dapat keluar dari modal (wrap dari elemen terakhir ke elemen pertama)', () => {
      const modalContainer = createMockElement('div', { role: 'dialog' }, -1);
      const firstBtn = createMockElement('button');
      const middleInput = createMockElement('input');
      const lastBtn = createMockElement('button');
      modalContainer.children = [firstBtn, middleInput, lastBtn];

      setupModalFocusTrap({
        dialogElement: modalContainer as unknown as HTMLElement,
        onClose: vi.fn(),
      });

      // Fokus berada di elemen terakhir
      lastBtn.focus();
      expect(global.document.activeElement).toBe(lastBtn);

      // Tekan Tab
      const tabEvent = triggerKeyDown('Tab', false);

      expect(tabEvent.defaultPrevented).toBe(true);
      expect(firstBtn.focusCount).toBeGreaterThan(0);
      expect(global.document.activeElement).toBe(firstBtn);
    });

    // 3. Shift+Tab tidak dapat keluar dari modal
    it('3. Shift+Tab tidak dapat keluar dari modal (wrap dari elemen pertama ke elemen terakhir)', () => {
      const modalContainer = createMockElement('div', { role: 'dialog' }, -1);
      const firstBtn = createMockElement('button');
      const middleInput = createMockElement('input');
      const lastBtn = createMockElement('button');
      modalContainer.children = [firstBtn, middleInput, lastBtn];

      setupModalFocusTrap({
        dialogElement: modalContainer as unknown as HTMLElement,
        onClose: vi.fn(),
      });

      // Fokus berada di elemen pertama
      firstBtn.focus();
      expect(global.document.activeElement).toBe(firstBtn);

      // Tekan Shift + Tab
      const shiftTabEvent = triggerKeyDown('Tab', true);

      expect(shiftTabEvent.defaultPrevented).toBe(true);
      expect(lastBtn.focusCount).toBe(1);
      expect(global.document.activeElement).toBe(lastBtn);
    });

    // 4. Fokus kembali ke elemen sebelumnya ketika modal ditutup
    it('4. Fokus kembali ke elemen sebelumnya ketika modal ditutup', () => {
      const triggerBtn = createMockElement('button');
      triggerBtn.focus();
      expect(global.document.activeElement).toBe(triggerBtn);

      const modalContainer = createMockElement('div', { role: 'dialog' }, -1);
      const closeBtn = createMockElement('button');
      modalContainer.children = [closeBtn];

      const trap = setupModalFocusTrap({
        dialogElement: modalContainer as unknown as HTMLElement,
        onClose: vi.fn(),
      });

      expect(global.document.activeElement).toBe(closeBtn);

      // Tutup modal dan jalankan cleanup
      trap.cleanup();

      expect(triggerBtn.focusCount).toBe(2); // Initial focus + restored focus
      expect(global.document.activeElement).toBe(triggerBtn);
    });

    // 5. Tombol ESC menutup modal
    it('5. Tombol ESC menutup modal ketika closeOnEsc=true', () => {
      const onClose = vi.fn();
      const modalContainer = createMockElement('div', { role: 'dialog' }, -1);

      setupModalFocusTrap({
        dialogElement: modalContainer as unknown as HTMLElement,
        onClose,
        closeOnEsc: true,
      });

      const event = triggerKeyDown('Escape');
      expect(event.defaultPrevented).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('5b. Tombol ESC diabaikan ketika closeOnEsc=false', () => {
      const onClose = vi.fn();
      const modalContainer = createMockElement('div', { role: 'dialog' }, -1);

      setupModalFocusTrap({
        dialogElement: modalContainer as unknown as HTMLElement,
        onClose,
        closeOnEsc: false,
      });

      const event = triggerKeyDown('Escape');
      expect(event.defaultPrevented).toBe(false);
      expect(onClose).not.toHaveBeenCalled();
    });

    // 6. Event listener dibersihkan ketika modal di-unmount
    it('6. Event listener dibersihkan ketika modal di-unmount atau ditutup', () => {
      const modalContainer = createMockElement('div', { role: 'dialog' }, -1);
      const onClose = vi.fn();

      const trap = setupModalFocusTrap({
        dialogElement: modalContainer as unknown as HTMLElement,
        onClose,
      });

      expect(global.window.addEventListener).toHaveBeenCalledWith('keydown', trap.handleKeyDown);
      expect(listeners['keydown']).toHaveLength(1);

      // Jalankan cleanup
      trap.cleanup();
      expect(global.window.removeEventListener).toHaveBeenCalledWith('keydown', trap.handleKeyDown);
      expect(listeners['keydown']).toHaveLength(0);

      // Menekan ESC setelah cleanup tidak boleh memanggil onClose
      triggerKeyDown('Escape');
      expect(onClose).not.toHaveBeenCalled();
    });

    // 7. Body scroll lock dipulihkan dengan benar
    it('7. Body scroll lock dipulihkan dengan benar ke nilai semula', () => {
      global.document.body.style.overflow = 'auto';

      const modalContainer = createMockElement('div', { role: 'dialog' }, -1);

      const trap1 = setupModalFocusTrap({
        dialogElement: modalContainer as unknown as HTMLElement,
        onClose: vi.fn(),
      });

      expect(global.document.body.style.overflow).toBe('hidden');

      // Cleanup
      trap1.cleanup();
      expect(global.document.body.style.overflow).toBe('auto');

      // Jika sebelumnya kosong string ('')
      global.document.body.style.overflow = '';
      const trap2 = setupModalFocusTrap({
        dialogElement: modalContainer as unknown as HTMLElement,
        onClose: vi.fn(),
      });
      expect(global.document.body.style.overflow).toBe('hidden');

      trap2.cleanup();
      expect(global.document.body.style.overflow).toBe('');
    });

    // 8. Modal tanpa elemen interaktif tetap dapat menerima fokus
    it('8. Modal tanpa elemen interaktif tetap dapat menerima fokus pada container dialog', () => {
      const modalContainer = createMockElement('div', { role: 'dialog' }, -1);
      // Container tidak memiliki children interaktif
      modalContainer.children = [];

      setupModalFocusTrap({
        dialogElement: modalContainer as unknown as HTMLElement,
        onClose: vi.fn(),
      });

      // Fokus otomatis diberikan ke container dialog itu sendiri
      expect(modalContainer.focusCount).toBe(1);
      expect(global.document.activeElement).toBe(modalContainer);

      // Menekan Tab harus dicegah keluar dan fokus tetap pada container
      const tabEvent = triggerKeyDown('Tab', false);
      expect(tabEvent.defaultPrevented).toBe(true);
      expect(modalContainer.focusCount).toBe(2);

      // Menekan Shift+Tab juga harus dicegah keluar
      const shiftTabEvent = triggerKeyDown('Tab', true);
      expect(shiftTabEvent.defaultPrevented).toBe(true);
      expect(modalContainer.focusCount).toBe(3);
    });
  });
});
