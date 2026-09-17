import Report from '../models/Report.js';
import Blog from '../models/Blog.js';
import Megatrend from '../models/Megatrend.js';
import CaseStudy from '../models/CaseStudy.js';
import Category from '../models/Category.js';
import { slugifyReportUrl } from './slugify.js';

// Canonical domain - strictly https://www.bizwitresearch.com
const SITE_URL = (process.env.SITE_URL || 'https://www.bizwitresearch.com').replace(/\/+$/, '');

/**
 * Escapes special XML characters to ensure valid XML output.
 * @param {string} unsafe
 * @returns {string}
 */
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Safely formats last modified date to YYYY-MM-DD.
 * @param {Date|string} date
 * @returns {string}
 */
function formatLastMod(date) {
  if (!date) return '';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return `<lastmod>${d.toISOString().split('T')[0]}</lastmod>`;
  } catch {
    return '';
  }
}

/**
 * Generates an XML <url> element.
 * @param {string} loc - Relative URL path starting with /
 * @param {Date|string} lastmod
 * @param {string} changefreq
 * @param {string} priority
 * @returns {string}
 */
function urlEntry(loc, lastmod, changefreq, priority) {
  const lastmodTag = formatLastMod(lastmod);
  const fullUrl = escapeXml(`${SITE_URL}${loc}`);
  return `  <url>
    <loc>${fullUrl}</loc>${lastmodTag ? `\n    ${lastmodTag}` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export async function generateSitemap() {
  const now = new Date().toISOString().split('T')[0];

  // Static pages
  const staticPages = [
    { path: '/', freq: 'weekly', priority: '1.0' },
    { path: '/report-store', freq: 'daily', priority: '0.9' },
    { path: '/about-us', freq: 'monthly', priority: '0.6' },
    { path: '/contact-us', freq: 'monthly', priority: '0.6' },
    { path: '/esg-consulting', freq: 'monthly', priority: '0.7' },
    { path: '/competitive-intelligence', freq: 'monthly', priority: '0.7' },
    { path: '/market-intelligence', freq: 'monthly', priority: '0.7' },
    { path: '/india-gtm-strategy', freq: 'monthly', priority: '0.7' },
    { path: '/voice-of-customer', freq: 'monthly', priority: '0.7' },
    { path: '/full-time-equivalent', freq: 'monthly', priority: '0.6' },
    { path: '/market-share-gain', freq: 'monthly', priority: '0.6' },
    { path: '/thought-leadership', freq: 'monthly', priority: '0.6' },
    { path: '/bizchronicles', freq: 'weekly', priority: '0.7' },
    { path: '/career', freq: 'monthly', priority: '0.4' },
    { path: '/faq', freq: 'monthly', priority: '0.4' },
    { path: '/how-to-order', freq: 'monthly', priority: '0.5' },
    { path: '/privacy-policy', freq: 'monthly', priority: '0.3' },
    { path: '/terms-and-conditions', freq: 'monthly', priority: '0.3' },
    { path: '/refund-policy', freq: 'monthly', priority: '0.3' },
    { path: '/cookie-policy', freq: 'monthly', priority: '0.3' },
    { path: '/disclaimer', freq: 'monthly', priority: '0.3' },
    { path: '/gdpr-policy', freq: 'monthly', priority: '0.3' },
    { path: '/become-our-reseller', freq: 'monthly', priority: '0.4' },
    { path: '/sitemap', freq: 'monthly', priority: '0.4' },
  ];

  const seenUrls = new Set();
  const urls = [];

  // 1. Add Static Pages
  staticPages.forEach(p => {
    if (!seenUrls.has(p.path)) {
      seenUrls.add(p.path);
      urls.push(urlEntry(p.path, now, p.freq, p.priority));
    }
  });

  // 2. Add Reports — canonical URL is /:slug (no /report-store/ prefix)
  // Dynamically uses the exact same slugification logic as frontend report pages
  try {
    const reports = await Report.find({ status: 'published' })
      .select('title slug updatedAt')
      .lean();

    reports.forEach(r => {
      const slug = slugifyReportUrl(r.slug, r.title);
      if (!slug) return;

      const urlPath = `/${slug}`;
      if (seenUrls.has(urlPath)) return;
      seenUrls.add(urlPath);
      urls.push(urlEntry(urlPath, r.updatedAt || now, 'weekly', '0.8'));
    });
  } catch (e) {
    console.error('Sitemap: Error fetching reports:', e.message);
  }

  // 3. Add Categories
  try {
    const categories = await Category.find({ isActive: { $ne: false } })
      .select('name slug updatedAt')
      .lean();

    categories.forEach(c => {
      const slug = slugifyReportUrl(c.slug, c.name);
      if (!slug) return;

      const urlPath = `/${slug}`;
      if (seenUrls.has(urlPath)) return;
      seenUrls.add(urlPath);
      urls.push(urlEntry(urlPath, c.updatedAt || now, 'weekly', '0.7'));
    });
  } catch (e) {
    console.error('Sitemap: Error fetching categories:', e.message);
  }

  // 4. Add Blogs (/blogs/:slug)
  try {
    const blogs = await Blog.find({ status: 'published' })
      .select('title slug updatedAt')
      .lean();

    blogs.forEach(b => {
      const slug = slugifyReportUrl(b.slug, b.title);
      if (!slug) return;

      const urlPath = `/blogs/${slug}`;
      if (seenUrls.has(urlPath)) return;
      seenUrls.add(urlPath);
      urls.push(urlEntry(urlPath, b.updatedAt || now, 'monthly', '0.7'));
    });
  } catch (e) {
    console.error('Sitemap: Error fetching blogs:', e.message);
  }

  // 5. Add Megatrends (/:slug)
  try {
    const megatrends = await Megatrend.find({ status: 'published' })
      .select('title slug updatedAt')
      .lean();

    megatrends.forEach(m => {
      const slug = slugifyReportUrl(m.slug, m.title);
      if (!slug) return;

      const urlPath = `/${slug}`;
      if (seenUrls.has(urlPath)) return;
      seenUrls.add(urlPath);
      urls.push(urlEntry(urlPath, m.updatedAt || now, 'monthly', '0.7'));
    });
  } catch (e) {
    console.error('Sitemap: Error fetching megatrends:', e.message);
  }

  // 6. Add Case Studies (/case-studies/:slug)
  try {
    const caseStudies = await CaseStudy.find({ status: 'published' })
      .select('title slug updatedAt')
      .lean();

    caseStudies.forEach(c => {
      const slug = slugifyReportUrl(c.slug, c.title);
      if (!slug) return;

      const urlPath = `/case-studies/${slug}`;
      if (seenUrls.has(urlPath)) return;
      seenUrls.add(urlPath);
      urls.push(urlEntry(urlPath, c.updatedAt || now, 'monthly', '0.6'));
    });
  } catch (e) {
    console.error('Sitemap: Error fetching case studies:', e.message);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
}

export default generateSitemap;
