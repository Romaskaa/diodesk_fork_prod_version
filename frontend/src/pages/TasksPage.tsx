import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import React, { memo } from 'react';

import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus, Search, Filter, Calendar, Loader2, X, Check, Circle, Timer, Eye,
  ArrowUpRight, ChevronDown, Flag, AlertCircle, CheckCircle2, Ban, RotateCcw,
  RefreshCw, Archive, FolderOpen, Ticket, Zap, Star, User, Layers, UserCheck,
  GitPullRequest, ThumbsUp, ThumbsDown, Pencil, List, LayoutGrid, Clock3,
  FileText, File as FileIcon, Download, BarChart3, Trash2, Paperclip, ArrowRight, Mail
} from 'lucide-react';
import { tasksApi, projectsApi, ticketsApi, usersApi } from '../api/client';
import { attachmentsApi } from '../api/attachments';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/ui/use-toast';
import type {
  TaskKanbanItem, TaskKanbanColumn, TaskStatus, TaskPriority,
  TaskCreateInput, TaskUpdateInput, TaskKanbanContext,
  SimpleUser, CounterpartyCustomer,
} from '../types';

import TaskAnalytics from '../components/tasks/TaskAnalytics';

import {
  TicketEditor,
  deserializeToBlocks,
  serializeBlocks,
  type DescriptionBlock,
} from '../components/helpers/TicketEditor';

import { TicketDescriptionContent } from '../components/helpers/TicketDescriptionContent';

/* ───────────────── types ───────────────── */

type TaskTag = { name: string; color?: string | null };

type TaskAttachment = {
  id?: string;
  file_name?: string | null;
  original_name?: string | null;
  original_filename?: string | null;
  filename?: string | null;
  name?: string | null;
  file_url?: string | null;
  url?: string | null;
  mime_type?: string | null;
  content_type?: string | null;
  size?: number | null;
  file_size?: number | null;
  size_bytes?: number | null;
  storage_key?: string | null;
};

type AttachmentPreviewItem = {
  name: string;
  url: string;
  size?: number | null;
  mimeType?: string | null;
  extension?: string;
  isImage: boolean;
};

type TaskViewItem = TaskKanbanItem & {
  description?: string | null;
  estimated_hours?: number | string | null;
  actual_hours?: number | string | null;
  started_at?: string | null;
  completed_at?: string | null;
  working_since?: string | null;
  reviewer_id?: string | null;
  ticket_number?: string | null;
  ticket_title?: string | null;
  project_name?: string | null;
  tags?: TaskTag[] | null;
  tag?: TaskTag[] | null;
  attachments?: TaskAttachment[] | null;
};

type TaskViewColumn = Omit<TaskKanbanColumn, 'tasks'> & {
  tasks: Omit<TaskKanbanColumn['tasks'], 'items'> & { items: TaskViewItem[] };
};

type CtxMode = 'my' | 'internal' | 'project' | 'assignee' | 'ticket';
type ViewMode =
  | 'kanban'
  | 'list'
  | 'analytics';

type CompleteIntent = { task: TaskViewItem; mode: 'status_done' | 'review_done' };
type AssignIntent = { task: TaskViewItem; targetStatus: 'todo' | 'in_progress' };

type LastMove = {
  taskId: string;
  number: string;
  title: string;
  from: TaskStatus;
  to: TaskStatus;
};

/* ───────────────── constants ───────────────── */

const SP_SERIES = [1, 2, 3, 5, 8, 13, 21];

const PRI_LABEL: Record<TaskPriority, string> = {
  low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критический',
};

const PRI_LIST: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
  { value: 'critical', label: 'Критический' },
];

const ST_LABEL: Record<TaskStatus, string> = {
  backlog: 'В резерве', todo: 'Готово к выполнению', in_progress: 'В работе',
  paused: 'На паузе', blocked: 'Приостановлено', to_review: 'На проверке',
  to_fix: 'На доработку', to_test: 'На тестировании', done: 'Выполнено',
  cancelled: 'Отменено',
};

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['todo', 'cancelled'],
  todo: ['in_progress', 'paused', 'cancelled'],
  in_progress: ['paused', 'to_review', 'done', 'cancelled'],
  paused: ['in_progress', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  to_review: ['in_progress', 'done', 'to_fix', 'to_test', 'cancelled'],
  to_fix: ['in_progress', 'to_review', 'cancelled'],
  to_test: ['in_progress', 'to_review', 'done', 'cancelled'],
  done: ['in_progress', 'to_fix'],
  cancelled: [],
};

const ASSIGN_OK: Set<TaskStatus> = new Set([
  'backlog', 'todo', 'in_progress', 'paused', 'blocked', 'to_review', 'to_fix', 'to_test',
]);

const EDIT_OK: Set<TaskStatus> = new Set(['backlog', 'todo', 'paused']);

const COL_ORDER: TaskStatus[] = [
  'backlog', 'todo', 'in_progress', 'paused', 'blocked',
  'to_review', 'to_fix', 'to_test', 'done', 'cancelled',
];

const DRAG_TRANSITIONS = (from: TaskStatus): TaskStatus[] =>
  COL_ORDER.filter((status) => status !== from);

const CM: Record<string, {
  icon: React.ComponentType<{ className?: string }>; tc: string; dot: string;
  brd: string; chip: string; empty: string;
}> = {
  backlog: { icon: Circle, tc: 'text-[var(--text-primary)]/60', dot: 'bg-gray-400', brd: 'border-[var(--border-color)]', chip: 'bg-[var(--hover-2)] text-[var(--text-primary)]/60 border-[var(--border-color)]', empty: 'Пусто' },
  todo: { icon: AlertCircle, tc: 'text-blue-500', dot: 'bg-blue-500', brd: 'border-blue-500/30', chip: 'bg-blue-500/10 text-blue-500 border-blue-500/20', empty: 'Пусто' },
  in_progress: { icon: Timer, tc: 'text-amber-500', dot: 'bg-amber-500', brd: 'border-amber-500/30', chip: 'bg-amber-500/10 text-amber-500 border-amber-500/20', empty: 'Пусто' },
  paused: { icon: Ban, tc: 'text-[var(--text-primary)]/50', dot: 'bg-gray-400', brd: 'border-[var(--border-color)]', chip: 'bg-[var(--hover-2)] text-[var(--text-primary)]/50 border-[var(--border-color)]', empty: 'Пусто' },
  blocked: { icon: Ban, tc: 'text-red-500', dot: 'bg-red-500', brd: 'border-red-500/30', chip: 'bg-red-500/10 text-red-500 border-red-500/20', empty: 'Пусто' },
  to_review: { icon: Eye, tc: 'text-violet-500', dot: 'bg-violet-500', brd: 'border-violet-500/30', chip: 'bg-violet-500/10 text-violet-500 border-violet-500/20', empty: 'Пусто' },
  to_fix: { icon: AlertCircle, tc: 'text-orange-500', dot: 'bg-orange-500', brd: 'border-orange-500/30', chip: 'bg-orange-500/10 text-orange-500 border-orange-500/20', empty: 'Пусто' },
  to_test: { icon: CheckCircle2, tc: 'text-cyan-500', dot: 'bg-cyan-500', brd: 'border-cyan-500/30', chip: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20', empty: 'Пусто' },
  done: { icon: CheckCircle2, tc: 'text-emerald-500', dot: 'bg-emerald-500', brd: 'border-emerald-500/30', chip: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', empty: 'Пусто' },
  cancelled: { icon: RotateCcw, tc: 'text-[var(--text-primary)]/40', dot: 'bg-gray-500/60', brd: 'border-[var(--border-color)]', chip: 'bg-[var(--hover-2)] text-[var(--text-primary)]/40 border-[var(--border-color)]', empty: 'Пусто' },
  review: { icon: Eye, tc: 'text-violet-500', dot: 'bg-violet-500', brd: 'border-violet-500/30', chip: 'bg-violet-500/10 text-violet-500 border-violet-500/20', empty: 'Пусто' },
};

const PM: Record<TaskPriority, { c: string; bg: string; brd: string; dot: string; icon: React.ReactNode }> = {
  low: { c: 'text-emerald-500', bg: 'bg-emerald-500/10', brd: 'border-emerald-500/20', dot: 'bg-emerald-500', icon: <Flag className="w-3.5 h-3.5" /> },
  medium: { c: 'text-yellow-500', bg: 'bg-yellow-500/10', brd: 'border-yellow-500/20', dot: 'bg-yellow-500', icon: <Flag className="w-3.5 h-3.5" /> },
  high: { c: 'text-orange-500', bg: 'bg-orange-500/10', brd: 'border-orange-500/20', dot: 'bg-orange-500', icon: <Flag className="w-3.5 h-3.5" /> },
  critical: { c: 'text-red-500', bg: 'bg-red-500/10', brd: 'border-red-500/20', dot: 'bg-red-500', icon: <Zap className="w-3.5 h-3.5" /> },
};

const INP =
  'w-full px-3 py-2.5 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] text-sm placeholder-[var(--text-primary)]/40 focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent-ring)] transition-all';

/* ───────────────── helpers ───────────────── */

const ini = (n?: string | null) =>
  n ? n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() : '?';

const getDueTimestamp = (dueDate?: string | null): number | null => {
  if (!dueDate) return null;

  // date без времени трактуем как конец указанного дня,
  // а не 00:00 этого дня.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    const [year, month, day] = dueDate.split('-').map(Number);

    return new Date(
      year,
      month - 1,
      day,
      23,
      59,
      59,
      999,
    ).getTime();
  }

  const timestamp = new Date(dueDate).getTime();

  return Number.isFinite(timestamp)
    ? timestamp
    : null;
};

const completedLate = (t: TaskViewItem) => {
  if (!t.completed_at) return false;

  const dueAt = getDueTimestamp(t.due_date);
  if (dueAt == null) return false;

  const completedAt = new Date(t.completed_at).getTime();

  return (
    Number.isFinite(completedAt) &&
    completedAt > dueAt
  );
};

const overdue = (t: TaskViewItem) => {
  if (
    t.status === 'done' ||
    t.status === 'cancelled'
  ) {
    return false;
  }

  const dueAt = getDueTimestamp(t.due_date);

  return dueAt != null && Date.now() > dueAt;
};

const fmtDue = (d: string) => {
  const dueAt = getDueTimestamp(d);

  if (dueAt == null) {
    return '—';
  }

  const now = new Date();

  const todayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();

  const diff = Math.ceil(
    (dueAt - todayEnd) / 86400000,
  );

  if (diff < 0) {
    return `${-diff} дн. просрочено`;
  }

  if (diff === 0) {
    return 'Сегодня';
  }

  if (diff === 1) {
    return 'Завтра';
  }

  return new Date(dueAt).toLocaleDateString(
    'ru-RU',
    {
      day: 'numeric',
      month: 'short',
    },
  );
};

const fmtTaskDue = (t: TaskViewItem) => {
  if (!t.due_date) return '—';

  if (t.status === 'done') {
    if (completedLate(t)) {
      return 'Завершена с опозданием';
    }

    return new Date(
      getDueTimestamp(t.due_date) ?? t.due_date,
    ).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
    });
  }

  return fmtDue(t.due_date);
};

const apiErr = (e: any) =>
  e?.response?.data?.error?.public_message ??
  e?.response?.data?.error?.message ??
  e?.response?.data?.detail?.[0]?.msg ??
  e?.message ?? 'Неизвестная ошибка';

const snapCols = (c: TaskViewColumn[]) =>
  c.map((x) => ({ ...x, tasks: { ...x.tasks, items: [...x.tasks.items] } }));

const getTaskTags = (t: TaskViewItem): TaskTag[] => t.tags ?? t.tag ?? [];

const normalizeDecimalString = (value: string) => {
  const v = value.trim().replace(',', '.');
  const m = v.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!m) return value;
  const sign = m[1] === '-' ? '-' : '';
  let intPart = m[2].replace(/^0+(?=\d)/, '');
  if (!intPart) intPart = '0';
  const frac = (m[3] ?? '').replace(/0+$/, '');
  return frac ? `${sign}${intPart}.${frac}` : `${sign}${intPart}`;
};

const toNumberOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const normalized = normalizeDecimalString(String(v));
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const fmtHours = (v: unknown) => {
  if (v == null || v === '') return '—';
  const n = toNumberOrNull(v);
  if (n != null) {
    return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ч`;
  }
  const s = normalizeDecimalString(String(v));
  return s.length > 18 ? `${s.slice(0, 18)}… ч` : `${s} ч`;
};

const getTaskTicketNumber = (task: TaskViewItem) => {
  const explicit = String(task.ticket_number ?? '').trim();
  if (explicit) return explicit;
  if (!task.ticket_id || !task.number) return null;
  const parts = String(task.number).split('-');
  if (parts.length < 2) return null;
  return parts.slice(0, -1).join('-');
};

const getTaskTicketPath = (task: TaskViewItem) => {
  const number = getTaskTicketNumber(task);
  if (number) return `/tickets/${number}`;
  return task.ticket_id ? `/tickets/${task.ticket_id}` : null;
};

const formatFileSize = (b: number) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

const fixPresignedUrl = (url: string) =>
  url.replace(/http:\/\/(minio|maildev):9000/g, 'http://localhost:9900');

const getFileExtension = (name?: string | null) => {
  const v = String(name ?? '').split('?')[0].split('#')[0];
  const i = v.lastIndexOf('.');
  return i >= 0 ? v.slice(i + 1).toUpperCase() : '';
};

const MIME_LABELS: Record<string, string> = {
  'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/webp': 'WEBP', 'image/gif': 'GIF',
  'image/svg+xml': 'SVG', 'application/pdf': 'PDF', 'text/plain': 'TXT', 'text/csv': 'CSV',
  'application/zip': 'ZIP', 'application/x-rar-compressed': 'RAR',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
};

const getMimeShortLabel = (mime?: string | null) => {
  const m = String(mime ?? '').toLowerCase();
  return MIME_LABELS[m] || '';
};

const isImageFile = (file?: Pick<File, 'type' | 'name'> | null) => {
  if (!file) return false;
  const mime = String(file.type ?? '').toLowerCase();
  return mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(file.name ?? ''));
};

const buildPendingFileKey = (file: File, index: number) =>
  `${file.name}-${file.size}-${file.lastModified}-${index}`;

const getAttachmentName = (a: TaskAttachment) =>
  a.original_filename || a.original_name || a.file_name || a.filename || a.name ||
  (a.storage_key ? a.storage_key.split('/').pop() : null) || 'Файл';

const getAttachmentUrl = (a: TaskAttachment) => a.file_url || a.url || '';

const getAttachmentMime = (a: TaskAttachment) => a.mime_type || a.content_type || null;

const getAttachmentSize = (a: TaskAttachment) => {
  const size =
    typeof a.size_bytes === 'number' ? a.size_bytes :
      typeof a.size === 'number' ? a.size :
        typeof a.file_size === 'number' ? a.file_size : null;
  return size != null && Number.isFinite(size) ? size : null;
};

const getAttachmentTypeLabel = (a: TaskAttachment) =>
  getFileExtension(getAttachmentName(a)) ||
  getFileExtension(a.storage_key) ||
  getMimeShortLabel(getAttachmentMime(a)) ||
  'FILE';

const getLocalFileTypeLabel = (file: File) =>
  getFileExtension(file.name) || getMimeShortLabel(file.type) || 'FILE';

const isImageAttachment = (a: TaskAttachment) => {
  const mime = String(a.mime_type || a.content_type || '').toLowerCase();
  const probe = `${getAttachmentName(a)} ${a.storage_key ?? ''}`.toLowerCase();
  return mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(probe);
};

/* ───────────────── Attachment preview ───────────────── */

function AttachmentPreviewModal({ item, onClose }: {
  item: AttachmentPreviewItem;
  onClose: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-5xl max-h-[90vh] flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)] shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-[var(--text-primary)] truncate">{item.name}</h3>
              {item.extension && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--hover-2)] text-[var(--text-primary)]/55 border border-[var(--border-color)]">
                  {item.extension}
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-[var(--text-primary)]/40 flex flex-wrap gap-2">
              {item.size != null && <span>{formatFileSize(item.size)}</span>}
              {item.mimeType && <span>{item.mimeType}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-black/20 flex items-center justify-center p-6">
          {item.isImage ? (
            <img src={item.url} alt={item.name} className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-2xl" />
          ) : (
            <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-[var(--hover-2)] border border-[var(--border-color)] flex items-center justify-center">
                <FileIcon className="w-8 h-8 text-[var(--text-primary)]/35" />
              </div>
              <div className="mt-4 text-lg font-semibold text-[var(--text-primary)]">{item.extension || 'FILE'}</div>
              <div className="mt-2 text-sm text-[var(--text-primary)]/50 break-all">{item.name}</div>
              <div className="mt-3 text-xs text-[var(--text-primary)]/35">Для этого типа файла предпросмотр недоступен</div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)] shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 font-medium hover:bg-[var(--hover-3)] text-sm">
            Закрыть
          </button>
          <a
            href={item.url}
            download={item.name}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent)]/90 text-sm"
          >
            <Download className="w-4 h-4" />
            Скачать
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TaskAttachmentItem({ attachment, onPreview, onDelete, deleting = false, }: {
  attachment: TaskAttachment;
  onPreview: (item: AttachmentPreviewItem) => void;
  onDelete?: (attachment: TaskAttachment) => void;
  deleting?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const name = getAttachmentName(attachment);
  const size = getAttachmentSize(attachment);
  const mimeType = getAttachmentMime(attachment);
  const isImage = isImageAttachment(attachment);
  const typeLabel = getAttachmentTypeLabel(attachment);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (!attachment.id) {
      setError(true);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { download_url } = await attachmentsApi.getPresignedDownloadUrl(attachment.id);
        const fixedUrl = fixPresignedUrl(download_url);
        const res = await fetch(fixedUrl);
        if (!res.ok) throw new Error('download failed');
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) { setUrl(objectUrl); setLoading(false); }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)]">
        <div className="w-12 h-12 rounded-lg bg-[var(--hover-2)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/35" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{name}</p>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--hover-2)] text-[var(--text-primary)]/45 border border-[var(--border-color)]">{typeLabel}</span>
          </div>
          <p className="text-xs text-[var(--text-primary)]/35">Загрузка предпросмотра...</p>
        </div>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-red-500/20 bg-red-500/5">
        <div className="w-12 h-12 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
          <FileIcon className="w-5 h-5 text-red-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-red-400 truncate">{name}</p>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">{typeLabel}</span>
          </div>
          <p className="text-xs text-red-400/70">Не удалось загрузить файл</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] hover:bg-[var(--hover-2)] transition-colors group">
      <button
        type="button"
        onClick={() =>
          onPreview({
            name,
            url,
            size,
            mimeType,
            extension: typeLabel,
            isImage,
          })
        }
        className="flex items-center gap-3 min-w-0 flex-1 text-left"
      >
        {isImage ? (
          <img
            src={url}
            alt={name}
            className="w-12 h-12 rounded-lg object-cover border border-[var(--border-color)] shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-[var(--hover-3)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
            <FileIcon className="w-5 h-5 text-[var(--text-primary)]/40" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate group-hover:text-[var(--accent)]">
              {name}
            </p>

            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--hover-2)] text-[var(--text-primary)]/45 border border-[var(--border-color)] shrink-0">
              {typeLabel}
            </span>
          </div>

          <p className="text-xs text-[var(--text-primary)]/35">
            {size != null
              ? formatFileSize(size)
              : 'Размер неизвестен'}
          </p>
        </div>

        <Eye className="w-4 h-4 text-[var(--text-primary)]/25 shrink-0" />
      </button>

      {onDelete && attachment.id && (
        <button
          type="button"
          disabled={deleting}
          onClick={() => onDelete(attachment)}
          title="Открепить файл"
          className="p-2 rounded-lg text-[var(--text-primary)]/30 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 shrink-0"
        >
          {deleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  );
}

function statusErr(err: any, task: TaskViewItem, to: TaskStatus) {
  const raw = apiErr(err);
  const lw = raw.toLowerCase();

  if (to === 'todo' && (!task.assignee_id || lw.includes('assignee'))) {
    return { title: 'Нужен исполнитель', description: 'Назначьте исполнителя перед переводом задачи в «Готово к выполнению».' };
  }
  if (to === 'in_progress' && (!task.assignee_id || lw.includes('assignee'))) {
    return { title: 'Нужен исполнитель', description: 'Назначьте исполнителя перед переводом задачи в работу.' };
  }
  if (lw.includes('transition') || lw.includes('cannot')) {
    return { title: 'Переход недоступен', description: `Из «${ST_LABEL[task.status]}» нельзя перейти в «${ST_LABEL[to]}».` };
  }
  return { title: `Ошибка перевода в «${ST_LABEL[to]}»`, description: raw };
}

/* ───────────────── dropdown primitives ───────────────── */

interface DDOpt { value: string; label: string; sublabel?: string; icon?: React.ReactNode; dotColor?: string; }

function useDDPos(ref: React.RefObject<HTMLDivElement | null>, open: boolean, wide?: boolean) {
  const [s, setS] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 300;
    setS({
      position: 'fixed',
      left: Math.max(8, r.left),
      width: wide ? Math.max(r.width, 380) : r.width,
      zIndex: 9999,
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, [open, wide, ref]);
  return s;
}

function SelectDD({ value, onChange, options, placeholder, icon: LI, searchable, disabled }: {
  value: string; onChange: (v: string) => void; options: DDOpt[];
  placeholder?: string; icon?: React.ComponentType<{ className?: string }>;
  searchable?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const tRef = useRef<HTMLDivElement>(null);
  const dRef = useRef<HTMLDivElement>(null);
  const iRef = useRef<HTMLInputElement>(null);
  const pos = useDDPos(tRef, open);
  const sel = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!tRef.current?.contains(e.target as Node) && !dRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => {
    if (open && searchable) setTimeout(() => iRef.current?.focus(), 50);
    if (!open) setQ('');
  }, [open, searchable]);

  const fl = q
    ? options.filter((o) =>
      o.label.toLowerCase().includes(q.toLowerCase()) ||
      (o.sublabel || '').toLowerCase().includes(q.toLowerCase()),
    )
    : options;

  const dd = open
    ? createPortal(
      <div ref={dRef} style={pos} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-xl overflow-hidden">
        {searchable && (
          <div className="p-2 border-b border-[var(--border-color)]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/30" />
              <input ref={iRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск..."
                className="w-full pl-8 pr-3 py-2 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-primary)]/40 focus:outline-none" />
            </div>
          </div>
        )}
        <div className="overflow-y-auto max-h-[240px] p-1">
          <div role="button" tabIndex={0} onClick={() => { onChange(''); setOpen(false); }}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer ${!value ? 'bg-[var(--accent)]/10' : 'hover:bg-[var(--hover-2)]'} text-[var(--text-primary)]/60`}>
            <span>—</span><span className="flex-1">Не выбрано</span>
            {!value && <Check className="w-4 h-4 text-[var(--accent)]" />}
          </div>
          {fl.length === 0 && q && <div className="px-3 py-4 text-center text-sm text-[var(--text-primary)]/40">Не найдено</div>}
          {fl.map((o) => (
            <div key={o.value} role="button" tabIndex={0} onClick={() => { onChange(o.value); setOpen(false); }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer ${o.value === value ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-medium' : 'hover:bg-[var(--hover-2)] text-[var(--text-primary)]'}`}>
              {o.dotColor && <span className={`w-2 h-2 rounded-full shrink-0 ${o.dotColor}`} />}
              {o.icon && <span className="shrink-0">{o.icon}</span>}
              <div className="flex-1 min-w-0">
                <span className="block truncate">{o.label}</span>
                {o.sublabel && <span className="block text-xs text-[var(--text-primary)]/40 truncate">{o.sublabel}</span>}
              </div>
              {o.value === value && <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />}
            </div>
          ))}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={tRef} className="relative w-full">
      <div role="button" tabIndex={disabled ? -1 : 0} onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 bg-[var(--hover-2)] border rounded-xl text-sm text-left select-none transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--hover-3)]'
          } ${open ? 'border-[var(--accent)]/50 ring-1 ring-[var(--accent-ring)]' : 'border-[var(--border-color)]'}`}>
        {LI && <LI className="w-4 h-4 text-[var(--text-primary)]/40 shrink-0" />}
        <span className={`flex-1 truncate ${sel ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-primary)]/40'}`}>
          {sel ? sel.label : placeholder || '—'}
        </span>
        {sel && value && (
          <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
            className="p-1 rounded text-[var(--text-primary)]/30 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] shrink-0">
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/30 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {dd}
    </div>
  );
}

function AsyncDD({ value, onChange, loadFn, placeholder, icon: LI, disabled, wide }: {
  value: string; onChange: (v: string) => void;
  loadFn: (q: string, p: number) => Promise<{ items: DDOpt[]; hasNext: boolean }>;
  placeholder?: string; icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean; wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState<DDOpt[]>([]);
  const [ld, setLd] = useState(false);
  const [ldMore, setLdMore] = useState(false);
  const [pg, setPg] = useState(1);
  const [more, setMore] = useState(false);
  const [selLbl, setSelLbl] = useState('');
  const tRef = useRef<HTMLDivElement>(null);
  const dRef = useRef<HTMLDivElement>(null);
  const iRef = useRef<HTMLInputElement>(null);
  const dbRef = useRef<ReturnType<typeof setTimeout>>();
  const pos = useDDPos(tRef, open, wide);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!tRef.current?.contains(e.target as Node) && !dRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const doLoad = useCallback(async (search: string, page: number, append = false) => {
    append ? setLdMore(true) : setLd(true);
    try {
      const r = await loadFn(search, page);
      setOpts((prev) => (append ? [...prev, ...r.items] : r.items));
      setMore(r.hasNext);
      setPg(page);
    } finally {
      setLd(false);
      setLdMore(false);
    }
  }, [loadFn]);

  useEffect(() => {
    if (!open) return;
    doLoad('', 1);
    setTimeout(() => iRef.current?.focus(), 50);
  }, [open, doLoad]);

  useEffect(() => {
    if (!open) { setQ(''); return; }
    if (dbRef.current) clearTimeout(dbRef.current);
    dbRef.current = setTimeout(() => doLoad(q, 1), 300);
    return () => { if (dbRef.current) clearTimeout(dbRef.current); };
  }, [q, open, doLoad]);

  useEffect(() => {
    if (!value) { setSelLbl(''); return; }
    const f = opts.find((o) => o.value === value);
    if (f) { setSelLbl(f.label); return; }
    loadFn('', 1).then((r) => {
      const x = r.items.find((o) => o.value === value);
      setSelLbl(x ? x.label : '…');
    }).catch(() => setSelLbl('…'));
  }, [value, opts, loadFn]);

  const dd = open
    ? createPortal(
      <div ref={dRef} style={pos} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-xl overflow-hidden">
        <div className="p-2 border-b border-[var(--border-color)]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-primary)]/30" />
            <input ref={iRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск..."
              className="w-full pl-8 pr-3 py-2 bg-[var(--hover-1)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-primary)]/40 focus:outline-none" />
          </div>
        </div>
        <div className="overflow-y-auto max-h-[280px] p-1">
          <div role="button" tabIndex={0} onClick={() => { onChange(''); setOpen(false); }}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer ${!value ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-medium' : 'hover:bg-[var(--hover-2)] text-[var(--text-primary)]/60'
              }`}>
            <span>—</span><span className="flex-1">Не выбрано</span>
            {!value && <Check className="w-4 h-4 text-[var(--accent)]" />}
          </div>
          {ld && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-primary)]/30" /></div>}
          {!ld && opts.length === 0 && <div className="px-3 py-4 text-center text-sm text-[var(--text-primary)]/40">{q ? 'Не найдено' : 'Нет данных'}</div>}
          {!ld && opts.map((o) => (
            <div key={o.value} role="button" tabIndex={0} onClick={() => { onChange(o.value); setSelLbl(o.label); setOpen(false); }}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer ${o.value === value ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-medium' : 'hover:bg-[var(--hover-2)] text-[var(--text-primary)]'
                }`}>
              {o.dotColor && <span className={`w-2 h-2 rounded-full shrink-0 ${o.dotColor}`} />}
              {o.icon && <span className="shrink-0">{o.icon}</span>}
              <div className="flex-1 min-w-0">
                <span className="block leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {o.label}
                </span>
                {o.sublabel && <span className="block text-xs text-[var(--text-primary)]/40 truncate mt-0.5">{o.sublabel}</span>}
              </div>
              {o.value === value && <Check className="w-4 h-4 text-[var(--accent)] shrink-0" />}
            </div>
          ))}
          {!ld && more && (
            <div role="button" tabIndex={0} onClick={() => !ldMore && doLoad(q, pg + 1, true)}
              className="flex items-center justify-center gap-1.5 py-2 text-sm text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)] rounded-lg cursor-pointer transition-colors">
              {ldMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />} Ещё
            </div>
          )}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={tRef} className="relative w-full">
      <div role="button" tabIndex={disabled ? -1 : 0} onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 bg-[var(--hover-2)] border rounded-xl text-sm text-left select-none transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--hover-3)]'
          } ${open ? 'border-[var(--accent)]/50 ring-1 ring-[var(--accent-ring)]' : 'border-[var(--border-color)]'}`}>
        {LI && <LI className="w-4 h-4 text-[var(--text-primary)]/40 shrink-0" />}
        <span className={`flex-1 truncate ${selLbl ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-primary)]/40'}`}>
          {selLbl || placeholder || '—'}
        </span>
        {value && (
          <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onChange(''); setSelLbl(''); setOpen(false); }}
            className="p-1 rounded text-[var(--text-primary)]/30 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] shrink-0">
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-[var(--text-primary)]/30 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {dd}
    </div>
  );
}

/* ───────────────── atoms ───────────────── */

function Ava({ name, url, sz = 'sm' }: { name?: string | null; url?: string | null; sz?: 'xs' | 'sm' }) {
  const c = sz === 'xs' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-sm';
  if (url) return <img src={url} alt="" className={`${c} rounded-full object-cover shrink-0`} />;
  return (
    <div className={`${c} rounded-full bg-[var(--accent)] flex items-center justify-center font-bold text-white shrink-0 select-none`}>
      {ini(name)}
    </div>
  );
}

function PriBadge({ p }: { p: TaskPriority }) {
  const m = PM[p];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${m.bg} ${m.c} ${m.brd}`}>
      {m.icon}{PRI_LABEL[p]}
    </span>
  );
}

function ComplexityBadge({ v }: { v: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20" title="Сложность">
      <Star className="w-3 h-3" />{v}
    </span>
  );
}

function HoursBadge({ label, value, tone = 'default', title }: {
  label: string; value: unknown; tone?: 'default' | 'accent'; title?: string;
}) {
  const cls = tone === 'accent'
    ? 'bg-green-500/10 text-green-400 border-green-500/20'
    : 'bg-[var(--hover-2)] text-[var(--text-primary)]/55 border-[var(--border-color)]';
  return (
    <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>
      <Clock3 className="w-3 h-3" />{label}: {fmtHours(value)}
    </span>
  );
}

/* ───────────────── list view ───────────────── */

function ListView({ tasks, umap, onView }: {
  tasks: TaskViewItem[];
  umap: Map<string, SimpleUser | CounterpartyCustomer>;
  onView: (t: TaskViewItem) => void;
}) {
  if (!tasks.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[var(--text-primary)]/30 h-full">
        <Layers className="w-12 h-12 mb-3" />
        <p className="text-sm">Задач нет</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden h-full flex flex-col">
      <div className="overflow-auto flex-1 scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--hover-1)] border-b border-[var(--border-color)] sticky top-0 z-10">
            <tr className="text-[var(--text-primary)]/50 text-xs">
              <th className="px-4 py-3 font-medium">Задача</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Приоритет</th>
              <th className="px-4 py-3 font-medium">Исполнитель</th>
              <th className="px-4 py-3 font-medium">Срок</th>
              <th className="px-4 py-3 font-medium">Трудозатраты (План)</th>
              <th className="px-4 py-3 font-medium">Трудозатраты (Факт)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {tasks.map((t) => {
              const a = t.assignee_id ? umap.get(t.assignee_id) : null;
              const cm = CM[t.status];
              const od = overdue(t);
              const ticketNo = getTaskTicketNumber(t);
              return (
                <tr key={t.id} onClick={() => onView(t)} className="hover:bg-[var(--hover-1)] cursor-pointer transition-colors align-top">
                  <td className="px-4 py-3 min-w-[320px]">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="font-mono text-[var(--text-primary)]/40 text-xs shrink-0">#{t.number}</span>
                        {ticketNo && (
                          <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] bg-[var(--hover-2)] text-[var(--text-primary)]/45 border border-[var(--border-color)]">
                            <Ticket className="w-3 h-3" />{ticketNo}
                          </span>
                        )}
                      </div>
                      <div className="text-[var(--text-primary)] font-medium leading-snug">{t.title}</div>
                      {t.description && <div className="text-xs text-[var(--text-primary)]/45 line-clamp-2 max-w-[420px]">{t.description}</div>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${cm.chip}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cm.dot}`} />{ST_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <PriBadge p={t.priority} />
                      {t.story_points != null && <ComplexityBadge v={t.story_points} />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a ? (
                      <div className="flex items-center gap-2">
                        <Ava name={a.full_name || a.username} url={a.avatar_url} sz="xs" />
                        <span className="text-[var(--text-primary)]/70 truncate max-w-[140px] text-sm">{a.full_name || a.username}</span>
                      </div>
                    ) : <span className="text-[var(--text-primary)]/30">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {t.due_date ? (
                      <span className={`text-sm ${od ? 'text-red-400 font-medium' : 'text-[var(--text-primary)]/50'}`}>{fmtTaskDue(t)}</span>
                    ) : <span className="text-[var(--text-primary)]/30">—</span>}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-primary)]/60 whitespace-nowrap" title="Плановые трудозатраты">{fmtHours(t.estimated_hours)}</td>
                  <td className="px-4 py-3 text-[var(--text-primary)]/60 whitespace-nowrap">{fmtHours(t.actual_hours)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────── task card ───────────────── */


interface TCardProps {
  task: TaskViewItem;
  umap: Map<string, SimpleUser | CounterpartyCustomer>;
  dragging: boolean;
  highlighted: boolean;
  onDS: (id: string, f: TaskStatus) => void;
  onDE: () => void;
  onView: (t: TaskViewItem) => void;
}

export const TCard = memo(function TCard({
  task: t,
  umap,
  dragging,
  highlighted,
  onDS,
  onDE,
  onView,
}: TCardProps) {
  const od = overdue(t);
  const a = t.assignee_id ? umap.get(t.assignee_id) : null;
  const assigneeSurname = a
    ? (a.full_name || a.username || '').split(' ')[0]
    : null;

  const hasAttachments =
    Array.isArray((t as any).attachments) && (t as any).attachments.length > 0;

  return (
    <div
      data-task-id={t.id}
      draggable
      onDragStart={(e) => {
        (e as any).dataTransfer.effectAllowed = 'move';
        onDS(t.id, t.status);
      }}
      onDragEnd={onDE}
      onClick={() => onView(t)}
      className={`group bg-[var(--bg-card)] border rounded-xl px-4 py-3.5 cursor-pointer shadow-sm min-h-[140px] flex flex-col relative
        transition-[border-color,background-color,box-shadow,opacity] duration-200
        hover:bg-[var(--hover-2)] hover:border-[var(--accent)]/40

        ${highlighted
          ? 'border-2 border-emerald-500 bg-emerald-500/[0.06]'
          : ''
        }

        ${dragging
          ? 'opacity-35 rotate-2 scale-[1.02] shadow-xl z-50 ring-2 ring-[var(--accent)]'
          : od
            ? 'border-red-500/40 bg-red-500/5 hover:bg-red-500/15'
            : highlighted
              ? ''
              : 'border-[var(--border-color)]'
        }`}
    >
      {highlighted && (
        <div className="absolute top-2.5 right-3 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-[10px] font-semibold">
          Перенесено
        </div>
      )}
      <span className="text-xs font-mono text-[var(--text-primary)]/45 mb-1.5 leading-none">
        #{t.number}
      </span>

      <h4 className="text-[15px] font-bold text-[var(--text-primary)] leading-snug tracking-tight line-clamp-2 mb-3">
        {t.title}
      </h4>

      <div className="flex items-center gap-2 mb-3.5 flex-wrap">
        <PriBadge p={t.priority} />
        {t.story_points != null && <ComplexityBadge v={t.story_points} />}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3 mt-auto">
        <div className="flex items-center gap-2 min-w-0">
          {a ? (
            <>
              <Ava
                name={a.full_name || a.username}
                url={a.avatar_url}
                sz="xs"
              />
              <span className="text-[13px] text-[var(--text-primary)]/75 font-medium truncate max-w-[100px]">
                {assigneeSurname}
              </span>
            </>
          ) : (
            <span className="text-xs text-[var(--text-primary)]/30">—</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">

          {hasAttachments && (
            <Paperclip className="w-4.5 h-4.5 text-[var(--text-primary)]/30" />
          )}
          {t.ticket_id && (
            <Ticket className="w-4.5 h-4.5 text-[var(--text-primary)]/30" />
          )}

          {t.project_id && (
            <FolderOpen className="w-4.5 h-4.5 text-[var(--text-primary)]/30" />
          )}

          {t.due_date && (
            <span
              className={`text-[12px] font-semibold ml-0.5 ${od
                ? 'text-red-400'
                : 'text-[var(--text-primary)]/45'
                }`}
            >
              {fmtTaskDue(t)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
/* ───────────────── kanban column ───────────────── */

function KCol({
  col,
  umap,
  isDO,
  dragId,
  highlightTaskId,
  ldMore,
  onDS,
  onDE,
  onDO,
  onDL,
  onDrop,
  onAdd,
  onView,
  onMore,
}: {
  col: TaskViewColumn;
  umap: Map<string, SimpleUser | CounterpartyCustomer>;
  isDO: boolean;
  dragId: string | null;
  highlightTaskId: string | null;
  ldMore: boolean;
  onDS: (id: string, f: TaskStatus) => void;
  onDE: () => void;
  onDO: (e: React.DragEvent, s: TaskStatus) => void;
  onDL: () => void;
  onDrop: (e: React.DragEvent, s: TaskStatus) => void;
  onAdd: (s: TaskStatus) => void;
  onView: (t: TaskViewItem) => void;
  onMore: (s: TaskStatus) => void;
}) {
  const m = CM[col.status];
  const I = m.icon;

  return (
    <div
      onDragOver={(e) => onDO(e, col.status)}
      onDragLeave={onDL}
      onDrop={(e) => onDrop(e, col.status)}
      className={`bg-[var(--hover-1)] rounded-xl flex flex-col w-[320px] shrink-0 border transition-colors h-full ${isDO ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border-color)]'
        }`}
    >
      <div className="px-3 py-3 flex items-center justify-between border-b border-[var(--border-color)] shrink-0 bg-[var(--bg-card)] rounded-t-xl">
        <div className="flex items-center gap-2 min-w-0">
          <I className={`w-4 h-4 shrink-0 ${m.tc}`} />
          <span className="text-sm font-bold text-[var(--text-primary)] truncate">
            {ST_LABEL[col.status]}
          </span>
          <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--hover-2)] text-[var(--text-primary)]/50 shrink-0">
            {col.tasks.total_items}
          </span>
        </div>
        <button
          onClick={() => onAdd(col.status)}
          className="p-1.5 rounded-lg hover:bg-[var(--hover-3)] text-[var(--text-primary)]/40 hover:text-[var(--accent)] transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="p-2.5 flex-1 space-y-2.5 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--hover-3)] scrollbar-track-transparent">
        {col.tasks.items.length === 0 && !isDO ? (
          <div className="h-24 flex flex-col items-center justify-center text-[var(--text-primary)]/30 border border-dashed border-[var(--border-color)] rounded-xl">
            <Layers className="w-5 h-5 mb-1 opacity-50" />
            <span className="text-xs">{m.empty}</span>
          </div>
        ) : (
          col.tasks.items.map((t) => (
            <TCard
              key={t.id}
              task={t}
              umap={umap}
              dragging={dragId === t.id}
              highlighted={highlightTaskId === t.id}
              onDS={onDS}
              onDE={onDE}
              onView={onView}
            />
          ))
        )}

        {isDO && col.tasks.items.length === 0 && (
          <div className="h-24 flex items-center justify-center border-2 border-dashed border-[var(--accent)]/50 rounded-xl bg-[var(--accent)]/10">
            <span className="text-sm font-medium text-[var(--accent)]">
              Отпустите задачу
            </span>
          </div>
        )}

        {col.tasks.has_next && (
          <button
            onClick={() => onMore(col.status)}
            disabled={ldMore}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[var(--text-primary)]/40 hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)] text-xs font-medium transition-colors disabled:opacity-40"
          >
            {ldMore ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            Ещё ({Math.max(col.tasks.total_items - col.tasks.items.length, 0)})
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────────────── drag panel ───────────────── */

function DragPanel({
  task,
  onDrop,
}: {
  task: {
    id: string;
    from: TaskStatus;
    title: string;
    number: string;
  } | null;
  onDrop: (e: React.DragEvent, to: TaskStatus) => void;
}) {
  const [hov, setHov] = useState<TaskStatus | null>(null);

  if (!task) return null;

  const available = TRANSITIONS[task.from];

  return createPortal(
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 50, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed right-4 top-1/2 -translate-y-1/2 z-[100] pointer-events-none"
    >
      <div className="w-[310px] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden pointer-events-auto">
        <div className="px-4 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-primary)]/40 font-semibold mb-2">
            Вы переносите
          </p>

          <div className="flex items-start gap-2.5">

            <div className="min-w-0">
              <div className="text-xs font-mono font-bold text-[var(--accent)]">
                # <span className="text-xs font-mono font-bold text-[var(--text-primary)]" >{task.number} </span>
              </div>

              <div className="text-sm font-bold text-[var(--text-primary)] leading-snug mt-1 line-clamp-3">
                {task.title}
              </div>

              <div className="text-[11px] text-[var(--text-primary)]/40 mt-2">
                Сейчас: {ST_LABEL[task.from]}
              </div>
            </div>
          </div>
        </div>

        <div className="px-3 pt-3 pb-1">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-primary)]/30 font-semibold">
            Переместить в
          </div>
        </div>

        <div className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
          {available.map((s) => {
            const c = CM[s];
            const I = c.icon;
            const active = hov === s;

            return (
              <div
                key={s}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setHov(s);
                }}
                onDragLeave={() => setHov(null)}
                onDrop={(e) => {
                  setHov(null);
                  onDrop(e, s);
                }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all ${active
                  ? `${c.brd} bg-[var(--accent)]/10 scale-[1.015] shadow-sm`
                  : 'border-transparent hover:bg-[var(--hover-2)]'
                  }`}
              >
                <div className={`w-1 h-6 rounded-full ${c.dot}`} />
                <I className={`w-4 h-4 ${c.tc}`} />

                <span
                  className={`text-sm font-medium flex-1 ${active
                    ? c.tc
                    : 'text-[var(--text-primary)]/70'
                    }`}
                >
                  {ST_LABEL[s]}
                </span>

                {active && (
                  <Check className={`w-4 h-4 ${c.tc}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}

/* ───────────────── assign modal ───────────────── */

function AssignModal({ task, targetStatus, umap, loading, onClose, onOk }: {
  task: TaskViewItem;
  targetStatus: 'todo' | 'in_progress';
  umap: Map<string, SimpleUser | CounterpartyCustomer>;
  loading: boolean;
  onClose: () => void;
  onOk: (id: string) => Promise<void>;
}) {
  const [aid, setAid] = useState(task.assignee_id ?? '');
  const opts: DDOpt[] = Array.from(umap.values()).map((u) => ({
    value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email,
  }));

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, loading]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><UserCheck className="w-5 h-5 text-amber-500" /></div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Назначить исполнителя</h2>
              <p className="text-sm text-[var(--text-primary)]/50">Это обязательно для перевода в «В работе»</p>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-[var(--hover-2)] p-3 border border-[var(--border-color)]">
            <span className="text-xs font-mono text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">{task.number}</span>
            <p className="text-sm font-medium text-[var(--text-primary)] mt-1.5">{task.title}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]/60 mb-1.5">Исполнитель <span className="text-red-400">*</span></label>
            <SelectDD value={aid} onChange={setAid} options={opts} placeholder="Выберите исполнителя" icon={UserCheck} searchable />
          </div>
        </div>
        <div className="flex justify-end gap-2.5 px-5 py-3.5 border-t border-[var(--border-color)] bg-[var(--hover-1)]">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 text-sm font-medium hover:bg-[var(--hover-3)] disabled:opacity-50">Отмена</button>
          <button onClick={() => onOk(aid)} disabled={!aid || loading} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-40 hover:bg-[var(--accent)]/90">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── complete modal ───────────────── */

function CompleteModal({ task, loading, onClose, onOk }: {
  task: TaskViewItem;
  loading: boolean;
  onClose: () => void;
  onOk: (actualHours: number) => Promise<void>;
}) {
  const defaultActual = toNumberOrNull(task.estimated_hours);
  const [actual, setActual] = useState(defaultActual != null ? String(defaultActual) : '');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, loading]);

  const actualNum = actual === '' ? null : Number(actual);
  const valid = actualNum != null && Number.isFinite(actualNum) && actualNum >= 0;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-500" /></div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Перевод в «Выполнено»</h2>
              <p className="text-sm text-[var(--text-primary)]/50">Укажите фактические трудозатраты</p>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-[var(--hover-2)] p-3 border border-[var(--border-color)]">
            <span className="text-xs font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">{task.number}</span>
            <p className="text-sm font-medium text-[var(--text-primary)] mt-1.5">{task.title}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] px-4 py-3">
            <div className="text-xs text-[var(--text-primary)]/45 mb-1" title="Плановые трудозатраты">Трудозатраты (ч)</div>
            <div className="text-sm font-medium text-[var(--text-primary)]">{fmtHours(task.estimated_hours)}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Факт (ч) <span className="text-red-400">*</span></label>
            <input type="number" min="0" step="0.5" value={actual} onChange={(e) => setActual(e.target.value)} className={INP} autoFocus placeholder="Введите фактические трудозатраты" />
            <p className="mt-1.5 text-xs text-[var(--text-primary)]/40">По умолчанию подставлены плановые трудозатраты.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 px-5 py-3.5 border-t border-[var(--border-color)] bg-[var(--hover-1)]">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 text-sm font-medium hover:bg-[var(--hover-3)] disabled:opacity-50">Отмена</button>
          <button onClick={() => valid && onOk(actualNum)} disabled={!valid || loading} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium disabled:opacity-40 hover:bg-emerald-500/90">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Завершить
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── task editor modal ───────────────── */

function TaskEditorModal({ mode, task, initSt, context, ticketLabel, onClose, onSaved }: {
  mode: 'create' | 'edit';
  task?: TaskViewItem | null;
  initSt?: TaskStatus;
  context: TaskKanbanContext;
  ticketLabel?: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();

  const navigate = useNavigate();
  const [baseTicket, setBaseTicket] = useState<any | null>(null);
  const [baseTicketCreator, setBaseTicketCreator] = useState<SimpleUser | null>(null);

  const requesterLabel =
    baseTicketCreator?.full_name ||
    baseTicketCreator?.username ||
    baseTicketCreator?.email ||
    (baseTicket?.created_by ? `ID: ${baseTicket.created_by}` : '');

  const [deleteAttachmentIntent, setDeleteAttachmentIntent] =
    useState<TaskAttachment | null>(null);

  const [deletingAttachmentId, setDeletingAttachmentId] =
    useState<string | null>(null);

  const [title, setTitle] = useState(task?.title ?? '');
  const [descriptionBlocks, setDescriptionBlocks] =
    useState<DescriptionBlock[]>(() =>
      deserializeToBlocks(task?.description ?? ''),
    );
  const [pri, setPri] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [sp, setSp] = useState(task?.story_points != null ? String(task.story_points) : '');
  const [estimatedHours, setEstimatedHours] = useState(
    task?.estimated_hours != null ? String(toNumberOrNull(task.estimated_hours) ?? '') : '',
  );
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ?? '');
  const [ticketId, setTicketId] = useState(
    task?.ticket_id ?? (context.type === 'ticket' ? context.ticket_id : ''),
  );
  const [projectId, setProjectId] = useState(
    task?.project_id ?? (context.type === 'project' ? context.project_id : ''),
  );
  const [todo, setTodo] = useState(initSt === 'todo' && !!assigneeId);
  const [saving, setSaving] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [localFileUrls, setLocalFileUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragOver, setIsDragOver] = useState(false);

  const [previewItem, setPreviewItem] = useState<AttachmentPreviewItem | null>(null);
  const [existingAttachments, setExistingAttachments] =
    useState<TaskAttachment[]>(() =>
      Array.isArray(task?.attachments)
        ? task.attachments
        : [],
    );

  const firstProjectChange = useRef(true);



  useEffect(() => {
    if (!assigneeId && todo) setTodo(false);
  }, [assigneeId, todo]);



  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose, saving]);

  useEffect(() => {
    if (firstProjectChange.current) { firstProjectChange.current = false; return; }
    setTicketId('');
  }, [projectId]);

  useEffect(() => {
    const next: Record<string, string> = {};
    files.forEach((file, index) => {
      next[buildPendingFileKey(file, index)] = URL.createObjectURL(file);
    });
    setLocalFileUrls(next);
    return () => {
      Object.values(next).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected].slice(0, 10));
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files || []);
    setFiles((prev) => [...prev, ...droppedFiles].slice(0, 10));
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const isAttachmentUsedInDescription = useCallback(
    (attachmentId: string) =>
      descriptionBlocks.some(
        (block) =>
          block.type === 'image' &&
          block.attachmentId === attachmentId,
      ),
    [descriptionBlocks],
  );

  const requestDeleteAttachment = (
    attachment: TaskAttachment,
  ) => {
    if (!attachment.id) return;

    if (
      isAttachmentUsedInDescription(
        attachment.id,
      )
    ) {
      toast({
        title: 'Файл используется в описании',
        description:
          'Сначала удалите изображение из описания задачи и сохраните изменения.',
        variant: 'destructive',
      });

      return;
    }

    setDeleteAttachmentIntent(
      attachment,
    );
  };

  const deleteExistingAttachment = async () => {
    const attachment = deleteAttachmentIntent;

    if (!attachment?.id) return;

    setDeletingAttachmentId(attachment.id);

    try {
      await attachmentsApi.deleteAttachment(
        attachment.id,
      );

      setExistingAttachments((prev) =>
        prev.filter(
          (item) =>
            item.id !== attachment.id,
        ),
      );

      setDeleteAttachmentIntent(null);

      toast({
        title: 'Файл откреплён',
        description:
          getAttachmentName(attachment),
      });
    } catch (e: any) {
      toast({
        title: 'Не удалось открепить файл',
        description: apiErr(e),
        variant: 'destructive',
      });
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const loadProjects = useCallback(async (q: string, p: number) => {
    const r = await projectsApi.getAll(p, 20);
    const f = q
      ? r.items.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()) || x.key.toLowerCase().includes(q.toLowerCase()))
      : r.items;
    return {
      items: f.map((x) => ({ value: x.id, label: x.name, sublabel: x.key, icon: <FolderOpen className="w-4 h-4 text-amber-400" /> })),
      hasNext: r.items.length === 20,
    };
  }, []);

  const loadUsers = useCallback(async (q: string, p: number) => {
    let items: any[] = [];
    try { items = (await usersApi.getAllUsers(p, 20)).items; } catch { items = []; }
    const f = q
      ? items.filter((u) => (u.full_name || '').toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()))
      : items;
    return {
      items: f.map((u) => ({ value: u.id, label: u.full_name || u.username || u.email, sublabel: u.email })),
      hasNext: items.length === 20,
    };
  }, []);

  const loadTickets = useCallback(async (q: string, p: number) => {
    const r = await ticketsApi.getAll(p, 20, {
      project_ids: projectId ? [projectId] : undefined,
      query: q || undefined,
    });
    return {
      items: r.items.map((t: any) => ({
        value: t.id,
        label: `${t.number} — ${t.title}`,
        icon: <Ticket className="w-4 h-4 text-[var(--text-primary)]/40" />,
      })),
      hasNext: r.items.length === 20,
    };
  }, [projectId]);

  const uploadInlineImages = async (
    blocks: DescriptionBlock[],
    taskId: string,
  ): Promise<DescriptionBlock[]> => {
    const result: DescriptionBlock[] = [];

    for (const block of blocks) {
      if (
        block.type === 'image' &&
        block.localFile &&
        !block.attachmentId
      ) {
        const uploaded =
          await attachmentsApi.uploadAttachment(
            block.localFile,
            'task',
            taskId,
          );

        result.push({
          ...block,
          attachmentId: uploaded.id,
          localFile: undefined,
        });

        continue;
      }

      result.push(block);
    }

    return result;
  };

  useEffect(() => {
    if (mode !== 'create' || context.type !== 'ticket' || !context.ticket_id) return;

    let cancelled = false;

    (async () => {
      try {
        setBaseTicket(null);
        setBaseTicketCreator(null);

        const ticket = await ticketsApi.getById(context.ticket_id);
        if (cancelled) return;

        setBaseTicket(ticket);

        if (ticket.project_id) {
          setProjectId(ticket.project_id);
          firstProjectChange.current = true;
        }

        if (ticket.priority) {
          setPri(ticket.priority as TaskPriority);
        }

        if (ticket.created_by) {
          try {
            const u = await usersApi.getById(ticket.created_by); // важно: чтобы этот метод был добавлен
            if (!cancelled) setBaseTicketCreator(u);
          } catch { }
        }
      } catch { }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, context.type, context.ticket_id]);

  const submit = async () => {
    if (!title.trim()) return;

    setSaving(true);

    try {
      let taskId = task?.id;

      if (mode === 'create') {
        /*
         * Сначала создаём задачу.
         *
         * Inline-картинки ещё нельзя загрузить,
         * поскольку attachment требует taskId.
         */
        const initialDescription = serializeBlocks(
          descriptionBlocks.filter(
            (b) =>
              b.type !== 'image' ||
              !!b.attachmentId,
          ),
        );

        const payload: Record<string, any> = {
          title: title.trim(),
          priority: pri,
        };

        if (initialDescription.trim()) {
          payload.description = initialDescription;
        }

        if (projectId) payload.project_id = projectId;
        if (ticketId) payload.ticket_id = ticketId;
        if (sp) payload.story_points = Number(sp);

        if (estimatedHours) {
          payload.estimated_hours = Number(estimatedHours);
        }

        if (assigneeId) payload.assignee_id = assigneeId;
        if (dueDate) payload.due_date = dueDate;

        const created = await tasksApi.create(
          payload as TaskCreateInput,
        );

        taskId = created.id;

        /*
         * Теперь taskId существует:
         * загружаем картинки, вставленные непосредственно
         * в описание.
         */
        const preparedBlocks = await uploadInlineImages(
          descriptionBlocks,
          created.id,
        );

        const finalDescription =
          serializeBlocks(preparedBlocks);

        if (
          finalDescription !== initialDescription
        ) {
          await tasksApi.update(created.id, {
            description: finalDescription || null,
          } as TaskUpdateInput);
        }

        /*
         * Обычные вложения.
         */
        for (const file of files) {
          try {
            await attachmentsApi.uploadAttachment(
              file,
              'task',
              created.id,
            );
          } catch (err) {
            console.error(
              'File upload failed:',
              file.name,
              err,
            );
          }
        }

        if (todo) {
          await tasksApi.changeStatus(created.id, 'todo');
        }

        toast({
          title: 'Задача создана',
          description: `${created.number} — ${created.title}`,
        });
      } else if (task) {
        /*
         * При редактировании ID уже известен,
         * поэтому картинки можно загрузить до update.
         */
        const preparedBlocks = await uploadInlineImages(
          descriptionBlocks,
          task.id,
        );

        const finalDescription =
          serializeBlocks(preparedBlocks);

        const payload: Record<string, any> = {};

        if (title.trim() !== task.title) {
          payload.title = title.trim();
        }

        if (
          finalDescription.trim() !==
          (task.description?.trim() ?? '')
        ) {
          payload.description =
            finalDescription.trim() || null;
        }

        if (pri !== task.priority) {
          payload.priority = pri;
        }

        const currentSP =
          task.story_points != null
            ? String(task.story_points)
            : '';

        if (sp !== currentSP) {
          payload.story_points = sp
            ? Number(sp)
            : null;
        }

        const currentEst =
          task.estimated_hours != null
            ? String(
              toNumberOrNull(
                task.estimated_hours,
              ) ?? '',
            )
            : '';

        if (estimatedHours !== currentEst) {
          payload.estimated_hours =
            estimatedHours
              ? Number(estimatedHours)
              : null;
        }

        if (dueDate !== (task.due_date ?? '')) {
          payload.due_date = dueDate || null;
        }

        if (
          assigneeId !==
          (task.assignee_id ?? '')
        ) {
          payload.assignee_id =
            assigneeId || null;
        }

        if (
          projectId !==
          (task.project_id ?? '')
        ) {
          payload.project_id =
            projectId || null;
        }

        if (
          ticketId !==
          (task.ticket_id ?? '')
        ) {
          payload.ticket_id =
            ticketId || null;
        }

        if (Object.keys(payload).length > 0) {
          await tasksApi.update(
            task.id,
            payload as TaskUpdateInput,
          );
        }

        /*
         * Новые обычные вложения.
         */
        for (const file of files) {
          try {
            await attachmentsApi.uploadAttachment(
              file,
              'task',
              task.id,
            );
          } catch (err) {
            console.error(
              'File upload failed:',
              file.name,
              err,
            );
          }
        }

        toast({
          title: 'Задача обновлена',
          description: `${task.number} — ${title.trim()}`,
        });
      }

      await onSaved();
      onClose();
    } catch (e: any) {
      toast({
        title: 'Ошибка',
        description: apiErr(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const titleText = mode === 'create' ? 'Создание задачи' : 'Редактирование задачи';
  const subtitleText = mode === 'create' ? 'Проверьте заполнение' : `Изменение задачи ${task?.number ?? ''}`;
  const lockTicket = context.type === 'ticket' && mode === 'create';



  const getTicketRequester = (t: any) => {
    return (
      t?.requester?.full_name ||
      t?.requester?.email ||
      t?.requester_name ||
      t?.created_by_user?.full_name ||
      t?.created_by_user?.email ||
      t?.created_by?.full_name ||
      t?.created_by?.email ||
      t?.author?.full_name ||
      t?.author?.email ||
      t?.created_by_full_name ||
      t?.created_by_email ||
      ''
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 md:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div
        className="relative w-full max-w-7xl h-[94vh] flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--border-color)] bg-[var(--hover-1)] shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                {mode === 'create' ? <Plus className="w-4 h-4 text-[var(--accent)]" /> : <Pencil className="w-4 h-4 text-[var(--accent)]" />}
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">{titleText}</h2>
                <p className="text-sm text-[var(--text-primary)]/50">{subtitleText}</p>
              </div>
            </div>
          </div>
          <button onClick={() => !saving && onClose()} className="p-1.5 rounded-lg hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 lg:p-8">
          <div className="grid xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.75fr)] gap-8">
            {/* LEFT */}
            <div className="space-y-4">
              {/* Название */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">
                  Название <span className="text-red-400">*</span>
                </label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Что нужно сделать?" autoFocus className={INP} />
              </div>

              {/* Описание */}
              <div>
                <label className="block text-base font-semibold text-[var(--text-primary)] mb-3">
                  Описание
                </label>

                <TicketEditor
                  blocks={descriptionBlocks}
                  onChange={setDescriptionBlocks}
                />

                <p className="mt-2 text-xs text-[var(--text-primary)]/35">
                  Изображение можно вставить кнопкой, перетащить сюда или вставить из буфера обмена.
                </p>
              </div>

              {/* Вложения */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-[var(--text-primary)]/70">
                  Вложения <span className="text-[var(--text-primary)]/40 text-xs">(до 10 файлов)</span>
                </label>

                {mode === 'edit' && (
                  <div>
                    <div className="text-xs font-medium text-[var(--text-primary)]/45 mb-2">Уже прикреплено</div>
                    {existingAttachments.length > 0 ? (
                      <div className="space-y-2">
                        {existingAttachments.map((att, i) => (
                          <TaskAttachmentItem
                            key={att.id ?? `${getAttachmentName(att)}-${i}`}
                            attachment={att}
                            onPreview={setPreviewItem}
                            onDelete={requestDeleteAttachment}
                            deleting={!!att.id && deletingAttachmentId === att.id}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)] text-sm text-[var(--text-primary)]/35">
                        У задачи пока нет вложений
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="text-xs font-medium text-[var(--text-primary)]/45 mb-2">
                    {mode === 'edit' ? 'Добавить новые файлы' : 'Файлы'}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`w-full border-2 border-dashed rounded-xl p-4 text-center transition-colors group ${isDragOver
                      ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                      : 'border-[var(--border-color)] bg-[var(--hover-1)] hover:bg-[var(--hover-2)] hover:border-[var(--accent)]/30'
                      }`}
                  >
                    <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />
                    <div className="flex flex-col items-center gap-2">
                      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-colors ${isDragOver
                        ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30'
                        : 'bg-[var(--hover-3)] border-[var(--border-color)] group-hover:bg-[var(--accent)]/10 group-hover:border-[var(--accent)]/30'
                        }`}>
                        <Plus className={`w-6 h-6 transition-colors ${isDragOver ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/40 group-hover:text-[var(--accent)]'}`} />
                      </div>
                      <div>
                        <p className="text-sm text-[var(--accent)] font-medium">
                          {isDragOver ? 'Отпустите файлы' : 'Выбрать файлы'}
                        </p>
                        <p className="text-xs text-[var(--text-primary)]/40 mt-0.5">или перетащите их сюда</p>
                      </div>
                    </div>
                  </button>
                </div>

                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((f, i) => {
                      const key = buildPendingFileKey(f, i);
                      const fileUrl = localFileUrls[key];
                      const isImg = isImageFile(f);
                      const typeLabel = getLocalFileTypeLabel(f);
                      return (
                        <div key={key} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)]">
                          <button
                            type="button"
                            onClick={() => fileUrl && setPreviewItem({ name: f.name, url: fileUrl, size: f.size, mimeType: f.type, extension: typeLabel, isImage: isImg })}
                            className="flex items-center gap-3 min-w-0 flex-1 text-left"
                          >
                            {isImg && fileUrl ? (
                              <img src={fileUrl} alt={f.name} className="w-10 h-10 rounded-lg object-cover border border-[var(--border-color)] shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-[var(--hover-3)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
                                <FileIcon className="w-4 h-4 text-[var(--text-primary)]/40" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm text-[var(--text-primary)] truncate">{f.name}</p>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--hover-1)] text-[var(--text-primary)]/45 border border-[var(--border-color)] shrink-0">{typeLabel}</span>
                              </div>
                              <p className="text-[10px] text-[var(--text-primary)]/30">{formatFileSize(f.size)}</p>
                            </div>
                          </button>
                          <button type="button" onClick={() => removeFile(i)} className="text-[var(--text-primary)]/40 hover:text-red-400 p-1 shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT */}
            <div className="space-y-4">
              {/* Проект */}
              {/* Проект */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">
                  Проект
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <AsyncDD
                      value={projectId}
                      onChange={setProjectId}
                      loadFn={loadProjects}
                      placeholder="Не выбран"
                      icon={FolderOpen}
                    />
                  </div>

                  {projectId && (
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${projectId}`)}
                      title="Перейти к проекту"
                      className="flex h-[42px] w-[42px] shrink-0 items-center justify-center
                   rounded-xl border border-[var(--border-color)]
                   bg-[var(--hover-1)] text-[var(--text-primary)]/60
                   transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--accent)]"
                    >
                      <ArrowRight size={18} />
                    </button>
                  )}
                </div>
              </div>

              {/* Заявка */}
              {!lockTicket && (
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">
                    Заявка
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <AsyncDD
                        value={ticketId}
                        onChange={setTicketId}
                        loadFn={loadTickets}
                        placeholder="Выберите заявку"
                        icon={Ticket}
                        wide
                      />
                    </div>

                    {ticketId && (
                      <button
                        type="button"
                        onClick={() => navigate(`/tickets/${ticketId}`)}
                        title="Перейти к заявке"
                        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center
                     rounded-xl border border-[var(--border-color)]
                     bg-[var(--hover-1)] text-[var(--text-primary)]/60
                     transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--accent)]"
                      >
                        <ArrowRight size={18} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {lockTicket && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-center gap-3">
                  <Ticket className="w-5 h-5 text-blue-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      Создание на основании заявки
                    </p>

                    {baseTicket ? (
                      <>
                        <p className="text-xs text-blue-400  mt-0.5">
                          {baseTicket.number} — {baseTicket.title}
                        </p>

                        {!!requesterLabel && (
                          <p className="text-xs text-[var(--text-primary)]/55 truncate">
                            от: {requesterLabel}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-blue-400 truncate mt-0.5">
                        {ticketLabel || 'Заявка будет привязана автоматически'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Приоритет */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Приоритет</label>
                <div className="grid grid-cols-2 gap-2">
                  {PRI_LIST.map((p) => {
                    const m = PM[p.value];
                    return (
                      <button key={p.value} onClick={() => setPri(p.value)}
                        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${pri === p.value ? `${m.bg} ${m.c} ${m.brd}` : 'bg-[var(--hover-1)] text-[var(--text-primary)]/50 border-[var(--border-color)] hover:bg-[var(--hover-2)]'
                          }`}>
                        <span className={`w-2 h-2 rounded-full ${m.dot}`} />{p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Сложность */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">
                  Сложность
                </label>
                <div className="flex flex-wrap gap-2">
                  {SP_SERIES.map((v) => (
                    <button
                      key={v}
                      onClick={() => setSp(String(v))}
                      className={`px-3 py-2 rounded-xl text-sm border transition-all ${sp === String(v)
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                        : 'bg-[var(--hover-1)] text-[var(--text-primary)]/50 border-[var(--border-color)] hover:bg-[var(--hover-2)]'
                        }`}
                    >
                      {v}
                    </button>
                  ))}
                  <button
                    onClick={() => setSp('')}
                    className={`px-3 py-2 rounded-xl text-sm border transition-all ${sp === ''
                      ? 'bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/30'
                      : 'bg-[var(--hover-1)] text-[var(--text-primary)]/50 border-[var(--border-color)] hover:bg-[var(--hover-2)]'
                      }`}
                  >
                    Без сложности
                  </button>
                </div>
              </div>

              {/* Трудозатраты и срок */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5" title="Плановые трудозатраты">Трудозатраты (ч)</label>
                  <input type="number" min="0" step="0.5" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} placeholder="Например 4" className={INP} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Срок</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={INP} />
                </div>
              </div>

              {/* Исполнитель */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-1.5">Исполнитель</label>
                <AsyncDD value={assigneeId} onChange={setAssigneeId} loadFn={loadUsers} placeholder="Не назначен" icon={UserCheck} />
              </div>

              {mode === 'create' && !!assigneeId && (
                <div className="pt-1">
                  <button onClick={() => setTodo((v) => !v)}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all text-sm font-medium ${todo ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'
                      }`}>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${todo ? 'bg-blue-500 border-blue-500' : 'border-[var(--border-color)]'}`}>
                      {todo && <Check className="w-3 h-3 text-white" />}
                    </div>
                    Сразу к выполнению (статус «{ST_LABEL.todo}»)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-[var(--border-color)] bg-[var(--hover-1)] shrink-0">
          <button onClick={() => !saving && onClose()} disabled={saving} className="px-5 py-2.5 rounded-xl bg-[var(--hover-2)] text-[var(--text-primary)]/70 font-medium hover:bg-[var(--hover-3)] disabled:opacity-50 text-sm">Отмена</button>
          <button onClick={submit} disabled={!title.trim() || saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--accent)] text-white font-medium disabled:opacity-40 hover:bg-[var(--accent)]/90 text-sm shadow-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'create' ? <Plus className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            {mode === 'create' ? 'Создать задачу' : 'Сохранить изменения'}
          </button>
        </div>
      </div>

      {previewItem && (
        <AttachmentPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}

      {deleteAttachmentIntent && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { if (!deletingAttachmentId) setDeleteAttachmentIntent(null); }} />
          <div className="relative w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center mb-4">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Открепить файл?</h3>
              <p className="mt-1.5 text-sm text-[var(--text-primary)]/50">Файл будет удалён из вложений задачи.</p>
              <div className="mt-3 px-3 py-2.5 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)] text-sm text-[var(--text-primary)]/70 break-all">
                {getAttachmentName(deleteAttachmentIntent)}
              </div>
            </div>
            <div className="flex border-t border-[var(--border-color)]">
              <button type="button" disabled={!!deletingAttachmentId} onClick={() => setDeleteAttachmentIntent(null)} className="flex-1 py-3 text-sm font-medium text-[var(--text-primary)]/60 hover:bg-[var(--hover-1)] disabled:opacity-40">Отмена</button>
              <button type="button" disabled={!!deletingAttachmentId} onClick={deleteExistingAttachment} className="flex-1 flex items-center justify-center gap-2 py-3 border-l border-[var(--border-color)] text-sm font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-40">
                {deletingAttachmentId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Открепить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────── detail modal ───────────────── */

function DetailModal({
  task: t,
  umap,
  onClose,
  onRefresh,
  onNeedAssign,
  onEdit,
  onNeedComplete,
}: {
  task: TaskViewItem;
  umap: Map<string, SimpleUser | CounterpartyCustomer>;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onNeedAssign: (
    t: TaskViewItem,
    targetStatus: 'todo' | 'in_progress',
  ) => void;
  onEdit: (t: TaskViewItem) => void;
  onNeedComplete: (
    t: TaskViewItem,
    mode: 'status_done' | 'review_done',
  ) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuthStore();

  const [showArchive, setShowArchive] = useState(false);
  const [showSt, setShowSt] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showRR, setShowRR] = useState(false);

  const assignSectionRef = useRef<HTMLElement | null>(null);
  const reviewSectionRef = useRef<HTMLElement | null>(null);

  const [busy, setBusy] = useState('');
  const [aId, setAId] = useState(t.assignee_id ?? '');
  const [rvId, setRvId] = useState('');
  const [previewItem, setPreviewItem] =
    useState<AttachmentPreviewItem | null>(null);

  const assignee = t.assignee_id
    ? umap.get(t.assignee_id)
    : null;

  const cm = CM[t.status];

  const users = Array.from(umap.values());

  const uOpts: DDOpt[] = users.map((u) => ({
    value: u.id,
    label:
      u.full_name ||
      u.username ||
      u.email,
    sublabel: u.email,
  }));

  const isStaff =
    user?.roles?.some((r) =>
      [
        'admin',
        'support_manager',
        'support_agent',
        'executor',
      ].includes(r),
    ) ?? false;

  const statusAsString = String(t.status);

  const revealExpandedSection = useCallback(
    (ref: React.RefObject<HTMLElement | null>) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = contentScrollRef.current;
          const el = ref.current;

          if (!container || !el) return;

          const containerRect = container.getBoundingClientRect();
          const elementRect = el.getBoundingClientRect();

          const padding = 24;

          if (elementRect.bottom > containerRect.bottom - padding) {
            container.scrollBy({
              top:
                elementRect.bottom -
                containerRect.bottom +
                padding,
              behavior: 'smooth',
            });
          } else if (elementRect.top < containerRect.top + padding) {
            container.scrollBy({
              top:
                elementRect.top -
                containerRect.top -
                padding,
              behavior: 'smooth',
            });
          }
        });
      });
    },
    [],
  );

  const canReview =
    (statusAsString === 'to_review' ||
      statusAsString === 'review') &&
    isStaff;



  const canRR = t.status === 'in_progress';

  const canAssign =
    ASSIGN_OK.has(t.status) &&
    users.length > 0;

  const canEdit = EDIT_OK.has(t.status);

  const allowed = TRANSITIONS[t.status];

  const ticketPath = getTaskTicketPath(t);
  const ticketNo = getTaskTicketNumber(t);

  const tags = getTaskTags(t);

  const attachments = Array.isArray(
    t.attachments,
  )
    ? t.attachments
    : [];

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !showArchive
      ) {
        onClose();
      }
    };

    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener(
        'keydown',
        h,
      );
      document.body.style.overflow = '';
    };
  }, [onClose, showArchive]);

  const act = async (
    lbl: string,
    fn: () => Promise<any>,
    msg?: string,
  ) => {
    setBusy(lbl);

    try {
      await fn();

      if (msg) {
        toast({ title: msg });
      }

      await onRefresh();
      onClose();
    } catch (e: any) {
      toast({
        title: 'Ошибка',
        description: apiErr(e),
        variant: 'destructive',
      });
    } finally {
      setBusy('');
    }
  };

  const chSt = async (s: TaskStatus) => {
    if (
      s === 'todo' &&
      t.status === 'backlog' &&
      !t.assignee_id
    ) {
      setShowSt(false);
      onNeedAssign(t, 'todo');
      return;
    }

    if (
      s === 'in_progress' &&
      !t.assignee_id
    ) {
      setShowSt(false);
      onNeedAssign(t, 'in_progress');
      return;
    }

    if (s === 'done') {
      setShowSt(false);
      onNeedComplete(t, 'status_done');
      return;
    }

    setShowSt(false);
    setBusy('st');

    try {
      await tasksApi.changeStatus(
        t.id,
        s,
      );

      toast({
        title: `Статус изменён: ${ST_LABEL[s]}`,
      });

      await onRefresh();
      onClose();
    } catch (e: any) {
      const m = statusErr(e, t, s);

      toast({
        title: m.title,
        description: m.description,
        variant: 'destructive',
      });
    } finally {
      setBusy('');
    }
  };

  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 md:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-7xl h-[94vh] flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-5 px-6 py-5 border-b border-[var(--border-color)] shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 mb-2.5">
              <span className="font-mono text-xs font-medium text-[var(--text-primary)]/45">
                {t.number}
              </span>

              <span className="w-1 h-1 rounded-full bg-[var(--text-primary)]/20" />

              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${cm.tc}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${cm.dot}`}
                />
                {ST_LABEL[t.status]}
              </span>


              {/* Context: Ticket + Project (вверху и подсвечено) */}
              {(ticketPath || t.project_id) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.project_id && (
                    <Link
                      to={`/projects/${t.project_id}`}
                      onClick={onClose}
                      title={t.project_name ?? 'Открыть проект'}
                      className="
          group inline-flex items-center gap-2
          px-3 py-2 rounded-xl
          bg-amber-500/10 border border-amber-500/25
          text-amber-400
          hover:bg-amber-500/15 hover:border-amber-500/40
          transition-colors
        "
                    >
                      <FolderOpen className="w-4 h-4" />
                      <div className="leading-tight">
                        <div className="text-[10px] uppercase tracking-widest text-amber-300/80">
                          Проект
                        </div>
                        <div className="text-sm font-semibold max-w-[420px] truncate">
                          {t.project_name || 'Открыть проект'}
                        </div>
                      </div>

                      <ArrowUpRight className="w-4 h-4 opacity-60 group-hover:opacity-100" />
                    </Link>
                  )}

                  {ticketPath && (
                    <Link
                      to={ticketPath}
                      onClick={onClose}
                      title={ticketNo ?? 'Открыть заявку'}
                      className="
          group inline-flex items-center gap-2
          px-3 py-2 rounded-xl
          bg-violet-500/10 border border-violet-500/25
          text-violet-300
          hover:bg-violet-500/15 hover:border-violet-500/40
          transition-colors
        "
                    >
                      <Ticket className="w-4 h-4" />
                      <div className="leading-tight">
                        <div className="text-[10px] uppercase tracking-widest text-violet-200/80">
                          Заявка
                        </div>
                        <div className="text-sm font-semibold truncate">
                          {ticketNo ?? 'Открыть заявку'}
                        </div>
                      </div>

                      <ArrowUpRight className="w-4 h-4 opacity-60 group-hover:opacity-100" />
                    </Link>
                  )}
                </div>
              )}



            </div>

            <h2 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] leading-snug tracking-tight">
              {t.title}
            </h2>


          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(t)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-base
                             bg-emerald-600 hover:bg-emerald-700
                             text-white font-semibold
                             shadow-sm
                             transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Редактировать
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-[var(--hover-2)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          ref={contentScrollRef}
          className="flex-1 min-h-0 overflow-y-auto p-5 md:p-6"
        >
          {t.status ===
            'in_progress' &&
            !t.assignee_id && (
              <div className="mb-5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-500">
                У задачи нет исполнителя,
                хотя она находится в статусе
                «В работе».
              </div>
            )}

          <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">

            {/* LEFT */}
            <div className="min-w-0 space-y-5">
              {/* Description */}
              <section className="rounded-2xl border border-[var(--border-color)] overflow-hidden bg-[var(--bg-card)]">
                <div className="px-5 py-3.5 border-b border-[var(--border-color)]">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]/70">
                    Описание
                  </h3>
                </div>

                <div className="px-5 py-5 min-h-[240px]">
                  {t.description ? (
                    <TicketDescriptionContent
                      text={t.description}
                      className="text-[15px] text-[var(--text-primary)]/85 leading-7"
                    />
                  ) : (
                    <div className="min-h-[190px] flex items-center justify-center text-sm text-[var(--text-primary)]/30">
                      Описание не заполнено
                    </div>
                  )}
                </div>
              </section>

              {/* Attachments */}
              {attachments.length > 0 && (
                <section className="rounded-2xl border border-[var(--border-color)] overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-color)]">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]/70">
                      Вложения
                    </h3>

                    <span className="text-xs text-[var(--text-primary)]/35">
                      {attachments.length}
                    </span>
                  </div>

                  <div className="p-4 grid md:grid-cols-2 gap-3">
                    {attachments.map(
                      (att, i) => (
                        <TaskAttachmentItem
                          key={
                            att.id ??
                            `${getAttachmentName(
                              att,
                            )}-${i}`
                          }
                          attachment={att}
                          onPreview={
                            setPreviewItem
                          }
                        />
                      ),
                    )}
                  </div>
                </section>
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <section className="rounded-2xl border border-[var(--border-color)] overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-[var(--border-color)]">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]/70">
                      Теги
                    </h3>
                  </div>

                  <div className="px-5 py-4 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={`${tag.name}-${tag.color ?? 'x'}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border"
                        style={{
                          borderColor:
                            tag.color ??
                            'var(--border-color)',
                          color:
                            tag.color ??
                            'var(--text-primary)',
                          background: `${tag.color ??
                            '#888'
                            }14`,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            background:
                              tag.color ??
                              '#888',
                          }}
                        />

                        {tag.name}
                      </span>
                    ))}
                  </div>
                </section>
              )}


            </div>

            {/* RIGHT */}
            <aside className="space-y-4 xl:sticky xl:top-0">
              {/* Details */}
              <section className="rounded-2xl border border-[var(--border-color)] overflow-hidden bg-[var(--bg-card)]">
                <div className="px-4 py-3.5 border-b border-[var(--border-color)]">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Детали
                  </h3>
                </div>

                <div className="divide-y divide-[var(--border-color)]">
                  {/* Priority */}
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <span className="text-sm text-[var(--text-primary)]/45">
                      Приоритет
                    </span>

                    <PriBadge
                      p={t.priority}
                    />
                  </div>

                  {/* Complexity */}
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <span className="text-sm text-[var(--text-primary)]/45">
                      Сложность
                    </span>

                    <span className="text-sm font-medium text-[var(--text-primary)]/80">
                      {t.story_points ??
                        '—'}
                    </span>
                  </div>

                  {/* Assignee */}
                  <div className="px-4 py-3">
                    <div className="text-sm text-[var(--text-primary)]/45 mb-2">
                      Исполнитель
                    </div>

                    {assignee ? (
                      <div className="flex items-center gap-2">
                        <Ava
                          name={
                            assignee.full_name ||
                            assignee.username
                          }
                          url={
                            assignee.avatar_url
                          }
                          sz="xs"
                        />

                        <span className="text-sm font-medium text-[var(--text-primary)]/80 truncate">
                          {assignee.full_name ||
                            assignee.username}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-[var(--text-primary)]/30">
                        Не назначен
                      </span>
                    )}
                  </div>

                  {/* Due date */}
                  <div className="flex items-start justify-between gap-4 px-4 py-3">
                    <span className="text-sm text-[var(--text-primary)]/45">
                      Срок
                    </span>

                    <div className="text-right">
                      <div className="text-sm font-medium text-[var(--text-primary)]/80">
                        {t.due_date
                          ? new Date(
                            getDueTimestamp(t.due_date) ?? t.due_date,
                          ).toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                          : '—'}
                      </div>

                      {t.due_date && overdue(t) && (
                        <div className="mt-0.5 text-[10px] font-medium text-red-400">
                          Срок истёк
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hours */}
                  <div className="px-4 py-3.5">
                    <div className="text-sm text-[var(--text-primary)]/45 mb-2.5">
                      Трудозатраты
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] text-[var(--text-primary)]/35">
                          План
                        </div>

                        <div className="mt-0.5 text-sm font-medium text-[var(--text-primary)]/80">
                          {fmtHours(
                            t.estimated_hours,
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-[var(--text-primary)]/35">
                          Факт
                        </div>

                        <div className="mt-0.5 text-sm font-medium text-[var(--text-primary)]/80">
                          {fmtHours(
                            t.actual_hours,
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Created */}
                  <div className="px-4 py-3.5">
                    <div className="text-sm text-[var(--text-primary)]/45 mb-2.5">
                      Жизненный цикл
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-[var(--text-primary)]/35">
                          Создана
                        </span>

                        <span className="text-xs font-medium text-[var(--text-primary)]/70 text-right">
                          {new Date(t.created_at).toLocaleString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-[var(--text-primary)]/35">
                          Начата
                        </span>

                        <span className="text-xs font-medium text-[var(--text-primary)]/70 text-right">
                          {t.started_at
                            ? new Date(t.started_at).toLocaleString('ru-RU', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                            : '—'}
                        </span>
                      </div>

                      <div className="flex items-start justify-between gap-4">
                        <span className="text-xs text-[var(--text-primary)]/35">
                          Завершена
                        </span>

                        <div className="text-right">
                          <div className="text-xs font-medium text-[var(--text-primary)]/70">
                            {t.completed_at
                              ? new Date(t.completed_at).toLocaleString('ru-RU', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                              : '—'}
                          </div>

                          {t.completed_at && completedLate(t) && (
                            <div className="mt-0.5 text-[10px] text-amber-400">
                              Позже срока
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>



                </div>
              </section>

              {/* Status */}
              <section className="rounded-2xl border border-[var(--border-color)] p-3 bg-[var(--bg-card)]">
                <div className="text-xs text-[var(--text-primary)]/40 mb-2">
                  Статус
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      allowed.length >
                      0 &&
                      setShowSt(
                        (v) => !v,
                      )
                    }
                    disabled={
                      busy !== '' ||
                      !allowed.length
                    }
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--hover-1)] border border-[var(--border-color)] hover:bg-[var(--hover-2)] transition-colors disabled:opacity-50"
                  >
                    {busy === 'st' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]/40" />
                    ) : (
                      <span
                        className={`w-2 h-2 rounded-full ${cm.dot}`}
                      />
                    )}

                    <span className="flex-1 text-left text-sm font-medium text-[var(--text-primary)]">
                      {ST_LABEL[
                        t.status
                      ]}
                    </span>

                    {allowed.length >
                      0 && (
                        <ChevronDown
                          className={`w-4 h-4 text-[var(--text-primary)]/30 transition-transform ${showSt
                            ? 'rotate-180'
                            : ''
                            }`}
                        />
                      )}
                  </button>

                  {showSt && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() =>
                          setShowSt(false)
                        }
                      />

                      <div className="absolute left-0 right-0 bottom-full mb-2 z-20 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-2xl">
                        <div className="p-1.5 max-h-[320px] overflow-y-auto">
                          {allowed.map((s) => {
                            const sm = CM[s];

                            return (
                              <button
                                type="button"
                                key={s}
                                onClick={() => chSt(s)}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)] font-medium transition-colors"
                              >
                                <span className={`w-2 h-2 rounded-full ${sm.dot}`} />

                                <span className="flex-1 text-left">
                                  {ST_LABEL[s]}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* Assignment */}
              {canAssign && (
                <section
                  ref={assignSectionRef}
                  className="rounded-2xl border border-[var(--border-color)] overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => {
                      const opening = !showAssign;

                      setShowAssign(opening);

                      if (opening) {
                        // Заодно закрываем другой раскрытый блок,
                        // чтобы sidebar не разрастался.
                        setShowRR(false);
                        revealExpandedSection(assignSectionRef);
                      }
                    }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm text-[var(--text-primary)]/65 hover:bg-[var(--hover-1)] font-medium transition-colors"
                  >
                    <span>
                      {t.assignee_id
                        ? 'Сменить исполнителя'
                        : 'Назначить исполнителя'}
                    </span>

                    <ChevronDown
                      className={`w-4 h-4 text-[var(--text-primary)]/30 transition-transform ${showAssign
                        ? 'rotate-180'
                        : ''
                        }`}
                    />
                  </button>

                  {showAssign && (
                    <div className="px-4 pb-4 pt-1 space-y-2.5">
                      <SelectDD
                        value={aId}
                        onChange={
                          setAId
                        }
                        options={uOpts}
                        placeholder="Выберите исполнителя"
                        icon={
                          UserCheck
                        }
                        searchable
                      />

                      <button
                        type="button"
                        onClick={() =>
                          act(
                            'assign',
                            () =>
                              tasksApi.assign(
                                t.id,
                                {
                                  assignee_id:
                                    aId,
                                },
                              ),
                            'Исполнитель назначен',
                          )
                        }
                        disabled={
                          !aId ||
                          busy ===
                          'assign'
                        }
                        className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-40"
                      >
                        {busy ===
                          'assign' ? (
                          <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                        ) : (
                          'Сохранить'
                        )}
                      </button>
                    </div>
                  )}
                </section>
              )}

              {/* Review request */}
              {canRR &&
                users.length > 0 && (
                  <section
                    ref={reviewSectionRef}
                    className="rounded-2xl border border-[var(--border-color)] overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const opening = !showRR;

                        setShowRR(opening);

                        if (opening) {
                          setShowAssign(false);
                          revealExpandedSection(reviewSectionRef);
                        }
                      }}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm text-[var(--text-primary)]/65 hover:bg-[var(--hover-1)] font-medium transition-colors"
                    >
                      <span>
                        Отправить на
                        ревью
                      </span>

                      <ChevronDown
                        className={`w-4 h-4 text-[var(--text-primary)]/30 transition-transform ${showRR
                          ? 'rotate-180'
                          : ''
                          }`}
                      />
                    </button>

                    {showRR && (
                      <div className="px-4 pb-4 pt-1 space-y-2.5">
                        <SelectDD
                          value={rvId}
                          onChange={
                            setRvId
                          }
                          options={
                            uOpts
                          }
                          placeholder="Выберите ревьюера"
                          searchable
                        />

                        <button
                          type="button"
                          onClick={() =>
                            act(
                              'rr',
                              () =>
                                tasksApi.requestReview(
                                  t.id,
                                  {
                                    reviewer_id:
                                      rvId,
                                  },
                                ),
                              'Задача отправлена на ревью',
                            )
                          }
                          disabled={
                            !rvId ||
                            busy ===
                            'rr'
                          }
                          className="w-full py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-400 text-sm font-medium disabled:opacity-40 hover:bg-violet-500/15 transition-colors"
                        >
                          {busy ===
                            'rr' ? (
                            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                          ) : (
                            'Отправить'
                          )}
                        </button>
                      </div>
                    )}
                  </section>
                )}

              {/* Review */}
              {canReview && (
                <section className="rounded-2xl border border-[var(--border-color)] p-3">
                  <div className="text-xs text-[var(--text-primary)]/40 mb-2.5">
                    Решение по ревью
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onNeedComplete(
                          t,
                          'review_done',
                        )
                      }
                      disabled={
                        busy === 'rv'
                      }
                      className="py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm font-medium disabled:opacity-50 hover:bg-emerald-500/15 transition-colors"
                    >
                      Принять
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        act(
                          'rv',
                          () =>
                            tasksApi.review(
                              t.id,
                              {
                                decision:
                                  'to_fix',
                              },
                            ),
                          'Задача возвращена на доработку',
                        )
                      }
                      disabled={
                        busy === 'rv'
                      }
                      className="py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm font-medium disabled:opacity-50 hover:bg-red-500/15 transition-colors"
                    >
                      Вернуть
                    </button>
                  </div>
                </section>
              )}
            </aside>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-3.5 border-t border-[var(--border-color)] shrink-0">
          <button
            type="button"
            onClick={() =>
              setShowArchive(true)
            }
            disabled={busy === 'arch'}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-base
                             bg-red-600 hover:bg-red-700
                             text-white font-semibold
                             shadow-sm
                             transition-colors"
          >
            <Archive className="w-4 h-4" />
            В архив
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-base
                             bg-emerald-600 hover:bg-emerald-700
                             text-white font-semibold
                             shadow-sm
                             transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>

      {/* Archive confirmation */}
      {showArchive && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() =>
              setShowArchive(false)
            }
          />

          <div className="relative w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-6 text-center">
              <Archive className="w-9 h-9 text-[var(--text-primary)]/20 mx-auto mb-3" />

              <p className="text-base font-bold text-[var(--text-primary)]">
                Архивировать задачу?
              </p>

              <p className="text-sm text-[var(--text-primary)]/50 mt-1 line-clamp-2">
                {t.title}
              </p>
            </div>

            <div className="flex border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() =>
                  setShowArchive(false)
                }
                className="flex-1 py-3 text-sm text-[var(--text-primary)]/60 hover:bg-[var(--hover-1)] font-medium"
              >
                Отмена
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowArchive(
                    false,
                  );

                  act(
                    'arch',
                    () =>
                      tasksApi.archive(
                        t.id,
                      ),
                    'Задача архивирована',
                  );
                }}
                className="flex-1 py-3 text-sm font-bold text-red-500 hover:bg-red-500/10 border-l border-[var(--border-color)]"
              >
                Архивировать
              </button>
            </div>
          </div>
        </div>
      )}

      {previewItem && (
        <AttachmentPreviewModal
          item={previewItem}
          onClose={() =>
            setPreviewItem(null)
          }
        />
      )}


    </div>
  );
}

/* ───────────────── main page ───────────────── */


/* ───────────────── main page ───────────────── */

export default function TasksPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const up = sp.get('project_id');
  const ua = sp.get('assignee_id');
  const ut = sp.get('ticket_id');
  const shouldCreate = sp.get('create') === '1';

  const boardScrollRef = useRef<HTMLDivElement>(null);
  const boardInnerRef = useRef<HTMLDivElement>(null);
  const bottomTrackRef = useRef<HTMLDivElement>(null);

  // Метрики и анимация скролла
  const scrollbarThumbPercentRef = useRef(20);
  const scrollRafRef = useRef<number | null>(null);

  const [boardScrollWidth, setBoardScrollWidth] = useState(0);
  const [boardViewportWidth, setBoardViewportWidth] = useState(0);

  const scrollbarDragRef = useRef<{
    startX: number;
    startScrollLeft: number;
  } | null>(null);

  const [fixedBoardScrollbarStyle, setFixedBoardScrollbarStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    left: 0,
    width: 0,
    bottom: 12,
    zIndex: 55,
    display: 'none',
  });

  const staff = (user?.roles ?? []).some((r) =>
    ['admin', 'support_manager', 'support_agent', 'executor'].includes(r),
  );

  const [mode, setMode] = useState<CtxMode>(() => {
    if (up) return 'project';
    if (ua) return 'assignee';
    if (ut) return 'ticket';
    return staff ? 'internal' : 'my';
  });

  const [selP, setSelP] = useState(up ?? '');
  const [selA, setSelA] = useState(ua ?? '');
  const [selT, setSelT] = useState(ut ?? '');
  const [selTLabel, setSelTLabel] = useState('');
  const ticketLabelsRef = useRef<Record<string, string>>({});
  const ticketNumbersRef = useRef<Record<string, string>>({});

  const [umap, setUmap] = useState<Map<string, SimpleUser | CounterpartyCustomer>>(new Map());
  const [cols, setCols] = useState<TaskViewColumn[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moreCol, setMoreCol] = useState<TaskStatus | null>(null);

  const [drag, setDrag] = useState<{ id: string; from: TaskStatus } | null>(null);
  const [dragO, setDragO] = useState<TaskStatus | null>(null);

  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [undoingMove, setUndoingMove] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const highlightMovedTask = useCallback((id: string) => {
    setHighlightTaskId(id);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightTaskId(null);
    }, 4000);
  }, []);

  const showUndoMove = useCallback((move: LastMove) => {
    setLastMove(move);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setLastMove(null);
    }, 10000);
  }, []);

  const pauseUndoTimer = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  const resumeUndoTimer = useCallback(() => {
    if (!lastMove) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setLastMove(null);
    }, 4000);
  }, [lastMove]);

  const revealTask = useCallback((id: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const elements = document.querySelectorAll<HTMLElement>('[data-task-id]');
        const element = Array.from(elements).find((el) => el.getAttribute('data-task-id') === id);
        element?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center',
        });
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  const [q, setQ] = useState('');
  const [fp, setFp] = useState<TaskPriority[]>([]);
  const [fo, setFo] = useState(false);
  const [sf, setSf] = useState(false);

  const [view, setView] = useState<TaskViewItem | null>(null);
  const [editTask, setEditTask] = useState<TaskViewItem | null>(null);
  const [create, setCreate] = useState<TaskStatus | null>(null);

  const [assignIntent, setAssignIntent] = useState<AssignIntent | null>(null);
  const [assignLd, setAssignLd] = useState(false);

  const [completeIntent, setCompleteIntent] = useState<CompleteIntent | null>(null);
  const [completeLd, setCompleteLd] = useState(false);
  const [profileUser, setProfileUser] = useState<SimpleUser | CounterpartyCustomer | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  const fpR = useRef(fp);
  const foR = useRef(fo);
  fpR.current = fp;
  foR.current = fo;

  useEffect(() => {
    if (shouldCreate && ut) setCreate('backlog');
  }, [shouldCreate, ut]);

  useEffect(() => {
    if (up) setMode('project');
    else if (ua) setMode('assignee');
    else if (ut) setMode('ticket');
  }, [up, ua, ut]);

  const ctx = useCallback((): TaskKanbanContext => {
    if (mode === 'project' && selP) return { type: 'project', project_id: selP };
    if (mode === 'ticket' && selT) return { type: 'ticket', ticket_id: selT };
    if (mode === 'assignee' && selA) return { type: 'assignee', assignee_id: selA };
    if (mode === 'internal') return { type: 'internal' };
    return { type: 'my' };
  }, [mode, selP, selA, selT]);

  // Прямое обновление позиции thumb без перерисовки React
  const updateThumbPosition = useCallback(() => {
    const board = boardScrollRef.current;
    const track = bottomTrackRef.current;
    const thumb = track?.querySelector<HTMLElement>('[data-scroll-thumb="true"]');

    if (!board || !track || !thumb) return;

    const boardMax = board.scrollWidth - board.clientWidth;
    if (boardMax <= 0) {
      thumb.style.transform = 'translateX(0px)';
      return;
    }

    const progress = Math.min(Math.max(board.scrollLeft / boardMax, 0), 1);
    const trackWidth = track.clientWidth;
    const thumbWidth = thumb.offsetWidth;
    const maxTravel = Math.max(trackWidth - thumbWidth, 0);

    thumb.style.transform = `translateX(${progress * maxTravel}px)`;
  }, []);

  const handleBoardScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      updateThumbPosition();
    });
  }, [updateThumbPosition]);

  const syncBoardScrollbarMetrics = useCallback(() => {
    const board = boardScrollRef.current;
    const inner = boardInnerRef.current;
    const track = bottomTrackRef.current;
    const thumb = track?.querySelector<HTMLElement>('[data-scroll-thumb="true"]');

    if (!board || !inner) {
      setFixedBoardScrollbarStyle((prev) => (prev.display === 'none' ? prev : { ...prev, display: 'none' }));
      return;
    }

    const contentWidth = inner.scrollWidth;
    const viewportWidth = board.clientWidth;
    const rect = board.getBoundingClientRect();

    const hasHorizontalOverflow = contentWidth > viewportWidth + 2;

    const thumbPercent = Math.min(Math.max((viewportWidth / contentWidth) * 100, 8), 100);
    scrollbarThumbPercentRef.current = thumbPercent;

    if (thumb) {
      thumb.style.width = `${thumbPercent}%`;
    }

    setBoardScrollWidth((prev) => (prev === contentWidth ? prev : contentWidth));
    setBoardViewportWidth((prev) => (prev === viewportWidth ? prev : viewportWidth));

    setFixedBoardScrollbarStyle((prev) => {
      const newStyle: React.CSSProperties = {
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        bottom: 12,
        zIndex: 55,
        display: hasHorizontalOverflow ? 'block' : 'none',
        pointerEvents: 'auto',
      };

      if (
        prev.display === newStyle.display &&
        prev.left === newStyle.left &&
        prev.width === newStyle.width &&
        prev.bottom === newStyle.bottom
      ) {
        return prev;
      }
      return newStyle;
    });

    updateThumbPosition();
  }, [updateThumbPosition]);

  useEffect(() => {
    if (viewMode !== 'kanban' || loading || !cols.length) {
      setFixedBoardScrollbarStyle((prev) => ({
        ...prev,
        display: 'none',
      }));
      return;
    }

    const run = () => {
      requestAnimationFrame(syncBoardScrollbarMetrics);
    };

    run();

    const board = boardScrollRef.current;
    const inner = boardInnerRef.current;

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && board && inner) {
      ro = new ResizeObserver(run);
      ro.observe(board);
      ro.observe(inner);
    }

    window.addEventListener('resize', run);
    window.addEventListener('scroll', run);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', run);
      window.removeEventListener('scroll', run);
    };
  }, [viewMode, loading, cols.length, syncBoardScrollbarMetrics]);

  const loadUsersMap = useCallback(async () => {
    const m = new Map<string, SimpleUser | CounterpartyCustomer>();
    try {
      (await usersApi.getAllUsers(1, 100)).items.forEach((u) => m.set(u.id, u));
    } catch {
      /* ignore */
    }
    setUmap(m);
  }, []);

  const fetchBoard = useCallback(
    async (silent = false) => {
      if ((mode === 'project' && !selP) || (mode === 'ticket' && !selT) || (mode === 'assignee' && !selA)) {
        setCols([]);
        setTotal(0);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      silent ? setRefreshing(true) : setLoading(true);
      try {
        const d: any = await tasksApi.getKanban(ctx(), {
          size: 20,
          priorities: fpR.current.length ? fpR.current : undefined,
          overdue_only: foR.current || undefined,
        });
        const mapped: TaskViewColumn[] = COL_ORDER.map((s) =>
          d.columns.find((c: TaskViewColumn) => c.status === s),
        ).filter((c): c is TaskViewColumn => !!c);
        setCols(mapped);
        setTotal(d.total_tasks ?? 0);
      } catch (e: any) {
        toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [ctx, toast, mode, selP, selT, selA],
  );

  useEffect(() => {
    loadUsersMap();
  }, [loadUsersMap]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  useEffect(() => {
    fetchBoard(true);
  }, [fp, fo, fetchBoard]);

  const more = useCallback(
    async (st: TaskStatus) => {
      const c = cols.find((x) => x.status === st);
      if (!c?.tasks.has_next) return;
      setMoreCol(st);
      try {
        const d: any = await tasksApi.getKanban(ctx(), {
          page: c.tasks.page + 1,
          size: c.tasks.size,
          priorities: fpR.current.length ? fpR.current : undefined,
          overdue_only: foR.current || undefined,
        });
        const nc = d.columns.find((x: TaskViewColumn) => x.status === st);
        if (nc) {
          setCols((prev) =>
            prev.map((x) =>
              x.status === st
                ? { ...x, tasks: { ...nc.tasks, items: [...x.tasks.items, ...nc.tasks.items] } }
                : x,
            ),
          );
        }
      } catch (e: any) {
        toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
      } finally {
        setMoreCol(null);
      }
    },
    [cols, ctx, toast],
  );

  const moveTo = useCallback(
    async (id: string, from: TaskStatus, to: TaskStatus) => {
      const src = cols.find((c) => c.status === from);
      const task = src?.tasks.items.find((x) => x.id === id);
      if (!task) return;

      if (to === 'todo' && from === 'backlog' && !task.assignee_id) {
        setAssignIntent({ task, targetStatus: 'todo' });
        return;
      }

      if (to === 'in_progress' && !task.assignee_id) {
        setAssignIntent({ task, targetStatus: 'in_progress' });
        return;
      }

      if (to === 'done') {
        setCompleteIntent({ task, mode: 'status_done' });
        return;
      }

      const snap = snapCols(cols);
      let moved: TaskViewItem | undefined;

      setCols((prev) => {
        const next = prev.map((c) => {
          if (c.status !== from) return c;
          const items = c.tasks.items.filter((x) => {
            if (x.id === id) {
              moved = x;
              return false;
            }
            return true;
          });
          return {
            ...c,
            tasks: {
              ...c.tasks,
              items,
              total_items: Math.max(c.tasks.total_items - 1, 0),
            },
          };
        });

        if (!moved) return prev;

        const updated: TaskViewItem = { ...moved, status: to };

        return next.map((c) =>
          c.status === to
            ? {
              ...c,
              tasks: {
                ...c.tasks,
                items: [updated, ...c.tasks.items.filter((x) => x.id !== id)],
                total_items: c.tasks.total_items + 1,
              },
            }
            : c,
        );
      });

      try {
        await tasksApi.changeStatus(id, to);
        showUndoMove({
          taskId: id,
          number: task.number,
          title: task.title,
          from,
          to,
        });
        highlightMovedTask(id);
        revealTask(id);
        toast({
          title: `Задача перенесена в «${ST_LABEL[to]}»`,
          description: `${task.number} — ${task.title}`,
        });
      } catch (e: any) {
        setCols(snap);
        const message = statusErr(e, task, to);
        toast({
          title: message.title,
          description: message.description,
          variant: 'destructive',
        });
      }
    },
    [cols, toast, highlightMovedTask, revealTask, showUndoMove],
  );

  const handleAssignAndMove = useCallback(
    async (aid: string) => {
      if (!assignIntent) return;
      setAssignLd(true);
      try {
        await tasksApi.assign(assignIntent.task.id, { assignee_id: aid });
        await tasksApi.changeStatus(assignIntent.task.id, assignIntent.targetStatus);
        toast({ title: `Задача переведена в «${ST_LABEL[assignIntent.targetStatus]}»` });
        setAssignIntent(null);
        await fetchBoard(true);
      } catch (e: any) {
        toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
      } finally {
        setAssignLd(false);
      }
    },
    [assignIntent, fetchBoard, toast],
  );

  const handleComplete = useCallback(
    async (actualHours: number) => {
      if (!completeIntent) return;
      setCompleteLd(true);
      try {
        await tasksApi.update(completeIntent.task.id, { actual_hours: actualHours } as any);
        if (completeIntent.mode === 'review_done') {
          await tasksApi.review(completeIntent.task.id, { decision: 'done' });
          toast({ title: 'Задача принята' });
        } else {
          await tasksApi.changeStatus(completeIntent.task.id, 'done');
          toast({ title: 'Задача выполнена' });
        }
        setCompleteIntent(null);
        await fetchBoard(true);
      } catch (e: any) {
        toast({ title: 'Ошибка', description: apiErr(e), variant: 'destructive' });
      } finally {
        setCompleteLd(false);
      }
    },
    [completeIntent, fetchBoard, toast],
  );

  const onDS = useCallback((id: string, from: TaskStatus) => setDrag({ id, from }), []);
  const onDE = useCallback(() => {
    setDrag(null);
    setDragO(null);
  }, []);

  const onDO = useCallback(
    (e: React.DragEvent, st: TaskStatus) => {
      e.preventDefault();
      if (drag && !TRANSITIONS[drag.from].includes(st)) {
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.dataTransfer.dropEffect = 'move';
      setDragO(st);
    },
    [drag],
  );

  const onDL = useCallback(() => setDragO(null), []);

  const onDrop = useCallback(
    async (e: React.DragEvent, to: TaskStatus) => {
      e.preventDefault();
      setDragO(null);

      if (!drag || drag.from === to) {
        setDrag(null);
        return;
      }

      if (!TRANSITIONS[drag.from].includes(to)) {
        toast({ title: 'Переход недоступен', variant: 'destructive' });
        setDrag(null);
        return;
      }

      const { id, from } = drag;
      setDrag(null);
      await moveTo(id, from, to);
    },
    [drag, moveTo, toast],
  );

  const undoLastMove = useCallback(async () => {
    if (!lastMove || undoingMove) return;
    const move = lastMove;
    setUndoingMove(true);

    try {
      await tasksApi.changeStatus(move.taskId, move.from);
      setLastMove(null);
      await fetchBoard(true);
      highlightMovedTask(move.taskId);
      setTimeout(() => {
        revealTask(move.taskId);
      }, 100);
      toast({
        title: 'Перенос отменён',
        description: `${move.number} возвращена в «${ST_LABEL[move.from]}»`,
      });
    } catch (e: any) {
      toast({
        title: 'Не удалось отменить перенос',
        description: apiErr(e),
        variant: 'destructive',
      });
    } finally {
      setUndoingMove(false);
    }
  }, [lastMove, undoingMove, fetchBoard, highlightMovedTask, revealTask, toast]);

  const ql = q.trim().toLowerCase();
  const disp = useMemo(() => {
    if (!ql) return cols;
    return cols.map((c) => ({
      ...c,
      tasks: {
        ...c.tasks,
        items: c.tasks.items.filter((t) => {
          const ticketNo = getTaskTicketNumber(t) ?? '';
          return (
            t.title.toLowerCase().includes(ql) ||
            t.number.toLowerCase().includes(ql) ||
            String(t.description ?? '').toLowerCase().includes(ql) ||
            ticketNo.toLowerCase().includes(ql)
          );
        }),
      },
    }));
  }, [cols, ql]);

  const hf = fp.length > 0 || fo;
  const done = cols.find((c) => c.status === 'done')?.tasks.total_items ?? 0;

  const ctxTabs = [
    { id: 'my' as CtxMode, label: 'Мои', icon: User },
    ...(staff ? [{ id: 'internal' as CtxMode, label: 'Все', icon: Layers }] : []),
    { id: 'project' as CtxMode, label: 'Проект', icon: FolderOpen },
    ...(staff ? [{ id: 'assignee' as CtxMode, label: 'Исполнитель', icon: UserCheck }] : []),
    ...(staff ? [{ id: 'ticket' as CtxMode, label: 'Заявка', icon: Ticket }] : []),
  ];

  const ldTicketsAsync = useCallback(
    async (search: string, p: number) => {
      const r = await ticketsApi.getAll(p, 20, {
        project_ids: selP ? [selP] : undefined,
        query: search || undefined,
      });
      const items = r.items.map((t: any) => {
        const label = `${t.number} — ${t.title}`;
        ticketLabelsRef.current[t.id] = label;
        ticketNumbersRef.current[t.id] = t.number;
        return { value: t.id, label };
      });
      return { items, hasNext: r.items.length === 20 };
    },
    [selP],
  );

  const ldProjAsync = useCallback(async (search: string, p: number) => {
    const r = await projectsApi.getAll(p, 20);
    const f = search
      ? r.items.filter(
        (x) =>
          x.name.toLowerCase().includes(search.toLowerCase()) ||
          x.key.toLowerCase().includes(search.toLowerCase()),
      )
      : r.items;
    return {
      items: f.map((x) => ({
        value: x.id,
        label: x.name,
        sublabel: x.key,
        icon: <FolderOpen className="w-4 h-4 text-amber-500" />,
      })),
      hasNext: r.items.length === 20,
    };
  }, []);

  const ldAssAsync = useCallback(async (search: string, p: number) => {
    let items = [];
    try {
      items = (await usersApi.getAllUsers(p, 20)).items;
    } catch {
      items = [];
    }
    const f = search
      ? items.filter(
        (u) =>
          (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase()),
      )
      : items;
    return {
      items: f.map((u) => ({
        value: u.id,
        label: u.full_name || u.username || u.email,
        sublabel: u.email,
      })),
      hasNext: items.length === 20,
    };
  }, []);

  const dragInfo = drag
    ? (() => {
      const t = cols.flatMap((c) => c.tasks.items).find((x) => x.id === drag.id);
      return t ? { id: drag.id, from: drag.from, title: t.title, number: t.number } : null;
    })()
    : null;

  const handleScrollbarPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const board = boardScrollRef.current;
    if (!board) return;

    e.preventDefault();
    scrollbarDragRef.current = {
      startX: e.clientX,
      startScrollLeft: board.scrollLeft,
    };

    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handleScrollbarPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const dragState = scrollbarDragRef.current;
    const board = boardScrollRef.current;
    const track = bottomTrackRef.current;

    if (!dragState || !board || !track) return;

    const trackWidth = track.clientWidth;
    const thumbPercent = scrollbarThumbPercentRef.current;
    const thumbWidth = trackWidth * (thumbPercent / 100);
    const thumbTravel = Math.max(trackWidth - thumbWidth, 1);
    const boardMax = Math.max(board.scrollWidth - board.clientWidth, 0);

    const deltaX = e.clientX - dragState.startX;
    const scrollDelta = (deltaX / thumbTravel) * boardMax;

    board.scrollLeft = dragState.startScrollLeft + scrollDelta;
  }, []);

  const handleScrollbarPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    scrollbarDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Игнорируем
    }
  }, []);

  const handleScrollbarTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const board = boardScrollRef.current;
    const track = bottomTrackRef.current;

    if (!board || !track) return;
    if ((e.target as HTMLElement).dataset.scrollThumb === 'true') return;

    const rect = track.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const maxScroll = board.scrollWidth - board.clientWidth;

    board.scrollTo({
      left: ratio * maxScroll,
      behavior: 'smooth',
    });
  }, []);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500" onDragEnd={onDE}>
      <div className="flex-shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Задачи</h1>
          {!loading && (
            <span className="px-2 py-0.5 rounded bg-[var(--hover-2)] text-xs text-[var(--text-primary)]/50">
              {Math.max(total - done, 0)} активных · {done} завершено
            </span>
          )}
          {refreshing && <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-primary)]/30" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск..."
              className="w-72 pl-9 pr-8 py-2 bg-[var(--hover-2)] border border-[var(--border-color)] rounded-xl text-sm focus:outline-none focus:border-[var(--accent)]/40 focus:ring-1 focus:ring-[var(--accent-ring)]"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/30 hover:text-[var(--text-primary)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setSf((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${hf
                ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]'
                : 'bg-[var(--hover-2)] border-[var(--border-color)] text-[var(--text-primary)]/60 hover:bg-[var(--hover-3)]'
                }`}
            >
              <Filter className="w-4 h-4" />
              Фильтры
              {hf && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />}
            </button>
            {sf && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSf(false)} />
                <div className="absolute right-0 top-full mt-2 z-20 w-56 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-xl p-3 space-y-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-[var(--text-primary)]/30 mb-2 font-medium">
                      Приоритет
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {PRI_LIST.map((p) => {
                        const m = PM[p.value];
                        return (
                          <button
                            key={p.value}
                            onClick={() =>
                              setFp((v) => (v.includes(p.value) ? v.filter((x) => x !== p.value) : [...v, p.value]))
                            }
                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-all ${fp.includes(p.value)
                              ? `${m.bg} ${m.c} ${m.brd}`
                              : 'bg-[var(--hover-1)] text-[var(--text-primary)]/50 border-[var(--border-color)] hover:bg-[var(--hover-2)]'
                              }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="border-t border-[var(--border-color)] pt-2">
                    <button
                      onClick={() => setFo((v) => !v)}
                      className={`w-full flex items-center gap-2 py-1.5 px-2 rounded font-medium text-sm transition-colors ${fo ? 'text-[var(--accent)] bg-[var(--accent)]/5' : 'text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)]'
                        }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center ${fo ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border-color)]'
                          }`}
                      >
                        {fo && <Check className="w-3 h-3 text-white" />}
                      </div>
                      Просроченные
                    </button>
                  </div>
                  {hf && (
                    <div className="border-t border-[var(--border-color)] pt-2">
                      <button
                        onClick={() => {
                          setFp([]);
                          setFo(false);
                        }}
                        className="w-full text-center text-sm font-medium text-[var(--accent)] hover:underline"
                      >
                        Сбросить
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => fetchBoard(true)}
            disabled={refreshing || loading}
            className="p-2 rounded-xl bg-[var(--hover-2)] border border-[var(--border-color)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] hover:bg-[var(--hover-3)] disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setCreate('backlog')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent)]/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Новая задача
          </button>
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-[var(--hover-1)] rounded-lg border border-[var(--border-color)]">
            {ctxTabs.map((t) => {
              const I = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setMode(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === t.id
                    ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/80 hover:bg-[var(--hover-2)]'
                    }`}
                >
                  <I className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {mode === 'project' && (
            <div className="flex items-center gap-2">
              <div className="w-72">
                <AsyncDD
                  value={selP}
                  onChange={setSelP}
                  loadFn={ldProjAsync}
                  placeholder="Выберите проект"
                  icon={FolderOpen}
                />
              </div>

              {selP && (
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${selP}`)}
                  title="Перейти к проекту"
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center
                   rounded-xl border border-[var(--border-color)]
                   bg-[var(--hover-2)] text-[var(--text-primary)]/60
                   transition-colors hover:bg-[var(--hover-3)] hover:text-[var(--accent)]"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          {mode === 'ticket' && (
            <div className="flex items-center gap-2">
              <div className="w-80">
                <AsyncDD
                  value={selT}
                  onChange={(v) => {
                    setSelT(v);
                    setSelTLabel(v ? ticketLabelsRef.current[v] ?? '' : '');
                  }}
                  loadFn={ldTicketsAsync}
                  placeholder="Выберите заявку"
                  icon={Ticket}
                  wide
                />
              </div>

              {selT && ticketNumbersRef.current[selT] && (
                <button
                  type="button"
                  onClick={() => navigate(`/tickets/${ticketNumbersRef.current[selT]}`)}
                  title="Перейти к заявке"
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center
               rounded-xl border border-[var(--border-color)]
               bg-[var(--hover-2)] text-[var(--text-primary)]/60
               transition-colors hover:bg-[var(--hover-3)] hover:text-[var(--accent)]"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          {mode === 'assignee' && (
            <div className="flex items-center gap-2">
              <div className="w-72">
                <AsyncDD
                  value={selA}
                  onChange={setSelA}
                  loadFn={ldAssAsync}
                  placeholder="Выберите исполнителя"
                  icon={UserCheck}
                />
              </div>

              {selA && (() => {
                const u = umap.get(selA);
                if (!u) return null;
                return (
                  <button
                    type="button"
                    onClick={() => setProfileUser(u)}
                    title="Показать профиль"
                    className="flex h-[42px] w-[42px] shrink-0 items-center justify-center
                     rounded-xl border border-[var(--border-color)]
                     bg-[var(--hover-2)] text-[var(--text-primary)]/60
                     transition-colors hover:bg-[var(--hover-3)] hover:text-[var(--accent)]"
                  >
                    <User className="w-4 h-4" />
                  </button>
                );
              })()}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 bg-[var(--hover-1)] rounded-lg border border-[var(--border-color)]">
          <button
            onClick={() => setViewMode('kanban')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'kanban'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'
              }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Доска
          </button>

          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'list'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'
              }`}
          >
            <List className="w-3.5 h-3.5" />
            Список
          </button>

          <button
            type="button"
            onClick={() => setViewMode('analytics')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'analytics'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-primary)]/50 hover:bg-[var(--hover-2)]'
              }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Аналитика
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {viewMode === 'analytics' ? (
          (mode === 'project' && !selP) || (mode === 'assignee' && !selA) || (mode === 'ticket' && !selT) ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-primary)]/30">
              <BarChart3 className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-base font-medium">
                {mode === 'project' && !selP
                  ? 'Выберите проект'
                  : mode === 'assignee' && !selA
                    ? 'Выберите исполнителя'
                    : 'Выберите заявку'}
              </p>
              <p className="text-sm mt-1 text-[var(--text-primary)]/25">
                После выбора здесь появится аналитика
              </p>
            </div>
          ) : (
            <TaskAnalytics
              context={ctx()}
              priorities={fp}
              overdueOnly={fo}
              onTaskOpen={(task) => {
                setView(task as TaskViewItem);
              }}
            />
          )
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
          </div>
        ) : viewMode === 'list' ? (
          <ListView tasks={disp.flatMap((c) => c.tasks.items)} umap={umap} onView={setView} />
        ) : !cols.length ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-primary)]/30">
            <FileText className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-base font-medium">
              {mode === 'project' && !selP
                ? 'Выберите проект'
                : mode === 'assignee' && !selA
                  ? 'Выберите исполнителя'
                  : mode === 'ticket' && !selT
                    ? 'Выберите заявку'
                    : 'Нет задач'}
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div
              ref={boardScrollRef}
              onScroll={handleBoardScroll}
              className="flex-1 overflow-x-auto overflow-y-hidden pb-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div ref={boardInnerRef} className="flex gap-3 h-full w-max min-w-full">
                {disp.map((c) => (
                  <KCol
                    key={c.status}
                    col={c}
                    umap={umap}
                    isDO={dragO === c.status}
                    dragId={drag?.id ?? null}
                    highlightTaskId={highlightTaskId}
                    ldMore={moreCol === c.status}
                    onDS={onDS}
                    onDE={onDE}
                    onDO={onDO}
                    onDL={onDL}
                    onDrop={onDrop}
                    onAdd={setCreate}
                    onView={setView}
                    onMore={more}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {viewMode === 'kanban' &&
        !loading &&
        cols.length > 0 &&
        boardScrollWidth > boardViewportWidth + 2 &&
        createPortal(
          <div style={fixedBoardScrollbarStyle} className="px-1">
            <div
              ref={bottomTrackRef}
              onClick={handleScrollbarTrackClick}
              className="relative h-3 rounded-full bg-[var(--hover-2)] border border-[var(--border-color)] cursor-pointer select-none"
            >
              <div
                data-scroll-thumb="true"
                onPointerDown={handleScrollbarPointerDown}
                onPointerMove={handleScrollbarPointerMove}
                onPointerUp={handleScrollbarPointerUp}
                onPointerCancel={handleScrollbarPointerUp}
                className="absolute top-[1px] bottom-[1px] left-0 rounded-full bg-[var(--text-primary)]/20 cursor-grab active:cursor-grabbing touch-none will-change-transform"
                style={{
                  width: `${scrollbarThumbPercentRef.current}%`,
                  transform: 'translateX(0px)',
                }}
              />
            </div>
          </div>,
          document.body,
        )}

      <AnimatePresence>
        {lastMove && !drag && (
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] w-[min(520px,calc(100vw-24px))]"
          >
            <div
              onMouseEnter={pauseUndoTimer}
              onMouseLeave={resumeUndoTimer}
              className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-[var(--bg-card)] border border-emerald-500/50 shadow-lg"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[var(--text-primary)]">Задача перенесена</div>
                <div className="mt-0.5 text-xs text-[var(--text-primary)]/50 truncate">
                  #{lastMove.number} · {ST_LABEL[lastMove.to]}
                </div>
              </div>

              <button
                type="button"
                onClick={undoLastMove}
                disabled={undoingMove}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 shrink-0"
              >
                {undoingMove ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                {undoingMove ? 'Возвращаем...' : 'Вернуть'}
              </button>

              <button
                type="button"
                onClick={() => setLastMove(null)}
                title="Скрыть"
                className="p-1.5 rounded-lg text-[var(--text-primary)]/30 hover:text-[var(--text-primary)] hover:bg-[var(--hover-2)] transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{dragInfo && <DragPanel task={dragInfo} onDrop={onDrop} />}</AnimatePresence>

      {view && (
        <DetailModal
          task={view}
          umap={umap}
          onClose={() => setView(null)}
          onRefresh={() => fetchBoard(true)}
          onNeedAssign={(t, targetStatus) => {
            setView(null);
            setAssignIntent({ task: t, targetStatus });
          }}
          onEdit={(t) => {
            setView(null);
            setEditTask(t);
          }}
          onNeedComplete={(t, mode) => {
            setView(null);
            setCompleteIntent({ task: t, mode });
          }}
        />
      )}

      {create != null && (
        <TaskEditorModal
          mode="create"
          initSt={create}
          context={ctx()}
          ticketLabel={mode === 'ticket' && selT ? selTLabel : undefined}
          onClose={() => setCreate(null)}
          onSaved={async () => {
            setCreate(null);
            await fetchBoard(true);
          }}
        />
      )}

      {editTask && (
        <TaskEditorModal
          mode="edit"
          task={editTask}
          context={ctx()}
          onClose={() => setEditTask(null)}
          onSaved={async () => {
            setEditTask(null);
            await fetchBoard(true);
          }}
        />
      )}

      {assignIntent && (
        <AssignModal
          task={assignIntent.task}
          targetStatus={assignIntent.targetStatus}
          umap={umap}
          loading={assignLd}
          onClose={() => {
            if (!assignLd) setAssignIntent(null);
          }}
          onOk={handleAssignAndMove}
        />
      )}

      {completeIntent && (
        <CompleteModal
          task={completeIntent.task}
          loading={completeLd}
          onClose={() => {
            if (!completeLd) setCompleteIntent(null);
          }}
          onOk={handleComplete}
        />
      )}

      {profileUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setProfileUser(null)}
          />

          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Профиль исполнителя
              </h2>
              <button
                type="button"
                onClick={() => setProfileUser(null)}
                className="rounded-lg p-2 text-[var(--text-primary)]/40 hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="flex items-center gap-4">
                {profileUser.avatar_url ? (
                  <img
                    src={profileUser.avatar_url}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
                    <User className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[var(--text-primary)]">
                    {profileUser.full_name || profileUser.username || '—'}
                  </p>
                  {profileUser.email && (
                    <p className="truncate text-sm text-[var(--text-primary)]/50">
                      {profileUser.email}
                    </p>
                  )}
                </div>
              </div>

              {'roles' in profileUser && profileUser.roles && profileUser.roles.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs uppercase tracking-wider text-[var(--text-primary)]/40">
                    Роли
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {profileUser.roles.map((r) => (
                      <span
                        key={r}
                        className="rounded-lg border border-[var(--border-color)] bg-[var(--hover-1)] px-2 py-0.5 text-xs text-[var(--text-primary)]/70"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {profileUser.email && (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--hover-1)]/40 px-3 py-2.5">
                  <Mail className="h-4 w-4 shrink-0 text-[var(--text-primary)]/40" />
                  <a
                    href={`mailto:${profileUser.email}`}
                    className="truncate text-sm text-[var(--accent)] hover:underline"
                  >
                    {profileUser.email}
                  </a>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-[var(--border-color)] px-5 py-3">
              <button
                type="button"
                onClick={() => setProfileUser(null)}
                className="rounded-xl bg-[var(--hover-2)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]/70 hover:bg-[var(--hover-3)]"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
