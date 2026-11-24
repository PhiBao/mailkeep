import type { Config } from '../config.js';

export const GATEWAY_ORIGIN = 'https://api.sprites.dev/v1/gateway';
export type Provider = 'typesafe' | 'ollama' | 'pinecone' | 'box' | 'agentmail';

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly provider?: Provider,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export class GatewayDenied extends GatewayError {
  constructor(provider: Provider, status = 403) {
    super(`Gateway denied ${provider}`, provider, status);
    this.name = 'GatewayDenied';
  }
}

export class GatewayUnauthed extends GatewayError {
  constructor(provider: Provider, status = 401) {
    super(`Gateway authentication failed for ${provider}`, provider, status);
    this.name = 'GatewayUnauthed';
  }
}

export class ProviderError extends GatewayError {
  constructor(provider: Provider, status: number) {
    super(`Provider ${provider} returned HTTP ${status}`, provider, status);
    this.name = 'ProviderError';
  }
}

export class GatewayTimeout extends GatewayError {
  constructor(provider: Provider) {
    super(`Gateway request to ${provider} timed out`, provider);
    this.name = 'GatewayTimeout';
  }
}

export interface GatewayResponse {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
}

export interface RequestOptions {
  json?: unknown;
  body?: string | Uint8Array | FormData;
  headers?: Headers | Record<string, string>;
  timeoutMs?: number;
  retry?: number;
}

interface GatewayClientOptions {
  config: Config;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  logger?: {
    info: (fields: Record<string, unknown>, message: string) => void;
    warn: (fields: Record<string, unknown>, message: string) => void;
  };
}

interface Connection {
  provider: string;
  gateway_base_url?: string;
  provider_info?: { base_api_url?: string };
}

const RETRYABLE = new Set([429, 529, 502, 503, 504]);

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

export class GatewayClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly logger: NonNullable<GatewayClientOptions['logger']>;
  private bases = new Map<Provider, string>();

  constructor(private readonly options: GatewayClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.logger = options.logger ?? {
      info: (fields, message) => console.info(JSON.stringify({ ...fields, event: message })),
      warn: (fields, message) => console.warn(JSON.stringify({ ...fields, event: message })),
    };
  }

  private configuredBase(provider: Provider): string | undefined {
    const values: Record<Provider, string | undefined> = {
      typesafe: this.options.config.GW_BASE_TYPESAFE,
      ollama: this.options.config.GW_BASE_OLLAMA,
      pinecone: this.options.config.GW_BASE_PINECONE,
      box: this.options.config.GW_BASE_BOX,
      agentmail: this.options.config.GW_BASE_AGENTMAIL,
    };
    return values[provider] || undefined;
  }

  async discover(): Promise<Map<Provider, string>> {
    if (this.bases.size > 0) return this.bases;
    const response = await this.fetchImpl(`${GATEWAY_ORIGIN}/list`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new GatewayError(`Gateway discovery returned HTTP ${response.status}`);
    const payload = (await response.json()) as { connections?: Connection[] };
    const discovered = new Map<Provider, string>();
    for (const connection of payload.connections ?? []) {
      if (!connection.gateway_base_url) continue;
      if (
        connection.provider === 'typesafe' ||
        connection.provider === 'ollama' ||
        connection.provider === 'pinecone' ||
        connection.provider === 'box' ||
        connection.provider === 'agentmail'
      ) {
        discovered.set(connection.provider, connection.gateway_base_url);
      }
      if (
        connection.provider === 'custom_api' &&
        connection.provider_info?.base_api_url === 'https://api.agentmail.to'
      ) {
        discovered.set('agentmail', connection.gateway_base_url);
      }
    }
    for (const provider of ['typesafe', 'ollama', 'pinecone', 'box', 'agentmail'] as const) {
      const override = this.configuredBase(provider);
      if (override) discovered.set(provider, override);
    }
    this.bases = discovered;
    return discovered;
  }

  private backoff(attempt: number, retryAfter?: number): number {
    if (retryAfter !== undefined) return retryAfter;
    return Math.round(250 * 2 ** attempt + this.random() * 250);
  }

  async request(
    provider: Provider,
    method: string,
    requestPath: string,
    options: RequestOptions = {},
  ): Promise<GatewayResponse> {
    const bases = await this.discover();
    const base = bases.get(provider);
    if (!base) throw new GatewayError(`No gateway base for ${provider}`, provider);
    const retries = options.retry ?? 3;
    const timeoutMs = options.timeoutMs ?? (provider === 'ollama' ? 120_000 : 30_000);

    for (let attempt = 0; ; attempt += 1) {
      const started = performance.now();
      const headers = new Headers(options.headers);
      if (options.json !== undefined) headers.set('Content-Type', 'application/json');
      const body =
        options.body ?? (options.json !== undefined ? JSON.stringify(options.json) : undefined);
      const init: RequestInit = { method, headers, signal: AbortSignal.timeout(timeoutMs) };
      if (body !== undefined) init.body = body;
      let response: Response;
      try {
        response = await this.fetchImpl(new URL(requestPath.replace(/^\/+/, ''), `${base}/`), init);
      } catch (error) {
        if (attempt < retries) {
          await this.sleep(this.backoff(attempt));
          continue;
        }
        if (error instanceof Error && error.name === 'TimeoutError') {
          throw new GatewayTimeout(provider);
        }
        throw new GatewayError(`Network error calling ${provider}`, provider);
      }

      const latency = Math.round(performance.now() - started);
      this.logger.info(
        { provider, path: requestPath, status: response.status, latency },
        'gateway_request',
      );
      if (response.status === 401) throw new GatewayUnauthed(provider, response.status);
      if (response.status === 403) throw new GatewayDenied(provider, response.status);
      if (!response.ok && RETRYABLE.has(response.status) && attempt < retries) {
        const retryAfter = retryAfterMilliseconds(response.headers.get('retry-after'));
        await this.sleep(this.backoff(attempt, retryAfter));
        continue;
      }
      if (!response.ok) throw new ProviderError(provider, response.status);

      const text = await response.text();
      let json: unknown = null;
      if (text.length > 0) {
        try {
          json = JSON.parse(text);
        } catch {}
      }
      return { status: response.status, headers: response.headers, text, json };
    }
  }
}
