import { RotateCcw, X } from 'lucide-react';
import { forwardRef, useEffect, useRef } from 'react';
import {
  GLASS_PRESETS,
  SETTINGS_CONSTRAINTS,
  frostBlurDip,
  type Settings,
} from '../../../contracts/generated/protocol';
import { matchingGlassPreset, withGlassPreset, type NamedGlassPreset } from '../appearance';
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

interface RangeSettingProps {
  label: string;
  value: number;
  output: string;
  minimum: number;
  maximum: number;
  step: number;
  disabled: boolean;
  onChange(value: number): void;
}

function RangeSetting({
  label,
  value,
  output,
  minimum,
  maximum,
  step,
  disabled,
  onChange,
}: RangeSettingProps) {
  return (
    <label className="range-field">
      <span>{label}</span>
      <output>{output}</output>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={output}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export const SettingsDrawer = forwardRef<HTMLElement, SettingsDrawerProps>(function SettingsDrawer(
  { open, value, labels, onChange, onApply, onCancel, pending },
  ref,
) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const selectedPreset = matchingGlassPreset(value.glass);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => closeButton.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const updateGlass = (patch: Partial<Settings['glass']>) => {
    onChange({ ...value, glass: { ...value.glass, ...patch } });
  };

  return (
    <aside
      ref={ref}
      className="settings-drawer"
      data-open={open}
      data-glass-id={open ? 'settings' : undefined}
      data-glass-radius="20"
      aria-hidden={!open}
      aria-busy={pending}
      aria-label={labels.settings}
      inert={!open}
    >
      <div className="settings-drawer-panel">
        <header>
          <div>
            <span className="eyebrow">Liquid Glass</span>
            <h2>{labels.settings}</h2>
          </div>
          <button
            ref={closeButton}
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
          <section className="settings-section" aria-labelledby="glass-settings-heading">
            <h3 id="glass-settings-heading">{labels.glass}</h3>

            <label className="toggle-field">
              <span>{labels.glassEnabled}</span>
              <input
                type="checkbox"
                checked={value.glass.enabled}
                disabled={pending}
                onChange={(event) => updateGlass({ enabled: event.target.checked })}
              />
            </label>

            <fieldset>
              <legend>{labels.preset}</legend>
              <div className="segmented material-segmented">
                {(Object.keys(GLASS_PRESETS) as NamedGlassPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    data-active={selectedPreset === preset}
                    disabled={pending}
                    onClick={() => onChange(withGlassPreset(value, preset))}
                  >
                    {labels[preset]}
                  </button>
                ))}
                <span
                  className="segment-status"
                  data-active={selectedPreset === 'custom'}
                  aria-current={selectedPreset === 'custom' ? 'true' : undefined}
                >
                  {labels.custom}
                </span>
              </div>
            </fieldset>

            <RangeSetting
              label={labels.frostThickness}
              value={value.glass.frostThickness}
              output={`${value.glass.frostThickness} · ${frostBlurDip(value.glass.frostThickness)} DIP`}
              minimum={SETTINGS_CONSTRAINTS.frostThickness.minimum}
              maximum={SETTINGS_CONSTRAINTS.frostThickness.maximum}
              step={SETTINGS_CONSTRAINTS.frostThickness.step}
              disabled={pending}
              onChange={(frostThickness) => updateGlass({ frostThickness })}
            />
            <RangeSetting
              label={labels.opacity}
              value={value.glass.opacity}
              output={`${value.glass.opacity}%`}
              minimum={SETTINGS_CONSTRAINTS.opacity.minimum}
              maximum={SETTINGS_CONSTRAINTS.opacity.maximum}
              step={SETTINGS_CONSTRAINTS.opacity.step}
              disabled={pending}
              onChange={(opacity) => updateGlass({ opacity })}
            />
            <RangeSetting
              label={labels.tone}
              value={value.glass.tone}
              output={`${value.glass.tone}`}
              minimum={SETTINGS_CONSTRAINTS.tone.minimum}
              maximum={SETTINGS_CONSTRAINTS.tone.maximum}
              step={SETTINGS_CONSTRAINTS.tone.step}
              disabled={pending}
              onChange={(tone) => updateGlass({ tone })}
            />
            <RangeSetting
              label={labels.grain}
              value={value.glass.grain}
              output={`${value.glass.grain}%`}
              minimum={SETTINGS_CONSTRAINTS.grain.minimum}
              maximum={SETTINGS_CONSTRAINTS.grain.maximum}
              step={SETTINGS_CONSTRAINTS.grain.step}
              disabled={pending}
              onChange={(grain) => updateGlass({ grain })}
            />

            <button
              type="button"
              className="button reset-button"
              disabled={pending}
              onClick={() =>
                onChange({
                  ...value,
                  glass: { enabled: value.glass.enabled, ...GLASS_PRESETS.regular },
                })
              }
            >
              <RotateCcw size={15} />
              {labels.resetGlass}
            </button>
          </section>

          <section className="settings-section" aria-labelledby="foreground-settings-heading">
            <h3 id="foreground-settings-heading">{labels.foreground}</h3>
            <fieldset>
              <legend className="visually-hidden">{labels.foreground}</legend>
              <div className="segmented">
                {(['auto', 'light', 'dark'] as const).map((foreground) => (
                  <button
                    key={foreground}
                    type="button"
                    data-active={value.foreground === foreground}
                    disabled={pending}
                    onClick={() => onChange({ ...value, foreground })}
                  >
                    {labels[foreground]}
                  </button>
                ))}
              </div>
            </fieldset>
          </section>

          <section className="settings-section" aria-labelledby="interface-settings-heading">
            <h3 id="interface-settings-heading">{labels.interface}</h3>
            <label className="toggle-field">
              <span>{labels.animations}</span>
              <input
                type="checkbox"
                checked={value.animations}
                disabled={pending}
                onChange={(event) => onChange({ ...value, animations: event.target.checked })}
              />
            </label>

            <RangeSetting
              label={labels.uiScale}
              value={value.uiScale}
              output={`${value.uiScale}%`}
              minimum={SETTINGS_CONSTRAINTS.uiScale.minimum}
              maximum={SETTINGS_CONSTRAINTS.uiScale.maximum}
              step={SETTINGS_CONSTRAINTS.uiScale.step}
              disabled={pending}
              onChange={(uiScale) => onChange({ ...value, uiScale })}
            />

            <label className="setting-field">
              <span>{labels.language}</span>
              <select
                value={value.locale}
                disabled={pending}
                onChange={(event) =>
                  onChange({ ...value, locale: event.target.value as Settings['locale'] })
                }
              >
                <option value="system">{labels.system}</option>
                <option value="en">{labels.english}</option>
                <option value="ja">{labels.japanese}</option>
              </select>
            </label>
          </section>
        </div>

        <footer>
          <button type="button" className="button ghost" onClick={onCancel} disabled={pending}>
            {labels.cancel}
          </button>
          <button type="button" className="button primary" onClick={onApply} disabled={pending}>
            {labels.apply}
          </button>
        </footer>
      </div>
    </aside>
  );
});
