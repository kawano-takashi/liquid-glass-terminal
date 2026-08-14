import { forwardRef } from 'react';
import type { messages } from '../i18n';

type Labels = (typeof messages)[keyof typeof messages];

interface ContextMenuProps {
  x: number;
  y: number;
  labels: Labels;
  canCopy: boolean;
  onCopy(): void;
  onPaste(): void;
  onSelectAll(): void;
  onClear(): void;
}

export const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(function ContextMenu(
  { x, y, labels, canCopy, onCopy, onPaste, onSelectAll, onClear },
  ref,
) {
  return (
    <div ref={ref} className="context-menu" role="menu" style={{ left: x, top: y }}>
      <button type="button" role="menuitem" disabled={!canCopy} onClick={onCopy}>
        {labels.copy}
      </button>
      <button type="button" role="menuitem" onClick={onPaste}>
        {labels.paste}
      </button>
      <hr />
      <button type="button" role="menuitem" onClick={onSelectAll}>
        {labels.selectAll}
      </button>
      <button type="button" role="menuitem" onClick={onClear}>
        {labels.clearTerminal}
      </button>
    </div>
  );
});
