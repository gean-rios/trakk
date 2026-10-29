import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mocks must come before the component import.

// Stub Radix Dialog & Sheet primitives since they rely on a portal.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="sheet-root">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-content">{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <h1>{children}</h1>
  ),
  SheetDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  SheetClose: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}));

// Stub all the underlying hooks so the sheet renders without a backend.
const ticketDetailMock = vi.fn();
vi.mock('@/hooks/use-ticket-detail', () => ({
  useTicketDetail: () => ticketDetailMock(),
}));
function setTicketDetail(overrides: Partial<{
  attachments: ReturnType<typeof makeAttachment>[];
}> = {}) {
  ticketDetailMock.mockReturnValue({
    ticket: {
      id: 't1',
      number: 1,
      title: 'Sample ticket',
      status: 'TODO',
      priority: 'MEDIUM',
      labels: [],
      assignee: null,
      reporter: { id: 'u1', displayName: 'Reporter User', avatarUrl: 'https://example.com/reporter.png' },
      description: null,
      comments: [],
      links: [],
      activityLog: [],
      ...overrides,
    },
    loading: false,
    error: null,
    updateTicket: vi.fn(),
    addLabel: vi.fn(),
    removeLabel: vi.fn(),
    deleteTicket: vi.fn(),
    refetch: vi.fn(),
  });
}
setTicketDetail();
beforeEach(() => {
  // Reset the default return value — vi.clearAllMocks (in the file-level
  // beforeEach) wipes the impl, so the mock would return undefined here.
  setTicketDetail();
});

vi.mock('@/hooks/use-tickets', () => ({
  useTickets: () => ({
    tickets: [],
    columns: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
    createTicket: vi.fn(),
    updateTicket: vi.fn(),
    deleteTicket: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-columns', () => ({
  useColumns: () => ({ columns: [], loading: false, error: null }),
}));

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({ members: [], loading: false, error: null }),
}));

vi.mock('@/hooks/use-labels', () => ({
  useLabels: () => ({ labels: [], loading: false, error: null }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Test User', email: 't@example.com' },
    loading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/use-comments', () => ({
  useComments: () => ({
    comments: [],
    loading: false,
    error: null,
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-links', () => ({
  useLinks: () => ({
    links: [],
    loading: false,
    error: null,
    createLink: vi.fn(),
    deleteLink: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-search', () => ({
  useSearch: () => ({
    query: '',
    setQuery: vi.fn(),
    results: { tickets: [], members: [], labels: [] },
    loading: false,
  }),
}));

vi.mock('@/hooks/use-project-events', () => ({
  useProjectEvents: () => ({ connected: true, events: [] }),
}));

const useAttachmentsMock = vi.fn();
const removeAttachmentMock = vi.fn();
const uploadAttachmentMock = vi.fn();
const DEFAULT_ATTACHMENTS_HOOK_RESULT = {
  attachments: [],
  loading: false,
  error: null,
  remove: removeAttachmentMock,
  upload: uploadAttachmentMock,
};
vi.mock('@/hooks/use-attachments', () => ({
  useAttachments: (
    projectId: string,
    ticketNumber: number,
    enabled: boolean,
  ) =>
    useAttachmentsMock(projectId, ticketNumber, enabled) ??
    DEFAULT_ATTACHMENTS_HOOK_RESULT,
}));
useAttachmentsMock.mockReturnValue(DEFAULT_ATTACHMENTS_HOOK_RESULT);
removeAttachmentMock.mockResolvedValue(undefined);
uploadAttachmentMock.mockResolvedValue(undefined);

vi.mock('@/components/tickets/CommentThread', () => ({
  CommentThread: () => null,
}));

vi.mock('@/components/tickets/delete-ticket-dialog', () => ({
  DeleteTicketDialog: () => null,
}));

// Stub the DropdownMenu primitives so we don't depend on Radix portals.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu-root">{children}</div>
  ),
  DropdownMenuTrigger: ({
    children,
    asChild: _asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div data-testid="dropdown-menu-trigger">{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu-content">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    'data-testid': testId,
  }: {
    children: React.ReactNode;
    'data-testid'?: string;
  }) => <div data-testid={testId}>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

// Stub sonner so the toast calls can be asserted instead of rendering a
// real toaster.
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { TicketDetailSheet } from './ticket-detail-sheet';
import { toast } from 'sonner';

const baseProps = {
  projectId: 'proj-1',
  projectKey: 'TRAKK',
  ticketNumber: 1,
  open: true,
  onOpenChange: vi.fn(),
};

describe('TicketDetailSheet — Delete menu visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // The trigger button is only rendered when canEdit === true, which means
  // userRole !== 'VIEWER'. The Delete menu item lives inside that trigger.
  const TRIGGER_LABEL = 'Ticket actions';
  const MENU_ITEM_TESTID = 'delete-ticket-menu-item';

  it('hides the Delete trigger and menu item when userRole is VIEWER', () => {
    render(<TicketDetailSheet {...baseProps} userRole="VIEWER" />);

    expect(
      screen.queryByRole('button', { name: TRIGGER_LABEL }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId(MENU_ITEM_TESTID)).not.toBeInTheDocument();
  });

  it('shows the Delete trigger and menu item when userRole is MEMBER', () => {
    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    expect(
      screen.getByRole('button', { name: TRIGGER_LABEL }),
    ).toBeInTheDocument();
    expect(screen.getByTestId(MENU_ITEM_TESTID)).toBeInTheDocument();
  });

  it('shows the Delete trigger and menu item when userRole is OWNER', () => {
    render(<TicketDetailSheet {...baseProps} userRole="OWNER" />);

    expect(
      screen.getByRole('button', { name: TRIGGER_LABEL }),
    ).toBeInTheDocument();
    expect(screen.getByTestId(MENU_ITEM_TESTID)).toBeInTheDocument();
  });
});

function makeAttachment(overrides: Partial<{
  id: string;
  uploaderId: string;
  url: string;
  originalName: string;
}> = {}) {
  return {
    id: 'att-1',
    ticketId: 't1',
    uploaderId: 'u1',
    uploaderDisplayName: 'Test User',
    url: '/api/v1/projects/p1/tickets/1/attachments/att-1/raw',
    mimeType: 'image/png',
    sizeBytes: 1024,
    originalName: 'screenshot.png',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TicketDetailSheet — Attachments section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeAttachmentMock.mockResolvedValue(undefined);
    uploadAttachmentMock.mockResolvedValue(undefined);
    useAttachmentsMock.mockReturnValue({
      attachments: [],
      loading: false,
      error: null,
      remove: removeAttachmentMock,
      upload: uploadAttachmentMock,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('keeps the Attachments section visible even when there are no attachments', () => {
    // The section heading and the upload affordance stay mounted so the user
    // can re-add attachments after the last one is deleted. Only the inner
    // list is gated on attachments.length > 0.
    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    expect(screen.getByText('Attachments')).toBeInTheDocument();
    expect(screen.queryByTestId('attachment-list')).toBeNull();
    expect(screen.getByTestId('attachment-uploader')).toBeInTheDocument();
    expect(
      screen.getByTestId('attachment-uploader-input'),
    ).toBeInTheDocument();
  });

  it('renders the attachments list using the hook when the ticket does not hydrate them', () => {
    const list = [makeAttachment({ id: 'a-1' }), makeAttachment({ id: 'a-2' })];
    useAttachmentsMock.mockReturnValue({
      attachments: list,
      loading: false,
      error: null,
      remove: removeAttachmentMock,
      upload: uploadAttachmentMock,
    });

    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    expect(screen.getByText('Attachments')).toBeInTheDocument();
    const items = screen.getAllByTestId('attachment-list-item');
    expect(items).toHaveLength(2);
  });

  it('shows the delete button when the current user is the uploader', () => {
    useAttachmentsMock.mockReturnValue({
      attachments: [makeAttachment({ uploaderId: 'u1' })],
      loading: false,
      error: null,
      remove: removeAttachmentMock,
      upload: uploadAttachmentMock,
    });

    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    expect(screen.getByTestId('attachment-list-delete')).toBeInTheDocument();
  });

  it('shows the delete button when the current user role is OWNER (even if not the uploader)', () => {
    useAttachmentsMock.mockReturnValue({
      attachments: [makeAttachment({ uploaderId: 'someone-else' })],
      loading: false,
      error: null,
      remove: removeAttachmentMock,
      upload: uploadAttachmentMock,
    });

    render(<TicketDetailSheet {...baseProps} userRole="OWNER" />);

    expect(screen.getByTestId('attachment-list-delete')).toBeInTheDocument();
  });

  it('hides the delete button when the current user did not upload and is not OWNER', () => {
    useAttachmentsMock.mockReturnValue({
      attachments: [makeAttachment({ uploaderId: 'someone-else' })],
      loading: false,
      error: null,
      remove: removeAttachmentMock,
      upload: uploadAttachmentMock,
    });

    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    expect(screen.queryByTestId('attachment-list-delete')).toBeNull();
  });

  it('calls useAttachments().remove with the attachment id when delete is clicked', () => {
    useAttachmentsMock.mockReturnValue({
      attachments: [makeAttachment({ id: 'att-42' })],
      loading: false,
      error: null,
      remove: removeAttachmentMock,
      upload: uploadAttachmentMock,
    });

    render(<TicketDetailSheet {...baseProps} userRole="OWNER" />);

    fireEvent.click(screen.getByTestId('attachment-list-delete'));

    expect(removeAttachmentMock).toHaveBeenCalledWith('att-42');
  });

  it('prefers the hydrated ticket.attachments over the hook (no duplicate fetch)', () => {
    // Hook would return one attachment, hydrated ticket returns a different
    // one with a unique id. If the sheet prefers the hydrated field, the
    // hook value is ignored.
    useAttachmentsMock.mockReturnValue({
      attachments: [makeAttachment({ id: 'from-hook' })],
      loading: false,
      error: null,
      remove: removeAttachmentMock,
      upload: uploadAttachmentMock,
    });
    setTicketDetail({
      attachments: [makeAttachment({ id: 'from-hydrated' })],
    });

    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    const items = screen.getAllByTestId('attachment-list-item');
    expect(items).toHaveLength(1);
    const img = screen.getByRole('img');
    // The hydrated attachment's URL is rendered, not the hook's.
    expect(img.getAttribute('src')).toBe(
      '/api/v1/projects/p1/tickets/1/attachments/att-1/raw',
    );
  });

  it('renders an Attach N file(s) button when files are staged, with correct pluralization', () => {
    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    const fileInput = screen.getByTestId('attachment-uploader-input');

    // No staged files yet — the staging button (with the "Attach N file(s)"
    // pattern) is not rendered. Note: the uploader's own "Attach images"
    // button remains visible; we only assert the new staging button below.
    expect(
      screen.queryByRole('button', { name: /^Attach \d+ files?$/ }),
    ).toBeNull();

    // Stage one file.
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'one.png', { type: 'image/png' })] },
    });

    expect(
      screen.getByRole('button', { name: 'Attach 1 file' }),
    ).toBeInTheDocument();

    // Stage a second file alongside the first. The uploader appends to the
    // existing staged array, so the count grows to two (pluralization kicks in).
    fireEvent.change(fileInput, {
      target: { files: [new File(['y'], 'two.png', { type: 'image/png' })] },
    });

    expect(
      screen.getByRole('button', { name: 'Attach 2 files' }),
    ).toBeInTheDocument();
  });

  it('calls useAttachments().upload once per staged file when Attach is clicked, then clears staged state', async () => {
    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    const fileInput = screen.getByTestId('attachment-uploader-input');
    const fileA = new File(['a'], 'a.png', { type: 'image/png' });
    const fileB = new File(['b'], 'b.png', { type: 'image/png' });

    fireEvent.change(fileInput, {
      target: { files: [fileA, fileB] },
    });

    const attachButton = screen.getByRole('button', { name: 'Attach 2 files' });
    fireEvent.click(attachButton);

    // The uploader awaits upload sequentially for every staged file.
    await waitFor(() => {
      expect(uploadAttachmentMock).toHaveBeenCalledTimes(2);
    });
    expect(uploadAttachmentMock).toHaveBeenNthCalledWith(1, fileA);
    expect(uploadAttachmentMock).toHaveBeenNthCalledWith(2, fileB);

    // On success, staged state is cleared — the Attach button disappears.
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /attach \d+ file/i }),
      ).toBeNull();
    });
  });

  it('does not call useAttachments().upload when Attaches clicked with no staged files', () => {
    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    // No file has been picked, so no Attach button is rendered. The handler
    // guard is exercised indirectly: upload must not have been called.
    expect(uploadAttachmentMock).not.toHaveBeenCalled();
  });
});

describe('TicketDetailSheet — Copy link button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom implements no Clipboard API, so each test installs (or, for the
    // missing-API case, deliberately omits) its own stub.
    delete (navigator as { clipboard?: Clipboard }).clipboard;
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete (navigator as { clipboard?: Clipboard }).clipboard;
  });

  const COPY_LABEL = 'Copy link';

  it('renders the Copy link button for a member', () => {
    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    expect(
      screen.getByRole('button', { name: COPY_LABEL }),
    ).toBeInTheDocument();
  });

  it('renders the Copy link button for a viewer (copying a link is read-only)', () => {
    render(<TicketDetailSheet {...baseProps} userRole="VIEWER" />);

    expect(
      screen.getByRole('button', { name: COPY_LABEL }),
    ).toBeInTheDocument();
  });

  it('copies the ticket URL and confirms with a success toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    render(<TicketDetailSheet {...baseProps} ticketNumber={42} userRole="MEMBER" />);

    fireEvent.click(screen.getByRole('button', { name: COPY_LABEL }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Link copied to clipboard');
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/projects/proj-1/tickets/42'),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows an error toast when the Clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    fireEvent.click(screen.getByRole('button', { name: COPY_LABEL }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not copy link');
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows an error toast when the Clipboard API is missing entirely', async () => {
    // navigator.clipboard is absent in jsdom — the handler must guard for it
    // instead of throwing a TypeError on `undefined.writeText`.
    expect(navigator.clipboard).toBeUndefined();

    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    fireEvent.click(screen.getByRole('button', { name: COPY_LABEL }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not copy link');
    });
    expect(toast.success).not.toHaveBeenCalled();
  });
});
