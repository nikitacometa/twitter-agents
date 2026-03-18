import type { Logger } from 'pino';

const OEMBED_URL = 'https://publish.x.com/oembed';
const FETCH_TIMEOUT_MS = 10_000;

// Matches twitter.com or x.com tweet URLs
const TWEET_URL_RE = /^https?:\/\/(?:(?:www\.)?(?:twitter|x)\.com)\/\w+\/status\/(\d+)/;

export interface FetchedTweet {
  text: string;
  authorName: string;
  authorUrl: string;
  tweetUrl: string;
}

/**
 * Extract clean text from oEmbed HTML response.
 * The HTML contains a <blockquote> with <p> tags holding the tweet text.
 * Links become <a> tags — we extract their text content.
 */
function extractTextFromHtml(html: string): string {
  // Extract content between <p> tags inside the blockquote
  const pMatch = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs: string[] = [];

  let match = pMatch.exec(html);
  while (match) {
    paragraphs.push(match[1] ?? '');
    match = pMatch.exec(html);
  }

  if (paragraphs.length === 0) return '';

  return paragraphs
    .map((p) =>
      p
        // Replace <br> with newlines
        .replace(/<br\s*\/?>/gi, '\n')
        // Replace <a> tags with their text content
        .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
        // Strip remaining HTML tags
        .replace(/<[^>]+>/g, '')
        // Decode HTML entities
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

export function isTweetUrl(text: string): boolean {
  return TWEET_URL_RE.test(text.trim());
}

export async function fetchTweetByUrl(
  url: string,
  logger: Logger,
): Promise<FetchedTweet | null> {
  const trimmed = url.trim();
  if (!TWEET_URL_RE.test(trimmed)) {
    logger.warn({ url: trimmed }, 'Not a valid tweet URL');
    return null;
  }

  try {
    const oembedUrl = `${OEMBED_URL}?url=${encodeURIComponent(trimmed)}&omit_script=true`;
    const response = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'BeefBot/1.0' },
    });

    if (!response.ok) {
      logger.warn(
        { url: trimmed, status: response.status },
        'oEmbed request failed — tweet may be protected or deleted',
      );
      return null;
    }

    const data = (await response.json()) as {
      html?: string;
      author_name?: string;
      author_url?: string;
      url?: string;
    };

    if (!data.html) {
      logger.warn({ url: trimmed }, 'oEmbed response missing html field');
      return null;
    }

    const text = extractTextFromHtml(data.html);
    if (!text) {
      logger.warn({ url: trimmed }, 'Could not extract text from oEmbed html');
      return null;
    }

    return {
      text,
      authorName: data.author_name ?? 'unknown',
      authorUrl: data.author_url ?? '',
      tweetUrl: data.url ?? trimmed,
    };
  } catch (error) {
    logger.error({ err: error, url: trimmed }, 'Failed to fetch tweet via oEmbed');
    return null;
  }
}
