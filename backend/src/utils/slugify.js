/**
 * Centralized Slugify Utility for Bizwit Backend
 * Ensures 100% consistent URL slugs between Frontend routing and Backend sitemap/SEO generation.
 */

/**
 * Standard slugify function matching frontend src/utils/slugify.js
 * Transforms arbitrary text into a clean, URL-safe slug.
 *
 * @param {string} text
 * @returns {string}
 */
export const slugify = (text) => {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')     // Replace spaces and underscores with -
    .replace(/[^\w\-]+/g, '')    // Remove all non-word characters except hyphens
    .replace(/\-\-+/g, '-')      // Replace multiple consecutive hyphens with single -
    .replace(/^-+|-+$/g, '');    // Remove leading and trailing hyphens
};

/**
 * Strips protocol, domain, prefixes, query strings, and hashes from a raw slug or URL.
 *
 * @param {string} raw
 * @returns {string}
 */
export const cleanRawSlug = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();

  // Try decoding URI component in case of encoded characters (e.g. %20)
  try {
    str = decodeURIComponent(str);
  } catch {
    // Ignore decode errors and continue with raw string
  }

  // Strip protocol and domain if present (e.g., https://bizwitresearch.com/ or https://www.bizwitresearch.com/)
  str = str.replace(/^https?:\/\/[^/]+/i, '');

  // Strip query string and hash
  str = str.split('?')[0].split('#')[0];

  // Strip common legacy/path prefixes if stored in database field
  str = str.replace(/^\/?(report-store|reports?|blogs?|megatrends?|case-stud(?:ies|y))\//i, '');

  // Strip leading and trailing slashes
  str = str.replace(/^\/+|\/+$/g, '');

  return str.trim();
};

/**
 * Generates an exact, valid report URL slug from either a raw slug or fallback title.
 * Used for dynamic report pages, sitemaps, and canonical URLs.
 *
 * @param {string} rawSlug - Slug from database document or input
 * @param {string} [fallbackTitle] - Document title used as fallback if slug is missing/empty
 * @returns {string} Clean, URL-safe slug
 */
export const slugifyReportUrl = (rawSlug, fallbackTitle = '') => {
  const cleanedSlug = cleanRawSlug(rawSlug);
  if (cleanedSlug) {
    const formatted = slugify(cleanedSlug);
    if (formatted) return formatted;
  }

  if (fallbackTitle) {
    const cleanedTitle = cleanRawSlug(fallbackTitle);
    return slugify(cleanedTitle);
  }

  return '';
};

export default {
  slugify,
  cleanRawSlug,
  slugifyReportUrl
};
