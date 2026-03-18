import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { Logger } from 'pino';

const DEFAULT_PATH = './data/twitter-cookies.json';

export class CookieStore {
  private readonly path: string;
  private readonly logger: Logger;

  constructor(logger: Logger, path = DEFAULT_PATH) {
    this.path = path;
    this.logger = logger;
  }

  load(): string[] | null {
    if (!existsSync(this.path)) {
      this.logger.debug({ path: this.path }, 'No saved cookies found');
      return null;
    }

    try {
      const raw = readFileSync(this.path, 'utf-8');
      const cookies: unknown = JSON.parse(raw);
      if (!Array.isArray(cookies) || cookies.length === 0) return null;
      this.logger.info({ count: cookies.length }, 'Loaded cookies from disk');
      return cookies as string[];
    } catch (error) {
      this.logger.warn({ err: error, path: this.path }, 'Failed to load cookies');
      return null;
    }
  }

  save(cookies: string[]): void {
    try {
      writeFileSync(this.path, JSON.stringify(cookies, null, 2), 'utf-8');
      this.logger.info({ count: cookies.length, path: this.path }, 'Cookies saved to disk');
    } catch (error) {
      this.logger.error({ err: error, path: this.path }, 'Failed to save cookies');
    }
  }
}
