import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PasswordInput, { type PasswordInputProps } from '@/components/ui/PasswordInput';

// React client internals to run hooks in Node-based Vitest environment
const clientInternals = (
  React as unknown as {
    __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
      H: unknown;
    };
  }
).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

type TestInputElement = React.ReactElement<React.InputHTMLAttributes<HTMLInputElement>>;
type TestButtonElement = React.ReactElement<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    'aria-label'?: string;
    'aria-pressed'?: boolean;
  }
>;
type TestContainerElement = React.ReactElement<{
  className?: string;
  children: [TestInputElement, TestButtonElement];
}>;

function createTestHarness(props: PasswordInputProps) {
  let state: boolean | undefined = undefined;

  function render(overrideProps?: Partial<PasswordInputProps>) {
    if (clientInternals) {
      clientInternals.H = {
        useState: (initial: boolean | (() => boolean)) => {
          if (state === undefined) {
            state = typeof initial === 'function' ? initial() : initial;
          }
          return [
            state,
            (updater: boolean | ((prev: boolean) => boolean)) => {
              state = typeof updater === 'function' ? updater(state as boolean) : updater;
            },
          ];
        },
        useRef: (initial: unknown) => ({ current: initial }),
        useId: () => 'test-id',
      };
    }

    const renderFn =
      typeof PasswordInput === 'function'
        ? PasswordInput
        : (
            PasswordInput as unknown as {
              render: (p: PasswordInputProps, r: unknown) => TestContainerElement;
            }
          ).render;

    const mergedProps = { ...props, ...overrideProps };
    const vdom = renderFn(mergedProps, null) as TestContainerElement;
    const [inputElement, buttonElement] = vdom.props.children;
    return {
      vdom,
      input: inputElement,
      button: buttonElement,
      clickToggle: () => {
        buttonElement.props.onClick?.(
          {} as React.MouseEvent<HTMLButtonElement, MouseEvent>
        );
      },
    };
  }

  return { render };
}

describe('PasswordInput Component Unit Tests (src/components/ui/PasswordInput.tsx)', () => {
  beforeEach(() => {
    // Reset state before each test
  });

  it('1. Input awal menggunakan type="password"', () => {
    const harness = createTestHarness({
      value: 'rahasia123',
      onChange: () => {},
    });

    const { input } = harness.render();
    expect(input.props.type).toBe('password');
  });

  it('2. Klik tombol mata mengubah input menjadi type="text"', () => {
    const harness = createTestHarness({
      value: 'rahasia123',
      onChange: () => {},
    });

    const first = harness.render();
    expect(first.input.props.type).toBe('password');

    first.clickToggle();

    const second = harness.render();
    expect(second.input.props.type).toBe('text');
  });

  it('3. Klik kembali menyembunyikan password menjadi type="password"', () => {
    const harness = createTestHarness({
      value: 'rahasia123',
      onChange: () => {},
    });

    const first = harness.render();
    first.clickToggle(); // Switch to visible

    const second = harness.render();
    expect(second.input.props.type).toBe('text');

    second.clickToggle(); // Switch back to hidden

    const third = harness.render();
    expect(third.input.props.type).toBe('password');
  });

  it('4. Nilai password tetap sama setelah toggle (tidak terhapus)', () => {
    const secretValue = 'PasswordSuperAman2026!';
    const harness = createTestHarness({
      value: secretValue,
      onChange: () => {},
    });

    const initial = harness.render();
    expect(initial.input.props.value).toBe(secretValue);

    initial.clickToggle();

    const toggled = harness.render();
    expect(toggled.input.props.value).toBe(secretValue);

    toggled.clickToggle();

    const reToggled = harness.render();
    expect(reToggled.input.props.value).toBe(secretValue);
  });

  it('5. Tombol toggle menggunakan type="button" agar tidak men-submit form', () => {
    const harness = createTestHarness({
      value: 'rahasia123',
      onChange: () => {},
    });

    const { button } = harness.render();
    expect(button.props.type).toBe('button');
  });

  it('6. aria-label berubah sesuai kondisi visibilitas', () => {
    const harness = createTestHarness({
      value: 'rahasia123',
      onChange: () => {},
    });

    const initial = harness.render();
    expect(buttonAriaLabel(initial.button)).toBe('Tampilkan kata sandi');

    initial.clickToggle();

    const visible = harness.render();
    expect(buttonAriaLabel(visible.button)).toBe('Sembunyikan kata sandi');

    visible.clickToggle();

    const hiddenAgain = harness.render();
    expect(buttonAriaLabel(hiddenAgain.button)).toBe('Tampilkan kata sandi');
  });

  it('7. aria-pressed sesuai kondisi visibilitas', () => {
    const harness = createTestHarness({
      value: 'rahasia123',
      onChange: () => {},
    });

    const initial = harness.render();
    expect(initial.button.props['aria-pressed']).toBe(false);

    initial.clickToggle();

    const visible = harness.render();
    expect(visible.button.props['aria-pressed']).toBe(true);

    visible.clickToggle();

    const hiddenAgain = harness.render();
    expect(hiddenAgain.button.props['aria-pressed']).toBe(false);
  });

  it('8. Ketika disabled, tombol toggle tidak dapat mengubah visibilitas', () => {
    const harness = createTestHarness({
      value: 'rahasia123',
      onChange: () => {},
      disabled: true,
    });

    const initial = harness.render();
    expect(initial.input.props.disabled).toBe(true);
    expect(initial.button.props.disabled).toBe(true);
    expect(initial.input.props.type).toBe('password');

    // Attempt click on disabled toggle
    initial.clickToggle();

    const afterClick = harness.render();
    expect(afterClick.input.props.type).toBe('password');
    expect(afterClick.button.props['aria-pressed']).toBe(false);
  });

  it('9. Props seperti required, minLength, name, id, dan autoComplete diteruskan dengan benar', () => {
    const harness = createTestHarness({
      id: 'login-password',
      name: 'password',
      autoComplete: 'current-password',
      required: true,
      minLength: 6,
      placeholder: 'Masukkan sandi Anda',
      value: 'test1234',
      onChange: () => {},
      className: 'custom-class',
      containerClassName: 'custom-container',
    });

    const { input, vdom } = harness.render();

    expect(input.props.id).toBe('login-password');
    expect(input.props.name).toBe('password');
    expect(input.props.autoComplete).toBe('current-password');
    expect(input.props.required).toBe(true);
    expect(input.props.minLength).toBe(6);
    expect(input.props.placeholder).toBe('Masukkan sandi Anda');
    expect(input.props.className).toContain('custom-class');
    expect(input.props.className).toContain('pr-11');
    expect(vdom.props.className).toContain('custom-container');
  });

  it('10. Mendukung render static markup SSR dengan format HTML valid', () => {
    const html = renderToStaticMarkup(
      React.createElement(PasswordInput, {
        id: 'test-pwd',
        name: 'password',
        value: 'rahasia',
        required: true,
        autoComplete: 'current-password',
        onChange: () => {},
      })
    );

    expect(html).toContain('type="password"');
    expect(html).toContain('name="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Tampilkan kata sandi"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('pr-11');
  });
});

function buttonAriaLabel(button: TestButtonElement): string {
  return button.props['aria-label'] || '';
}
