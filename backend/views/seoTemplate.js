/**
 * SEO Template for Server-Side Rendering
 * Generates full HTML with SEO meta tags, JSON-LD schema, and pre-rendered content
 */

function seoTemplate({
  title,
  description,
  keywords,
  canonical,
  image,
  robots,
  ogTitle,
  ogDescription,
  ogImage,
  twitterTitle,
  twitterDescription,
  twitterImage,
  scripts,
  bodyScripts,
  appHtml,
  cssFiles,
  jsFiles,
  author,
  schemaMarkup,
  preconnects,
  publisher,
}) {
  const headScriptsRaw = Array.isArray(scripts) ? scripts.join("\n") : "";
  const bodyScriptsRaw = Array.isArray(bodyScripts) ? bodyScripts.join("\n") : "";

  const safeTitle = title || "Bizwit Research - Market Research & Business Intelligence";
  const safeDescription = description || "Leading provider of market research reports, industry analysis, and business intelligence solutions.";
  const safeImage = image || ogImage || "https://www.bizwitresearch.com/logo.png";
  const safeUrl = canonical || "https://www.bizwitresearch.com";
  const safeAuthor = author || "Bizwit Research";
  const safePublisher = publisher || "Bizwit Research & Consulting LLP";

  // Escape HTML entities in meta content to prevent XSS
  const escMeta = (str) => {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.png" />
    
    <!-- Critical Above-the-Fold Inline Styles (Eliminates FOUC) -->
    <style id="critical-css">
      *, ::before, ::after { box-sizing: border-box; margin: 0; padding: 0; }
      html { scroll-behavior: smooth; font-size: 16px; -webkit-font-smoothing: antialiased; }
      body { margin: 0; padding: 0; font-family: 'Work Sans', system-ui, -apple-system, sans-serif; line-height: 1.5; color: #1f2937; background-color: #ffffff; overflow-x: hidden; }
      #root { margin: 0; padding: 0; min-height: 100vh; }
      a { color: inherit; text-decoration: none; }
      img, video { max-width: 100%; height: auto; display: block; }
      .container { width: 100%; max-width: 1400px; margin: 0 auto; padding: 0 20px; }
    </style>

    <!-- Main Stylesheets (Placed BEFORE preconnects, meta tags, and scripts for immediate render-blocking priority) -->
    ${(cssFiles || [])
      .map((css) => `<link rel="preload" href="${css}" as="style">\n    <link rel="stylesheet" href="${css}">`)
      .join("\n    ")}

    <!-- DNS Prefetch & Preconnect for performance -->
    <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
    <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
    <link rel="dns-prefetch" href="https://api.bizwitresearch.com" />
    <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

    <!-- Primary Meta Tags -->
    <title>${escMeta(safeTitle)}</title>
    <meta name="description" content="${escMeta(safeDescription)}" />
    ${keywords ? `<meta name="keywords" content="${escMeta(keywords)}" />` : ""}
    ${robots ? `<meta name="robots" content="${escMeta(robots)}" />` : '<meta name="robots" content="index, follow" />'}
    ${safeUrl ? `<link rel="canonical" href="${escMeta(safeUrl)}" />` : ""}
    <meta name="author" content="${escMeta(safeAuthor)}" />
    <meta name="publisher" content="${escMeta(safePublisher)}" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Bizwit Research" />
    ${safeUrl ? `<meta property="og:url" content="${escMeta(safeUrl)}" />` : ""}
    <meta property="og:title" content="${escMeta(ogTitle || safeTitle)}" />
    <meta property="og:description" content="${escMeta(ogDescription || safeDescription)}" />
    ${safeImage ? `<meta property="og:image" content="${escMeta(safeImage)}" />` : ""}

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image" />
    ${safeUrl ? `<meta property="twitter:url" content="${escMeta(safeUrl)}" />` : ""}
    <meta property="twitter:title" content="${escMeta(twitterTitle || ogTitle || safeTitle)}" />
    <meta property="twitter:description" content="${escMeta(twitterDescription || ogDescription || safeDescription)}" />
    ${(twitterImage || safeImage) ? `<meta property="twitter:image" content="${escMeta(twitterImage || safeImage)}" />` : ""}

    <!-- Preload JS Modules -->
    ${(jsFiles || [])
      .map((js) => `<link rel="modulepreload" href="${js}">`)
      .join("\n    ")}

    <!-- JSON-LD Schema Markup -->
    ${schemaMarkup || ""}

    <!-- User Scripts -->
    ${headScriptsRaw}
    
  </head>
  <body>
    ${bodyScriptsRaw}
    <div id="root">${appHtml || ""}</div>
    <noscript>
      <p>This website requires JavaScript to run. Please enable JavaScript in your browser settings.</p>
    </noscript>
    
    <!-- Injected Scripts -->
    ${(jsFiles || [])
      .map((js) => `<script type="module" crossorigin src="${js}"></script>`)
      .join("\n    ")}
  </body>
</html>`;
}

export default seoTemplate;
