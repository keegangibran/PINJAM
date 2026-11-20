'use client';

import React, { useEffect, useId, useCallback, useRef } from 'react';
import { X } from 'lucide-react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
  className?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]',
].join(', ');

export function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return elements.filter((el) => {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.hasAttribute('hidden')) return false;
    if (el.tabIndex === -1) return false;
    if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return false;
    return true;
  });
}

export interface ModalFocusTrapConfig {
  dialogElement: HTMLElement | null;
  initialFocusElement?: HTMLElement | null;
  closeOnEsc?: boolean;
  onClose: () => void;
}

export interface ModalFocusTrapInstance {
  handleKeyDown: (e: KeyboardEvent) => void;
  cleanup: () => void;
}

export function setupModalFocusTrap({
  dialogElement,
  initialFocusElement,
  closeOnEsc = true,
  onClose,
}: ModalFocusTrapConfig): ModalFocusTrapInstance {
  // 1. Simpan elemen yang aktif sebelum modal dibuka
  const previousActiveElement =
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

  // 2. Kunci body scroll
  const originalOverflow = typeof document !== 'undefined' ? document.body.style.overflow : '';
  if (typeof document !== 'undefined') {
    document.body.style.overflow = 'hidden';
  }

  // 3. Arahkan fokus ke elemen yang sesuai di dalam modal
  if (initialFocusElement && typeof initialFocusElement.focus === 'function') {
    initialFocusElement.focus();
  } else if (dialogElement) {
    const focusable = getFocusableElements(dialogElement);
    if (focusable.length > 0) {
      const autoFocusEl = focusable.find(
        (el) => el.hasAttribute('autofocus') || el.getAttribute('data-autofocus') === 'true'
      );
      (autoFocusEl || focusable[0]).focus();
    } else if (typeof dialogElement.focus === 'function') {
      dialogElement.focus();
    }
  }

  // 4. Focus Trap Keydown Handler
  const handleKeyDown = (e: KeyboardEvent) => {
    if (closeOnEsc && e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'Tab') {
      if (!dialogElement) return;

      const focusable = getFocusableElements(dialogElement);

      // Jika modal tidak memiliki elemen interaktif, pertahankan fokus pada dialog container
      if (focusable.length === 0) {
        e.preventDefault();
        if (typeof dialogElement.focus === 'function') {
          dialogElement.focus();
        }
        return;
      }

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;

      if (e.shiftKey) {
        // Shift + Tab: jika di elemen pertama, container dialog, atau di luar modal, pindah ke elemen terakhir
        if (
          activeEl === firstElement ||
          activeEl === dialogElement ||
          !dialogElement.contains(activeEl)
        ) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: jika di elemen terakhir, container dialog, atau di luar modal, pindah ke elemen pertama
        if (
          activeEl === lastElement ||
          activeEl === dialogElement ||
          !dialogElement.contains(activeEl)
        ) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown);
  }

  const cleanup = () => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = originalOverflow;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeyDown);
    }
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
      previousActiveElement.focus();
    }
  };

  return {
    handleKeyDown,
    cleanup,
  };
}

export interface UseModalFocusTrapOptions {
  isOpen: boolean;
  onClose: () => void;
  dialogRef: React.RefObject<HTMLElement | null>;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  closeOnEsc?: boolean;
}

export function useModalFocusTrap({
  isOpen,
  onClose,
  dialogRef,
  initialFocusRef,
  closeOnEsc = true,
}: UseModalFocusTrapOptions) {
  useEffect(() => {
    if (!isOpen) return;

    const trap = setupModalFocusTrap({
      dialogElement: dialogRef.current,
      initialFocusElement: initialFocusRef?.current,
      closeOnEsc,
      onClose,
    });

    return () => {
      trap.cleanup();
    };
  }, [isOpen, onClose, dialogRef, initialFocusRef, closeOnEsc]);
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  className = '',
  initialFocusRef,
}) => {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = `${generatedId}-desc`;

  const dialogRef = useRef<HTMLDivElement>(null);

  useModalFocusTrap({
    isOpen,
    onClose,
    dialogRef,
    initialFocusRef,
    closeOnEsc,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`w-full bg-surface rounded-card shadow-2xl border border-borderline flex flex-col max-h-[90vh] overflow-hidden focus:outline-none ${sizeClasses[size]} ${className}`.trim()}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between p-5 sm:p-6 pb-4 border-b border-slate-100">
            <div className="space-y-1 pr-4">
              {title && (
                <h3 id={titleId} className="text-lg font-bold text-slate-900 tracking-tight">
                  {title}
                </h3>
              )}
              {description && (
                <p id={descriptionId} className="text-xs text-slate-500 leading-relaxed">
                  {description}
                </p>
              )}
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup dialog"
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-navy-800/20"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs text-slate-700">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-4 sm:p-5 border-t border-slate-100 bg-canvas flex items-center justify-end gap-2 text-xs">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
