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
  renderStaticPage
} from "./contentRenderer.js";
import { setCacheHeaders } from "./cacheControl.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_ORIGIN = (process.env.PUBLIC_API_URL || process.env.API_BASE_URL || "https://api.bizwitresearch.com").replace(/\/$/, "");
const SITE_URL = "https://www.bizwitresearch.com";

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
  "syndicate-research-reports", "market-intelligence"
]);

const STATIC_PAGES = new Set([
  "about-us", "contact-us", "career", "testall", "bizchronicles",
  "become-our-reseller", "bizwit-insights", "why-choose-us"
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
      if (reports.length) schemas.push(itemListSchema({ name: "Market Research Reports", url: "/report-store", items: reports.map(r => ({ title: r.title, slug: `report-store/${r.slug}` })) }));

    } else if (pageType === "report-detail") {
      const slug = segments[1];
      const report = await Report.findOne({ slug: { $in: [slug, slug.replace(/-/g, " ")] } }).lean();
      if (report) {
        seoData = extractSeoFromContent(report, "report-store", slug);
        appHtml = renderReportDetail(report);
        schemas.push(
          productSchema({ title: report.title, description: report.metaDescription || report.summary, url: `/report-store/${report.slug}`, image: report.coverImage?.url, price: parseFloat(report.singleUserPrice) || report.price, currency: report.currency, category: report.category, reportCode: report.reportCode, numberOfPages: report.numberOfPages, datePublished: report.publishDate }),
          breadcrumbSchema([{ name: "Home", url: "/" }, { name: "Report Store", url: "/report-store" }, { name: report.title, url: `/report-store/${report.slug}` }])
        );
      } else {
        const seoPage = await findSeoPage(normalizedPath, firstSegment);
        if (seoPage) seoData = extractSeoFromSeoPage(seoPage, normalizedPath);
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
      }

    } else if (pageType === "service-page") {
      const servicePage = await ServicePage.findOne({ slug: firstSegment }).lean();
      const seoPage = await findSeoPage(normalizedPath, firstSegment);
      if (seoPage) seoData = extractSeoFromSeoPage(seoPage, normalizedPath);
      else { seoData.title = `${firstSegment.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())} | Bizwit Research`; seoData.canonical = `${SITE_URL}${normalizedPath}`; seoData.robots = "index, follow"; }
      appHtml = renderStaticPage({ title: seoData.title, description: seoData.description });
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
      appHtml = renderStaticPage({ title: seoData.title, description: seoData.description });
      schemas.push(
        webPageSchema({ title: seoData.title, description: seoData.description, url: normalizedPath }),
        breadcrumbSchema([{ name: "Home", url: "/" }, { name: seoData.title, url: normalizedPath }])
      );

      // Add contact page schema for contact-us page
      if (firstSegment === "contact-us") {
        schemas.push(localBusinessSchema(), contactPageSchema());
      }
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

   // Path to the client build's index.html
    // Prioritize environment variable for Production flexibility
    const localDist = path.resolve(__dirname, "../../../../bizwit_code-main/dist");
    const remoteDist = path.resolve(__dirname, "../../../../bizwit_code/dist");

    // Prioritize environment variable for Production flexibility
    const frontendDistPath = process.env.FRONTEND_DIST_PATH
      ? path.resolve(process.env.FRONTEND_DIST_PATH)
      : (fs.existsSync(remoteDist) ? remoteDist : localDist);
    console.log(frontendDistPath, 'frontendDistPath');

    const indexPath = path.join(frontendDistPath, "index.html");
    console.log(indexPath, 'indexPath');

    if (!fs.existsSync(indexPath)) {
      console.error(
        "SSR Error: frontend/dist/index.html not found. Have you built the frontend?",
      );
      return res.status(500).send("Server Error: Frontend build not found.");
    }

    const indexHtml = fs.readFileSync(indexPath, "utf-8");
    // Improved regex to find assets with flexible spacing and quotes
    const cssMatches = indexHtml.match(/href\s*=\s*["'](\/assets\/[^"']+\.css)["']/g) || [];
    const jsMatches = indexHtml.match(/src\s*=\s*["'](\/assets\/[^"']+\.js)["']/g) || [];
    
    const cssFiles = cssMatches.map(m => {
      const match = m.match(/href\s*=\s*["']([^"']+)["']/);
      return match ? match[1] : null;
    }).filter(Boolean);
    
    const jsFiles = jsMatches.map(m => {
      const match = m.match(/src\s*=\s*["']([^"']+)["']/);
      return match ? match[1] : null;
    }).filter(Boolean);

    const schemaMarkup = generateSchemaScripts(schemas);

    const html = seoTemplate({
      ...seoData,
      schemaMarkup,
      appHtml,
      cssFiles,
      jsFiles,
    });

    res.send(html);
  } catch (error) {
    console.error("SSR Handler Error:", error);
    res.status(500).send("Internal Server Error");
  }
};
