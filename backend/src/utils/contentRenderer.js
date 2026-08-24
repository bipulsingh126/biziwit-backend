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

export function renderMarketShareGainPage(servicePage) {
  let html = `<article class="service-detail"><header>`;
  html += `<h1>Win Market Share With Data-Driven Strategy</h1>`;
  html += `<p>Market share growth is not accidental; it is engineered. Through rigorous market intelligence, competitive benchmarking, demand analytics, and actionable growth strategy, we help organisations identify whitespace opportunities, strengthen value propositions, and convert competitive advantage into measurable, sustained share gains across priority segments and geographies.</p>`;
  html += `</header><main>`;
  html += `<section><h2>Why Market Share Gain Matters</h2>`;
  html += `<p>In highly competitive and rapidly evolving markets, growing and protecting market share requires deep market visibility. Our data-driven methodology provides clarity on market shifts, competitor vulnerabilities, and customer purchasing dynamics.</p></section>`;
  html += `<section><h2>Strategic Pillars</h2><ul>`;
  html += `<li><h3>Whitespace Identification</h3><p>Identify underserved buyer segments, emerging geographic pockets, and untapped product categories.</p></li>`;
  html += `<li><h3>Value Proposition Strengthening</h3><p>Sharpen your positioning and differentiate against key competitors through rigorous benchmarking.</p></li>`;
  html += `<li><h3>Competitive Benchmarking</h3><p>Analyze competitor pricing, go-to-market channels, feature sets, and customer sentiment.</p></li>`;
  html += `<li><h3>Sustainable Growth Planning</h3><p>Develop executable roadmaps with clear KPIs to drive long-term market share capture.</p></li>`;
  html += `</ul></section>`;
  html += `<section><h2>Our Strategic Framework</h2>`;
  html += `<p>We combine primary research, demand analytics, customer sentiment, and competitor battlecards to deliver actionable intelligence tailored to your industry.</p></section>`;
  html += `<section><h2>Why Choose Bizwit Research</h2><ul>`;
  html += `<li>90%+ Primary Research-Driven Insights</li>`;
  html += `<li>Customized frameworks tailored to your business model</li>`;
  html += `<li>Cross-industry expertise across technology, healthcare, manufacturing, and consumer sectors</li>`;
  html += `<li>End-to-end support from opportunity scanning to execution strategy</li>`;
  html += `</ul></section>`;
  if (servicePage?.content) {
    html += `<section><h2>Additional Insights</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderFtePage(servicePage) {
  let html = `<article class="service-detail"><header>`;
  html += `<h1>Dedicated Resources, Aligned with your Business</h1>`;
  html += `<p>Access experienced analysts and consultants who seamlessly integrate with your organisation, providing dedicated research capacity, market intelligence, strategic insights, and continuous support. Our extended team model helps accelerate decision-making, improve execution efficiency, reduce internal resource constraints, and deliver high-quality intelligence aligned with your business objectives and growth priorities.</p>`;
  html += `</header><main>`;
  html += `<section><h2>The FTE Extended Team Advantage</h2>`;
  html += `<p>Scaling internal research teams can be costly and time-consuming. Our Full-Time Equivalent (FTE) model provides dedicated, domain-expert research professionals as an extension of your in-house team.</p></section>`;
  html += `<section><h2>Our FTE Capabilities &amp; Services</h2><ul>`;
  html += `<li><h3>Dedicated Market Research Analysts</h3><p>Continuous market monitoring, opportunity sizing, trend evaluation, and competitive tracking.</p></li>`;
  html += `<li><h3>Financial &amp; Industry Modeling</h3><p>Custom data models, forecasting frameworks, and industry benchmark reports.</p></li>`;
  html += `<li><h3>Strategic Advisory &amp; Consulting Support</h3><p>Direct assistance on ad-hoc client requests, executive decks, and strategic presentations.</p></li>`;
  html += `<li><h3>Data Synthesis &amp; Visualization</h3><p>Transforming complex datasets into clear, actionable dashboards and reports.</p></li>`;
  html += `</ul></section>`;
  html += `<section><h2>How It Works</h2><ol>`;
  html += `<li><strong>Requirements &amp; Domain Alignment:</strong> We understand your specific research scope, domain needs, and skill requirements.</li>`;
  html += `<li><strong>Team Deployment:</strong> Experienced analysts are assigned exclusively to your organisation.</li>`;
  html += `<li><strong>Seamless Integration:</strong> Integrated workflow with your internal communication tools, methodology, and reporting formats.</li>`;
  html += `<li><strong>Continuous Optimization:</strong> Regular performance reviews and scaling flexibility as your project needs evolve.</li>`;
  html += `</ol></section>`;
  html += `<section><h2>Impact &amp; Success Metrics</h2><ul>`;
  html += `<li>60% Faster project turnaround times</li>`;
  html += `<li>Over 60+ FTEs deployed across 7 global regions</li>`;
  html += `<li>95%+ Client retention rate on dedicated engagements</li>`;
  html += `<li>2x Output improvement in long-term support</li>`;
  html += `</ul></section>`;
  if (servicePage?.content) {
    html += `<section><h2>Additional Details</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderThoughtLeadershipPage(servicePage) {
  let html = `<article class="service-detail"><header>`;
  html += `<h1>Turn Thought Leadership into Demand</h1>`;
  html += `<p>Strategic insights, data-driven perspectives, and compelling industry narratives designed to strengthen market credibility, engage key decision-makers, enhance brand authority, and convert expertise into meaningful business conversations, qualified opportunities, and long-term customer relationships.</p>`;
  html += `</header><main>`;
  html += `<section><h2>From Insight to Market Conversations</h2>`;
  html += `<p>Content-led demand generation focuses on attracting, nurturing, and converting prospects through high-value content such as whitepapers, infographics, research reports, webinars, and expert insights that are strategically aligned with buyer personas and different stages of the buyer journey.</p>`;
  html += `<p>70–80% of B2B buyers prefer engaging with insightful industry content before speaking with a vendor. Organisations that consistently share expert perspectives often influence buying decisions long before formal sales conversations begin.</p></section>`;
  html += `<section><h2>What We Offer</h2><ul>`;
  html += `<li><h3>Asset Creation &amp; Optimization</h3><p>Whitepapers, eBooks, blog series, infographics, and gated resources for qualified lead generation.</p></li>`;
  html += `<li><h3>Content Strategy &amp; Planning</h3><p>Buyer persona mapping, journey-stage funnel alignment, thought leadership theme development, and editorial calendar planning.</p></li>`;
  html += `<li><h3>Distribution &amp; Lead Capture</h3><p>Targeted email campaigns, LinkedIn strategies, media partnerships, lead capture, and performance monitoring.</p></li>`;
  html += `</ul></section>`;
  html += `<section><h2>Our 6-Step Demand Gen Engine</h2><ol>`;
  html += `<li><strong>Content Ideation:</strong> Identify high-impact topics addressing real industry challenges.</li>`;
  html += `<li><strong>Persona Mapping:</strong> Align messaging with executive decision-makers and influencers.</li>`;
  html += `<li><strong>Asset Creation:</strong> Produce research-backed whitepapers, eBooks, and visual reports.</li>`;
  html += `<li><strong>Channel Distribution:</strong> Multi-channel dissemination across paid, owned, and earned media.</li>`;
  html += `<li><strong>Lead Qualification:</strong> Capture and score high-intent B2B prospect interactions.</li>`;
  html += `<li><strong>ROI Reporting:</strong> Measure audience engagement, qualified pipeline, and campaign ROI.</li>`;
  html += `</ol></section>`;
  html += `<section><h2>Content Types We Specialize In</h2><ul>`;
  html += `<li>Webinars &amp; Expert Roundtables</li>`;
  html += `<li>Whitepapers &amp; Research Reports</li>`;
  html += `<li>Infographics &amp; Executive Briefings</li>`;
  html += `<li>E-books &amp; Case Studies</li>`;
  html += `<li>Podcasts &amp; Video Content</li>`;
  html += `</ul></section>`;
  if (servicePage?.content) {
    html += `<section><h2>Additional Insights</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderMarketIntelligencePage(servicePage) {
  let html = `<article class="service-detail"><header>`;
  html += `<h1>Actionable Market Intelligence for Strategic Decisions</h1>`;
  html += `<p>Transform complex market data into actionable strategic insights that help organisations understand industry dynamics, identify emerging opportunities, and anticipate future trends. Make informed business decisions with greater clarity, confidence, and long-term strategic direction in increasingly competitive and evolving markets.</p>`;
  html += `</header><main>`;
  html += `<section><h2>Turning Data into Strategic Clarity</h2>`;
  html += `<p>Strategic growth requires more than surface-level data. It requires structured intelligence to guide decisions from early evaluation through long-term expansion. We connect insights on feasibility, entry, and expansion to provide a structured pathway for sustainable, informed market growth.</p></section>`;
  html += `<section><h2>Our Market Intelligence Services</h2><ul>`;
  html += `<li><h3>Feasibility Study</h3><p>Assess new business ideas, products, or investments through demand, competition, regulations, operations, and financial viability analysis.</p></li>`;
  html += `<li><h3>Market Entry Strategy</h3><p>Develop structured market entry frameworks that identify the right segments, positioning strategies, partnership models, and go-to-market approaches.</p></li>`;
  html += `<li><h3>Market Expansion Strategy</h3><p>Support organisations in scaling within existing or adjacent markets by identifying growth opportunities, untapped customer segments, and channel strategies.</p></li>`;
  html += `<li><h3>Market Demand &amp; Forecast</h3><p>Analyse current demand patterns and future market potential using data-driven models, industry insights, and macroeconomic indicators.</p></li>`;
  html += `<li><h3>Regional Landscape Analysis</h3><p>Understand geographic variations in market maturity, customer behaviour, competitive intensity, regulatory environment, and investment opportunities.</p></li>`;
  html += `<li><h3>Market Motivators Analysis</h3><p>Identify the drivers of market growth, including technology adoption, customer needs, industry shifts, and regulatory developments.</p></li>`;
  html += `</ul></section>`;
  html += `<section><h2>Business Outcomes We Drive</h2><ul>`;
  html += `<li>Entering new markets with lower risk and verified demand</li>`;
  html += `<li>Expanding regionally with optimized channel mapping</li>`;
  html += `<li>Product launch feasibility and go/no-go verification</li>`;
  html += `<li>Regulatory compliance and trade impact evaluation</li>`;
  html += `</ul></section>`;
  if (servicePage?.content) {
    html += `<section><h2>Additional Details</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderCompetitiveIntelligencePage(servicePage) {
  let html = `<article class="service-detail"><header>`;
  html += `<h1>Navigate Markets with Competitive Intelligence</h1>`;
  html += `<p>Analyse competitors, uncover strategic market signals, and translate competitive insights into smarter positioning, informed decisions, and sustainable business growth.</p>`;
  html += `</header><main>`;
  html += `<section><h2>What We Offer</h2><ul>`;
  html += `<li><h3>Benchmarking &amp; Positioning</h3><p>Gain a clear view of your competitive standing, uncover performance gaps, and lead with confidence.</p></li>`;
  html += `<li><h3>Pipeline &amp; Deal Analysis</h3><p>Evaluate market opportunities, track competitor deals and partnerships, and optimize your growth funnel.</p></li>`;
  html += `<li><h3>Go-To-Market Insights</h3><p>Enter chosen markets with confidence covering positioning, channels, customer segments, pricing, and competitive tactics.</p></li>`;
  html += `<li><h3>Market Attractiveness Analysis</h3><p>Assess market potential, prioritize opportunities, and invest where growth and alignment are strongest.</p></li>`;
  html += `</ul></section>`;
  html += `<section><h2>Our 5-Step Strategic Intelligence Approach</h2><ol>`;
  html += `<li><strong>Define Strategic Objectives:</strong> Align with your business goals to understand what success looks like in new or existing markets.</li>`;
  html += `<li><strong>Conduct Market Scanning:</strong> Analyze macro trends, regulatory factors, and emerging shifts that impact market dynamics.</li>`;
  html += `<li><strong>Assess Competitive Landscape:</strong> Benchmark key players, assess strategies, and identify white spaces or underserved segments.</li>`;
  html += `<li><strong>Prioritize Market Opportunities:</strong> Score and compare markets by growth potential, competitive intensity, risk, and strategic fit.</li>`;
  html += `<li><strong>Develop Market-Driven Strategy:</strong> Systemize findings into actionable insights and recommend market entry, positioning, and growth strategies.</li>`;
  html += `</ol></section>`;
  html += `<section><h2>Insights &amp; Deliverables We Provide</h2><ul>`;
  html += `<li><strong>Competitive Positioning Matrix:</strong> Map competitors by price, value proposition, and capabilities.</li>`;
  html += `<li><strong>SWOT &amp; Value Pop Maps:</strong> Uncover competitive strengths, weaknesses, and differentiation opportunities.</li>`;
  html += `<li><strong>Feature Comparison Sheets:</strong> Granular product, pricing, and capability comparisons.</li>`;
  html += `<li><strong>Visual Battlecards:</strong> Actionable intelligence summaries for sales and executive teams.</li>`;
  html += `<li><strong>Social &amp; Content Trackers:</strong> Real-time monitoring of competitor messaging and digital momentum.</li>`;
  html += `</ul></section>`;
  html += `<section><h2>Why Clients Partner with Bizwit</h2><ul>`;
  html += `<li>90%+ Primary Research-driven methodologies</li>`;
  html += `<li>Customized intelligence frameworks tailored specifically for your business</li>`;
  html += `<li>Cross-industry expertise across global markets</li>`;
  html += `</ul></section>`;
  if (servicePage?.content) {
    html += `<section><h2>Additional Insights</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderEsgConsultingPage(servicePage) {
  let html = `<article class="service-detail"><header>`;
  html += `<h1>Turn Sustainability Into a Competitive Advantage</h1>`;
  html += `<p>Harness the power of ESG and environmental impact strategies with Bizwit Research to uncover actionable insights and develop sustainable solutions that drive business growth while supporting long-term environmental and societal value.</p>`;
  html += `</header><main>`;
  html += `<section><h2>Why ESG Consulting Matters</h2>`;
  html += `<p>Sustainability is no longer a choice; it is a strategic imperative for long-term business resilience and growth. Sustainable practices help reduce risks, improve operational efficiency, enhance brand credibility, and open access to new markets and investment opportunities.</p></section>`;
  html += `<section><h2>Our Core ESG Services</h2><ul>`;
  html += `<li><h3>ESG Strategy &amp; Consulting</h3><p>Develop tailored Environmental, Social, and Governance (ESG) strategies aligned with investor expectations, GRI, and regulatory frameworks.</p></li>`;
  html += `<li><h3>Carbon Footprint Analysis</h3><p>Measure, track, and benchmark emissions across Scope 1, 2, and 3 using GHG Protocol &amp; ISO standards.</p></li>`;
  html += `<li><h3>Environmental Impact Reporting</h3><p>Comprehensive life-cycle assessments and environmental data insights for product and corporate transparency.</p></li>`;
  html += `</ul></section>`;
  html += `<section><h2>Our Approach to Sustainability</h2>`;
  html += `<p>Data drives better decisions. We combine industry-specific frameworks, certified sustainability consultants, and tech-enabled tracking tools to deliver credible, globally aligned reporting.</p></section>`;
  html += `<section><h2>Why Choose Bizwit for ESG</h2><ul>`;
  html += `<li>Customized strategies tailored to your industry and operating environment</li>`;
  html += `<li>Credible, globally aligned reporting (GRI, SASB, TCFD, CSRD)</li>`;
  html += `<li>Streamlined data collection, analysis, and carbon accounting</li>`;
  html += `<li>Regional compliance combined with international alignment</li>`;
  html += `</ul></section>`;
  if (servicePage?.content) {
    html += `<section><h2>Additional Details</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderIndiaGtmStrategyPage(servicePage) {
  let html = `<article class="service-detail"><header>`;
  html += `<h1>Enter, Launch and Scale in India with Confidence, Powered by Insight</h1>`;
  html += `<p>Data-driven go-to-market strategies built on market intelligence, customer insights, and competitive analysis to successfully enter and expand across India.</p>`;
  html += `</header><main>`;
  html += `<section><h2>Why Now is the Best Time to Invest in India</h2>`;
  html += `<p>By 2030, India is projected to become the world's third-largest economy and consumer market, driven by rapid digitalization, expanding manufacturing, and demographic advantages.</p>`;
  html += `<ul>`;
  html += `<li><strong>1.44 Billion Population:</strong> World's largest consumer market with rising disposable income.</li>`;
  html += `<li><strong>$1.7 Trillion:</strong> Projected growth in consumer spending by 2030.</li>`;
  html += `<li><strong>100% FDI:</strong> Permitted across key sectors including healthcare, single-brand retail, tech, and manufacturing.</li>`;
  html += `</ul></section>`;
  html += `<section><h2>How We Help You Succeed in India</h2><ul>`;
  html += `<li><h3>Find Your India Market Fit</h3><p>Identify high-potential customer segments and validate demand across diverse Indian regions.</p></li>`;
  html += `<li><h3>Scale with Confidence</h3><p>Expand across regions, optimize distribution channels, and accelerate sustainable growth.</p></li>`;
  html += `<li><h3>Consumer &amp; Channel Insights</h3><p>In-depth behavioral studies, purchasing patterns, digital adoption rates, and partner discovery.</p></li>`;
  html += `</ul></section>`;
  html += `<section><h2>What Our India GTM Strategy Delivers</h2><ul>`;
  html += `<li><strong>India Entry Opportunity Report:</strong> In-depth assessment of market size, growth drivers, and sector potential.</li>`;
  html += `<li><strong>Competitive &amp; Regulatory Landscape:</strong> Analysis of key competitors, pricing structures, and local compliance requirements.</li>`;
  html += `<li><strong>Localized GTM Playbook:</strong> Practical guide covering positioning, channels, and pricing tailored to Indian buyers.</li>`;
  html += `<li><strong>Regional Expansion Strategy:</strong> Structured framework prioritizing Tier 1 metros alongside rapid-growth Tier 2 and Tier 3 hubs.</li>`;
  html += `<li><strong>Partner Identification &amp; Screening:</strong> Curated list of verified distributors, vendors, and strategic collaborators.</li>`;
  html += `<li><strong>Quarterly Performance KPIs:</strong> Defined metrics and milestones to measure market penetration and adoption.</li>`;
  html += `</ul></section>`;
  if (servicePage?.content) {
    html += `<section><h2>Additional Insights</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderServicePageBySlug(slug, servicePage, seoData) {
  switch (slug) {
    case 'market-share-gain':
      return renderMarketShareGainPage(servicePage);
    case 'full-time-equivalent':
      return renderFtePage(servicePage);
    case 'thought-leadership':
      return renderThoughtLeadershipPage(servicePage);
    case 'market-intelligence':
      return renderMarketIntelligencePage(servicePage);
    case 'competitive-intelligence':
      return renderCompetitiveIntelligencePage(servicePage);
    case 'esg-consulting':
    case 'sustainability':
      return renderEsgConsultingPage(servicePage);
    case 'india-gtm-strategy':
      return renderIndiaGtmStrategyPage(servicePage);
    default:
      return renderStaticPage({
        title: seoData?.title || servicePage?.title || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description: seoData?.description || servicePage?.metaDescription || servicePage?.description
      });
  }
}

export function renderStaticPage({ title, description }) {
  let html = `<header><h1>${esc(title || 'Bizwit Research')}</h1></header><main>`;
  if (description) html += `<p>${esc(strip(description))}</p>`;
  html += `</main>`;
  return html;
}
