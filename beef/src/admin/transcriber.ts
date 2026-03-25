import OpenAI from 'openai';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createReadStream } from 'node:fs';
import type { Logger } from 'pino';

export class Transcriber {
  private readonly openai: OpenAI;
  private readonly logger: Logger;

  constructor(apiKey: string, logger: Logger) {
    this.openai = new OpenAI({ apiKey });
    this.logger = logger;
  }

  /**
   * Download a Telegram file and transcribe it via Whisper.
   * Supports voice (.ogg) and video_note (.mp4) — both accepted by Whisper natively.
   */
  async transcribe(fileUrl: string, extension: string): Promise<string> {
    const tmpPath = join(tmpdir(), `beef-feedback-${randomUUID()}${extension}`);
    try {
      await this.downloadFile(fileUrl, tmpPath);
      const transcription = await this.openai.audio.transcriptions.create({
        file: createReadStream(tmpPath),
        model: 'whisper-1',
      });
      this.logger.debug({ chars: transcription.text.length }, 'Whisper transcription complete');
      return transcription.text;
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download file: ${String(response.status)}`);
    }
    const ws = createWriteStream(dest);
    // Node fetch body is a ReadableStream, pipe via node stream
    await pipeline(response.body as unknown as NodeJS.ReadableStream, ws);
  }
}
