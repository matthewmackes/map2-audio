export interface SafeJsonFetchOptions {
  fallbackError?: string;
  errorMessageExtractor?: (payload: unknown, fallback: string) => string;
}

const NON_JSON_REMEDIATION =
  'Verify backend API is reachable and /api/* is proxied to backend (dev proxy or reverse proxy).';

function normalizePreview(raw: string): string {
  const compact = raw.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '';
  }
  return compact.length <= 180 ? compact : `${compact.slice(0, 177)}...`;
}

function buildNonJsonErrorMessage(
  url: string,
  response: Response,
  contentType: string,
  bodyPreview: string
): string {
  const statusSummary = `${response.status} ${response.statusText}`.trim();
  const preview = bodyPreview ? ` Body preview: ${bodyPreview}` : '';
  return `Expected JSON from ${url} but received ${contentType || 'unknown content-type'} (${statusSummary}). ${NON_JSON_REMEDIATION}${preview}`;
}

function isJsonContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return normalized.includes('application/json') || normalized.includes('+json');
}

function readContentType(response: Response): string {
  try {
    return response.headers.get('content-type') || '';
  } catch (_error) {
    return '';
  }
}

export async function safeFetchJson<T>(
  url: string,
  init?: RequestInit,
  options: SafeJsonFetchOptions = {}
): Promise<T> {
  const response = await fetch(url, init);
  const contentType = readContentType(response);
  const statusSummary = `${response.status} ${response.statusText}`.trim();
  const fallbackError = options.fallbackError
    ? `${options.fallbackError} (${statusSummary})`
    : `HTTP ${statusSummary}`;
  const hasJsonParser = typeof (response as unknown as { json?: unknown }).json === 'function';
  const isJson = isJsonContentType(contentType) || (!contentType && hasJsonParser);

  if (isJson) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (_error) {
      throw new Error(
        `Invalid JSON response from ${url} (${response.status} ${response.statusText}). ${NON_JSON_REMEDIATION}`
      );
    }

    if (!response.ok) {
      if (options.errorMessageExtractor) {
        throw new Error(options.errorMessageExtractor(payload, fallbackError));
      }
      if (payload && typeof payload === 'object') {
        const obj = payload as Record<string, unknown>;
        if (typeof obj.error === 'string' && obj.error.trim()) {
          throw new Error(obj.error);
        }
        if (typeof obj.detail === 'string' && obj.detail.trim()) {
          throw new Error(obj.detail);
        }
      }
      throw new Error(fallbackError);
    }

    return payload as T;
  }

  const rawText = typeof (response as unknown as { text?: unknown }).text === 'function'
    ? await response.text().catch(() => '')
    : '';
  const bodyPreview = normalizePreview(rawText);
  const nonJsonMessage = buildNonJsonErrorMessage(url, response, contentType, bodyPreview);

  if (!response.ok) {
    throw new Error(nonJsonMessage);
  }

  throw new Error(nonJsonMessage);
}
