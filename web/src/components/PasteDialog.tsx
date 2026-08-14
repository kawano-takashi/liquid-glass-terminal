import type { messages } from '../i18n';

type Labels = (typeof messages)[keyof typeof messages];

interface PasteDialogProps {
  text: string;
  labels: Labels;
  onAccept(): void;
  onCancel(): void;
}

export function PasteDialog({ text, labels, onAccept, onCancel }: PasteDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="paste-title">
        <h2 id="paste-title">{labels.pasteTitle}</h2>
        <p>{labels.pasteBody}</p>
        <pre>{text.slice(0, 16_384)}</pre>
        <footer>
          <button type="button" className="button ghost" onClick={onCancel}>
            {labels.cancel}
          </button>
          <button type="button" className="button primary" onClick={onAccept}>
            {labels.paste}
          </button>
        </footer>
      </section>
    </div>
  );
}
