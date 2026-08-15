import { forwardRef, useEffect, useRef, type KeyboardEvent } from 'react';
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
  forwardedRef,
) {
  const menu = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, []);

  const setMenuRef = (element: HTMLDivElement | null) => {
    menu.current = element;
    if (typeof forwardedRef === 'function') forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  };

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !menu.current) return;
    const items = Array.from(
      menu.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    );
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Home') items[0].focus();
    else if (event.key === 'End') items[items.length - 1].focus();
    else if (event.key === 'ArrowDown') items[(current + 1 + items.length) % items.length].focus();
    else items[(current - 1 + items.length) % items.length].focus();
  };

  return (
    <div
      ref={setMenuRef}
      className="context-menu"
      role="menu"
      style={{ left: x, top: y }}
      onKeyDown={moveFocus}
    >
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
