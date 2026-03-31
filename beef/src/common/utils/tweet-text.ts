/**
 * Tweet text utilities — URL expansion, note_tweet handling, weighted character counting.
 *
 * Twitter API returns t.co shortened URLs in tweet text. This module
 * replaces them with original expanded URLs so the LLM sees real content.
 *
 * Twitter uses weighted character counting:
 * - Most Latin/common chars: weight 1
 * - CJK, Korean, Thai, Arabic, etc.: weight 2
 * - URLs: weight 23 (t.co shortened)
 * - Emojis (surrogate pairs): weight 2
 * See: https://developer.x.com/en/docs/counting-characters
 */

interface UrlEntity {
  url: string; // t.co shortened
  expanded_url: string; // original URL
}

/**
 * Replace t.co shortened URLs in tweet text with their expanded versions.
 * If an expanded URL is itself a twitter media URL (pic.twitter.com, pbs.twimg.com),
 * it's removed from text entirely (we handle media separately via mediaUrls).
 *
 * Uses function replacement to avoid special `$` patterns in URLs
 * (common in crypto: $BEEF, $ETH).
 */
export function expandTcoUrls(
  text: string,
  urls?: Array<Partial<UrlEntity>> | null,
): string {
  if (!urls || urls.length === 0) return text;

  let result = text;
  for (const entity of urls) {
    if (!entity.url || !entity.expanded_url) continue;

    const isMediaUrl =
      entity.expanded_url.includes('pic.twitter.com') ||
      entity.expanded_url.includes('pbs.twimg.com');

    const replacement = isMediaUrl ? '' : entity.expanded_url;
    // Function form avoids $-pattern interpretation in replacement string
    result = result.replace(entity.url, () => replacement);
  }

  // Clean up double/trailing spaces left after URL removal
  return result.replace(/  +/g, ' ').trim();
}

/** URL pattern for Twitter-weighted counting (each URL = 23 chars regardless of length). */
const URL_RE = /https?:\/\/\S+/g;
const TCO_RE = /https?:\/\/t\.co\/\w+/g;

/**
 * Unicode ranges that Twitter counts as weight 2 (each code point = 2 chars).
 * Simplified from twitter-text ranges — covers CJK, Korean, Japanese, Thai, Arabic, Devanagari.
 */
function isWeight2CodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x11ff) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x9fff) || // CJK unified ideographs + radicals + symbols
    (cp >= 0xac00 && cp <= 0xd7af) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compatibility forms
    (cp >= 0x1f000 && cp <= 0x1faff) || // Emoticons, symbols, dingbats
    (cp >= 0x20000 && cp <= 0x2fa1f) // CJK extension B-F + supplement
  );
}

/**
 * Count tweet length using Twitter's weighted character rules.
 * - URLs → 23 chars each (regardless of actual length)
 * - CJK/emoji code points → 2 each
 * - Everything else → 1 each
 *
 * Returns the weighted count (Twitter limit is 280).
 */
export function twitterWeightedLength(text: string): number {
  // Replace URLs with 23-char placeholders
  const withoutUrls = text.replace(URL_RE, '');
  const urlMatches = text.match(URL_RE);
  const urlWeight = (urlMatches?.length ?? 0) * 23;

  let charWeight = 0;
  for (const char of withoutUrls) {
    const cp = char.codePointAt(0) ?? 0;
    charWeight += isWeight2CodePoint(cp) ? 2 : 1;
  }

  return charWeight + urlWeight;
}

/**
 * Replace t.co URLs in text using an array of expanded URLs (positional matching).
 * Used by scraper client where we only have expanded URLs without t.co→expanded mapping.
 *
 * Caveat: scraper's `urls[]` only contains external links (not media). If media t.co
 * URLs appear before external links in the text, positional matching may misalign.
 * In practice, media URLs appear at the end of tweet text, so this is safe.
 */
export function expandTcoUrlsByPosition(
  text: string,
  expandedUrls?: string[] | null,
): string {
  if (!expandedUrls || expandedUrls.length === 0) return text;

  const tcoMatches = text.match(TCO_RE);
  if (!tcoMatches || tcoMatches.length === 0) return text;

  let result = text;
  for (let i = 0; i < tcoMatches.length && i < expandedUrls.length; i++) {
    const expanded = expandedUrls[i]!;
    const isMediaUrl =
      expanded.includes('pic.twitter.com') ||
      expanded.includes('pbs.twimg.com');

    const replacement = isMediaUrl ? '' : expanded;
    result = result.replace(tcoMatches[i]!, () => replacement);
  }

  return result.replace(/  +/g, ' ').trim();
}
