/**
 * Safely extracts a message from an unknown error.
 * Use instead of inline `error instanceof Error` checks.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Retries an async function with exponential backoff.
 * Throws the last error after all retries are exhausted.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, label = 'operation' } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
      console.warn(
        `${label} failed (attempt ${String(attempt + 1)}/${String(maxRetries + 1)}): ${getErrorMessage(error)}. Retrying in ${String(Math.round(delay))}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}
