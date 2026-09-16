import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, FolderOpen, Search, Loader2,
  X, ChevronDown, Filter, ChevronRight, ChevronLeft,
  Calendar, Check, Archive, Crown, UserCheck, Building2, AlertCircle, ArrowRight,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import type { Project } from '../types';
import type { ReactNode } from 'react';
import { projectsApi, counterpartiesApi } from '../api/client';

/* ═══ КОНСТАНТЫ ═══ */

const ROLE_OPTIONS = [
  { value: 'all', label: 'Все мои проекты' },
  { value: 'owner', label: 'Где я владелец' },
  { value: 'member', label: 'Где я участник' },
] as const;

const STATUS_OPTIONS = [
  { value: 'active', label: 'Активные' },
  { value: 'on_hold', label: 'На паузе' },
  { value: 'completed', label: 'Завершённые' },
  { value: 'archived', label: 'В архиве' },
] as const;

type ProjectStatus = typeof STATUS_OPTIONS[number]['value'];
type ProjectRole = typeof ROLE_OPTIONS[number]['value'];

/* ═══ ROLE DROPDOWN ═══ */

function RoleDropdown({ value, onChange }: { value: ProjectRole; onChange: (v: ProjectRole) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [openUp, setOpenUp] = useState(false);
  const [alignRight, setAlignRight] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setOpenUp(window.innerHeight - rect.bottom < 200);
    setAlignRight(window.innerWidth - rect.left < 220);
  }, [open]);

  const selected = ROLE_OPTIONS.find(o => o.value === value);
  const isFiltered = value !== 'all';

  return (
    <div ref={containerRef} className="relative">
      <button ref={btnRef} type="button" onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-base transition-all whitespace-nowrap cursor-pointer
          ${open
            ? 'bg-[var(--accent-soft)] border-[var(--accent)]/30 text-[var(--text-primary)]'
            : isFiltered
              ? 'bg-red-500/5 border-[var(--accent)]/15 text-[var(--text-primary)]'
              : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]'
          }`}>
        <Filter size={16} className={isFiltered ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} />
        <span>{selected?.label}</span>
        {isFiltered ? (
          <span onClick={e => { e.stopPropagation(); onChange('all'); setOpen(false); }}
            className="ml-0.5 p-0.5 rounded-md hover:bg-[var(--hover-1)] text-[var(--text-muted)]
                       hover:text-[var(--text-secondary)] cursor-pointer transition-colors">
            <X size={14} />
          </span>
        ) : (
          <ChevronDown size={16}
            className={`text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div className={`absolute z-[100] min-w-[240px] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden
          ${openUp ? 'bottom-full mb-2' : 'top-full mt-2'} ${alignRight ? 'right-0' : 'left-0'}`}
          style={{ boxShadow: 'var(--shadow-lg)' }}>
          <div className="py-1.5">
            {ROLE_OPTIONS.map(opt => {
              const active = opt.value === value;
              return (
                <button type="button" key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-base transition-colors
                    ${active
                      ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--hover-1)]'
                    }`}>
                  {active
                    ? <Check size={16} className="text-[var(--accent)] flex-shrink-0" />
                    : <span className="w-4 flex-shrink-0" />}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ FILTER TAG ═══ */

function FilterTag({ label, icon, colorClass, onRemove }: {
  label: string; icon?: React.ReactNode; colorClass?: string; onRemove: () => void;
}) {
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-base border transition-all hover:opacity-80
      ${colorClass || 'bg-[var(--hover-2)] text-[var(--text-primary)]/80 border-[var(--border-color)]'}`}>
      {icon}
      <span className="truncate max-w-[180px]">{label}</span>
      <X size={12} className="cursor-pointer opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove(); }} />
    </span>
  );
}

/* ═══ FILTER DROPDOWN ═══ */

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

function FilterDropdown({
  label,
  icon,
  options,
  value,
  onChange,
  placeholder = 'Все',
  searchable = false,
  loading = false,
  multiple = false,
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
                  <span className="truncate">{(selected as DropdownOption[])[0].label}</span>
                ) : (
                  <>
                    <span className="truncate">{(selected as DropdownOption[])[0].label}</span>
                    <span className="text-[var(--text-primary)]/40 flex-shrink-0">
                      +{(selected as DropdownOption[]).length - 1}
                    </span>
                  </>
                )
              ) : (
                <span className="truncate">{(selected as DropdownOption)?.label}</span>
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
                  <div className="min-w-0 overflow-hidden">
                    <span className="block truncate">{option.label}</span>
                    {option.sublabel && (
                      <span className="block text-base text-[var(--text-muted)] truncate">
                        {option.sublabel}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


/* ═══ COUNTERPARTY FILTER (с поиском + проформа) ═══ */

function CounterpartyFilter({
  value,
  options,
  onChange,
  onClear,
  placeholder = 'Все контрагенты',
}: {
  value: string;
  options: { id: string; name: string }[];
  onChange: (id: string) => void;
  onClear: () => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.id === value);
  const hasValue = !!value;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    if (!open) setQuery('');
  }, [open]);

  const filtered = query
    ? options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))
    : options;

  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2">
      <div ref={containerRef} className="relative flex-1">
        {/* Кнопка */}
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
            <Building2
              size={16}
              className={`flex-shrink-0 ${hasValue ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]/40'}`}
            />
            <span className="truncate">
              {selected ? selected.name : placeholder}
            </span>
          </span>

          {hasValue ? (
            <span
              role="button"
              tabIndex={0}
              onClick={e => {
                e.stopPropagation();
                onClear();
                setOpen(false);
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

        {/* Дропдаун */}
        {open && (
          <div
            className="absolute z-[100] top-full mt-2 left-0 w-[320px]
                       bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl
                       overflow-hidden"
            style={{ boxShadow: 'var(--shadow-lg)' }}
          >
            {/* Поиск */}
            <div className="p-2 border-b border-[var(--border-color)]">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Поиск контрагента..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--bg-tertiary)]
                             border border-[var(--border-color)] text-base text-[var(--text-primary)]
                             placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-hover)]"
                />
              </div>
            </div>

            {/* Список */}
            <div className="py-1.5 max-h-[280px] overflow-y-auto">
              {/* «Все контрагенты» */}
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setOpen(false);
                  setQuery('');
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left text-base transition-colors
                  ${!value
                    ? 'bg-[var(--accent)]/10 text-[var(--text-primary)]'
                    : 'text-[var(--text-primary)]/60 hover:bg-[var(--hover-1)]'
                  }`}
              >
                {!value
                  ? <Check size={18} className="text-[var(--accent)] flex-shrink-0" />
                  : <span className="w-4 flex-shrink-0" />}
                <span>Все контрагенты</span>
              </button>

              <div className="h-px bg-[var(--hover-2)] mx-3 my-1" />

              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-base text-[var(--text-muted)]">
                  Ничего не найдено
                </div>
              ) : (
                filtered.map(cp => {
                  const isSelected = cp.id === value;
                  return (
                    <button
                      key={cp.id}
                      type="button"
                      onClick={() => {
                        onChange(cp.id);
                        setOpen(false);
                        setQuery('');
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
                      <span className="truncate">{cp.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Проформа: перейти к контрагенту */}
      {hasValue && selected && (
        <button
          type="button"
          onClick={() => navigate(`/counterparties/${selected.id}`)}
          title="Перейти к контрагенту"
          className="flex h-[44px] w-[44px] shrink-0 items-center justify-center
                     rounded-xl border border-[var(--border-color)]
                     bg-[var(--hover-1)] text-[var(--text-primary)]/60
                     transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--accent)]"
        >
          <ArrowRight size={18} />
        </button>
      )}
    </div>
  );
}

/* ═══ TABLE HEADER ═══ */

function ProjectsTableHeader() {
  const cols: { label: ReactNode; align?: string }[] = [
    { label: <>Проект<br />/ Ключ</> },
    { label: 'Описание' },
    { label: 'Статус' },
    { label: 'Создан', align: 'text-right' },
    { label: '' },
  ];

  return (
    <div
      className="hidden lg:grid px-5 py-3 text-[13px] uppercase tracking-widest
                 font-semibold text-[var(--text-primary)]/25 border-b border-[var(--border-color)]"
      style={{ gridTemplateColumns: 'minmax(0,2.2fr) minmax(0,2fr) 160px 220px 44px' }}
    >
      {cols.map((c, i) => (
        <div key={i} className={c.align || ''}>{c.label}</div>
      ))}
    </div>
  );
}

/* ═══ PROJECT ROW ═══ */

function ProjectRow({
  project,
  formatDate,
}: {
  project: Project;
  formatDate: (d: string) => string;
}) {
  const navigate = useNavigate();
  const isActive = project.status === 'active';

  const openProject = () => navigate(`/projects/${project.id}`);

  return (
    <div
      onClick={openProject}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openProject();
        }
      }}
      className="
        grid items-start px-5 py-4 rounded-xl cursor-pointer
        hover:bg-[var(--hover-1)] active:bg-[var(--hover-2)]
        transition-colors duration-100 group
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40
      "
      style={{ gridTemplateColumns: 'minmax(0,2.2fr) minmax(0,2fr) 160px 220px 44px' }}
    >
      <div className="min-w-0 pr-4">
        <div className="flex items-start gap-3">
          <div
            className="
              w-11 h-11 rounded-xl flex items-center justify-center shrink-0
              bg-gradient-to-br from-[var(--status-open-bg)] to-[var(--status-agreement-bg)]
              ring-1 ring-[var(--status-open-border)]
            "
          >
            <FolderOpen className="w-5 h-5 text-[var(--status-open-text)]/80" />
          </div>

          <div className="min-w-0">
            <span
              className="
                text-[18px] font-semibold text-[var(--text-primary)] block leading-snug
                group-hover:text-[var(--accent-light)] transition-colors
                line-clamp-1
              "
            >
              {project.name || 'Без названия'}
            </span>

            <span className="text-[15px] font-mono text-[var(--text-primary)]/55 mt-1 block truncate">
              {project.key || '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="min-w-0 pr-4 self-center">
        {project.description ? (
          <p className="text-[16px] text-[var(--text-primary)]/55 leading-snug line-clamp-2">
            {project.description}
          </p>
        ) : (
          <span className="text-[16px] text-[var(--text-primary)]/20">—</span>
        )}

        {project.counterparty_id && (
          <Link
            to={`/counterparties/${project.counterparty_id}`}
            onClick={(e) => e.stopPropagation()}
            className="
              mt-1.5 inline-flex items-center gap-1.5
              text-[14px] text-[var(--text-primary)]/50
              hover:text-[var(--accent)] transition-colors
            "
          >
            <Building2 size={16} className="shrink-0" />
            <span className="truncate">Перейти к контрагенту</span>
            <ArrowRight size={14} className="shrink-0" />
          </Link>
        )}
      </div>

      <div className="self-center">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[14px] font-semibold border whitespace-nowrap
            ${isActive
              ? 'bg-emerald-500/10 text-[var(--success)] border-emerald-500/20'
              : 'bg-[var(--hover-1)] text-[var(--text-muted)] border-[var(--border-color)]'
            }`}
        >
          {isActive ? <Check size={14} /> : <Archive size={14} />}
          {isActive ? 'Активен' : 'Архив'}
        </span>
      </div>

      <div className="self-center text-right">
        <span className="text-[15px] text-[var(--text-primary)]/45 whitespace-nowrap">
          {formatDate(project.created_at)}
        </span>
      </div>

      <div className="self-center flex items-center justify-end">
        <ChevronRight
          size={20}
          className="text-[var(--text-primary)]/20 group-hover:text-[var(--accent-light)] group-hover:translate-x-0.5 transition-all shrink-0"
        />
      </div>
    </div>
  );
}

/* ═══ MOBILE CARD ═══ */

function ProjectMobileCard({
  project,
  userRole,
  formatDate,
}: {
  project: Project;
  userRole: string | null;
  formatDate: (d: string) => string;
}) {
  const navigate = useNavigate();
  const isActive = project.status === 'active';

  return (
    <div
      onClick={() => navigate(`/projects/${project.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/projects/${project.id}`);
        }
      }}
      className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 cursor-pointer
                 hover:bg-[var(--hover-1)] hover:border-[var(--border-hover)] transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[18px] font-semibold text-[var(--text-primary)] truncate">
            {project.name || 'Без названия'}
          </p>
          <p className="mt-1 text-[15px] font-mono text-[var(--text-primary)]/55 truncate">
            {project.key || '—'}
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-[var(--text-primary)]/25 shrink-0" />
      </div>

      {project.description && (
        <p className="mt-3 text-[16px] text-[var(--text-primary)]/55 line-clamp-2">
          {project.description}
        </p>
      )}

      {project.counterparty_id && (
        <Link
          to={`/counterparties/${project.counterparty_id}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-2 inline-flex items-center gap-1.5 text-[14px]
                     text-[var(--text-primary)]/50 hover:text-[var(--accent)] transition-colors"
        >
          <Building2 size={16} />
          <span className="truncate">Перейти к контрагенту</span>
          <ArrowRight size={14} />
        </Link>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[14px] font-semibold border
            ${isActive ? 'bg-emerald-500/10 text-[var(--success)] border-emerald-500/20' : 'bg-[var(--hover-1)] text-[var(--text-muted)] border-[var(--border-color)]'}`}
        >
          {isActive ? <Check size={14} /> : <Archive size={14} />}
          {isActive ? 'Активен' : 'Архив'}
        </span>

        {userRole && (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[14px] font-semibold border
            ${userRole === 'owner'
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              : 'bg-blue-500/10 text-[var(--info)] border-blue-500/20'
            }`}
          >
            {userRole === 'owner' ? <Crown size={14} /> : <UserCheck size={14} />}
            {userRole === 'owner' ? 'Владелец' : 'Участник'}
          </span>
        )}

        <span className="ml-auto text-[14px] text-[var(--text-primary)]/40 flex items-center gap-2">
          <Calendar size={14} />
          {formatDate(project.created_at)}
        </span>
      </div>
    </div>
  );
}

/* ═══ EMPTY STATE ═══ */

function EmptyState({ hasFilters, search, isCustomer, canCreate }: {
  hasFilters: boolean; search: string; isCustomer: boolean; canCreate: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] p-16 text-center">
      <div className="w-20 h-20 rounded-2xl bg-[var(--hover-1)] flex items-center justify-center mx-auto mb-6">
        <FolderOpen className="w-10 h-10 text-[var(--text-primary)]/20" />
      </div>
      <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-3">Нет проектов</h3>
      <p className="text-base text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
        {search
          ? 'По вашему запросу ничего не найдено. Попробуйте изменить поисковый запрос.'
          : isCustomer
            ? 'Вы пока не участвуете ни в одном проекте'
            : 'Создайте первый проект, чтобы начать работу'}
      </p>
      {canCreate && !hasFilters && (
        <Link to="/projects/new" className="btn-primary inline-flex items-center gap-2 py-4 px-8 text-base font-semibold">
          <Plus size={18} /> Создать проект
        </Link>
      )}
    </div>
  );
}

/* ═══ MAIN ═══ */

export default function ProjectsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  /* ── Роли ── */
  const isCustomer = user?.roles?.includes('customer') ?? false;
  const isCustomerAdmin = user?.roles?.includes('customer_admin') ?? false;
  const isSupport = user?.roles?.some(r => r === 'support_agent' || r === 'support_manager') ?? false;
  const isAdmin = user?.roles?.includes('admin') ?? false;
  const canCreateProject = isSupport || isAdmin;
  const isCustomerOrAdmin = isCustomer || isCustomerAdmin;

  /* ── Состояния ── */
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [projectRole, setProjectRole] = useState<ProjectRole>('all');
  const [showFilters, setShowFilters] = useState(false);

  const [statusFilters, setStatusFilters] = useState<ProjectStatus[]>([]);
  const [counterpartyFilter, setCounterpartyFilter] = useState<string>('');
  const [counterparties, setCounterparties] = useState<{ id: string; name: string }[]>([]);
  const [quickFilter, setQuickFilter] = useState<'all' | 'active' | 'archived' | 'on_hold' | 'completed'>('all');

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    on_hold: 0,
    archived: 0,
    completed: 0,
  });

  /* ── Производные ── */
  const hasActiveFiltersCount = [
    statusFilters.length > 0,
    !!counterpartyFilter,
    quickFilter !== 'all',
  ].filter(Boolean).length;

  const hasFilters = !!(
    search ||
    (isCustomer && projectRole !== 'all') ||
    statusFilters.length ||
    counterpartyFilter ||
    quickFilter !== 'all'
  );

  const isSearching = search !== debouncedSearch;
  const filteredProjects = projects;

  /* ── Debounce ── */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  /* ── Сброс страницы ── */
  useEffect(() => {
    setPage(1);
  }, [projectRole, debouncedSearch, statusFilters, counterpartyFilter, quickFilter]);

  /* ── Загрузка статистики ── */
  const loadStats = useCallback(async () => {
    if (isCustomerOrAdmin) return;

    try {
      const [all, active, onHold, archived, completed] = await Promise.all([
        projectsApi.getAll(1, 1, {}),
        projectsApi.getAll(1, 1, { statuses: ['active'] }),
        projectsApi.getAll(1, 1, { statuses: ['on_hold'] }),
        projectsApi.getAll(1, 1, { statuses: ['archived'] }),
        projectsApi.getAll(1, 1, { statuses: ['completed'] }),
      ]);

      setStats({
        total: all.total_items,
        active: active.total_items,
        on_hold: onHold.total_items,
        archived: archived.total_items,
        completed: completed.total_items,
      });
    } catch (e) {
      console.error('loadStats error:', e);
    }
  }, [isCustomerOrAdmin]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  /* ── Загрузка контрагентов ── */
  useEffect(() => {
    if (isCustomerOrAdmin) return;
    counterpartiesApi.getAll(1, 100)
      .then(res => setCounterparties(res.items))
      .catch(() => setCounterparties([]));
  }, [isCustomerOrAdmin]);

  /* ── Загрузка проектов ── */
  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const effectiveStatuses = [
        ...statusFilters,
        ...(quickFilter !== 'all' ? [quickFilter] : []),
      ];

      const filters = {
        counterparty_id: counterpartyFilter || undefined,
        statuses: effectiveStatuses.length ? effectiveStatuses : undefined,
        q: debouncedSearch || undefined,
      };

      const response = isCustomerOrAdmin
        ? await projectsApi.getMyProjects(projectRole, page, 20)
        : await projectsApi.getAll(page, 20, filters);

      setProjects(response.items || []);
      setTotalPages(response.total_pages || 1);
      setTotalItems(response.total_items || 0);
    } catch (e) {
      console.error(e);
      setProjects([]);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [page, projectRole, isCustomerOrAdmin, statusFilters, counterpartyFilter, quickFilter, debouncedSearch]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  /* ── Хелперы ── */
  const formatDate = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const getUserRoleInProject = (project: Project) => {
    if (!user?.id) return null;
    return project.memberships?.find(m => m.user_id === user.id)?.project_role ?? null;
  };

  const resetFilters = () => {
    setSearch('');
    setProjectRole('all');
    setStatusFilters([]);
    setCounterpartyFilter('');
    setQuickFilter('all');
    setPage(1);
  };

  /* ── Initial loader ── */
  if (initialLoad) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 text-[var(--accent)] animate-spin" />
      </div>
    );
  }

  /* ── Render ── */
  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-1.5">
            {isCustomer ? 'Мои проекты' : 'Проекты'}
          </h1>
          <p className="text-base text-[var(--text-primary)]/50">
            {isCustomer ? 'Проекты, в которых вы участвуете' : 'Управление проектами'}
            {totalItems > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-[var(--hover-1)] text-[var(--text-secondary)] text-base">
                {totalItems}
              </span>
            )}
          </p>
        </div>

        {canCreateProject && (
          <button onClick={() => navigate('/projects/new')}
            className="btn-primary py-4 px-8 text-base font-semibold flex items-center gap-2">
            <Plus size={18} /> Создать проект
          </button>
        )}
      </div>

      {!isCustomerOrAdmin && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { key: 'all' as const, label: 'Всего', value: stats.total, icon: FolderOpen },
            { key: 'active' as const, label: 'Активных', value: stats.active, icon: Check },
            { key: 'on_hold' as const, label: 'На паузе', value: stats.on_hold, icon: AlertCircle },
            { key: 'archived' as const, label: 'В архиве', value: stats.archived, icon: Archive },
          ].map(stat => {
            return (
              <button
                key={stat.key}
                type="button"
                onClick={() => {
                  setQuickFilter(stat.key);
                  setPage(1);
                }}
                className="rounded-xl border p-4 flex items-center gap-3 text-left transition-all
            hover:border-[var(--border-hover)] hover:-translate-y-0.5
            border-[var(--border-color)]"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[var(--hover-1)]">
                  <stat.icon className="w-5 h-5 text-[var(--text-muted)]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--text-primary)] leading-none mb-0.5">
                    {stat.value}
                  </p>
                  <p className="text-base text-[var(--text-secondary)]">{stat.label}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2.5">
          {/* Поиск */}
          <div className="flex-1 min-w-[220px] relative">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/40 pointer-events-none"
            />

            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по названию, ключу или описанию..."
              className="w-full pl-11 pr-11 py-3 border border-[var(--border-color)]
                         rounded-xl text-[var(--text-primary)] text-base placeholder-[var(--text-muted)]
                         focus:outline-none focus:border-[var(--accent)]/30
                         focus:ring-2 focus:ring-[var(--accent-ring)] transition-all"
            />

            {isSearching && (
              <Loader2
                size={15}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--accent)]/50 animate-spin"
              />
            )}

            {!isSearching && search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-md
                           text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60
                           hover:bg-[var(--hover-2)] transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Кнопка «Фильтры» */}
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-base
              transition-all whitespace-nowrap cursor-pointer
              ${showFilters || hasActiveFiltersCount > 0
                ? 'bg-[var(--accent)]/10 border-[var(--accent)]/40 text-[var(--text-primary)]'
                : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]/70'
              }`}
          >
            <Filter
              size={18}
              className={
                showFilters || hasActiveFiltersCount > 0
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-primary)]/40'
              }
            />
            <span>Фильтры</span>
            {hasActiveFiltersCount > 0 && (
              <span
                className="w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[15px]
                           font-bold flex items-center justify-center"
              >
                {hasActiveFiltersCount}
              </span>
            )}
          </button>

          {/* Роль (только для клиентов) */}
          {isCustomer && (
            <RoleDropdown
              value={projectRole}
              onChange={v => {
                setProjectRole(v);
                setPage(1);
              }}
            />
          )}
        </div>

        {/* Панель фильтров */}
        {showFilters && (
          <div
            className="rounded-xl border border-[var(--border-color)] p-3.5 space-y-3
                       animate-in fade-in slide-in-from-top-1 duration-200"
          >
            <div className="flex items-center justify-between">
              <span
                className="text-base font-semibold text-[var(--text-primary)]/40
                           uppercase tracking-widest"
              >
                Фильтрация
              </span>
              {hasFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-base text-[var(--accent)] hover:text-[var(--accent-light)]
                             flex items-center gap-1 transition-colors"
                >
                  <X size={18} /> Сбросить
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 items-start">
              {/* Статус */}
              <FilterDropdown
                label="Статус"
                icon={<Filter size={16} />}
                options={STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                value={statusFilters[0] || ''}
                onChange={v => {
                  const val = v as string;
                  setStatusFilters(val ? [val as ProjectStatus] : []);
                  setPage(1);
                }}
                placeholder="Все статусы"
              />

              {/* Контрагент — только для саппорта/админов */}
              {!isCustomerOrAdmin && (
                <div className="sm:col-span-2 xl:col-span-2">
                  <label className="text-sm font-medium text-[var(--text-primary)]/50 mb-1.5 block">
                    Контрагент
                  </label>
                  <CounterpartyFilter
                    value={counterpartyFilter}
                    options={counterparties}
                    onChange={id => {
                      setCounterpartyFilter(id);
                      setPage(1);
                    }}
                    onClear={() => {
                      setCounterpartyFilter('');
                      setPage(1);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Активные фильтры */}
        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-base text-[var(--text-primary)]/40 flex items-center gap-1.5">
              <Filter size={14} /> Фильтры:
            </span>

            {debouncedSearch && (
              <FilterTag
                label={`«${debouncedSearch}»`}
                icon={<Search size={14} />}
                onRemove={() => setSearch('')}
              />
            )}

            {isCustomer && projectRole !== 'all' && (
              <FilterTag
                label={ROLE_OPTIONS.find(o => o.value === projectRole)?.label || ''}
                icon={<Filter size={14} />}
                colorClass="bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/15"
                onRemove={() => {
                  setProjectRole('all');
                  setPage(1);
                }}
              />
            )}

            {statusFilters.map(s => {
              const opt = STATUS_OPTIONS.find(o => o.value === s);
              return (
                <FilterTag
                  key={s}
                  label={opt?.label || s}
                  icon={<Filter size={14} />}
                  colorClass="bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/15"
                  onRemove={() => setStatusFilters(prev => prev.filter(x => x !== s))}
                />
              );
            })}

            {counterpartyFilter && (
              <FilterTag
                label={
                  counterparties.find(c => c.id === counterpartyFilter)?.name || 'Контрагент'
                }
                icon={<Building2 size={14} />}
                onRemove={() => setCounterpartyFilter('')}
              />
            )}

            <button
              onClick={resetFilters}
              className="text-base text-[var(--accent)]/60 hover:text-[var(--accent)] transition-colors ml-1"
            >
              Сбросить
            </button>
          </div>
        )}

        {/* Строка результатов при поиске */}
        {debouncedSearch && (
          <div
            className="rounded-xl border border-[var(--border-color)] px-4 py-3
                       flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 text-base text-[var(--text-primary)]/70">
              <Search size={15} className="text-[var(--accent)]/70 shrink-0" />
              <span>
                Поиск по запросу{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  «{debouncedSearch}»
                </span>
              </span>
            </div>
            <span className="text-base text-[var(--text-primary)]/50">
              Найдено:{' '}
              <span className="font-semibold text-[var(--text-primary)]">
                {filteredProjects.length}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && !initialLoad && (
        <div className="flex justify-center py-2">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full
                          bg-[var(--hover-1)] border border-[var(--border-color)]">
            <Loader2 size={14} className="text-[var(--accent)] animate-spin" />
            <span className="text-base text-[var(--text-muted)]">Загрузка...</span>
          </div>
        </div>
      )}

      {/* Content */}
      {filteredProjects.length === 0 && !loading ? (
        <EmptyState hasFilters={hasFilters} search={search} isCustomer={isCustomer} canCreate={canCreateProject} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block rounded-xl border border-[var(--border-color)] relative overflow-visible">
            <ProjectsTableHeader />

            <div className="divide-y divide-[var(--border-color)]/40 px-1 py-1">
              {filteredProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  formatDate={formatDate}
                />
              ))}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {filteredProjects.map((project) => (
              <ProjectMobileCard
                key={project.id}
                project={project}
                userRole={getUserRoleInProject(project)}
                formatDate={formatDate}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4 border-t border-[var(--border-color)]">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-color)]
                           hover:bg-[var(--hover-2)] disabled:opacity-40 disabled:cursor-not-allowed
                           text-[var(--text-primary)] text-base transition-colors">
                <ChevronLeft className="w-4 h-4" /> Назад
              </button>

              <div className="flex items-center gap-1.5">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                  if (pageNum > totalPages) return null;
                  return (
                    <button key={pageNum} onClick={() => setPage(pageNum)}
                      className={`w-10 h-10 rounded-xl text-base font-medium transition-all
                        ${pageNum === page
                          ? 'bg-[var(--accent)] text-white shadow-lg shadow-red-700/20'
                          : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:bg-[var(--hover-2)]'
                        }`}>
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-color)]
                           hover:bg-[var(--hover-2)] disabled:opacity-40 disabled:cursor-not-allowed
                           text-[var(--text-primary)] text-base transition-colors">
                Вперёд <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}