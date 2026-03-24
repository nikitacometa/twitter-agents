import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
const IMGFLIP_API_URL = 'https://api.imgflip.com/caption_image';

interface ImgflipResponse {
  success: boolean;
  data?: { url: string; page_url: string };
  error_message?: string;
}

export interface CaptionResult {
  url: string;
  pageUrl: string;
}

export class ImgflipClient {
  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly logger: Logger,
  ) {}

  get isConfigured(): boolean {
    return this.username.length > 0 && this.password.length > 0;
  }

  async captionImage(templateId: string, boxes: string[]): Promise<CaptionResult> {
    const body = new URLSearchParams({
      template_id: templateId,
      username: this.username,
      password: this.password,
    });

    for (let i = 0; i < boxes.length; i++) {
      body.append(`boxes[${String(i)}][text]`, boxes[i]!);
    }

    const response = await fetch(IMGFLIP_API_URL, {
      method: 'POST',
      body,
    });

    if (!response.ok) {
      throw new Error(`Imgflip API HTTP ${String(response.status)}: ${response.statusText}`);
    }

    const json = (await response.json()) as ImgflipResponse;

    if (!json.success || !json.data) {
      throw new Error(`Imgflip API error: ${json.error_message ?? 'unknown error'}`);
    }

    this.logger.debug(
      { templateId, url: json.data.url },
      'Imgflip meme created',
    );

    return { url: json.data.url, pageUrl: json.data.page_url };
  }

  async downloadToTmp(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download meme image: HTTP ${String(response.status)}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = imageUrl.includes('.png') ? '.png' : '.jpg';
    const filePath = join(tmpdir(), `beef-meme-${randomUUID()}${ext}`);

    await writeFile(filePath, buffer);
    this.logger.debug({ filePath, bytes: buffer.length }, 'Meme image downloaded');

    return filePath;
  }

  static async cleanupTmpFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch {
      // Ignore cleanup failures
    }
  }
}
