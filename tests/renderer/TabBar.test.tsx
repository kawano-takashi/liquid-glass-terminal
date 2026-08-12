import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TabBar } from '../../src/renderer/components/TabBar';

const profile = { id: 'posix:zsh', label: 'Zsh', kind: 'zsh' as const };

describe('TabBar', () => {
  it('exposes accessible tabs and actions', () => {
    const activate = vi.fn();
    const close = vi.fn();
    const create = vi.fn();
    render(
      <TabBar
        tabs={[{ id: 'one', title: 'Zsh', profile, bell: false, exited: false }]}
        activeId="one"
        profiles={[profile]}
        labels={{ newTab: 'New tab', closeTab: 'Close tab', settings: 'Settings' }}
        onActivate={activate}
        onClose={close}
        onNew={create}
        onSettings={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: /Zsh/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /Zsh/ }));
    fireEvent.click(screen.getByRole('button', { name: 'New tab' }));
    fireEvent.click(screen.getByRole('button', { name: /Close tab/ }));
    expect(activate).toHaveBeenCalledWith('one');
    expect(create).toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith('one');
  });
});
