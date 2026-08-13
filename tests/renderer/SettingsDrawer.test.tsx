import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsDrawer } from '../../src/renderer/components/SettingsDrawer';
import type { SettingsV3, WindowAppearance } from '../../src/shared/contracts';
import { messages } from '../../src/shared/i18n';

const settings: SettingsV3 = {
  schemaVersion: 3,
  locale: 'en',
  theme: 'system',
  backgroundOpacity: 25,
  defaultProfileId: 'auto',
  fontSize: 14,
  cursorStyle: 'block',
  cursorBlink: true,
  bellSound: false,
  scrollback: 100_000,
  warnMultilinePaste: true,
  screenReaderMode: false,
  firstRunHintsSeen: true,
};

const activeAppearance: WindowAppearance = {
  resolvedTheme: 'dark',
  highContrast: false,
  reducedTransparency: false,
  glassMode: 'acrylic',
  glassAvailability: 'active',
};

function renderDrawer(
  windowAppearance: WindowAppearance = activeAppearance,
  handlers: {
    preview?: (opacity: number) => void;
    commit?: (opacity?: number) => void;
  } = {},
) {
  const preview = handlers.preview ?? vi.fn();
  const commit = handlers.commit ?? vi.fn();
  render(
    <SettingsDrawer
      open
      settings={settings}
      windowAppearance={windowAppearance}
      backgroundOpacity={settings.backgroundOpacity}
      profiles={[]}
      labels={messages.en}
      onClose={vi.fn()}
      onChange={vi.fn()}
      onBackgroundPreview={preview}
      onBackgroundCommit={commit}
    />,
  );
  return { preview, commit };
}

describe('SettingsDrawer background opacity', () => {
  it('previews 1% slider changes and commits the final value', () => {
    const { preview, commit } = renderDrawer();
    const slider = screen.getByRole('slider', { name: 'Background opacity' });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '50');
    expect(slider).toHaveAttribute('step', '1');
    expect(screen.getByText('25%')).toBeVisible();

    fireEvent.change(slider, { target: { value: '24' } });
    fireEvent.pointerUp(slider);
    expect(preview).toHaveBeenCalledWith(24);
    expect(commit).toHaveBeenCalled();
  });

  it.each([
    ['accessibility-disabled', /accessibility preference/],
    ['unsupported', /Adjustable transparency is unavailable/],
    ['system-fallback', /Windows is temporarily/],
  ] as const)('disables the slider and explains %s', (glassAvailability, reason) => {
    renderDrawer({ ...activeAppearance, glassAvailability });
    expect(screen.getByRole('slider', { name: 'Background opacity' })).toBeDisabled();
    expect(screen.getByText(reason)).toBeVisible();
  });
});
