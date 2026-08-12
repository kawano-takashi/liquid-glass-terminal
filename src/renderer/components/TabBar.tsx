import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, Plus, Settings, X } from 'lucide-react';
import { useState } from 'react';
import type { ShellProfileDescriptor } from '../../shared/contracts';

export interface TabBarItem {
  id: string;
  title: string;
  profile: ShellProfileDescriptor;
  bell: boolean;
  exited: boolean;
}

interface TabBarProps {
  tabs: TabBarItem[];
  activeId?: string;
  profiles: ShellProfileDescriptor[];
  labels: {
    newTab: string;
    closeTab: string;
    settings: string;
  };
  onActivate(id: string): void;
  onClose(id: string): void;
  onNew(profileId?: string): void;
  onSettings(): void;
  onReorder(activeId: string, overId: string): void;
}

function SortableTab({
  tab,
  active,
  closeLabel,
  onActivate,
  onClose,
}: {
  tab: TabBarItem;
  active: boolean;
  closeLabel: string;
  onActivate(): void;
  onClose(): void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });
  return (
    <div
      ref={setNodeRef}
      className="tab-shell"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-dragging={isDragging}
      role="presentation"
    >
      <button
        type="button"
        className="tab-button"
        data-active={active}
        onClick={onActivate}
        {...attributes}
        {...listeners}
        role="tab"
        aria-selected={active}
      >
        <span className="tab-profile-dot" data-exited={tab.exited} />
        <span className="tab-title">{tab.title}</span>
        {tab.bell && <span className="tab-bell" aria-label="bell" />}
      </button>
      <button
        type="button"
        className="tab-close"
        aria-label={`${closeLabel}: ${tab.title}`}
        onClick={onClose}
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

export function TabBar({
  tabs,
  activeId,
  profiles,
  labels,
  onActivate,
  onClose,
  onNew,
  onSettings,
  onReorder,
}: TabBarProps) {
  const [profilesOpen, setProfilesOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dragEnd = (event: DragEndEvent) => {
    if (event.over && event.active.id !== event.over.id) {
      onReorder(String(event.active.id), String(event.over.id));
    }
  };

  return (
    <header className="titlebar">
      <div className="window-drag-region" aria-hidden="true" />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
        <SortableContext items={tabs.map((tab) => tab.id)} strategy={horizontalListSortingStrategy}>
          <div className="tab-list" role="tablist" aria-label="Terminal tabs">
            {tabs.map((tab) => (
              <SortableTab
                key={tab.id}
                tab={tab}
                active={activeId === tab.id}
                closeLabel={labels.closeTab}
                onActivate={() => onActivate(tab.id)}
                onClose={() => onClose(tab.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="new-tab-group">
        <button
          type="button"
          className="icon-button new-tab"
          aria-label={labels.newTab}
          onClick={() => onNew()}
        >
          <Plus size={17} />
        </button>
        <button
          type="button"
          className="icon-button profile-menu-toggle"
          aria-label={`${labels.newTab} menu`}
          aria-expanded={profilesOpen}
          onClick={() => setProfilesOpen((value) => !value)}
        >
          <ChevronDown size={12} />
        </button>
        {profilesOpen && (
          <div className="profile-menu" role="menu">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfilesOpen(false);
                  onNew(profile.id);
                }}
              >
                <span>{profile.label}</span>
                <small>{profile.kind}</small>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="titlebar-spacer" />
      <button
        type="button"
        className="icon-button settings-button"
        aria-label={labels.settings}
        onClick={onSettings}
      >
        <Settings size={16} />
      </button>
      <div className="window-controls-spacer" aria-hidden="true" />
    </header>
  );
}
