import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import seoTemplate from "../../views/seoTemplate.js";

// Models
import Report from "../models/Report.js";
import Megatrend from "../models/Megatrend.js";
import Blog from "../models/Blog.js";
import CaseStudy from "../models/CaseStudy.js";
import ServicePage from "../models/ServicePage.js";
import SEOPage from "../models/SEOPage.js";
import HomePage from "../models/HomePage.js";

// SSR utilities
import {
  organizationSchema, webSiteSchema, webPageSchema,
  articleSchema, productSchema, serviceSchema,
  breadcrumbSchema, itemListSchema, generateSchemaScripts,
  localBusinessSchema, contactPageSchema, faqSchema
} from "./schemaGenerator.js";
import {
  renderHomePage, renderReportListing, renderReportDetail,
  renderBlogListing, renderBlogDetail, renderMegatrendListing,
  renderMegatrendDetail, renderCaseStudyListing, renderCaseStudyDetail,
  renderStaticPage, renderServicePageBySlug,
  renderAboutUsPage, renderContactUsPage, renderCareerPage
} from "./contentRenderer.js";
import { setCacheHeaders } from "./cacheControl.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getFrontendDistPath() {
  const candidateDistPaths = [
    process.env.FRONTEND_DIST_PATH && path.resolve(process.env.FRONTEND_DIST_PATH),
    path.resolve(__dirname, "../../../frontend/dist"),
    path.resolve(__dirname, "../../frontend/dist"),
    path.resolve(__dirname, "../../../../bizwit_code-main/dist"),
    path.resolve(__dirname, "../../../../bizwit_code/dist"),
    path.resolve(process.cwd(), "frontend/dist"),
    path.resolve(process.cwd(), "../frontend/dist"),
    path.resolve(process.cwd(), "dist"),
    path.resolve(process.cwd(), "../dist"),
  ].filter(Boolean);

  const matchedPath = candidateDistPaths.find((p) =>
    fs.existsSync(path.join(p, "index.html"))
  );

  if (matchedPath) {
    return matchedPath;
  }

  return candidateDistPaths[0] || path.resolve(__dirname, "../../../frontend/dist");
}

const API_ORIGIN = (process.env.PUBLIC_API_URL || process.env.API_BASE_URL || "https://api.bizwitresearch.com").replace(/\/$/, "");
const SITE_URL = "https://bizwitresearch.com";

export function isBotRequest(userAgent = "") {
  if (!userAgent || typeof userAgent !== "string") return false;
  const ua = userAgent.toLowerCase();
  const botSignatures = [
    "googlebot",
    "bingbot",
    "yandex",
    "baiduspider",
    "duckduckbot",
    "slurp",
    "yahoo",
    "twitterbot",
    "facebookexternalhit",
    "facebot",
    "linkedinbot",
    "embedly",
    "quora link preview",
    "showyoubot",
    "outbrain",
    "pinterest",
    "slackbot",
    "vkshare",
    "w3c_validator",
    "whatsapp",
    "telegrambot",
    "applebot",
    "petalbot",
    "bytespider",
    "semrushbot",
    "ahrefsbot",
    "mj12bot",
    "screaming frog",
    "seznambot",
    "ia_archiver",
    "mediapartners-google",
    "adsbot-google",
    "feedfetcher-google",
    "bingpreview",
    "crawler",
    "spider",
    "robot",
    "lighthouse",
    "headlesschrome",
    "prerender",
    "curl",
    "wget"
  ];
  return botSignatures.some((sig) => ua.includes(sig));
}

let assetCache = {
  indexPath: "",
  mtime: 0,
  cssFiles: [],
  jsFiles: [],
  preloadJsFiles: [],
};

function getExtractedAssets(indexPath) {
  try {
    const stats = fs.statSync(indexPath);
    if (assetCache.indexPath === indexPath && assetCache.mtime === stats.mtimeMs) {
      return {
        cssFiles: assetCache.cssFiles,
        jsFiles: assetCache.jsFiles,
        preloadJsFiles: assetCache.preloadJsFiles
      };
    }

    const indexHtml = fs.readFileSync(indexPath, "utf-8");

    const cssFiles = [];
    const jsFiles = [];
    const preloadJsFiles = [];

    const cssRegex = /href=["']([^"']+\.css(?:\?[^"']*)?)["']/gi;
    let match;
    while ((match = cssRegex.exec(indexHtml)) !== null) {
      let href = match[1];
      if (!href.startsWith("/") && !href.startsWith("http")) {
        href = "/" + href;
      }
      if (!cssFiles.includes(href)) {
        cssFiles.push(href);
      }
    }

    // Extract entry scripts (<script src="...js">)
    const scriptRegex = /<script\b[^>]*src=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi;
    while ((match = scriptRegex.exec(indexHtml)) !== null) {
      let src = match[1];
      if (!src.startsWith("/") && !src.startsWith("http")) {
        src = "/" + src;
      }
      if (!jsFiles.includes(src)) {
        jsFiles.push(src);
      }
    }

    // Extract modulepreload links (<link rel="modulepreload" href="...js">)
    const preloadRegex = /<link\b[^>]*rel=["']modulepreload["'][^>]*href=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi;
    while ((match = preloadRegex.exec(indexHtml)) !== null) {
      let href = match[1];
      if (!href.startsWith("/") && !href.startsWith("http")) {
        href = "/" + href;
      }
      if (!preloadJsFiles.includes(href)) {
        preloadJsFiles.push(href);
      }
    }

    // Reverse attribute order check for modulepreload (<link href="...js" rel="modulepreload">)
    const preloadRegexAlt = /<link\b[^>]*href=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*rel=["']modulepreload["'][^>]*>/gi;
    while ((match = preloadRegexAlt.exec(indexHtml)) !== null) {
      let href = match[1];
      if (!href.startsWith("/") && !href.startsWith("http")) {
        href = "/" + href;
      }
      if (!preloadJsFiles.includes(href)) {
        preloadJsFiles.push(href);
      }
    }

    // Include entry scripts in preload list
    for (const js of jsFiles) {
      if (!preloadJsFiles.includes(js)) {
        preloadJsFiles.push(js);
      }
    }

    assetCache = {
      indexPath,
      mtime: stats.mtimeMs,
      cssFiles,
      jsFiles,
      preloadJsFiles,
    };

    return { cssFiles, jsFiles, preloadJsFiles };
  } catch (err) {
    console.error("Asset extraction error:", err);
    return { cssFiles: [], jsFiles: [], preloadJsFiles: [] };
  }
}

const toAbsoluteImageUrl = (img) => {
  if (!img || typeof img !== "string") return "";
  if (/^https?:\/\//i.test(img)) return img;
  return `${API_ORIGIN}${img.startsWith("/") ? img : `/${img}`}`;
};

// --- Page type detection ---
const SERVICE_PAGES = new Set([
  "sustainability", "esg-consulting", "india-gtm-strategy",
  "voice-of-customer", "competitive-intelligence", "market-intelligence",
  "full-time-equivalent", "market-share-gain", "thought-leadership",
  "syndicate-research-reports", "market-intelligence", "why-choose-us"
]);

const STATIC_PAGES = new Set([
  "about-us", "contact-us", "career", "testall", "bizchronicles",
  "become-our-reseller", "bizwit-insights"
]);

const LEGAL_PAGES = new Set([
  "privacy-policy", "terms-and-conditions", "cookie-policy",
  "disclaimer", "gdpr-policy", "refund-policy", "how-to-order", "sitemap"
]);

const LISTING_PREFIXES = new Set([
  "report-store", "reports", "blogs", "blog",
  "case-studies", "case-study", "megatrends", "megatrend",
  "press-release", "report_categories"
]);

const SERVICE_PAGE_DEFAULTS = {
  "market-share-gain": {
    title: "Market Share Gain Solutions - Data-Driven Strategy | Bizwit Research",
    description: "Win market share with data-driven strategy. Our market share gain solutions help businesses identify whitespace opportunities, analyze competition, and develop winning strategies.",
    keywords: "market share gain, competitive strategy, market analysis, growth strategy, market share solutions, whitespace opportunities, market benchmarking",
  },
  "full-time-equivalent": {
    title: "Full-Time Equivalent (FTE) Model - Dedicated Research Team | Bizwit Research",
    description: "Get dedicated research and consulting resources aligned with your business. Our FTE model provides on-demand, cost-efficient research teams for long-term success.",
    keywords: "FTE model, full-time equivalent, dedicated research team, outsourced research, consulting resources, extended team model",
  },
  "thought-leadership": {
    title: "Thought Leadership Demand Generation Services | Bizwit Research",
    description: "Turn thought leadership into qualified demand. Strategic content creation, buyer persona mapping, and B2B content-led demand generation services.",
    keywords: "thought leadership demand generation, B2B content marketing, lead generation, whitepapers, B2B demand generation, content strategy",
  },
  "market-intelligence": {
    title: "Market Intelligence & Analysis Services | Bizwit Research",
    description: "Gain clarity in a fast-moving world with unrivaled market intelligence. Expert market entry strategy, expansion planning, and demand forecasting services.",
    keywords: "market intelligence, market analysis, feasibility study, market entry strategy, market expansion, demand forecasting",
  },
  "competitive-intelligence": {
    title: "Competitive Intelligence & Strategic Analysis | Bizwit Research",
    description: "Accelerate impactful growth through bold, insight-led strategies. Our competitive intelligence services provide benchmarking, positioning, and go-to-market insights.",
    keywords: "competitive intelligence, strategic analysis, market benchmarking, competitive positioning, GTM strategy",
  },
  "esg-consulting": {
    title: "ESG Consulting & Sustainability | Bizwit Research",
    description: "Turn environmental responsibility into a competitive advantage with Bizwit Research. Expert ESG consulting, carbon footprint analysis, and environmental impact reporting services.",
    keywords: "ESG consulting, sustainability consulting, ESG strategy, carbon footprint analysis, environmental impact reporting, sustainability services",
  },
  "sustainability": {
    title: "ESG Consulting & Sustainability | Bizwit Research",
    description: "Turn environmental responsibility into a competitive advantage with Bizwit Research. Expert ESG consulting, carbon footprint analysis, and environmental impact reporting services.",
    keywords: "ESG consulting, sustainability consulting, ESG strategy, carbon footprint analysis, environmental impact reporting, sustainability services",
  },
  "india-gtm-strategy": {
    title: "India Market Entry Strategy - Enter India with Confidence | Bizwit Research",
    description: "Enter India with confidence powered by insight. Expert India market entry strategy, localized GTM playbook, and regional expansion planning services.",
    keywords: "India market entry, India business strategy, India GTM strategy, India market research, enter Indian market",
  },
  "voice-of-customer": {
    title: "Voice of Customer (VoC) - Customer Feedback Analysis | Bizwit Research",
    description: "Capture your customers' expectations, preferences, and feedback. Transform customer insights into strategies for growth, innovation, and satisfaction with our VoC services.",
    keywords: "voice of customer, VoC, customer feedback, customer insights, customer surveys, customer interviews, social listening",
  }
};

const NO_INDEX_ACTIONS = new Set(["download-sample", "inquiry", "buy-now", "request-customization", "talk-expert"]);

function detectPageType(segments) {
  const first = segments[0] || "";
  const second = segments[1] || "";
  const third = segments[2] || "";

  if (!first) return "homepage";

  // Action pages (noindex)
  if (NO_INDEX_ACTIONS.has(second) || NO_INDEX_ACTIONS.has(third)) return "action-page";

  // Listing vs detail
  if (first === "report-store" || first === "reports") {
    return second ? "report-detail" : "report-listing";
  }
  if (first === "blogs" || first === "blog") {
    return second ? "blog-detail" : "blog-listing";
  }
  if (first === "megatrends" || first === "megatrend") {
    return second ? "megatrend-detail" : "megatrend-listing";
  }
  if (first === "case-studies" || first === "case-study") {
    return second ? "casestudy-detail" : "casestudy-listing";
  }
  if (first === "press-release") {
    return second ? "press-release" : "static-page";
  }
  if (first === "faq") return "faq-page";
  if (SERVICE_PAGES.has(first)) return "service-page";
  if (STATIC_PAGES.has(first)) return "static-page";
  if (LEGAL_PAGES.has(first)) return "legal-page";

  // Fallback: universal detail (reports/megatrends at root slug)
  return "universal-detail";
}

// --- Content slug finder ---
async function findContentBySlug(slug) {
  if (!slug || typeof slug !== "string") return null;
  const variations = [slug, slug.replace(/-/g, " ")];

  let content = await Report.findOne({ slug: { $in: variations } });
  if (content) return { type: "report", data: content };

  content = await Blog.findOne({ slug: { $in: variations } });
  if (content) return { type: "blog", data: content };

  content = await Megatrend.findOne({ slug: { $in: variations } });
  if (content) return { type: "megatrend", data: content };

  content = await CaseStudy.findOne({ slug: { $in: variations } });
  if (content) return { type: "casestudy", data: content };

  content = await ServicePage.findOne({ slug: { $in: variations } });
  if (content) return { type: "servicepage", data: content };

  const searchPath = slug.startsWith("/") ? slug : `/${slug}`;
  content = await SEOPage.findOne({ $or: [{ url: slug }, { url: searchPath }] });
  if (content) return { type: "seopage", data: content };

  return null;
}

// --- SEO Page lookup ---
async function findSeoPage(normalizedPath, firstSegment) {
  const altPath = normalizedPath.replace(/^\//, "");
  const candidates = [normalizedPath, altPath, firstSegment].filter(Boolean);
  if (normalizedPath === "/") candidates.push("/home", "home");

  let seoPage = await SEOPage.findOne({
    $or: [
      { url: { $in: candidates } },
      ...(normalizedPath === "/" ? [{ pageName: { $in: ["Home Page", "Home"] } }] : [])
    ]
  });

  if (!seoPage) {
    const allActive = await SEOPage.find({ isActive: true }).select("url pageName").lean();
    const matched = allActive.find(p => {
      let u = String(p.url || "").trim().split("?")[0].split("#")[0].replace(/\/+$/, "");
      if (!u.startsWith("/")) u = `/${u}`;
      return u === normalizedPath;
    });
    if (matched) seoPage = await SEOPage.findById(matched._id);
  }

  return seoPage;
}

// --- Extract SEO data from various content types ---
function extractSeoFromContent(data, prefix, slug) {
  const formattedSlug = (data.slug || slug || "").toString().replace(/\s+/g, "-");
  const path = prefix ? `/${prefix}/${formattedSlug}` : `/${formattedSlug}`;
  return {
    title: data.titleMetaTag || data.metaTitle || data.titleTag || data.title || data.pageName || data.name || "",
    description: data.metaDescription || data.summary || data.description || data.reportDescription || "",
    keywords: data.keywords || (Array.isArray(data.metaKeywords) ? data.metaKeywords.join(", ") : data.metaKeywords) || "",
    canonical: data.canonical || data.canonicalUrl || `${SITE_URL}${path}`,
    image: toAbsoluteImageUrl(data.image || data.mainImage || data.heroImage?.url || data.coverImage?.url || data.featuredImage || data.ogImage || ""),
    ogTitle: data.ogTitle || data.titleMetaTag || data.metaTitle || data.titleTag || data.title || "",
    ogDescription: data.ogDescription || data.metaDescription || data.summary || data.reportDescription || "",
    robots: "index, follow",
    author: data.author || data.authorName || "",
    scripts: [], bodyScripts: []
  };
}

function extractSeoFromSeoPage(seoPage, searchPath) {
  return {
    title: seoPage.titleMetaTag || "",
    description: seoPage.metaDescription || "",
    keywords: seoPage.keywords || "",
    canonical: seoPage.canonicalUrl || seoPage.canonical || `${SITE_URL}${searchPath}`,
    robots: (seoPage.noIndex ? "noindex" : "index") + ", " + (seoPage.noFollow ? "nofollow" : "follow"),
    author: seoPage.author || "",
    scripts: seoPage.scripts || [],
    bodyScripts: seoPage.bodyScripts || [],
    ogTitle: seoPage.ogTitle || seoPage.titleMetaTag || "",
    ogDescription: seoPage.ogDescription || seoPage.metaDescription || "",
    image: toAbsoluteImageUrl(seoPage.ogImage || seoPage.featuredImage || "")
  };
}

// --- Main SSR Handler ---
export const ssrHandler = async (req, res, next) => {
  try {
    // Normalize path
    let requestPath = String(req.path || "/").trim().split("?")[0].split("#")[0].replace(/\\+/g, "/").replace(/\/+$/, "");
    if (!requestPath.startsWith("/")) requestPath = `/${requestPath}`;
    const normalizedPath = requestPath || "/";
    const cleanPath = normalizedPath.replace(/^\/+/, "").trim();

    const segments = cleanPath.split("/").filter(Boolean);
    const firstSegment = segments[0] || "";
    const pageType = detectPageType(segments);

    console.log(`🌐 SSR [${pageType}] ${normalizedPath}`);

    // Default SEO data
    let seoData = {
      title: "", description: "", canonical: "", robots: "", keywords: "",
      ogTitle: "", ogDescription: "", image: "", author: "",
      scripts: [], bodyScripts: []
    };
    let appHtml = "";
    let schemas = [organizationSchema()];

    // --- Fetch content and generate HTML based on page type ---

    if (pageType === "homepage") {
      // Fetch homepage data + trending reports + recent blogs + megatrends
      const [homeData, reports, blogs, megatrends] = await Promise.all([
        HomePage.findOne({ isActive: true }).lean().catch(() => null),
        Report.find({ status: "published", trendingReportForHomePage: true }).select("title slug category").limit(10).lean().catch(() => []),
        Blog.find({ status: "published" }).sort({ publishDate: -1 }).select("title slug authorName").limit(6).lean().catch(() => []),
        Megatrend.find({ status: "published", isHome: true }).select("title slug summary").limit(6).lean().catch(() => [])
      ]);

      const seoPage = await findSeoPage("/", "");
      if (seoPage) {
        seoData = extractSeoFromSeoPage(seoPage, "/");
      } else if (homeData?.seoData) {
        seoData.title = homeData.seoData.title || "Bizwit Research - Market Research & Business Intelligence";
        seoData.description = homeData.seoData.metaDescription || "";
        seoData.keywords = homeData.seoData.keywords || "";
        seoData.canonical = SITE_URL;
        seoData.robots = "index, follow";
      }

      appHtml = renderHomePage({ pageTitle: homeData?.pageTitle, seoData: homeData?.seoData, reports, blogs, megatrends });
      schemas.push(webSiteSchema(), localBusinessSchema(), webPageSchema({ title: seoData.title, description: seoData.description, url: "/", image: seoData.image }));

    } else if (pageType === "report-listing") {
      const [reports, seoPage] = await Promise.all([
        Report.find({ status: "published" }).sort({ createdAt: -1 }).select("title slug category summary").limit(50).lean().catch(() => []),
        findSeoPage("/report-store", "report-store")
      ]);
      if (seoPage) seoData = extractSeoFromSeoPage(seoPage, "/report-store");
      else { seoData.title = "Market Research Reports Store | Bizwit Research"; seoData.description = "Browse comprehensive market research reports."; seoData.canonical = `${SITE_URL}/report-store`; seoData.robots = "index, follow"; }

      appHtml = renderReportListing(reports);
      schemas.push(
        webPageSchema({ title: seoData.title, description: seoData.description, url: "/report-store" }),
        breadcrumbSchema([{ name: "Home", url: "/" }, { name: "Report Store", url: "/report-store" }])
      );
      if (reports.length) schemas.push(itemListSchema({ name: "Market Research Reports", url: "/report-store", items: reports.map(r => ({ title: r.title, slug: r.slug })) }));

    } else if (pageType === "report-detail") {
      const slug = segments[1];
      const report = await Report.findOne({ slug: { $in: [slug, slug.replace(/-/g, " ")] } }).lean();
      if (report) {
        // Canonical URL is /:slug — no /report-store/ prefix
        seoData = extractSeoFromContent(report, "", report.slug || slug);
        appHtml = renderReportDetail(report);
        schemas.push(
          productSchema({ title: report.title, description: report.metaDescription || report.summary, url: `/${report.slug}`, image: report.coverImage?.url, price: parseFloat(report.singleUserPrice) || report.price, currency: report.currency, category: report.category, reportCode: report.reportCode, numberOfPages: report.numberOfPages, datePublished: report.publishDate }),
          breadcrumbSchema([{ name: "Home", url: "/" }, { name: "Report Store", url: "/report-store" }, { name: report.title, url: `/${report.slug}` }])
        );
      } else {
        const seoPage = await findSeoPage(normalizedPath, firstSegment);
        if (seoPage) seoData = extractSeoFromSeoPage(seoPage, normalizedPath);
        else { seoData.title = "Report Not Found | Bizwit Research"; seoData.canonical = `${SITE_URL}${normalizedPath}`; }
        appHtml = renderStaticPage({ title: seoData.title || "Report Not Found", description: seoData.description });
      }

    } else if (pageType === "blog-listing") {
      const [blogs, seoPage] = await Promise.all([
        Blog.find({ status: "published" }).sort({ publishDate: -1 }).select("title slug authorName metaDescription content").limit(30).lean().catch(() => []),
        findSeoPage(`/${firstSegment}`, firstSegment)
      ]);
      if (seoPage) seoData = extractSeoFromSeoPage(seoPage, `/${firstSegment}`);
      else { seoData.title = "Blog — Industry Insights | Bizwit Research"; seoData.description = "Latest market trends and expert insights."; seoData.canonical = `${SITE_URL}/${firstSegment}`; seoData.robots = "index, follow"; }

      appHtml = renderBlogListing(blogs);
      schemas.push(
        webPageSchema({ title: seoData.title, description: seoData.description, url: `/${firstSegment}` }),
        breadcrumbSchema([{ name: "Home", url: "/" }, { name: "Blog", url: `/${firstSegment}` }])
      );
      if (blogs.length) schemas.push(itemListSchema({ name: "Blog Posts", url: `/${firstSegment}`, items: blogs.map(b => ({ title: b.title, slug: `blogs/${b.slug}` })) }));

    } else if (pageType === "blog-detail") {
      const slug = segments[1];
      const blog = await Blog.findOne({ slug: { $in: [slug, slug.replace(/-/g, " ")] } }).lean();
      if (blog) {
        seoData = extractSeoFromContent(blog, "blogs", slug);
        appHtml = renderBlogDetail(blog);
        schemas.push(
          articleSchema({ title: blog.title, description: blog.metaDescription, url: `/blogs/${blog.slug}`, image: blog.mainImage, author: blog.authorName, datePublished: blog.publishDate, dateModified: blog.updatedAt, content: blog.content }),
          breadcrumbSchema([{ name: "Home", url: "/" }, { name: "Blog", url: "/blogs" }, { name: blog.title, url: `/blogs/${blog.slug}` }])
        );
      } else {
        const seoPage = await findSeoPage(normalizedPath, firstSegment);
        if (seoPage) seoData = extractSeoFromSeoPage(seoPage, normalizedPath);
        else { seoData.title = "Blog Post Not Found | Bizwit Research"; seoData.canonical = `${SITE_URL}${normalizedPath}`; }
        appHtml = renderStaticPage({ title: seoData.title || "Blog Post Not Found", description: seoData.description });
      }

    } else if (pageType === "megatrend-listing") {
      const megatrends = await Megatrend.find({ status: "published" }).sort({ createdAt: -1 }).select("title slug summary").limit(30).lean().catch(() => []);
      const seoPage = await findSeoPage(`/${firstSegment}`, firstSegment);
      if (seoPage) seoData = extractSeoFromSeoPage(seoPage, `/${firstSegment}`);
      else { seoData.title = "Megatrends | Bizwit Research"; seoData.description = "Explore global megatrends shaping industries."; seoData.canonical = `${SITE_URL}/${firstSegment}`; seoData.robots = "index, follow"; }
      appHtml = renderMegatrendListing(megatrends);
      schemas.push(
        webPageSchema({ title: seoData.title, description: seoData.description, url: `/${firstSegment}` }),
        breadcrumbSchema([{ name: "Home", url: "/" }, { name: "Megatrends", url: `/${firstSegment}` }])
      );

    } else if (pageType === "megatrend-detail") {
      const slug = segments[1];
      const mt = await Megatrend.findOne({ slug: { $in: [slug, slug.replace(/-/g, " ")] } }).lean();
      if (mt) {
        seoData = extractSeoFromContent(mt, firstSegment, slug);
        appHtml = renderMegatrendDetail(mt);
        schemas.push(
          articleSchema({ title: mt.title, description: mt.metaDescription || mt.summary, url: `/${firstSegment}/${mt.slug}`, image: mt.heroImage?.url, author: mt.author, datePublished: mt.publishedAt, dateModified: mt.updatedAt, content: mt.content }),
          breadcrumbSchema([{ name: "Home", url: "/" }, { name: "Megatrends", url: `/${firstSegment}` }, { name: mt.title, url: `/${firstSegment}/${mt.slug}` }])
        );
      } else {
        const seoPage = await findSeoPage(normalizedPath, firstSegment);
        if (seoPage) seoData = extractSeoFromSeoPage(seoPage, normalizedPath);
        else { seoData.title = "Megatrend Not Found | Bizwit Research"; seoData.canonical = `${SITE_URL}${normalizedPath}`; }
        appHtml = renderStaticPage({ title: seoData.title || "Megatrend Not Found", description: seoData.description });
      }

    } else if (pageType === "casestudy-listing") {
      const cs = await CaseStudy.find({ status: "published" }).sort({ createdAt: -1 }).select("title slug category").limit(30).lean().catch(() => []);
      const seoPage = await findSeoPage(`/${firstSegment}`, firstSegment);
      if (seoPage) seoData = extractSeoFromSeoPage(seoPage, `/${firstSegment}`);
      else { seoData.title = "Case Studies | Bizwit Research"; seoData.description = "Real business impact case studies."; seoData.canonical = `${SITE_URL}/${firstSegment}`; seoData.robots = "index, follow"; }
      appHtml = renderCaseStudyListing(cs);
      schemas.push(
        webPageSchema({ title: seoData.title, description: seoData.description, url: `/${firstSegment}` }),
        breadcrumbSchema([{ name: "Home", url: "/" }, { name: "Case Studies", url: `/${firstSegment}` }])
      );

    } else if (pageType === "casestudy-detail") {
      const slug = segments[1];
      const cs = await CaseStudy.findOne({ slug: { $in: [slug, slug.replace(/-/g, " ")] } }).lean();
      if (cs) {
        seoData = extractSeoFromContent(cs, firstSegment, slug);
        appHtml = renderCaseStudyDetail(cs);
        schemas.push(
          articleSchema({ title: cs.title, description: cs.metaDescription, url: `/${firstSegment}/${cs.slug}`, image: cs.mainImage, datePublished: cs.createdAt, dateModified: cs.updatedAt, content: cs.content }),
          breadcrumbSchema([{ name: "Home", url: "/" }, { name: "Case Studies", url: `/${firstSegment}` }, { name: cs.title, url: `/${firstSegment}/${cs.slug}` }])
        );
      } else {
        const seoPage = await findSeoPage(normalizedPath, firstSegment);
        if (seoPage) seoData = extractSeoFromSeoPage(seoPage, normalizedPath);
        else { seoData.title = "Case Study Not Found | Bizwit Research"; seoData.canonical = `${SITE_URL}${normalizedPath}`; }
        appHtml = renderStaticPage({ title: seoData.title || "Case Study Not Found", description: seoData.description });
      }

    } else if (pageType === "service-page") {
      const servicePage = await ServicePage.findOne({ slug: firstSegment }).lean();
      const seoPage = await findSeoPage(normalizedPath, firstSegment);
      const defaultSeo = SERVICE_PAGE_DEFAULTS[firstSegment] || {};

      if (seoPage) {
        seoData = extractSeoFromSeoPage(seoPage, normalizedPath);
        if (!seoData.title) seoData.title = defaultSeo.title || `${firstSegment.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())} | Bizwit Research`;
        if (!seoData.description) seoData.description = defaultSeo.description || "";
        if (!seoData.keywords) seoData.keywords = defaultSeo.keywords || "";
      } else {
        seoData.title = servicePage?.titleTag || servicePage?.metaTitle || defaultSeo.title || `${firstSegment.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())} | Bizwit Research`;
        seoData.description = servicePage?.metaDescription || servicePage?.description || defaultSeo.description || "";
        seoData.keywords = servicePage?.keywords || defaultSeo.keywords || "";
        seoData.canonical = `${SITE_URL}${normalizedPath}`;
        seoData.robots = "index, follow";
        seoData.ogTitle = seoData.title;
        seoData.ogDescription = seoData.description;
      }

      appHtml = renderServicePageBySlug(firstSegment, servicePage, seoData);
      schemas.push(
        serviceSchema({ name: seoData.title, description: seoData.description, url: normalizedPath, image: seoData.image }),
        breadcrumbSchema([{ name: "Home", url: "/" }, { name: seoData.title, url: normalizedPath }])
      );

      // Add FAQ schema if service page has FAQs
      if (servicePage?.faqs && Array.isArray(servicePage.faqs) && servicePage.faqs.length > 0) {
        schemas.push(faqSchema(servicePage.faqs));
      }

    } else if (pageType === "faq-page") {
      const seoPage = await findSeoPage(normalizedPath, firstSegment);
      if (seoPage) seoData = extractSeoFromSeoPage(seoPage, normalizedPath);
      else { seoData.title = "FAQ | Bizwit Research"; seoData.canonical = `${SITE_URL}/faq`; seoData.robots = "index, follow"; }
      appHtml = renderStaticPage({ title: seoData.title, description: seoData.description });
      schemas.push(
        webPageSchema({ title: seoData.title, description: seoData.description, url: "/faq" }),
        breadcrumbSchema([{ name: "Home", url: "/" }, { name: "FAQ", url: "/faq" }])
      );

    } else if (pageType === "legal-page") {
      const seoPage = await findSeoPage(normalizedPath, firstSegment);
      if (seoPage) seoData = extractSeoFromSeoPage(seoPage, normalizedPath);
      else { seoData.title = `${firstSegment.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())} | Bizwit Research`; seoData.canonical = `${SITE_URL}${normalizedPath}`; }
      seoData.robots = "noindex, nofollow";
      appHtml = renderStaticPage({ title: seoData.title, description: seoData.description });

    } else if (pageType === "static-page") {
      const seoPage = await findSeoPage(normalizedPath, firstSegment);
      if (seoPage) seoData = extractSeoFromSeoPage(seoPage, normalizedPath);
      else { seoData.title = `${firstSegment.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())} | Bizwit Research`; seoData.canonical = `${SITE_URL}${normalizedPath}`; seoData.robots = "index, follow"; }
      
      if (firstSegment === "about-us") {
        appHtml = renderAboutUsPage(seoData);
      } else if (firstSegment === "contact-us") {
        appHtml = renderContactUsPage(seoData);
      } else if (firstSegment === "career") {
        appHtml = renderCareerPage(seoData);
      } else {
        appHtml = renderStaticPage({ title: seoData.title, description: seoData.description });
      }
      
      schemas.push(
        webPageSchema({ title: seoData.title, description: seoData.description, url: normalizedPath }),
        breadcrumbSchema([{ name: "Home", url: "/" }, { name: seoData.title, url: normalizedPath }])
      );

      // Add contact page schema for contact-us page
      if (firstSegment === "contact-us") {
        schemas.push(localBusinessSchema(), contactPageSchema());
      }

    } else if (pageType === "action-page") {
      seoData.robots = "noindex, nofollow";
      seoData.title = "Bizwit Research";
      seoData.canonical = `${SITE_URL}${normalizedPath}`;

    } else if (pageType === "press-release") {
      const slug = segments[1];
      const content = await findContentBySlug(slug);
      if (content) {
        seoData = extractSeoFromContent(content.data, "press-release", slug);
        appHtml = renderStaticPage({ title: seoData.title, description: seoData.description });
        schemas.push(articleSchema({ title: content.data.title, description: seoData.description, url: `/press-release/${slug}`, datePublished: content.data.publishDate || content.data.createdAt }));
      }

    } else {
      // universal-detail: try all collections
      const content = await findContentBySlug(firstSegment);
      if (content) {
        const { type, data } = content;
        seoData = extractSeoFromContent(data, "", firstSegment);

        if (type === "report") {
          appHtml = renderReportDetail(data);
          schemas.push(productSchema({ title: data.title, description: data.metaDescription || data.summary, url: `/${data.slug}`, image: data.coverImage?.url, price: parseFloat(data.singleUserPrice) || data.price, category: data.category, reportCode: data.reportCode }));
        } else if (type === "blog") {
          appHtml = renderBlogDetail(data);
          schemas.push(articleSchema({ title: data.title, description: data.metaDescription, url: `/${data.slug}`, image: data.mainImage, author: data.authorName, datePublished: data.publishDate }));
        } else if (type === "megatrend") {
          appHtml = renderMegatrendDetail(data);
          schemas.push(articleSchema({ title: data.title, description: data.metaDescription || data.summary, url: `/${data.slug}`, image: data.heroImage?.url }));
        } else if (type === "casestudy") {
          appHtml = renderCaseStudyDetail(data);
          schemas.push(articleSchema({ title: data.title, description: data.metaDescription, url: `/${data.slug}`, image: data.mainImage }));
        } else {
          appHtml = renderStaticPage({ title: seoData.title, description: seoData.description });
          schemas.push(webPageSchema({ title: seoData.title, description: seoData.description, url: normalizedPath }));
        }
        
        // Add breadcrumb schema for universal-detail
        schemas.push(breadcrumbSchema([{ name: "Home", url: "/" }, { name: data.title || seoData.title, url: normalizedPath }]));
      } else {
        // Final fallback: SEO page lookup
        const seoPage = await findSeoPage(normalizedPath, firstSegment);
        if (seoPage) seoData = extractSeoFromSeoPage(seoPage, normalizedPath);
        appHtml = renderStaticPage({ title: seoData.title, description: seoData.description });
      }
    }

    // --- Final overrides ---
    // Force noindex for action pages
    if (NO_INDEX_ACTIONS.has(segments[segments.length - 1])) {
      seoData.robots = "noindex, nofollow";
    }

    // --- Set cache headers ---
    setCacheHeaders(res, pageType);

    // Dynamic resolution of frontend dist path
    const frontendDistPath = getFrontendDistPath();
    const indexPath = path.join(frontendDistPath, "index.html");

    if (!fs.existsSync(indexPath)) {
      console.error(
        `SSR Error: frontend dist index.html not found at "${indexPath}". Have you built the frontend?`,
      );
      return res.status(500).send("Server Error: Frontend build not found.");
    }

    const { cssFiles, jsFiles, preloadJsFiles } = getExtractedAssets(indexPath);

    const schemaMarkup = generateSchemaScripts(schemas);

    const userAgent = req.headers["user-agent"] || "";
    const isBot = isBotRequest(userAgent);

    const html = seoTemplate({
      ...seoData,
      schemaMarkup,
      appHtml,
      cssFiles,
      jsFiles,
      preloadJsFiles,
      isBot,
    });

    res.send(html);
  } catch (error) {
    console.error("SSR Handler Error:", error);
    res.status(500).send("Internal Server Error");
  }
};
