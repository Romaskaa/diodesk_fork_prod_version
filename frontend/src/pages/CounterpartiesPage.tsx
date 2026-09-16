import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useLayoutEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Building2,
  Phone,
  Mail,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Users,
  User,
  Briefcase,
  GitBranch,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Filter,
  Calendar,
} from 'lucide-react';
import { counterpartiesApi } from '../api/client';
import type { Counterparty } from '../types';

/* ──────────────
   CONSTANTS
   ────────────── */

const TYPE_OPTIONS = [
  {
    value: 'Юридическое лицо',
    label: 'Юридическое лицо',
    icon: <Building2 className="w-4 h-4 text-[var(--text-primary)]/40" />,
  },
  {
    value: 'Физическое лицо',
    label: 'Физическое лицо',
    icon: <User className="w-4 h-4 text-[var(--text-primary)]/40" />,
  },
  {
    value: 'ИП',
    label: 'ИП',
    icon: <Briefcase className="w-4 h-4 text-[var(--text-primary)]/40" />,
  },
] as const;

interface DropdownOption {
  value: string;
  label: string;
  icon?: ReactNode;
  sublabel?: string;
}

/* ──────────────
   HELPERS
   ────────────── */

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightText({
  text,
  query,
}: {
  text?: string | null;
  query: string;
}) {
  if (!text) return null;

  const normalized = query.trim();
  if (!normalized) return <>{text}</>;

  const regex = new RegExp(`(${escapeRegExp(normalized)})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark
            key={`${part}-${index}`}
            className="bg-yellow-400/25 text-[var(--text-primary)] rounded px-0.5"
          >
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}

/* ──────────────
   FILTER DROPDOWN
   ────────────── */

function FilterDropdown({
  label,
  icon,
  options,
  value,
  onChange,
  placeholder = 'Все',
  searchable = false,
}: {
  label: string;
  icon?: ReactNode;
  options: DropdownOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [openUp, setOpenUp] = useState(false);
  const [alignRight, setAlignRight] = useState(false);

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
    if (open && searchable) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (!open) setQuery('');
  }, [open, searchable]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setOpenUp(window.innerHeight - rect.bottom < 260);
    setAlignRight(window.innerWidth - rect.left < 240);
  }, [open]);

  const selected = options.find(o => o.value === value);

  const filtered = query
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(query.toLowerCase()))
      )
    : options;

  return (
    <div ref={containerRef} className="relative">
      <p className="text-sm uppercase tracking-wider text-[var(--text-primary)]/40 mb-1.5 flex items-center gap-2">
        {icon}
        {label}
      </p>

      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          w-full flex items-center justify-between gap-2 px-3.5 py-3 rounded-xl border text-base transition-all
          ${open
            ? 'bg-[var(--hover-3)] border-[var(--accent)]/30 text-[var(--text-primary)]'
            : value
              ? 'bg-[var(--hover-2)] border-[var(--border-color)] text-[var(--text-primary)]/90'
              : 'bg-[var(--hover-1)] border-[var(--border-color)] text-[var(--text-primary)]/50 hover:border-[var(--border-color)] hover:text-[var(--text-primary)]/70'
          }
        `}
      >
        <span className="truncate">
          {selected ? selected.label : placeholder}
        </span>

        <div className="flex items-center gap-1 flex-shrink-0">
          {value ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setOpen(false);
              }}
              className="p-0.5 rounded hover:bg-[var(--hover-1)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60 transition-colors cursor-pointer"
            >
              <X size={14} />
            </span>
          ) : (
            <ChevronDown
              size={16}
              className={`text-[var(--text-primary)]/25 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          )}
        </div>
      </button>

      {open && (
        <div
          className={`
            absolute z-[100] min-w-[220px] w-full max-w-[320px]
            bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden
            ${openUp ? 'bottom-full mb-2' : 'top-full mt-2'}
            ${alignRight ? 'right-0' : 'left-0'}
          `}
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          {searchable && (
            <div className="p-2 border-b border-[var(--border-color)]">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/25" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Поиск..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg glass-card border border-[var(--border-color)]
                             text-sm text-[var(--text-primary)] placeholder-white/25 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className={`
                w-full flex items-center gap-3 px-4 py-2.5 text-left text-base transition-colors
                ${!value ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]' : 'text-[var(--text-primary)]/55 hover:glass-card'}
              `}
            >
              {!value ? <Check size={16} className="text-[var(--accent)]" /> : <span className="w-4" />}
              <span>{placeholder}</span>
            </button>

            <div className="h-px bg-[var(--hover-2)] mx-3 my-1" />

            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-[var(--text-primary)]/40">
                Ничего не найдено
              </div>
            ) : (
              filtered.map(opt => {
                const active = opt.value === value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-2.5 text-left text-base transition-colors
                      ${active ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]' : 'text-[var(--text-primary)]/65 hover:glass-card'}
                    `}
                  >
                    {active ? (
                      <Check size={16} className="text-[var(--accent)] flex-shrink-0" />
                    ) : (
                      <span className="w-4 flex-shrink-0" />
                    )}

                    {opt.icon}

                    <div className="min-w-0">
                      <span className="block truncate">{opt.label}</span>
                      {opt.sublabel && (
                        <span className="block text-sm text-[var(--text-primary)]/40 truncate">
                          {opt.sublabel}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────
   MAIN COMPONENT
   ────────────── */

export default function CounterpartiesPage() {
  const navigate = useNavigate();

  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
const [quickFilter, setQuickFilter] = useState<'all' | 'head' | 'branches' | 'active'>('all');
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

  const [scanProgress, setScanProgress] = useState<{ loaded: number; total: number } | null>(null);

  const requestIdRef = useRef(0);

  const isSearchMode = !!debouncedSearch.trim() || !!typeFilter;

  /* ── Debounce ─ */

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter]);

  /* ── Load data  */

  const loadCounterparties = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      // Обычный режим — обычная пагинация
      if (!isSearchMode) {
        setScanProgress(null);

        const response = await counterpartiesApi.getAll(page, 10);
        if (requestId !== requestIdRef.current) return;

        setCounterparties(response.items);
        setTotalPages(response.total_pages);
        setTotalItems(response.total_items);
        return;
      }

      // Режим поиска/фильтра — динамически грузим всю базу
      setCounterparties([]);
      setTotalPages(1);
      setScanProgress({ loaded: 0, total: 0 });

      let currentPage = 1;
      let lastTotalPages = 1;
      const itemsMap = new Map<string, Counterparty>();

      while (true) {
        const response = await counterpartiesApi.getAll(currentPage, 100);
        if (requestId !== requestIdRef.current) return;

        lastTotalPages = response.total_pages;
        setTotalItems(response.total_items);

        response.items.forEach(item => {
          itemsMap.set(item.id, item);
        });

        setCounterparties(Array.from(itemsMap.values()));
        setScanProgress({ loaded: currentPage, total: lastTotalPages });

        if (currentPage >= lastTotalPages) break;
        currentPage += 1;
      }
    } catch (error) {
      console.error('Failed to load counterparties:', error);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setInitialLoad(false);
        setScanProgress(null);
      }
    }
  }, [page, isSearchMode]);

  useEffect(() => {
    loadCounterparties();
  }, [loadCounterparties]);

  /* ── Grouping ─ */

  const headCompanies = useMemo(
    () => counterparties.filter(cp => !cp.parent_id && !cp.is_branch),
    [counterparties]
  );

  const branchesByParent = useMemo(() => {
    const map = new Map<string, Counterparty[]>();

    counterparties.forEach(cp => {
      if (cp.parent_id && cp.is_branch) {
        if (!map.has(cp.parent_id)) map.set(cp.parent_id, []);
        map.get(cp.parent_id)!.push(cp);
      }
    });

    map.forEach(branches => branches.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [counterparties]);

  /* ── Search logic ───────────────────────────────────────────────────── */

  const normalizedSearch = debouncedSearch.trim().toLowerCase();
  const hasSearch = !!normalizedSearch;

  const matchesText = useCallback(
    (value?: string | null) => (value || '').toLowerCase().includes(normalizedSearch),
    [normalizedSearch]
  );

  const branchMatchesSearch = useCallback((branch: Counterparty) => {
    return (
      matchesText(branch.name) ||
      matchesText(branch.legal_name) ||
      matchesText(branch.email) ||
      matchesText(branch.phone) ||
      (branch.inn || '').toLowerCase().includes(normalizedSearch)
    );
  }, [matchesText, normalizedSearch]);

  const companyMatchesSearch = useCallback((company: Counterparty) => {
    return (
      matchesText(company.name) ||
      matchesText(company.legal_name) ||
      matchesText(company.email) ||
      matchesText(company.phone) ||
      (company.inn || '').toLowerCase().includes(normalizedSearch)
    );
  }, [matchesText, normalizedSearch]);

  const filteredCompanies = useMemo(() => {
  // quickFilter = 'branches' → показываем филиалы отдельными карточками,
  // но так как список строится от головных компаний, отфильтруем
  // только те головные, у которых есть подразделения.
  if (quickFilter === 'branches') {
    return headCompanies.filter(company => {
      const branches = branchesByParent.get(company.id) || [];
      if (branches.length === 0) return false;

      const matchesType = !typeFilter || branches.some(b => b.counterparty_type === typeFilter);
      if (!matchesType) return false;

      if (!hasSearch) return true;

      return branches.some(branchMatchesSearch);
    });
  }

  if (quickFilter === 'active') {
    return headCompanies.filter(company => {
      if (!company.is_active) return false;

      const matchesType = !typeFilter || company.counterparty_type === typeFilter;
      if (!matchesType) return false;

      if (!hasSearch) return true;

      const branches = branchesByParent.get(company.id) || [];
      return companyMatchesSearch(company) || branches.some(branchMatchesSearch);
    });
  }

  if (quickFilter === 'head') {
    return headCompanies.filter(company => {
      const matchesType = !typeFilter || company.counterparty_type === typeFilter;
      if (!matchesType) return false;

      if (!hasSearch) return true;

      const branches = branchesByParent.get(company.id) || [];
      return companyMatchesSearch(company) || branches.some(branchMatchesSearch);
    });
  }

  // quickFilter === 'all' — обычное поведение
  return headCompanies.filter(company => {
    const matchesType = !typeFilter || company.counterparty_type === typeFilter;
    if (!matchesType) return false;

    if (!hasSearch) return true;

    const branches = branchesByParent.get(company.id) || [];
    return companyMatchesSearch(company) || branches.some(branchMatchesSearch);
  });
}, [
  headCompanies,
  branchesByParent,
  typeFilter,
  quickFilter,
  hasSearch,
  companyMatchesSearch,
  branchMatchesSearch,
]);

  useEffect(() => {
    if (!hasSearch) return;

    setExpandedCompanies(prev => {
      const next = new Set(prev);

      filteredCompanies.forEach(company => {
        const branches = branchesByParent.get(company.id) || [];
        if (branches.some(branchMatchesSearch)) {
          next.add(company.id);
        }
      });

      return next;
    });
  }, [hasSearch, filteredCompanies, branchesByParent, branchMatchesSearch]);

  /* ── Stats ──── */

  const visibleBranchesCount = useMemo(
    () => counterparties.filter(cp => cp.is_branch).length,
    [counterparties]
  );

  const visibleActiveCount = useMemo(
    () => counterparties.filter(cp => cp.is_active).length,
    [counterparties]
  );

  /* ── UI helpers ────────────────────────────────────────────────────── */

  const toggleCompany = (companyId: string) => {
    setExpandedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  };

 const resetFilters = () => {
  setSearch('');
  setTypeFilter('');
  setQuickFilter('all');
  setPage(1);
};

  const handleQuickFilter = (filter: 'all' | 'head' | 'branches' | 'active') => {
  setQuickFilter(filter);
  setPage(1);
};

  const hasFilters = !!(search || typeFilter || quickFilter !== 'all');

  const getTypeIcon = (type: string, size: 'sm' | 'md' = 'md') => {
    const cls = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6';

    switch (type) {
      case 'Юридическое лицо':
        return <Building2 className={`${cls} text-[var(--text-secondary)]`} />;
      case 'Физическое лицо':
        return <User className={`${cls} text-[var(--text-secondary)]`} />;
      case 'ИП':
        return <Briefcase className={`${cls} text-[var(--text-secondary)]`} />;
      default:
        return <Building2 className={`${cls} text-[var(--text-secondary)]`} />;
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  /* ── Initial loading ──────────────────────────────────────────────── */

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-1.5">
            Контрагенты
          </h1>
          <p className="text-base text-[var(--text-primary)]/50">
            Управление компаниями и подразделениями
            {totalItems > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-[var(--hover-1)] text-[var(--text-secondary)] text-sm">
                {totalItems}
              </span>
            )}
          </p>
        </div>

        <button
          onClick={() => navigate('/counterparties/new')}
          className="btn-primary py-4 px-8 text-base font-semibold"
        >
          <Plus className="w-5 h-5" />
          Добавить контрагента
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  {[
    {
      key: 'all' as const,
      label: isSearchMode ? 'Загружено' : 'На странице',
      value: counterparties.length,
      icon: Building2,
    },
    {
      key: 'head' as const,
      label: 'Головные',
      value: headCompanies.length,
      icon: Users,
    },
    {
      key: 'branches' as const,
      label: 'Подразделения',
      value: visibleBranchesCount,
      icon: GitBranch,
    },
    {
      key: 'active' as const,
      label: 'Активные',
      value: visibleActiveCount,
      icon: Check,
    },
  ].map(stat => {
    const active = quickFilter === stat.key;

return (
  <button
    key={stat.key}
    type="button"
    onClick={() => handleQuickFilter(stat.key)}
    className="
      glass-card rounded-2xl border p-4 flex items-center gap-3.5 text-left transition-all
      hover:border-[var(--border-hover)] hover:-translate-y-0.5
      border-[var(--border-color)]
    "
  >
    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors bg-[var(--hover-2)]">
      <stat.icon className="w-5 h-5 text-[var(--text-secondary)]" />
    </div>
    <div>
      <p className="text-2xl font-bold text-[var(--text-primary)]">
        {stat.value}
      </p>
      <p className="text-sm text-[var(--text-primary)]/40">{stat.label}</p>
    </div>
  </button>
);
  })}
</div>

      {/* Filters */}
      <div className="space-y-4">
        <div className="flex flex-col xl:flex-row gap-3">
          <div className="flex-1 relative mt-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-primary)]/40 pointer-events-none" />
            <input
              type="text"
              placeholder="Поиск по названию, ИНН, email или подразделению..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-12 pr-10 py-3 glass-card border border-[var(--border-color)]
                         rounded-xl text-base text-[var(--text-primary)] placeholder-white/30
                         focus:outline-none focus:border-[var(--accent)]/30  focus:ring-[var(--accent-ring)]
                         transition-all"
            />

            {search && search !== debouncedSearch && (
              <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[var(--accent)]/60" />
            )}

            {search && search === debouncedSearch && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-md
                           text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60 hover:bg-[var(--hover-2)] transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="w-full xl:w-[260px]">
            <FilterDropdown
              label="Тип контрагента"
              icon={<Filter className="w-4 h-4" />}
              options={TYPE_OPTIONS.map(t => ({
                value: t.value,
                label: t.label,
                icon: t.icon,
              }))}
              value={typeFilter}
              onChange={setTypeFilter}
              placeholder="Все типы"
              searchable
            />
          </div>
        </div>

        {hasFilters && (
          <div className="glass-card rounded-xl border border-[var(--border-color)] p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-[var(--text-primary)]/35">Фильтры:</span>

                {search && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                                   bg-[var(--hover-2)] text-[var(--text-primary)]/75 border border-[var(--border-color)]">
                    <Search size={14} />
                    «{search}»
                    <span
                      onClick={() => setSearch('')}
                      className="cursor-pointer text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/60"
                    >
                      <X size={14} />
                    </span>
                  </span>
                )}

                {typeFilter && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                                   bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/15">
                    {TYPE_OPTIONS.find(t => t.value === typeFilter)?.label}
                    <span
                      onClick={() => setTypeFilter('')}
                      className="cursor-pointer text-[var(--accent)]/60 hover:text-[var(--accent)]"
                    >
                      <X size={14} />
                    </span>
                  </span>
                )}
                
                {quickFilter !== 'all' && (
  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                   bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/15">
    {quickFilter === 'head' && 'Головные'}
    {quickFilter === 'branches' && 'Подразделения'}
    {quickFilter === 'active' && 'Активные'}
    <span
      onClick={() => setQuickFilter('all')}
      className="cursor-pointer text-[var(--accent)]/60 hover:text-[var(--accent)]"
    >
      <X size={14} />
    </span>
  </span>
)}

                <button
                  onClick={resetFilters}
                  className="text-sm text-[var(--text-primary)]/35 hover:text-[var(--text-primary)]/60 transition-colors ml-1"
                >
                  Сбросить всё
                </button>
              </div>

              <div className="text-sm text-[var(--text-primary)]/45 flex items-center gap-2">
                <span>
                  Найдено: <span className="text-[var(--text-primary)] font-semibold">{filteredCompanies.length}</span>
                </span>
                {loading && isSearchMode && scanProgress && (
                  <span className="text-[var(--text-primary)]/40">
                    · Поиск по базе {scanProgress.loaded}/{scanProgress.total}
                  </span>
                )}
              </div>
            </div>

            
          </div>
        )}
      </div>

      {/* List */}
      {filteredCompanies.length === 0 && !loading ? (
        <div className="glass-card rounded-2xl border border-[var(--border-color)] p-16 text-center">
          <Building2 className="w-16 h-16 text-[var(--text-primary)]/10 mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Нет контрагентов
          </h3>
          <p className="text-base text-[var(--text-primary)]/50 mb-6">
            {hasFilters ? 'Попробуйте изменить параметры поиска' : 'Добавьте первого контрагента'}
          </p>
          {!hasFilters && (
            <button
              onClick={() => navigate('/counterparties/new')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent)]
                         text-[var(--text-primary)] text-base font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Добавить контрагента
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {loading && (
            <div className="flex justify-center py-2">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--text-primary)]/20" />
            </div>
          )}

          {filteredCompanies.map(company => {
            const branches = branchesByParent.get(company.id) || [];
            const hasBranches = branches.length > 0;

            const companyMatched = hasSearch ? companyMatchesSearch(company) : false;
            const matchedBranches = hasSearch ? branches.filter(branchMatchesSearch) : [];
            const hasMatchedBranch = matchedBranches.length > 0;

            const isExpanded = expandedCompanies.has(company.id) || hasMatchedBranch;

            const visibleBranches =
              hasSearch && hasMatchedBranch
                ? matchedBranches
                : branches;

            const hiddenBranchesCount =
              hasSearch && hasMatchedBranch
                ? branches.length - matchedBranches.length
                : 0;

            const contactPerson =
              (company as any).contact_person ||
              ((company as any).contact_persons?.[0] ?? null);

            return (
              <div
                key={company.id}
                className={`
                  glass-card rounded-2xl border overflow-hidden transition-all
                  ${(companyMatched || hasMatchedBranch)
                    ? ' '
                    : 'border-[var(--border-color)]'
                  }
                `}
              >
                {/* Main company */}
                <div
                  className="p-5 sm:p-6 cursor-pointer transition-all hover:bg-[var(--hover-1)]"
                  onClick={() => navigate(`/counterparties/${company.id}`)}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--hover-2)] flex items-center justify-center flex-shrink-0">
                      {getTypeIcon(company.counterparty_type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <h2 className="text-xl font-bold text-[var(--text-primary)] truncate">
                              <HighlightText text={company.name} query={search} />
                            </h2>

                            <span
                              className={`px-3 py-1 rounded-lg text-sm font-medium border ${
                                company.is_active ? 'status-resolved' : 'status-closed'
                              }`}
                            >
                              {company.is_active ? 'Активен' : 'Неактивен'}
                            </span>

                            {hasBranches && (
                              <span className="px-3 py-1 rounded-lg text-sm font-medium bg-[var(--hover-2)] text-[var(--text-primary)]/60 border border-[var(--border-color)]">
                                {branches.length} подраздел.
                              </span>
                            )}

                           
                          </div>

                          {company.legal_name && (
                            <p className="text-sm text-[var(--text-primary)]/50 truncate">
                              <HighlightText text={company.legal_name} query={search} />
                            </p>
                          )}

                          <div className="flex flex-wrap gap-2 mt-4">
                            <span className="px-3 py-1 rounded-lg text-sm bg-[var(--hover-2)] text-[var(--text-primary)]/70 border border-[var(--border-color)]">
                              {company.counterparty_type}
                            </span>

                            <span className="px-3 py-1 rounded-lg text-sm bg-[var(--hover-2)] text-[var(--text-primary)]/70 border border-[var(--border-color)] font-mono">
                              ИНН <HighlightText text={company.inn} query={search} />
                            </span>

                            {company.kpp && (
                              <span className="px-3 py-1 rounded-lg text-sm bg-[var(--hover-2)] text-[var(--text-primary)]/70 border border-[var(--border-color)] font-mono">
                                КПП {company.kpp}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-sm text-[var(--text-primary)]/45">
                            {company.phone && (
                              <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <Phone className="w-4 h-4" />
                                <HighlightText text={company.phone} query={search} />
                              </span>
                            )}

                            {company.email && (
                              <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <Mail className="w-4 h-4" />
                                <HighlightText text={company.email} query={search} />
                              </span>
                            )}

                            {contactPerson?.full_name && (
                              <span className="flex items-center gap-1.5">
                                <Users className="w-4 h-4" />
                                {contactPerson.full_name}
                              </span>
                            )}

                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4" />
                              {formatDate(company.created_at)}
                            </span>
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-2 flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {hasBranches && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCompany(company.id);
                              }}
                              className="flex items-center gap-2 px-3.5 py-2 rounded-xl
                                         bg-[var(--hover-2)] hover:bg-[var(--hover-3)]
                                         text-[var(--text-primary)]/70 hover:text-[var(--text-primary)] transition-colors text-sm font-medium"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="w-4 h-4" />
                                  <span>Скрыть</span>
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-4 h-4" />
                                  <span>Подразделения</span>
                                </>
                              )}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/counterparties/${company.id}`);
                            }}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-xl
                                       bg-[var(--accent-soft)] hover:bg-[var(--accent-glow)]
                                       text-[var(--accent)] hover:text-[var(--accent)] transition-colors border border-[var(--accent)]/10 text-sm font-medium"
                          >
                            <span>Открыть</span>
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Branches */}
                {hasBranches && isExpanded && (
                  <div className="border-t border-[var(--border-color)] bg-[var(--hover-1)] px-5 sm:px-6 py-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-5 rounded-full bg-red-500" />
                        <p className="text-sm font-semibold text-[var(--text-primary)]/75 flex items-center gap-2">
                          <GitBranch className="w-4 h-4" />
                          Подразделения
                        </p>
                      </div>

                      
                    </div>

                    <div className="space-y-2.5">
                      {visibleBranches.map(branch => {
                        const branchIsMatched = hasSearch ? branchMatchesSearch(branch) : false;

                        return (
                          <button
                            key={branch.id}
                            type="button"
                            onClick={() => navigate(`/counterparties/${branch.id}`)}
                            className={`
                              w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all
                              ${branchIsMatched
                                ? 'bg-[var(--hover-1)] border-[var(--border-color)] hover:bg-[var(--hover-2)]'
                                : 'bg-[var(--hover-1)] border-[var(--border-color)] hover:bg-[var(--hover-2)]'
                              }
                            `}
                          >
                            <div className="w-10 h-10 rounded-xl bg-[var(--hover-2)] flex items-center justify-center flex-shrink-0">
                              {getTypeIcon(branch.counterparty_type, 'sm')}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span className="text-base font-semibold text-[var(--text-primary)] truncate">
                                  <HighlightText text={branch.name} query={search} />
                                </span>

                                <span className="px-2.5 py-1 rounded-lg text-sm bg-[var(--hover-2)] text-[var(--text-primary)]/45 border border-[var(--border-color)]">
                                  подразделение
                                </span>

                                
                              </div>

                              {branch.legal_name && (
                                <p className="text-sm text-[var(--text-primary)]/45 truncate mb-2">
                                  <HighlightText text={branch.legal_name} query={search} />
                                </p>
                              )}

                              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-[var(--text-primary)]/40">
                                <span className="font-mono">
                                  ИНН <HighlightText text={branch.inn} query={search} />
                                </span>
                                {branch.kpp && <span className="font-mono">КПП {branch.kpp}</span>}
                                {branch.phone && <span><HighlightText text={branch.phone} query={search} /></span>}
                                {branch.email && <span><HighlightText text={branch.email} query={search} /></span>}
                              </div>
                            </div>

                            <ChevronRight className="w-4 h-4 text-[var(--text-primary)]/20 flex-shrink-0 mt-1" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination only in normal mode */}
      {!isSearchMode && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass-card border border-[var(--border-color)]
                       hover:bg-[var(--hover-3)] disabled:opacity-40 disabled:cursor-not-allowed
                       text-base text-[var(--text-primary)] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Назад
          </button>

          <div className="flex items-center gap-1.5">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              if (pageNum > totalPages) return null;

              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-10 h-10 rounded-xl text-base font-medium transition-colors ${
                    pageNum === page
                      ? 'bg-[var(--accent)] text-white'
                      : 'glass-card text-[var(--text-primary)]/60 border border-[var(--border-color)] hover:bg-[var(--hover-3)]'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass-card border border-[var(--border-color)]
                       hover:bg-[var(--hover-3)] disabled:opacity-40 disabled:cursor-not-allowed
                       text-base text-[var(--text-primary)] transition-colors"
          >
            Вперёд
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}