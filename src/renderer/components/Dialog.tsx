import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  children: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel(): void;
  onConfirm(): void;
}

export function Dialog({
  title,
  children,
  cancelLabel,
  confirmLabel,
  destructive,
  onCancel,
  onConfirm,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>('button, input, select'),
      ];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1) ?? first;
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
  }, [onCancel]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        ref={panelRef}
        className="modal-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="modal-title">{title}</h2>
        <div className="modal-content">{children}</div>
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? 'button danger' : 'button primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
