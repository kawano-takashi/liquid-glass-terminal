import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type {
  SettingsPatch,
  SettingsV2,
  ShellProfileDescriptor,
  WindowAppearance,
} from '../../shared/contracts';
import { GLASS_OPACITY_MAX, GLASS_OPACITY_MIN } from '../../shared/settings';

interface SettingsLabels {
  settings: string;
  close: string;
  theme: string;
  system: string;
  light: string;
  dark: string;
  glassOpacity: string;
  glassUnavailableAccessibility: string;
  glassUnavailableUnsupported: string;
  glassUnavailableSystemFallback: string;
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
  settings: SettingsV2;
  windowAppearance: WindowAppearance;
  glassOpacity: number;
  profiles: ShellProfileDescriptor[];
  labels: SettingsLabels;
  onClose(): void;
  onChange(patch: SettingsPatch): void;
  onGlassPreview(opacity: number): void;
  onGlassCommit(opacity?: number): void;
}

export function SettingsDrawer({
  open,
  settings,
  windowAppearance,
  glassOpacity,
  profiles,
  labels,
  onClose,
  onChange,
  onGlassPreview,
  onGlassCommit,
}: SettingsDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const glassDisabled = windowAppearance.glassAvailability !== 'active';
  const glassDisabledReason =
    windowAppearance.glassAvailability === 'accessibility-disabled'
      ? labels.glassUnavailableAccessibility
      : windowAppearance.glassAvailability === 'system-fallback'
        ? labels.glassUnavailableSystemFallback
        : windowAppearance.glassAvailability === 'unsupported'
          ? labels.glassUnavailableUnsupported
          : undefined;

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
              onChange={(event) => onChange({ locale: event.target.value as SettingsV2['locale'] })}
            >
              <option value="system">{labels.system}</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </label>

          <fieldset className="segmented-setting">
            <legend>{labels.theme}</legend>
            <div className="segmented-control">
              {(['system', 'light', 'dark'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  data-active={settings.theme === value}
                  onClick={() => onChange({ theme: value })}
                >
                  {value === 'system'
                    ? labels.system
                    : value === 'light'
                      ? labels.light
                      : labels.dark}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="setting-field range-field" data-disabled={glassDisabled}>
            <span>{labels.glassOpacity}</span>
            <output>{glassOpacity}%</output>
            <input
              type="range"
              min={GLASS_OPACITY_MIN}
              max={GLASS_OPACITY_MAX}
              step="1"
              value={glassOpacity}
              disabled={glassDisabled}
              aria-label={labels.glassOpacity}
              aria-describedby={glassDisabledReason ? 'glass-opacity-reason' : undefined}
              onChange={(event) => onGlassPreview(Number(event.target.value))}
              onPointerUp={() => onGlassCommit()}
              onPointerCancel={() => onGlassCommit()}
              onKeyUp={() => onGlassCommit()}
              onBlur={() => onGlassCommit()}
            />
            {glassDisabledReason && (
              <small id="glass-opacity-reason" className="setting-reason">
                {glassDisabledReason}
              </small>
            )}
          </label>

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
                onChange({ cursorStyle: event.target.value as SettingsV2['cursorStyle'] })
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
