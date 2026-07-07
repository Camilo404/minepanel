import { getPublicEnv } from './public-env';

export type SseStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface SseHandle<T> {
  cancel(): void;
  status: SseStatus;
  reconnectAttempt: number;
}

export interface SseOptions<T> {
  onMessage: (data: T, meta: { raw: string }) => void;
  onStatus?: (status: SseStatus) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
  baseReconnectMs?: number;
  maxReconnectMs?: number;
  credentials?: RequestCredentials;
}

const DEFAULT_BASE_RECONNECT_MS = 1_000;
const DEFAULT_MAX_RECONNECT_MS = 30_000;

export function openSse<T>(path: string, options: SseOptions<T>): SseHandle<T> {
  const baseUrl = getPublicEnv('NEXT_PUBLIC_BACKEND_URL');
  const baseUrlNormalized = baseUrl && baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const pathNormalized = path.startsWith('/') ? path : `/${path}`;
  const initialUrl = `${baseUrlNormalized ?? ''}${pathNormalized}`;

  const baseReconnectMs = options.baseReconnectMs ?? DEFAULT_BASE_RECONNECT_MS;
  const maxReconnectMs = options.maxReconnectMs ?? DEFAULT_MAX_RECONNECT_MS;
  const credentials: RequestCredentials = options.credentials ?? 'include';
  const externalSignal = options.signal ?? null;

  let status: SseStatus = 'connecting';
  let reconnectAttempt = 0;
  let aborted = false;
  let currentController: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let resumeId: string | undefined;
  let currentUrl = initialUrl;

  const setStatus = (next: SseStatus) => {
    if (status === next) return;
    status = next;
    options.onStatus?.(next);
  };

  const cleanup = () => {
    if (currentController) {
      currentController.abort();
      currentController = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const computeBackoff = (): number => {
    const expo = Math.min(maxReconnectMs, baseReconnectMs * 2 ** reconnectAttempt);
    const jitter = Math.random() * (expo * 0.25);
    return Math.round(expo + jitter);
  };

  const scheduleReconnect = () => {
    if (aborted || externalSignal?.aborted) return;
    reconnectAttempt += 1;
    setStatus('reconnecting');
    const delay = computeBackoff();
    reconnectTimer = setTimeout(() => {
      void connect();
    }, delay);
  };

  const buildUrlWithResume = (): string => {
    if (!resumeId) return currentUrl;
    const separator = currentUrl.includes('?') ? '&' : '?';
    return `${currentUrl}${separator}since=${encodeURIComponent(resumeId)}`;
  };

  const connect = async () => {
    if (aborted || externalSignal?.aborted) return;
    currentController = new AbortController();
    const externalListener = () => currentController?.abort();
    externalSignal?.addEventListener('abort', externalListener, { once: true });

    try {
      const response = await fetch(buildUrlWithResume(), {
        method: 'GET',
        credentials,
        headers: {
          Accept: 'text/event-stream',
        },
        signal: currentController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE request failed: ${response.status} ${response.statusText}`);
      }
      if (!response.body) {
        throw new Error('SSE response has no body');
      }

      reconnectAttempt = 0;
      setStatus('open');
      let buffer = '';

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      const dispatchFrame = (raw: string) => {
        const parsed = parseSseFrame(raw);
        if (parsed === undefined) return;
        const idMatch = /\nid:\s*([^\n]+)/.exec(raw);
        if (idMatch) resumeId = idMatch[1].trim();
        try {
          options.onMessage(parsed as T, { raw });
        } catch (callbackError) {
          options.onError?.(callbackError as Error);
        }
      };

      while (!aborted && !externalSignal?.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          dispatchFrame(raw);
          boundary = buffer.indexOf('\n\n');
        }
      }

      externalSignal?.removeEventListener('abort', externalListener);
      if (!aborted && !externalSignal?.aborted) {
        scheduleReconnect();
      }
    } catch (error) {
      externalSignal?.removeEventListener('abort', externalListener);
      if (aborted || externalSignal?.aborted) return;
      const err = error instanceof Error ? error : new Error(String(error));
      options.onError?.(err);
      scheduleReconnect();
    }
  };

  void connect();

  return {
    cancel: () => {
      aborted = true;
      cleanup();
      setStatus('closed');
    },
    get status() {
      return status;
    },
    get reconnectAttempt() {
      return reconnectAttempt;
    },
  };
}

function parseSseFrame(frame: string): unknown {
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('data:')) {
      data += line.slice(5).trim();
    }
  }
  if (!data) return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}