import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";

// O TCP connect ate o PokéData (OVH) leva ~300ms; o default de 250ms do
// Happy Eyeballs do Node derruba a tentativa antes de completar (ETIMEDOUT).
try {
  setDefaultAutoSelectFamilyAttemptTimeout(2000);
} catch {
  // versoes antigas do Node nao expoem o setter; segue com o default.
}

// Sem User-Agent o undici manda apenas "node", que alguns proxies/WAF (OVH,
// Cloudflare) tratam como bot e derrubam a conexao antes da resposta.
const USER_AGENT =
  "vgc-featured-match-finder/0.1 (+https://github.com/; serverless fetch)";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 500;

export type FetchWithRetryOptions = {
  /** Tempo maximo por tentativa antes de abortar (default 15s). */
  timeoutMs?: number;
  /** Numero de tentativas adicionais apos a primeira falha (default 3). */
  retries?: number;
  /** Atraso base do backoff exponencial entre tentativas (default 500ms). */
  backoffMs?: number;
  /** Rotulo amigavel da fonte, usado nas mensagens de erro. */
  label?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Extrai uma descricao util do erro de rede. O `fetch` do Node lanca um
 * `TypeError: fetch failed` generico e esconde o motivo real em `.cause`
 * (ETIMEDOUT, ECONNRESET, ENOTFOUND, etc.). Aqui trazemos isso a tona.
 */
function describeNetworkError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: string }).code;
    return code ? `${cause.message} (${code})` : cause.message;
  }

  const code = (error as { code?: string }).code;
  return code ? `${error.message} (${code})` : error.message;
}

/** Erros de rede transitorios valem nova tentativa; HTTP 4xx (exceto 429) nao. */
function isRetriableNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "TypeError" || "cause" in error;
}

/**
 * `fetch` resiliente para fontes publicas: aplica timeout por tentativa,
 * retenta falhas de rede transitorias e respostas 5xx/429 com backoff
 * exponencial e enriquece a mensagem de erro com a causa real (em vez do
 * generico "fetch failed").
 */
export async function fetchWithRetry(
  url: string | URL,
  init: RequestInit = {},
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const label = options.label ?? new URL(url).host;

  const headers = new Headers(init.headers);
  if (!headers.has("user-agent")) {
    headers.set("user-agent", USER_AGENT);
  }
  if (!headers.has("accept")) {
    headers.set("accept", "application/json, text/html, */*");
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, headers, signal: controller.signal });

      // 5xx e 429 costumam ser transitorios; vale retentar com backoff.
      if ((response.status >= 500 || response.status === 429) && attempt < retries) {
        lastError = new Error(`${label} respondeu ${response.status}`);
        await sleep(backoffMs * 2 ** attempt);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      const retriable = isRetriableNetworkError(error);
      if (!retriable || attempt >= retries) {
        const timedOut =
          error instanceof DOMException && error.name === "AbortError";
        const reason = timedOut
          ? `tempo esgotado apos ${timeoutMs}ms`
          : describeNetworkError(error);
        throw new Error(`falha ao acessar ${label}: ${reason}`);
      }

      await sleep(backoffMs * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`falha ao acessar ${label}: ${describeNetworkError(lastError)}`);
}
