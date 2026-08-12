import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { SettingsPatch, SettingsV1, ShellProfileDescriptor } from '../../shared/contracts';

interface SettingsLabels {
  settings: string;
  close: string;
  theme: string;
  system: string;
  light: string;
  dark: string;
  glass: string;
  clearGlass: string;
  balanced: string;
  dense: string;
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
  settings: SettingsV1;
  profiles: ShellProfileDescriptor[];
  labels: SettingsLabels;
  onClose(): void;
  onChange(patch: SettingsPatch): void;
}

export function SettingsDrawer({
  open,
  settings,
  profiles,
  labels,
  onClose,
  onChange,
}: SettingsDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);

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
              onChange={(event) => onChange({ locale: event.target.value as SettingsV1['locale'] })}
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

          <fieldset className="segmented-setting">
            <legend>{labels.glass}</legend>
            <div className="segmented-control">
              {(['clear', 'balanced', 'dense'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  data-active={settings.glass === value}
                  onClick={() => onChange({ glass: value })}
                >
                  {value === 'clear'
                    ? labels.clearGlass
                    : value === 'balanced'
                      ? labels.balanced
                      : labels.dense}
                </button>
              ))}
            </div>
          </fieldset>

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
                onChange({ cursorStyle: event.target.value as SettingsV1['cursorStyle'] })
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
