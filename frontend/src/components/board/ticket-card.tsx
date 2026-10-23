'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
  MoreHorizontal,
  User as UserIcon,
} from 'lucide-react';
import type { TicketWithRelations, Priority } from '@/lib/types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { DueDateBadge } from '@/components/tickets/DueDateBadge';
import { Tooltip } from '@/components/ui/tooltip';
import { useSelectionContext } from '@/contexts/selection-context';
import { cn, formatDateTime, formatRelativeTime } from '@/lib/utils';

const PRIORITY_BORDER: Record<Priority, string> = {
  URGENT: 'border-t-red-500',
  HIGH: 'border-t-orange-500',
  MEDIUM: 'border-t-yellow-500',
  LOW: 'border-t-blue-500',
  NONE: 'border-t-trakk-border',
};

const PRIORITY_TINT: Record<Priority, string> = {
  URGENT: 'border-l-4 border-l-priority-urgent',
  HIGH: 'border-l-4 border-l-priority-high',
  MEDIUM: 'border-l-4 border-l-priority-medium',
  LOW: 'border-l-4 border-l-priority-low',
  NONE: 'border-l-4 border-l-priority-none',
};

const PRIORITY_ICON: Record<Priority, React.ReactNode> = {
  URGENT: <AlertTriangle size={13} className="text-priority-urgent" />,
  HIGH: <ArrowUp size={13} className="text-priority-high" />,
  MEDIUM: <Minus size={13} className="text-priority-medium" />,
  LOW: <ArrowDown size={13} className="text-priority-low" />,
  NONE: <MoreHorizontal size={13} className="text-priority-none" />,
};

const PRIORITY_LABEL: Record<Priority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NONE: 'None',
};

interface TicketCardProps {
  ticket: TicketWithRelations;
  projectKey: string;
  onClick: () => void;
  overlay?: boolean;
  hideDragHandle?: boolean;
  userRole?: string;
}

export function TicketCard({
  ticket,
  projectKey,
  onClick,
  overlay = false,
  hideDragHandle = false,
  userRole,
}: TicketCardProps) {
  const selection = useSelectionContext();
  const showCheckbox = userRole !== 'VIEWER';
  const checked = selection.isSelected(ticket.number);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.id, disabled: overlay });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const ticketId = `${projectKey}-${ticket.number}`;

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? undefined : style}
      onClick={onClick}
      role="listitem"
      className={cn(
        'group relative cursor-pointer rounded-card border border-trakk-border border-t-2 bg-trakk-surface',
        'px-4 py-3.5 shadow-card transition-all duration-200 ease-ace-enter',
        'hover:border-[var(--trakk-teal-border)] hover:shadow-glow-subtle',
        PRIORITY_BORDER[ticket.priority],
        PRIORITY_TINT[ticket.priority],
        overlay && 'scale-[1.02] shadow-glow opacity-90',
      )}
    >
      {showCheckbox && (
        <button
          type="button"
          aria-label={checked ? 'Deselect ticket' : 'Select ticket'}
          aria-pressed={checked}
          data-testid="ticket-select-checkbox"
          data-selected={checked}
          data-cap-reached={selection.capReached}
          onClick={(e) => {
            e.stopPropagation();
            selection.toggleSelect(ticket.number);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            'absolute left-2 top-2 z-10 flex h-4 w-4 items-center justify-center rounded-sm border transition-opacity',
            checked
              ? 'border-trakk-teal bg-trakk-teal text-trakk-bg opacity-100'
              : 'border-trakk-border bg-trakk-surface/80 text-transparent opacity-0 group-hover:opacity-100',
            selection.hasSelection && 'opacity-100',
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {/* Top row: ticket ID + drag handle */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs tracking-wider text-trakk-teal">
          {ticketId}
        </span>
        {!overlay && !hideDragHandle && (
          <button
            type="button"
            aria-label="Drag to reorder"
            className={cn(
              'text-trakk-text-secondary opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing',
              !selection.hasSelection && 'cursor-grab',
            )}
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Title */}
      <p className="mt-1.5 font-body font-semibold text-[15px] leading-snug text-trakk-text">
        {ticket.title}
      </p>

      {/* Labels + Blocked chip */}
      {(ticket.labels.length > 0 || ticket.blockedBy) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ticket.blockedBy && (
            <span
              title="This ticket is blocked"
              aria-label="Blocked"
              data-testid="ticket-blocked-badge"
              className="inline-flex items-center rounded-badge border px-2 py-0.5 font-mono text-[10px] tracking-[1px] uppercase"
              style={{
                color: 'var(--trakk-priority-urgent, #ef4444)',
                borderColor: 'rgba(239, 68, 68, 0.25)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
              }}
            >
              Blocked
            </span>
          )}
          {ticket.labels.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center rounded-badge border px-2 py-0.5 font-mono text-[10px] tracking-[1px] uppercase"
              style={{
                color: label.color,
                borderColor: `${label.color}40`,
                backgroundColor: `${label.color}1A`,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Footer: priority + due date + assignee */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[2px] uppercase text-trakk-text-secondary">
            {PRIORITY_ICON[ticket.priority]}
            {PRIORITY_LABEL[ticket.priority]}
          </span>
          <DueDateBadge dueDate={ticket.dueDate} compact />
          <Tooltip content={formatDateTime(ticket.updatedAt)}>
            <span
              tabIndex={0}
              className="font-mono text-[10px] tracking-[1px] uppercase text-trakk-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--trakk-teal)]"
              data-testid="ticket-updated-label"
            >
              {formatRelativeTime(ticket.updatedAt)}
            </span>
          </Tooltip>
        </div>
        {ticket.assignee ? (
          <Avatar className="h-6 w-6">
            {ticket.assignee.avatarUrl && (
              <AvatarImage
                src={ticket.assignee.avatarUrl}
                alt={ticket.assignee.displayName}
              />
            )}
            <AvatarFallback>
              {ticket.assignee.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-trakk-border text-trakk-text-secondary">
            <UserIcon size={12} />
          </span>
        )}
      </div>
    </div>
  );
}
