/**
 * Tweet text utilities — URL expansion and note_tweet handling.
 *
 * Twitter API returns t.co shortened URLs in tweet text. This module
 * replaces them with original expanded URLs so the LLM sees real content.
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

const TCO_RE = /https?:\/\/t\.co\/\w+/g;

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
