/**
 * JSON-LD Schema Markup Generator for SEO
 * Generates structured data for Google Rich Results
 */

const SITE_URL = 'https://www.bizwitresearch.com';
const LOGO_URL = `${SITE_URL}/logo.png`;
const ORG_NAME = 'Bizwit Research & Consulting LLP';
const API_ORIGIN = (process.env.PUBLIC_API_URL || process.env.API_BASE_URL || 'https://api.bizwitresearch.com').replace(/\/$/, '');

function stripHtml(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function toAbsoluteUrl(path) {
  if (!path) return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : '/' + path}`;
}

function toAbsoluteImageUrl(img) {
  if (!img || typeof img !== 'string') return LOGO_URL;
  if (/^https?:\/\//i.test(img)) return img;
  return `${API_ORIGIN}${img.startsWith('/') ? img : '/' + img}`;
}

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: ORG_NAME,
    url: SITE_URL,
    logo: { '@type': 'ImageObject', url: LOGO_URL },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email: 'sales@bizwitresearch.com',
      telephone: '+916267104147',
      availableLanguage: ['English']
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: '303, Atulya IT Park',
      addressLocality: 'Indore',
      addressRegion: 'Madhya Pradesh',
      postalCode: '452001',
      addressCountry: 'IN'
    }
  };
}

export function localBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: ORG_NAME,
    url: SITE_URL,
    logo: { '@type': 'ImageObject', url: LOGO_URL },
    image: LOGO_URL,
    telephone: '+916267104147',
    email: 'sales@bizwitresearch.com',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '303, Atulya IT Park',
      addressLocality: 'Indore',
      addressRegion: 'Madhya Pradesh',
      postalCode: '452001',
      addressCountry: 'IN'
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: '22.7196',
      longitude: '75.8577'
    },
    priceRange: '$$',
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '09:00',
      closes: '18:00'
    }
  };
}

export function webSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: ORG_NAME,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/report-store?search={search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    }
  };
}

export function webPageSchema({ title, description, url, image, dateModified }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: stripHtml(title),
    description: stripHtml(description),
    url: toAbsoluteUrl(url),
    image: toAbsoluteImageUrl(image),
    dateModified: dateModified || new Date().toISOString(),
    publisher: { '@type': 'Organization', name: ORG_NAME, logo: { '@type': 'ImageObject', url: LOGO_URL } }
  };
}

export function articleSchema({ title, description, url, image, author, datePublished, dateModified, content }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: stripHtml(title),
    description: stripHtml(description),
    url: toAbsoluteUrl(url),
    image: toAbsoluteImageUrl(image),
    datePublished: datePublished || new Date().toISOString(),
    dateModified: dateModified || datePublished || new Date().toISOString(),
    author: { '@type': 'Person', name: author || 'Bizwit Research' },
    publisher: { '@type': 'Organization', name: ORG_NAME, logo: { '@type': 'ImageObject', url: LOGO_URL } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': toAbsoluteUrl(url) }
  };
  if (content) {
    schema.wordCount = stripHtml(content).split(/\s+/).length;
  }
  return schema;
}

export function productSchema({ title, description, url, image, price, currency, category, reportCode, numberOfPages, datePublished }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: stripHtml(title),
    description: stripHtml(description),
    url: toAbsoluteUrl(url),
    image: toAbsoluteImageUrl(image),
    sku: reportCode || '',
    category: category || 'Market Research Report',
    brand: { '@type': 'Organization', name: ORG_NAME }
  };
  if (price && price > 0) {
    schema.offers = {
      '@type': 'Offer',
      price: price,
      priceCurrency: currency || 'USD',
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: ORG_NAME }
    };
  }
  if (numberOfPages) schema.numberOfPages = numberOfPages;
  if (datePublished) schema.datePublished = datePublished;
  return schema;
}

export function serviceSchema({ name, description, url, image }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: stripHtml(name),
    description: stripHtml(description),
    url: toAbsoluteUrl(url),
    image: toAbsoluteImageUrl(image),
    provider: { '@type': 'Organization', name: ORG_NAME, url: SITE_URL },
    areaServed: { '@type': 'Place', name: 'Worldwide' }
  };
}

export function faqSchema(questions) {
  if (!questions || !Array.isArray(questions) || questions.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(q => ({
      '@type': 'Question',
      name: stripHtml(q.question),
      acceptedAnswer: { '@type': 'Answer', text: stripHtml(q.answer) }
    }))
  };
}

export function breadcrumbSchema(items) {
  if (!items || !Array.isArray(items) || items.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: stripHtml(item.name),
      item: toAbsoluteUrl(item.url)
    }))
  };
}

export function itemListSchema({ name, url, items }) {
  if (!items || !Array.isArray(items) || items.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: stripHtml(name),
    url: toAbsoluteUrl(url),
    numberOfItems: items.length,
    itemListElement: items.slice(0, 50).map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: stripHtml(item.title || item.name),
      url: toAbsoluteUrl(item.url || `/${item.slug}`)
    }))
  };
}

export function contactPageSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: 'Contact Us - Bizwit Research',
    url: `${SITE_URL}/contact-us`,
    description: 'Get in touch with Bizwit Research for market research and business intelligence services',
    mainEntity: {
      '@type': 'Organization',
      name: ORG_NAME,
      url: SITE_URL,
      telephone: '+916267104147',
      email: 'sales@bizwitresearch.com',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '303, Atulya IT Park',
        addressLocality: 'Indore',
        addressRegion: 'Madhya Pradesh',
        postalCode: '452001',
        addressCountry: 'IN'
      }
    }
  };
}

/**
 * Generates all schema <script> tags as a single string
 */
export function generateSchemaScripts(schemas) {
  if (!schemas || !Array.isArray(schemas)) return '';
  return schemas
    .filter(Boolean)
    .map(schema => {
      try {
        return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
      } catch (e) {
        console.error('Schema serialization error:', e);
        return '';
      }
    })
    .join('\n    ');
}
