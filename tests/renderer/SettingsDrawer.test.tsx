import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsDrawer } from '../../src/renderer/components/SettingsDrawer';
import type { SettingsV2, WindowAppearance } from '../../src/shared/contracts';
import { messages } from '../../src/shared/i18n';

const settings: SettingsV2 = {
  schemaVersion: 2,
  locale: 'en',
  theme: 'system',
  glassOpacity: 60,
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
      glassOpacity={settings.glassOpacity}
      profiles={[]}
      labels={messages.en}
      onClose={vi.fn()}
      onChange={vi.fn()}
      onGlassPreview={preview}
      onGlassCommit={commit}
    />,
  );
  return { preview, commit };
}

describe('SettingsDrawer glass opacity', () => {
  it('previews 1% slider changes and commits the final value', () => {
    const { preview, commit } = renderDrawer();
    const slider = screen.getByRole('slider', { name: 'Glass opacity' });
    expect(slider).toHaveAttribute('min', '35');
    expect(slider).toHaveAttribute('max', '85');
    expect(slider).toHaveAttribute('step', '1');
    expect(screen.getByText('60%')).toBeVisible();

    fireEvent.change(slider, { target: { value: '61' } });
    fireEvent.pointerUp(slider);
    expect(preview).toHaveBeenCalledWith(61);
    expect(commit).toHaveBeenCalled();
  });

  it.each([
    ['accessibility-disabled', /accessibility preference/],
    ['unsupported', /unavailable on this platform/],
    ['system-fallback', /Windows is temporarily/],
  ] as const)('disables the slider and explains %s', (glassAvailability, reason) => {
    renderDrawer({ ...activeAppearance, glassAvailability });
    expect(screen.getByRole('slider', { name: 'Glass opacity' })).toBeDisabled();
    expect(screen.getByText(reason)).toBeVisible();
  });
});
