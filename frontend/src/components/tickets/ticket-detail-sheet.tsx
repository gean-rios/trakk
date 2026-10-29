'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  History,
  Link2,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
  User as UserIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  BoardEvent,
  DisplayLinkType,
  LinkType,
  Priority,
  Role,
  UpdateTicketInput,
} from '@/lib/types';
import { useTicketDetail } from '@/hooks/use-ticket-detail';
import { useTickets } from '@/hooks/use-tickets';
import { useColumns } from '@/hooks/use-columns';
import { useMembers } from '@/hooks/use-members';
import { useLabels } from '@/hooks/use-labels';
import { useComments } from '@/hooks/use-comments';
import { useLinks } from '@/hooks/use-links';
import { useSearch } from '@/hooks/use-search';
import { useAuth } from '@/hooks/use-auth';
import { useProjectEvents } from '@/hooks/use-project-events';
import { useAttachments } from '@/hooks/use-attachments';
import { CommentThread } from '@/components/tickets/CommentThread';
import { AttachmentList } from '@/components/tickets/attachment-list';
import { AttachmentUploader } from '@/components/tickets/attachment-uploader';
import { DeleteTicketDialog } from '@/components/tickets/delete-ticket-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Select, type SelectOption } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover } from '@/components/ui/popover';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { DueDateBadge } from '@/components/tickets/DueDateBadge';
import { cn, formatRelativeTime } from '@/lib/utils';

const SECTION_LABEL =
  'font-mono text-[10px] tracking-[3px] uppercase text-trakk-teal';

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

function describeAction(action: string): string {
  switch (action) {
    case 'created':
      return 'created this ticket';
    case 'status_changed':
      return 'changed the status';
    case 'priority_changed':
      return 'changed the priority';
    case 'due_date_set':
      return 'set a due date';
    case 'due_date_cleared':
      return 'cleared the due date';
    case 'assigned':
      return 'assigned this ticket';
    case 'unassigned':
      return 'unassigned this ticket';
    case 'title_updated':
      return 'edited the title';
    case 'description_updated':
      return 'edited the description';
    case 'label_added':
      return 'added a label';
    case 'label_removed':
      return 'removed a label';
    default:
      return action.replace(/_/g, ' ');
  }
}

interface TicketDetailSheetProps {
  projectId: string;
  projectKey: string;
  ticketNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRole?: Role;
  projectIsArchived?: boolean;
  /**
   * Optional navigation callback for clicking a linked ticket row. When the
   * parent owns navigation (e.g. keeps the sheet open while opening another
   * ticket) it passes this. When omitted, row clicks are a no-op.
   */
  openTicket?: (ticketNumber: number) => void;
}

export function TicketDetailSheet({
  projectId,
  projectKey,
  ticketNumber,
  open,
  onOpenChange,
  userRole = 'MEMBER',
  projectIsArchived = false,
  openTicket,
}: TicketDetailSheetProps) {
  const {
    ticket,
    loading,
    error,
    updateTicket,
    addLabel,
    removeLabel,
    deleteTicket,
    refetch,
  } = useTicketDetail(projectId, ticketNumber, open);
  const { refetch: refetchBoard } = useTickets(projectId);
  const { columns } = useColumns(projectId);
  const { members } = useMembers(projectId);
  const { labels } = useLabels(projectId);
  const { user } = useAuth();
  const {
    comments,
    loading: commentsLoading,
    createComment,
    updateComment,
    deleteComment,
    refetch: refetchComments,
  } = useComments(projectId, ticketNumber, open);

  const {
    links,
    loading: linksLoading,
    error: linksError,
    refetch: refetchLinks,
    createLink,
    deleteLink,
  } = useLinks(projectId, ticketNumber, open);

  const canEdit = userRole !== 'VIEWER';

  // Prefer the hydrated `ticket.attachments` when present so we don't
  // refetch what the server already returned with the ticket detail.
  // Fall back to the hook when subcard-2's hydration hasn't landed yet.
  const hasHydratedAttachments =
    !!ticket && Array.isArray((ticket as { attachments?: unknown }).attachments);
  const { attachments, remove: removeAttachment, upload: uploadAttachment } = useAttachments(
    projectId,
    ticketNumber,
    open && !hasHydratedAttachments,
  );
  const attachmentsList = hasHydratedAttachments
    ? ((ticket as unknown as { attachments: typeof attachments }).attachments)
    : attachments;

  const canDeleteAttachment = React.useCallback(
    (att: (typeof attachments)[number]) =>
      user?.id === att.uploaderId || userRole === 'OWNER',
    [user?.id, userRole],
  );

  const [stagedFiles, setStagedFiles] = React.useState<File[]>([]);

  const handleDeleteAttachment = React.useCallback(
    async (attachmentId: string) => {
      try {
        await removeAttachment(attachmentId);
        toast.success('Attachment removed');
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Failed to delete attachment',
        );
      }
    },
    [removeAttachment],
  );

  const handleUploadAttachments = React.useCallback(
    async () => {
      if (stagedFiles.length === 0) return;
      try {
        for (const file of stagedFiles) {
          await uploadAttachment(file);
        }
        setStagedFiles([]);
        toast.success('Attachment uploaded');
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Failed to upload attachment',
        );
      }
    },
    [stagedFiles, uploadAttachment],
  );

  // Copies the ticket's permanent address (not the current window URL, which
  // on the board is a query-param board URL). `writeText` is called straight
  // from the click handler because the Clipboard API requires a user gesture.
  const handleCopyLink = async () => {
    const url = `${window.location.origin}/projects/${projectId}/tickets/${ticketNumber}`;
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const handleCommentEvent = React.useCallback(
    (event: BoardEvent) => {
      if (
        event.type === 'comment.created' ||
        event.type === 'comment.updated' ||
        event.type === 'comment.deleted'
      ) {
        void refetchComments();
      } else if (event.type === 'link.created' || event.type === 'link.deleted') {
        void refetchLinks();
      }
    },
    [refetchComments, refetchLinks],
  );

  useProjectEvents(projectId, handleCommentEvent, open);

  const [editingDescription, setEditingDescription] = React.useState(false);
  const [descriptionDraft, setDescriptionDraft] = React.useState('');
  const [savingDescription, setSavingDescription] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [editingDueDate, setEditingDueDate] = React.useState(false);
  const [dueDateDraft, setDueDateDraft] = React.useState('');
  const [optimisticDueDate, setOptimisticDueDate] = React.useState<string | null | undefined>(
    undefined,
  );
  const liveDueDate = optimisticDueDate === undefined ? ticket?.dueDate ?? null : optimisticDueDate;
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [linksOpen, setLinksOpen] = React.useState(false);
  const [linkSearchInput, setLinkSearchInput] = React.useState('');
  const [linkSearchQuery, setLinkSearchQuery] = React.useState('');
  const [linkUndo, setLinkUndo] = React.useState<{
    linkId: string;
    targetTicketNumber: number;
    type: LinkType;
  } | null>(null);
  const [linkAddError, setLinkAddError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) setActivityOpen(false);
  }, [open, ticketNumber]);

  React.useEffect(() => {
    if (!linkSearchInput) {
      setLinkSearchQuery('');
      return;
    }
    const t = setTimeout(() => setLinkSearchQuery(linkSearchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [linkSearchInput]);

  React.useEffect(() => {
    if (links.length > 0) setLinksOpen(true);
  }, [links]);

  // When the server-side ticket changes (e.g. after a save round-trips or SSE
  // delivers a fresh payload), drop any local optimistic override so the sheet
  // reflects the authoritative value.
  React.useEffect(() => {
    setOptimisticDueDate(undefined);
  }, [ticket?.dueDate]);

  const startEditingDueDate = () => {
    const current = liveDueDate;
    if (current) {
      // The wire format is an ISO datetime; the input only needs the date
      // portion in local time.
      const d = new Date(current);
      const pad = (n: number) => String(n).padStart(2, '0');
      setDueDateDraft(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      );
    } else {
      const today = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setDueDateDraft(
        `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
      );
    }
    setEditingDueDate(true);
  };

  const saveDueDate = async () => {
    if (!dueDateDraft) return;
    const previous = liveDueDate;
    // Plain `new Date('YYYY-MM-DD')` is UTC midnight per spec.
    const iso = new Date(dueDateDraft).toISOString();
    setOptimisticDueDate(iso);
    setEditingDueDate(false);
    try {
      await updateTicket({ dueDate: iso });
    } catch (err) {
      setOptimisticDueDate(previous);
      setActionError(
        err instanceof Error ? err.message : 'Failed to update due date',
      );
    }
  };

  const clearDueDate = async () => {
    const previous = liveDueDate;
    setOptimisticDueDate(null);
    setEditingDueDate(false);
    try {
      await updateTicket({ dueDate: null });
    } catch (err) {
      setOptimisticDueDate(previous);
      setActionError(
        err instanceof Error ? err.message : 'Failed to clear due date',
      );
    }
  };

  const runUpdate = async (input: UpdateTicketInput) => {
    setActionError(null);
    try {
      await updateTicket(input);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to update ticket',
      );
    }
  };

  const startEditingDescription = () => {
    setDescriptionDraft(ticket?.description ?? '');
    setEditingDescription(true);
  };

  const saveDescription = async () => {
    setSavingDescription(true);
    setActionError(null);
    try {
      await updateTicket({ description: descriptionDraft });
      setEditingDescription(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to save description',
      );
    } finally {
      setSavingDescription(false);
    }
  };

  const assignedLabelIds = new Set(ticket?.labels.map((l) => l.id) ?? []);
  const availableLabels = labels.filter((l) => !assignedLabelIds.has(l.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[690px] max-w-full p-7">
        {loading ? (
          <div className="flex flex-col gap-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error || !ticket ? (
          <div className="flex flex-col gap-4">
            <SheetTitle className="sr-only">Ticket error</SheetTitle>
            <div className="rounded-callout border border-[rgba(255,71,87,0.25)] bg-[rgba(255,71,87,0.06)] border-l-[3px] border-l-status-error px-6 py-5">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={20}
                  strokeWidth={1.75}
                  className="mt-0.5 shrink-0 text-status-error"
                />
                <div className="flex flex-col gap-2">
                  <p className="font-body text-[15px] text-trakk-text-strong">
                    Couldn&apos;t load ticket — {error ?? 'not found'}
                  </p>
                  <div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => refetch()}
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex flex-col gap-1 pr-8">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] tracking-wider text-trakk-teal">
                    {projectKey}-{ticket.number}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyLink}
                    aria-label="Copy link"
                  >
                    <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
                    Copy link
                  </Button>
                </div>
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Ticket actions"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => setDeleteDialogOpen(true)}
                        className="text-destructive focus:text-destructive"
                        data-testid="delete-ticket-menu-item"
                      >
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        Delete
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <SheetTitle>{ticket.title}</SheetTitle>
              <SheetDescription className="sr-only">
                Ticket {projectKey}-{ticket.number} details
              </SheetDescription>
            </div>

            {/* Meta row */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <span className={SECTION_LABEL}>Status</span>
                <Select
                  aria-label="Status"
                  value={ticket.statusColumnId}
                  disabled={!canEdit}
                  onChange={(e) =>
                    runUpdate({ statusColumnId: e.target.value })
                  }
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={SECTION_LABEL}>Priority</span>
                <Select
                  aria-label="Priority"
                  value={ticket.priority}
                  disabled={!canEdit}
                  onChange={(e) =>
                    runUpdate({ priority: e.target.value as Priority })
                  }
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={SECTION_LABEL}>Assignee</span>
                <Select
                  aria-label="Assignee"
                  value={ticket.assigneeId ?? ''}
                  disabled={!canEdit}
                  onChange={(e) =>
                    runUpdate({
                      assigneeId: e.target.value === '' ? null : e.target.value,
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.displayName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={SECTION_LABEL}>Reporter</span>
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    {ticket.reporter?.avatarUrl && (
                      <AvatarImage
                        src={ticket.reporter.avatarUrl}
                        alt={ticket.reporter.displayName}
                      />
                    )}
                    <AvatarFallback>
                      {ticket.reporter?.displayName?.charAt(0).toUpperCase() ?? '?'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-body text-[13px] text-trakk-text">
                    {ticket.reporter?.displayName ?? ticket.reporterId}
                  </span>
                </div>
              </div>
            </div>

            {/* Due Date row */}
            <div className="flex flex-col gap-1.5">
              <span className={SECTION_LABEL}>Due Date</span>
              {editingDueDate ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    aria-label="Due date"
                    value={dueDateDraft}
                    onChange={(e) => setDueDateDraft(e.target.value)}
                    className="w-auto px-2 py-1 font-mono text-[12px]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void saveDueDate()}
                    disabled={!dueDateDraft}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void clearDueDate()}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingDueDate(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : canEdit ? (
                <div className="flex items-center gap-2">
                  {liveDueDate ? (
                    <button
                      type="button"
                      onClick={startEditingDueDate}
                      className="text-left"
                    >
                      <DueDateBadge dueDate={liveDueDate} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startEditingDueDate}
                      className="font-body text-[13px] italic text-trakk-text-secondary hover:text-trakk-text"
                    >
                      No due date
                    </button>
                  )}
                </div>
              ) : liveDueDate ? (
                <DueDateBadge dueDate={liveDueDate} />
              ) : (
                <span className="font-body text-[13px] italic text-trakk-text-secondary">
                  No due date
                </span>
              )}
            </div>

            {/* Labels */}
            <div className="flex flex-col gap-2">
              <span className={SECTION_LABEL}>Labels</span>
              <div className="flex flex-wrap items-center gap-2">
                {ticket.labels.map((label) => (
                  <span
                    key={label.id}
                    className="inline-flex items-center gap-1 rounded-badge border px-2 py-0.5 font-mono text-[10px] tracking-[1px] uppercase"
                    style={{
                      color: label.color,
                      borderColor: `${label.color}40`,
                      backgroundColor: `${label.color}1A`,
                    }}
                  >
                    {label.name}
                    {canEdit && (
                      <button
                        type="button"
                        aria-label={`Remove ${label.name}`}
                        onClick={() => removeLabel(label.id)}
                        className="hover:opacity-70"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </span>
                ))}
                {canEdit && (
                  <Popover
                    trigger={
                      <button
                        type="button"
                        aria-label="Add label"
                        className="inline-flex items-center gap-1 rounded-badge border border-dashed border-trakk-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[1px] text-trakk-text-secondary hover:border-trakk-teal hover:text-trakk-teal"
                      >
                        <Plus size={12} />
                        Label
                      </button>
                    }
                  >
                    {availableLabels.length === 0 ? (
                      <p className="px-3 py-2 font-body text-[13px] text-trakk-text-secondary">
                        No more labels
                      </p>
                    ) : (
                      availableLabels.map((label) => (
                        <button
                          key={label.id}
                          type="button"
                          onClick={() => addLabel(label.id)}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-body text-[13px] text-trakk-text hover:bg-[var(--trakk-teal-hover)]"
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: label.color }}
                          />
                          {label.name}
                        </button>
                      ))
                    )}
                  </Popover>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className={SECTION_LABEL}>Description</span>
                {canEdit && !editingDescription && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startEditingDescription}
                  >
                    Edit
                  </Button>
                )}
              </div>
              {editingDescription ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    placeholder="Describe the work. Markdown supported."
                    className="min-h-[140px]"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingDescription(false)}
                      disabled={savingDescription}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={saveDescription}
                      disabled={savingDescription}
                    >
                      {savingDescription ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : ticket.description ? (
                <div className="prose-trakk font-body text-[15px] leading-relaxed text-trakk-text-strong [&_a]:text-trakk-teal [&_code]:font-mono [&_code]:text-[13px]">
                  <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                    {ticket.description}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="font-body text-[15px] text-trakk-text-secondary">
                  No description.
                </p>
              )}
            </div>

            {/* Attachments section — heading and uploader are always visible so the user can re-add
                attachments after deleting the last one. The <AttachmentList> itself remains gated on
                attachmentsList.length > 0 since rendering an empty list adds no value. */}
            <div className="flex flex-col gap-3">
              <span className={SECTION_LABEL}>Attachments</span>
              {attachmentsList.length > 0 && (
                <AttachmentList
                  attachments={attachmentsList}
                  canDelete={canDeleteAttachment}
                  onDelete={handleDeleteAttachment}
                />
              )}
              <AttachmentUploader
                files={stagedFiles}
                onChange={setStagedFiles}
                maxBytes={8 * 1024 * 1024}
              />
              {stagedFiles.length > 0 && (
                <Button
                  type="button"
                  onClick={handleUploadAttachments}
                  disabled={stagedFiles.length === 0}
                >
                  Attach {stagedFiles.length} file{stagedFiles.length === 1 ? '' : 's'}
                </Button>
              )}
            </div>

            <DeleteTicketDialog
              open={deleteDialogOpen}
              onOpenChange={setDeleteDialogOpen}
              projectId={projectId}
              ticketNumber={ticket.number}
              onDeleted={() => {
                setDeleteDialogOpen(false);
                onOpenChange(false);
                void refetchBoard();
              }}
            />

            {/* Linked Tickets */}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setLinksOpen((prev) => !prev)}
                className="flex items-center justify-between w-full group"
              >
                <span className={SECTION_LABEL}>
                  <Link2 className="inline h-3.5 w-3.5 mr-1.5 align-[-2px]" />
                  Linked Tickets
                  {links.length > 0 && (
                    <span className="font-mono text-[10px] tracking-[1px] text-trakk-text-secondary ml-2">
                      ({links.length})
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-trakk-text-secondary transition-transform duration-200',
                    linksOpen ? 'rotate-0' : '-rotate-180',
                  )}
                />
              </button>
              {linksOpen && (
                <div className="flex flex-col gap-3">
                  {linksError && (
                    <p className="font-body text-[13px] text-red-500">
                      {linksError}
                    </p>
                  )}
                  {linksLoading && links.length === 0 && (
                    <p className="font-body text-[13px] text-trakk-text-secondary">
                      Loading linked tickets…
                    </p>
                  )}
                  {!linksLoading && links.length === 0 && (
                    <p className="font-body text-[13px] text-trakk-text-secondary">
                      No linked tickets yet.
                    </p>
                  )}
                  {LINK_DISPLAY_ORDER.filter((dt) =>
                    links.some((l) => l.displayType === dt),
                  ).map((displayType) => (
                    <div key={displayType} className="flex flex-col gap-2">
                      <span className="font-mono text-[10px] tracking-[1px] text-trakk-text-secondary">
                        {displayType}
                      </span>
                      <ul className="flex flex-col gap-1.5">
                        {links
                          .filter((l) => l.displayType === displayType)
                          .map((link) => (
                            <li
                              key={link.id}
                              data-testid="linked-ticket-row"
                              className="flex items-center gap-2 rounded-md border border-trakk-border bg-trakk-surface px-2 py-1.5"
                            >
                              <button
                                type="button"
                                onClick={() => openTicket?.(link.targetNumber)}
                                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                              >
                                <span className="font-mono text-[12px] text-trakk-primary truncate">
                                  #{link.targetNumber}
                                </span>
                                <span className="font-body text-[13px] text-trakk-text-strong truncate flex-1">
                                  {link.targetTitle}
                                </span>
                                <span className="font-mono text-[10px] tracking-[1px] uppercase text-trakk-text-secondary px-1.5 py-0.5 border border-trakk-border rounded">
                                  {link.targetStatusColumnName}
                                </span>
                                <span className="font-mono text-[10px] tracking-[1px] uppercase text-trakk-text-secondary">
                                  {link.targetPriority !== 'NONE' && link.targetPriority}
                                </span>
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  aria-label="Remove link"
                                  data-testid="remove-link"
                                  onClick={async () => {
                                    try {
                                      await deleteLink(link.id);
                                      setLinkUndo({
                                        linkId: link.id,
                                        targetTicketNumber: link.targetNumber,
                                        type: link.type,
                                      });
                                    } catch (err) {
                                      const message =
                                        err instanceof Error
                                          ? err.message
                                          : 'Failed to remove link';
                                      setActionError(message);
                                    }
                                  }}
                                  className="ml-1 text-trakk-text-secondary hover:text-red-500"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                  {canEdit && (
                    <Popover
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid="add-link-trigger"
                          className="self-start"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add link
                        </Button>
                      }
                      className="w-80 p-3 flex flex-col gap-2"
                    >
                      <PopoverLinkForm
                        projectId={projectId}
                        value={linkSearchInput}
                        onValueChange={setLinkSearchInput}
                        query={linkSearchQuery}
                        onSelect={async (targetTicketNumber, type) => {
                          try {
                            await createLink({
                              targetTicketNumber,
                              type,
                            });
                            setLinkSearchInput('');
                            setLinkSearchQuery('');
                            setLinkAddError(null);
                          } catch (err) {
                            const message =
                              err instanceof Error
                                ? err.message
                                : 'Failed to create link';
                            setLinkAddError(message);
                            throw err;
                          }
                        }}
                      />
                      {linkAddError && (
                        <p className="font-body text-[12px] text-red-500">
                          {linkAddError}
                        </p>
                      )}
                    </Popover>
                  )}
                </div>
              )}
              {/* Undo toast: sonner provides a toast with an action button.
                  We dismiss after the original refetch settles, and re-run
                  createLink on the user's click. */}
              {linkUndo && (
                <UndoLinkToast
                  key={linkUndo.linkId}
                  link={linkUndo}
                  onClose={() => setLinkUndo(null)}
                  onUndo={async () => {
                    try {
                      await createLink({
                        targetTicketNumber: linkUndo.targetTicketNumber,
                        type: linkUndo.type,
                      });
                      setLinkUndo(null);
                    } catch (err) {
                      const message =
                        err instanceof Error
                          ? err.message
                          : 'Failed to restore link';
                      setActionError(message);
                    }
                  }}
                />
              )}
            </div>

            {/* Activity log */}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setActivityOpen((prev) => !prev)}
                className="flex items-center justify-between w-full group"
              >
                <span className={SECTION_LABEL}>Activity</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-trakk-text-secondary transition-transform duration-200',
                    activityOpen ? 'rotate-0' : '-rotate-180',
                  )}
                />
              </button>
              {activityOpen && (
                <ul className="flex flex-col gap-3">
                  {ticket.activityLog.length === 0 && (
                    <li className="font-body text-[13px] text-trakk-text-secondary">
                      No activity yet.
                    </li>
                  )}
                  {ticket.activityLog.map((entry) => (
                    <li key={entry.id} className="flex items-start gap-2.5">
                      <Avatar className="h-6 w-6">
                        {entry.user.avatarUrl && (
                          <AvatarImage
                            src={entry.user.avatarUrl}
                            alt={entry.user.displayName}
                          />
                        )}
                        <AvatarFallback>
                          {entry.user.displayName.charAt(0).toUpperCase() || (
                            <UserIcon size={12} />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <p className="font-body text-[13px] text-trakk-text-strong">
                          <span className="font-semibold">
                            {entry.user.displayName}
                          </span>{' '}
                          {describeAction(entry.action)}
                          {entry.oldValue && entry.newValue && (
                            <span className="text-trakk-text-secondary">
                              {' '}
                              ({entry.oldValue} → {entry.newValue})
                            </span>
                          )}
                        </p>
                        <span className="font-mono text-[10px] tracking-[1px] text-trakk-text-secondary">
                          {formatRelativeTime(entry.createdAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Comments */}
            <div className="flex flex-col gap-3">
              <span className={SECTION_LABEL}>Comments</span>
              {commentsLoading ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (
                <CommentThread
                  comments={comments}
                  currentUserId={user?.id ?? ''}
                  userRole={userRole ?? 'MEMBER'}
                  isArchived={projectIsArchived}
                  projectId={projectId}
                  onCreate={createComment}
                  onUpdate={updateComment}
                  onDelete={deleteComment}
                />
              )}
            </div>

            {actionError && (
              <p className="font-body text-[13px] text-status-error">
                {actionError}
              </p>
            )}

            {/* History footer marker (keeps History icon referenced) */}
            <span className="sr-only">
              <History size={12} />
            </span>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

const LINK_DISPLAY_ORDER: DisplayLinkType[] = [
  'Blocks',
  'Is blocked by',
  'Relates to',
  'Duplicates',
  'Is duplicated by',
];

const LINK_TYPE_OPTIONS: SelectOption[] = [
  { value: 'BLOCKS', label: 'Blocks' },
  { value: 'RELATES_TO', label: 'Relates to' },
  { value: 'DUPLICATES', label: 'Duplicates' },
];

interface PopoverLinkFormProps {
  projectId: string;
  value: string;
  onValueChange: (next: string) => void;
  query: string;
  onSelect: (targetTicketNumber: number, type: LinkType) => Promise<void>;
}

/**
 * Inline form inside the Add-link Popover. Local type <Select>, debounced
 * search <Input>, and a result list (project-scoped client-side filter).
 */
function PopoverLinkForm({
  projectId,
  value,
  onValueChange,
  query,
  onSelect,
}: PopoverLinkFormProps) {
  const [linkType, setLinkType] = React.useState<LinkType>('BLOCKS');
  const { results, setQuery: setSearchQuery } = useSearch();
  // Push the local debounced query into useSearch. useSearch will then
  // debounce again (300ms server-side) — net effect: 250ms+300ms, which is
  // acceptable for a manual popover open. Results are filtered to project.
  React.useEffect(() => {
    setSearchQuery(query);
  }, [query, setSearchQuery]);

  // Filter to the current project only — useSearch itself is global.
  const projectTickets = React.useMemo(() => {
    if (!results) return [];
    return results.tickets.filter((t) => t.projectId === projectId);
  }, [results, projectId]);

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={linkType}
        onChange={(e) => setLinkType(e.target.value as LinkType)}
        data-testid="link-type-select"
      >
        {LINK_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
      <Input
        placeholder="Search tickets…"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        data-testid="link-search-input"
      />
      <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
        {query && projectTickets.length === 0 && (
          <li className="font-body text-[12px] text-trakk-text-secondary py-1.5">
            No matching tickets in this project.
          </li>
        )}
        {projectTickets.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              data-testid="link-result-row"
              className="w-full text-left flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-trakk-bg"
              onClick={() => {
                void onSelect(t.number, linkType);
              }}
            >
              <span className="font-mono text-[12px] text-trakk-primary truncate">
                #{t.number}
              </span>
              <span className="font-body text-[13px] text-trakk-text-strong truncate flex-1">
                {t.title}
              </span>
              <span className="font-mono text-[10px] tracking-[1px] uppercase text-trakk-text-secondary">
                {t.statusColumnName}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface UndoLinkToastProps {
  link: { linkId: string; targetTicketNumber: number; type: LinkType };
  onClose: () => void;
  onUndo: () => Promise<void>;
}

/**
 * Renders a sonner toast with a 3-second undo affordance. sonner takes care
 * of the auto-dismiss timer; we explicitly wire the undo action via its
 * action callback. When the user clicks undo we run createLink on the
 * captured target + type. When the toast auto-dismisses without undo,
 * we clear our local state.
 */
function UndoLinkToast({ link, onClose, onUndo }: UndoLinkToastProps) {
  React.useEffect(() => {
    const id = toast.message('Link removed', {
      duration: 3000,
      action: {
        label: 'Undo',
        onClick: () => {
          void onUndo();
        },
      },
    });
    // sonner does not expose a "dismissed without action" hook, so we treat
    // any unmount as the user not clicking undo — clear local state.
    return () => {
      toast.dismiss(id);
      onClose();
    };
  }, [link.linkId]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
