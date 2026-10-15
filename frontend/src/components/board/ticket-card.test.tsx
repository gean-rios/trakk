import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

describe('TicketCard — updated-at tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T22:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the trigger label and mounts the panel in the closed state', () => {
    renderCard(
      <TicketCard
        {...baseProps}
        ticket={makeTicket({ updatedAt: '2026-10-15T20:00:00Z' })}
      />,
    );
    const label = screen.getByTestId('ticket-updated-at');
    expect(label).toBeInTheDocument();
    expect(label.textContent).toBe('2h ago');

    const panel = screen.getByTestId('ticket-updated-at-tooltip');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel.className).toContain('opacity-0');
    expect(panel.className).toContain('invisible');
    expect(panel.textContent).not.toBe('');
  });

  it('opens the tooltip on keyboard focus', () => {
    renderCard(
      <TicketCard
        {...baseProps}
        ticket={makeTicket({ updatedAt: '2026-10-15T20:00:00Z' })}
      />,
    );
    const label = screen.getByTestId('ticket-updated-at');
    // fireEvent.focus dispatches React's onFocus; jsdom does not move
    // document.activeElement for non-form focus, so we follow up with
    // the DOM .focus() (wrapped in act) to verify the label is focusable
    // and the onFocus handler wired up (React re-renders synchronously here).
    fireEvent.focus(label);
    act(() => { label.focus(); });
    expect(document.activeElement).toBe(label);

    const panel = screen.getByTestId('ticket-updated-at-tooltip');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    expect(panel.className).toContain('opacity-100');
    expect(panel.className).toContain('visible');
  });

  it('opens the tooltip on mouseEnter', () => {
    renderCard(
      <TicketCard
        {...baseProps}
        ticket={makeTicket({ updatedAt: '2026-10-15T20:00:00Z' })}
      />,
    );
    const label = screen.getByTestId('ticket-updated-at');
    fireEvent.mouseEnter(label);

    const panel = screen.getByTestId('ticket-updated-at-tooltip');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    expect(panel.className).toContain('opacity-100');
    expect(panel.className).toContain('visible');
  });

  it('closes the tooltip on mouseLeave, blur, and Escape (with focus returned on Escape)', () => {
    renderCard(
      <TicketCard
        {...baseProps}
        ticket={makeTicket({ updatedAt: '2026-10-15T20:00:00Z' })}
      />,
    );
    const label = screen.getByTestId('ticket-updated-at');
    const panel = screen.getByTestId('ticket-updated-at-tooltip');

    // mouseLeave closes after mouseEnter open
    fireEvent.mouseEnter(label);
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    fireEvent.mouseLeave(label);
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel.className).toContain('opacity-0');

    // blur closes after focus open
    fireEvent.focus(label);
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    fireEvent.blur(label);
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel.className).toContain('opacity-0');

    // Escape closes AND returns focus to the trigger
    fireEvent.focus(label);
    act(() => { label.focus(); });
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    fireEvent.keyDown(label, { key: 'Escape' });
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel.className).toContain('opacity-0');
    expect(document.activeElement).toBe(label);
  });

  it('links trigger and panel via aria-describedby ↔ id with the right roles', () => {
    renderCard(
      <TicketCard
        {...baseProps}
        ticket={makeTicket({ updatedAt: '2026-10-15T20:00:00Z' })}
      />,
    );
    const label = screen.getByTestId('ticket-updated-at');
    const panel = screen.getByTestId('ticket-updated-at-tooltip');
    expect(label.getAttribute('aria-describedby')).toBe(panel.id);
    expect(panel.id).toBe(label.getAttribute('aria-describedby'));
    expect(panel).toHaveAttribute('role', 'tooltip');
    expect(label).toHaveAttribute('role', 'button');
  });

  it('renders nothing for the tooltip group when updatedAt is missing, empty, or unparseable', () => {
    const { rerender } = renderCard(
      <TicketCard
        {...baseProps}
        ticket={makeTicket({ updatedAt: '' })}
      />,
    );
    expect(screen.queryByTestId('ticket-updated-at')).toBeNull();
    expect(screen.queryByTestId('ticket-updated-at-tooltip')).toBeNull();

    rerender(
      <SelectionProvider>
        <TicketCard
          {...baseProps}
          ticket={makeTicket({ updatedAt: 'not-a-date' })}
        />
      </SelectionProvider>,
    );
    expect(screen.queryByTestId('ticket-updated-at')).toBeNull();
    expect(screen.queryByTestId('ticket-updated-at-tooltip')).toBeNull();

    rerender(
      <SelectionProvider>
        <TicketCard
          {...baseProps}
          ticket={makeTicket({ updatedAt: undefined as unknown as string })}
        />
      </SelectionProvider>,
    );
    expect(screen.queryByTestId('ticket-updated-at')).toBeNull();
    expect(screen.queryByTestId('ticket-updated-at-tooltip')).toBeNull();
  });

  it('does NOT propagate click or pointerDown on the trigger to the card root', () => {
    const onClick = vi.fn();
    renderCard(
      <TicketCard
        {...baseProps}
        onClick={onClick}
        ticket={makeTicket({ updatedAt: '2026-10-15T20:00:00Z' })}
      />,
    );
    const label = screen.getByTestId('ticket-updated-at');

    fireEvent.pointerDown(label);
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.click(label);
    expect(onClick).not.toHaveBeenCalled();

    // Positive control: clicking the card root DOES propagate.
    fireEvent.click(screen.getByRole('listitem'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders the tooltip panel text as the absolute date/time string', () => {
    const updatedAt = '2026-10-15T20:00:00Z';
    renderCard(
      <TicketCard
        {...baseProps}
        ticket={makeTicket({ updatedAt })}
      />,
    );
    const expected = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(updatedAt));
    const panel = screen.getByTestId('ticket-updated-at-tooltip');
    expect(panel.textContent).toBe(expected);
  });
});