import sanitizeHtml from 'sanitize-html';

const API_ORIGIN = (process.env.PUBLIC_API_URL || process.env.API_BASE_URL || 'https://api.bizwitresearch.com').replace(/\/$/, '');

function esc(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function strip(html) {
  if (!html) return '';
  let text = String(html);
  // remove script/style blocks entirely (content and tags)
  text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // convert block-level closing tags to line breaks so structure survives
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // strip remaining tags
  text = text.replace(/<[^>]*>/g, '');
  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  // collapse excess blank lines/spaces but keep paragraph breaks
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

export function renderRichContent(html) {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
      'strong', 'em', 'b', 'i', 'a', 'br', 'img', 'div', 'span', 'blockquote', 'section'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'loading', 'width', 'height'],
      table: ['class'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow' }, false)
    }
  });
}

function truncate(text, max = 300) {
  if (!text || text.length <= max) return text || '';
  return text.substring(0, max).replace(/\s+\S*$/, '') + '...';
}

function imgUrl(img) {
  if (!img || typeof img !== 'string') return '';
  if (/^https?:\/\//i.test(img)) return img;
  return `${API_ORIGIN}${img.startsWith('/') ? img : '/' + img}`;
}

export function renderHomePage({ pageTitle, seoData, reports = [], blogs = [], megatrends = [] }) {
  const title = seoData?.title || pageTitle || 'Bizwit Research - Market Research & Business Intelligence';
  const desc = seoData?.metaDescription || 'Leading provider of market research reports, industry analysis, and business intelligence solutions.';

  let html = `<header><h1>${esc(title)}</h1><p>${esc(desc)}</p></header><main>`;
  html += `<section><h2>Market Research &amp; Business Intelligence Solutions</h2>`;
  html += `<p>Bizwit Research &amp; Consulting LLP delivers comprehensive market research reports, industry analysis, ESG consulting, and business intelligence solutions to global clients across diverse sectors.</p></section>`;

  if (reports.length > 0) {
    html += `<section><h2>Trending Reports</h2><ul>`;
    reports.slice(0, 10).forEach(r => {
      html += `<li><a href="/report-store/${esc(r.slug)}">${esc(r.title)}</a></li>`;
    });
    html += `</ul></section>`;
  }

  if (megatrends.length > 0) {
    html += `<section><h2>Megatrends</h2><ul>`;
    megatrends.slice(0, 6).forEach(m => {
      html += `<li><a href="/${esc(m.slug)}">${esc(m.title)}</a>${m.summary ? ` — ${esc(truncate(strip(m.summary), 120))}` : ''}</li>`;
    });
    html += `</ul></section>`;
  }

  if (blogs.length > 0) {
    html += `<section><h2>Latest Insights</h2><ul>`;
    blogs.slice(0, 6).forEach(b => {
      html += `<li><a href="/blogs/${esc(b.slug)}">${esc(b.title)}</a>${b.authorName ? ` by ${esc(b.authorName)}` : ''}</li>`;
    });
    html += `</ul></section>`;
  }

  html += `<section><h2>Our Services</h2><ul>`;
  html += `<li><a href="/market-intelligence">Market Intelligence</a></li>`;
  html += `<li><a href="/competitive-intelligence">Competitive Intelligence &amp; Strategic Advisory</a></li>`;
  html += `<li><a href="/esg-consulting">ESG Consulting</a></li>`;
  html += `<li><a href="/india-gtm-strategy">India GTM Strategy</a></li>`;
  html += `<li><a href="/voice-of-customer">Voice of Customer</a></li>`;
  html += `<li><a href="/report-store">Report Store</a></li>`;
  html += `</ul></section></main>`;
  return html;
}

export function renderReportListing(reports = []) {
  let html = `<header><h1>Market Research Reports Store</h1>`;
  html += `<p>Browse our comprehensive collection of market research reports covering industries and sectors worldwide.</p></header><main>`;

  if (reports.length > 0) {
    html += `<section><h2>Available Reports</h2><ul>`;
    reports.slice(0, 50).forEach(r => {
      html += `<li><a href="/report-store/${esc(r.slug)}">${esc(r.title)}</a>`;
      if (r.category) html += ` — <span>${esc(r.category)}</span>`;
      if (r.summary) html += `<p>${esc(truncate(strip(r.summary), 150))}</p>`;
      html += `</li>`;
    });
    html += `</ul></section>`;
  }
  html += `</main>`;
  return html;
}

export function renderReportDetail(report) {
  if (!report) return '';
  const title = report.titleTag || report.metaTitle || report.title || '';
  const desc = report.metaDescription || report.summary || report.reportDescription || '';
  const cover = report.coverImage?.url ? imgUrl(report.coverImage.url) : '';

  let html = `<article><header><h1>${esc(title)}</h1>`;
  if (report.subTitle) html += `<h2>${esc(report.subTitle)}</h2>`;
  html += `</header>`;
  if (cover) html += `<img src="${esc(cover)}" alt="${esc(report.coverImage?.alt || title)}" loading="lazy" />`;

  html += `<section><h2>Report Summary</h2><p>${esc(truncate(strip(desc), 500))}</p></section>`;

  if (report.category) html += `<p><strong>Category:</strong> ${esc(report.category)}</p>`;
  if (report.reportCode) html += `<p><strong>Report Code:</strong> ${esc(report.reportCode)}</p>`;
  if (report.numberOfPages) html += `<p><strong>Pages:</strong> ${report.numberOfPages}</p>`;
  if (report.publishDate) html += `<p><strong>Published:</strong> <time datetime="${new Date(report.publishDate).toISOString()}">${new Date(report.publishDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time></p>`;

  // Price info
  if (report.singleUserPrice || report.enterprisePrice) {
    html += `<section><h2>Pricing</h2><ul>`;
    if (report.singleUserPrice) html += `<li>Single User License: $${esc(report.singleUserPrice)}</li>`;
    if (report.enterprisePrice) html += `<li>Enterprise License: $${esc(report.enterprisePrice)}</li>`;
    if (report.excelDatapackPrice) html += `<li>Excel Data Pack: $${esc(report.excelDatapackPrice)}</li>`;
    html += `</ul></section>`;
  }

  if (report.content) {
    html += `<section><h2>Report Details</h2><div>${renderRichContent(report.content)}</div></section>`;
  }

  html += `<nav><a href="/report-store/${esc(report.slug)}/download-sample">Request Sample</a> | `;
  html += `<a href="/report-store/${esc(report.slug)}/buy-now">Buy Now</a></nav>`;
  html += `</article>`;
  return html;
}

export function renderBlogListing(blogs = []) {
  let html = `<header><h1>Bizwit Research Blog — Industry Insights &amp; Analysis</h1>`;
  html += `<p>Stay updated with the latest market trends, industry analysis, and expert insights from Bizwit Research.</p></header><main>`;

  if (blogs.length > 0) {
    html += `<section><ul>`;
    blogs.slice(0, 30).forEach(b => {
      html += `<li><article><h2><a href="/blogs/${esc(b.slug)}">${esc(b.title)}</a></h2>`;
      if (b.authorName) html += `<p>By ${esc(b.authorName)}</p>`;
      if (b.metaDescription || b.content) html += `<p>${esc(truncate(strip(b.metaDescription || b.content), 150))}</p>`;
      html += `</article></li>`;
    });
    html += `</ul></section>`;
  }
  html += `</main>`;
  return html;
}

export function renderBlogDetail(blog) {
  if (!blog) return '';
  const title = blog.titleTag || blog.title || '';
  let html = `<article><header><h1>${esc(title)}</h1>`;
  if (blog.subTitle) html += `<h2>${esc(blog.subTitle)}</h2>`;
  if (blog.authorName) html += `<p>By <span>${esc(blog.authorName)}</span></p>`;
  if (blog.publishDate) html += `<time datetime="${new Date(blog.publishDate).toISOString()}">${new Date(blog.publishDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time>`;
  html += `</header>`;
  if (blog.mainImage) html += `<img src="${esc(imgUrl(blog.mainImage))}" alt="${esc(title)}" loading="lazy" />`;
  if (blog.content) {
    html += `<section>${renderRichContent(blog.content)}</section>`;
  }
  if (blog.tags?.length) {
    html += `<footer><p>Tags: ${blog.tags.map(t => esc(t)).join(', ')}</p></footer>`;
  }
  html += `</article>`;
  return html;
}

export function renderMegatrendListing(megatrends = []) {
  let html = `<header><h1>Megatrends — Future Industry Trends &amp; Analysis</h1>`;
  html += `<p>Explore the global megatrends shaping industries and markets of tomorrow.</p></header><main>`;
  if (megatrends.length > 0) {
    html += `<ul>`;
    megatrends.slice(0, 30).forEach(m => {
      html += `<li><a href="/${esc(m.slug)}">${esc(m.title)}</a>`;
      if (m.summary) html += ` — ${esc(truncate(strip(m.summary), 120))}`;
      html += `</li>`;
    });
    html += `</ul>`;
  }
  html += `</main>`;
  return html;
}

export function renderMegatrendDetail(megatrend) {
  if (!megatrend) return '';
  const title = megatrend.metaTitle || megatrend.titleTag || megatrend.title || '';
  let html = `<article><header><h1>${esc(title)}</h1>`;
  if (megatrend.subTitle) html += `<h2>${esc(megatrend.subTitle)}</h2>`;
  html += `</header>`;
  if (megatrend.heroImage?.url) html += `<img src="${esc(imgUrl(megatrend.heroImage.url))}" alt="${esc(megatrend.heroImage.alt || title)}" loading="lazy" />`;
  if (megatrend.summary) html += `<section><p>${esc(strip(megatrend.summary))}</p></section>`;
  if (megatrend.content) html += `<section>${renderRichContent(megatrend.content)}</section>`;
  html += `</article>`;
  return html;
}

export function renderCaseStudyListing(caseStudies = []) {
  let html = `<header><h1>Case Studies — Real Business Impact</h1>`;
  html += `<p>Discover how Bizwit Research has helped businesses achieve measurable results.</p></header><main>`;
  if (caseStudies.length > 0) {
    html += `<ul>`;
    caseStudies.slice(0, 30).forEach(c => {
      html += `<li><a href="/case-studies/${esc(c.slug)}">${esc(c.title)}</a>`;
      if (c.category) html += ` — ${esc(c.category)}`;
      html += `</li>`;
    });
    html += `</ul>`;
  }
  html += `</main>`;
  return html;
}

export function renderCaseStudyDetail(cs) {
  if (!cs) return '';
  const title = cs.titleTag || cs.title || '';
  let html = `<article><header><h1>${esc(title)}</h1>`;
  if (cs.subTitle) html += `<h2>${esc(cs.subTitle)}</h2>`;
  html += `</header>`;
  if (cs.mainImage) html += `<img src="${esc(imgUrl(cs.mainImage))}" alt="${esc(title)}" loading="lazy" />`;
  if (cs.content) html += `<section>${renderRichContent(cs.content)}</section>`;
  html += `</article>`;
  return html;
}

export function renderStaticPage({ title, description }) {
  let html = `<header><h1>${esc(title || 'Bizwit Research')}</h1></header><main>`;
  if (description) html += `<p>${esc(strip(description))}</p>`;
  html += `</main>`;
  return html;
}
