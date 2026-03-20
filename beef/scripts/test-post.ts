/**
 * Test posting via regular fetch (not CycleTLS) to diagnose 226 error.
 */
import 'dotenv/config';
import { Scraper } from '@the-convocation/twitter-scraper';
import { CookieStore } from '../src/twitter/cookie-store.js';
import pino from 'pino';

const logger = pino({ level: 'debug', transport: { target: 'pino-pretty' } });
const store = new CookieStore(logger);
const scraper = new Scraper();

async function run() {
  const saved = store.load();
  if (!saved) throw new Error('No cookies');
  await scraper.setCookies(saved);
  console.log('Logged in:', await scraper.isLoggedIn());

  const cookies = await scraper.getCookies();
  const ct0 = (cookies.find((c: { key: string }) => c.key === 'ct0') as { value: string } | undefined)?.value ?? '';
  const cookieStr = cookies.map((c: { key: string; value: string }) => `${c.key}=${c.value}`).join('; ');

  const bearer = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
  const queryId = '7TKRKCPuAGsmYde0CudbVg';

  const text = 'test tweet pls ignore';

  const variables = {
    tweet_text: text,
    dark_request: false,
    media: { media_entities: [], possibly_sensitive: false },
    semantic_annotation_ids: [],
  };

  const features = {
    rweb_video_screen_enabled: false,
    profile_label_improvements_pcf_label_in_post_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    communities_web_enable_tweet_community_results_fetch: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_enhance_cards_enabled: false,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_grok_analyze_button_fetch_trends_enabled: false,
    responsive_web_grok_analyze_post_followups_enabled: true,
    responsive_web_grok_share_attachment_enabled: true,
    responsive_web_grok_annotations_enabled: true,
    responsive_web_grok_image_annotation_enabled: true,
    responsive_web_grok_imagine_annotation_enabled: true,
    responsive_web_jetfuel_frame: true,
    responsive_web_grok_show_grok_translated_post: true,
    responsive_web_grok_analysis_button_from_backend: true,
    post_ctas_fetch_enabled: true,
    articles_preview_enabled: true,
    premium_content_api_read_enabled: false,
    rweb_tipjar_consumption_enabled: false,
    verified_phone_label_enabled: false,
    responsive_web_profile_redirect_enabled: false,
    tweet_awards_web_tipping_enabled: false,
    responsive_web_grok_community_note_auto_translation_is_enabled: false,
  };

  // Try with macOS Chrome UA (matching the cookies' origin)
  const macUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

  console.log('\n=== Test: regular fetch + macOS UA ===');
  const resp = await fetch(`https://x.com/i/api/graphql/${queryId}/CreateTweet`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearer}`,
      cookie: cookieStr,
      'x-csrf-token': ct0,
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
      'content-type': 'application/json',
      'user-agent': macUA,
      referer: 'https://x.com/compose/tweet',
    },
    body: JSON.stringify({ variables, features, queryId }),
  });

  console.log('Status:', resp.status);
  const body = await resp.text();
  console.log('Body:', body.slice(0, 500));
}

run().catch(console.error);
