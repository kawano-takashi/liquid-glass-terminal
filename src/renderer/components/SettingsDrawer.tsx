import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type {
  BackdropPreviewPatch,
  SettingsPatch,
  SettingsV5,
  ShellProfileDescriptor,
  WindowAppearance,
} from '../../shared/contracts';
import {
  FROST_STRENGTH_MAX,
  FROST_STRENGTH_MIN,
  GLASS_CONTRAST_MAX,
  GLASS_CONTRAST_MIN,
  GLASS_CONTRAST_STEP,
} from '../../shared/settings';

interface SettingsLabels {
  settings: string;
  close: string;
  system: string;
  glassContrast: string;
  glassContrastWhite: string;
  glassContrastNeutral: string;
  glassContrastBlack: string;
  frostStrength: string;
  backdropUnavailablePolicy: string;
  backdropUnavailable: string;
  defaultShell: string;
  automatic: string;
  fontSize: string;
  cursor: string;
  cursorBlink: string;
  bellSound: string;
  scrollback: string;
  pasteWarning: string;
  screenReader: string;
  language: string;
}

interface SettingsDrawerProps {
  open: boolean;
  settings: SettingsV5;
  windowAppearance: WindowAppearance;
  glassContrast: number;
  frostStrength: number;
  profiles: ShellProfileDescriptor[];
  labels: SettingsLabels;
  onClose(): void;
  onChange(patch: SettingsPatch): void;
  onBackdropPreview(patch: BackdropPreviewPatch): void;
  onBackdropCommit(): void;
}

export function SettingsDrawer({
  open,
  settings,
  windowAppearance,
  glassContrast,
  frostStrength,
  profiles,
  labels,
  onClose,
  onChange,
  onBackdropPreview,
  onBackdropCommit,
}: SettingsDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const backdropDisabled = windowAppearance.backdropStatus !== 'active';
  const backdropDisabledReason =
    windowAppearance.backdropStatus === 'unavailable'
      ? labels.backdropUnavailable
      : windowAppearance.backdropStatus === 'policy-disabled'
        ? labels.backdropUnavailablePolicy
        : undefined;
  const contrastOutput =
    glassContrast < 0
      ? `${labels.glassContrastWhite} ${Math.abs(glassContrast)}%`
      : glassContrast > 0
        ? `${labels.glassContrastBlack} ${glassContrast}%`
        : labels.glassContrastNeutral;

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('button, input, select')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !panelRef.current) return;
      const elements = [
        ...panelRef.current.querySelectorAll<HTMLElement>('button, input, select'),
      ].filter((item) => !item.hasAttribute('disabled'));
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div className="drawer-backdrop" data-open={open} onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        className="settings-drawer"
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        aria-hidden={!open}
      >
        <div className="drawer-header">
          <div>
            <span className="eyebrow">Liquid Glass</span>
            <h2 id="settings-title">{labels.settings}</h2>
          </div>
          <button type="button" className="icon-button" aria-label={labels.close} onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <div className="settings-scroll">
          <label className="setting-field">
            <span>{labels.language}</span>
            <select
              value={settings.locale}
              onChange={(event) => onChange({ locale: event.target.value as SettingsV5['locale'] })}
            >
              <option value="system">{labels.system}</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </label>

          <label className="setting-field range-field" data-disabled={backdropDisabled}>
            <span>{labels.glassContrast}</span>
            <output>{contrastOutput}</output>
            <input
              type="range"
              min={GLASS_CONTRAST_MIN}
              max={GLASS_CONTRAST_MAX}
              step={GLASS_CONTRAST_STEP}
              value={glassContrast}
              disabled={backdropDisabled}
              aria-label={labels.glassContrast}
              aria-describedby={backdropDisabledReason ? 'backdrop-settings-reason' : undefined}
              onChange={(event) => onBackdropPreview({ glassContrast: Number(event.target.value) })}
              onPointerUp={onBackdropCommit}
              onPointerCancel={onBackdropCommit}
              onKeyUp={onBackdropCommit}
              onBlur={onBackdropCommit}
            />
          </label>

          <label className="setting-field range-field" data-disabled={backdropDisabled}>
            <span>{labels.frostStrength}</span>
            <output>
              {frostStrength + 1} / {FROST_STRENGTH_MAX + 1}
            </output>
            <input
              type="range"
              min={FROST_STRENGTH_MIN}
              max={FROST_STRENGTH_MAX}
              step="1"
              value={frostStrength}
              disabled={backdropDisabled}
              aria-label={labels.frostStrength}
              aria-describedby={backdropDisabledReason ? 'backdrop-settings-reason' : undefined}
              onChange={(event) => onBackdropPreview({ frostStrength: Number(event.target.value) })}
              onPointerUp={onBackdropCommit}
              onPointerCancel={onBackdropCommit}
              onKeyUp={onBackdropCommit}
              onBlur={onBackdropCommit}
            />
          </label>

          {backdropDisabledReason && (
            <small id="backdrop-settings-reason" className="setting-reason backdrop-setting-reason">
              {backdropDisabledReason}
            </small>
          )}

          <label className="setting-field">
            <span>{labels.defaultShell}</span>
            <select
              value={settings.defaultProfileId}
              onChange={(event) => onChange({ defaultProfileId: event.target.value })}
            >
              <option value="auto">{labels.automatic}</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>
          </label>

          <label className="setting-field range-field">
            <span>{labels.fontSize}</span>
            <output>{settings.fontSize}px</output>
            <input
              type="range"
              min="10"
              max="32"
              step="1"
              value={settings.fontSize}
              onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
            />
          </label>

          <label className="setting-field">
            <span>{labels.cursor}</span>
            <select
              value={settings.cursorStyle}
              onChange={(event) =>
                onChange({ cursorStyle: event.target.value as SettingsV5['cursorStyle'] })
              }
            >
              <option value="block">Block</option>
              <option value="bar">Bar</option>
              <option value="underline">Underline</option>
            </select>
          </label>

          <label className="setting-field">
            <span>{labels.scrollback}</span>
            <select
              value={settings.scrollback}
              onChange={(event) => onChange({ scrollback: Number(event.target.value) })}
            >
              {[10_000, 50_000, 100_000, 250_000, 1_000_000].map((value) => (
                <option key={value} value={value}>
                  {value.toLocaleString()}
                </option>
              ))}
            </select>
          </label>

          {(
            [
              ['cursorBlink', labels.cursorBlink],
              ['bellSound', labels.bellSound],
              ['warnMultilinePaste', labels.pasteWarning],
              ['screenReaderMode', labels.screenReader],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="toggle-setting">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(event) => onChange({ [key]: event.target.checked })}
              />
            </label>
          ))}
        </div>
      </aside>
    </>
  );
}
