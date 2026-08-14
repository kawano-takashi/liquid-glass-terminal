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
    expect(screen.getByRole('slider', { name: 'Frost thickness' })).toHaveAttribute('max', '13');
    expect(screen.getByRole('slider', { name: 'Glass opacity' })).toHaveAttribute('step', '5');
    expect(screen.getByRole('slider', { name: 'Tone' })).toHaveAttribute('step', '1');
    expect(screen.getByRole('slider', { name: 'Grain' })).toHaveAttribute('max', '100');
  });

  it('applies all four preset values while preserving enabled', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Dense' }));
    expect(onChange).toHaveBeenCalledWith({
      ...value,
      glass: { enabled: false, frostThickness: 12, opacity: 50, tone: 92, grain: 0 },
    });
  });

  it('derives Custom, previews slider values, and resets only Glass values', () => {
    const onChange = vi.fn();
    const value = settings();
    value.locale = 'ja';
    value.uiScale = 140;
    value.glass = { enabled: true, frostThickness: 7, opacity: 40, tone: 60, grain: 12 };
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
    fireEvent.change(screen.getByRole('slider', { name: 'Glass opacity' }), {
      target: { value: '45' },
    });
    expect(onChange).toHaveBeenCalledWith({
      ...value,
      glass: { ...value.glass, opacity: 45 },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reset Glass' }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...value,
      glass: { enabled: true, frostThickness: 10, opacity: 35, tone: 92, grain: 0 },
    });
  });
});
