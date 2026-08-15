import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS, type Settings } from '../../contracts/generated/protocol';
import { SettingsDrawer } from '../../web/src/components/SettingsDrawer';
import { messages } from '../../web/src/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function settings(): Settings {
  return { ...DEFAULT_SETTINGS, glass: { ...DEFAULT_SETTINGS.glass } };
}

describe('SettingsDrawer', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('exposes exact slider ranges and focuses the close control when opened', () => {
    render(
      <SettingsDrawer
        open
        value={settings()}
        labels={messages.en}
        onChange={vi.fn()}
        onApply={vi.fn()}
        onCancel={vi.fn()}
        pending={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(screen.getByRole('slider', { name: 'Blur' })).toHaveAttribute('step', '1');
    expect(screen.getByRole('slider', { name: 'Blur' })).toHaveAttribute(
      'aria-valuetext',
      '30 DIP',
    );
    expect(screen.getAllByRole('slider')).toHaveLength(2);
  });

  it('applies clear and dense preset values while preserving enabled', () => {
    const onChange = vi.fn();
    const value = settings();
    value.glass.enabled = false;
    render(
      <SettingsDrawer
        open
        value={value}
        labels={messages.en}
        onChange={onChange}
        onApply={vi.fn()}
        onCancel={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith({
      ...value,
      glass: { enabled: false, blurDips: 0 },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dense' }));
    expect(onChange).toHaveBeenCalledWith({
      ...value,
      glass: { enabled: false, blurDips: 55 },
    });
  });

  it('derives Custom, previews slider values, and resets only Glass values', () => {
    const onChange = vi.fn();
    const value = settings();
    value.locale = 'ja';
    value.uiScale = 140;
    value.glass = { enabled: true, blurDips: 31 };
    render(
      <SettingsDrawer
        open
        value={value}
        labels={messages.en}
        onChange={onChange}
        onApply={vi.fn()}
        onCancel={vi.fn()}
        pending={false}
      />,
    );

    expect(screen.getByText('Custom')).toHaveAttribute('aria-current', 'true');
    fireEvent.change(screen.getByRole('slider', { name: 'Blur' }), {
      target: { value: '45' },
    });
    expect(onChange).toHaveBeenCalledWith({
      ...value,
      glass: { ...value.glass, blurDips: 45 },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reset Glass' }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...value,
      glass: { enabled: true, blurDips: 30 },
    });
  });

  it('normalizes picker and HEX colors, rejects invalid HEX, and clears the color', () => {
    const onChange = vi.fn();
    const value = settings();
    value.backgroundColor = '#123456';
    render(
      <SettingsDrawer
        open
        value={value}
        labels={messages.en}
        onChange={onChange}
        onApply={vi.fn()}
        onCancel={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Background color HEX' }), {
      target: { value: '#aBcD12' },
    });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Background color HEX' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, backgroundColor: '#ABCD12' });

    onChange.mockClear();
    fireEvent.change(screen.getByRole('textbox', { name: 'Background color HEX' }), {
      target: { value: '#abc' },
    });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Background color HEX' }));
    expect(screen.getByRole('alert')).toHaveTextContent('six-digit HEX');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'No background color' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, backgroundColor: '' });
  });
});
