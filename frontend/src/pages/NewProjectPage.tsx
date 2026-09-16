// pages/NewProjectPage.tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Building2, CheckCircle2, User, Crown,
  Sparkles, AlertCircle, CheckCircle, XCircle, ChevronDown, X, ArrowRight
} from 'lucide-react';
import { projectsApi, counterpartiesApi, usersApi } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/ui/use-toast';
import type { Counterparty } from '../types';

interface SimpleUser {
  id: string;
  username: string;
  full_name: string | null;
  email: string;
  role: string;
}

export default function NewProjectPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // AI состояния
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [keyValidating, setKeyValidating] = useState(false);
  const [keyAvailability, setKeyAvailability] = useState<{
    available: boolean;
    suggestions: string[];
  } | null>(null);

  // Для выбора владельца проекта
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<SimpleUser | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);

  const counterpartyDropdownRef = useRef<HTMLDivElement>(null);
  const ownerDropdownRef = useRef<HTMLDivElement>(null);

  // 🔥 ИСПРАВЛЕНО: проверка роли через массив
  const isSupport = user?.roles?.some(r =>
    r === 'support_agent' ||
    r === 'support_manager' ||
    r === 'admin'
  ) ?? false;

  // Валидация ключа
  const isValidKey = (key: string): boolean => {
    if (!key) return false;
    // Ключ должен быть 2-10 символов, начинаться с буквы, содержать только буквы, цифры или подчёркивания
    const keyRegex = /^[A-Za-zА-Яа-я][A-Za-zА-Яа-я0-9_]{1,9}$/;
    return keyRegex.test(key);
  };

  // Закрытие дропдаунов при клике вне
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (counterpartyDropdownRef.current && !counterpartyDropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(event.target as Node)) {
        setShowOwnerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isSupport) {
      toast({ title: 'Доступ запрещён', description: 'Только поддержка может создавать проекты', variant: 'destructive' });
      navigate('/projects');
    }
  }, [isSupport]);

  useEffect(() => {
    loadCounterparties();
  }, []);

  // Загрузка пользователей при выборе организации
  useEffect(() => {
    if (counterpartyId) {
      loadUsers(counterpartyId);
    } else {
      setUsers([]);
      setSelectedOwner(null);
    }
  }, [counterpartyId]);

  // AI генерация ключа при изменении названия
  useEffect(() => {
    if (name && name.length > 2) {
      const timer = setTimeout(() => {
        generateKeySuggestion();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [name]);

  // Проверка доступности ключа при его изменении (только если ключ валидный)
  useEffect(() => {
    if (key && isValidKey(key)) {
      const timer = setTimeout(() => {
        checkKeyAvailability();
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setKeyAvailability(null);
    }
  }, [key]);

  const loadCounterparties = async () => {
    setLoading(true);
    try {
      const response = await counterpartiesApi.getAll(1, 100);
      setCounterparties(response.items);
    } catch (error) {
      console.error('Failed to load counterparties:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async (counterpartyId: string) => {
    setLoadingUsers(true);
    try {
      const response = await usersApi.getCustomers(counterpartyId, 1, 100);
      const formattedUsers: SimpleUser[] = response.items.map(customer => ({
        id: customer.id,
        username: customer.username,
        full_name: customer.full_name,
        email: customer.email,
        role: customer.role,
      }));

      // 🔥 ИСПРАВЛЕНО: используем user?.id вместо user?.user_id
      const currentUserObj: SimpleUser = {
        id: user?.id || '',
        username: user?.username || '',
        full_name: user?.full_name || null,
        email: user?.email || '',
        role: user?.roles?.[0] || 'admin',
      };

      // Всегда добавляем текущего пользователя в начало списка
      let allUsers: SimpleUser[] = [currentUserObj];

      // Добавляем остальных пользователей, исключая дубликат текущего
      const otherUsers = formattedUsers.filter(u => u.id !== user?.id);
      allUsers = [...allUsers, ...otherUsers];

      setUsers(allUsers);

      // ВСЕГДА ВЫБИРАЕМ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ПО УМОЛЧАНИЮ
      setSelectedOwner(currentUserObj);

    } catch (error) {
      console.error('Failed to load users:', error);
      // При ошибке всё равно устанавливаем текущего пользователя
      // 🔥 ИСПРАВЛЕНО: используем user?.id вместо user?.user_id
      if (user?.id) {
        const currentUserObj: SimpleUser = {
          id: user.id,
          username: user.username || '',
          full_name: user.full_name || null,
          email: user.email || '',
          role: user?.roles?.[0] || 'admin',
        };
        setUsers([currentUserObj]);
        setSelectedOwner(currentUserObj);
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  // AI: генерация ключа из названия
  const generateKeySuggestion = async () => {
    if (!name || name.length < 2) return;

    setAiLoading(true);

    try {
      const data = await projectsApi.getKeySuggestion(name);

      setAiSuggestion(data.key);
      setKey(data.key);
    } catch (error) {
      console.error('Failed to get key suggestion:', error);
    } finally {
      setAiLoading(false);
    }
  };

  // Проверка доступности ключа
  const checkKeyAvailability = async () => {
    if (!key || !isValidKey(key)) return;

    setKeyValidating(true);

    try {
      const data = await projectsApi.checkKeyAvailability(key);

      setKeyAvailability(data);

      if (
        !data.available &&
        data.suggestions?.length > 0
      ) {
        toast({
          title: 'Ключ занят',
          description: `Предлагаем: ${data.suggestions.slice(0, 3).join(', ')}`,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Failed to check key availability:', error);

      if (error?.response?.status === 400) {
        setKeyAvailability(null);
        return;
      }

      setKeyAvailability(null);
    } finally {
      setKeyValidating(false);
    }
  };

  // Применить предложение
  const applySuggestion = (suggestedKey: string) => {
    setKey(suggestedKey);
    setKeyAvailability(null);
  };

  const getCounterpartyDisplay = (cp: Counterparty) => {
    return cp.name || cp.legal_name || cp.inn || 'Без названия';
  };

  const getUserDisplayName = (u: SimpleUser) => {
    return u.full_name || u.username || u.email;
  };

  const filteredCounterparties = counterparties.filter(cp =>
    getCounterpartyDisplay(cp).toLowerCase().includes(search.toLowerCase()) ||
    cp.inn?.includes(search)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !key || !counterpartyId) {
      toast({ title: 'Ошибка', description: 'Заполните все обязательные поля', variant: 'destructive' });
      return;
    }

    if (!isValidKey(key)) {
      toast({ title: 'Ошибка', description: 'Ключ должен быть 2-10 символов, начинаться с буквы, содержать только буквы, цифры или подчёркивания', variant: 'destructive' });
      return;
    }

    if (!selectedOwner) {
      toast({ title: 'Ошибка', description: 'Выберите владельца проекта', variant: 'destructive' });
      return;
    }

    if (keyAvailability && !keyAvailability.available) {
      toast({ title: 'Ошибка', description: 'Ключ уже занят, выберите другой', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      await projectsApi.create({
        name,
        key: key.toUpperCase(),
        description: description || undefined,
        counterparty_id: counterpartyId,
        owner_id: selectedOwner.id,
      });

      toast({ title: 'Успешно', description: 'Проект создан' });
      navigate('/projects');
    } catch (error: any) {
      console.error('Failed to create project:', error);
      if (error.response?.status === 409) {
        toast({ title: 'Ошибка', description: 'Проект с таким ключом уже существует', variant: 'destructive' });
      } else if (error.response?.status === 400) {
        toast({ title: 'Ошибка', description: error.response?.data?.detail?.[0]?.msg || 'Неверный формат ключа', variant: 'destructive' });
      } else {
        toast({ title: 'Ошибка', description: 'Не удалось создать проект', variant: 'destructive' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getKeyInputBorderClass = () => {
    if (!key) return '';
    if (!isValidKey(key)) return 'border-red-500/50 focus:border-red-500';
    if (keyAvailability?.available) return 'border-green-500/50 focus:border-green-500';
    if (keyAvailability && !keyAvailability.available) return 'border-red-500/50 focus:border-red-500';
    return '';
  };

  const getKeyStatusIcon = () => {
    if (keyValidating) {
      return <Loader2 className="w-5 h-5 text-[var(--warning)] animate-spin" />;
    }
    if (!key) return null;
    if (!isValidKey(key)) {
      return <XCircle className="w-5 h-5 text-[var(--accent)]" />;
    }
    if (keyAvailability?.available) {
      return <CheckCircle className="w-5 h-5 text-[var(--success)]" />;
    }
    if (keyAvailability && !keyAvailability.available) {
      return <XCircle className="w-5 h-5 text-[var(--accent)]" />;
    }
    return null;
  };

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      {/* Header */}
      <div className="flex items-center justify-between gap-6 mb-8">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="p-3 rounded-xl bg-[var(--hover-1)] hover:bg-[var(--hover-2)] transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-[var(--text-primary)]" />
          </button>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)]">
              Создание проекта
            </h1>
            <p className="text-base text-[var(--text-primary)]/50 mt-1">
              Новый проект для контрагента
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/projects')}
          aria-label="Закрыть"
          className="p-2.5 rounded-xl text-[var(--text-primary)]/45
               transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--text-primary)]"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="glass-card rounded-2xl border border-[var(--border-color)] p-6 sm:p-8 space-y-8">
        {/* ═══ Секция 1: Основное ═══ */}
        <section className="space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full bg-[var(--accent)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Основное</h2>
          </div>

          {/* Контрагент */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-2">
              Контрагент <span className="text-red-400">*</span>
            </label>

            <div className="flex items-center gap-2">
              <div className="relative flex-1" ref={counterpartyDropdownRef}>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-primary)]/40 pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Поиск контрагента..."
                    style={{ paddingLeft: '3.5rem' }}
                    className="input-field w-full py-3.5 text-base"
                  />
                </div>

                {showDropdown && (
                  <div className="absolute z-50 mt-2 w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl max-h-80 overflow-y-auto">
                    {loading ? (
                      <div className="p-6 text-center">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--text-primary)]/40" />
                        <p className="text-sm text-[var(--text-primary)]/45 mt-2">Загрузка...</p>
                      </div>
                    ) : filteredCounterparties.length === 0 ? (
                      <div className="p-6 text-center">
                        <Building2 className="w-10 h-10 mx-auto mb-2 text-[var(--text-primary)]/20" />
                        <p className="text-sm text-[var(--text-primary)]/50">Ничего не найдено</p>
                      </div>
                    ) : (
                      filteredCounterparties.map((cp) => (
                        <button
                          key={cp.id}
                          type="button"
                          onClick={() => {
                            setCounterpartyId(cp.id);
                            setSearch(getCounterpartyDisplay(cp));
                            setShowDropdown(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-[var(--hover-1)] transition-colors border-b border-[var(--border-color)] last:border-0"
                        >
                          <div className="font-medium text-[var(--text-primary)] text-sm">
                            {getCounterpartyDisplay(cp)}
                          </div>
                          {cp.legal_name && cp.legal_name !== cp.name && (
                            <div className="text-xs text-[var(--text-primary)]/50 mt-0.5">
                              {cp.legal_name}
                            </div>
                          )}
                          {cp.inn && (
                            <div className="text-xs text-[var(--text-primary)]/40 mt-0.5 font-mono">
                              ИНН: {cp.inn}
                            </div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Проформа: Перейти к контрагенту */}
              {counterpartyId && (
                <button
                  type="button"
                  onClick={() => navigate(`/counterparties/${counterpartyId}`)}
                  title="Перейти к контрагенту"
                  className="flex h-[52px] w-[52px] shrink-0 items-center justify-center
                       rounded-xl border border-[var(--border-color)]
                       bg-[var(--hover-1)] text-[var(--text-primary)]/60
                       transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--accent)]"
                >
                  <ArrowRight className="h-5 w-5" />
                </button>
              )}
            </div>

            {counterpartyId && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-[var(--text-primary)]/70">Контрагент выбран</span>
              </div>
            )}
          </div>

          {/* Название + Ключ — в две колонки */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Название */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-2">
                Название проекта <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например: Корпоративный сайт"
                  className="input-field w-full py-3.5 text-base pr-11"
                  required
                />
                {aiLoading && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  </div>
                )}
                {!aiLoading && aiSuggestion && name && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <CheckCircle2 className="w-5 h-5 text-blue-400" />
                  </div>
                )}
              </div>

              {aiSuggestion && name && !aiLoading && (
                <div className="mt-2 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/25">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-sm text-[var(--text-primary)]/70 truncate">
                      Ключ: <span className="font-mono font-semibold text-blue-400">{aiSuggestion}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setKey(aiSuggestion)}
                    className="text-xs px-2 py-1 rounded-md bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 transition-colors shrink-0"
                  >
                    Использовать
                  </button>
                </div>
              )}
            </div>

            {/* Ключ */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]/70 mb-2">
                Ключ проекта <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  placeholder="PROJ"
                  className={`input-field w-full py-3.5 text-base font-mono pr-11 ${getKeyInputBorderClass()}`}
                  required
                  maxLength={10}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  {getKeyStatusIcon()}
                </div>
              </div>
              <p className="text-xs text-[var(--text-primary)]/40 mt-1.5">
                2-10 символов, начинается с буквы
              </p>

              {key && !isValidKey(key) && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">Неверный формат ключа</p>
                </div>
              )}

              {key && isValidKey(key) && keyAvailability && !keyAvailability.available && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-red-300 mb-1.5">Ключ занят</p>
                      {keyAvailability.suggestions?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {keyAvailability.suggestions.slice(0, 4).map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => applySuggestion(suggestion)}
                              className="px-2 py-1 rounded bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)] text-xs transition-colors font-mono"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {key && isValidKey(key) && keyAvailability?.available && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs text-emerald-300">Ключ доступен</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ═══ Секция 2: Владелец ═══ */}
        {counterpartyId && (
          <section className="space-y-5 pt-6 border-t border-[var(--border-color)]">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1 h-5 rounded-full bg-amber-400" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Владелец проекта
              </h2>
            </div>

            {selectedOwner && (
              <div className="flex items-center gap-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                  {selectedOwner.id === user?.id ? (
                    <User className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Crown className="w-5 h-5 text-emerald-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {getUserDisplayName(selectedOwner)}
                    </span>
                    {selectedOwner.id === user?.id && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                        По умолчанию
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-primary)]/50 truncate">
                    {selectedOwner.email}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowOwnerDropdown(!showOwnerDropdown)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-sm transition-colors shrink-0 flex items-center gap-1"
                >
                  {showOwnerDropdown ? 'Скрыть' : 'Изменить'}
                  <ChevronDown className={`w-4 h-4 transition-transform ${showOwnerDropdown ? 'rotate-180' : ''}`} />
                </button>
              </div>
            )}

            {showOwnerDropdown && (
              <div className="relative" ref={ownerDropdownRef}>
                <div className="absolute z-50 mt-1 w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl max-h-80 overflow-y-auto">
                  {loadingUsers ? (
                    <div className="p-6 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--text-primary)]/40" />
                      <p className="text-sm text-[var(--text-primary)]/45 mt-2">Загрузка...</p>
                    </div>
                  ) : users.length === 0 ? (
                    <div className="p-6 text-center">
                      <User className="w-10 h-10 mx-auto mb-2 text-[var(--text-primary)]/20" />
                      <p className="text-sm text-[var(--text-primary)]/50">Нет пользователей</p>
                      <p className="text-xs text-[var(--text-primary)]/40 mt-1">
                        Вы будете владельцем проекта
                      </p>
                    </div>
                  ) : (
                    users.map((u) => {
                      const isCurrentUser = u.id === user?.id;
                      const isSelected = selectedOwner?.id === u.id;

                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setSelectedOwner(u);
                            setShowOwnerDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-[var(--hover-1)] transition-colors border-b border-[var(--border-color)] last:border-0 ${isSelected ? 'bg-emerald-500/[0.06]' : ''
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[var(--hover-2)] flex items-center justify-center shrink-0">
                              {isCurrentUser ? (
                                <User className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Crown className="w-4 h-4 text-amber-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                                  {getUserDisplayName(u)}
                                </span>
                                {isCurrentUser && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                                    Вы
                                  </span>
                                )}
                                {!isCurrentUser && u.role === 'customer_admin' && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">
                                    Админ
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[var(--text-primary)]/50 truncate">
                                {u.email}
                              </div>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ═══ Секция 3: Описание ═══ */}
        <section className="space-y-5 pt-6 border-t border-[var(--border-color)]">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full bg-blue-400" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Описание</h2>
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Опишите цели и задачи проекта..."
            rows={5}
            className="input-field w-full py-3.5 text-base resize-none"
          />
        </section>

        {/* Кнопки */}
        <div className="flex items-center justify-end gap-3 pt-6 border-t border-[var(--border-color)]">
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="px-5 py-3 rounded-xl bg-[var(--hover-2)] hover:bg-[var(--hover-3)] text-[var(--text-primary)]/70 text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting || !name || !key || !counterpartyId || !selectedOwner || !isValidKey(key) || (keyAvailability && !keyAvailability.available)}
            className="btn-primary px-6 py-3 text-sm font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Создать проект
          </button>
        </div>
      </form>
    </div>
  );
}