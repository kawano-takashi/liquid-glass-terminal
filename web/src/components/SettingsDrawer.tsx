import { X } from 'lucide-react';
import { forwardRef } from 'react';
import type { Settings } from '../../../contracts/generated/protocol';
import type { messages } from '../i18n';

type Labels = (typeof messages)[keyof typeof messages];

interface SettingsDrawerProps {
  open: boolean;
  value: Settings;
  labels: Labels;
  onChange(value: Settings): void;
  onApply(): void;
  onCancel(): void;
  pending: boolean;
}

export const SettingsDrawer = forwardRef<HTMLElement, SettingsDrawerProps>(function SettingsDrawer(
  { open, value, labels, onChange, onApply, onCancel, pending },
  ref,
) {
  return (
    <aside
      ref={ref}
      className="settings-drawer"
      data-open={open}
      aria-hidden={!open}
      aria-busy={pending}
      inert={!open}
    >
      <header>
        <div>
          <span className="eyebrow">Liquid Glass</span>
          <h2>{labels.settings}</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label={labels.close}
          onClick={onCancel}
          disabled={pending}
        >
          <X size={17} />
        </button>
      </header>
      <div className="settings-scroll">
        <label className="toggle-field">
          <span>{labels.glassEnabled}</span>
          <input
            type="checkbox"
            checked={value.glass.enabled}
            onChange={(event) =>
              onChange({ ...value, glass: { ...value.glass, enabled: event.target.checked } })
            }
          />
        </label>

        <fieldset>
          <legend>{labels.preset}</legend>
          <div className="segmented">
            {(['clear', 'regular', 'dense'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                data-active={value.glass.preset === preset}
                onClick={() => onChange({ ...value, glass: { ...value.glass, preset } })}
              >
                {labels[preset]}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="setting-field">
          <span>{labels.tint}</span>
          <div className="color-field">
            <input
              type="color"
              value={value.glass.tint}
              onChange={(event) =>
                onChange({ ...value, glass: { ...value.glass, tint: event.target.value } })
              }
            />
            <input
              value={value.glass.tint}
              maxLength={7}
              spellCheck={false}
              onChange={(event) => {
                if (/^#[0-9A-Fa-f]{6}$/.test(event.target.value)) {
                  onChange({ ...value, glass: { ...value.glass, tint: event.target.value } });
                }
              }}
            />
          </div>
        </label>

        <fieldset>
          <legend>{labels.foreground}</legend>
          <div className="segmented">
            {(['auto', 'light', 'dark'] as const).map((foreground) => (
              <button
                key={foreground}
                type="button"
                data-active={value.foreground === foreground}
                onClick={() => onChange({ ...value, foreground })}
              >
                {labels[foreground]}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="setting-field">
          <span>{labels.language}</span>
          <select
            value={value.locale}
            onChange={(event) =>
              onChange({ ...value, locale: event.target.value as Settings['locale'] })
            }
          >
            <option value="system">{labels.system}</option>
            <option value="en">{labels.english}</option>
            <option value="ja">{labels.japanese}</option>
          </select>
        </label>

        <label className="toggle-field">
          <span>{labels.animations}</span>
          <input
            type="checkbox"
            checked={value.animations}
            onChange={(event) => onChange({ ...value, animations: event.target.checked })}
          />
        </label>

        <label className="range-field">
          <span>{labels.uiScale}</span>
          <output>{value.uiScale}%</output>
          <input
            type="range"
            min="80"
            max="200"
            step="10"
            value={value.uiScale}
            onChange={(event) => onChange({ ...value, uiScale: Number(event.target.value) })}
          />
        </label>
      </div>
      <footer>
        <button type="button" className="button ghost" onClick={onCancel} disabled={pending}>
          {labels.cancel}
        </button>
        <button type="button" className="button primary" onClick={onApply} disabled={pending}>
          {labels.apply}
        </button>
      </footer>
    </aside>
  );
});
