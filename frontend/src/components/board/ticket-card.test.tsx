import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TicketCard } from './ticket-card';
import { SelectionProvider } from '@/contexts/selection-context';
import type { TicketWithRelations } from '@/lib/types';

// dnd-kit requires a DndContext ancestor; tests don't exercise drag,
// so the simplest ancestor that satisfies the hook is fine.
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => undefined,
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

const MOCK_COLUMN = {
  id: 'col-1',
  projectId: 'proj-1',
  name: 'To Do',
  position: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
};

function makeTicket(overrides: Partial<TicketWithRelations> = {}): TicketWithRelations {
  return {
    id: 'tkt-1',
    number: 1,
    title: 'Test ticket',
    description: null,
    projectId: 'proj-1',
    statusColumnId: 'col-1',
    priority: 'HIGH',
    assigneeId: null,
    dueDate: null,
    reporterId: 'user-1',
    sortOrder: 0,
    blockedBy: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    assignee: null,
    reporter: {
      id: 'user-1',
      displayName: 'Alice',
      avatarUrl: null,
      email: 'alice@example.com',
    },
    statusColumn: MOCK_COLUMN,
    labels: [],
    ...overrides,
  };
}

const baseProps = {
  projectKey: 'TRAKK',
  onClick: () => undefined,
};

function renderCard(ui: React.ReactNode) {
  return render(<SelectionProvider>{ui}</SelectionProvider>);
}

describe('TicketCard — Blocked chip', () => {
  it('does NOT render the Blocked chip when blockedBy is false', () => {
    renderCard(<TicketCard {...baseProps} ticket={makeTicket({ blockedBy: false })} />);
    expect(screen.queryByTestId('ticket-blocked-badge')).toBeNull();
  });

  it('renders the Blocked chip when blockedBy is true', () => {
    renderCard(<TicketCard {...baseProps} ticket={makeTicket({ blockedBy: true })} />);
    const chip = screen.getByTestId('ticket-blocked-badge');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('Blocked');
    expect(chip).toHaveAttribute('title', 'This ticket is blocked');
    expect(chip).toHaveAttribute('aria-label', 'Blocked');
  });

  it('renders the Blocked chip even when labels are empty (wrapper condition)', () => {
    // Wrapper should appear when labels.length === 0 BUT blockedBy is true.
    renderCard(
      <TicketCard {...baseProps} ticket={makeTicket({ blockedBy: true, labels: [] })} />,
    );
    expect(screen.getByTestId('ticket-blocked-badge')).toBeInTheDocument();
  });

  it('renders both the Blocked chip and labels side-by-side when both are present', () => {
    const label = { id: 'lbl-1', name: 'bug', color: '#22c55e' };
    renderCard(
      <TicketCard
        {...baseProps}
        ticket={makeTicket({ blockedBy: true, labels: [label] })}
      />,
    );
    expect(screen.getByTestId('ticket-blocked-badge')).toBeInTheDocument();
    expect(screen.getByText('bug')).toBeInTheDocument();
  });
});

describe('TicketCard — selection checkbox', () => {
  it('is NOT rendered when userRole is VIEWER', () => {
    renderCard(
      <TicketCard
        {...baseProps}
        ticket={makeTicket()}
        userRole="VIEWER"
      />,
    );
    expect(screen.queryByTestId('ticket-select-checkbox')).toBeNull();
  });

  it('is rendered for non-VIEWER roles but hidden by default (group-hover opacity-0)', () => {
    renderCard(
      <TicketCard
        {...baseProps}
        ticket={makeTicket()}
        userRole="MEMBER"
      />,
    );
    const checkbox = screen.getByTestId('ticket-select-checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.className).toContain('opacity-0');
    expect(checkbox.className).toContain('group-hover:opacity-100');
  });
});

describe('TicketCard — priority tint', () => {
  it.each([
    ['URGENT', 'border-l-priority-urgent'],
    ['HIGH', 'border-l-priority-high'],
    ['MEDIUM', 'border-l-priority-medium'],
    ['LOW', 'border-l-priority-low'],
    ['NONE', 'border-l-priority-none'],
  ] as const)(
    'renders a colored left strip (%s) on the card root',
    (priority, expectedClass) => {
      renderCard(
        <TicketCard {...baseProps} ticket={makeTicket({ priority })} />,
      );
      const root = screen.getByRole('listitem');
      expect(root.className).toContain('border-l-4');
      expect(root.className).toContain(expectedClass);
    },
  );
});

// Offset-based fixture: makeTicket's default updatedAt is a 2024 date, which
// formatRelativeTime renders as an absolute date rather than a relative string.
function isoOffsetHours(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

describe('TicketCard — updated-time tooltip', () => {
  it('renders a relative-time label in the footer, keyboard-focusable', () => {
    renderCard(
      <TicketCard {...baseProps} ticket={makeTicket({ updatedAt: isoOffsetHours(2) })} />,
    );
    const label = screen.getByTestId('ticket-updated-label');
    expect(label).toHaveTextContent('2h ago');
    expect(label).toHaveAttribute('tabindex', '0');
  });

  it('renders nothing in the DOM while the tooltip is closed', () => {
    renderCard(
      <TicketCard {...baseProps} ticket={makeTicket({ updatedAt: isoOffsetHours(2) })} />,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on hover and closes on mouse leave', () => {
    renderCard(
      <TicketCard {...baseProps} ticket={makeTicket({ updatedAt: isoOffsetHours(2) })} />,
    );
    const label = screen.getByTestId('ticket-updated-label');
    fireEvent.mouseEnter(label);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(label);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on keyboard focus and closes on blur', () => {
    renderCard(
      <TicketCard {...baseProps} ticket={makeTicket({ updatedAt: isoOffsetHours(2) })} />,
    );
    const label = screen.getByTestId('ticket-updated-label');
    fireEvent.focus(label);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(label);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('dismisses on Escape', () => {
    renderCard(
      <TicketCard {...baseProps} ticket={makeTicket({ updatedAt: isoOffsetHours(2) })} />,
    );
    const label = screen.getByTestId('ticket-updated-label');
    fireEvent.focus(label);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(label, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows the absolute date with a clock time, not the relative label', () => {
    renderCard(
      <TicketCard {...baseProps} ticket={makeTicket({ updatedAt: isoOffsetHours(2) })} />,
    );
    const label = screen.getByTestId('ticket-updated-label');
    fireEvent.focus(label);
    const tooltip = screen.getByRole('tooltip');
    // Regex, not an exact string: the rendered value shifts with the timezone.
    expect(tooltip).toHaveTextContent(/[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{2}:\d{2}/);
    expect(tooltip.textContent).not.toBe('2h ago');
  });
});