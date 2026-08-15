import { forwardRef, useEffect, useRef, type KeyboardEvent } from 'react';
import type { messages } from '../i18n';

type Labels = (typeof messages)[keyof typeof messages];

interface PasteDialogProps {
  text: string;
  labels: Labels;
  onAccept(): void;
  onCancel(): void;
}

export const PasteDialog = forwardRef<HTMLElement, PasteDialogProps>(function PasteDialog(
  { text, labels, onAccept, onCancel },
  forwardedRef,
) {
  const dialog = useRef<HTMLElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButton.current?.focus();
  }, []);

  const setDialogRef = (element: HTMLElement | null) => {
    dialog.current = element;
    if (typeof forwardedRef === 'function') forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  };

  const containFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab' || !dialog.current) return;
    const controls = Array.from(
      dialog.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        ref={setDialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-title"
        onKeyDown={containFocus}
      >
        <h2 id="paste-title">{labels.pasteTitle}</h2>
        <p>{labels.pasteBody}</p>
        <pre tabIndex={0}>{text.slice(0, 16_384)}</pre>
        <footer>
          <button ref={cancelButton} type="button" className="button ghost" onClick={onCancel}>
            {labels.cancel}
          </button>
          <button type="button" className="button primary" onClick={onAccept}>
            {labels.paste}
          </button>
        </footer>
      </section>
    </div>
  );
});
