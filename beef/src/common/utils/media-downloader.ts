import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Logger } from 'pino';

const MEDIA_TMP_DIR = join('/tmp', 'beef-media');
const MAX_IMAGES = 4;
const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export interface DownloadedMedia {
  paths: string[];
  cleanup: () => Promise<void>;
}

/**
 * Download tweet images to temp files for LLM consumption.
 * Returns file paths and a cleanup function.
 * Skips failed downloads gracefully — partial results are fine.
 */
export async function downloadTweetMedia(
  urls: string[],
  logger: Logger,
): Promise<DownloadedMedia> {
  const paths: string[] = [];
  const toDownload = urls.slice(0, MAX_IMAGES);

  if (toDownload.length === 0) {
    return { paths, cleanup: async () => {} };
  }

  await mkdir(MEDIA_TMP_DIR, { recursive: true });
  const batchId = randomBytes(4).toString('hex');

  const downloads = toDownload.map(async (url, i) => {
    const ext = url.includes('.png') ? 'png' : 'jpg';
    const filePath = join(MEDIA_TMP_DIR, `${batchId}-${String(i)}.${ext}`);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });

      if (!response.ok) {
        logger.debug({ url, status: response.status }, 'Media download failed — HTTP error');
        return null;
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_SIZE_BYTES) {
        logger.debug({ url, size: contentLength }, 'Media download skipped — too large');
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_SIZE_BYTES) {
        logger.debug({ url, size: buffer.length }, 'Media download skipped — too large');
        return null;
      }

      await writeFile(filePath, buffer);
      return filePath;
    } catch (error) {
      logger.debug({ err: error, url }, 'Media download failed');
      return null;
    }
  });

  const results = await Promise.all(downloads);
  for (const p of results) {
    if (p) paths.push(p);
  }

  if (paths.length > 0) {
    logger.info(
      { count: paths.length, requested: toDownload.length, batchId },
      'Tweet media downloaded',
    );
  }

  return {
    paths,
    cleanup: async () => {
      for (const p of paths) {
        try {
          await unlink(p);
        } catch {
          // Already deleted — fine
        }
      }
    },
  };
}
