
import Report from '../models/Report.js';
import Blog from '../models/Blog.js';
import Megatrend from '../models/Megatrend.js';
import CaseStudy from '../models/CaseStudy.js';

const SITE_URL = 'https://bizwitresearch.com';

function urlEntry(loc, lastmod, changefreq, priority) {
  return `  <url>
    <loc>${SITE_URL}${loc}</loc>
    ${lastmod ? `<lastmod>${new Date(lastmod).toISOString().split('T')[0]}</lastmod>` : ''}
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
  ];

  let urls = staticPages.map(p => urlEntry(p.path, now, p.freq, p.priority));

  // Reports — canonical URL is /:slug (no /report-store/ prefix)
  const seenUrls = new Set(staticPages.map(p => p.path));
  try {
    const reports = await Report.find({ status: 'published' }).select('slug updatedAt').lean();
    reports.forEach(r => {
      if (!r.slug) return;
      const cleanedSlug = r.slug
        .replace(/^https?:\/\/[^/]+\/*/i, '')
        .replace(/^report-store\//i, '')
        .replace(/^reports?\//i, '')
        .trim();
      if (!cleanedSlug) return;
      const urlPath = `/${cleanedSlug}`;
      if (seenUrls.has(urlPath)) return;
      seenUrls.add(urlPath);
      urls.push(urlEntry(urlPath, r.updatedAt, 'weekly', '0.8'));
    });
  } catch (e) { console.error('Sitemap: Error fetching reports', e.message); }


  // Blogs
  try {
    const blogs = await Blog.find({ status: 'published' }).select('slug updatedAt').lean();
    blogs.forEach(b => {
      if (b.slug) urls.push(urlEntry(`/blogs/${b.slug}`, b.updatedAt, 'monthly', '0.7'));
    });
  } catch (e) { console.error('Sitemap: Error fetching blogs', e.message); }

  // Megatrends
  try {
    const megatrends = await Megatrend.find({ status: 'published' }).select('slug updatedAt').lean();
    megatrends.forEach(m => {
      if (m.slug) urls.push(urlEntry(`/${m.slug}`, m.updatedAt, 'monthly', '0.7'));
    });
  } catch (e) { console.error('Sitemap: Error fetching megatrends', e.message); }

  // Case Studies
  try {
    const caseStudies = await CaseStudy.find({ status: 'published' }).select('slug updatedAt').lean();
    caseStudies.forEach(c => {
      if (c.slug) urls.push(urlEntry(`/case-studies/${c.slug}`, c.updatedAt, 'monthly', '0.6'));
    });
  } catch (e) { console.error('Sitemap: Error fetching case studies', e.message); }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
}
