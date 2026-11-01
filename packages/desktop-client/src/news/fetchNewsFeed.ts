import * as Platform from '@actual-app/core/shared/platform';

import { newsFeedFixture } from './fixtures';
import { NEWS_FEED_SCHEMA_VERSION } from './types';
import type { NewsEntry, NewsFeed } from './types';

// Each build carries its own CFM announcements and does not read upstream news.
/**
 * Message of the error thrown when the feed loaded but isn't in a format this
 * version understands, so callers can tell it apart from a failed download.
 */
export const UNSUPPORTED_NEWS_FEED_FORMAT = 'Unsupported news feed format';

/** Load the release's bundled CFM announcements unless explicitly overridden. */
export async function getNewsFeedUrl(): Promise<string> {
  const override = import.meta.env.REACT_APP_NEWS_FEED_URL;
  if (override) {
    return override;
  }

  const { default: bundledUrl } = await import('../data/news.json?url');
  return bundledUrl;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isNewsEntry(value: unknown): value is NewsEntry {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.type === 'release' || value.type === 'post') &&
    typeof value.title === 'string' &&
    typeof value.date === 'string' &&
    typeof value.url === 'string' &&
    typeof value.body === 'string' &&
    isOptionalString(value.version) &&
    isOptionalString(value.details)
  );
}

/** Runtime shape check on the untrusted JSON we fetched. */
function isNewsFeed(value: unknown): value is NewsFeed {
  return (
    isRecord(value) &&
    value.schemaVersion === NEWS_FEED_SCHEMA_VERSION &&
    Array.isArray(value.entries) &&
    value.entries.every(isNewsEntry)
  );
}

export async function fetchNewsFeed(): Promise<NewsFeed> {
  if (Platform.isPlaywright) {
    return newsFeedFixture;
  }

  const response = await fetch(await getNewsFeedUrl());
  if (!response.ok) {
    throw new Error(`Failed to load news feed (HTTP ${response.status})`);
  }

  const json: unknown = await response.json();
  if (!isNewsFeed(json)) {
    throw new Error(UNSUPPORTED_NEWS_FEED_FORMAT);
  }
  return json;
}
