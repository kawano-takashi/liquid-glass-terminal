import { fireEvent, render, screen } from '@testing-library/react';
import { PasteDialog } from '../../web/src/components/PasteDialog';
import { WindowChrome } from '../../web/src/components/WindowChrome';
import { messages } from '../../web/src/i18n';
import { describe, expect, it, vi } from 'vitest';

describe('Glass UI surfaces', () => {
  it('keeps the real settings action outside the draggable Chrome region', () => {
    const openSettings = vi.fn();
    const { container } = render(
      <WindowChrome
        accepted
        active
        appearance="glass"
        compositionMode
        labels={messages.en}
        onOpenSettings={openSettings}
      />,
    );

    expect(container.querySelector('.window-chrome')).toHaveAttribute(
      'data-native-controls',
      'true',
    );
    expect(screen.getByText('Terminal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(openSettings).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('reports compact Solid and Safe fallback status surfaces', () => {
    const { rerender } = render(
      <WindowChrome
        accepted
        active={false}
        appearance="solid"
        appearanceReason="user-disabled"
        compositionMode
        labels={messages.en}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByRole('status', { name: messages.en.glassDisabled })).toHaveTextContent(
      'Solid',
    );

    rerender(
      <WindowChrome
        accepted
        active
        appearance="safe"
        compositionMode={false}
        labels={messages.en}
        onOpenSettings={vi.fn()}
      />,
    );
    expect(screen.getByRole('status', { name: messages.en.safeMode })).toHaveTextContent('Safe');
  });

  it('makes multiline paste a focus-contained native Glass modal', () => {
    const cancel = vi.fn();
    render(
      <PasteDialog
        text={'first\nsecond'}
        labels={messages.en}
        onAccept={vi.fn()}
        onCancel={cancel}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: messages.en.pasteTitle });
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    const pasteButton = screen.getByRole('button', { name: 'Paste' });
    expect(cancelButton).toHaveFocus();

    pasteButton.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog.querySelector('pre')).toHaveFocus();
    fireEvent.click(cancelButton);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
