import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shield, Sparkles, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import PasswordInput from '@/components/ui/PasswordInput';
import tailwindConfig from '../../tailwind.config';

describe('Design Foundation & Tokens (Fase 0)', () => {
  describe('1. Design Tokens Configuration', () => {
    it('has primary navy and blue tokens defined in tailwind config', () => {
      const colors = tailwindConfig.theme?.extend?.colors as any;
      expect(colors).toBeDefined();

      // Primary Navy: #142D4E
      expect(colors.navy).toBeDefined();
      expect(colors.navy[800]).toBe('#142D4E');
      expect(colors.navy.DEFAULT).toBe('#142D4E');

      // Primary Blue: #2563EB & Secondary Blue: #60A5FA & Soft Blue: #EFF6FF
      expect(colors.brand).toBeDefined();
      expect(colors.brand.primary).toBe('#2563EB');
      expect(colors.brand.secondary).toBe('#60A5FA');
      expect(colors.brand.soft).toBe('#EFF6FF');

      // Background, Surface, Main Text, Border
      expect(colors.canvas).toBe('#F8FAFC');
      expect(colors.surface).toBe('#FFFFFF');
      expect(colors.main).toBe('#0F172A');
      expect(colors.borderline).toBe('#E2E8F0');
    });

    it('has sans font family configured with Inter variable and fallbacks', () => {
      const fontFamily = tailwindConfig.theme?.extend?.fontFamily as any;
      expect(fontFamily).toBeDefined();
      expect(fontFamily.sans).toBeDefined();
      expect(fontFamily.sans[0]).toBe('var(--font-inter)');
      expect(fontFamily.sans[1]).toBe('Inter');
    });

    it('has border radius tokens configured', () => {
      const borderRadius = tailwindConfig.theme?.extend?.borderRadius as any;
      expect(borderRadius).toBeDefined();
      expect(borderRadius.card).toBe('1rem');
      expect(borderRadius.element).toBe('0.75rem');
      expect(borderRadius.button).toBe('0.625rem');
    });
  });

  describe('2. Lucide Icons Dependency & Rendering', () => {
    it('renders lucide-react icons without runtime or SSR errors', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          'div',
          null,
          React.createElement(Shield, { size: 20, className: 'text-navy-800' }),
          React.createElement(Sparkles, { size: 16, className: 'text-brand-primary' }),
          React.createElement(CheckCircle, { size: 18 }),
          React.createElement(AlertTriangle, { size: 18 }),
          React.createElement(ArrowRight, { size: 14 })
        )
      );

      expect(html).toContain('svg');
      expect(html).toContain('text-navy-800');
      expect(html).toContain('text-brand-primary');
    });
  });

  describe('3. PasswordInput Component Preservation', () => {
    it('preserves PasswordInput functionality and styling', () => {
      const html = renderToStaticMarkup(
        React.createElement(PasswordInput, {
          id: 'test-password',
          name: 'password',
          placeholder: 'Masukkan kata sandi',
        })
      );

      expect(html).toContain('id="test-password"');
      expect(html).toContain('type="password"');
      expect(html).toContain('pr-11');
      expect(html).toContain('button');
    });
  });
});
