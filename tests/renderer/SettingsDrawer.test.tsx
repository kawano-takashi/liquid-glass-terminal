import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsDrawer } from '../../src/renderer/components/SettingsDrawer';
import type {
  BackdropPreviewPatch,
  SettingsV4,
  WindowAppearance,
} from '../../src/shared/contracts';
import { messages } from '../../src/shared/i18n';

const settings: SettingsV4 = {
  schemaVersion: 4,
  locale: 'en',
  glassOpacity: 25,
  frostStrength: 6,
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
  highContrast: false,
  reducedTransparency: false,
  backdropMode: 'frosted',
  backdropStatus: 'active',
};

function renderDrawer(
  windowAppearance: WindowAppearance = activeAppearance,
  handlers: {
    preview?: (patch: BackdropPreviewPatch) => void;
    commit?: () => void;
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
      frostStrength={settings.frostStrength}
      profiles={[]}
      labels={messages.en}
      onClose={vi.fn()}
      onChange={vi.fn()}
      onBackdropPreview={preview}
      onBackdropCommit={commit}
    />,
  );
  return { preview, commit };
}

describe('SettingsDrawer frosted backdrop controls', () => {
  it('does not expose theme controls', () => {
    renderDrawer();
    expect(screen.queryByRole('group', { name: 'Theme' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Light' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dark' })).not.toBeInTheDocument();
  });

  it('previews 5% opacity steps and commits the final value', () => {
    const { preview, commit } = renderDrawer();
    const slider = screen.getByRole('slider', { name: 'Glass opacity' });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '100');
    expect(slider).toHaveAttribute('step', '5');
    expect(screen.getByText('25%')).toBeVisible();

    fireEvent.change(slider, { target: { value: '20' } });
    fireEvent.pointerUp(slider);
    expect(preview).toHaveBeenCalledWith({ glassOpacity: 20 });
    expect(commit).toHaveBeenCalled();
  });

  it('exposes all 14 frost levels and displays the default as 7 / 14', () => {
    const { preview } = renderDrawer();
    const slider = screen.getByRole('slider', { name: 'Frost strength' });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '13');
    expect(slider).toHaveAttribute('step', '1');
    expect(screen.getByText(/7\s*\/\s*14/)).toBeVisible();
    fireEvent.change(slider, { target: { value: '13' } });
    expect(preview).toHaveBeenCalledWith({ frostStrength: 13 });
  });

  it.each([
    ['policy-disabled', /Windows, accessibility, energy-saver/],
    ['runtime-failure', /unavailable until restart/],
  ] as const)('disables both controls and explains %s', (backdropStatus, reason) => {
    renderDrawer({
      ...activeAppearance,
      backdropMode: 'opaque',
      backdropStatus,
      ...(backdropStatus === 'runtime-failure'
        ? { backdropFailureCode: 'runtime-rebuild-failed' as const }
        : {}),
    });
    expect(screen.getByRole('slider', { name: 'Glass opacity' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Frost strength' })).toBeDisabled();
    expect(screen.getByText(reason)).toBeVisible();
  });
});
