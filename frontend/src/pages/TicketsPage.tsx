// pages/TicketsPage.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ElementType, ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, FileText, ChevronRight, ChevronLeft, Loader2,
  Clock, AlertTriangle, CheckCircle2, Calendar, XCircle,
  Building2, User, X, SlidersHorizontal, ChevronDown, Check,
  Sparkles, Flame, MessageSquare, HelpCircle, Edit3, FolderOpen,
  UserCheck, Ticket, MoreVertical,
  Settings, RefreshCw, Archive, Paperclip, LayoutGrid, List,
} from 'lucide-react';
import { ticketsApi, counterpartiesApi, projectsApi, usersApi } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import type { TicketListItem, Counterparty, Project, SimpleUser } from '../types';
import { useToast } from '../components/ui/use-toast';
import { createPortal } from 'react-dom';


type TicketsViewMode = 'list' | 'board';

const KANBAN_STATUSES: string[] = [
  'new',
  'pending_approval',
  'open',
  'in_progress',
  'waiting',
  'resolved',
  'closed',
  'reopened',
  'rejected',
  'canceled',
];

/* ═══ СТАТУСЫ ═══ */

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  'new': { label: 'Новый', color: 'status-new' },
  'pending_approval': { label: 'На согласовании', color: 'status-agreement' },
  'open': { label: 'Открыт', color: 'status-open' },
  'in_progress': { label: 'В работе', color: 'status-progress' },
  'waiting': { label: 'Ожидает ответа', color: 'status-waiting' },
  'resolved': { label: 'Решён', color: 'status-resolved' },
  'closed': { label: 'Закрыт', color: 'status-closed' },
  'reopened': { label: 'Переоткрыт', color: 'status-reopened' },
  'rejected': { label: 'Отклонён', color: 'status-rejected' },
  'canceled': { label: 'Отменён', color: 'status-closed' },
};

const STATUS_OPTIONS = Object.entries(STATUS_MAP).map(([value, { label, color }]) => ({
  value, label, color,
}));

/* ═══ ПРИОРИТЕТЫ ═══ */

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  'low': { label: 'Низкий', color: 'priority-low' },
  'medium': { label: 'Средний', color: 'priority-medium' },
  'high': { label: 'Высокий', color: 'priority-high' },
  'critical': { label: 'Критический', color: 'priority-critical' },
};

const PRIORITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function compareTicketsByPriority(a: TicketListItem, b: TicketListItem) {
  const ra = PRIORITY_RANK[a.priority] ?? 0;
  const rb = PRIORITY_RANK[b.priority] ?? 0;

  // сначала более высокий приоритет
  if (rb !== ra) return rb - ra;

  // при равном приоритете — новые выше
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

const PRIORITY_OPTIONS = Object.entries(PRIORITY_MAP).map(([value, { label, color }]) => ({
  value, label, color,
}));

/* ═══ ТИПЫ ЗАЯВОК ═══ */

const TICKET_TYPES: { value: string; label: string; icon: ReactNode; color: string }[] = [
  { value: 'Инцидент', label: 'Инцидент', icon: <AlertTriangle size={14} />, color: 'type-incident' },
  { value: 'Запрос на услугу', label: 'Запрос на услугу', icon: <CheckCircle2 size={14} />, color: 'type-service' },
  { value: 'Консультация', label: 'Консультация', icon: <HelpCircle size={14} />, color: 'type-consultation' },
  { value: 'Жалоба', label: 'Жалоба', icon: <AlertTriangle size={14} />, color: 'type-complaint' },
  { value: 'Задача', label: 'Задача', icon: <CheckCircle2 size={14} />, color: 'type-task' },
  { value: 'Проблема', label: 'Проблема', icon: <AlertTriangle size={14} />, color: 'type-problem' },
  { value: 'Запрос на изменение', label: 'Запрос на изменение', icon: <Edit3 size={14} />, color: 'type-change' },
  { value: 'Улучшение', label: 'Улучшение', icon: <Sparkles size={14} />, color: 'type-improvement' },
  { value: 'Прочее', label: 'Прочее', icon: <MessageSquare size={14} />, color: 'type-other' },
];

/* ═══ УТИЛИТЫ ═══ */

function toShortName(fullName: string | null | undefined): string {
  if (!fullName) return '—';
  if (fullName === 'ФИО не указано') return fullName;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const [last, first, middle] = parts;
  const initials = [first, middle].filter(Boolean).map(p => `${p[0].toUpperCase()}.`).join('');
  return initials ? `${last} ${initials}` : last;
}

function formatDate(d: string): string {
  if (!d) return '—';
  const date = new Date(d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const compareDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - compareDate.getTime()) / 86400000);
  if (diffDays === 0)
    return `Сегодня, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toItems<T>(res: any): T[] {
  if (Array.isArray(res)) return res as T[];
  if (Array.isArray(res?.items)) return res.items as T[];
  return [];
}

/* ═══ ИНТЕРФЕЙСЫ ═══ */

interface DropdownOption {
  value: string;
  label: string;
  sublabel?: string;
  color?: string;
}

interface FilterDropdownProps {
  label: string;
  icon?: ReactNode;
  options: DropdownOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  loading?: boolean;
  multiple?: boolean;
}

/* ═══ FILTER DROPDOWN ═══ */

function FilterDropdown({
  label, icon, options, value, onChange,
  placeholder = 'Все', searchable = false, loading = false, multiple = false,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && searchable) setTimeout(() => inputRef.current?.focus(), 50);
    if (!open) setQuery('');
  }, [open, searchable]);

  const selectedValues = multiple
    ? (Array.isArray(value) ? value : [])
    : [value as string].filter(Boolean);

  const selected = multiple
    ? options.filter(o => selectedValues.includes(o.value))
    : options.find(o => o.value === value);

  const filtered = query
    ? options.filter(o =>
      o.label.toLowerCase().includes(query.toLowerCase()) ||
      o.sublabel?.toLowerCase().includes(query.toLowerCase()))
    : options;

  const hasValue = selectedValues.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5
          rounded-xl border text-base transition-all whitespace-nowrap cursor-pointer
          ${open
            ? 'bg-[var(--hover-2)] border-[var(--accent)]/40 text-[var(--text-primary)]'
            : hasValue
              ? 'bg-[var(--hover-2)] border-[var(--border-color)] text-[var(--text-primary)]/90'
              : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70'
          }`}
      >
        <span className="flex items-center gap-2 truncate min-w-0">
          {icon && (
            <span className={`flex-shrink-0 ${hasValue ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/40'}`}>
              {icon}
            </span>
          )}
          {hasValue ? (
            <span className="flex items-center gap-2 truncate min-w-0">
              {multiple ? (
                (selected as DropdownOption[]).length === 1 ? (
                  <>
                    {(selected as DropdownOption[])[0].color && (
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: `var(--${(selected as DropdownOption[])[0].color}-text)` }} />
                    )}
                    <span className="truncate">{(selected as DropdownOption[])[0].label}</span>
                  </>
                ) : (
                  <>
                    <span className="truncate">{(selected as DropdownOption[])[0].label}</span>
                    <span className="text-[var(--text-primary)]/40 flex-shrink-0">
                      +{(selected as DropdownOption[]).length - 1}
                    </span>
                  </>
                )
              ) : (
                <>
                  {(selected as DropdownOption)?.color && (
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: `var(--${(selected as DropdownOption).color}-text)` }} />
                  )}
                  <span className="truncate">{(selected as DropdownOption)?.label}</span>
                </>
              )}
            </span>
          ) : (
            <span className="truncate">{label}</span>
          )}
        </span>

        {loading ? (
          <Loader2 size={18} className="text-[var(--text-primary)]/40 animate-spin flex-shrink-0" />
        ) : hasValue ? (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onChange(multiple ? [] : ''); setOpen(false); }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation(); onChange(multiple ? [] : ''); setOpen(false);
              }
            }}
            className="ml-1 p-0.5 rounded-md hover:bg-[var(--hover-1)] text-[var(--text-primary)]/40
                       hover:text-[var(--text-primary)]/60 cursor-pointer transition-colors flex-shrink-0"
          >
            <X size={18} />
          </span>
        ) : (
          <ChevronDown
            size={18}
            className={`text-[var(--text-primary)]/40 transition-transform duration-200 flex-shrink-0
                        ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {open && (
        <div
          className="absolute z-[100] top-full mt-2 left-0 w-[280px]
                     bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl
                     overflow-hidden"
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          {searchable && (
            <div className="p-2 border-b border-[var(--border-color)]">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Поиск..."
                  className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)]
                             border border-[var(--border-color)] text-base text-[var(--text-primary)]
                             placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-hover)]"
                />
              </div>
            </div>
          )}
          <div className="py-1.5 max-h-[300px] overflow-y-auto">
            {!multiple && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left text-base transition-colors
                  ${!value
                    ? 'bg-[var(--accent)]/10 text-[var(--text-primary)]'
                    : 'text-[var(--text-primary)]/60 hover:bg-[var(--hover-1)]'
                  }`}
              >
                {!value
                  ? <Check size={18} className="text-[var(--accent)] flex-shrink-0" />
                  : <span className="w-4 flex-shrink-0" />}
                <span>{placeholder}</span>
              </button>
            )}
            <div className="h-px bg-[var(--hover-2)] mx-3 my-1" />
            {loading ? (
              <div className="px-4 py-6 text-center text-base text-[var(--text-muted)]">
                <Loader2 size={18} className="animate-spin mx-auto mb-2" /> Загрузка...
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-base text-[var(--text-muted)]">
                Ничего не найдено
              </div>
            ) : filtered.map(option => {
              const isSelected = selectedValues.includes(option.value);
              return (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => {
                    if (multiple) {
                      const current = Array.isArray(value) ? value : [];
                      onChange(
                        current.includes(option.value)
                          ? current.filter(v => v !== option.value)
                          : [...current, option.value]
                      );
                    } else {
                      onChange(option.value);
                      setOpen(false);
                      setQuery('');
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-base transition-colors
                    ${isSelected
                      ? 'bg-[var(--accent)]/10 text-[var(--text-primary)]'
                      : 'text-[var(--text-primary)]/70 hover:bg-[var(--hover-1)]'
                    }`}
                >
                  {isSelected
                    ? <Check size={18} className="text-[var(--accent)] flex-shrink-0" />
                    : <span className="w-4 flex-shrink-0" />}
                  {option.color ? (
                    <span className={`px-2.5 py-1 rounded-lg text-base font-medium border ${option.color}`}>
                      {option.label}
                    </span>
                  ) : (
                    <div className="min-w-0 overflow-hidden">
                      <span className="block truncate">{option.label}</span>
                      {option.sublabel && (
                        <span className="block text-base text-[var(--text-muted)] truncate">
                          {option.sublabel}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ STAT CARD ═══ */

function StatCard({ label, value, icon: Icon, color, bg, onClick }: {
  label: string;
  value: number;
  icon: ElementType;
  color: string;
  bg: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-[var(--border-color)] p-4 flex items-center gap-3
        hover:border-[var(--border-hover)] hover:-translate-y-0.5 transition-all duration-200
        ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-[var(--text-primary)] leading-none mb-0.5">{value}</p>
        <p className="text-base text-[var(--text-secondary)]">{label}</p>
      </div>
    </div>
  );
}

/* ═══ FILTER TAG ═══ */

function FilterTag({ label, icon, colorClass, onRemove }: {
  label: string; icon?: ReactNode; colorClass?: string; onRemove: () => void;
}) {
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-base border
      transition-all hover:opacity-80
      ${colorClass || 'bg-[var(--hover-2)] text-[var(--text-primary)]/80 border-[var(--border-color)]'}`}>
      {icon}
      <span className="truncate max-w-[180px]">{label}</span>
      <X size={12}
        className="cursor-pointer opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove(); }} />
    </span>
  );
}

function TicketActions({
  ticket,
  onTicketUpdated,
}: {
  ticket: TicketListItem;
  onTicketUpdated?: () => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);

  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [showAssigneeMenu, setShowAssigneeMenu] = useState(false);
  const [supportUsers, setSupportUsers] = useState<SimpleUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingAssignee, setUpdatingAssignee] = useState(false);

  const ref = useRef<HTMLDivElement>(null); // контейнер кнопки
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setShowAssigneeMenu(false);
    setMenuStyle(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Позиционирование меню (portal + fixed)
  // ---------------------------------------------------------------------------

  const recalcMenu = useCallback(() => {
    const btn = buttonRef.current;
    const menu = menuRef.current;

    if (!btn) return;

    const btnRect = btn.getBoundingClientRect();

    const MENU_W = 270;
    const GAP = 8;
    const PAD = 8;

    // если меню уже в DOM — берём реальную высоту, иначе fallback
    const menuH = menu?.offsetHeight ?? 320;

    const spaceBelow = window.innerHeight - btnRect.bottom - GAP;
    const spaceAbove = btnRect.top - GAP;

    const shouldOpenUp = menuH > spaceBelow && spaceAbove > spaceBelow;

    let top = shouldOpenUp
      ? btnRect.top - menuH - GAP
      : btnRect.bottom + GAP;

    let left = btnRect.right - MENU_W;

    // clamp по экрану
    left = Math.max(PAD, Math.min(left, window.innerWidth - MENU_W - PAD));
    top = Math.max(PAD, Math.min(top, window.innerHeight - menuH - PAD));

    setOpenUp(shouldOpenUp);
    setMenuStyle({
      position: 'fixed',
      top,
      left,
      width: MENU_W,
      zIndex: 2500,
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    // 1) первичный расчёт
    recalcMenu();

    // 2) ещё раз после отрисовки (чтобы высота меню была реальная)
    const raf = requestAnimationFrame(() => recalcMenu());

    return () => cancelAnimationFrame(raf);
  }, [open, showAssigneeMenu, recalcMenu]);

  useEffect(() => {
    if (!open) return;

    const onAnyScrollOrResize = (e: Event) => {
      const target = e.target;

      // если скроллят внутри самого меню — не пересчитываем
      if (target instanceof Node && menuRef.current?.contains(target)) return;

      recalcMenu();
    };

    // capture=true, чтобы ловить скролл внутри колонок/контейнеров канбана
    window.addEventListener('scroll', onAnyScrollOrResize, true);
    window.addEventListener('resize', onAnyScrollOrResize);

    return () => {
      window.removeEventListener('scroll', onAnyScrollOrResize, true);
      window.removeEventListener('resize', onAnyScrollOrResize);
    };
  }, [open, recalcMenu]);

  // ---------------------------------------------------------------------------
  // Закрытие кликом снаружи (учитываем portal)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!open) return;

    const handler = (event: MouseEvent) => {
      const target = event.target as Node;

      const inButton = ref.current?.contains(target);
      const inMenu = menuRef.current?.contains(target);

      if (inButton || inMenu) return;

      closeMenu();
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeMenu]);

  // ---------------------------------------------------------------------------
  // Закрытие по Escape
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!open) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeMenu();
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, closeMenu]);

  // ---------------------------------------------------------------------------
  // Исполнители
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!showAssigneeMenu || supportUsers.length > 0) return;

    setLoadingUsers(true);

    usersApi
      .getAllUsers(1, 100)
      .then((res) => {
        const staff = res.items.filter((user) =>
          user.roles?.some((role) =>
            ['admin', 'support_agent', 'support_manager', 'executor'].includes(role),
          ),
        );

        setSupportUsers(staff);
      })
      .catch(() =>
        toast({
          title: 'Ошибка',
          description: 'Не удалось загрузить пользователей',
          variant: 'destructive',
        }),
      )
      .finally(() => setLoadingUsers(false));
  }, [showAssigneeMenu, supportUsers.length, toast]);

  // ---------------------------------------------------------------------------
  // Архив
  // ---------------------------------------------------------------------------

  const handleArchive = async () => {
    setArchiving(true);

    try {
      await ticketsApi.archiveTicket(ticket.id);

      toast({ title: 'Заявка архивирована' });

      setShowArchiveConfirm(false);
      closeMenu();

      onTicketUpdated?.();
    } catch (error: any) {
      toast({
        title: 'Ошибка',
        description: error?.response?.status === 403 ? 'Нет прав' : 'Не удалось архивировать',
        variant: 'destructive',
      });
    } finally {
      setArchiving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Статус
  // ---------------------------------------------------------------------------

  const handleStatusChange = async (status: string) => {
    setUpdatingStatus(true);

    try {
      await ticketsApi.updateTicketStatus(ticket.id, status as any);

      toast({
        title: 'Статус обновлён',
        description: STATUS_MAP[status]?.label || status,
      });

      closeMenu();
      onTicketUpdated?.();
    } catch (error: any) {
      toast({
        title: 'Ошибка',
        description: error?.response?.status === 403 ? 'Нет прав' : 'Не удалось обновить статус',
        variant: 'destructive',
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Исполнитель
  // ---------------------------------------------------------------------------

  const handleAssigneeChange = async (userId: string | null) => {
    setUpdatingAssignee(true);

    try {
      await ticketsApi.assignTicket(ticket.id, userId || '');

      toast({
        title: userId ? 'Исполнитель назначен' : 'Исполнитель снят',
      });

      closeMenu();
      onTicketUpdated?.();
    } catch (error: any) {
      toast({
        title: 'Ошибка',
        description: error?.response?.status === 403 ? 'Нет прав' : 'Не удалось назначить исполнителя',
        variant: 'destructive',
      });
    } finally {
      setUpdatingAssignee(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Доступные переходы
  // ---------------------------------------------------------------------------

  const getAvailableStatuses = (currentStatus: string): string[] => {
    const transitions: Record<string, string[]> = {
      new: ['pending_approval', 'canceled'],
      pending_approval: ['open', 'rejected'],
      open: ['in_progress'],
      in_progress: ['waiting', 'resolved'],
      waiting: ['in_progress'],
      resolved: ['closed'],
      closed: ['reopened'],
      reopened: ['open'],
      rejected: ['closed'],
    };

    return transitions[currentStatus] || [];
  };

  const availableStatuses = getAvailableStatuses(ticket.status);

  // ---------------------------------------------------------------------------
  // Open
  // ---------------------------------------------------------------------------

  const handleToggleMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (open) {
      closeMenu();
      return;
    }

    setShowAssigneeMenu(false);
    setOpen(true);
  };

  return (
    <>
      <div ref={ref} className="relative">
        <button
          ref={buttonRef}
          type="button"
          aria-label="Действия с заявкой"
          aria-expanded={open}
          onClick={handleToggleMenu}
          className="
            rounded-lg p-2
            text-[var(--text-primary)]/90
            transition-colors
            hover:bg-[var(--hover-2)]
            hover:text-[var(--text-primary)]
          "
        >
          <MoreVertical size={20} />
        </button>
      </div>

      {/* MENU (PORTAL) */}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={
              menuStyle ?? {
                position: 'fixed',
                top: -9999,
                left: -9999,
                width: 270,
                zIndex: 2500,
              }
            }
            className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {/* ============================================================ */}
            {/* Задачи */}
            {/* ============================================================ */}

            <div className="py-1.5">
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  closeMenu();
                  navigate(`/tasks?ticket_id=${ticket.id}`);
                }}
                className="
                  flex w-full items-center gap-3
                  px-4 py-3
                  text-left text-sm
                  text-[var(--text-primary)]/80
                  transition-colors
                  hover:bg-[var(--hover-1)]
                "
              >
                <FolderOpen size={16} className="shrink-0 text-[var(--text-primary)]/40" />
                <span>Посмотреть задачи по заявке</span>
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  closeMenu();
                  navigate(`/tasks?ticket_id=${ticket.id}&create=1`);
                }}
                className="
                  flex w-full items-center gap-3
                  px-4 py-3
                  text-left text-sm
                  text-[var(--text-primary)]/80
                  transition-colors
                  hover:bg-[var(--hover-1)]
                "
              >
                <Plus size={16} className="shrink-0 text-[var(--accent)]" />
                <span>Создать задачу на основании</span>
              </button>
            </div>

            <div className="mx-3 h-px bg-[var(--border-color)]" />

            {/* ============================================================ */}
            {/* Статус */}
            {/* ============================================================ */}

            <div className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]/40">
              Изменить статус
            </div>

            <div className="px-2 pb-2">
              {availableStatuses.length === 0 ? (
                <p className="px-2 py-2 text-sm text-[var(--text-primary)]/30">Нет доступных переходов</p>
              ) : (
                availableStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={updatingStatus}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleStatusChange(status);
                    }}
                    className="
                      group/status
                      flex w-full items-center gap-3
                      rounded-lg px-3 py-2.5
                      border border-transparent
                      text-left text-sm
                      text-[var(--text-primary)]/75
                      cursor-pointer
                      transition-all duration-150
                      hover:bg-[var(--hover-2)]
                      hover:border-[var(--border-color)]
                      hover:text-[var(--text-primary)]
                      disabled:opacity-50
                      disabled:cursor-not-allowed
                    "
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_MAP[status]?.color || 'status-closed'}`} />
                    <span className="flex-1 font-medium">{STATUS_MAP[status]?.label || status}</span>

                    {updatingStatus ? (
                      <Loader2 size={14} className="animate-spin shrink-0" />
                    ) : (
                      <ChevronRight
                        size={14}
                        className="shrink-0 opacity-20 transition-all duration-150 group-hover/status:opacity-70 group-hover/status:translate-x-0.5"
                      />
                    )}
                  </button>
                ))
              )}
            </div>

            <div className="mx-3 h-px bg-[var(--border-color)]" />

            {/* ============================================================ */}
            {/* Исполнитель */}
            {/* ============================================================ */}

            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowAssigneeMenu((v) => !v);
              }}
              className="
                flex w-full items-center
                justify-between gap-3
                px-4 py-3
                text-left text-sm
                text-[var(--text-primary)]/80
                transition-colors
                hover:bg-[var(--hover-1)]
              "
            >
              <span className="flex min-w-0 items-center gap-3">
                <UserCheck size={16} className="shrink-0 text-[var(--text-primary)]/40" />
                <span>Исполнитель</span>
              </span>

              <ChevronDown
                size={16}
                className={`
                  shrink-0
                  text-[var(--text-primary)]/40
                  transition-transform
                  ${showAssigneeMenu ? 'rotate-180' : ''}
                `}
              />
            </button>

            {showAssigneeMenu && (
              <div className="max-h-[170px] overflow-y-auto overscroll-contain border-t border-[var(--border-color)] bg-[var(--hover-1)]/50 py-1">
                {loadingUsers ? (
                  <div className="flex justify-center py-3">
                    <Loader2 size={16} className="animate-spin text-[var(--text-primary)]/40" />
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={updatingAssignee}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleAssigneeChange(null);
                      }}
                      className="
                        flex w-full items-center gap-3
                        px-4 py-2.5
                        text-left text-sm
                        text-[var(--text-primary)]/70
                        transition-colors
                        hover:bg-[var(--hover-2)]
                        disabled:opacity-50
                      "
                    >
                      <X size={14} className="shrink-0 text-[var(--text-primary)]/40" />
                      <span>Снять исполнителя</span>
                    </button>

                    {supportUsers.map((staffUser) => (
                      <button
                        key={staffUser.id}
                        type="button"
                        disabled={updatingAssignee}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleAssigneeChange(staffUser.id);
                        }}
                        className="
                          flex w-full items-center gap-3
                          px-4 py-2.5
                          text-left text-sm
                          text-[var(--text-primary)]/70
                          transition-colors
                          hover:bg-[var(--hover-2)]
                          disabled:opacity-50
                        "
                      >
                        <User size={14} className="shrink-0 text-[var(--text-primary)]/40" />
                        <span className="min-w-0 flex-1 truncate">
                          {staffUser.full_name || staffUser.username || staffUser.email}
                        </span>

                        {ticket.assignee?.id === staffUser.id && (
                          <Check size={14} className="ml-auto shrink-0 text-[var(--success)]" />
                        )}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}

            <div className="mx-3 h-px bg-[var(--border-color)]" />

            {/* ============================================================ */}
            {/* Архив */}
            {/* ============================================================ */}

            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();

                closeMenu();
                setShowArchiveConfirm(true);
              }}
              className="
                flex w-full items-center gap-3
                px-4 py-3
                text-left text-sm
                text-[var(--text-primary)]/80
                transition-colors
                hover:bg-[var(--hover-1)]
              "
            >
              <Archive size={16} className="shrink-0 text-[var(--text-primary)]/40" />
              <span>В архив</span>
            </button>
          </div>,
          document.body,
        )}

      {/* ================================================================== */}
      {/* Подтверждение архива (как у тебя, fixed и так поверх всего) */}
      {/* ================================================================== */}

      {showArchiveConfirm && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!archiving) setShowArchiveConfirm(false);
          }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          <div
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
                <Archive className="h-6 w-6 text-amber-500" />
              </div>

              <h3 className="mb-2 text-lg font-bold text-[var(--text-primary)]">Переместить в архив?</h3>

              <p className="text-sm text-[var(--text-primary)]/50">
                Заявка{' '}
                <span className="font-mono text-[var(--accent)]">{ticket.number}</span>{' '}
                будет скрыта из основного списка
              </p>
            </div>

            <div className="flex border-t border-[var(--border-color)]">
              <button
                type="button"
                disabled={archiving}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setShowArchiveConfirm(false);
                }}
                className="flex-1 py-3.5 text-sm font-medium text-[var(--text-primary)]/60 transition-colors hover:bg-[var(--hover-1)] disabled:opacity-50"
              >
                Отмена
              </button>

              <button
                type="button"
                disabled={archiving}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleArchive();
                }}
                className="flex flex-1 items-center justify-center gap-2 border-l border-[var(--border-color)] py-3.5 text-sm font-semibold text-amber-500 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
              >
                {archiving ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
                В архив
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══ TICKET ROW ═══ */

function TicketRow({ ticket, showAssignee, showReporter, onTicketUpdated, onNavigate, highlighted }: {
  ticket: TicketListItem;
  showAssignee: boolean;
  showReporter: boolean;
  onTicketUpdated?: () => void;
  onNavigate?: (ticketId: string) => void;
  highlighted?: boolean;
}) {
  const statusLabel = STATUS_MAP[ticket.status]?.label || ticket.status;
  const statusColor = STATUS_MAP[ticket.status]?.color || 'status-closed';
  const priorityLabel = PRIORITY_MAP[ticket.priority]?.label || ticket.priority;
  const priorityColor = PRIORITY_MAP[ticket.priority]?.color || 'priority-medium';

  return (
    <Link
      to={`/tickets/${ticket.number}`}
      onClick={() => onNavigate?.(ticket.id)}
      className={`grid items-start px-4 py-3.5 rounded-xl
                 hover:bg-[var(--hover-1)] active:bg-[var(--hover-2)]
                 transition-colors duration-100 group
                 ${highlighted ? 'ring-2 ring-[var(--accent)]/40 bg-[var(--accent)]/5' : ''}`}
      style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 160px 120px 110px 50px' }}
    >
      <div className="min-w-0 pr-3">
        <span className="text-[17px] font-semibold text-[var(--text-primary)] block leading-snug
                         group-hover:text-[var(--accent-light)] transition-colors line-clamp-1">
          {ticket.title}
        </span>
        <span className="text-[15px] font-mono text-[var(--text-primary)]/65 mt-0.5 block">
          {ticket.number}
        </span>
        {ticket.has_attachments && (
          <span className="inline-flex items-center gap-1 text-[13px] text-[var(--text-primary)]/40 mt-1">
            <Paperclip size={18} /> Вложение
          </span>
        )}
      </div>

      <div className="min-w-0 pr-2 self-center">
        {ticket.counterparty?.name ? (
          <span className="flex items-center gap-1 text-[16px] text-[var(--text-primary)]/60 truncate">
            <Building2 size={18} className="shrink-0 text-[var(--text-primary)]/40" />
            <span className="truncate">{ticket.counterparty.name}</span>
          </span>
        ) : (
          <span className="text-[16px] text-[var(--text-primary)]/20">—</span>
        )}
        {ticket.project?.key && (
          <span className="flex items-center gap-1 text-[16px] text-[var(--text-primary)]/35 mt-0.5 truncate">
            <FolderOpen size={18} className="shrink-0" />
            <span className="font-mono truncate">{ticket.project.key}</span>
          </span>
        )}
      </div>

      <div className="min-w-0 pr-2 self-center">
        {showAssignee && (
          (ticket.assignee?.full_name || ticket.assignee?.username) ? (
            <span className="flex items-center gap-1 text-[16px] text-[var(--text-primary)]/60 truncate">
              <UserCheck size={18} className="shrink-0 text-[var(--text-primary)]/40" />
              <span className="truncate">
                {toShortName(ticket.assignee.full_name || ticket.assignee.username)}
              </span>
            </span>
          ) : (
            <span className="text-[16px] text-[var(--text-primary)]/20">—</span>
          )
        )}
        {showReporter && (
          (ticket.reporter?.full_name || ticket.reporter?.username) ? (
            <span className="flex items-center gap-1 text-[16px] text-[var(--text-primary)]/35 mt-0.5 truncate">
              <User size={18} className="shrink-0" />
              <span className="truncate">
                {toShortName(ticket.reporter.full_name || ticket.reporter.username)}
              </span>
            </span>
          ) : null
        )}
        {!showAssignee && !showReporter && (
          <span className="text-[16px] text-[var(--text-primary)]/20">—</span>
        )}
      </div>

      <div className="self-center">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[14px] font-semibold
                         border whitespace-nowrap ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <div className="self-center">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[14px] font-semibold
                         border whitespace-nowrap ${priorityColor}`}>
          {priorityLabel}
        </span>
      </div>

      <div className="self-center text-right">
        <span className="text-[15px] text-[var(--text-primary)]/45 whitespace-nowrap">
          {formatDate(ticket.created_at)}
        </span>
      </div>

      <div className="self-center flex items-center justify-end gap-1">
        <TicketActions ticket={ticket} onTicketUpdated={onTicketUpdated} />
        <ChevronRight size={18}
          className="text-[var(--text-primary)]/20 group-hover:text-[var(--accent-light)]
                     group-hover:translate-x-0.5 transition-all shrink-0" />
      </div>
    </Link>
  );
}

/* ═══ TABLE HEADER ═══ */

function TableHeader({ showAssigneeCol }: { showAssigneeCol: boolean }) {
  const cols: { label: ReactNode; align?: string }[] = [
    { label: <><span>Тема /</span><br /><span>Номер</span></> },
    { label: <><span>Контрагент /</span><br /><span>Проект</span></> },
    { label: showAssigneeCol ? <><span>Исполнитель /</span><br /><span>Автор</span></> : '' },
    { label: 'Статус' },
    { label: 'Приоритет' },
    { label: 'Дата', align: 'text-right' },
    { label: '' },
  ];
  return (
    <div
      className="hidden lg:grid px-4 py-2 text-[13px] uppercase tracking-widest
                 font-semibold text-[var(--text-primary)]/25 border-b border-[var(--border-color)]"
      style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 160px 120px 110px 50px' }}
    >
      {cols.map((c, i) => (
        <div key={i} className={c.align || ''}>{c.label}</div>
      ))}
    </div>
  );
}

/* ═══ EMPTY STATE ═══ */

function EmptyState({ hasFilters, hasSearch, onCreateClick }: {
  hasFilters: boolean; hasSearch: boolean; onCreateClick: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] p-16 text-center">
      <div className="w-20 h-20 rounded-2xl bg-[var(--hover-1)] flex items-center justify-center mx-auto mb-6">
        <FileText className="w-10 h-10 text-[var(--text-primary)]/20" />
      </div>
      <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-3">Нет заявок</h3>
      <p className="text-base text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
        {hasSearch
          ? 'По вашему запросу ничего не найдено'
          : hasFilters
            ? 'Попробуйте изменить параметры фильтрации'
            : 'Создайте первую заявку, чтобы начать работу'}
      </p>
      {!hasFilters && !hasSearch && (
        <button onClick={onCreateClick} className="btn-primary py-4 px-8 text-base">
          <Plus size={18} /> Создать заявку
        </button>
      )}
    </div>
  );
}


function TicketKanbanCard({
  ticket: t,
  onTicketUpdated,
}: {
  ticket: TicketListItem;
  onTicketUpdated?: () => void;
}) {
  const priorityColor = PRIORITY_MAP[t.priority]?.color || 'priority-medium';
  const priorityLabel = PRIORITY_MAP[t.priority]?.label || t.priority;

  const assigneeName =
    t.assignee?.full_name || t.assignee?.username || t.assignee?.email || '';

  const reporterName =
    t.reporter?.full_name || t.reporter?.username || t.reporter?.email || '';

  const hasAttachments = (t as any)?.has_attachments;

  return (
    <Link
      to={`/tickets/${t.number}`}
      className={`
        group bg-[var(--bg-card)] border rounded-xl px-4 py-3.5 cursor-pointer shadow-sm min-h-[140px]
        flex flex-col relative
        transition-[border-color,background-color,box-shadow] duration-200
        hover:bg-[var(--hover-2)] hover:border-[var(--accent)]/40
        border-[var(--border-color)]
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs font-mono text-[var(--text-primary)]/45 mb-1.5 leading-none block">
            #{t.number}
          </span>

          <h4 className="text-[15px] font-bold text-[var(--text-primary)] leading-snug tracking-tight line-clamp-2 mb-3">
            {t.title}
          </h4>

          <div className="flex items-center gap-2 mb-3.5 flex-wrap">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[12px] font-semibold border ${priorityColor}`}>
              {priorityLabel}
            </span>


          </div>
        </div>

        <div className="shrink-0">
          <TicketActions ticket={t} onTicketUpdated={onTicketUpdated} />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3 mt-auto">
        <div className="min-w-0">
          {assigneeName ? (
            <div className="text-[13px] text-[var(--text-primary)]/75 font-medium truncate max-w-[160px]">
              <UserCheck className="inline-block w-4 h-4 mr-1 text-[var(--text-primary)]/30 align-[-2px]" />
              {toShortName(assigneeName)}
            </div>
          ) : reporterName ? (
            <div className="text-[13px] text-[var(--text-primary)]/55 font-medium truncate max-w-[160px]">
              <User className="inline-block w-4 h-4 mr-1 text-[var(--text-primary)]/30 align-[-2px]" />
              {toShortName(reporterName)}
            </div>
          ) : (
            <span className="text-xs text-[var(--text-primary)]/30">—</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-[var(--text-primary)]/30">
          {hasAttachments && <Paperclip className="w-4.5 h-4.5" />}
          {t.project?.key && <FolderOpen className="w-4.5 h-4.5" />}
          <span className="text-[12px] font-semibold ml-0.5 text-[var(--text-primary)]/45">
            {formatDate(t.created_at)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function TicketsKanbanColumns({
  tickets,
  onTicketUpdated,
}: {
  tickets: TicketListItem[];
  onTicketUpdated?: () => void;
}) {
  const byStatus = useMemo(() => {
    const m = new Map<string, TicketListItem[]>();
    for (const s of Object.keys(STATUS_MAP)) m.set(s, []);

    for (const t of tickets) {
      const key = m.has(t.status) ? t.status : 'canceled';
      m.get(key)!.push(t);
    }

    // сортировка внутри каждой колонки: приоритет + дата
    for (const [k, arr] of m.entries()) {
      arr.sort(compareTicketsByPriority);
      m.set(k, arr);
    }

    return m;
  }, [tickets]);

  return (
    <>
      {KANBAN_STATUSES.map((st) => {
        const items = byStatus.get(st) ?? [];

        return (
          <div
            key={st}
            className="
              bg-[var(--hover-1)] rounded-xl flex flex-col w-[320px] shrink-0 border h-full
              border-[var(--border-color)]
            "
          >
            {/* header как в KCol */}
            <div className="px-3 py-3 flex items-center justify-between border-b border-[var(--border-color)] shrink-0 bg-[var(--bg-card)] rounded-t-xl">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full ${STATUS_MAP[st]?.color || 'status-closed'}`} />
                <span className="text-sm font-bold text-[var(--text-primary)] truncate">
                  {STATUS_MAP[st]?.label || st}
                </span>
                <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--hover-2)] text-[var(--text-primary)]/50 shrink-0">
                  {items.length}
                </span>
              </div>
            </div>

            {/* body: как в задачах, но scrollbar скрыт */}
            <div className="p-2.5 flex-1 space-y-2.5 overflow-visible">
              {items.length === 0 ? (
                <div className="h-24 flex flex-col items-center justify-center text-[var(--text-primary)]/30 border border-dashed border-[var(--border-color)] rounded-xl">
                  <FileText className="w-5 h-5 mb-1 opacity-50" />
                  <span className="text-xs">Нет заявок</span>
                </div>
              ) : (
                items.map((t) => (
                  <TicketKanbanCard
                    key={t.id}
                    ticket={t}
                    onTicketUpdated={onTicketUpdated}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}




/* ═══ ОСНОВНОЙ КОМПОНЕНТ ═══ */

export default function TicketsPage() {


  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const getMultiParam = useCallback(
    (key: string) => {
      const all = searchParams.getAll(key).map((x) => x.trim()).filter(Boolean);
      if (all.length > 0) return all;

      // на случай если кто-то передаст CSV: status=open,in_progress
      const csv = searchParams.get(key);
      return csv ? csv.split(',').map((x) => x.trim()).filter(Boolean) : [];
    },
    [searchParams],
  );

  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    in_progress: 0,
    critical: 0,
  });




  /* ── Роли ── */
  const roles = user?.roles ?? [];
  const isCustomer = roles.includes('customer');
  const isCustomerAdmin = roles.includes('customer_admin');
  const isClientUser = isCustomer || isCustomerAdmin;

  const showCounterpartyFilter = !isClientUser;
  const showAssigneeFilter = !isClientUser;
  const showReporterFilter = !isCustomer;
  const showAssigneeCol = !isClientUser;
  const showReporterCol = !isCustomer;

  const boardScrollRef = useRef<HTMLDivElement>(null);
  const boardInnerRef = useRef<HTMLDivElement>(null);


  const bottomTrackRef = useRef<HTMLDivElement>(null);

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
      setFixedBoardScrollbarStyle((prev) =>
        prev.display === 'none' ? prev : { ...prev, display: 'none' }
      );
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
    } catch { }
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
  /* ── State ── */
  const initialSearch = searchParams.get('search') || '';
  const initialStatus = getMultiParam('status');
  const initialPriority = searchParams.get('priority') || '';

  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);

  const [statusFilter, setStatusFilter] = useState<string[]>(initialStatus);
  const [priorityFilter, setPriorityFilter] = useState(initialPriority);
  const [typeFilter, setTypeFilter] = useState('');
  const [counterpartyFilter, setCounterpartyFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [reporterFilter, setReporterFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [showFilters, setShowFilters] = useState(false);

  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [loadingCounterparties, setLoadingCounterparties] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [viewMode, setViewMode] = useState<TicketsViewMode>('list');
  // --- Kanban data (догрузка) ---
  const [boardTickets, setBoardTickets] = useState<TicketListItem[]>([]);
  const [boardPage, setBoardPage] = useState(1);
  const [boardTotalPages, setBoardTotalPages] = useState(1);
  const [boardLoadingMore, setBoardLoadingMore] = useState(false);

  const boardHasMore = boardPage < boardTotalPages;

  // Что показываем в UI
  const shownTickets = viewMode === 'board' ? boardTickets : tickets;


  useEffect(() => {
    const saved = localStorage.getItem('tickets-view-mode') as TicketsViewMode | null;
    if (saved === 'list' || saved === 'board') setViewMode(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem('tickets-view-mode', viewMode);
  }, [viewMode]);


  // 1. Читать page из URL
  const initialPage = parseInt(searchParams.get('page') || '1', 10) || 1;
  const [page, setPage] = useState(initialPage);

  // 2. Синхронизация page с URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (page > 1) {
      params.set('page', String(page));
    } else {
      params.delete('page');
    }
    const qs = params.toString();
    const target = qs ? `/tickets?${qs}` : '/tickets';
    if (window.location.pathname + window.location.search !== target) {
      navigate(target, { replace: true });
    }
  }, [page, searchParams, navigate]);

  // 3. Сохранение состояния
  const saveScrollState = useCallback((ticketId?: string) => {
    sessionStorage.setItem('tickets-scroll', String(window.scrollY));
    sessionStorage.setItem('tickets-page', String(page));
    if (ticketId) sessionStorage.setItem('tickets-highlight', ticketId);
  }, [page]);

  // 4. Восстановление
  const [highlightTicketId, setHighlightTicketId] = useState<string | null>(null);

  useEffect(() => {
    if (loading || initialLoad) return;

    const savedScroll = sessionStorage.getItem('tickets-scroll');
    const savedPage = sessionStorage.getItem('tickets-page');
    const savedHighlight = sessionStorage.getItem('tickets-highlight');

    if (savedScroll && savedPage && parseInt(savedPage, 10) === page) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, parseInt(savedScroll, 10));

          if (savedHighlight) {
            setHighlightTicketId(savedHighlight);
            setTimeout(() => setHighlightTicketId(null), 2000);
          }

          sessionStorage.removeItem('tickets-scroll');
          sessionStorage.removeItem('tickets-page');
          sessionStorage.removeItem('tickets-highlight');
        });
      });
    }
  }, [loading, initialLoad, page]);



  /* ── Debounce поиска ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Загрузка проектов для клиентов ── */
  useEffect(() => {
    if (!isClientUser) return;
    setLoadingProjects(true);
    projectsApi.getMyProjects()
      .then((res: any) => setProjects(toItems<Project>(res)))
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [isClientUser]);


  useEffect(() => {
    const spSearch = searchParams.get('search') || '';
    const spStatus = getMultiParam('status');
    const spPriority = searchParams.get('priority') || '';
    const spPage = parseInt(searchParams.get('page') || '1', 10) || 1;

    setSearch(spSearch);
    setDebouncedSearch(spSearch);

    setStatusFilter(spStatus);
    setPriorityFilter(spPriority);

    setPage(spPage); // ✅ вместо setPage(1)
  }, [searchParams, getMultiParam]);

  /* ── Загрузка справочников при открытии фильтров ── */
  useEffect(() => {
    if (!showFilters) return;

    if (showCounterpartyFilter && counterparties.length === 0) {
      setLoadingCounterparties(true);
      counterpartiesApi.getAll(1, 100)
        .then(res => setCounterparties(toItems<Counterparty>(res)))
        .finally(() => setLoadingCounterparties(false));
    }

    if (!isClientUser && projects.length === 0) {
      setLoadingProjects(true);
      projectsApi.getAll(1, 100)
        .then(res => setProjects(toItems<Project>(res)))
        .finally(() => setLoadingProjects(false));
    }

    if ((showAssigneeFilter || showReporterFilter) && users.length === 0) {
      setLoadingUsers(true);
      usersApi.getAllUsers(1, 100)
        .then(res => setUsers(toItems<SimpleUser>(res)))
        .finally(() => setLoadingUsers(false));
    }
  }, [showFilters]);

  /* ── Сборка параметров фильтрации ── */
  const buildFilters = useCallback(() => ({
    query: debouncedSearch || undefined,
    status: statusFilter.length > 0 ? statusFilter : undefined,
    priority: priorityFilter || undefined,
    ticket_type: typeFilter || undefined,
    counterparty_id: showCounterpartyFilter && counterpartyFilter ? counterpartyFilter : undefined,
    project_ids: projectFilter.length > 0 ? projectFilter : undefined,
    assignee_id: showAssigneeFilter && assigneeFilter ? assigneeFilter : undefined,
    reporter_id: showReporterFilter && reporterFilter ? reporterFilter : undefined,
    created_after: dateFrom || undefined,
    created_before: dateTo || undefined,
  }), [
    debouncedSearch, statusFilter, priorityFilter, typeFilter,
    counterpartyFilter, projectFilter, assigneeFilter, reporterFilter,
    dateFrom, dateTo,
    showCounterpartyFilter, showAssigneeFilter, showReporterFilter,
  ]);

  // 5. В loadTickets — не сбрасывать page
  const loadTickets = useCallback(async (targetPage?: number) => {
    setLoading(true);
    const p = targetPage ?? page;

    try {
      const response = await ticketsApi.getAll(p, 9, buildFilters());
      setTickets(response.items);
      setTotalPages(response.total_pages);
      setTotalItems(response.total_items);
    } catch (e) {
      console.error('loadTickets error:', e);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [buildFilters, page]);

  useEffect(() => {
    if (viewMode === 'list') {
      loadTickets();
    }
  }, [viewMode, loadTickets]);

  const reloadBoard = useCallback(async () => {
    setLoading(true);

    try {
      const res = await ticketsApi.getAll(1, 50, buildFilters());

      setBoardTickets(res.items);
      setBoardPage(1);
      setBoardTotalPages(res.total_pages);

      // чтобы счетчик "всего" в хедере был правильный
      setTotalItems(res.total_items);
    } catch (e) {
      console.error('reloadBoard error:', e);
      setBoardTickets([]);
      setBoardPage(1);
      setBoardTotalPages(1);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [buildFilters]);

  const loadMoreBoard = useCallback(async () => {
    if (boardLoadingMore) return;
    if (boardPage >= boardTotalPages) return;

    const nextPage = boardPage + 1;
    setBoardLoadingMore(true);

    try {
      const res = await ticketsApi.getAll(nextPage, 50, buildFilters());

      setBoardTickets((prev) => {
        const m = new Map(prev.map((t) => [t.id, t]));
        for (const t of res.items) m.set(t.id, t);
        return Array.from(m.values());
      });

      setBoardPage(nextPage);
      setBoardTotalPages(res.total_pages);
    } catch (e) {
      console.error('loadMoreBoard error:', e);
    } finally {
      setBoardLoadingMore(false);
    }
  }, [boardLoadingMore, boardPage, boardTotalPages, buildFilters]);

  useEffect(() => {
    if (viewMode === 'board') {
      reloadBoard();
    }
  }, [viewMode, reloadBoard]);

  /* ── Пагинация ── */
  const handlePageChange = (pageNum: number) => {
    setPage(pageNum); // загрузка пойдёт через useEffect(() => loadTickets(), [loadTickets])
  };

  /* ── Сброс фильтров ── */
  const resetFilters = () => {
    setStatusFilter([]);
    setPriorityFilter('');
    setTypeFilter('');
    setCounterpartyFilter('');
    setProjectFilter([]);
    setAssigneeFilter('');
    setReporterFilter('');
    setSearch('');
    setDebouncedSearch('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };


  const loadStats = useCallback(async () => {
    try {
      // Заявки БЕЗ фильтров — общая статистика
      const allRes = await ticketsApi.getAll(1, 1, {});
      const total = allRes.total_items;

      // Новые
      const newRes = await ticketsApi.getAll(1, 1, { status: ['new'] });
      const newCount = newRes.total_items;

      // В работе
      const progressRes = await ticketsApi.getAll(1, 1, { status: ['in_progress', 'open'] });
      const progressCount = progressRes.total_items;

      // Критические
      const criticalRes = await ticketsApi.getAll(1, 1, { priority: 'critical' });
      const criticalCount = criticalRes.total_items;

      setStats({
        total,
        new: newCount,
        in_progress: progressCount,
        critical: criticalCount,
      });
    } catch (e) {
      console.error('loadStats error:', e);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);


  useEffect(() => {
    if (viewMode !== 'board' || loading || !boardTickets.length) {
      setFixedBoardScrollbarStyle((prev) => ({ ...prev, display: 'none' }));
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
  }, [viewMode, loading, boardTickets.length, syncBoardScrollbarMetrics]);

  /* ── Счётчики ── */
  const hasFilters = !!(
    statusFilter.length || priorityFilter || typeFilter ||
    (showCounterpartyFilter && counterpartyFilter) ||
    projectFilter.length ||
    (showAssigneeFilter && assigneeFilter) ||
    (showReporterFilter && reporterFilter) ||
    dateFrom || dateTo
  );
  const hasActiveFilters = !!(hasFilters || debouncedSearch);

  const activeFiltersCount = [
    statusFilter.length > 0,
    !!priorityFilter,
    !!typeFilter,
    showCounterpartyFilter && !!counterpartyFilter,
    projectFilter.length > 0,
    showAssigneeFilter && !!assigneeFilter,
    showReporterFilter && !!reporterFilter,
    !!dateFrom,
    !!dateTo,
  ].filter(Boolean).length;

  /* ── Helpers ── */
  const getStatusColor = (s: string) => STATUS_MAP[s]?.color || 'status-closed';
  const getPriorityColor = (p: string) => PRIORITY_MAP[p]?.color || 'priority-medium';
  const getTypeColor = (t: string) => TICKET_TYPES.find(x => x.value === t)?.color || 'type-other';
  const getStatusLabel = (s: string) => STATUS_MAP[s]?.label || s;
  const getPriorityLabel = (p: string) => PRIORITY_MAP[p]?.label || p;

  const counterpartyOptions: DropdownOption[] = counterparties.map(c => ({
    value: c.id,
    label: c.name || c.legal_name || c.inn || 'Без названия',
    sublabel: c.inn ? `ИНН: ${c.inn}` : undefined,
  }));

  const projectOptions: DropdownOption[] = projects.map(p => ({
    value: p.id,
    label: p.name,
    sublabel: p.key,
  }));

  const handleStatClick = (type: 'new' | 'in_progress' | 'critical') => {
    setPage(1);
    setProjectFilter([]);
    setTypeFilter('');
    setCounterpartyFilter('');
    setAssigneeFilter('');
    setReporterFilter('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setDebouncedSearch('');

    if (type === 'new') {
      setStatusFilter(['new']);
      setPriorityFilter('');
    } else if (type === 'in_progress') {
      setStatusFilter(['in_progress', 'open']);
      setPriorityFilter('');
    } else if (type === 'critical') {
      setPriorityFilter('critical');
      setStatusFilter([]);
    }
  };

  const userOptions: DropdownOption[] = users.map(u => ({
    value: u.id,
    label: u.full_name || u.username || u.email || 'Без имени',
    sublabel: u.email,
  }));
  /* ═══ RENDER ═══ */

  if (initialLoad) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 text-[var(--accent)] animate-spin" />
      </div>
    );
  }



  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-1.5">
            {isClientUser ? 'Мои заявки' : 'Заявки'}
          </h1>
          <p className="text-base text-[var(--text-primary)]/50">
            Управление обращениями
            {totalItems > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-[var(--hover-1)]
                               text-[var(--text-secondary)] text-base">
                {totalItems}
              </span>
            )}
          </p>
        </div>
        <button onClick={() => navigate('/tickets/new')}
          className="btn-primary py-4 px-8 text-base font-semibold">
          <Plus size={18} /> Создать заявку
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Всего"
          value={stats.total}
          icon={Ticket}
          color="text-[var(--text-secondary)]"
          bg="bg-[var(--hover-1)]"
          onClick={resetFilters}
        />
        <StatCard
          label="Новых"
          value={stats.new}
          icon={Clock}
          color="text-[var(--status-new-text)]"
          bg="bg-[var(--status-new-bg)]"
          onClick={() => handleStatClick('new')}
        />
        <StatCard
          label="В работе"
          value={stats.in_progress}
          icon={CheckCircle2}
          color="text-[var(--status-progress-text)]"
          bg="bg-[var(--status-progress-bg)]"
          onClick={() => handleStatClick('in_progress')}
        />
        <StatCard
          label="Критических"
          value={stats.critical}
          icon={AlertTriangle}
          color="text-[var(--priority-critical-text)]"
          bg="bg-[var(--priority-critical-bg)]"
          onClick={() => handleStatClick('critical')}
        />
      </div>

      {/* ── Search + Filters toggle ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/40 pointer-events-none" />
          <input
            type="text"
            placeholder="Поиск по теме, номеру..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-3 glass-card border border-[var(--border-color)] rounded-xl
                       text-[var(--text-primary)] text-base placeholder-[var(--text-muted)]
                       focus:outline-none focus:border-[var(--accent)]/40 focus:ring-2
                       focus:ring-[var(--accent)]/10 transition-all"
          />
          {search && !loading && (
            <button type="button"
              onClick={() => { setSearch(''); setDebouncedSearch(''); }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-md
                         text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60
                         hover:bg-[var(--hover-2)] transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-base
            transition-all whitespace-nowrap cursor-pointer
            ${showFilters || activeFiltersCount > 0
              ? 'bg-[var(--accent)]/10 border-[var(--accent)]/40 text-[var(--text-primary)]'
              : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70'
            }`}
        >
          <SlidersHorizontal size={18}
            className={showFilters || activeFiltersCount > 0
              ? 'text-[var(--accent)]'
              : 'text-[var(--text-primary)]/40'} />
          <span>Фильтры</span>
          {activeFiltersCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[15px]
                             font-bold flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-base transition-all whitespace-nowrap
      ${viewMode === 'list'
                ? 'bg-[var(--accent)]/10 border-[var(--accent)]/40 text-[var(--text-primary)]'
                : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70'
              }`}
          >
            <List size={18} className={viewMode === 'list' ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/40'} />
            Список
          </button>

          <button
            onClick={() => { setPage(1); setViewMode('board'); }}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-base transition-all whitespace-nowrap
      ${viewMode === 'board'
                ? 'bg-[var(--accent)]/10 border-[var(--accent)]/40 text-[var(--text-primary)]'
                : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70'
              }`}
          >
            <LayoutGrid size={18} className={viewMode === 'board' ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/40'} />
            Доска
          </button>
        </div>
      </div>

      {/* ── Filters Panel ── */}
      {showFilters && (
        <div className="rounded-xl border border-[var(--border-color)] p-3.5 space-y-3
                        animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-[var(--text-primary)]/40
                             uppercase tracking-widest">
              Фильтрация
            </span>
            {hasActiveFilters && (
              <button onClick={resetFilters}
                className="text-base text-[var(--accent)] hover:text-[var(--accent-light)]
                           flex items-center gap-1 transition-colors">
                <X size={18} /> Сбросить
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 items-start">
            <FilterDropdown
              label="Статус"
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={v => setStatusFilter(Array.isArray(v) ? v : [v])}
              placeholder="Все статусы"
              multiple
            />

            <FilterDropdown
              label="Приоритет"
              options={PRIORITY_OPTIONS}
              value={priorityFilter}
              onChange={v => setPriorityFilter(v as string)}
              placeholder="Все приоритеты"
            />

            <FilterDropdown
              label="Тип заявки"
              options={TICKET_TYPES.map(t => ({ value: t.value, label: t.label }))}
              value={typeFilter}
              onChange={v => setTypeFilter(v as string)}
              placeholder="Все типы"
            />

            {showCounterpartyFilter && (
              <FilterDropdown
                label="Контрагент"
                options={counterpartyOptions}
                value={counterpartyFilter}
                onChange={v => setCounterpartyFilter(v as string)}
                placeholder="Все контрагенты"
                searchable
                loading={loadingCounterparties}
              />
            )}

            <FilterDropdown
              label="Проект"
              options={projectOptions}
              value={projectFilter}
              onChange={v => setProjectFilter(Array.isArray(v) ? v : [v])}
              placeholder="Все проекты"
              searchable
              multiple
              loading={loadingProjects}
            />

            {showAssigneeFilter && (
              <FilterDropdown
                label="Исполнитель"
                options={userOptions}
                value={assigneeFilter}
                onChange={v => setAssigneeFilter(v as string)}
                placeholder="Все исполнители"
                searchable
                loading={loadingUsers}
              />
            )}

            {showReporterFilter && (
              <FilterDropdown
                label="Автор"
                options={userOptions}
                value={reporterFilter}
                onChange={v => setReporterFilter(v as string)}
                placeholder="Все авторы"
                searchable
                loading={loadingUsers}
              />
            )}

            <div className="sm:col-span-2 xl:col-span-2">
              <label className="text-sm text-[var(--text-primary)]/50 mb-1.5 block font-medium">
                Дата создания
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-[var(--border-color)]
                             bg-[var(--hover-1)] text-[var(--text-primary)] text-sm
                             focus:outline-none focus:border-[var(--accent)]/40"
                />
                <span className="text-[var(--text-muted)] text-sm shrink-0">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-[var(--border-color)]
                             bg-[var(--hover-1)] text-[var(--text-primary)] text-sm
                             focus:outline-none focus:border-[var(--accent)]/40"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Filter Tags ── */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-base text-[var(--text-primary)]/40 flex items-center gap-1.5">
            <SlidersHorizontal size={18} /> Фильтры:
          </span>

          {debouncedSearch && (
            <FilterTag label={`«${debouncedSearch}»`} icon={<Search size={12} />}
              onRemove={() => { setSearch(''); setDebouncedSearch(''); }} />
          )}
          {statusFilter.map(s => (
            <FilterTag key={s} label={getStatusLabel(s)}
              colorClass={`${getStatusColor(s)} border`}
              onRemove={() => setStatusFilter(statusFilter.filter(f => f !== s))} />
          ))}
          {priorityFilter && (
            <FilterTag label={getPriorityLabel(priorityFilter)}
              colorClass={`${getPriorityColor(priorityFilter)} border`}
              onRemove={() => setPriorityFilter('')} />
          )}
          {typeFilter && (
            <FilterTag label={typeFilter}
              colorClass={`${getTypeColor(typeFilter)} border`}
              onRemove={() => setTypeFilter('')} />
          )}
          {showCounterpartyFilter && counterpartyFilter && (
            <FilterTag
              label={counterparties.find(c => c.id === counterpartyFilter)?.name || 'Контрагент'}
              onRemove={() => setCounterpartyFilter('')} />
          )}
          {projectFilter.map(p => (
            <FilterTag key={p}
              label={projects.find(proj => proj.id === p)?.name || 'Проект'}
              onRemove={() => setProjectFilter(projectFilter.filter(f => f !== p))} />
          ))}
          {showAssigneeFilter && assigneeFilter && (
            <FilterTag
              label={users.find(u => u.id === assigneeFilter)?.full_name || 'Исполнитель'}
              onRemove={() => setAssigneeFilter('')} />
          )}
          {showReporterFilter && reporterFilter && (
            <FilterTag
              label={users.find(u => u.id === reporterFilter)?.full_name || 'Автор'}
              onRemove={() => setReporterFilter('')} />
          )}
          {dateFrom && dateTo && (
            <FilterTag
              label={`${new Date(dateFrom).toLocaleDateString('ru-RU')} — ${new Date(dateTo).toLocaleDateString('ru-RU')}`}
              icon={<Calendar size={12} />}
              onRemove={() => { setDateFrom(''); setDateTo(''); }} />
          )}
          {dateFrom && !dateTo && (
            <FilterTag label={`С ${new Date(dateFrom).toLocaleDateString('ru-RU')}`}
              icon={<Calendar size={12} />} onRemove={() => setDateFrom('')} />
          )}
          {!dateFrom && dateTo && (
            <FilterTag label={`По ${new Date(dateTo).toLocaleDateString('ru-RU')}`}
              icon={<Calendar size={12} />} onRemove={() => setDateTo('')} />
          )}
          <button onClick={resetFilters}
            className="text-base text-[var(--accent)]/60 hover:text-[var(--accent)]
                       transition-colors ml-1">
            Сбросить
          </button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && !initialLoad && (
        <div className="flex justify-center py-2">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--hover-1)]
                          border border-[var(--border-color)]">
            <Loader2 size={18} className="text-[var(--accent)] animate-spin" />
            <span className="text-base text-[var(--text-muted)]">Загрузка...</span>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {shownTickets.length === 0 && !loading ? (
        <EmptyState
          hasFilters={hasFilters}
          hasSearch={!!debouncedSearch}
          onCreateClick={() => navigate('/tickets/new')}
        />
      ) : shownTickets.length > 0 ? (
        viewMode === 'board' ? (
          <>
            <div className="flex flex-col pb-6">
              <div
                ref={boardScrollRef}
                onScroll={handleBoardScroll}
                className="overflow-x-auto overflow-y-visible pb-12 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div ref={boardInnerRef} className="flex gap-3 w-max min-w-full">
                  <TicketsKanbanColumns
                    tickets={shownTickets}
                    onTicketUpdated={reloadBoard}
                  />
                </div>
              </div>

              {boardHasMore && (
                <div className="flex justify-center pt-3 shrink-0">
                  <button
                    type="button"
                    onClick={loadMoreBoard}
                    disabled={boardLoadingMore}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass-card border border-[var(--border-color)]
                       text-[var(--text-primary)]/70 hover:bg-[var(--hover-2)] disabled:opacity-40"
                  >
                    {boardLoadingMore && <Loader2 size={18} className="animate-spin" />}
                    Показать ещё
                  </button>
                </div>
              )}
            </div>

            {/* ФИКСИРОВАННЫЙ СКРОЛЛБАР ВНИЗУ ЭКРАНА */}
            {boardScrollWidth > boardViewportWidth + 2 &&
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
                document.body
              )}
          </>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden lg:block rounded-xl border border-[var(--border-color)] relative overflow-visible">
              <TableHeader showAssigneeCol={showAssigneeCol || showReporterCol} />
              <div className="divide-y divide-[var(--border-color)]/40 px-1 py-1">
                {shownTickets.map(ticket => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    showAssignee={showAssigneeCol}
                    showReporter={showReporterCol}
                    onTicketUpdated={loadTickets}
                    onNavigate={(id) => saveScrollState(id)}
                    highlighted={highlightTicketId === ticket.id}
                  />
                ))}
              </div>
            </div>

            {/* Mobile */}
            <div className="lg:hidden space-y-2">
              {shownTickets.map(ticket => (
                // тут оставь твой текущий mobile render (тот, что был)
                <div key={ticket.id} />
              ))}
            </div>

            {/* Pagination только для списка */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4 border-t border-[var(--border-color)]">
                <button
                  onClick={() => handlePageChange(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass-card
                 border border-[var(--border-color)] hover:bg-[var(--hover-2)]
                 disabled:opacity-40 disabled:cursor-not-allowed
                 text-[var(--text-primary)] text-base transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Назад
                </button>

                <div className="flex items-center gap-1.5">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                    if (pageNum > totalPages) return null;

                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`w-10 h-10 rounded-xl text-base font-medium transition-colors
              ${pageNum === page
                            ? 'bg-[var(--accent)] text-white'
                            : 'glass-card text-[var(--text-primary)]/60 border border-[var(--border-color)] hover:bg-[var(--hover-2)]'
                          }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass-card
                 border border-[var(--border-color)] hover:bg-[var(--hover-2)]
                 disabled:opacity-40 disabled:cursor-not-allowed
                 text-[var(--text-primary)] text-base transition-colors"
                >
                  Вперёд <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )
      ) : null}
    </div>
  );
}