import { Settings as SettingsIcon } from 'lucide-react';
import type { AppearanceState } from '../../../contracts/generated/protocol';
import type { messages } from '../i18n';

type Labels = (typeof messages)[keyof typeof messages];

interface WindowChromeProps {
  accepted: boolean;
  active: boolean;
  appearance: AppearanceState;
  appearanceReason?: string;
  compositionMode: boolean;
  labels: Labels;
  onOpenSettings(): void;
}

export function WindowChrome({
  accepted,
  active,
  appearance,
  appearanceReason,
  compositionMode,
  labels,
  onOpenSettings,
}: WindowChromeProps) {
  const statusLabel = appearance === 'safe' ? labels.safeStatus : labels.solidStatus;
  const statusDetail =
    appearance === 'safe'
      ? labels.safeMode
      : appearanceReason === 'user-disabled'
        ? labels.glassDisabled
        : labels.policyFallback;

  return (
    <header
      className="window-chrome"
      data-active={active}
      data-native-controls={compositionMode}
      aria-label={labels.appName}
    >
      {accepted && appearance !== 'glass' ? (
        <div
          className="appearance-status"
          data-glass-id="appearance-status"
          data-glass-radius="9"
          role="status"
          aria-label={statusDetail}
        >
          <span aria-hidden="true">{statusLabel}</span>
        </div>
      ) : null}

      <div className="window-title" aria-hidden="true">
        {labels.windowTitle}
      </div>

      <button
        className="settings-trigger"
        type="button"
        aria-label={labels.settings}
        onClick={onOpenSettings}
        disabled={!accepted}
      >
        <SettingsIcon size={17} />
      </button>
    </header>
  );
}
