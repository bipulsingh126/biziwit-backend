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
  let html = `<article class="service-detail market-share-gain-page"><header>`;
  html += `<h1>Win Market Share With Data-Driven Strategy</h1>`;
  html += `<p>Market share growth is not accidental; it is engineered. Through rigorous market intelligence, competitive benchmarking, demand analytics, and actionable growth strategy, we help organisations identify whitespace opportunities, strengthen value propositions, and convert competitive advantage into measurable, sustained share gains across priority segments and geographies.</p>`;
  html += `<nav class="cta-nav"><a href="#contact" class="btn-primary">Request a Proposal</a></nav>`;
  html += `</header><main>`;

  html += `<section class="why-market-share">`;
  html += `<h2>What Market Share Growth Really Delivers</h2>`;
  html += `<p>Market share growth today is structurally more complex than it was a decade ago. Competitive intensity is rising, consumer loyalty is fragmenting, digital noise is escalating, and price transparency is compressing margins.</p>`;
  html += `<p>Many organisations invest heavily in marketing, yet struggle to convert that investment into measurable share gains because the underlying strategic alignment is missing. Expansion without competitive clarity leads to dilution. Winning market share today requires intelligence before action and integration across strategy, positioning, and execution.</p>`;
  html += `<p><strong>Market share growth is not just a metric — it transforms business economics:</strong></p>`;
  html += `<ul>`;
  html += `<li>Higher pricing power</li>`;
  html += `<li>Stronger distributor leverage</li>`;
  html += `<li>Improved brand recall</li>`;
  html += `<li>Economies of scale</li>`;
  html += `<li>Increased enterprise valuation</li>`;
  html += `</ul>`;
  html += `<p>Organizations that consistently gain share outperform competitors not only in revenue growth but in long-term profitability and resilience.</p>`;
  html += `</section>`;

  html += `<section class="growth-pillars">`;
  html += `<h2>Growth Pillars That Win Markets</h2>`;
  html += `<div class="pillars-grid">`;
  html += `<article class="pillar-card"><h3>Competitor Analysis</h3><p>Systematic mapping of competitor positioning, pricing architecture, distribution strength, and share concentration.</p></article>`;
  html += `<article class="pillar-card"><h3>Market Expansion Strategy</h3><p>Identification and prioritization of high-potential geographies, segments, and product adjacencies.</p></article>`;
  html += `<article class="pillar-card"><h3>Branding &amp; Social Media</h3><p>Sharper positioning frameworks and integrated online-offline activation strategies.</p></article>`;
  html += `<article class="pillar-card"><h3>Channel &amp; Distribution Optimization</h3><p>Channel mix evaluation across digital, retail, distributor, and partner networks.</p></article>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section class="strategic-framework">`;
  html += `<h2>The 5P Framework for Market Share Gain</h2>`;
  html += `<p>Market share does not grow by chance; it grows by design. Our &ldquo;5P Framework for Market Share Gain&rdquo; transforms strategic intent into measurable competitive advantage by identifying where growth exists, how to capture it, and what will sustain it over time.</p>`;
  html += `<p>Every decision is backed by market intelligence, structured opportunity mapping, competitive benchmarking, customer insights, and execution discipline. No scattered initiatives. No reactive tactics. Just a clear roadmap to winning and defending market share while accelerating sustainable growth, strengthening competitive positioning, improving resource allocation, and creating long-term value. Across priority markets, customer segments, and strategic growth opportunities, the framework provides clarity, focus, and measurable outcomes that drive lasting business success.</p>`;
  html += `<ol class="framework-steps">`;
  html += `<li><strong>Purpose (Business Objective Alignment):</strong> Clear strategic focus and growth targets aligned with enterprise goals.</li>`;
  html += `<li><strong>Playing Field (Market Competitor &amp; Mapping):</strong> Systematic assessment of competitors, segments, and regional market dynamics.</li>`;
  html += `<li><strong>Potential (GRP &amp; Whitespace Analysis):</strong> Uncovering underserved buyer segments, category gaps, and geographic whitespace.</li>`;
  html += `<li><strong>Penetration (Online &amp; Offline Channel Activation):</strong> Deploying optimized go-to-market channels for maximum reach and conversion.</li>`;
  html += `<li><strong>Performance (Performance Monitoring &amp; Optimization):</strong> Continuous tracking of market share metrics, ROI, and tactical refinement.</li>`;
  html += `</ol>`;
  html += `</section>`;

  html += `<section class="competitive-advantage">`;
  html += `<h2>How We Create Competitive Advantage</h2>`;
  html += `<div class="advantage-grid">`;
  html += `<article><h3>Sharper Competitive Positioning</h3><p>Move beyond reactive competition. Define a differentiated stance that protects margins and reduces price-led erosion.</p></article>`;
  html += `<article><h3>Prioritized Growth Opportunities</h3><p>Stop spreading resources thin. Focus on high-impact geographies, segments, and channels with proven expansion potential.</p></article>`;
  html += `<article><h3>Stronger Market Penetration</h3><p>Convert strategy into visibility and presence. Deploy optimized online and offline channels that increase reach and conversion efficiency.</p></article>`;
  html += `<article><h3>Measurable, Sustainable Share Gains</h3><p>Avoid short-term spikes driven by discounts. Build structural growth backed by continuous performance tracking and strategic refinement.</p></article>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section id="contact" class="connect-section">`;
  html += `<h2>Ready to Grow Market Share?</h2>`;
  html += `<p>Schedule a consultation with our market share specialists to evaluate your competitive positioning, identify whitespace opportunities, and architect an actionable growth strategy.</p>`;
  html += `<p>Contact our strategic consulting team at <a href="mailto:sales@bizwitresearch.com">sales@bizwitresearch.com</a> or call <a href="tel:+916267104147">+916 267 104147</a>.</p>`;
  html += `</section>`;

  if (servicePage?.content) {
    html += `<section class="additional-content"><h2>Additional Insights</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderFtePage(servicePage) {
  let html = `<article class="service-detail fte-page"><header>`;
  html += `<h1>Dedicated Resources, Aligned with your Business</h1>`;
  html += `<p>Access experienced analysts and consultants who seamlessly integrate with your organisation, providing dedicated research capacity, market intelligence, strategic insights, and continuous support. Our extended team model helps accelerate decision-making, improve execution efficiency, reduce internal resource constraints, and deliver high-quality intelligence aligned with your business objectives and growth priorities.</p>`;
  html += `<nav class="cta-nav"><a href="#contact" class="btn-primary">Request Dedicated Resources</a></nav>`;
  html += `</header><main>`;

  html += `<section class="fte-model-intro">`;
  html += `<h2>What is the FTE Model?</h2>`;
  html += `<p>The Full-Time Equivalent (FTE) model allows you to access dedicated researchers, analysts, or consultants who function as an extension of your internal team. You get the benefits of continuity, speed, and deep domain understanding without the overhead of hiring.</p>`;
  html += `<div class="features-grid">`;
  html += `<article><h3>Dedicated Resources</h3><p>100% dedicated resources fully committed to your projects and research agenda.</p></article>`;
  html += `<article><h3>Team Integration</h3><p>Seamless alignment with your timezone, internal workflows, and communication tools.</p></article>`;
  html += `<article><h3>Flexible Engagement</h3><p>Scalable, contract-based engagement with the flexibility to swap resources as project needs evolve.</p></article>`;
  html += `<article><h3>Cost Efficiency</h3><p>Substantially lower total cost of ownership (TCO) compared to traditional consulting models or in-house hiring.</p></article>`;
  html += `<article><h3>Continuous Support</h3><p>Ongoing analyst availability providing sustained domain intelligence and faster delivery.</p></article>`;
  html += `<article><h3>Faster Turnaround</h3><p>Rapid onboarding in less than 5 days, enabling you to start fast and stay ahead.</p></article>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section class="fte-services">`;
  html += `<h2>FTE Services We Offer</h2>`;
  html += `<div class="services-grid">`;
  html += `<article><h3>Market Research Analysts</h3><p>Dedicated support for secondary/primary research, database building, opportunity sizing, and competitive tracking.</p></article>`;
  html += `<article><h3>Data Analysts</h3><p>Advanced Excel, Python, Power BI, and Tableau-based quantitative modeling and insights generation.</p></article>`;
  html += `<article><h3>Consulting Support Staff</h3><p>Business problem-solving, client presentation decks, strategic benchmarking, and market intelligence.</p></article>`;
  html += `<article><h3>Industry SMEs (On-Demand)</h3><p>Plug-in senior domain advisors for strategic input, expert validation, and high-impact report generation.</p></article>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section class="why-fte">`;
  html += `<h2>Why Choose Bizwit for FTE Support</h2>`;
  html += `<p>At Bizwit, our dedicated resources operate as a seamless extension of your internal team, bringing structured research methodologies, analytical rigour, and consulting discipline to every engagement. Our professionals are carefully selected based on domain expertise and analytical capabilities, ensuring that each engagement benefits from the right mix of industry understanding and research proficiency.</p>`;
  html += `<p>Through our FTE model, clients gain consistent access to skilled research and consulting professionals who support a wide range of strategic initiatives from market intelligence and competitive analysis to data interpretation and insight development. We emphasise clear communication, defined workflows, and collaborative execution so that our teams integrate naturally with your existing processes and tools.</p>`;
  html += `<p>With rapid onboarding, flexible engagement structures, and strong quality oversight, Bizwit ensures that organisations can scale research capacity efficiently while maintaining high standards of analytical output and reliability across ongoing projects.</p>`;
  html += `<ul>`;
  html += `<li>Dedicated resources fully aligned with your business objectives and ongoing research priorities.</li>`;
  html += `<li>Rapid onboarding enabling quick deployment of analysts and minimal project start-up delays.</li>`;
  html += `<li>Flexible engagement models that adapt to changing project scope and business requirements.</li>`;
  html += `<li>Access to domain-aligned research and consulting expertise across multiple industries and sectors.</li>`;
  html += `</ul>`;
  html += `</section>`;

  html += `<section class="how-it-works">`;
  html += `<h2>How It Works (5-Step Deployment Process)</h2>`;
  html += `<ol class="deployment-steps">`;
  html += `<li><strong>Define Scope &amp; Skillset:</strong> At the outset, we collaborate closely with your team to clearly define project objectives, required skillsets, experience levels, and desired outcomes. This ensures alignment from the start and allows us to build a precise resource and delivery roadmap tailored to your business goals.</li>`;
  html += `<li><strong>Select Profiles:</strong> Based on the scope and skillset requirements, we shortlist and present the most suitable candidate profiles from our talent pool. You have full control in reviewing, evaluating, and selecting professionals who best fit your project, team culture, and expectations.</li>`;
  html += `<li><strong>Trial Phase (Optional):</strong> To ensure compatibility and performance, we offer an optional trial period. This allows you to assess selected resources in real-time project environments, offering risk-free evaluation before committing to full onboarding.</li>`;
  html += `<li><strong>Full Onboarding:</strong> Once the profiles are finalized, we initiate the complete onboarding process, including documentation, compliance, system access, and knowledge transfer. We ensure a smooth transition so your selected team members are fully integrated and productive from day one.</li>`;
  html += `<li><strong>Monthly Reviews &amp; Adjustments:</strong> We maintain ongoing collaboration through monthly performance reviews and feedback loops. This allows for continuous improvement, resource optimization, and necessary adjustments to align with evolving project needs or business priorities.</li>`;
  html += `</ol>`;
  html += `</section>`;

  html += `<section class="success-metrics">`;
  html += `<h2>Success Metrics &amp; Proven Impact</h2>`;
  html += `<ul>`;
  html += `<li><strong>60% Faster Project Delivery:</strong> Streamlined delivery pipelines and dedicated focus for complex research and consulting tasks.</li>`;
  html += `<li><strong>60+ FTEs Deployed:</strong> Experienced analysts and consultants deployed across 7 global countries.</li>`;
  html += `<li><strong>2x Output Improvement:</strong> Significant productivity enhancements and research output consistency in long-term support.</li>`;
  html += `<li><strong>95%+ Client Retention Rate:</strong> Proven track record of successful, ongoing multi-year engagements.</li>`;
  html += `</ul>`;
  html += `</section>`;

  html += `<section id="contact" class="connect-section">`;
  html += `<h2>Get Your Dedicated Research Team</h2>`;
  html += `<p>Scale your research and consulting capabilities with dedicated analysts aligned to your timezone and business objectives.</p>`;
  html += `<p>Contact us at <a href="mailto:sales@bizwitresearch.com">sales@bizwitresearch.com</a> or call <a href="tel:+916267104147">+916 267 104147</a>.</p>`;
  html += `</section>`;

  if (servicePage?.content) {
    html += `<section class="additional-content"><h2>Additional Details</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderThoughtLeadershipPage(servicePage) {
  let html = `<article class="service-detail thought-leadership-page"><header>`;
  html += `<h1>Turn Thought Leadership into Demand</h1>`;
  html += `<p>Strategic insights, data-driven perspectives, and compelling industry narratives designed to strengthen market credibility, engage key decision-makers, enhance brand authority, and convert expertise into meaningful business conversations, qualified opportunities, and long-term customer relationships.</p>`;
  html += `<nav class="cta-nav"><a href="#contact" class="btn-primary">Start Building Authority</a></nav>`;
  html += `</header><main>`;

  html += `<section class="insight-to-conversations">`;
  html += `<h2>From Insight to Market Conversations</h2>`;
  html += `<p>Content-led demand generation focuses on attracting, nurturing, and converting prospects through high-value content such as whitepapers, infographics, research reports, webinars, and expert insights that are strategically aligned with buyer personas and different stages of the buyer journey. Rather than relying on direct selling or intrusive outreach, this approach draws potential buyers in by providing meaningful insights that help them better understand industry challenges, emerging opportunities, and potential solutions.</p>`;
  html += `<p>At the awareness stage, informative, insight-driven content positions your brand as a credible source of industry knowledge. As prospects continue exploring the topic, deeper and more analytical content helps them evaluate approaches, compare perspectives, and engage more actively with your expertise. This ongoing engagement gradually builds familiarity and trust.</p>`;
  html += `<p>When content consistently addresses real business concerns and reflects a strong understanding of the market, organisations naturally position themselves as trusted advisors rather than just service providers. Over time, this credibility encourages decision-makers to initiate conversations, seek further insights, and explore potential collaboration.</p>`;
  html += `<p>Content-led demand generation, therefore, creates a structured pathway from discovery to dialogue. It keeps your organisation visible during early research stages, nurtures interest with relevant insights, and supports prospects as they move toward informed decision-making. By aligning content strategy with buyer intent and business objectives, companies can generate sustainable demand while strengthening their authority and influence within the market.</p>`;
  html += `</section>`;

  html += `<section class="industry-context">`;
  html += `<h2>Why Thought Leadership Demand Generation (TLDG)?</h2>`;
  html += `<blockquote><strong>Did you know?</strong> 70&ndash;80% of B2B buyers prefer engaging with insightful industry content before speaking with a vendor. Organisations that consistently share expert perspectives often influence buying decisions long before formal sales conversations begin.</blockquote>`;
  html += `<p>Recent industry surveys of over 15,000 marketing leaders, from VPs to CXOs, show that 83% believe strong positioning in the new economy is critical for driving B2B growth. In increasingly competitive markets, organizations that consistently share meaningful insights and perspectives are more likely to influence decision-makers early in their buying journey.</p>`;
  html += `<h3>Effective Demand Generation Assets</h3>`;
  html += `<p>Thought leadership demand generation transforms assets such as events, webinars, whitepapers, and videos into powerful engagement tools. When strategically developed and distributed, these assets attract the right audiences, strengthen brand credibility, generate qualified leads, and increase meaningful engagement with your target market.</p>`;
  html += `<h3>Overcoming Content Creation Challenges</h3>`;
  html += `<p>In the AI-driven content era, 45% of marketers report greater difficulty producing distinctive, impactful content. As content volumes rise, standing out requires a structured strategy that combines strong insights, clear positioning, and consistent messaging to create content that resonates with decision-makers.</p>`;
  html += `</section>`;

  html += `<section class="what-we-offer">`;
  html += `<h2>What We Offer</h2>`;
  html += `<div class="offer-grid">`;
  html += `<article><h3>Asset Creation &amp; Optimization</h3><ul><li>Whitepapers, eBooks, Blog series, infographics</li><li>SEO-optimized + gated content</li><li>Insight-driven thought leadership assets</li><li>Gated resources for qualified lead generation</li></ul></article>`;
  html += `<article><h3>Content Strategy &amp; Planning</h3><ul><li>Buyer persona mapping</li><li>Journey-stage funnel alignment</li><li>Thought leadership theme development</li><li>Structured editorial calendar planning</li></ul></article>`;
  html += `<article><h3>Distribution &amp; Lead Capture</h3><ul><li>Targeted email and LinkedIn campaigns</li><li>Strategic media and industry partnerships</li><li>Lead capture and audience engagement</li><li>Performance monitoring and optimization</li></ul></article>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section class="demand-engine">`;
  html += `<h2>Our 6-Step Demand Gen Engine</h2>`;
  html += `<ol class="engine-steps">`;
  html += `<li><strong>Content Ideation:</strong> Identify high-impact topics addressing real industry challenges and unmet decision-maker needs.</li>`;
  html += `<li><strong>Persona Mapping:</strong> Align messaging with executive decision-makers, technical evaluators, and key influencers.</li>`;
  html += `<li><strong>Asset Creation:</strong> Produce research-backed whitepapers, eBooks, visual briefs, and comprehensive research reports.</li>`;
  html += `<li><strong>Channel Distribution:</strong> Multi-channel dissemination across paid media, owned channels, social networks, and industry partnerships.</li>`;
  html += `<li><strong>Lead Qualification:</strong> Capture and score high-intent B2B prospect interactions based on engagement depth.</li>`;
  html += `<li><strong>ROI Reporting:</strong> Measure audience engagement, pipeline velocity, qualified leads, and measurable campaign ROI.</li>`;
  html += `</ol>`;
  html += `</section>`;

  html += `<section class="client-impact">`;
  html += `<h2>Client Impact</h2>`;
  html += `<ul>`;
  html += `<li><strong>Faster project delivery:</strong> &uarr;60%</li>`;
  html += `<li><strong>FTEs deployed across 7 countries:</strong> 60+</li>`;
  html += `<li><strong>Client retention rate:</strong> &uarr;60%</li>`;
  html += `<li><strong>Output improvement in long-term support:</strong> 2x</li>`;
  html += `</ul>`;
  html += `</section>`;

  html += `<section class="content-types">`;
  html += `<h2>Content Types We Specialize In</h2>`;
  html += `<ul>`;
  html += `<li>Webinars &amp; Expert Roundtables</li>`;
  html += `<li>Whitepapers &amp; Research Reports</li>`;
  html += `<li>Infographics &amp; Executive Briefings</li>`;
  html += `<li>E-books &amp; Case Studies</li>`;
  html += `<li>Podcasts &amp; Video Content</li>`;
  html += `</ul>`;
  html += `</section>`;

  html += `<section id="contact" class="connect-section">`;
  html += `<h2>Elevate Your Market Voice</h2>`;
  html += `<p>Turn your strategic perspective into qualified pipeline and established brand authority.</p>`;
  html += `<p>Contact us at <a href="mailto:sales@bizwitresearch.com">sales@bizwitresearch.com</a> or call <a href="tel:+916267104147">+916 267 104147</a>.</p>`;
  html += `</section>`;

  if (servicePage?.content) {
    html += `<section class="additional-content"><h2>Additional Insights</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderMarketIntelligencePage(servicePage) {
  let html = `<article class="service-detail market-intelligence-page"><header>`;
  html += `<h1>Actionable Market Intelligence for Strategic Decisions</h1>`;
  html += `<p>Transform complex market data into actionable strategic insights that help organisations understand industry dynamics, identify emerging opportunities, and anticipate future trends. Make informed business decisions with greater clarity, confidence, and long-term strategic direction in increasingly competitive and evolving markets.</p>`;
  html += `<nav class="cta-nav"><a href="#contact" class="btn-primary">Request Market Insights</a></nav>`;
  html += `</header><main>`;

  html += `<section class="strategic-clarity">`;
  html += `<h2>Turning Data into Strategic Clarity</h2>`;
  html += `<p>Strategic growth in any market requires more than surface-level data. It requires structured intelligence to guide decisions from early evaluation through long-term expansion. Market intelligence helps organisations assess opportunities, understand competitive dynamics, and build strategies grounded in reliable insights.</p>`;
  html += `<p><strong>At the Feasibility Stage:</strong> Businesses evaluate market size, demand potential, regulatory considerations, and competitive intensity to determine whether a market or opportunity is worth pursuing. These insights help reduce uncertainty before committing significant resources.</p>`;
  html += `<p><strong>During Market Entry:</strong> Intelligence supports decisions around target segments, value positioning, partnership models, and go-to-market strategies, enabling organisations to enter new markets with a clearer competitive advantage.</p>`;
  html += `<p><strong>As Companies Scale:</strong> Expansion-focused intelligence identifies untapped customer segments, regional growth opportunities, evolving demand patterns, and emerging competitive threats. By connecting insights on feasibility, entry, and expansion, market intelligence provides a structured pathway for sustainable, informed market growth.</p>`;
  html += `</section>`;

  html += `<section class="mi-services">`;
  html += `<h2>Our Market Intelligence Services</h2>`;
  html += `<div class="services-grid">`;
  html += `<article><h3>Feasibility Study</h3><p>Assess new business ideas, products, or investments through demand, competition, regulations, operations, and financial viability analysis.</p></article>`;
  html += `<article><h3>Market Entry Strategy</h3><p>Develop structured market entry frameworks that identify the right segments, positioning strategies, partnership models, and go-to-market approaches for successful entry into new markets.</p></article>`;
  html += `<article><h3>Market Expansion Strategy</h3><p>Support organisations in scaling within existing or adjacent markets by identifying growth opportunities, untapped customer segments, channel strategies, and competitive positioning advantages.</p></article>`;
  html += `<article><h3>Market Demand &amp; Forecast</h3><p>Analyse current demand patterns and future market potential using data-driven models, industry insights, and macroeconomic indicators to support long-term strategic planning.</p></article>`;
  html += `<article><h3>Regional Landscape Analysis</h3><p>Understand geographic variations in market maturity, customer behaviour, competitive intensity, regulatory environment, and investment opportunities across key regions.</p></article>`;
  html += `<article><h3>Market Motivators Analysis</h3><p>Identify the drivers of market growth, including technology adoption, customer needs, industry shifts, regulatory developments, and evolving purchasing behaviour.</p></article>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section class="workflow-section">`;
  html += `<h2>Strategic Intelligence Workflow &amp; Global Reach</h2>`;
  html += `<p>Our strategic intelligence workflow combines primary research, secondary data synthesis, econometric forecasting, and executive interview validation. With global reach and deep regional expertise, we track thousands of regional micro-markets to support cross-border expansions.</p>`;
  html += `</section>`;

  html += `<section class="business-outcomes">`;
  html += `<h2>Business Outcomes We Drive</h2>`;
  html += `<p class="lead-text">Bridging strategic business needs with reliable market intelligence.</p>`;
  html += `<p>We translate critical business questions into structured market intelligence that guides strategy, reduces uncertainty, and supports confident decision-making.</p>`;
  html += `<table class="outcomes-table">`;
  html += `<thead><tr><th>Business Need</th><th>Value Bizwit Delivers</th></tr></thead>`;
  html += `<tbody>`;
  html += `<tr><td>Entering a new market</td><td>Barrier analysis + entry models</td></tr>`;
  html += `<tr><td>Expanding in-region</td><td>Customer segmentation + channel mapping</td></tr>`;
  html += `<tr><td>Product launch feasibility</td><td>Go/No-go analysis + customer trials</td></tr>`;
  html += `<tr><td>Risk &amp; compliance mapping</td><td>Local regulations + trade impact review</td></tr>`;
  html += `</tbody></table>`;
  html += `</section>`;

  html += `<section id="contact" class="connect-section">`;
  html += `<h2>Request Market Insights</h2>`;
  html += `<p>Connect with our senior research analysts to structure a custom market intelligence engagement.</p>`;
  html += `<p>Email: <a href="mailto:sales@bizwitresearch.com">sales@bizwitresearch.com</a> | Phone: <a href="tel:+916267104147">+916 267 104147</a></p>`;
  html += `</section>`;

  if (servicePage?.content) {
    html += `<section class="additional-content"><h2>Additional Details</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderCompetitiveIntelligencePage(servicePage) {
  let html = `<article class="service-detail competitive-intelligence-page"><header>`;
  html += `<h1>Navigate Markets with Competitive Intelligence</h1>`;
  html += `<p>Analyse competitors, uncover strategic market signals, and translate competitive insights into smarter positioning, informed decisions, and sustainable business.</p>`;
  html += `<nav class="cta-nav"><a href="#strategic-connect-form" class="btn-primary">Request a Competitor Scan</a></nav>`;
  html += `</header><main>`;

  html += `<section class="what-we-offer">`;
  html += `<h2>What We Offer</h2>`;
  html += `<div class="offer-grid">`;
  html += `<article><h3>Benchmarking &amp; Positioning</h3><p>With our Benchmarking &amp; Positioning services, gain a clear view of your competitive standing, uncover performance gaps, and lead with confidence.</p></article>`;
  html += `<article><h3>Pipeline Analysis</h3><p>Evaluate market opportunities, spot weaknesses in your growth funnel, and optimize for strategic success.</p></article>`;
  html += `<article><h3>Go-To-Market Insights</h3><p>With our actionable GTM strategies, enter chosen markets with confidence&mdash;covering positioning, channels, customer segments, pricing, and competitive tactics.</p></article>`;
  html += `<article><h3>Identify Market Attractiveness</h3><p>With our Market Attractiveness services, assess market potential, prioritize opportunities, and invest where growth and alignment are strongest.</p></article>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section class="why-bizwit-ci">`;
  html += `<h2>Why Bizwit for Competitive Analysis</h2>`;
  html += `<ul>`;
  html += `<li>Are you exploring new markets without clear visibility into their true potential?</li>`;
  html += `<li>Is your team struggling to separate high-value opportunities from saturated or low-growth segments?</li>`;
  html += `</ul>`;
  html += `<p>As you expand into new or unfamiliar territories, it's critical to base decisions on more than instinct or past success. Our Competitive Intelligence &amp; Strategy Analysis services empower your team with a clear understanding of market dynamics, customer needs, and competitive realities&mdash;so you can prioritize the right opportunities and shape strategies that win.</p>`;
  html += `</section>`;

  html += `<section class="our-approach">`;
  html += `<h2>Our Approach (5-Step Intelligence Framework)</h2>`;
  html += `<p>A structured intelligence framework that evaluates market dynamics, competitor strategies, and growth opportunities to support informed strategic decisions.</p>`;
  html += `<ol class="approach-steps">`;
  html += `<li><strong>Define Strategic Objectives:</strong> Align with your business goals to understand what success looks like in new or existing markets.</li>`;
  html += `<li><strong>Conduct Market Scanning:</strong> Analyze macro trends, regulatory factors, and emerging shifts that impact market dynamics.</li>`;
  html += `<li><strong>Assess Competitive Landscape:</strong> Benchmark key players, assess strategies, and identify white spaces or underserved segments.</li>`;
  html += `<li><strong>Prioritize Market Opportunities:</strong> Score and compare markets by growth potential, competitive intensity, risk, and strategic fit.</li>`;
  html += `<li><strong>Develop Market-Driven Strategy:</strong> Systemize findings into actionable insights and recommend market entry, positioning, and growth strategies.</li>`;
  html += `</ol>`;
  html += `</section>`;

  html += `<section class="deliverables-section">`;
  html += `<h2>Insights We Deliver</h2>`;
  html += `<div class="deliverables-grid">`;
  html += `<article><h3>Competitive Positioning Matrix</h3><p>Map competitors based on key differentiators such as pricing, value proposition, capabilities, and overall market positioning.</p></article>`;
  html += `<article><h3>SWOT &amp; Value Pop Maps</h3><p>Evaluate competitor strengths, weaknesses, opportunities, and threats while mapping unique value propositions across the competitive landscape.</p></article>`;
  html += `<article><h3>Feature Comparison Sheets</h3><p>Detailed comparison of competitor products, features, pricing models, and capabilities to support informed strategic positioning.</p></article>`;
  html += `<article><h3>Deal Pipeline Analysis</h3><p>Track competitor deals, partnerships, and strategic moves to understand momentum, growth patterns, and market traction.</p></article>`;
  html += `<article><h3>Social/Content Tracker</h3><p>Monitor competitor content strategies, messaging themes, and engagement patterns across digital and social platforms.</p></article>`;
  html += `<article><h3>Visual Battlecards</h3><p>Concise competitive intelligence summaries enabling sales and strategy teams to quickly position offerings against key competitors.</p></article>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section class="why-choose-ci">`;
  html += `<h2>Why Clients Partner with Bizwit</h2>`;
  html += `<div class="partner-comparison">`;
  html += `<div class="approach-box"><h3>Our Approach</h3><ul><li>90%+ Primary Research Driven</li><li>Customized Intelligence Frameworks Tailored for you</li><li>Cross-Industry Expertise</li></ul></div>`;
  html += `<div class="gain-box"><h3>What Clients Gain</h3><ul><li>Unfiltered market insights that go beyond publicly available information.</li><li>Intelligence aligned directly with strategic business priorities.</li><li>Broader perspective on emerging threats, opportunities, and best practices.</li></ul></div>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section id="strategic-connect-form" class="connect-section">`;
  html += `<h2>Request a Competitor Scan</h2>`;
  html += `<p>Empower your strategy with verified competitor benchmarking and positioning intelligence.</p>`;
  html += `<p>Email: <a href="mailto:sales@bizwitresearch.com">sales@bizwitresearch.com</a> | Phone: <a href="tel:+916267104147">+916 267 104147</a></p>`;
  html += `</section>`;

  if (servicePage?.content) {
    html += `<section class="additional-content"><h2>Additional Insights</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderEsgConsultingPage(servicePage) {
  let html = `<article class="service-detail esg-consulting-page"><header>`;
  html += `<h1>Turn Sustainability Into a Competitive Advantage</h1>`;
  html += `<p>Harness the power of ESG and environmental impact strategies with Bizwit Research to uncover actionable insights and develop sustainable solutions that drive business growth while supporting long-term environmental and societal value.</p>`;
  html += `<nav class="cta-nav"><a href="#contact" class="btn-primary">Check your ESG Score Now</a></nav>`;
  html += `</header><main>`;

  html += `<section class="why-esg">`;
  html += `<h2>Why ESG Consulting Matters</h2>`;
  html += `<p>Sustainability is no longer a choice; it is a strategic imperative for long-term business resilience and growth. As regulatory pressures increase and stakeholders demand greater accountability, organisations must align their operations with environmental and social priorities.</p>`;
  html += `<p>Sustainable practices help reduce risks, improve operational efficiency, and enhance brand credibility. They also open access to new markets, investment opportunities, and conscious consumers. Companies that embed sustainability into their core strategy are better positioned to anticipate change, adapt to evolving expectations, and create lasting value.</p>`;
  html += `</section>`;

  html += `<section class="core-services">`;
  html += `<h2>Our Core Services</h2>`;
  html += `<div class="services-grid">`;
  html += `<article><h3>ESG Consulting</h3><p>Develop tailored Environmental, Social, and Governance (ESG) strategies aligned with investor expectations and regulatory frameworks.</p></article>`;
  html += `<article><h3>Carbon Footprint Analysis</h3><p>Measure, track, and benchmark your emissions to identify reduction opportunities using GHG Protocol &amp; ISO standards.</p></article>`;
  html += `<article><h3>Environmental Impact Reporting</h3><p>Comprehensive life-cycle assessment and environmental data insights for product or service impact transparency.</p></article>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section class="approach-sustainability">`;
  html += `<h2>Our Approach to Sustainability: Data Drives Better Decisions</h2>`;
  html += `<p>Develop tailored Environmental, Social, and Governance (ESG) strategies aligned with investor expectations and regulatory frameworks, powered by data-driven benchmarks and continuous impact metrics.</p>`;
  html += `</section>`;

  html += `<section class="why-choose-esg">`;
  html += `<h2>Why Choose Bizwit</h2>`;
  html += `<div class="feature-benefit-grid">`;
  html += `<div class="feature-box"><h3>Feature</h3><ul><li>Industry-specific ESG frameworks</li><li>Certified sustainability consultants</li><li>Tech-enabled tracking tools</li><li>Global execution capability</li></ul></div>`;
  html += `<div class="benefit-box"><h3>Benefit</h3><ul><li>Customized strategies, not one-size-fits-all</li><li>Credible, globally aligned reporting</li><li>Streamlined data collection and analysis</li><li>Regional compliance + international alignment</li></ul></div>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section id="contact" class="connect-section">`;
  html += `<h2>Talk to Our ESG &amp; Impact Strategy Team</h2>`;
  html += `<p>Consult with certified ESG experts on sustainability roadmaps, compliance reporting, and carbon reduction strategies.</p>`;
  html += `<p>Email: <a href="mailto:sales@bizwitresearch.com">sales@bizwitresearch.com</a> | Phone: <a href="tel:+916267104147">+916 267 104147</a></p>`;
  html += `</section>`;

  if (servicePage?.content) {
    html += `<section class="additional-content"><h2>Additional Details</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderIndiaGtmStrategyPage(servicePage) {
  let html = `<article class="service-detail india-gtm-page"><header>`;
  html += `<h1>Enter, Launch and Scale in India with Confidence, Powered by Insight</h1>`;
  html += `<p>Data-driven go-to-market strategies built on market intelligence, customer insights, and competitive analysis to successfully enter and expand across India.</p>`;
  html += `<nav class="cta-nav"><a href="#get-in-touch-form" class="btn-primary">Book a Discovery Call</a></nav>`;
  html += `</header><main>`;

  html += `<section class="invest-in-india">`;
  html += `<h2>Why Now is the Best Time to Invest in India?</h2>`;
  html += `<p>By 2030, India is projected to become the world's third-largest economy and consumer market, driven by strong growth in manufacturing, digital, and IT sectors. Venture capital in online retail surged from USD 8 billion in 2020 to USD 22 billion in 2021&ndash;a 175% jump&ndash;signaling investor confidence. What sets India apart is the consistency of this exceptional growth.</p>`;
  html += `<div class="stats-grid">`;
  html += `<article><h3>1.44 Billion</h3><p>Population, making India the world's largest consumer market with rising disposable income.</p></article>`;
  html += `<article><h3>$1.7 Trillion</h3><p>Projected growth in consumer spending by 2030.</p></article>`;
  html += `<article><h3>100% FDI</h3><p>In a host of sectors such as healthcare, pharma, textile, education, single brand retail trade, and infrastructure.</p></article>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section class="help-succeed">`;
  html += `<h2>How We Help You Succeed in India</h2>`;
  html += `<div class="services-grid">`;
  html += `<article><h3>Find Your India Market Fit</h3><p>Identify high-potential customer segments and validate demand across India's diverse markets.</p></article>`;
  html += `<article><h3>Scale with Confidence</h3><p>Expand across regions, optimise channels, and accelerate sustainable growth in India.</p></article>`;
  html += `<article><h3>Consumer &amp; Channel Insights</h3><p>Behavioral studies, buying patterns, digital adoption rates, and distributor discovery.</p></article>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section class="market-entry-blueprint">`;
  html += `<h2>Bizwit Blueprint for Market Entry</h2>`;
  html += `<p>A comprehensive end-to-end operational roadmap guiding foreign enterprises from regulatory compliance, entity setup, and partner selection to customer acquisition and regional scaling across Tier 1, Tier 2, and Tier 3 Indian cities.</p>`;
  html += `</section>`;

  html += `<section class="gtm-delivers">`;
  html += `<h2>What Our India GTM Strategy Delivers</h2>`;
  html += `<div class="deliverables-grid">`;
  html += `<article><h3>India Entry Opportunity Report</h3><p>Assessment of market size, demand potential, growth drivers, and priority sectors for entering India.</p></article>`;
  html += `<article><h3>Competitive &amp; Regulatory Landscape</h3><p>Analysis of key competitors, market positioning, pricing dynamics, and regulatory requirements affecting market entry.</p></article>`;
  html += `<article><h3>Localized GTM Playbook</h3><p>Strategic guide covering positioning, pricing, messaging, and channels tailored to Indian market conditions.</p></article>`;
  html += `<article><h3>Regional Expansion Strategy</h3><p>Framework to prioritize metros and high-growth Tier 2 and Tier 3 markets.</p></article>`;
  html += `<article><h3>Partner Identification List</h3><p>Curated list of potential distributors, channel partners, and ecosystem collaborators for market entry.</p></article>`;
  html += `<article><h3>Quarterly Performance KPIs</h3><p>Defined performance metrics to track market entry progress, adoption, and growth across regions.</p></article>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section id="get-in-touch-form" class="connect-section">`;
  html += `<h2>Unlock Your India Market Opportunity</h2>`;
  html += `<p>Speak with our India market entry advisors to evaluate sector feasibility and develop your customized GTM roadmap.</p>`;
  html += `<p>Email: <a href="mailto:sales@bizwitresearch.com">sales@bizwitresearch.com</a> | Phone: <a href="tel:+916267104147">+916 267 104147</a></p>`;
  html += `</section>`;

  if (servicePage?.content) {
    html += `<section class="additional-content"><h2>Additional Insights</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderVocPage(servicePage) {
  let html = `<article class="service-detail voc-page"><header>`;
  html += `<h1>Understanding Customers Beyond Surveys</h1>`;
  html += `<p>Over 70% of customers expect personalised experiences, and many switch brands after a single poor interaction. More than 65% want tangible product changes based on their feedback. In this environment, assumptions are expensive. Bizwit's Voice of Customer (VOC) approach combines structured listening with analytical rigour to align strategy with evolving customer expectations.</p>`;
  html += `<nav class="cta-nav"><a href="#contact" class="btn-primary">Request a Proposal</a></nav>`;
  html += `</header><main>`;

  html += `<section class="voc-portfolio">`;
  html += `<h2>Our VOC Service Portfolio</h2>`;
  html += `<div class="portfolio-grid">`;
  html += `<article class="portfolio-card"><h3>Customer Deep-Dive Studies</h3><p>In-depth qualitative and mixed-method studies using customer interviews, surveys, and focus group studies to uncover motivations, unmet needs, decision drivers, and experience gaps beyond structured feedback and scores.</p></article>`;
  html += `<article class="portfolio-card"><h3>Product &amp; Feature Validation</h3><p>Pre- and post-launch VoC research combining surveys, customer interviews, and focus groups to validate concepts, features, and value propositions; ensuring product decisions reflect real customer expectations, not internal assumptions.</p></article>`;
  html += `<article class="portfolio-card"><h3>Customer Journey &amp; Experience Mapping</h3><p>End-to-end journey analysis grounded in customer narratives, survey feedback, and Social Listening insights to identify friction points, moments of truth, and opportunities for meaningful experience differentiation.</p></article>`;
  html += `<article class="portfolio-card"><h3>Churn, Retention &amp; Loyalty Diagnostics</h3><p>VoC-led diagnostics leveraging NPS Score analysis, customer feedback, and interviews to uncover disengagement drivers, switching behaviour, and loyalty triggers that inform retention strategies and experience redesign.</p></article>`;
  html += `<article class="portfolio-card"><h3>B2B Stakeholder &amp; Buyer Insight</h3><p>Structured listening across decision-makers, influencers, and users through interviews, surveys, and focused discussions to understand complex buying dynamics, value perceptions, and relationship drivers in B2B environments.</p></article>`;
  html += `<article class="portfolio-card"><h3>Continuous VoC Programs</h3><p>Ongoing Voice of Customer programs integrating surveys, NPS Score tracking, Social Listening, interviews, and focus group studies—providing leadership with continuous, decision-ready customer intelligence.</p></article>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section class="why-voc-matters">`;
  html += `<h2>Why Voice of Customer (VoC) Matters</h2>`;
  html += `<p>Many organisations invest in Voice of Customer programs, yet few unlock their full strategic value. When VoC is confined to periodic surveys, keyword-based sentiment tracking, and static dashboards, it becomes a retrospective reporting tool rather than a forward-looking growth engine. It tells you what customers experienced yesterday, but rarely helps you anticipate what they will do tomorrow. In a market where expectations evolve rapidly and switching barriers are low, relying solely on lagging indicators means reacting after churn has increased, loyalty has weakened, or product relevance has declined.</p>`;
  html += `<p>A modern VoC strategy must go beyond feedback collection to deliver actionable predictive intelligence. By integrating qualitative insight, behavioural data, NPS diagnostics, journey analysis, and social listening into a unified analytical framework, organisations can move from observing sentiment to identifying patterns. Predictive analytics enables leadership teams to detect emerging friction points, anticipate churn risk, and prioritise product enhancements before performance metrics reflect decline. Instead of asking what happened, decision-makers gain clarity on what is likely to happen next and where intervention will create a measurable impact.</p>`;
  html += `<p>At Bizwit, our Voice of Customer services are designed to operate at this advanced level. We combine structured listening with analytical rigour to transform fragmented customer inputs into a cohesive insight narrative aligned with business objectives. Surveys, interviews, NPS tracking, focus groups, and social listening are not treated as standalone exercises; they are synthesised into decision-ready intelligence that informs product strategy, experience design, and growth prioritisation.</p>`;
  html += `<p><strong>Our approach enables organisations to:</strong></p>`;
  html += `<ul>`;
  html += `<li>Anticipate churn and loyalty shifts before revenue impact</li>`;
  html += `<li>Identify high-impact product and experience improvements</li>`;
  html += `<li>Detect emerging expectation gaps across customer segments</li>`;
  html += `<li>Align strategic investments with validated customer priorities</li>`;
  html += `</ul>`;
  html += `<p>Traditional VoC measures satisfaction and reports findings. Bizwit's approach elevates Voice of Customer into a strategic decision system, thereby reducing uncertainty, strengthening retention, and ensuring that products and strategies remain aligned with evolving market behaviour. In an environment defined by constant change, listening alone is insufficient. The real advantage lies in understanding patterns, predicting outcomes, and acting with precision.</p>`;
  html += `</section>`;

  html += `<section class="voc-pillars">`;
  html += `<h2>Why Choose Bizwit for VoC</h2>`;
  html += `<div class="pillars-grid">`;
  html += `<article><h3>Our Research Is Designed Around Real Business Decisions</h3><p>Our research begins with clearly defined strategic objectives, ensuring every VOC engagement directly informs product, retention, experience, and growth decisions.</p></article>`;
  html += `<article><h3>Beyond Feedback to Foresight</h3><p>Beyond satisfaction tracking and surface metrics, we focus on forward signals. We uncover patterns and emerging risks leaders can anticipate early.</p></article>`;
  html += `<article><h3>We Integrate Signals Into One Intelligence Narrative</h3><p>We combine insights from multiple sources to create a cohesive intelligence narrative that drives strategic decisions.</p></article>`;
  html += `<article><h3>We Combine Analytical Rigour With Business Context</h3><p>By grounding customer voice in rigorous analysis, we generate insights that connect clearly to strategic, product, and growth objectives.</p></article>`;
  html += `<article><h3>We Translate Voice Into Action</h3><p>We enable executive and product leaders to turn customer voice into prioritised, strategic decisions.</p></article>`;
  html += `</div>`;
  html += `</section>`;

  html += `<section class="client-impact">`;
  html += `<h2>Client Impact Assessment</h2>`;
  html += `<ul>`;
  html += `<li>Decision-making becomes more forward-looking instead of reacting to past feedback.</li>`;
  html += `<li>Early signs of customer churn and changing behaviour become easier to identify.</li>`;
  html += `<li>Product priorities are based on real customer drivers, not just satisfaction scores.</li>`;
  html += `<li>Teams align better when customer insights are connected into one clear story.</li>`;
  html += `<li>Leaders gain clearer direction on where to focus time and investment.</li>`;
  html += `<li>The result is faster, more confident action backed by validated customer patterns.</li>`;
  html += `<li>Emerging customer needs and unmet expectations are identified before they impact growth.</li>`;
  html += `<li>Marketing, sales, and product strategies become more targeted through deeper customer understanding.</li>`;
  html += `<li>Organizations can allocate resources more effectively by focusing on the highest-impact opportunities.</li>`;
  html += `</ul>`;
  html += `</section>`;

  html += `<section class="methodology-snapshot">`;
  html += `<h2>Methodology Snapshot: Our Voice of Customer Intelligence Framework</h2>`;
  html += `<p>Voice of Customer capability extends far beyond surveys and data collection. It evolves progressively as organisations advance through increasing levels of maturity. Each stage reflects a shift in how customer signals are interpreted, connected, and applied—shaping product, experience, and growth decisions with greater clarity and confidence. Our VoC portfolio supports this evolution by enabling organisations to identify patterns, anticipate behavioural shifts, and embed customer intelligence directly into leadership decision-making.</p>`;
  html += `<ol class="methodology-steps">`;
  html += `<li><strong>Feedback Collection:</strong> Capture direct and indirect feedback across omnichannel touchpoints.</li>`;
  html += `<li><strong>Satisfaction Measurement:</strong> Systematic quantification using CSAT, CES, and benchmarked metrics.</li>`;
  html += `<li><strong>Integrated Insight:</strong> Synthesis of qualitative narratives, survey data, and social listening.</li>`;
  html += `<li><strong>Predictive Intelligence:</strong> Identifying forward-looking behavioural patterns and emerging risks.</li>`;
  html += `<li><strong>Strategic Decision Engine:</strong> Embedding customer voice directly into executive product and growth decisions.</li>`;
  html += `</ol>`;
  html += `</section>`;

  html += `<section id="contact" class="connect-section">`;
  html += `<h2>Talk to a VoC Specialist</h2>`;
  html += `<p>Transform your customer insights into an actionable strategic growth engine.</p>`;
  html += `<p>Email: <a href="mailto:sales@bizwitresearch.com">sales@bizwitresearch.com</a> | Phone: <a href="tel:+916267104147">+916 267 104147</a></p>`;
  html += `</section>`;

  if (servicePage?.content) {
    html += `<section class="additional-content"><h2>Additional Insights</h2><div>${renderRichContent(servicePage.content)}</div></section>`;
  }
  html += `</main></article>`;
  return html;
}

export function renderAboutUsPage(seoData) {
  let html = `<article class="static-page"><header>`;
  html += `<h1>About Bizwit Research &amp; Consulting LLP</h1>`;
  html += `<p>Bizwit Research &amp; Consulting LLP is a global market research and strategic consulting firm delivering actionable intelligence, market analysis, and growth advisory to businesses worldwide.</p>`;
  html += `</header><main>`;
  html += `<section><h2>Who We Are</h2><p>We empower organisations with data-driven insights across technology, healthcare, manufacturing, chemicals, energy, and consumer goods. Our global analyst network tracks thousands of markets daily to help business leaders make confident strategic decisions.</p></section>`;
  html += `<section><h2>Our Core Pillars</h2><ul>`;
  html += `<li><strong>Rigorous Primary Research:</strong> Over 90% of our intelligence is grounded in primary interviews with industry executives and key opinion leaders.</li>`;
  html += `<li><strong>Custom Research &amp; Advisory:</strong> Tailored intelligence programs built around specific client business objectives.</li>`;
  html += `<li><strong>Global Coverage:</strong> In-depth coverage across North America, Europe, Asia Pacific, Latin America, and Middle East &amp; Africa.</li>`;
  html += `</ul></section>`;
  html += `</main></article>`;
  return html;
}

export function renderContactUsPage(seoData) {
  let html = `<article class="static-page"><header>`;
  html += `<h1>Contact Bizwit Research</h1>`;
  html += `<p>Connect with our research experts to discuss your market intelligence, consulting, or syndicated report requirements.</p>`;
  html += `</header><main>`;
  html += `<section><h2>Get in Touch</h2><ul>`;
  html += `<li><strong>Address:</strong> 303, Atulya IT Park, Indore, India (452001)</li>`;
  html += `<li><strong>Phone:</strong> +916 267 104147</li>`;
  html += `<li><strong>Email:</strong> sales@bizwitresearch.com | contact@bizwitresearch.com</li>`;
  html += `</ul></section>`;
  html += `<section><h2>Our Global Support</h2><p>Our research consultants are available 24/7 to assist with report inquiries, custom research scopes, and analyst consultations.</p></section>`;
  html += `</main></article>`;
  return html;
}

export function renderCareerPage(seoData) {
  let html = `<article class="static-page"><header>`;
  html += `<h1>Careers at Bizwit Research</h1>`;
  html += `<p>Join a fast-growing global team of market analysts, researchers, and strategic consultants shaping business intelligence across industries.</p>`;
  html += `</header><main>`;
  html += `<section><h2>Why Work With Us</h2><p>At Bizwit Research, we foster continuous learning, analytical excellence, and rapid career progression. We collaborate with Fortune 500 companies and high-growth innovators worldwide.</p></section>`;
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
    case 'voice-of-customer':
      return renderVocPage(servicePage);
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
