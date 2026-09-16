// client.ts
import { fetchEventSource } from '@microsoft/fetch-event-source';
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type {
  User,
  UserProfile,
  Counterparty,
  CreateCounterpartyInput,
  CreateBranchInput,
  ContactPersonInput,
  ContactPerson,
  CounterpartyCustomer,
  PaginatedResponse,
  Invitation,
  RegisterInput,
  Ticket,
  TicketListItem,
  CreateTicketInput,
  TicketStatus,
  TicketPriority,
  InvitationCreate,
  ProjectStatus,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ProductsListResponse,
  CreateProductPayload,
  Product,
  ProductAttributesSchemaResponse,
  KeySuggestionResponse,
  KeyAvailabilityResponse,
  TaskKanbanFilters,
  TaskKanbanResponse,
  TaskKanbanContext,
  TaskCreateInput,
  TaskResponse,
  TaskUpdateInput,
  TaskStatus,
  TaskAssignInput,
  TaskRequestReviewInput,
  TaskReviewInput,
  SimpleUser,
} from '@/types';
import apiClient from './apiClient';

const API_URL = import.meta.env.VITE_API_URL;

// Создаем экземпляр axios
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ==== Хелперы для работы с токенами ====
const TOKEN_KEYS = {
  ACCESS: 'access_token',
  REFRESH: 'refresh_token',
  EXPIRES_AT: 'token_expires_at',
} as const;

// Event dispatcher для уведомлений об обновлении токена
const tokenEventTarget = new EventTarget();
export const onTokenRefreshed = (callback: () => void) => {
  tokenEventTarget.addEventListener('tokenRefreshed', callback);
  return () => tokenEventTarget.removeEventListener('tokenRefreshed', callback);
};

export const tokenStorage = {
  getAccessToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEYS.ACCESS);
  },

  getRefreshToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEYS.REFRESH);
  },

  setTokens: (accessToken: string, refreshToken: string, expiresAt: number) => {
    localStorage.setItem(TOKEN_KEYS.ACCESS, accessToken);
    localStorage.setItem(TOKEN_KEYS.REFRESH, refreshToken);
    localStorage.setItem(TOKEN_KEYS.EXPIRES_AT, expiresAt.toString());

    // Уведомляем подписчиков об обновлении токена
    tokenEventTarget.dispatchEvent(new Event('tokenRefreshed'));
  },

  clearTokens: () => {
    localStorage.removeItem(TOKEN_KEYS.ACCESS);
    localStorage.removeItem(TOKEN_KEYS.REFRESH);
    localStorage.removeItem(TOKEN_KEYS.EXPIRES_AT);
    localStorage.removeItem('user');
  },

  isTokenExpired: (): boolean => {
    const expiresAt = localStorage.getItem(TOKEN_KEYS.EXPIRES_AT);
    if (!expiresAt) return true;
    // Добавляем буфер в 30 секунд, чтобы обновить токен заранее
    const bufferSeconds = 30;
    return Date.now() >= (parseInt(expiresAt) - bufferSeconds) * 1000;
  }
};

// ==== Флаг для предотвращения множественных refresh запросов ====
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  config: InternalAxiosRequestConfig;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach(promise => {
    if (error) {
      promise.reject(error);
    } else if (token && promise.config.headers) {
      promise.config.headers.Authorization = `Bearer ${token}`;
      promise.resolve(api(promise.config));
    } else {
      promise.reject(new Error('No token provided'));
    }
  });
  failedQueue = [];
};

// Интерцептор для добавления токена
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Интерцептор для обработки ошибок с бесшовным обновлением токена
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Если ошибка не 401 или запрос уже повторялся - просто отклоняем
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Если уже идет процесс обновления - добавляем запрос в очередь
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject, config: originalRequest });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const refreshToken = tokenStorage.getRefreshToken();

    if (!refreshToken) {
      // Нет refresh токена - выходим
      tokenStorage.clearTokens();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    try {
      // Вызываем ручку обновления токена
      const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
        refresh_token: refreshToken,
      });

      const { access_token, refresh_token, expires_at } = response.data;

      // Сохраняем новые токены
      tokenStorage.setTokens(access_token, refresh_token, expires_at);

      // Обновляем заголовок для оригинального запроса
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
      }

      // Обрабатываем очередь ожидающих запросов
      processQueue(null, access_token);

      // Повторяем оригинальный запрос
      return api(originalRequest);

    } catch (refreshError) {
      // Refresh токен тоже протух или невалиден - очищаем всё и редирект на логин
      console.error('Refresh token failed:', refreshError);
      tokenStorage.clearTokens();
      processQueue(refreshError as Error, null);
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

// ==== Типы ====
interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: number;
}

// ==== Auth API ====
export const authApi = {
  // Вход
  login: async (email: string, password: string): Promise<AuthTokens> => {
    const formData = new URLSearchParams();
    formData.append('grant_type', 'password');
    formData.append('username', email);
    formData.append('password', password);
    formData.append('scope', '');
    formData.append('client_id', 'string');
    formData.append('client_secret', 'string');

    const response = await api.post<AuthTokens>('/api/v1/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    // Автоматически сохраняем токены при логине
    tokenStorage.setTokens(
      response.data.access_token,
      response.data.refresh_token,
      response.data.expires_at
    );

    return response.data;
  },

  // Выход
  logout: () => {
    tokenStorage.clearTokens();
    window.location.href = '/login';
  },

  // Получить текущего пользователя
  getMe: async (): Promise<User> => {
    const response = await api.get<User>('/api/v1/auth/userinfo');
    return response.data;
  },

  // Загрузить аватар
  uploadAvatar: async (file: File): Promise<UserProfile> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<UserProfile>('/api/v1/users/me/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Регистрация по приглашению
  register: async (token: string, data: RegisterInput): Promise<User> => {
    const response = await api.post<User>(`/api/v1/auth/register/${token}`, data);
    return response.data;
  },

  getMyProfile: async (): Promise<User> => {
    const response = await api.get<User>('/api/v1/users/me');
    return response.data;
  },

};

// ==== Counterparties API ====
export const counterpartiesApi = {
  // Получить список контрагентов (с пагинацией)
  getAll: async (
    page: number = 1,
    size: number = 10,
    params?: {
      parent_id?: string;
    }
  ): Promise<PaginatedResponse<Counterparty>> => {
    const response = await api.get<PaginatedResponse<Counterparty>>('/api/v1/counterparties', {
      params: {
        page,
        size,
        parent_id: params?.parent_id,
      },
    });
    return response.data;
  },

  // Получить контрагента по ID
  getById: async (id: string): Promise<Counterparty> => {
    const response = await api.get<Counterparty>(`/api/v1/counterparties/${id}`);
    return response.data;
  },

  // Создать контрагента
  create: async (data: CreateCounterpartyInput): Promise<Counterparty> => {
    const response = await api.post<Counterparty>('/api/v1/counterparties', data);
    return response.data;
  },

  // Обновить контрагента
  update: async (id: string, data: Partial<CreateCounterpartyInput>): Promise<Counterparty> => {
    const response = await api.patch<Counterparty>(`/api/v1/counterparties/${id}`, data);
    return response.data;
  },

  // Удалить контрагента
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/counterparties/${id}`);
  },

  // Добавить обособленное подразделение
  createBranch: async (counterpartyId: string, data: CreateBranchInput): Promise<Counterparty> => {
    const response = await api.post<Counterparty>(`/api/v1/counterparties/${counterpartyId}`, data);
    return response.data;
  },

  // Получить контактное лицо
  getContactPerson: async (id: string): Promise<ContactPerson> => {
    const response = await api.get<ContactPerson>(`/api/v1/counterparties/${id}/contact-person`);
    return response.data;
  },

  // Создать/обновить контактное лицо
  updateContactPerson: async (id: string, data: ContactPersonInput): Promise<ContactPerson> => {
    const response = await api.post<ContactPerson>(`/api/v1/counterparties/${id}/contact-persons`, data);
    return response.data;
  },

  // Получить клиентов контрагента
  getCustomers: async (id: string): Promise<CounterpartyCustomer[]> => {
    const response = await api.get<CounterpartyCustomer[]>(`/api/v1/counterparties/${id}/customers`);
    return response.data;
  },

  deleteContactPerson: async (
    id: string,
    params: { phone?: string; email?: string }
  ): Promise<Counterparty> => {
    const response = await api.delete<Counterparty>(`/api/v1/counterparties/${id}/contact-persons`, {
      params: {
        phone: params.phone || undefined,
        email: params.email || undefined,
      },
    });
    return response.data;
  },

  // Получить подразделения — теперь грузим все страницы
  getBranches: async (id: string): Promise<Counterparty[]> => {
    let page = 1;
    let totalPages = 1;
    const items: Counterparty[] = [];

    do {
      const response = await counterpartiesApi.getAll(page, 100, { parent_id: id });
      items.push(...response.items.filter(c => c.parent_id === id));
      totalPages = response.total_pages;
      page += 1;
    } while (page <= totalPages);

    return items;
  },

  // Получить привязанные продукты контрагента
  getProducts: async (counterpartyId: string, page = 1, size = 10) => {
    const res = await api.get(`/api/v1/counterparties/${counterpartyId}/products`, {
      params: { page, size },
    });
    return res.data;
  },

  unlinkProduct: (counterpartyId: string, productId: string) =>
    api.delete(`/api/v1/counterparties/${counterpartyId}/products/${productId}`),

  linkProduct: async (
    counterpartyId: string,
    data: { product_id: string; environment: string; is_primary: boolean }
  ) => {
    const res = await api.post(`/api/v1/counterparties/${counterpartyId}/products`, data);
    return res.data;
  },
};

// ==== Invitations API ====
export const invitationsApi = {
  // Получить список приглашений (с пагинацией)
  getAll: async (page: number = 1, size: number = 10): Promise<PaginatedResponse<Invitation>> => {
    const response = await api.get<PaginatedResponse<Invitation>>('/api/v1/invitations', {
      params: { page, size },
    });
    return response.data;
  },

  // Получить приглашение по ID
  getById: async (id: string): Promise<Invitation> => {
    const response = await api.get<Invitation>(`/api/v1/invitations/${id}`);
    return response.data;
  },

  // Отправить приглашение (ВАЖНО: assigned_role, не role!)
  send: async (data: InvitationCreate): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>('/api/v1/invitations', data);
    return response.data;
  },

  // Отозвать приглашение
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/invitations/${id}`);
  },
};

// ==== Predict Response ====
interface PredictResponse {
  suggested_priority: TicketPriority;
  suggested_tags: { name: string; color: string }[];
  confidence: {
    priority: number;
    tags: number;
  };
}


// ==================== PROJECTS API ====================
export interface AddMemberRequest {
  user_id: string;
  project_role: 'owner' | 'manager' | 'member' | 'viewer' | 'customer' | 'customer_admin';
}

export interface AddMembersRequest {
  members: AddMemberRequest[];
}
export const projectsApi = {
  // Получить список проектов (с пагинацией)
 getAll: async (
  page: number = 1,
  size: number = 10,
  filters?: {
    counterparty_id?: string;
    statuses?: string[];
    q?: string;
  }
): Promise<PaginatedResponse<Project>> => {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('size', String(size));

  if (filters?.counterparty_id) {
    params.set('counterparty_id', filters.counterparty_id);
  }

  if (filters?.statuses?.length) {
    filters.statuses.forEach((s) => params.append('statuses', s));
  }

  if (filters?.q) {
    params.set('q', filters.q);
  }

  const response = await api.get<PaginatedResponse<Project>>(
    `/api/v1/projects?${params.toString()}`
  );
  return response.data;
},

  // Получить проект по ID
  getById: async (id: string): Promise<Project> => {
    const response = await api.get<Project>(`/api/v1/projects/${id}`);
    return response.data;
  },

  // Создать проект
  create: async (data: CreateProjectInput): Promise<Project> => {
    const response = await api.post<Project>('/api/v1/projects', data);
    return response.data;
  },

  // Обновить проект
  update: async (id: string, data: UpdateProjectInput): Promise<Project> => {
    const response = await api.patch<Project>(`/api/v1/projects/${id}`, data);
    return response.data;
  },

  // Архивировать проект
  archive: async (id: string): Promise<Project> => {
    const response = await api.delete<Project>(
      `/api/v1/projects/${id}`
    );
    return response.data;
  },

  // Получить проекты контрагента
  getByCounterparty: async (
    counterpartyId: string,
    page: number = 1,
    size: number = 10
  ): Promise<PaginatedResponse<Project>> => {
    const response = await api.get<PaginatedResponse<Project>>('/api/v1/projects', {
      params: { page, size, counterparty_id: counterpartyId },
    });
    return response.data;
  },


  getMembers: async (projectId: string): Promise<ProjectMemberResponse[]> => {
    const response = await api.get<ProjectMemberResponse[]>(
      `/api/v1/projects/${projectId}/members`
    );
    return response.data;
  },

  // 🔥 НОВЫЙ API: добавление участника с массивом ролей
  addMember: async (projectId: string, userId: string, roles: string[]): Promise<any> => {
    const response = await api.post(`/api/v1/projects/${projectId}/members`, {
      user_id: userId,
      project_roles: roles,
    });
    return response.data;
  },

  // 🔥 НОВЫЙ API: добавление нескольких участников
  addMembers: async (projectId: string, members: Array<{ user_id: string; project_roles: string[] }>): Promise<void> => {
    await Promise.all(
      members.map(member =>
        api.post(`/api/v1/projects/${projectId}/members`, {
          user_id: member.user_id,
          project_roles: member.project_roles,
        })
      )
    );
  },

  // 🔥 НОВЫЙ API: удаление участника
  removeMember: async (projectId: string, userId: string): Promise<void> => {
    await api.delete(`/api/v1/projects/${projectId}/members/${userId}`);
  },

  // Получить мои проекты (для customer)
  getMyProjects: async (
    role: 'all' | 'owner' | 'member' = 'all',
    page: number = 1,
    size: number = 10
  ): Promise<PaginatedResponse<Project>> => {
    const response = await api.get<PaginatedResponse<Project>>('/api/v1/projects/my', {
      params: { role, page, size },
    });
    return response.data;
  },

  // Выдаёт ключ по названию
  getKeySuggestion: async (
    name: string
  ): Promise<KeySuggestionResponse> => {
    const response = await api.get<KeySuggestionResponse>(
      '/api/v1/projects/key-suggestion',
      {
        params: { name },
      }
    );

    return response.data;
  },

  // Проверяет ключ на доступность
  checkKeyAvailability: async (
    key: string
  ): Promise<KeyAvailabilityResponse> => {
    const response = await api.get<KeyAvailabilityResponse>(
      `/api/v1/projects/keys/${encodeURIComponent(key)}`
    );

    return response.data;
  },

  // Создать этап (возвращает проект)
  createStage: async (projectId: string, payload: StageCreatePayload): Promise<Project> => {
    const response = await api.post<Project>(`/api/v1/projects/${projectId}/stages`, payload);
    return response.data;
  },

  // Обновить этап (возвращает этап)
  updateStage: async (projectId: string, stageId: string, payload: StageUpdatePayload): Promise<ProjectStageResponse> => {
    const response = await api.patch<ProjectStageResponse>(
      `/api/v1/projects/${projectId}/stages/${stageId}`,
      payload
    );
    return response.data;
  },

  // Удалить этап (возвращает проект)
  deleteStage: async (projectId: string, stageId: string): Promise<Project> => {
    const response = await api.delete<Project>(`/api/v1/projects/${projectId}/stages/${stageId}`);
    return response.data;
  },

  // Изменить порядок (возвращает проект)
  reorderStages: async (projectId: string, order: string[]): Promise<Project> => {
    const response = await api.patch<Project>(`/api/v1/projects/${projectId}/stages/order`, {
      new_order: order,
    });
    return response.data;
  },

  // Начать этап (возвращает проект)
  startStage: async (projectId: string, stageId: string): Promise<Project> => {
    const response = await api.post<Project>(`/api/v1/projects/${projectId}/stages/${stageId}/start`);
    return response.data;
  },

  // Завершить этап (возвращает проект)
  completeStage: async (projectId: string, stageId: string): Promise<Project> => {
    const response = await api.post<Project>(`/api/v1/projects/${projectId}/stages/${stageId}/complete`);
    return response.data;
  },

  // Пропустить этап (возвращает проект)
  skipStage: async (projectId: string, stageId: string): Promise<Project> => {
    const response = await api.post<Project>(`/api/v1/projects/${projectId}/stages/${stageId}/skip`);
    return response.data;
  },


};

// projectsApi в client.ts




// ==== Tickets (Заявки) API ====
export const ticketsApi = {
  // AI-помощник: определение приоритета и тегов
  predict: async (title: string, description: string): Promise<PredictResponse> => {
    const response = await api.post<PredictResponse>('/api/v1/tickets/predict', {
      title,
      description,
    });
    return response.data;
  },

  // Получить мои заявки (основной метод)
  getMy: async (
    page: number = 1,
    size: number = 10,
    status?: TicketStatus,
    priority?: TicketPriority
  ): Promise<PaginatedResponse<TicketListItem>> => {
    const response = await api.get<PaginatedResponse<TicketListItem>>('/api/v1/tickets/me', {
      params: { page, size, status, priority },
    });
    return response.data;
  },

  // Получить все заявки (для support и выше)
  // Получить все заявки с фильтрацией (единый метод)
  getAll: async (
    page: number = 1,
    size: number = 10,
    filters?: {
      status?: TicketStatus | TicketStatus[];  //  Поддержка массива
      priority?: TicketPriority;
      ticket_type?: string;
      tags?: string[];
      query?: string;
      counterparty_id?: string;                //  Добавлено
      project_ids?: string[];                  //  Добавлено
      assignee_id?: string;                    //  Добавлено
      reporter_id?: string;                    //  Добавлено
      created_after?: string;
      created_before?: string;
    }
  ): Promise<PaginatedResponse<TicketListItem>> => {
    const response = await api.post<PaginatedResponse<TicketListItem>>(
      '/api/v1/tickets/search',
      {
        //  Статусы (массив или одиночное значение)
        statuses: filters?.status
          ? (Array.isArray(filters.status) ? filters.status : [filters.status])
          : undefined,

        //  Приоритет
        priorities: filters?.priority || undefined,

        //  Тип
        type: filters?.ticket_type || undefined,

        //  Теги
        tags: filters?.tags || undefined,

        //  Поиск
        search_query: filters?.query || undefined,

        //  Контрагент
        counterparty_id: filters?.counterparty_id || undefined,

        //  Проекты (массив)
        project_ids: filters?.project_ids || undefined,

        //  Акторы (исполнитель и автор)
        actors: (filters?.assignee_id || filters?.reporter_id) ? {
          assignee_id: filters?.assignee_id || undefined,
          reporter_id: filters?.reporter_id || undefined,
        } : undefined,


      },
      {
        params: {
          page, size,
          created_after: filters?.created_after || undefined,
          created_before: filters?.created_before || undefined,
        }
      }
    );
    return response.data;
  },

  // Оставляем getAllWithFilters как алиас для обратной совместимости
  // (можно удалить после рефакторинга TicketsPage)
  getAllWithFilters: async (
    page: number = 1,
    size: number = 10,
    filters?: {
      status?: TicketStatus;
      priority?: TicketPriority;
      ticket_type?: string;
      query?: string;
      tags?: string[];
    }
  ): Promise<PaginatedResponse<TicketListItem>> => {
    return ticketsApi.getAll(page, size, filters);
  },

  // Получить заявку по ID
  getById: async (id: string): Promise<Ticket> => {
    const response = await api.get<Ticket>(`/api/v1/tickets/${id}`);
    return response.data;
  },

  // Создать заявку
  create: async (data: CreateTicketInput): Promise<Ticket> => {
    const response = await api.post<Ticket>('/api/v1/tickets', data);
    return response.data;
  },

  // Обновить заявку
  update: async (id: string, data: Partial<Ticket>): Promise<Ticket> => {
    const response = await api.patch<Ticket>(`/api/v1/tickets/${id}`, data);
    return response.data;
  },

  // Получить комментарий
  getComments: async (
    ticketId: string,
    params?: {
      include_internal?: boolean;
      page?: number;
      size?: number;
    }
  ): Promise<PaginatedResponse<Comment>> => {
    const response = await api.get<PaginatedResponse<Comment>>(
      `/api/v1/tickets/${ticketId}/comments`,
      {
        params: {
          include_internal: params?.include_internal || false,
          page: params?.page || 1,
          size: params?.size || 50
        }
      }
    );
    return response.data;
  },

  // Добавить комментарий - исправлен (возвращает комментарий, а не тикет)
  addComment: async (
    ticketId: string,
    text: string,
    type: 'public' | 'internal' | 'note' = 'public'
  ): Promise<Comment> => {
    const response = await api.post<Comment>(`/api/v1/tickets/${ticketId}/comments`, {
      text,
      type
    });
    return response.data;
  },

  // Редактировать комментарий (НОВЫЙ МЕТОД)
  updateComment: async (
    ticketId: string,
    commentId: string,
    text: string
  ): Promise<Comment> => {
    const response = await api.patch<Comment>(
      `/api/v1/tickets/${ticketId}/comments/${commentId}`,
      { text }
    );
    return response.data;
  },





  // Найти тикет по номеру (если бэкенд поддерживает)
  getByNumber: async (number: string): Promise<Ticket | null> => {
    try {
      // Пробуем через фильтр search
      const response = await api.get<PaginatedResponse<TicketListItem>>('/api/v1/tickets', {
        params: { search: number, page: 1, size: 1 }
      });

      if (response.data.items.length > 0) {
        const found = response.data.items[0];
        if (found.number === number) {
          return await ticketsApi.getById(found.id);
        }
      }
      return null;
    } catch (error) {
      console.error('Failed to find ticket by number:', error);
      return null;
    }
  },


  // Добавить метод для получения сотрудников контрагента (для фильтра по инициатору)
  getCompanyUsers: async (counterpartyId: string): Promise<CounterpartyCustomer[]> => {
    const response = await api.get<PaginatedResponse<CounterpartyCustomer>>(
      `/api/v1/counterparties/${counterpartyId}/customers`,
      { params: { page: 1, size: 100 } }
    );
    return response.data.items;
  },
  // Назначить исполнителя
  assignTicket: async (ticketId: string, assigneeId: string): Promise<Ticket> => {
    const response = await api.post<Ticket>(`/api/v1/tickets/${ticketId}/assign`, {
      assignee_id: assigneeId
    });
    return response.data;
  },

  // Изменить статус тикета
  updateTicketStatus: async (ticketId: string, status: TicketStatus): Promise<Ticket> => {
    const response = await api.patch<Ticket>(`/api/v1/tickets/${ticketId}/status`, {
      new_status: status
    });
    return response.data;
  },

  // Получить ответы на комментарий
  getCommentReplies: async (
    commentId: string,
    params?: {
      include_internal?: boolean;
      page?: number;
      size?: number;
    }
  ): Promise<PaginatedResponse<Comment>> => {
    const response = await api.get<PaginatedResponse<Comment>>(
      `/api/v1/tickets/comments/${commentId}/replies`,
      {
        params: {
          include_internal: params?.include_internal || false,
          page: params?.page || 1,
          size: params?.size || 10
        }
      }
    );
    return response.data;
  },

  // Ответить на комментарий
  replyToComment: async (
    ticketId: string,
    commentId: string,
    text: string,
    type: 'public' | 'internal' | 'note' = 'public'
  ): Promise<Comment> => {
    const response = await api.post<Comment>(
      `/api/v1/tickets/${ticketId}/comments/${commentId}/replies`,
      { text, type }
    );
    return response.data;
  },

  // Редактировать комментарий (обновлённый путь)
  editComment: async (
    ticketId: string,
    commentId: string,
    text: string
  ): Promise<Comment> => {
    const response = await api.patch<Comment>(
      `/api/v1/tickets/${ticketId}/comments/${commentId}`,
      { text }
    );
    return response.data;
  },

  // Удалить комментарий (обновлённый путь)
  deleteComment: async (
    ticketId: string,
    commentId: string
  ): Promise<void> => {
    await api.delete(`/api/v1/tickets/${ticketId}/comments/${commentId}`);
  },
  // Получить реакции комментария
  getCommentReactions: async (commentId: string): Promise<{ reaction_counts: Record<string, number>; user_reactions: string[] }> => {
    const response = await api.get(`/api/v1/tickets/comments/${commentId}/reactions`);
    return response.data;
  },

  // Поставить/убрать реакцию
  toggleReaction: async (commentId: string, reactionType: string): Promise<void> => {
    await api.post(`/api/v1/tickets/comments/${commentId}/reactions`, {
      reaction_type: reactionType
    });
  },

  archiveTicket: (ticketId: string) =>
    api.delete(`/api/v1/tickets/${ticketId}`).then(r => r.data),

  getHistory: async (ticketId: string, page = 1, size = 50) => {
    const response = await api.get(`/api/v1/tickets/${ticketId}/history`, {
      params: { page, size },
    });
    return response.data;
  },


};

const userByIdCache = new Map<string, SimpleUser>();

// ==== Users API ====
export const usersApi = {
  // Получить клиентов (пользователей) контрагента
  getCustomers: async (
    counterpartyId: string,
    page: number = 1,
    size: number = 100
  ): Promise<PaginatedResponse<CounterpartyCustomer>> => {
    const response = await api.get<PaginatedResponse<CounterpartyCustomer>>(
      `/api/v1/counterparties/${counterpartyId}/customers`,
      { params: { page, size } }
    );
    return response.data;
  },
  getSupports: async (page: number = 1, size: number = 100): Promise<PaginatedResponse<SimpleUser>> => {
    const response = await api.get<PaginatedResponse<SimpleUser>>('/api/v1/users/supports', {
      params: { page, size }
    });
    return response.data;
  },
  // В usersApi добавьте:
  getAllUsers: async (page: number = 1, size: number = 100): Promise<PaginatedResponse<SimpleUser>> => {
    const response = await api.get<PaginatedResponse<SimpleUser>>('/api/v1/users', {
      params: { page, size }
    });
    return response.data;
  },

  getById: async (userId: string): Promise<SimpleUser> => {
    const cached = userByIdCache.get(userId);
    if (cached) return cached;

    const response = await api.get<SimpleUser>(`/api/v1/users/${userId}`);
    userByIdCache.set(userId, response.data);
    return response.data;
  },

};

export default api;

// API для Коррекции текста
export const proofreadingApi = {
  spellCheck: async (text: string) => {
    const response = await api.post('/api/v1/spellchecking', { text });
    return response.data;
  }
};



//API Product
export const productsApi = {
  getProducts: async (params: {
    page?: number;
    size?: number;
    category?: string;
    status?: string;
    query?: string;
  }) => {
    const response = await api.get('/api/v1/products', { params });
    return response.data;
  },

  createProduct: async (payload: {
    name: string;
    vendor: string;
    category: string;
    description?: string;
    version?: string;
    status: string;
    attributes: Record<string, any>;
  }) => {
    const response = await api.post('/api/v1/products', payload);
    return response.data;
  },

  getCategorySchema: async (category: string) => {
    const response = await api.get(
      `/api/v1/products/categories/${encodeURIComponent(category)}/attributes-schema`
    );
    return response.data;
  },
};

// ==== Tasks API ====
export const tasksApi = {
  // Получить Kanban-доску
  getKanban: async (
    context: TaskKanbanContext,
    filters?: TaskKanbanFilters
  ): Promise<TaskKanbanResponse> => {
    const searchParams = new URLSearchParams();
    searchParams.append('page', String(filters?.page ?? 1));
    searchParams.append('size', String(filters?.size ?? 20));
    searchParams.append('overdue_only', String(filters?.overdue_only ?? false));

    if (filters?.priorities && filters.priorities.length > 0) {
      filters.priorities.forEach(p => searchParams.append('priorities', p));
    }

    const response = await api.post<TaskKanbanResponse>(
      '/api/v1/tasks/kanban',
      context,
      { params: searchParams }
    );

    return response.data;
  },

  // Создать задачу
  create: async (data: TaskCreateInput): Promise<TaskResponse> => {
    const response = await api.post<TaskResponse>('/api/v1/tasks', data);
    return response.data;
  },

  // Редактировать задачу
  update: async (
    taskId: string,
    data: TaskUpdateInput
  ): Promise<TaskResponse> => {
    const response = await api.patch<TaskResponse>(`/api/v1/tasks/${taskId}`, data);
    return response.data;
  },

  // Архивировать задачу
  archive: async (taskId: string): Promise<TaskResponse> => {
    const response = await api.delete<TaskResponse>(`/api/v1/tasks/${taskId}`);
    return response.data;
  },

  // Сменить статус
  changeStatus: async (
    taskId: string,
    newStatus: TaskStatus
  ): Promise<TaskResponse> => {
    const response = await api.post<TaskResponse>(`/api/v1/tasks/${taskId}/status`, {
      new_status: newStatus,
    });

    return response.data;
  },

  // Назначить исполнителя
  assign: async (
    taskId: string,
    data: TaskAssignInput
  ): Promise<TaskResponse> => {
    const response = await api.post<TaskResponse>(`/api/v1/tasks/${taskId}/assign`, data);
    return response.data;
  },

  // Запросить ревью
  requestReview: async (
    taskId: string,
    data: TaskRequestReviewInput
  ): Promise<TaskResponse> => {
    const response = await api.post<TaskResponse>(
      `/api/v1/tasks/${taskId}/request-review`,
      data
    );

    return response.data;
  },

  // Провести ревью
  review: async (
    taskId: string,
    data: TaskReviewInput
  ): Promise<TaskResponse> => {
    const response = await api.post<TaskResponse>(`/api/v1/tasks/${taskId}/review`, data);
    return response.data;
  },
};

// ═══ Notifications API ═══

export interface Notification {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  data: Record<string, any> | null;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export interface NotificationStreamPayload {
  type: 'notification';
  notification: Notification;
}

function getNotificationStreamUrl() {
  return (
    import.meta.env.VITE_NOTIFICATIONS_STREAM_URL ||
    'http://10.1.50.109:8001/notifications/stream'
  );
}

function getAccessTokenForSSE(): string | null {
  // Используем тот же источник токена что и в apiClient
  return tokenStorage.getAccessToken();
}

function parseNotificationStreamData(raw: string): NotificationStreamPayload | null {
  if (!raw?.trim()) return null;

  // 1. Сначала пробуем как обычный JSON
  try {
    return JSON.parse(raw);
  } catch {
    // fallback ниже
  }

  // 2. Fallback для python dict string:
  // {'a': 1, 'b': False} -> {"a": 1, "b": false}
  try {
    const normalized = raw
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null')
      .replace(/'/g, '"');

    return JSON.parse(normalized);
  } catch (err) {
    console.error('[notifications] Failed to parse stream payload:', err, raw);
    return null;
  }
}
const NOTIFICATIONS_BASE = 'http://10.1.50.109:8001';

export const notificationsApi = {
  getAll: async (page = 1, size = 20, unreadOnly = false) => {
    const response = await api.get(`${NOTIFICATIONS_BASE}/notifications`, {
      params: { page, size, unread_only: unreadOnly },
    });
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await api.get(`${NOTIFICATIONS_BASE}/notifications/unread-count`);
    return response.data.unread_count;
  },

  markAsRead: async (notificationId: string) => {
    const response = await api.patch(`${NOTIFICATIONS_BASE}/notifications/${notificationId}/read`);
    return response.data;
  },

  // SSE stream
  stream: async ({
    signal,
    onNotification,
    onOpen,
    onError,
  }: {
    signal: AbortSignal;
    onNotification: (notification: Notification, payload: NotificationStreamPayload) => void;
    onOpen?: () => void;
    onError?: (err: any) => void;
  }) => {
    const token = getAccessTokenForSSE();
    if (!token) throw new Error('No access token for notifications stream');

    return fetchEventSource(getNotificationStreamUrl(), {
      method: 'GET',
      signal,
      openWhenHidden: true,
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      },

      async onopen(response) {
        if (!response.ok) {
          throw new Error(`SSE open failed: ${response.status}`);
        }
        onOpen?.();
      },

      onmessage(event) {
        if (!event.data) return;

        const payload = parseNotificationStreamData(event.data);
        if (!payload) return;

        if (payload.type === 'notification' && payload.notification) {
          onNotification(payload.notification, payload);
        }
      },

      onclose() {
        throw new Error('SSE connection closed');
      },

      onerror(err) {
        console.error('[notifications] SSE error:', err);
        onError?.(err);
        return 3000; // retry
      },
    });
  },
};

// ═══════════════════════════════════════════════════════════════
// FEEDBACKS API
// ═══════════════════════════════════════════════════════════════

export interface Feedback {
  id: string;
  created_at: string;
  updated_at: string;
  ticket_id: string;
  author_id: string;
  rating: number;
  comment: string;
}

export interface FeedbackCreateInput {
  ticket_id: string;
  rating: number;
  comment: string;
}

export interface FeedbackUpdateInput {
  rating?: number;
  comment?: string;
}

export interface FeedbackListResponse {
  page: number;
  size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
  items: Feedback[];
}

export const feedbacksApi = {
  create: async (data: FeedbackCreateInput): Promise<Feedback> => {
    const res = await api.post('/api/v1/feedbacks', data);
    return res.data;
  },

  getAll: async (
    page = 1,
    size = 10,
    filters?: { rating?: number; ticketId?: string; author_id?: string }
  ): Promise<FeedbackListResponse> => {
    const params: Record<string, any> = { page, size };
    if (filters?.rating) params.rating = filters.rating;
    if (filters?.ticketId) params.ticketId = filters.ticketId;
    if (filters?.author_id) params.author_id = filters.author_id;
    const res = await api.get('/api/v1/feedbacks', { params });
    return res.data;
  },

  getMy: async (page = 1, size = 12) => {
    const response = await api.get(`/api/v1/feedbacks/my`, {
      params: { page, size },
    });
    return response.data;
  },

  update: async (id: string, data: FeedbackUpdateInput): Promise<Feedback> => {
    const res = await api.patch(`/api/v1/feedbacks/${id}`, data);
    return res.data;
  },

  delete: async (id: string): Promise<Feedback> => {
    const res = await api.delete(`/api/v1/feedbacks/${id}`);
    return res.data;
  },
};