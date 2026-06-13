import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./http";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function okResponse(body = "ok"): Response {
  return new Response(body, { status: 200 });
}

/** Simula o erro generico do undici, que esconde o motivo real em `.cause`. */
function networkError(code: string): TypeError {
  const error = new TypeError("fetch failed");
  (error as { cause?: unknown }).cause = Object.assign(new Error("connect"), { code });
  return error;
}

describe("fetchWithRetry", () => {
  it("retenta falhas de rede transitorias e devolve o sucesso", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkError("ETIMEDOUT"))
      .mockResolvedValueOnce(okResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await fetchWithRetry("https://example.test/", {}, { backoffMs: 0 });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retenta respostas 5xx antes de aceitar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 503 }))
      .mockResolvedValueOnce(okResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await fetchWithRetry("https://example.test/", {}, { backoffMs: 0 });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("expoe a causa real em vez do generico 'fetch failed'", async () => {
    const fetchMock = vi.fn().mockRejectedValue(networkError("ECONNRESET"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      fetchWithRetry("https://example.test/", {}, { retries: 1, backoffMs: 0, label: "fonte X" })
    ).rejects.toThrow(/fonte X.*ECONNRESET/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("envia um User-Agent para nao ser bloqueado por WAF", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchWithRetry("https://example.test/", {}, { backoffMs: 0 });

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get("user-agent")).toMatch(/vgc-featured-match-finder/);
  });

  it("nao retenta erros 4xx do cliente", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad", { status: 404 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await fetchWithRetry("https://example.test/", {}, { backoffMs: 0 });

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
