import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsDrawer } from '../../src/renderer/components/SettingsDrawer';
import type {
  BackdropPreviewPatch,
  SettingsV5,
  WindowAppearance,
} from '../../src/shared/contracts';
import { messages } from '../../src/shared/i18n';

const settings: SettingsV5 = {
  schemaVersion: 5,
  locale: 'en',
  glassContrast: 0,
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
    glassContrast?: number;
    frostStrength?: number;
  } = {},
) {
  const preview = handlers.preview ?? vi.fn();
  const commit = handlers.commit ?? vi.fn();
  render(
    <SettingsDrawer
      open
      settings={settings}
      windowAppearance={windowAppearance}
      glassContrast={handlers.glassContrast ?? settings.glassContrast}
      frostStrength={handlers.frostStrength ?? settings.frostStrength}
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

  it('previews signed 5% contrast steps and commits the final value', () => {
    const { preview, commit } = renderDrawer();
    const slider = screen.getByRole('slider', { name: 'Glass contrast' });
    expect(slider).toHaveAttribute('min', '-100');
    expect(slider).toHaveAttribute('max', '100');
    expect(slider).toHaveAttribute('step', '5');
    expect(screen.getByText('Neutral')).toBeVisible();

    fireEvent.change(slider, { target: { value: '-20' } });
    fireEvent.pointerUp(slider);
    expect(preview).toHaveBeenCalledWith({ glassContrast: -20 });
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
    ['unavailable', /unavailable until restart/],
  ] as const)('disables both controls and explains %s', (backdropStatus, reason) => {
    renderDrawer({
      ...activeAppearance,
      backdropMode: 'opaque',
      backdropStatus,
      ...(backdropStatus === 'unavailable'
        ? { backdropFailureCode: 'runtime-rebuild-failed' as const }
        : {}),
    });
    expect(screen.getByRole('slider', { name: 'Glass contrast' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Frost strength' })).toBeDisabled();
    expect(screen.getByText(reason)).toBeVisible();
  });

  it('keeps contrast enabled and previewable at the zero-blur frost endpoint', () => {
    const { preview, commit } = renderDrawer(activeAppearance, {
      glassContrast: -75,
      frostStrength: 0,
    });
    const contrast = screen.getByRole('slider', { name: 'Glass contrast' });
    expect(contrast).toBeEnabled();
    expect(contrast).toHaveValue('-75');
    expect(screen.getByText('White 75%')).toBeVisible();
    fireEvent.change(contrast, { target: { value: '25' } });
    fireEvent.pointerUp(contrast);
    expect(preview).toHaveBeenCalledWith({ glassContrast: 25 });
    expect(commit).toHaveBeenCalled();
    expect(screen.getByRole('slider', { name: 'Frost strength' })).toBeEnabled();
  });
});
