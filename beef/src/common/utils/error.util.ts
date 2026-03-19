/**
 * Safely extracts a message from an unknown error.
 * Use instead of inline `error instanceof Error` checks.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Error that should not be retried (rate limits, permission errors, etc.).
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

/**
 * Retries an async function with exponential backoff.
 * Throws the last error after all retries are exhausted.
 * Immediately rethrows NonRetryableError without retrying.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; label?: string; warn?: (msg: string) => void } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, label = 'operation', warn } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof NonRetryableError) {
        throw error;
      }
      if (attempt === maxRetries) {
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
      const msg = `${label} failed (attempt ${String(attempt + 1)}/${String(maxRetries + 1)}): ${getErrorMessage(error)}. Retrying in ${String(Math.round(delay))}ms`;
      if (warn) {
        warn(msg);
      } else {
        console.warn(msg);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}
