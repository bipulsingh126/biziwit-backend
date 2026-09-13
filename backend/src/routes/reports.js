import { Router } from 'express'
import sanitizeHtml from 'sanitize-html'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import XLSX from 'xlsx'
import slugify from 'slugify'
import Report from '../models/Report.js'
import Category from '../models/Category.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { JSDOM } from 'jsdom';
const router = Router()

const sanitizeOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'img', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'u', 's', 'strike']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    '*': ['style', 'class', 'width', 'height', 'align', 'valign', 'border', 'cellpadding', 'cellspacing'],
    'img': ['src', 'alt', 'width', 'height'],
    'a': ['href', 'target', 'name']
  },
  allowedStyles: {
    '*': {
      'color': [/.*/],
      'background-color': [/.*/],
      'font-size': [/.*/],
      'font-weight': [/.*/],
      'text-align': [/.*/],
      'font-family': [/.*/],
      'line-height': [/.*/],
      'margin': [/.*/],
      'padding': [/.*/],
      'padding-left': [/.*/],
      'list-style-type': [/.*/],
      'text-decoration': [/.*/]
    }
  }
};

// Enhanced helper function to format imported Excel data with better formatting preservation
function formatImportedContent(rawText, contentType = 'general') {
  if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') {
    return '';
  }

  let text = rawText.trim();

  // CHECK IF CONTENT IS ALREADY HTML
  // If it contains HTML tags like <p>, <div>, <table>, <ul>, <ol>, assume it's already formatted
  // and just sanitize it to be safe
  const hasHtmlTags = /<(p|div|table|ul|ol|h[1-6]|span|br|tr|td|th|thead|tbody)[^>]*>/i.test(text);

  if (hasHtmlTags) {
    return sanitizeHtml(text, sanitizeOptions);
  }

  // General cleanup - preserve line breaks and structure
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/\t/g, '    '); // Preserve tabs as spaces

  // Split by double line breaks to preserve paragraph structure
  const paragraphs = text.split(/\n\s*\n/);
  let html = '';

  paragraphs.forEach(paragraph => {
    if (!paragraph.trim()) return;

    const lines = paragraph.split('\n').filter(line => line.trim());
    let paragraphHtml = '';
    let inList = false;
    let listType = null; // 'bullet' or 'numbered'
    let listHtml = '';

    lines.forEach(line => {
      const trimmedLine = line.trim();

      // Detect bullet points with various bullet styles
      const bulletMatch = trimmedLine.match(/^[\s]*[-*•·▪▫◦‣⁃]\s+(.+)$/);
      if (bulletMatch) {
        if (!inList || listType !== 'bullet') {
          if (listHtml) paragraphHtml += listHtml;
          listHtml = '<ul style="margin: 12px 0; padding-left: 24px; list-style-type: disc;">\n';
          inList = true;
          listType = 'bullet';
        }
        const itemText = sanitizeHtml(bulletMatch[1], sanitizeOptions);
        listHtml += `  <li style="margin: 6px 0; color: #374151; line-height: 1.5;">${itemText}</li>\n`;
        return;
      }

      // Detect numbered lists
      const numberedMatch = trimmedLine.match(/^[\s]*(\d+)[\.\)\-–]\s+(.+)$/);
      if (numberedMatch) {
        if (!inList || listType !== 'numbered') {
          if (listHtml) paragraphHtml += listHtml;
          listHtml = '<ol style="margin: 12px 0; padding-left: 24px; list-style-type: decimal;">\n';
          inList = true;
          listType = 'numbered';
        }
        const itemText = sanitizeHtml(numberedMatch[2], sanitizeOptions);
        listHtml += `  <li style="margin: 6px 0; color: #374151; line-height: 1.5;">${itemText}</li>\n`;
        return;
      }

      // Close list if we encounter non-list content
      if (inList) {
        listHtml += listType === 'bullet' ? '</ul>\n' : '</ol>\n';
        paragraphHtml += listHtml;
        listHtml = '';
        inList = false;
        listType = null;
      }

      // Detect headings - lines that are all caps, end with colon, or are short and title-cased
      const isHeading = detectHeading(trimmedLine, contentType);
      if (isHeading) {
        const level = getHeadingLevel(trimmedLine, contentType);
        const headingText = sanitizeHtml(trimmedLine.replace(/:$/, ''), sanitizeOptions); // Remove trailing colon
        paragraphHtml += `<h${level} style="margin: 16px 0 10px 0; font-weight: 700; color: #1f2937; font-size: ${1.5 - (level * 0.15)}em; line-height: 1.4;">${headingText}</h${level}>\n`;
      } else {
        // Regular paragraph
        const paraText = sanitizeHtml(trimmedLine, sanitizeOptions);
        paragraphHtml += `<p style="margin: 8px 0; line-height: 1.6; color: #374151; text-align: left;">${paraText}</p>\n`;
      }
    });

    // Close any open list
    if (inList) {
      listHtml += listType === 'bullet' ? '</ul>\n' : '</ol>\n';
      paragraphHtml += listHtml;
    }

    if (paragraphHtml) {
      html += paragraphHtml;
    }
  });

  return html;
}


function formatReportOverview(rawText) {
  if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') {
    return '';
  }

  let text = rawText.trim();

  // CHECK IF CONTENT IS ALREADY HTML (e.g. from RichTextEditor)
  // If it contains HTML tags, assume it's already formatted and just sanitize it
  const hasHtmlTags = /<(p|div|table|ul|ol|h[1-6]|span|br|tr|td|th|thead|tbody)[^>]*>/i.test(text);

  if (hasHtmlTags) {
    // Just sanitize but preserve the structure
    return sanitizeHtml(text, sanitizeOptions);
  }

  // Fallback for plain text content (legacy or import)
  // Normalize line breaks
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/\t/g, '    ');

  // Split by double line breaks to preserve paragraph structure
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

  let html = '';
  let inList = false;
  let listType = null;
  let listHtml = '';

  paragraphs.forEach((para) => {
    const lines = para.split('\n').filter(line => line.trim());

    lines.forEach(line => {
      const trimmedLine = line.trim();

      // Detect bullet points in overview
      const bulletMatch = trimmedLine.match(/^[\s]*[-*•·▪▫◦‣⁃]\s+(.+)$/);
      if (bulletMatch) {
        if (!inList || listType !== 'bullet') {
          if (listHtml) html += listHtml;
          listHtml = '<ul style="margin: 12px 0; padding-left: 24px; list-style-type: disc;">\n';
          inList = true;
          listType = 'bullet';
        }
        const itemText = sanitizeHtml(bulletMatch[1], sanitizeOptions);
        listHtml += `  <li style="margin: 6px 0; color: #374151; line-height: 1.5;">${itemText}</li>\n`;
        return;
      }

      // Detect numbered lists in overview
      const numberedMatch = trimmedLine.match(/^[\s]*(\d+)[\.\)\-–]\s+(.+)$/);
      if (numberedMatch) {
        if (!inList || listType !== 'numbered') {
          if (listHtml) html += listHtml;
          listHtml = '<ol style="margin: 12px 0; padding-left: 24px; list-style-type: decimal;">\n';
          inList = true;
          listType = 'numbered';
        }
        const itemText = sanitizeHtml(numberedMatch[2], sanitizeOptions);
        listHtml += `  <li style="margin: 6px 0; color: #374151; line-height: 1.5;">${itemText}</li>\n`;
        return;
      }

      // Close list if we encounter non-list content
      if (inList) {
        listHtml += listType === 'bullet' ? '</ul>\n' : '</ol>\n';
        html += listHtml;
        listHtml = '';
        inList = false;
        listType = null;
      }

      // Detect headings in overview
      const isHeading = detectHeading(trimmedLine, 'reportOverview');
      if (isHeading) {
        const headingText = sanitizeHtml(trimmedLine.replace(/:$/, ''), sanitizeOptions);
        html += `<h3 style="margin: 14px 0 8px 0; font-weight: 700; color: #1f2937; font-size: 1.15em; line-height: 1.4;">${headingText}</h3>\n`;
      } else {
        // Regular paragraph
        const paraText = sanitizeHtml(trimmedLine, sanitizeOptions);
        html += `<p style="margin: 8px 0; line-height: 1.6; color: #374151; text-align: left;">${paraText}</p>\n`;
      }
    });
  });

  // Close any remaining list
  if (inList) {
    listHtml += listType === 'bullet' ? '</ul>\n' : '</ol>\n';
    html += listHtml;
  }

  return html;
}

// Helper function to detect if a line should be a heading
function detectHeading(line, contentType) {
  if (!line || line.trim().length === 0) return false;

  // Common heading patterns
  const headingPatterns = [
    /^(chapter|section|part)\s+\d+/i,
    /^\d+\.\d*\s+[A-Z]/,
    /^[A-Z][^.!?]*:$/,
    /^(executive summary|key findings|market analysis|recommendations|conclusion|introduction|overview|methodology|market overview|market size|growth drivers|challenges|opportunities|competitive landscape|future outlook|key takeaways)/i,
    /^(table of contents|toc)$/i,
    /^(market segment|target demographics|key characteristics|regional analysis|industry analysis|company profiles)$/i
  ]

  // Content-specific patterns
  if (contentType === 'tableOfContents') {
    return line.match(/^(chapter|section|part)\s+\d+/i) ||
      line.match(/^\d+\.\d*\s+[A-Z]/) ||
      (line.length < 80 && line.includes('.'))
  }

  if (contentType === 'segment') {
    return line.match(/^(market segment|target demographics|market size|key characteristics|opportunities|challenges|regional|industry)/i)
  }

  if (contentType === 'reportOverview') {
    return line.match(/^(overview|summary|introduction|key findings|market analysis|recommendations|conclusion|executive summary)/i) ||
      (line.length < 100 && line.endsWith(':')) ||
      (line.length < 60 && line === line.toUpperCase() && line.split(' ').length <= 8)
  }

  // General heading detection
  return headingPatterns.some(pattern => pattern.test(line)) ||
    (line.length < 100 && line.endsWith(':') && line.split(' ').length <= 10) ||
    (line.length < 60 && line === line.toUpperCase() && line.split(' ').length <= 8) ||
    (line.length < 80 && /^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/.test(line) && line.split(' ').length <= 6)
}

// Helper function to determine heading level
function getHeadingLevel(line, contentType) {
  if (line.match(/^chapter\s+\d+/i) || line.match(/^\d+\.\s+[A-Z]/)) return 2
  if (line.match(/^\d+\.\d+\s+[A-Z]/)) return 3
  if (line.match(/^\d+\.\d+\.\d+\s+[A-Z]/)) return 4
  return 3 // Default to h3
}

// Helper function to get container styling based on content type
function getContainerStyle(contentType) {
  const baseStyle = 'margin: 20px 0; padding: 15px; border-radius: 8px; background-color: #ffffff;'

  switch (contentType) {
    case 'reportOverview':
      return `${baseStyle} border-left: 4px solid #3b82f6; background-color: #f8fafc;`
    case 'tableOfContents':
      return `${baseStyle} border: 1px solid #e5e7eb; background-color: #f9fafb;`
    case 'segment':
      return `${baseStyle} border-left: 4px solid #10b981; background-color: #f0fdf4;`
    case 'companies':
      return `${baseStyle} border-left: 4px solid #f59e0b; background-color: #fffbeb;`
    default:
      return baseStyle
  }
}

// Helper function to format report overview content consistently

// Helper function to sync all existing reports with categories
async function syncReportsWithCategories() {
  try {
    console.log('🔄 Starting report-category synchronization with fuzzy matching...')

    // Normalize helper: lowercase, remove non-alphanumeric, remove "and", strip ampersands
    const normalize = (str) => {
      if (!str) return ''
      return str.toLowerCase()
        .replace(/&/g, '')
        .replace(/\band\b/g, '') // remove "and" only as a word
        .replace(/[^a-z0-9]/g, '')
        .trim()
    }

    // Get all categories with subcategories once to optimize
    const categories = await Category.find({})
    const normalizedCategories = categories.map(cat => ({
      doc: cat,
      normalizedName: normalize(cat.name),
      subcategories: cat.subcategories.map(sub => ({
        doc: sub,
        normalizedName: normalize(sub.name)
      }))
    }))

    // Get all NON-ARCHIVED reports with category/subcategory data
    const reports = await Report.find({
      status: { $ne: 'archived' },
      $or: [
        { category: { $exists: true, $ne: '' } },
        { subCategory: { $exists: true, $ne: '' } }
      ]
    })

    console.log(`📊 Found ${reports.length} non-archived reports with category data`)

    let categoriesUpdated = 0
    let subcategoriesUpdated = 0
    let reportsNormalized = 0

    for (const report of reports) {
      if (report.category && report.category.trim()) {
        const reportCategoryNormalized = normalize(report.category)

        // Find best matching category
        const bestCategory = normalizedCategories.find(cat =>
          cat.doc.name.toLowerCase() === report.category.trim().toLowerCase() ||
          cat.normalizedName === reportCategoryNormalized
        )

        if (bestCategory) {
          const categoryDoc = bestCategory.doc
          let reportUpdated = false

          // Normalize category name in report if it's different
          if (report.category !== categoryDoc.name) {
            console.log(`📏 Normalizing category name for report "${report.title}": "${report.category}" -> "${categoryDoc.name}"`)
            report.category = categoryDoc.name
            report.domain = categoryDoc.name
            report.reportCategories = categoryDoc.name
            reportUpdated = true
            reportsNormalized++
          }

          // Add report to category if not already present
          if (!categoryDoc.reports.includes(report._id)) {
            categoryDoc.reports.push(report._id)
            categoriesUpdated++
          }

          // Handle subcategory
          if (report.subCategory && report.subCategory.trim()) {
            const reportSubNormalized = normalize(report.subCategory)

            const bestSub = bestCategory.subcategories.find(sub =>
              sub.doc.name.toLowerCase() === report.subCategory.trim().toLowerCase() ||
              sub.normalizedName === reportSubNormalized
            )

            if (bestSub) {
              const subDoc = bestSub.doc
              // Normalize subcategory name in report
              if (report.subCategory !== subDoc.name) {
                console.log(`📏 Normalizing subcategory name for report "${report.title}": "${report.subCategory}" -> "${subDoc.name}"`)
                report.subCategory = subDoc.name
                report.subdomain = subDoc.name
                reportUpdated = true
              }

              if (!subDoc.reports.includes(report._id)) {
                subDoc.reports.push(report._id)
                subcategoriesUpdated++
              }
            }
          }

          // Save report if names were normalized
          if (reportUpdated) {
            await report.save()
          }
        }
      }
    }

    // After processing report links, we need to save each category to persist the new linked reports and update counts
    // (Note: in-place doc updates have happened in bestCategory.doc)
    for (const catEntry of normalizedCategories) {
      const cat = catEntry.doc

      // Update counts based on ACTUAL database counts for safety
      cat.reportCount = await Report.countDocuments({
        category: cat.name,
        status: { $ne: 'archived' }
      })

      for (const sub of cat.subcategories) {
        sub.reportCount = await Report.countDocuments({
          category: cat.name,
          subCategory: sub.name,
          status: { $ne: 'archived' }
        })
      }

      await cat.save()
    }

    console.log(`✅ Synchronization complete: ${categoriesUpdated} category links, ${subcategoriesUpdated} subcategory links, ${reportsNormalized} reports normalized`)
    return { categoriesUpdated, subcategoriesUpdated, reportsNormalized }
  } catch (error) {
    console.error('❌ Error syncing reports with categories:', error)
    throw error
  }
}

// Helper function to ensure category exists, create if not
async function ensureCategoryExists(categoryName) {
  if (!categoryName || typeof categoryName !== 'string' || categoryName.trim() === '') {
    return null
  }

  const cleanCategoryName = categoryName.trim()

  try {
    // Check if category already exists (case-insensitive)
    let category = await Category.findOne({
      name: { $regex: new RegExp(`^${cleanCategoryName}$`, 'i') }
    })

    if (!category) {
      // Create new category
      const slug = cleanCategoryName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

      // Ensure unique slug
      let uniqueSlug = slug
      let counter = 1
      while (await Category.findOne({ slug: uniqueSlug })) {
        uniqueSlug = `${slug}-${counter}`
        counter++
      }

      // Get the highest sort order
      const lastCategory = await Category.findOne().sort({ sortOrder: -1 })
      const sortOrder = lastCategory ? lastCategory.sortOrder + 1 : 0

      category = new Category({
        name: cleanCategoryName,
        slug: uniqueSlug || `category-${Date.now()}`,
        description: `Auto-created category from Excel import: ${cleanCategoryName}`,
        sortOrder,
        subcategories: []
      })

      await category.save()
      console.log(`✅ Auto-created category: "${cleanCategoryName}" with slug: "${uniqueSlug}"`)
      return { category, created: true }
    }

    return { category, created: false }
  } catch (error) {
    console.error(`❌ Error ensuring category "${cleanCategoryName}":`, error.message)
    return null
  }
}

// Helper function to ensure subcategory exists under category, create if not
async function ensureSubcategoryExists(categoryName, subcategoryName) {
  if (!categoryName || !subcategoryName ||
    typeof categoryName !== 'string' || typeof subcategoryName !== 'string' ||
    categoryName.trim() === '' || subcategoryName.trim() === '') {
    return null
  }

  const cleanCategoryName = categoryName.trim()
  const cleanSubcategoryName = subcategoryName.trim()

  try {
    // First ensure the parent category exists
    let categoryResult = await ensureCategoryExists(cleanCategoryName)

    if (!categoryResult) {
      console.error(`❌ Failed to create/find category "${cleanCategoryName}" for subcategory "${cleanSubcategoryName}"`)
      return null
    }

    let category = categoryResult.category
    let categoryWasCreated = categoryResult.created

    // Check if subcategory already exists (case-insensitive)
    const existingSubcategory = category.subcategories.find(sub =>
      sub.name.toLowerCase() === cleanSubcategoryName.toLowerCase()
    )

    if (!existingSubcategory) {
      // Create new subcategory
      const subSlug = cleanSubcategoryName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

      const newSubcategory = {
        name: cleanSubcategoryName,
        slug: subSlug || `subcategory-${Date.now()}`,
        description: `Auto-created subcategory from Excel import: ${cleanSubcategoryName}`,
        sortOrder: category.subcategories.length,
        isActive: true
      }

      category.subcategories.push(newSubcategory)
      await category.save()

      console.log(`✅ Auto-created subcategory: "${cleanSubcategoryName}" under category: "${cleanCategoryName}"`)
      return { category, categoryCreated: categoryWasCreated, subcategoryCreated: true }
    } else {
      return { category, categoryCreated: categoryWasCreated, subcategoryCreated: false }
    }
  } catch (error) {
    console.error(`❌ Error ensuring subcategory "${cleanSubcategoryName}" under "${cleanCategoryName}":`, error.message)
    return null
  }
}

// Storage configuration
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext)
    const timestamp = Date.now()
    const slug = slugify(base, { lower: true, strict: true })
    cb(null, `${slug}-${timestamp}${ext}`)
  }
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|xlsx|xls|csv|docx|doc/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (mimetype && extname) {
      return cb(null, true)
    } else {
      cb(new Error('Invalid file type'))
    }
  }
})

// Helper function to generate unique slugs
const generateUniqueSlug = async (title, existingSlug = null) => {
  if (!title) {
    throw new Error('Title is required for slug generation')
  }

  let baseSlug = slugify(existingSlug || title, { lower: true, strict: true })
  if (!baseSlug) {
    baseSlug = `report-${Date.now()}`
  }

  let slug = baseSlug
  let counter = 0

  while (true) {
    const existing = await Report.findOne({ slug }).lean()
    if (!existing) {
      return slug
    }
    counter++
    slug = `${baseSlug}-${counter}`
  }
}

// Middleware: Authentication required for all routes
// router.use(authenticate)
// router.use(requireRole('super_admin', 'admin', 'editor'))

// POST /api/reports/sync-categories - Sync existing reports with categories
router.post('/sync-categories', async (req, res, next) => {
  try {
    const result = await syncReportsWithCategories()

    res.json({
      success: true,
      message: 'Report-category synchronization completed successfully',
      stats: result
    })
  } catch (error) {
    console.error('Error in sync-categories endpoint:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to sync reports with categories',
      message: error.message
    })
  }
})

// GET /api/reports - List reports with filtering support
router.get('/', async (req, res, next) => {
  try {
    const {
      q = '',
      category = '',
      subCategory = '',
      status = '',
      author = '',
      limit = 5000,
      offset = 0,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query

    // Build query filter
    const filter = {}

    // Check if request is authenticated (has valid JWT token)
    const authHeader = req.headers.authorization
    const isAuthenticated = authHeader && authHeader.startsWith('Bearer ')

    // For unauthenticated requests (public frontend), only show published reports
    // For authenticated requests (admin panel), respect the status query parameter
    if (!isAuthenticated) {
      // Public request - only show published reports
      filter.status = 'published'
    } else if (status && status.trim()) {
      // Authenticated request with status filter
      filter.status = status.trim()
    }
    // If authenticated but no status specified, show all reports

    // Text search across multiple fields
    if (q && q.trim()) {
      const searchTerms = q.trim().split(/\s+/);
      const regexConditions = searchTerms.map(term => {
        const regex = new RegExp(term, 'i');
        return {
          $or: [
            { title: { $regex: regex } },
            { summary: { $regex: regex } },
            { reportDescription: { $regex: regex } },
            { author: { $regex: regex } },
            { reportCode: { $regex: regex } },
            { category: { $regex: regex } },
            { subCategory: { $regex: regex } }
          ]
        };
      });

      if (regexConditions.length > 0) {
        filter.$and = regexConditions;
      }
    }

    // Category filtering
    if (category && category.trim()) {
      filter.category = { $regex: new RegExp(`^${category.trim()}$`, 'i') }
    }

    // Subcategory filtering
    if (subCategory && subCategory.trim()) {
      filter.subCategory = { $regex: new RegExp(`^${subCategory.trim()}$`, 'i') }
    }

    // Author filtering
    if (author && author.trim()) {
      filter.author = { $regex: author.trim(), $options: 'i' }
    }

    // Trending on Home Page filter
    if (req.query.trendingReportForHomePage !== undefined) {
      filter.trendingReportForHomePage = req.query.trendingReportForHomePage === 'true'
    }

    // Get total count for pagination
    const total = await Report.countDocuments(filter)

    // Apply pagination with limit (default 1000 to show all reports)
    const limitNum = parseInt(limit) || 1000
    const offsetNum = parseInt(offset) || 0

    // Build sort object
    const sort = {}
    sort[sortBy] = order === 'asc' ? 1 : -1

    const reports = await Report.find(filter)
      .sort(sort)
      .skip(offsetNum)
      .limit(limitNum)
      .lean()

    res.json({
      success: true,
      items: reports,
      total,
      limit: limitNum,
      offset: offsetNum,
      hasMore: offsetNum + reports.length < total
    })
  } catch (error) {
    console.error('Error fetching reports:', error)
    next(error)
  }
})

// GET /api/reports/suggestions - Get search suggestions
router.get('/suggestions', async (req, res, next) => {
  try {
    const { q = '' } = req.query

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: []
      })
    }

    const searchRegex = new RegExp(q.trim(), 'i')
    const searchTerms = q.trim().split(/\s+/);
    const regexConditions = searchTerms.map(term => {
      const regex = new RegExp(term, 'i');
      return {
        $or: [
          { title: regex },
          { category: regex },
          { subCategory: regex }
        ]
      };
    });

    // Find reports matching title or category
    const reports = await Report.find({
      $and: [
        ...regexConditions,
        { status: 'published' }
      ]
    })
      .select('title category subCategory slug')
      .limit(10)
      .lean()

    const suggestions = reports.map(report => ({
      title: report.title,
      category: report.category,
      slug: report.slug,
      type: 'report'
    }))

    // Also find matching categories directly
    const categories = await (await import('../models/Category.js')).default.find({
      name: searchRegex,
      isActive: true
    }).limit(5).lean()

    const categorySuggestions = categories.map(cat => ({
      title: cat.name,
      type: 'category',
      slug: cat.slug
    }))

    res.json({
      success: true,
      suggestions: [...categorySuggestions, ...suggestions].slice(0, 10)
    })
  } catch (error) {
    console.error('Error fetching suggestions:', error)
    next(error)
  }
})

// GET /api/reports/subcategories/:categoryName - Get subcategories for a specific category
router.get('/subcategories/:categoryName', async (req, res, next) => {
  try {
    const { categoryName } = req.params

    if (!categoryName) {
      return res.status(400).json({
        success: false,
        error: 'Category name is required'
      })
    }

    // Import Category model
    const Category = (await import('../models/Category.js')).default

    // Find the category by name
    const category = await Category.findOne({
      name: { $regex: new RegExp(`^${categoryName}$`, 'i') },
      isActive: true
    }).lean()

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found',
        data: []
      })
    }

    // Return active subcategories
    const activeSubcategories = category.subcategories
      .filter(sub => sub.isActive !== false)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map(sub => ({
        _id: sub._id,
        name: sub.name,
        slug: sub.slug,
        description: sub.description
      }))

    res.json({
      success: true,
      data: activeSubcategories,
      total: activeSubcategories.length,
      category: {
        _id: category._id,
        name: category.name,
        slug: category.slug
      }
    })
  } catch (error) {
    console.error('Error fetching subcategories:', error)
    next(error)
  }
})

// POST /api/reports/ensure-subcategory - Ensure subcategory exists, create if not
router.post('/ensure-subcategory', async (req, res, next) => {
  try {
    const { categoryName, subcategoryName, subcategoryDescription = '' } = req.body

    if (!categoryName || !subcategoryName) {
      return res.status(400).json({
        success: false,
        error: 'Category name and subcategory name are required'
      })
    }

    // Import Category model
    const Category = (await import('../models/Category.js')).default

    // Find the category by name
    let category = await Category.findOne({
      name: { $regex: new RegExp(`^${categoryName.trim()}$`, 'i') }
    })

    if (!category) {
      // Create the category if it doesn't exist
      const slug = categoryName.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

      category = new Category({
        name: categoryName.trim(),
        slug: slug || `category-${Date.now()}`,
        description: `Auto-created category for ${categoryName}`,
        sortOrder: await Category.countDocuments(),
        subcategories: []
      })
    }

    // Check if subcategory already exists
    const existingSubcategory = category.subcategories.find(sub =>
      sub.name.toLowerCase() === subcategoryName.trim().toLowerCase()
    )

    if (!existingSubcategory) {
      // Create the subcategory
      const subSlug = subcategoryName.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

      category.subcategories.push({
        name: subcategoryName.trim(),
        slug: subSlug || `subcategory-${Date.now()}`,
        description: subcategoryDescription.trim() || `Auto-created subcategory for ${subcategoryName}`,
        sortOrder: category.subcategories.length,
        isActive: true
      })

      await category.save()

      console.log(`✅ Created subcategory "${subcategoryName}" under category "${categoryName}"`)
    }

    // Return the updated subcategories
    const activeSubcategories = category.subcategories
      .filter(sub => sub.isActive !== false)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map(sub => ({
        _id: sub._id,
        name: sub.name,
        slug: sub.slug,
        description: sub.description
      }))

    res.json({
      success: true,
      data: activeSubcategories,
      total: activeSubcategories.length,
      category: {
        _id: category._id,
        name: category.name,
        slug: category.slug
      },
      created: !existingSubcategory,
      message: existingSubcategory
        ? 'Subcategory already exists'
        : `Subcategory "${subcategoryName}" created successfully`
    })
  } catch (error) {
    console.error('Error ensuring subcategory:', error)
    next(error)
  }
})

// GET /api/reports - List reports with filtering and pagination
router.get('/', async (req, res, next) => {
  try {
    const {
      q = '',
      status,
      category,
      subCategory,
      featured,
      popular,
      from,
      to,
      sort = 'newest',
      limit = 50,
      offset = 0
    } = req.query

    // Build query object
    const query = {}

    if (status) {
      query.status = status
    }

    if (category) {
      query.category = category
    }

    if (subCategory) {
      query.subCategory = subCategory
    }

    if (featured !== undefined) {
      query.featured = featured === 'true'
    }

    if (popular !== undefined) {
      query.popular = popular === 'true'
    }

    // Trending on Home Page filter
    if (req.query.trendingReportForHomePage !== undefined) {
      query.trendingReportForHomePage = req.query.trendingReportForHomePage === 'true'
    }

    // Date range filter
    if (from || to) {
      query.createdAt = {}
      if (from) query.createdAt.$gte = new Date(from)
      if (to) query.createdAt.$lte = new Date(to)
    }

    // Text search
    let findCondition = query
    let projection = undefined

    if (q && q.trim()) {
      findCondition = {
        $and: [
          query,
          { $text: { $search: q.trim() } }
        ]
      }
      projection = { score: { $meta: 'textScore' } }
    }

    // Sorting
    let sortOption = { createdAt: -1 } // default: newest first

    switch (sort) {
      case 'oldest':
        sortOption = { createdAt: 1 }
        break
      case 'title':
        sortOption = { title: 1 }
        break
      case 'status':
        sortOption = { status: 1, createdAt: -1 }
        break
      case 'relevance':
        if (q && q.trim()) {
          sortOption = { score: { $meta: 'textScore' }, createdAt: -1 }
        }
        break
      default:
        sortOption = { createdAt: -1 }
    }

    // Execute query with pagination
    const offsetNum = parseInt(offset) || 0
    const limitNum = parseInt(limit) || 10

    const [items, total] = await Promise.all([
      Report.find(findCondition, projection)
        .sort(sortOption)
        .skip(offsetNum)
        .limit(limitNum)
        .lean(),
      Report.countDocuments(findCondition)
    ])

    res.json({
      items,
      total,
      limit: limitNum,
      offset: offsetNum,
      hasMore: offsetNum + items.length < total
    })
  } catch (error) {
    console.error('Error fetching reports:', error)
    next(error)
  }
})

// POST /api/reports - Create new report
router.post('/', async (req, res, next) => {
  try {
    const {
      title,
      subTitle,
      summary,
      content,
      category,
      subCategory,
      excelDataPackLicense,
      singleUserLicense,
      enterpriseLicensePrice,
      status = 'draft',
      featured = false,
      popular = false,
      ...otherFields
    } = req.body

    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Title is required'
      })
    }

    // Clean and prepare data
    const reportData = {
      title: title.trim(),
      subTitle: subTitle?.trim() || '',
      // Let the model generate the slug automatically
      summary: summary?.trim() || '',
      content: content || '',
      category: category?.trim() || '',
      subCategory: subCategory?.trim() || '',
      excelDataPackLicense: excelDataPackLicense?.trim() || '',
      singleUserLicense: singleUserLicense?.trim() || '',
      enterpriseLicensePrice: enterpriseLicensePrice?.trim() || '',
      status,
      featured: Boolean(featured),
      popular: Boolean(popular),
      tags: [], // Initialize as empty array
      author: otherFields.author?.trim() || req.user?.name || 'System'
    }

    // Add other valid fields
    const allowedFields = [
      'slug', 'titleTag', 'url', 'metaDescription', 'keywords',
      'metaTitle', 'metaKeywords',
      'ogTitle', 'ogDescription', 'ogImage',
      'twitterTitle', 'twitterDescription', 'twitterImage',
      'language', 'region', 'subRegions', 'industry', 'reportType',
      'pages', 'format', 'price', 'currency',
      // Report content fields
      'reportDescription', 'segment', 'companies', 'reportCategories',
      'tableOfContents', 'segmentationContent',
      // Report details
      'author', 'publishDate', 'reportCode', 'numberOfPages',
      // Pricing fields
      'excelDatapackPrice', 'singleUserPrice', 'enterprisePrice', 'internetHandlingCharges',
      'enterpriseLicensePrice',
      // Status and flags
      'trendingReportForHomePage'
    ]

    allowedFields.forEach(field => {
      if (otherFields[field] !== undefined) {
        // Apply consistent formatting to reportDescription
        if (field === 'reportDescription' && otherFields[field]) {
          reportData[field] = formatReportOverview(otherFields[field])
        } else {
          reportData[field] = otherFields[field]
        }
      }
    })

    console.log('Creating report with data:', JSON.stringify(reportData, null, 2))

    // Ensure slug is provided if not generated by model
    if (!reportData.slug && reportData.title) {
      reportData.slug = reportData.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    }

    // Create the report
    const report = await Report.create(reportData)

    console.log('Report created successfully:', report._id)

    res.status(201).json({
      success: true,
      data: report,
      message: 'Report created successfully'
    })
  } catch (error) {
    console.error('Error creating report:', error)

    if (error.name === 'ValidationError') {
      const details = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      }))

      console.log('Validation errors:', details)

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your input data and try again',
        details
      })
    }

    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Duplicate Error',
        message: 'A report with this slug already exists'
      })
    }

    next(error)
  }
})

// GET /api/reports/by-slug/:slug - Get single report by slug
router.get('/by-slug/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params
    console.log(`🔍 Fetching report for slug: "${slug}"`);

    // 1. Exact match
    let report = await Report.findOne({ slug }).lean()

    // 2. Case-insensitive match (if exact failed)
    if (!report) {
      report = await Report.findOne({ slug: { $regex: new RegExp(`^${slug}$`, 'i') } }).lean();
      if (report) console.log(`✅ Found report via case-insensitive slug: "${report.slug}"`);
    }

    // 3. Fallback: If not found and slug has hyphens, try replacing hyphens with spaces (legacy format)
    if (!report && slug.includes('-')) {
      const fallbackSlug = slug.replace(/-/g, ' ');
      // Try exact fallback
      report = await Report.findOne({ slug: fallbackSlug }).lean();
      if (report) {
        console.log(`✅ Recovered report via legacy-space slug (exact): "${fallbackSlug}"`);
      } else {
        // Try case-insensitive fallback
        report = await Report.findOne({ slug: { $regex: new RegExp(`^${fallbackSlug}$`, 'i') } }).lean();
        if (report) console.log(`✅ Recovered report via legacy-space slug (case-insensitive): "${report.slug}"`);
      }
    }

    if (!report) {
      console.log(`❌ Report NOT found for slug: "${slug}" (checked strict, case-insensitive, and legacy formats)`);
      return res.status(404).json({
        error: 'Not Found',
        message: 'Report not found'
      })
    }

    res.json({
      success: true,
      data: report
    })
  } catch (error) {
    console.error('Error fetching report by slug:', error)
    next(error)
  }
})


// GET /api/reports/export - Export reports to Excel/CSV
router.get('/export', async (req, res, next) => {
  try {
    const { format = 'csv' } = req.query

    // Get ALL reports from database (no pagination limit)
    const reports = await Report.find({}).lean()

    console.log(`Exporting ${reports.length} reports in ${format} format`)

    // Helper function to truncate text to Excel's limit (32,767 characters)
    const truncateText = (text, maxLength = 32000) => {
      if (!text) return ''
      const str = String(text)
      if (str.length <= maxLength) return str
      return str.substring(0, maxLength) + '... [TRUNCATED]'
    }

    // Helper function to strip HTML tags for cleaner export
    const stripHtml = (html) => {
      if (!html) return ''
      return String(html)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    if (format === 'excel') {
      // Create Excel workbook
      const workbook = XLSX.utils.book_new()

      // Prepare data for Excel with truncation
      const excelData = reports.map(report => ({
        'Report Title': truncateText(report.title, 1000),
        'Title Meta Tag': truncateText(report.subTitle, 1000),
        'REPORT OVERVIEW': truncateText(stripHtml(report.reportDescription || report.summary), 32000),
        'Table of Contents': truncateText(stripHtml(report.tableOfContents), 32000),
        'Category': truncateText(report.category || report.domain || report.industry, 255),
        'Sub Category': truncateText(report.subCategory || report.subdomain || report.reportType, 255),
        'SEGMENT / COMPANIES': truncateText(stripHtml(report.segmentCompanies || report.segment), 32000),
        'Region': truncateText(report.region, 255),
        'Sub Regions': truncateText(report.subRegions, 500),
        'Author Name': truncateText(report.author, 255),
        'Report Code': truncateText(report.reportCode, 100),
        'Number of Page': report.numberOfPages || '',
        'Price': report.price || '',
        'Excel Datapack Prices': report.excelDatapackPrice || '',
        'Single User Prices': report.singleUserPrice || '',
        'Enterprise License Prices': report.enterprisePrice || '',
        'Internet Handling Charges': report.internetHandlingCharges || '',
        'Currency': truncateText(report.currency, 10),
        'Format': truncateText(report.format, 50),
        'Language': truncateText(report.language, 50),
        'Industry': truncateText(report.industry, 255),
        'Report Type': truncateText(report.reportType, 100),
        'Status': report.status,
        'Featured': report.featured ? 'Yes' : 'No',
        'Popular': report.popular ? 'Yes' : 'No',
        'Publish Date': report.publishDate ? new Date(report.publishDate).toLocaleDateString() : '',
        'Last Updated': report.lastUpdated ? new Date(report.lastUpdated).toLocaleDateString() : new Date(report.updatedAt).toLocaleDateString(),
        'Excel Data Pack License': truncateText(report.excelDataPackLicense, 500),
        'Single User License': truncateText(report.singleUserLicense, 500),
        'Enterprise License Price': report.enterpriseLicensePrice || '',
        // SEO Fields
        'Title Tag': truncateText(report.titleTag, 500),
        'URL Slug': truncateText(report.slug || report.url, 500),
        'Meta Description': truncateText(report.metaDescription, 1000),
        'Keywords': truncateText(report.keywords, 1000)
      }))

      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData)

      // Add styling to the worksheet
      const range = XLSX.utils.decode_range(worksheet['!ref'])

      // Style header row (row 0)
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
        if (!worksheet[cellAddress]) continue

        worksheet[cellAddress].s = {
          fill: { fgColor: { rgb: "4F46E5" } }, // Blue background
          font: { color: { rgb: "FFFFFF" }, bold: true, sz: 12 }, // White, bold text
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } }
          }
        }
      }

      // Style data rows with alternating colors
      for (let row = 1; row <= range.e.r; row++) {
        const isEvenRow = row % 2 === 0
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
          if (!worksheet[cellAddress]) continue

          worksheet[cellAddress].s = {
            fill: { fgColor: { rgb: isEvenRow ? "F8FAFC" : "FFFFFF" } }, // Alternating row colors
            font: { color: { rgb: "1F2937" }, sz: 10 }, // Dark gray text
            alignment: { horizontal: "left", vertical: "center", wrapText: true },
            border: {
              top: { style: "thin", color: { rgb: "E5E7EB" } },
              bottom: { style: "thin", color: { rgb: "E5E7EB" } },
              left: { style: "thin", color: { rgb: "E5E7EB" } },
              right: { style: "thin", color: { rgb: "E5E7EB" } }
            }
          }
        }
      }

      // Set column widths for better readability
      const columnWidths = [
        { wch: 50 }, // Report Title
        { wch: 30 }, // Title Meta Tag
        { wch: 40 }, // Report Overview
        { wch: 30 }, // Table of Contents
        { wch: 20 }, // Category
        { wch: 25 }, // Sub Category
        { wch: 30 }, // Segmentation
        { wch: 15 }, // Region
        { wch: 20 }, // Author Name
        { wch: 15 }, // Report Code
        { wch: 12 }, // Number of Page
        { wch: 12 }, // Price
        { wch: 15 }, // Excel Datapack Prices
        { wch: 15 }, // Single User Prices
        { wch: 18 }, // Enterprise License Prices
        { wch: 18 }, // Internet Handling Charges
        { wch: 10 }, // Currency
        { wch: 10 }, // Format
        { wch: 12 }, // Language
        { wch: 20 }, // Industry
        { wch: 15 }, // Report Type
        { wch: 10 }, // Status
        { wch: 8 },  // Featured
        { wch: 8 },  // Popular
        { wch: 15 }, // Publish Date
        { wch: 15 }, // Last Updated
        { wch: 20 }, // Excel Data Pack License
        { wch: 20 }, // Single User License
        { wch: 20 }, // Enterprise License Price
        { wch: 30 }, // Title Tag
        { wch: 25 }, // URL Slug
        { wch: 40 }, // Meta Description
        { wch: 30 }  // Keywords
      ]
      worksheet['!cols'] = columnWidths

      // Set row heights
      worksheet['!rows'] = [{ hpt: 25 }] // Header row height

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Reports')

      // Generate Excel buffer with styling support
      const excelBuffer = XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
        cellStyles: true
      })

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename=reports_export_${new Date().toISOString().split('T')[0]}.xlsx`)
      res.send(excelBuffer)
    } else {
      // CSV format with truncation
      const csvHeaders = ['Report Title', 'Title Meta Tag', 'REPORT OVERVIEW', 'Table of Contents', 'Category', 'Sub Category', 'SEGMENT / COMPANIES', 'Region', 'Sub Regions', 'Author Name', 'Report Code', 'Number of Page', 'Price', 'Excel Datapack Prices', 'Single User Prices', 'Enterprise License Prices', 'Internet Handling Charges', 'Currency', 'Status', 'Publish Date', 'Last Updated', 'Title Tag', 'URL Slug', 'Meta Description', 'Keywords']
      const csvRows = reports.map(report => [
        `"${truncateText(report.title, 1000).replace(/"/g, '""')}"`,
        `"${truncateText(report.subTitle, 1000).replace(/"/g, '""')}"`,
        `"${truncateText(stripHtml(report.reportDescription || report.summary), 32000).replace(/"/g, '""')}"`,
        `"${truncateText(stripHtml(report.tableOfContents), 32000).replace(/"/g, '""')}"`,
        `"${truncateText(report.category || report.domain || report.industry, 255).replace(/"/g, '""')}"`,
        `"${truncateText(report.subCategory || report.subdomain || report.reportType, 255).replace(/"/g, '""')}"`,
        `"${truncateText(stripHtml(report.segmentCompanies || report.segment), 32000).replace(/"/g, '""')}"`,
        `"${truncateText(report.region, 255).replace(/"/g, '""')}"`,
        `"${truncateText(report.subRegions, 500).replace(/"/g, '""')}"`,
        `"${truncateText(report.author, 255).replace(/"/g, '""')}"`,
        `"${truncateText(report.reportCode, 100).replace(/"/g, '""')}"`,
        `"${report.numberOfPages || ''}"`,
        `"${report.price || ''}"`,
        `"${report.excelDatapackPrice || ''}"`,
        `"${report.singleUserPrice || ''}"`,
        `"${report.enterprisePrice || ''}"`,
        `"${report.internetHandlingCharges || ''}"`,
        `"${truncateText(report.currency, 10).replace(/"/g, '""')}"`,
        `"${report.status || ''}"`,
        `"${report.publishDate ? new Date(report.publishDate).toLocaleDateString() : ''}"`,
        `"${report.lastUpdated ? new Date(report.lastUpdated).toLocaleDateString() : new Date(report.updatedAt).toLocaleDateString()}"`,
        `"${truncateText(report.titleTag, 500).replace(/"/g, '""')}"`,
        `"${truncateText(report.slug || report.url, 500).replace(/"/g, '""')}"`,
        `"${truncateText(report.metaDescription, 1000).replace(/"/g, '""')}"`,
        `"${truncateText(report.keywords, 1000).replace(/"/g, '""')}"`
      ])

      const csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n')

      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename=reports_export_${new Date().toISOString().split('T')[0]}.csv`)
      res.send(csvContent)
    }
  } catch (error) {
    console.error('Error exporting reports:', error)
    next(error)
  }
})

// GET /api/reports/:id - Get single report
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params

    let report = null

    // First try to find by MongoDB ObjectId if it matches the pattern
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      report = await Report.findById(id).lean()
    }

    // If not found by ID, try to find by slug
    if (!report) {
      report = await Report.findOne({ slug: id }).lean()
    }

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      })
    }

    // Debug logging for slug field issue
    console.log('🔍 GET Report Debug:', {
      reportId: report._id,
      title: report.title,
      slug: report.slug,
      url: report.url,
      hasSlug: !!report.slug,
      slugType: typeof report.slug
    })

    res.json({
      success: true,
      data: report
    })
  } catch (error) {
    console.error('Error fetching report:', error)

    next(error)
  }
})

// PATCH /api/reports/by-slug/:slug - Update report by slug
router.patch('/by-slug/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params
    const updateData = { ...req.body }

    // Remove fields that shouldn't be updated directly
    delete updateData._id
    delete updateData.createdAt
    delete updateData.updatedAt
    delete updateData.__v

    // Let the model handle slug generation automatically when title changes

    // Apply consistent formatting to reportDescription if being updated
    if (updateData.reportDescription) {
      updateData.reportDescription = formatReportOverview(updateData.reportDescription)
    }

    // Update lastUpdated
    updateData.lastUpdated = new Date()

    const updatedReport = await Report.findOneAndUpdate(
      { slug },
      updateData,
      { new: true, runValidators: true }
    )

    if (!updatedReport) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Report not found'
      })
    }

    res.json({
      success: true,
      data: updatedReport,
      message: 'Report updated successfully'
    })
  } catch (error) {
    console.error('Error updating report by slug:', error)

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.message,
        details: error.errors
      })
    }

    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Duplicate Error',
        message: 'A report with this slug already exists'
      })
    }

    next(error)
  }
})

// PATCH /api/reports/:id - Update report (legacy support)
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const updateData = { ...req.body }

    // Remove fields that shouldn't be updated directly
    delete updateData._id
    delete updateData.createdAt
    delete updateData.updatedAt
    delete updateData.__v

    // Try to find by slug first, then by ID for backward compatibility
    let currentReport = await Report.findOne({ slug: id }).lean()

    if (!currentReport && id.match(/^[0-9a-fA-F]{24}$/)) {
      currentReport = await Report.findById(id).lean()
    }

    if (!currentReport) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Report not found'
      })
    }

    // Let the model handle slug generation automatically when title changes

    // Apply consistent formatting to reportDescription if being updated
    if (updateData.reportDescription) {
      updateData.reportDescription = formatReportOverview(updateData.reportDescription)
    }

    // Update lastUpdated
    updateData.lastUpdated = new Date()

    let updatedReport
    if (currentReport.slug === id) {
      // Update by slug
      updatedReport = await Report.findOneAndUpdate(
        { slug: id },
        updateData,
        { new: true, runValidators: true }
      )
    } else {
      // Update by ID
      updatedReport = await Report.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      )
    }

    if (!updatedReport) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Report not found'
      })
    }

    res.json({
      success: true,
      data: updatedReport,
      message: 'Report updated successfully'
    })
  } catch (error) {
    console.error('Error updating report:', error)

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid data provided',
        details: Object.keys(error.errors).map(key => ({
          field: key,
          message: error.errors[key].message
        }))
      })
    }

    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'Invalid report ID format'
      })
    }

    next(error)
  }
})

// DELETE /api/reports/by-slug/:slug - Delete report by slug
router.delete('/by-slug/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params

    const deletedReport = await Report.findOneAndDelete({ slug })

    if (!deletedReport) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Report not found'
      })
    }

    res.json({
      success: true,
      message: 'Report deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting report by slug:', error)
    next(error)
  }
})

// DELETE /api/reports/:id - Delete report (legacy support)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params

    // Try to find by slug first, then by ID for backward compatibility
    let deletedReport = await Report.findOneAndDelete({ slug: id })

    if (!deletedReport && id.match(/^[0-9a-fA-F]{24}$/)) {
      // If it looks like a MongoDB ObjectId, try deleting by ID
      deletedReport = await Report.findByIdAndDelete(id)
    }

    if (!deletedReport) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Report not found'
      })
    }

    res.json({
      success: true,
      message: 'Report deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting report:', error)

    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'Invalid report ID format'
      })
    }

    next(error)
  }
})

// POST /api/reports/by-slug/:slug/cover - Upload cover image by slug
router.post('/by-slug/:slug/cover', upload.single('file'), async (req, res, next) => {
  try {
    const { slug } = req.params

    if (!req.file) {
      return res.status(400).json({
        error: 'No File',
        message: 'No file uploaded'
      })
    }

    const fileUrl = `/uploads/${path.basename(req.file.path)}`
    const altText = req.body.alt || ''

    const updatedReport = await Report.findOneAndUpdate(
      { slug },
      {
        coverImage: {
          url: fileUrl,
          alt: altText
        }
      },
      { new: true }
    )

    if (!updatedReport) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Report not found'
      })
    }

    res.json({
      success: true,
      data: {
        coverImage: updatedReport.coverImage,
        message: 'Cover image uploaded successfully'
      }
    })
  } catch (error) {
    console.error('Error uploading cover image by slug:', error)
    next(error)
  }
})

// POST /api/reports/:id/cover - Upload cover image (legacy support)
router.post('/:id/cover', upload.single('file'), async (req, res, next) => {
  try {
    const { id } = req.params

    if (!req.file) {
      return res.status(400).json({
        error: 'No File',
        message: 'No file uploaded'
      })
    }

    const fileUrl = `/uploads/${path.basename(req.file.path)}`
    const altText = req.body.alt || ''

    // Try to find by slug first, then by ID for backward compatibility
    let updatedReport = await Report.findOneAndUpdate(
      { slug: id },
      {
        coverImage: {
          url: fileUrl,
          alt: altText
        }
      },
      { new: true }
    )

    if (!updatedReport && id.match(/^[0-9a-fA-F]{24}$/)) {
      // If it looks like a MongoDB ObjectId, try updating by ID
      updatedReport = await Report.findByIdAndUpdate(
        id,
        {
          coverImage: {
            url: fileUrl,
            alt: altText
          }
        },
        { new: true }
      )
    }

    if (!updatedReport) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Report not found'
      })
    }

    res.json({
      success: true,
      data: updatedReport,
      message: 'Cover image uploaded successfully'
    })
  } catch (error) {
    console.error('Error uploading cover image:', error)
    next(error)
  }
})

// POST /api/reports/upload-image - Generic image upload for rich text editors
router.post('/upload-image', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No File',
        message: 'No file uploaded'
      })
    }

    const fileUrl = `/uploads/${path.basename(req.file.path)}`

    res.json({
      success: true,
      url: fileUrl,
      message: 'Image uploaded successfully'
    })
  } catch (error) {
    console.error('Error uploading image:', error)
    next(error)
  }
})



// POST /api/reports/migrate-search-titles - Populate searchTitle for existing reports
router.post('/migrate-search-titles', authenticate, requireRole('super_admin', 'admin'), async (req, res, next) => {
  try {
    console.log('🚀 Starting searchTitle migration...');
    const reportsToUpdate = await Report.find({ searchTitle: { $exists: false } });

    let updatedCount = 0;
    let errorCount = 0;

    for (const report of reportsToUpdate) {
      try {
        report.searchTitle = report.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        await report.save();
        updatedCount++;
      } catch (e) {
        console.error(`❌ Failed to update report ${report._id}: ${e.message}`);
        errorCount++;
      }
    }

    const message = `Search title migration completed. Updated: ${updatedCount}, Errors: ${errorCount}`;
    console.log(`✅ ${message}`);
    res.json({ success: true, message, updatedCount, errorCount });

  } catch (error) {
    console.error('❌ Search title migration failed:', error);
    next(error);
  }
});

// POST /api/reports/check-duplicates - Check for duplicates before import
router.post('/check-duplicates', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No File',
        message: 'No file uploaded for duplicate check'
      });
    }

    let data;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    try {
      if (fileExtension === '.csv') {
        const workbook = XLSX.readFile(req.file.path, {
          type: 'file',
          cellDates: true,
          cellNF: false,
          cellText: false
        });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } else {
        const workbook = XLSX.readFile(req.file.path, {
          cellDates: true,
          cellNF: false,
          cellText: false
        });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      }
    } catch (fileError) {
      return res.status(400).json({
        error: 'File Reading Error',
        message: `Failed to read the uploaded file: ${fileError.message}`
      });
    }

    if (!data || data.length === 0) {
      return res.status(400).json({
        error: 'Empty File',
        message: 'The uploaded file contains no data'
      });
    }

    // Check for duplicates in database
    const duplicates = [];
    const totalRecords = data.length;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      // Extract title and report code
      const title = row['Report Title'] || row['REPORT TITLE'] || row['Title'] || '';
      const reportCode = row['Report Code'] || row['REPORT CODE'] || row['Code'] || '';

      if (title.trim()) {
        // Check if report exists by title or report code
        const normalizedTitle = title.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const existingReport = await Report.findOne({
          $or: [
            { searchTitle: normalizedTitle },
            { reportCode: { $regex: new RegExp(`^${reportCode.trim()}$`, 'i') } }
          ]
        });

        if (existingReport) {
          duplicates.push({
            row: i + 2, // Excel row number (1-indexed + header)
            title: title.trim(),
            reportCode: reportCode.trim(),
            existingId: existingReport._id
          });
        }
      }
    }

    // Clean up uploaded file
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting temp file:', err);
      });
    }

    res.json({
      success: true,
      totalRecords,
      duplicates,
      duplicateCount: duplicates.length
    });

  } catch (error) {
    console.error('❌ Duplicate check error:', error);

    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting temp file:', err);
      });
    }

    res.status(500).json({
      error: 'Duplicate Check Failed',
      message: error.message
    });
  }
})

// POST /api/reports/bulk-upload - Optimized bulk upload for 500+ records
// router.post('/bulk-upload', upload.single('file'), async (req, res, next) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({
//         error: 'No File',
//         message: 'No file uploaded for bulk import'
//       });
//     }

//     let data;
//     const fileExtension = path.extname(req.file.originalname).toLowerCase();

//     console.log(`📁 Processing file: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

//     try {
//       if (fileExtension === '.csv') {
//         // Handle CSV files with streaming for large files
//         const workbook = XLSX.readFile(req.file.path, {
//           type: 'file',
//           cellDates: true,
//           cellNF: false,
//           cellText: false
//         });
//         const sheetName = workbook.SheetNames[0];
//         const sheet = workbook.Sheets[sheetName];
//         data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
//       } else {
//         // Handle Excel files (.xlsx, .xls) with optimized reading
//         const workbook = XLSX.readFile(req.file.path, {
//           cellDates: true,
//           cellNF: false,
//           cellText: false
//         });
//         const sheetName = workbook.SheetNames[0];
//         const sheet = workbook.Sheets[sheetName];
//         data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
//       }
//     } catch (fileError) {
//       console.error('❌ File reading error:', fileError);
//       return res.status(400).json({
//         error: 'File Reading Error',
//         message: `Failed to read the uploaded file: ${fileError.message}`
//       });
//     }

//     if (!data || data.length === 0) {
//       return res.status(400).json({
//         error: 'Empty File',
//         message: 'The uploaded file contains no data or has invalid format.'
//       });
//     }

//     console.log(`🚀 Starting import of ${data.length} rows`);

//     // Get duplicate handling preference
//     const duplicateHandling = req.body.duplicateHandling || 'update';
//     console.log(`🔄 Duplicate handling mode: ${duplicateHandling}`);

//     // Validate file size for performance
//     if (data.length > 1000) {
//       console.log('⚠️  Large file detected, using optimized processing...');
//     }

//     // Optimized column detection and validation
//     const allColumns = Object.keys(data[0] || {});
//     const requiredColumns = ['Report Title', 'Title', 'Report Name'];
//     const hasRequiredColumn = requiredColumns.some(col => allColumns.includes(col));

//     if (!hasRequiredColumn) {
//       return res.status(400).json({
//         error: 'Invalid File Format',
//         message: `Missing required title column. Expected one of: ${requiredColumns.join(', ')}`,
//         availableColumns: allColumns
//       });
//     }

//     console.log('🔍 Validating data structure...');

//     let insertedCount = 0;
//     let updatedCount = 0;
//     let skippedCount = 0;
//     let failedCount = 0;
//     const errors = [];

//     // Category creation tracking
//     let categoriesCreated = 0;
//     let subcategoriesCreated = 0;

//     // Dynamic batch size based on data volume
//     const batchSize = data.length > 500 ? 25 : data.length > 100 ? 50 : 100;
//     const reportBatch = [];

//     console.log(`⚡ Processing ${data.length} reports in optimized batches of ${batchSize}`);

//     // Pre-compile regex patterns for better performance
//     const cleanTextRegex = /[\r\n\t]+/g;
//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

//     // Performance tracking
//     const startTime = Date.now();
//     let processedCount = 0;

//     for (let i = 0; i < data.length; i++) {
//       const row = data[i];
//       processedCount++;

//       // Progress logging for large datasets
//       if (data.length > 100 && processedCount % 50 === 0) {
//         const elapsed = Date.now() - startTime;
//         const rate = processedCount / (elapsed / 1000);
//         const eta = ((data.length - processedCount) / rate) / 60;
//         console.log(`📈 Progress: ${processedCount}/${data.length} (${(processedCount / data.length * 100).toFixed(1)}%) - ETA: ${eta.toFixed(1)}min`);
//       }

//       // Declare variables outside try block so they're accessible in catch block
//       let cleanTitle = '';
//       let cleanSubTitle = '';
//       let cleanSegment = '';
//       let cleanDescription = '';
//       let cleanCompanies = '';
//       let cleanSegmentCompanies = '';
//       let category = '';
//       let subCategory = '';
//       let reportCode = '';

//       try {
//         // Optimized field mapping with performance improvements
//         const title = row['Report Title'] || row['Title'] || row['Report Name'] || row['title'] || '';

//         // Try multiple variations for subtitle/meta tag with fallback
//         const subTitle = row['Report Sub Title / Title Meta Tag'] ||
//           row['Title Meta Tag'] ||
//           row['Report Sub Title'] ||
//           row['Sub Title'] ||
//           row['Subtitle'] ||
//           row['subTitle'] || '';

//         const summary = row['Summary'] || row['Description'] || row['summary'] || '';
//         const content = row['Content'] || row['content'] || '';

//         // Try multiple variations for report description - ENHANCED for REPORT OVERVIEW
//         const reportDescription = row['REPORT OVERVIEW'] ||
//           row['Report Overview'] ||
//           row['Report Discription'] ||
//           row['Report Description'] ||
//           row['Description'] ||
//           row['description'] ||
//           row['Overview'] || '';

//         const tableOfContents = row['Table of Contents'] || row['TOC'] || row['tableOfContents'] || '';

//         // Map categories with more variations including new "Report Category" format
//         category = row['Report Categories'] ||
//           row['Report Category'] ||
//           row['CATEGORIES'] ||
//           row['Categories'] ||
//           row['Category'] ||
//           row['CATEGORY'] ||
//           row['Domain'] ||
//           row['DOMAIN'] ||
//           row['Industry'] ||
//           row['INDUSTRY'] ||
//           row['category'] ||
//           row['domain'] ||
//           row['industry'] || '';

//         subCategory = row['Report Sub Category'] ||
//           row['Report Sub Categories'] ||
//           row['Sub Category'] ||
//           row['Sub Categories'] ||
//           row['SUB CATEGORY'] ||
//           row['SUB CATEGORIES'] ||
//           row['Sub Domain'] ||
//           row['SUB DOMAIN'] ||
//           row['Subdomain'] ||
//           row['SUBDOMAIN'] ||
//           row['subCategory'] ||
//           row['subCategories'] ||
//           row['subdomain'] || '';

//         // Debug category extraction for first 3 rows
//         if (i < 3) {
//           console.log(`🏷️ Row ${i + 1} CATEGORY EXTRACTION:`, {
//             'category result': category,
//             'subCategory result': subCategory,
//             'category length': category ? category.length : 0,
//             'subCategory length': subCategory ? subCategory.length : 0,
//             'category isEmpty': !category || category.trim() === '',
//             'subCategory isEmpty': !subCategory || subCategory.trim() === ''
//           });
//         }

//         // Try multiple variations for combined segment/companies field
//         const segmentCompanies = row['SEGMENT / COMPANIES'] ||
//           row['Segment / Companies'] ||
//           row['SEGMENT/COMPANIES'] ||
//           row['Segment/Companies'] ||
//           row['SEGMENTATION'] ||
//           row['Segmentation'] ||
//           row['Segment'] ||
//           row['segment'] ||
//           row['SEGMENT'] || '';

//         // Legacy: Try multiple variations for separate segment field (for backward compatibility)
//         const segment = row['SEGMENTATION'] ||
//           row['Segmentation'] ||
//           row['Segment'] ||
//           row['segment'] ||
//           row['SEGMENT'] || '';

//         // Legacy: Try multiple variations for separate companies field (for backward compatibility)
//         const companies = row['Companies'] ||
//           row['companies'] ||
//           row['COMPANIES'] ||
//           row['Company'] ||
//           row['company'] || '';

//         // Extract region and sub-regions fields
//         const region = row['Region'] || row['region'] || '';
//         const subRegions = row['Sub Regions'] || row['Sub Region'] || row['subRegions'] || row['sub_regions'] || '';

//         // Extract additional fields for bulk upload
//         const authorName = row['Author Name'] || row['Author'] || row['author'] || '';
//         reportCode = row['Report Code'] || row['Code'] || row['reportCode'] || '';
//         const numberOfPages = row['Number of Page'] || row['Pages'] || row['numberOfPages'] || '';
//         const reportDate = row['Report Date'] || row['Date'] || row['reportDate'] || '';
//         const publishDate = row['Publish Date'] || row['publishDate'] || '';
//         const price = row['Price'] || row['price'] || '';
//         const currency = row['Currency'] || row['currency'] || 'USD';
//         const format = row['Format'] || row['format'] || 'PDF';
//         const language = row['Language'] || row['language'] || 'English';
//         const industry = row['Industry'] || row['industry'] || '';
//         const reportType = row['Report Type'] || row['Type'] || row['reportType'] || 'Market Research';

//         // Pricing fields - matching your Excel image exactly
//         const excelDatapackPrice = row['Excel Datapack Prices'] || row['Excel Datapack Price'] || row['Excel Data Pack Prices'] || row['Excel Data Pack Price'] || row['excelDatapackPrice'] || '';
//         const singleUserPrice = row['Single User License Prices'] || row['Single User Prices'] || row['Single User Price'] || row['singleUserPrice'] || '';
//         const enterprisePrice = row['Enterprise License Prices'] || row['Enterprise Price'] || row['Enterprise Prices'] || row['enterprisePrice'] || '';
//         const internetHandlingCharges = row['Internet Handling Charges'] || row['internetHandlingCharges'] || '';

//         // License fields
//         const excelDataPackLicense = row['Excel Data Pack License'] || row['excelDataPackLicense'] || '';
//         const singleUserLicense = row['Single User License'] || row['singleUserLicense'] || '';
//         const enterpriseLicensePrice = row['Enterprise License Price'] || row['enterpriseLicensePrice'] || '';

//         // Status fields
//         const status = row['Status'] || row['status'] || 'draft';
//         const featured = row['Featured'] || row['featured'] || false;
//         const popular = row['Popular'] || row['popular'] || false;

//         // Extract SEO fields
//         const titleTag = row['Title Tag'] || row['SEO Title'] || row['titleTag'] || '';
//         const urlSlug = row['URL Slug'] || row['URL'] || row['url'] || row['Slug'] || '';
//         const metaDescription = row['Meta Description'] || row['metaDescription'] || row['SEO Description'] || '';
//         const keywords = row['Keywords'] || row['keywords'] || row['SEO Keywords'] || '';

//         // Enhanced cleaning and validation with better type handling
//         cleanTitle = (title !== null && title !== undefined && title !== '') ? String(title).replace(cleanTextRegex, ' ').trim() : '';
//         cleanSubTitle = (subTitle !== null && subTitle !== undefined && subTitle !== '') ? String(subTitle).replace(cleanTextRegex, ' ').trim() : '';

//         // Format REPORT OVERVIEW data with consistent database-level formatting
//         cleanDescription = formatReportOverview(reportDescription);
//         cleanSegment = formatImportedContent(segment);
//         cleanCompanies = formatImportedContent(companies);
//         cleanSegmentCompanies = formatImportedContent(segmentCompanies);

//         // Ensure slug is handled correctly
//         let cleanSlug = (urlSlug !== null && urlSlug !== undefined && urlSlug !== '')
//           ? String(urlSlug).trim()
//           : '';

//         // FALLBACK LOGIC: If SEGMENT / COMPANIES is empty, combine separate fields or use REPORT OVERVIEW
//         if (!cleanSegmentCompanies || cleanSegmentCompanies === '' || cleanSegmentCompanies === '<div style="margin: 20px 0; padding: 15px; border-radius: 8px; background-color: #ffffff; border-left: 4px solid #10b981; background-color: #f0fdf4;"></div>') {
//           if (cleanSegment || cleanCompanies) {
//             // Combine separate segment and companies data with proper formatting
//             const combinedParts = [];
//             if (cleanSegment) combinedParts.push(cleanSegment);
//             if (cleanCompanies) {
//               combinedParts.push(`<h3 style="color: #1f2937; margin: 15px 0 10px 0; font-weight: 600;">Companies</h3>${cleanCompanies}`);
//             }
//             cleanSegmentCompanies = `<div style="margin: 20px 0; padding: 15px; border-radius: 8px; background-color: #ffffff; border-left: 4px solid #10b981; background-color: #f0fdf4;">${combinedParts.join('')}</div>`;
//             console.log(`✅ FALLBACK: Combined separate fields into segmentCompanies with formatting`);
//           } else if (cleanDescription && cleanDescription.length > 100) {
//             // Use REPORT OVERVIEW as fallback if it contains substantial content, but reformat for segment context
//             const rawDescription = (reportDescription !== null && reportDescription !== undefined && reportDescription !== '') ? String(reportDescription) : '';
//             cleanSegmentCompanies = formatImportedContent(rawDescription, 'segment');
//             console.log(`✅ FALLBACK: Using REPORT OVERVIEW as segmentCompanies with segment formatting`);
//           }
//         }

//         // FINAL CHECK: Ensure we have some data in segmentCompanies
//         if (i < 3) {
//           console.log(`🎯 FINAL segmentCompanies CHECK for Row ${i + 1}:`, {
//             'cleanSegmentCompanies length': cleanSegmentCompanies ? cleanSegmentCompanies.length : 0,
//             'cleanSegmentCompanies preview': cleanSegmentCompanies ? cleanSegmentCompanies.substring(0, 150) + '...' : 'EMPTY',
//             'Will be saved as': cleanSegmentCompanies || 'EMPTY STRING'
//           });
//         }

//         // Clean SEO fields
//         const cleanTitleTag = titleTag ? titleTag.toString().trim() : '';
//         const cleanUrlSlug = urlSlug ? urlSlug.toString().trim() : '';
//         const cleanMetaDescription = metaDescription ? metaDescription.toString().trim() : '';
//         const cleanKeywords = keywords ? keywords.toString().trim() : '';

//         // CRITICAL DEBUG: Log SEGMENTATION and REGION data extraction for first 3 rows
//         if (i < 3) {
//           console.log(`🔍 Row ${i + 1} BULK UPLOAD Debug:`, {
//             'Available Excel Columns': Object.keys(row),
//             'SEGMENT/COMPANIES Data (NEW)': {
//               'Excel SEGMENT / COMPANIES Column': row['SEGMENT / COMPANIES'],
//               'Excel SEGMENT/COMPANIES Column': row['SEGMENT/COMPANIES'],
//               'Raw segmentCompanies extracted': segmentCompanies,
//               'cleanSegmentCompanies after processing': cleanSegmentCompanies
//             },
//             'Legacy SEGMENTATION Data': {
//               'Excel SEGMENTATION Column': row['SEGMENTATION'],
//               'Raw segment extracted': segment,
//               'cleanSegment after processing': cleanSegment
//             },
//             'Legacy COMPANIES Data': {
//               'Excel COMPANIES Column': row['COMPANIES'],
//               'Raw companies extracted': companies,
//               'cleanCompanies after processing': cleanCompanies
//             },
//             'REGION Data': {
//               'Excel Region Column': row['Region'],
//               'Raw region extracted': region,
//               'Raw subRegions extracted': subRegions
//             },
//             'CATEGORY Data': {
//               'Excel Categories Column': row['Categories'],
//               'Excel Category Column': row['Category'],
//               'Excel Report Category Column': row['Report Category'],
//               'Excel Report Categories Column': row['Report Categories'],
//               'Raw category extracted': category,
//               'Raw subCategory extracted': subCategory
//             },
//             'SEO Data': {
//               'Excel Title Tag Column': row['Title Tag'],
//               'Excel URL Slug Column': row['URL Slug'],
//               'Excel Meta Description Column': row['Meta Description'],
//               'Excel Keywords Column': row['Keywords'],
//               'Raw titleTag extracted': titleTag,
//               'Raw urlSlug extracted': cleanSlug,
//               'Raw metaDescription extracted': metaDescription,
//               'Raw keywords extracted': keywords,
//               'cleanTitleTag after processing': cleanTitleTag,
//               'cleanUrlSlug after processing': cleanUrlSlug,
//               'cleanMetaDescription after processing': cleanMetaDescription,
//               'cleanKeywords after processing': cleanKeywords
//             }
//           });
//         }

//         // Enhanced validation with better error messages
//         if (!cleanTitle || cleanTitle.length < 3) {
//           failedCount++;
//           errors.push({
//             row: i + 1,
//             reportCode: reportCode || 'N/A',
//             error: cleanTitle ? 'Title too short (minimum 3 characters)' : 'Title is required'
//           });
//           continue;
//         }

//         // Additional validation for data quality
//         if (cleanTitle.length > 500) {
//           cleanTitle = cleanTitle.substring(0, 500) + '...';
//         }


//         // Slug handling: Prioritize Excel slug, then generate from title, then fallback.
//         let slug = cleanUrlSlug;
//         if (!slug) {
//           try {
//             slug = await generateUniqueSlug(cleanTitle);
//           } catch (slugError) {
//             console.error('Slug generation error:', slugError);
//             // Fallback to a timestamped slug if generation fails
//             slug = `report-${Date.now()}`;
//           }
//         }

//         // AUTO-CREATE CATEGORIES AND SUBCATEGORIES FROM EXCEL DATA
//         try {
//           // Ensure category exists (create if not found)
//           if (category && category.toString().trim() !== '') {
//             const categoryResult = await ensureCategoryExists(category.toString().trim());
//             if (categoryResult) {
//               if (categoryResult.created) {
//                 categoriesCreated++;
//                 console.log(`📂 NEW Category created: "${category.toString().trim()}" for report: "${cleanTitle}"`);
//               } else {
//                 console.log(`📂 Category "${category.toString().trim()}" already exists for report: "${cleanTitle}"`);
//               }
//             }
//           }

//           // Ensure subcategory exists under category (create if not found)
//           if (category && category.toString().trim() !== '' &&
//             subCategory && subCategory.toString().trim() !== '') {
//             const subcategoryResult = await ensureSubcategoryExists(
//               category.toString().trim(),
//               subCategory.toString().trim()
//             );
//             if (subcategoryResult) {
//               if (subcategoryResult.categoryCreated) {
//                 categoriesCreated++;
//               }
//               if (subcategoryResult.subcategoryCreated) {
//                 subcategoriesCreated++;
//                 console.log(`📁 NEW Subcategory created: "${subCategory.toString().trim()}" under category "${category.toString().trim()}" for report: "${cleanTitle}"`);
//               } else {
//                 console.log(`📁 Subcategory "${subCategory.toString().trim()}" already exists under category "${category.toString().trim()}" for report: "${cleanTitle}"`);
//               }
//             }
//           }
//         } catch (categoryError) {
//           console.error(`⚠️ Category/Subcategory creation failed for report "${cleanTitle}":`, categoryError.message);
//           // Continue with report creation even if category creation fails
//         }

//         const reportData = {
//           title: cleanTitle,
//           subTitle: cleanSubTitle,  // Maps from 'Report Sub Title / Title Meta Tag' Excel column
//           slug,
//           summary: summary?.toString().trim() || '',  // Keep existing summary field
//           reportDescription: cleanDescription,  // Maps from 'Report Discription' Excel column
//           content: content?.toString() || '',
//           tableOfContents: tableOfContents?.toString() ? formatImportedContent(tableOfContents.toString(), 'tableOfContents') : '',
//           category: category?.toString().trim() || '',
//           subCategory: subCategory?.toString().trim() || '',
//           region: region?.toString().trim() || '',
//           subRegions: subRegions?.toString().trim() || '',
//           reportCode: reportCode?.toString().trim() || '',
//           numberOfPages: numberOfPages ? parseInt(numberOfPages) || 1 : 1,
//           price: price ? parseFloat(price) || 0 : 0,
//           currency: currency?.toString().toLowerCase() || 'usd',
//           format: format?.toString().toLowerCase() || 'pdf',
//           industry: industry?.toString().trim() || '',
//           reportType: reportType?.toString() || 'market-research',

//           // Excel import field mapping for frontend compatibility - USE EMPTY STRINGS NOT NULL
//           reportDate: reportDate ? (isNaN(Date.parse(reportDate)) ? new Date() : new Date(reportDate)) : new Date(),
//           reportCategories: (category?.toString().trim() && category.toString().trim() !== '') ? category.toString().trim() : '',

//           // NEW: Combined segment/companies field
//           segmentCompanies: [cleanSegment, cleanCompanies].filter(Boolean).join('\n\n'),
//           segment: (cleanSegment && cleanSegment !== '') ? cleanSegment : '',
//           companies: (cleanCompanies && cleanCompanies !== '') ? cleanCompanies : '',
//           reportDescription: (cleanDescription && cleanDescription !== '') ? cleanDescription : '',

//           // SEO fields from Excel import
//           titleTag: (cleanTitleTag && cleanTitleTag !== '') ? cleanTitleTag : null,
//           url: (cleanUrlSlug && cleanUrlSlug !== '') ? cleanUrlSlug : null, // Keep for legacy compatibility
//           slug: slug, // Use the definitive slug determined above
//           metaDescription: (cleanMetaDescription && cleanMetaDescription !== '') ? cleanMetaDescription : null,
//           keywords: (cleanKeywords && cleanKeywords !== '') ? cleanKeywords : null,

//           // Pricing fields - matching Excel image exactly
//           excelDatapackPrice: excelDatapackPrice?.toString() || '',
//           singleUserPrice: singleUserPrice?.toString() || '',
//           enterprisePrice: enterprisePrice?.toString() || '',
//           internetHandlingCharges: internetHandlingCharges?.toString() || '',

//           // License fields (from Excel or defaults)
//           excelDataPackLicense: excelDataPackLicense?.toString() || '',
//           singleUserLicense: singleUserLicense?.toString() || '',
//           enterpriseLicensePrice: enterpriseLicensePrice?.toString() || '',

//           status: status || 'draft',
//           featured: Boolean(featured),
//           popular: Boolean(popular),
//           tags: cleanSegment ? [cleanSegment] : [],  // Keep for backward compatibility
//           author: authorName?.toString().trim() || req.user?.name || 'System',
//           publishDate: publishDate ? (isNaN(Date.parse(publishDate)) ? new Date() : new Date(publishDate)) : new Date(),
//           domain: category?.toString().trim() || '',
//           subdomain: subCategory?.toString().trim() || ''
//         };

//         // Validate required fields
//         if (!reportData.title || !reportData.slug) {
//           throw new Error(`Missing required fields: title="${reportData.title}", slug="${reportData.slug}"`);
//         }

//         // Enhanced debugging for first few records only
//         if (i < 3 && data.length <= 100) {
//           console.log('🔍 COMPLETE EXCEL IMPORT DEBUG - About to save report data:', {
//             title: reportData.title,
//             'CRITICAL FIELDS TO SAVE': {
//               'segmentCompanies (NEW)': reportData.segmentCompanies,
//               'reportDescription': reportData.reportDescription,
//               'segment (Legacy)': reportData.segment,
//               'companies (Legacy)': reportData.companies,
//               'reportCategories': reportData.reportCategories
//             },
//             'Excel Raw Values': {
//               'SEGMENT / COMPANIES (NEW)': row['SEGMENT / COMPANIES'],
//               'REPORT OVERVIEW': row['REPORT OVERVIEW'],
//               'SEGMENTATION (Legacy)': row['SEGMENTATION'],
//               'COMPANIES (Legacy)': row['COMPANIES'],
//               'CATEGORIES': row['CATEGORIES']
//             },
//             'Cleaned Values': {
//               'cleanSegmentCompanies (NEW)': cleanSegmentCompanies,
//               'cleanDescription': cleanDescription,
//               'cleanSegment (Legacy)': cleanSegment,
//               'cleanCompanies (Legacy)': cleanCompanies,
//               'category': category
//             },
//             'FINAL VALIDATION': {
//               'segmentCompanies field will be saved as': reportData.segmentCompanies,
//               'segmentCompanies is empty?': !reportData.segmentCompanies || reportData.segmentCompanies === '',
//               'segmentCompanies length': reportData.segmentCompanies ? reportData.segmentCompanies.length : 0,
//               'segment (Legacy) field will be saved as': reportData.segment,
//               'segment (Legacy) is empty?': !reportData.segment || reportData.segment === '',
//               'segment (Legacy) length': reportData.segment ? reportData.segment.length : 0
//             }
//           });
//         }

//         // Add to batch instead of saving immediately
//         reportBatch.push(reportData);

//         // Process batch when it reaches batchSize or is the last item
//         if (reportBatch.length >= batchSize || i === data.length - 1) {
//           console.log(`Processing batch of ${reportBatch.length} reports...`);

//           // Optimized bulk processing with better error handling and duplicate prevention
//           try {
//             // Handle different duplicate strategies
//             const bulkOps = [];

//             for (const reportData of reportBatch) {
//               const filter = reportData.reportCode && reportData.reportCode.trim()
//                 ? { reportCode: reportData.reportCode }
//                 : {
//                   $or: [
//                     { slug: reportData.slug },
//                     { title: reportData.title }
//                   ]
//                 };

//               if (duplicateHandling === 'skip') {
//                 // Skip duplicates - only insert if not exists
//                 const existing = await Report.findOne(filter);
//                 if (!existing) {
//                   bulkOps.push({
//                     insertOne: {
//                       document: reportData
//                     }
//                   });
//                 } else {
//                   skippedCount++;
//                 }
//               } else if (duplicateHandling === 'create') {
//                 // Always create new - don't check for duplicates
//                 bulkOps.push({
//                   insertOne: {
//                     document: reportData
//                   }
//                 });
//               } else {
//                 // Default: update existing or create new (upsert)
//                 bulkOps.push({
//                   updateOne: {
//                     filter: filter,
//                     update: { $set: reportData },
//                     upsert: true
//                   }
//                 });
//               }
//             }

//             const bulkResult = await Report.bulkWrite(bulkOps, {
//               ordered: false,
//               writeConcern: { w: 1 }
//             });

//             insertedCount += bulkResult.insertedCount || 0;
//             updatedCount += bulkResult.modifiedCount || 0;
//             insertedCount += bulkResult.upsertedCount || 0;

//             if (data.length <= 100) {
//               console.log(`✅ Batch completed: +${bulkResult.insertedCount || 0} new, ~${bulkResult.modifiedCount || 0} updated, ^${bulkResult.upsertedCount || 0} upserted`);
//               if (bulkResult.modifiedCount > 0) {
//                 console.log(`🔄 ${bulkResult.modifiedCount} duplicate(s) detected and updated instead of creating new records`);
//               }

//               // CRITICAL: Verify SEGMENTATION data was actually saved for first few records
//               if (reportBatch.length > 0) {
//                 const firstReport = reportBatch[0];
//                 if (firstReport.title) {
//                   try {
//                     const savedReport = await Report.findOne({ title: firstReport.title }).lean();
//                     if (savedReport) {
//                       console.log('🔍 POST-SAVE VERIFICATION - SEGMENTATION data in database:', {
//                         'Report Title': savedReport.title,
//                         'segment field in DB': savedReport.segment,
//                         'segment length': savedReport.segment ? savedReport.segment.length : 0,
//                         'segment is empty?': !savedReport.segment || savedReport.segment === '',
//                         'companies field in DB': savedReport.companies,
//                         'reportDescription field in DB': savedReport.reportDescription,
//                         'SEO FIELDS in DB': {
//                           'titleTag': savedReport.titleTag,
//                           'slug': savedReport.slug,
//                           'url': savedReport.url,
//                           'metaDescription': savedReport.metaDescription,
//                           'keywords': savedReport.keywords
//                         }
//                       });
//                     }
//                   } catch (verifyError) {
//                     console.error('❌ Post-save verification failed:', verifyError.message);
//                   }
//                 }
//               }
//             }

//           } catch (bulkError) {
//             console.error('❌ Bulk operation failed:', bulkError.message);

//             // Fallback to individual processing for this batch with duplicate prevention
//             for (const reportData of reportBatch) {
//               try {
//                 let result;
//                 if (reportData.reportCode && reportData.reportCode.trim()) {
//                   // Use reportCode as primary identifier
//                   result = await Report.findOneAndUpdate(
//                     { reportCode: reportData.reportCode },
//                     reportData,
//                     { new: true, upsert: true, runValidators: true }
//                   );
//                 } else {
//                   // Use title or slug to prevent duplicates
//                   result = await Report.findOneAndUpdate(
//                     {
//                       $or: [
//                         { slug: reportData.slug },
//                         { title: reportData.title }
//                       ]
//                     },
//                     reportData,
//                     { new: true, upsert: true, runValidators: true }
//                   );
//                 }

//                 // Check if this was an insert or update
//                 if (result.isNew !== false) {
//                   insertedCount++;
//                 } else {
//                   updatedCount++;
//                 }
//               } catch (individualError) {
//                 failedCount++;
//                 errors.push({
//                   row: reportBatch.indexOf(reportData) + 1,
//                   title: reportData.title || 'Unknown',
//                   reportCode: reportData.reportCode || 'N/A',
//                   error: individualError.message
//                 });
//               }
//             }
//           }

//           reportBatch.length = 0; // Clear the batch

//           // Progress update for large files
//           if (data.length > 100) {
//             const progress = ((i + 1) / data.length * 100).toFixed(1);
//             console.log(`📊 Progress: ${progress}% (${insertedCount + updatedCount} processed, ${failedCount} failed)`);
//           }
//         }
//       } catch (error) {
//         console.error('Error processing row:', error);
//         console.error('Row data:', row);
//         console.error('Processed data:', {
//           cleanTitle, cleanSubTitle, cleanDescription, cleanSegment, category, subCategory
//         });
//         failedCount++;
//         errors.push({
//           title: cleanTitle || 'Unknown',
//           reportCode: reportCode || 'Unknown',
//           error: error.message,
//           stack: error.stack,
//           rowData: Object.keys(row).slice(0, 10).reduce((obj, key) => {
//             obj[key] = row[key];
//             return obj;
//           }, {})
//         });
//       }
//     }

//     // Performance summary
//     const totalTime = (Date.now() - startTime) / 1000;
//     const rate = data.length / totalTime;

//     console.log(`🎉 Import completed in ${totalTime.toFixed(2)}s (${rate.toFixed(1)} records/sec)`);
//     console.log(`📊 Results: ${insertedCount} new, ${updatedCount} updated, ${failedCount} failed`);

//     // Clean up uploaded file
//     try {
//       fs.unlinkSync(req.file.path);
//     } catch (cleanupError) {
//       console.warn('⚠️  Failed to cleanup uploaded file:', cleanupError.message);
//     }

//     const totalProcessed = insertedCount + updatedCount + skippedCount;
//     const successRate = ((totalProcessed / data.length) * 100).toFixed(1);

//     console.log(`📊 Final Results: ${insertedCount} new, ${updatedCount} updated, ${skippedCount} skipped, ${failedCount} failed`);
//     console.log(`🏷️ Categories: ${categoriesCreated} new categories, ${subcategoriesCreated} new subcategories created`);

//     res.status(201).json({
//       success: true,
//       message: `Import completed: ${totalProcessed}/${data.length} records processed (${successRate}% success rate)`,
//       stats: {
//         total: data.length,
//         inserted: insertedCount,
//         updated: updatedCount,
//         skipped: skippedCount,
//         failed: failedCount,
//         duplicates: skippedCount + updatedCount,
//         successRate: parseFloat(successRate),
//         processingTime: totalTime,
//         recordsPerSecond: parseFloat(rate.toFixed(1)),
//         categoriesCreated: categoriesCreated,
//         subcategoriesCreated: subcategoriesCreated
//       },
//       categories: {
//         created: categoriesCreated,
//         subcategoriesCreated: subcategoriesCreated,
//         message: categoriesCreated > 0 || subcategoriesCreated > 0
//           ? `Auto-created ${categoriesCreated} categories and ${subcategoriesCreated} subcategories from Excel data`
//           : 'No new categories or subcategories were needed'
//       },
//       errors: errors.slice(0, 10), // Limit errors in response
//       note: failedCount > 0 ? `${failedCount} records failed. Check logs for details.` : 'All records processed successfully'
//     });

//   } catch (error) {
//     console.error('❌ Critical error during bulk import:', error);

//     // Clean up uploaded file
//     if (req.file) {
//       try {
//         fs.unlinkSync(req.file.path);
//       } catch (cleanupError) {
//         console.warn('⚠️  Failed to cleanup uploaded file after error:', cleanupError.message);
//       }
//     }

//     // Return structured error response
//     res.status(500).json({
//       success: false,
//       error: 'Import Failed',
//       message: error.message || 'An unexpected error occurred during import',
//       details: process.env.NODE_ENV === 'development' ? error.stack : undefined
//     });
//   }
// });

router.post('/bulk-upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No File',
        message: 'No file uploaded for bulk import'
      });
    }

    let data;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    console.log(`📁 Processing file: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

    try {
      if (fileExtension === '.csv') {
        // Handle CSV files with streaming for large files
        const workbook = XLSX.readFile(req.file.path, {
          type: 'file',
          cellDates: true,
          cellNF: false,
          cellText: false
        });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } else {
        // Handle Excel files (.xlsx, .xls) with FORMATTING PRESERVATION
        const workbook = XLSX.readFile(req.file.path, {
          cellDates: true,
          cellNF: false,
          cellText: false,
          cellStyles: true  // ✅ Enable style reading
        });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];



        // ✅ Use sheet_to_html to preserve formatting (bold, italic, underline)
        const htmlTable = XLSX.utils.sheet_to_html(sheet);
        console.log('📊 Excel HTML output (first 500 chars):', htmlTable.substring(0, 500));

        // ✅ Parse HTML to extract formatted content
        const dom = new JSDOM(htmlTable);
        const rows = Array.from(dom.window.document.querySelectorAll('tr'));

        if (rows.length < 2) {
          throw new Error('Excel file must have at least a header row and one data row');
        }

        // Extract headers from first row
        const headerCells = rows[0].querySelectorAll('th, td');
        const headers = Array.from(headerCells).map(cell => cell.textContent.trim());



        // ✅ Extract data rows with formatting preserved
        data = rows.slice(1).map((row, rowIndex) => {
          const cells = row.querySelectorAll('td');
          const obj = {};

          Array.from(cells).forEach((cell, index) => {
            const header = headers[index];
            if (header) {
              // ✅ Get HTML content to preserve formatting tags
              let cellContent = cell.innerHTML.trim();

              // Clean up Excel's HTML (remove extra spans, etc.)
              cellContent = cellContent
                .replace(/<span[^>]*>/g, '')
                .replace(/<\/span>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/<br\s*\/?>/g, '\n');  // Convert <br> to newlines

              obj[header] = cellContent || '';

              // Debug first few cells
              if (rowIndex < 2 && index < 3) {
                console.log(`📝 Cell [${rowIndex},${index}] (${header}):`, {
                  text: cell.textContent.substring(0, 50),
                  html: cellContent.substring(0, 100),
                  hasBold: cellContent.includes('<b>') || cellContent.includes('<strong>')
                });
              }
            }
          });

          return obj;
        }).filter(row => Object.values(row).some(val => val && val.toString().trim()));

        console.log(`✅ Excel parsed with formatting. Total rows: ${data.length}`, {
          headers,
          firstRowSample: data[0] ? Object.keys(data[0]).slice(0, 3) : [],
          hasFormatting: JSON.stringify(data[0] || {}).includes('<b>')
        });
      }
    } catch (fileError) {
      console.error('❌ File reading error:', fileError);
      return res.status(400).json({
        error: 'File Reading Error',
        message: `Failed to read the uploaded file: ${fileError.message}`
      });
    }

    if (!data || data.length === 0) {
      return res.status(400).json({
        error: 'Empty File',
        message: 'The uploaded file contains no data or has invalid format.'
      });
    }

    console.log(`🚀 Starting import of ${data.length} rows`);

    // Get duplicate handling preference
    const duplicateHandling = req.body.duplicateHandling || 'update';
    console.log(`🔄 Duplicate handling mode: ${duplicateHandling}`);

    // Validate file size for performance
    if (data.length > 1000) {
      console.log('⚠️  Large file detected, using optimized processing...');
    }

    // Optimized column detection and validation
    const allColumns = Object.keys(data[0] || {});
    const requiredColumns = ['Report Title', 'Title', 'Report Name'];
    const hasRequiredColumn = requiredColumns.some(col => allColumns.includes(col));

    if (!hasRequiredColumn) {
      return res.status(400).json({
        error: 'Invalid File Format',
        message: `Missing required title column. Expected one of: ${requiredColumns.join(', ')}`,
        availableColumns: allColumns
      });
    }

    console.log('🔍 Validating data structure...');

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors = [];

    // Category creation tracking
    let categoriesCreated = 0;
    let subcategoriesCreated = 0;

    // Dynamic batch size based on data volume
    const batchSize = data.length > 500 ? 25 : data.length > 100 ? 50 : 100;
    const reportBatch = [];

    console.log(`⚡ Processing ${data.length} reports in optimized batches of ${batchSize}`);

    // Pre-compile regex patterns for better performance
    const cleanTextRegex = /[\r\n\t]+/g;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Performance tracking
    const startTime = Date.now();
    let processedCount = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      processedCount++;

      // Progress logging for large datasets
      if (data.length > 100 && processedCount % 50 === 0) {
        const elapsed = Date.now() - startTime;
        const rate = processedCount / (elapsed / 1000);
        const eta = ((data.length - processedCount) / rate) / 60;
        console.log(`📈 Progress: ${processedCount}/${data.length} (${(processedCount / data.length * 100).toFixed(1)}%) - ETA: ${eta.toFixed(1)}min`);
      }

      // Declare variables outside try block so they're accessible in catch block
      let cleanTitle = '';
      let cleanSubTitle = '';
      let cleanSegment = '';
      let cleanDescription = '';
      let cleanCompanies = '';
      let cleanSegmentCompanies = '';
      let category = '';
      let subCategory = '';
      let reportCode = '';

      try {
        // Optimized field mapping with performance improvements
        const title = row['Report Title'] || row['Title'] || row['Report Name'] || row['title'] || '';

        // Try multiple variations for subtitle/meta tag with fallback
        const subTitle = row['Report Sub Title / Title Meta Tag'] ||
          row['Title Meta Tag'] ||
          row['Report Sub Title'] ||
          row['Sub Title'] ||
          row['Subtitle'] ||
          row['subTitle'] || '';

        const summary = row['Summary'] || row['Description'] || row['summary'] || '';
        const content = row['Content'] || row['content'] || '';

        // Try multiple variations for report description - ENHANCED for REPORT OVERVIEW
        // ✅ NOW INCLUDES FORMATTING TAGS (<b>, <i>, <u>)
        const reportDescription = row['REPORT OVERVIEW'] ||
          row['Report Overview'] ||
          row['Report Discription'] ||
          row['Report Description'] ||
          row['Description'] ||
          row['description'] ||
          row['Overview'] || '';

        const tableOfContents = row['Table of Contents'] || row['TOC'] || row['tableOfContents'] || '';

        // Map categories with more variations including new "Report Category" format
        category = row['Report Categories'] ||
          row['Report Category'] ||
          row['CATEGORIES'] ||
          row['Categories'] ||
          row['Category'] ||
          row['CATEGORY'] ||
          row['Domain'] ||
          row['DOMAIN'] ||
          row['Industry'] ||
          row['INDUSTRY'] ||
          row['category'] ||
          row['domain'] ||
          row['industry'] || '';

        subCategory = row['Report Sub Category'] ||
          row['Report Sub Categories'] ||
          row['Sub Category'] ||
          row['Sub Categories'] ||
          row['SUB CATEGORY'] ||
          row['SUB CATEGORIES'] ||
          row['Sub Domain'] ||
          row['SUB DOMAIN'] ||
          row['Subdomain'] ||
          row['SUBDOMAIN'] ||
          row['subCategory'] ||
          row['subCategories'] ||
          row['subdomain'] || '';



        // Try multiple variations for combined segment/companies field
        // ✅ NOW INCLUDES FORMATTING TAGS (<b>, <i>, <u>)
        const segmentCompanies = row['SEGMENT / COMPANIES'] ||
          row['Segment / Companies'] ||
          row['SEGMENT/COMPANIES'] ||
          row['Segment/Companies'] ||
          row['SEGMENTATION'] ||
          row['Segmentation'] ||
          row['Segment'] ||
          row['segment'] ||
          row['SEGMENT'] || '';

        // Legacy: Try multiple variations for separate segment field (for backward compatibility)
        const segment = row['SEGMENTATION'] ||
          row['Segmentation'] ||
          row['Segment'] ||
          row['segment'] ||
          row['SEGMENT'] || '';

        // Legacy: Try multiple variations for separate companies field (for backward compatibility)
        const companies = row['Companies'] ||
          row['companies'] ||
          row['COMPANIES'] ||
          row['Company'] ||
          row['company'] || '';

        // Extract region and sub-regions fields
        const region = row['Region'] || row['region'] || '';
        const subRegions = row['Sub Regions'] || row['Sub Region'] || row['subRegions'] || row['sub_regions'] || '';

        // Extract additional fields for bulk upload
        const authorName = row['Author Name'] || row['Author'] || row['author'] || '';
        reportCode = row['Report Code'] || row['Code'] || row['reportCode'] || '';
        const numberOfPages = row['Number of Page'] || row['Pages'] || row['numberOfPages'] || '';
        const reportDate = row['Report Date'] || row['Date'] || row['reportDate'] || '';
        const publishDate = row['Publish Date'] || row['publishDate'] || '';
        const price = row['Price'] || row['price'] || '';
        const currency = row['Currency'] || row['currency'] || 'USD';
        const format = row['Format'] || row['format'] || 'PDF';
        const language = row['Language'] || row['language'] || 'English';
        const industry = row['Industry'] || row['industry'] || '';
        const reportType = row['Report Type'] || row['Type'] || row['reportType'] || 'Market Research';

        // Pricing fields - matching your Excel image exactly
        const excelDatapackPrice = row['Excel Datapack Prices'] || row['Excel Datapack Price'] || row['Excel Data Pack Prices'] || row['Excel Data Pack Price'] || row['excelDatapackPrice'] || '';
        const singleUserPrice = row['Single User License Prices'] || row['Single User Prices'] || row['Single User Price'] || row['singleUserPrice'] || '';
        const enterprisePrice = row['Enterprise License Prices'] || row['Enterprise Price'] || row['Enterprise Prices'] || row['enterprisePrice'] || '';
        const internetHandlingCharges = row['Internet Handling Charges'] || row['internetHandlingCharges'] || '';

        // License fields
        const excelDataPackLicense = row['Excel Data Pack License'] || row['excelDataPackLicense'] || '';
        const singleUserLicense = row['Single User License'] || row['singleUserLicense'] || '';
        const enterpriseLicensePrice = row['Enterprise License Price'] || row['enterpriseLicensePrice'] || '';

        // Status fields
        const status = row['Status'] || row['status'] || 'draft';
        const featured = row['Featured'] || row['featured'] || false;
        const popular = row['Popular'] || row['popular'] || false;

        // Extract SEO fields
        const titleTag = row['Title Tag'] || row['SEO Title'] || row['titleTag'] || '';
        const urlSlug = row['URL Slug'] || row['URL'] || row['url'] || row['Slug'] || '';
        const metaDescription = row['Meta Description'] || row['metaDescription'] || row['SEO Description'] || '';
        const keywords = row['Keywords'] || row['keywords'] || row['SEO Keywords'] || '';

        // Enhanced cleaning and validation with better type handling
        cleanTitle = (title !== null && title !== undefined && title !== '') ? String(title).replace(cleanTextRegex, ' ').trim() : '';
        cleanSubTitle = (subTitle !== null && subTitle !== undefined && subTitle !== '') ? String(subTitle).replace(cleanTextRegex, ' ').trim() : '';

        // ✅ Format REPORT OVERVIEW data with consistent database-level formatting
        // NOW PRESERVES <b>, <i>, <u> tags from Excel
        cleanDescription = formatReportOverview(reportDescription);
        cleanSegment = formatImportedContent(segment);
        cleanCompanies = formatImportedContent(companies);
        cleanSegmentCompanies = formatImportedContent(segmentCompanies);

        // Ensure slug is handled correctly
        let cleanSlug = (urlSlug !== null && urlSlug !== undefined && urlSlug !== '')
          ? String(urlSlug).trim()
          : '';

        // FALLBACK LOGIC: If SEGMENT / COMPANIES is empty, combine separate fields or use REPORT OVERVIEW
        if (!cleanSegmentCompanies || cleanSegmentCompanies === '' || cleanSegmentCompanies === '<div style="margin: 20px 0; padding: 15px; border-radius: 8px; background-color: #ffffff; border-left: 4px solid #10b981; background-color: #f0fdf4;"></div>') {
          if (cleanSegment || cleanCompanies) {
            // Combine separate segment and companies data with proper formatting
            const combinedParts = [];
            if (cleanSegment) combinedParts.push(cleanSegment);
            if (cleanCompanies) {
              combinedParts.push(`<h3 style="color: #1f2937; margin: 15px 0 10px 0; font-weight: 600;">Companies</h3>${cleanCompanies}`);
            }
            cleanSegmentCompanies = `<div style="margin: 20px 0; padding: 15px; border-radius: 8px; background-color: #ffffff; border-left: 4px solid #10b981; background-color: #f0fdf4;">${combinedParts.join('')}</div>`;
            console.log(`✅ FALLBACK: Combined separate fields into segmentCompanies with formatting`);
          } else if (cleanDescription && cleanDescription.length > 100) {
            // Use REPORT OVERVIEW as fallback if it contains substantial content, but reformat for segment context
            const rawDescription = (reportDescription !== null && reportDescription !== undefined && reportDescription !== '') ? String(reportDescription) : '';
            cleanSegmentCompanies = formatImportedContent(rawDescription, 'segment');
            console.log(`✅ FALLBACK: Using REPORT OVERVIEW as segmentCompanies with segment formatting`);
          }
        }


        // Clean SEO fields
        const cleanTitleTag = titleTag ? titleTag.toString().trim() : '';
        const cleanUrlSlug = urlSlug ? urlSlug.toString().trim() : '';
        const cleanMetaDescription = metaDescription ? metaDescription.toString().trim() : '';
        const cleanKeywords = keywords ? keywords.toString().trim() : '';

        // Enhanced validation with better error messages
        if (!cleanTitle || cleanTitle.length < 3) {
          failedCount++;
          errors.push({
            row: i + 1,
            reportCode: reportCode || 'N/A',
            error: cleanTitle ? 'Title too short (minimum 3 characters)' : 'Title is required'
          });
          continue;
        }

        // Additional validation for data quality
        if (cleanTitle.length > 1000) {
          cleanTitle = cleanTitle.substring(0, 997) + '...';
        }


        // Slug handling: Prioritize Excel slug, then generate from title, then fallback.
        let slug = cleanUrlSlug;
        if (!slug) {
          try {
            slug = await generateUniqueSlug(cleanTitle);
          } catch (slugError) {
            console.error('Slug generation error:', slugError);
            // Fallback to a timestamped slug if generation fails
            slug = `report-${Date.now()}`;
          }
        }

        // AUTO-CREATE CATEGORIES AND SUBCATEGORIES FROM EXCEL DATA
        try {
          // Ensure category exists (create if not found)
          if (category && category.toString().trim() !== '') {
            const categoryResult = await ensureCategoryExists(category.toString().trim());
            if (categoryResult) {
              if (categoryResult.created) {
                categoriesCreated++;
                console.log(`📂 NEW Category created: "${category.toString().trim()}" for report: "${cleanTitle}"`);
              } else {
                console.log(`📂 Category "${category.toString().trim()}" already exists for report: "${cleanTitle}"`);
              }
            }
          }

          // Ensure subcategory exists under category (create if not found)
          if (category && category.toString().trim() !== '' &&
            subCategory && subCategory.toString().trim() !== '') {
            const subcategoryResult = await ensureSubcategoryExists(
              category.toString().trim(),
              subCategory.toString().trim()
            );
            if (subcategoryResult) {
              if (subcategoryResult.categoryCreated) {
                categoriesCreated++;
              }
              if (subcategoryResult.subcategoryCreated) {
                subcategoriesCreated++;
                console.log(`📁 NEW Subcategory created: "${subCategory.toString().trim()}" under category "${category.toString().trim()}" for report: "${cleanTitle}"`);
              } else {
                console.log(`📁 Subcategory "${subCategory.toString().trim()}" already exists under category "${category.toString().trim()}" for report: "${cleanTitle}"`);
              }
            }
          }
        } catch (categoryError) {
          console.error(`⚠️ Category/Subcategory creation failed for report "${cleanTitle}":`, categoryError.message);
          // Continue with report creation even if category creation fails
        }

        const reportData = {
          title: cleanTitle,
          subTitle: cleanSubTitle,  // Maps from 'Report Sub Title / Title Meta Tag' Excel column
          slug,
          summary: summary?.toString().trim() || '',  // Keep existing summary field
          reportDescription: cleanDescription,  // Maps from 'Report Discription' Excel column - NOW WITH FORMATTING
          content: content?.toString() || '',
          tableOfContents: tableOfContents?.toString() ? formatImportedContent(tableOfContents.toString(), 'tableOfContents') : '',
          category: category?.toString().trim() || '',
          subCategory: subCategory?.toString().trim() || '',
          region: region?.toString().trim() || '',
          subRegions: subRegions?.toString().trim() || '',
          reportCode: reportCode?.toString().trim() || '',
          numberOfPages: numberOfPages ? parseInt(numberOfPages) || 1 : 1,
          price: price ? parseFloat(price) || 0 : 0,
          currency: currency?.toString().toLowerCase() || 'usd',
          format: format?.toString().toLowerCase() || 'pdf',
          industry: industry?.toString().trim() || '',
          reportType: reportType?.toString() || 'market-research',

          // Excel import field mapping for frontend compatibility - USE EMPTY STRINGS NOT NULL
          reportDate: reportDate ? (isNaN(Date.parse(reportDate)) ? new Date() : new Date(reportDate)) : new Date(),
          reportCategories: (category?.toString().trim() && category.toString().trim() !== '') ? category.toString().trim() : '',

          // NEW: Combined segment/companies field - NOW WITH FORMATTING
          segmentCompanies: cleanSegmentCompanies,
          segment: (cleanSegment && cleanSegment !== '') ? cleanSegment : '',
          companies: (cleanCompanies && cleanCompanies !== '') ? cleanCompanies : '',

          // SEO fields from Excel import
          titleTag: (cleanTitleTag && cleanTitleTag !== '') ? cleanTitleTag : null,
          url: (cleanUrlSlug && cleanUrlSlug !== '') ? cleanUrlSlug : null, // Keep for legacy compatibility
          slug: slug, // Use the definitive slug determined above
          metaDescription: (cleanMetaDescription && cleanMetaDescription !== '') ? cleanMetaDescription : null,
          keywords: (cleanKeywords && cleanKeywords !== '') ? cleanKeywords : null,

          // Pricing fields - matching Excel image exactly
          excelDatapackPrice: excelDatapackPrice?.toString() || '',
          singleUserPrice: singleUserPrice?.toString() || '',
          enterprisePrice: enterprisePrice?.toString() || '',
          internetHandlingCharges: internetHandlingCharges?.toString() || '',

          // License fields (from Excel or defaults)
          excelDataPackLicense: excelDataPackLicense?.toString() || '',
          singleUserLicense: singleUserLicense?.toString() || '',
          enterpriseLicensePrice: enterpriseLicensePrice?.toString() || '',

          status: status || 'draft',
          featured: Boolean(featured),
          popular: Boolean(popular),
          tags: cleanSegment ? [cleanSegment] : [],  // Keep for backward compatibility
          author: authorName?.toString().trim() || req.user?.name || 'System',
          publishDate: publishDate ? (isNaN(Date.parse(publishDate)) ? new Date() : new Date(publishDate)) : new Date(),
          domain: category?.toString().trim() || '',
          subdomain: subCategory?.toString().trim() || ''
        };

        // Validate required fields
        if (!reportData.title || !reportData.slug) {
          throw new Error(`Missing required fields: title="${reportData.title}", slug="${reportData.slug}"`);
        }

        // Enhanced debugging for first few records only
        if (i < 3 && data.length <= 100) {
          console.log('🔍 COMPLETE EXCEL IMPORT DEBUG - About to save report data:', {
            title: reportData.title,
            'CRITICAL FIELDS TO SAVE': {
              'segmentCompanies (NEW)': reportData.segmentCompanies,
              'reportDescription': reportData.reportDescription,
              'segment (Legacy)': reportData.segment,
              'companies (Legacy)': reportData.companies,
              'reportCategories': reportData.reportCategories
            },
            'Excel Raw Values': {
              'SEGMENT / COMPANIES (NEW)': row['SEGMENT / COMPANIES'],
              'REPORT OVERVIEW': row['REPORT OVERVIEW'],
              'SEGMENTATION (Legacy)': row['SEGMENTATION'],
              'COMPANIES (Legacy)': row['COMPANIES'],
              'CATEGORIES': row['CATEGORIES']
            },
            'Cleaned Values': {
              'cleanSegmentCompanies (NEW)': cleanSegmentCompanies,
              'cleanDescription': cleanDescription,
              'cleanSegment (Legacy)': cleanSegment,
              'cleanCompanies (Legacy)': cleanCompanies,
              'category': category
            },
            'FINAL VALIDATION': {
              'segmentCompanies field will be saved as': reportData.segmentCompanies,
              'segmentCompanies is empty?': !reportData.segmentCompanies || reportData.segmentCompanies === '',
              'segmentCompanies length': reportData.segmentCompanies ? reportData.segmentCompanies.length : 0,
              'segment (Legacy) field will be saved as': reportData.segment,
              'segment (Legacy) is empty?': !reportData.segment || reportData.segment === '',
              'segment (Legacy) length': reportData.segment ? reportData.segment.length : 0,
              'HAS FORMATTING TAGS': reportData.segmentCompanies ? (reportData.segmentCompanies.includes('<b>') || reportData.segmentCompanies.includes('<strong>')) : false
            }
          });
        }

        // Add to batch instead of saving immediately
        reportBatch.push(reportData);

        // Process batch when it reaches batchSize or is the last item
        if (reportBatch.length >= batchSize || i === data.length - 1) {
          console.log(`Processing batch of ${reportBatch.length} reports...`);

          // Optimized bulk processing with better error handling and duplicate prevention
          try {
            // Handle different duplicate strategies
            const bulkOps = [];

            for (const reportData of reportBatch) {
              const filter = reportData.reportCode && reportData.reportCode.trim()
                ? { reportCode: reportData.reportCode }
                : {
                  $or: [
                    { slug: reportData.slug },
                    { title: reportData.title }
                  ]
                };

              if (duplicateHandling === 'skip') {
                // Skip duplicates - only insert if not exists
                const existing = await Report.findOne(filter);
                if (!existing) {
                  bulkOps.push({
                    insertOne: {
                      document: reportData
                    }
                  });
                } else {
                  skippedCount++;
                }
              } else if (duplicateHandling === 'create') {
                // Always create new - don't check for duplicates
                bulkOps.push({
                  insertOne: {
                    document: reportData
                  }
                });
              } else {
                // Default: update existing or create new (upsert)
                bulkOps.push({
                  updateOne: {
                    filter: filter,
                    update: { $set: reportData },
                    upsert: true
                  }
                });
              }
            }

            const bulkResult = await Report.bulkWrite(bulkOps, {
              ordered: false,
              writeConcern: { w: 1 }
            });

            insertedCount += bulkResult.insertedCount || 0;
            updatedCount += bulkResult.modifiedCount || 0;
            insertedCount += bulkResult.upsertedCount || 0;

            if (data.length <= 100) {
              console.log(`✅ Batch completed: +${bulkResult.insertedCount || 0} new, ~${bulkResult.modifiedCount || 0} updated, ^${bulkResult.upsertedCount || 0} upserted`);
              if (bulkResult.modifiedCount > 0) {
                console.log(`🔄 ${bulkResult.modifiedCount} duplicate(s) detected and updated instead of creating new records`);
              }

              if (reportBatch.length > 0) {
                const firstReport = reportBatch[0];
                if (firstReport.title) {
                  try {
                    const savedReport = await Report.findOne({ title: firstReport.title }).lean();
                    if (savedReport) {
                      console.log('🔍 POST-SAVE VERIFICATION - SEGMENTATION data in database:', {
                        'Report Title': savedReport.title,
                        'segment field in DB': savedReport.segment,
                        'segment length': savedReport.segment ? savedReport.segment.length : 0,
                        'segment is empty?': !savedReport.segment || savedReport.segment === '',
                        'companies field in DB': savedReport.companies,
                        'reportDescription field in DB': savedReport.reportDescription,
                        'HAS FORMATTING IN DB': savedReport.segment ? (savedReport.segment.includes('<b>') || savedReport.segment.includes('<strong>')) : false,
                        'SEO FIELDS in DB': {
                          'titleTag': savedReport.titleTag,
                          'slug': savedReport.slug,
                          'url': savedReport.url,
                          'metaDescription': savedReport.metaDescription,
                          'keywords': savedReport.keywords
                        }
                      });
                    }
                  } catch (verifyError) {
                    console.error('❌ Post-save verification failed:', verifyError.message);
                  }
                }
              }
            }

          } catch (bulkError) {
            console.error('❌ Bulk operation failed:', bulkError.message);

            // Fallback to individual processing for this batch with duplicate prevention
            for (const reportData of reportBatch) {
              try {
                let result;
                if (reportData.reportCode && reportData.reportCode.trim()) {
                  // Use reportCode as primary identifier
                  result = await Report.findOneAndUpdate(
                    { reportCode: reportData.reportCode },
                    reportData,
                    { new: true, upsert: true, runValidators: true }
                  );
                } else {
                  // Use title or slug to prevent duplicates
                  result = await Report.findOneAndUpdate(
                    {
                      $or: [
                        { slug: reportData.slug },
                        { title: reportData.title }
                      ]
                    },
                    reportData,
                    { new: true, upsert: true, runValidators: true }
                  );
                }

                // Check if this was an insert or update
                if (result.isNew !== false) {
                  insertedCount++;
                } else {
                  updatedCount++;
                }
              } catch (individualError) {
                failedCount++;
                errors.push({
                  row: reportBatch.indexOf(reportData) + 1,
                  title: reportData.title || 'Unknown',
                  reportCode: reportData.reportCode || 'N/A',
                  error: individualError.message
                });
              }
            }
          }

          reportBatch.length = 0; // Clear the batch

          // Progress update for large files
          if (data.length > 100) {
            const progress = ((i + 1) / data.length * 100).toFixed(1);
            console.log(`📊 Progress: ${progress}% (${insertedCount + updatedCount} processed, ${failedCount} failed)`);
          }
        }
      } catch (error) {
        console.error('Error processing row:', error);
        console.error('Row data:', row);
        console.error('Processed data:', {
          cleanTitle, cleanSubTitle, cleanDescription, cleanSegment, category, subCategory
        });
        failedCount++;
        errors.push({
          title: cleanTitle || 'Unknown',
          reportCode: reportCode || 'Unknown',
          error: error.message,
          stack: error.stack,
          rowData: Object.keys(row).slice(0, 10).reduce((obj, key) => {
            obj[key] = row[key];
            return obj;
          }, {})
        });
      }
    }

    // Performance summary
    const totalTime = (Date.now() - startTime) / 1000;
    const rate = data.length / totalTime;

    console.log(`🎉 Import completed in ${totalTime.toFixed(2)}s (${rate.toFixed(1)} records/sec)`);
    console.log(`📊 Results: ${insertedCount} new, ${updatedCount} updated, ${failedCount} failed`);

    // Clean up uploaded file
    try {
      fs.unlinkSync(req.file.path);
    } catch (cleanupError) {
      console.warn('⚠️  Failed to cleanup uploaded file:', cleanupError.message);
    }

    const totalProcessed = insertedCount + updatedCount + skippedCount;
    const successRate = ((totalProcessed / data.length) * 100).toFixed(1);

    console.log(`📊 Final Results: ${insertedCount} new, ${updatedCount} updated, ${skippedCount} skipped, ${failedCount} failed`);
    console.log(`🏷️ Categories: ${categoriesCreated} new categories, ${subcategoriesCreated} new subcategories created`);

    res.status(201).json({
      success: true,
      message: `Import completed: ${totalProcessed}/${data.length} records processed (${successRate}% success rate)`,
      stats: {
        total: data.length,
        inserted: insertedCount,
        updated: updatedCount,
        skipped: skippedCount,
        failed: failedCount,
        duplicates: skippedCount + updatedCount,
        successRate: parseFloat(successRate),
        processingTime: totalTime,
        recordsPerSecond: parseFloat(rate.toFixed(1)),
        categoriesCreated: categoriesCreated,
        subcategoriesCreated: subcategoriesCreated
      },
      categories: {
        created: categoriesCreated,
        subcategoriesCreated: subcategoriesCreated,
        message: categoriesCreated > 0 || subcategoriesCreated > 0
          ? `Auto-created ${categoriesCreated} categories and ${subcategoriesCreated} subcategories from Excel data`
          : 'No new categories or subcategories were needed'
      },
      errors: errors.slice(0, 10), // Limit errors in response
      note: failedCount > 0 ? `${failedCount} records failed. Check logs for details.` : 'All records processed successfully'
    });

  } catch (error) {
    console.error('❌ Critical error during bulk import:', error);

    // Clean up uploaded file
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.warn('⚠️  Failed to cleanup uploaded file after error:', cleanupError.message);
      }
    }

    // Return structured error response
    res.status(500).json({
      success: false,
      error: 'Import Failed',
      message: error.message || 'An unexpected error occurred during import',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ========================================
// PUBLIC SLUG-BASED OPERATIONS
// ========================================

// Middleware to validate slug and find published report
const validateSlugAndReport = async (req, res, next) => {
  try {
    const { slug } = req.params

    if (!slug) {
      return res.status(400).json({
        success: false,
        error: 'Slug is required'
      })
    }

    // Find report by slug
    const report = await Report.findOne({
      slug: slug.toLowerCase(),
      status: 'published' // Only show published reports
    }).lean()

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
        message: 'The requested report does not exist or is not published'
      })
    }

    // Attach report to request object
    req.report = report
    next()
  } catch (error) {
    console.error('Slug validation error:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to validate report slug'
    })
  }
}

// Helper function to track interactions
const trackInteraction = async (reportId, interactionType, metadata = {}) => {
  try {
    console.log(`📊 Interaction tracked: ${interactionType} for report ${reportId}`, metadata)
    // You can implement analytics tracking here
  } catch (error) {
    console.error('Failed to track interaction:', error)
  }
}

// 1. Reports Store - List all published reports
// GET /api/reports/public/store
router.get('/public/store', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      search,
      featured,
      popular
    } = req.query

    const query = { status: 'published' }

    // Add filters
    if (category) query.category = category
    if (featured === 'true') query.featured = true
    if (popular === 'true') query.popular = true
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { summary: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ]
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)

    const [reports, total] = await Promise.all([
      Report.find(query)
        .select('title slug summary category subCategory price currency coverImage publishDate featured popular')
        .sort({ publishDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Report.countDocuments(query)
    ])

    await trackInteraction(null, 'reports_store_view', {
      page,
      limit,
      total,
      filters: { category, search, featured, popular }
    })

    res.json({
      success: true,
      data: {
        reports,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    })
  } catch (error) {
    console.error('Reports store error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reports'
    })
  }
})

// 2. Individual Report View by Slug
// GET /api/reports/public/:slug
router.get('/public/:slug', validateSlugAndReport, async (req, res) => {
  try {
    const report = req.report

    // Track report view
    await trackInteraction(report._id, 'report_view', {
      slug: report.slug,
      title: report.title
    })

    // Return full report details with action URLs
    res.json({
      success: true,
      data: {
        report: {
          ...report,
          // Generate related URLs for frontend
          actionUrls: {
            sampleRequest: `/api/reports/request-sample/${report.slug}`,
            buyNow: `/api/reports/buy-now/${report.slug}`,
            inquiry: `/api/reports/inquiry/${report.slug}`,
            talkToAnalyst: `/api/reports/talk-to-analyst/${report.slug}`,
            thankYou: `/api/reports/thank-you/${report.slug}`
          }
        }
      }
    })
  } catch (error) {
    console.error('Report view error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch report details'
    })
  }
})

// 3. Request Sample Operations
// GET /api/reports/request-sample/:slug
router.get('/request-sample/:slug', validateSlugAndReport, async (req, res) => {
  try {
    const report = req.report

    await trackInteraction(report._id, 'sample_request_page_view', {
      slug: report.slug
    })

    res.json({
      success: true,
      data: {
        report: {
          _id: report._id,
          title: report.title,
          slug: report.slug,
          summary: report.summary,
          category: report.category,
          coverImage: report.coverImage
        },
        action: 'sample_request',
        message: 'Sample request page loaded successfully',
        formFields: [
          { name: 'name', type: 'text', required: true, label: 'Full Name' },
          { name: 'email', type: 'email', required: true, label: 'Email Address' },
          { name: 'phone', type: 'tel', required: false, label: 'Phone Number' },
          { name: 'company', type: 'text', required: false, label: 'Company Name' },
          { name: 'jobTitle', type: 'text', required: false, label: 'Job Title' },
          { name: 'country', type: 'text', required: false, label: 'Country' },
          { name: 'message', type: 'textarea', required: false, label: 'Additional Message' }
        ]
      }
    })
  } catch (error) {
    console.error('Sample request page error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to load sample request page'
    })
  }
})

// POST /api/reports/request-sample/:slug - Submit sample request
router.post('/request-sample/:slug', validateSlugAndReport, async (req, res) => {
  try {
    const report = req.report
    const {
      name,
      email,
      phone,
      company,
      jobTitle,
      country,
      message
    } = req.body

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required'
      })
    }

    // Import Inquiry model and email functions
    const Inquiry = (await import('../models/Inquiry.js')).default
    const { sendNotification, sendAutoResponse } = await import('./inquiries.js')

    // Create inquiry record
    const inquiry = await Inquiry.create({
      inquiryType: 'Request for Sample',
      name: name.trim(),
      email: email.trim(),
      phone: phone?.trim() || '',
      company: company?.trim() || '',
      jobTitle: jobTitle?.trim() || '',
      country: country?.trim() || '',
      message: message?.trim() || `Sample request for: ${report.title}`,
      pageReportTitle: report.title,
      reportCode: report.reportCode || '',
      reportId: report._id,
      reportTitle: report.title,
      reportSlug: report.slug,
      status: 'new'
    })

    // Send email notifications to Webmail (non-blocking but isolated)
    sendNotification(inquiry)
      .then(async (result) => {
        if (!result?.success) {
          console.warn('⚠️ [Report Sample] First notification attempt to Webmail failed, retrying once in 1s...');
          await new Promise((r) => setTimeout(r, 1000));
          return sendNotification(inquiry);
        }
      })
      .catch((err) => {
        console.error('❌ [Report Sample] Email notification error:', err);
      });

    if (inquiry.email && inquiry.email.includes('@')) {
      sendAutoResponse(inquiry).catch((err) => {
        console.warn('⚠️ [Report Sample] Customer auto-response notice:', err?.message || err);
      });
    }

    await trackInteraction(report._id, 'sample_request_submitted', {
      inquiryId: inquiry._id,
      email: email.trim()
    })

    res.json({
      success: true,
      data: {
        inquiryId: inquiry._id,
        message: 'Sample request submitted successfully',
        redirectUrl: `/api/reports/thank-you/${report.slug}?type=sample`,
        nextSteps: [
          'We will send the sample report to your email within 24 hours',
          'Check your spam folder if you don\'t receive it',
          'Contact us if you need any assistance'
        ]
      }
    })
  } catch (error) {
    console.error('Sample request submission error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to submit sample request'
    })
  }
})

// 4. Buy Now Operations
// GET /api/reports/buy-now/:slug
router.get('/buy-now/:slug', validateSlugAndReport, async (req, res) => {
  try {
    const report = req.report

    await trackInteraction(report._id, 'buy_now_page_view', {
      slug: report.slug
    })

    res.json({
      success: true,
      data: {
        report: {
          _id: report._id,
          title: report.title,
          slug: report.slug,
          summary: report.summary,
          category: report.category,
          price: report.price,
          currency: report.currency,
          coverImage: report.coverImage,
          // License pricing options
          pricing: {
            singleUser: {
              price: report.singleUserPrice || report.singleUserLicense || report.price,
              description: 'Single User License - For individual use'
            },
            excelDatapack: {
              price: report.excelDatapackPrice || report.excelDataPackLicense,
              description: 'Excel Datapack - Raw data in Excel format'
            },
            enterprise: {
              price: report.enterprisePrice || report.enterpriseLicensePrice,
              description: 'Enterprise License - For organizational use'
            }
          }
        },
        action: 'buy_now',
        message: 'Buy now page loaded successfully',
        formFields: [
          {
            name: 'licenseType', type: 'select', required: true, label: 'License Type',
            options: [
              { value: 'single_user', label: 'Single User License' },
              { value: 'excel_datapack', label: 'Excel Datapack' },
              { value: 'enterprise', label: 'Enterprise License' }
            ]
          },
          { name: 'customerName', type: 'text', required: true, label: 'Full Name' },
          { name: 'customerEmail', type: 'email', required: true, label: 'Email Address' },
          { name: 'customerPhone', type: 'tel', required: false, label: 'Phone Number' },
          { name: 'customerCompany', type: 'text', required: false, label: 'Company Name' }
        ]
      }
    })
  } catch (error) {
    console.error('Buy now page error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to load buy now page'
    })
  }
})

// POST /api/reports/buy-now/:slug - Create order
router.post('/buy-now/:slug', validateSlugAndReport, async (req, res) => {
  try {
    const report = req.report
    const {
      licenseType = 'single_user',
      customerName,
      customerEmail,
      customerPhone,
      customerCompany,
      billingInfo
    } = req.body

    // Validate customer info
    if (!customerName || !customerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Customer name and email are required'
      })
    }

    // Determine price based on license type
    let price = report.price || 0
    let licenseDescription = 'Single User License'

    switch (licenseType) {
      case 'excel_datapack':
        price = parseFloat(report.excelDatapackPrice?.replace(/[^0-9.]/g, '') || report.price || 0)
        licenseDescription = 'Excel Datapack License'
        break
      case 'enterprise':
        price = parseFloat(report.enterprisePrice?.replace(/[^0-9.]/g, '') || report.price || 0)
        licenseDescription = 'Enterprise License'
        break
      default:
        price = parseFloat(report.singleUserPrice?.replace(/[^0-9.]/g, '') || report.price || 0)
        break
    }

    // Import Order model
    const Order = (await import('../models/Order.js')).default

    // Create order
    const order = await Order.create({
      reportId: report._id,
      reportTitle: report.title,
      reportSlug: report.slug,
      licenseType,
      licenseDescription,
      price,
      currency: report.currency || 'USD',
      customer: {
        name: customerName.trim(),
        email: customerEmail.trim(),
        phone: customerPhone?.trim() || '',
        company: customerCompany?.trim() || ''
      },
      billing: billingInfo || {},
      status: 'pending',
      orderDate: new Date()
    })

    await trackInteraction(report._id, 'order_created', {
      orderId: order._id,
      licenseType,
      price,
      email: customerEmail.trim()
    })

    res.json({
      success: true,
      data: {
        orderId: order._id,
        message: 'Order created successfully',
        order: {
          id: order._id,
          reportTitle: report.title,
          licenseType,
          licenseDescription,
          price,
          currency: order.currency,
          status: order.status
        },
        // Return payment URL or next steps
        nextSteps: {
          paymentUrl: `/payment/${order._id}`,
          redirectUrl: `/api/reports/thank-you/${report.slug}?type=order&orderId=${order._id}`
        }
      }
    })
  } catch (error) {
    console.error('Order creation error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to create order'
    })
  }
})

// 5. Inquiry Before Buying Operations
// GET /api/reports/inquiry/:slug
router.get('/inquiry/:slug', validateSlugAndReport, async (req, res) => {
  try {
    const report = req.report

    await trackInteraction(report._id, 'inquiry_page_view', {
      slug: report.slug
    })

    res.json({
      success: true,
      data: {
        report: {
          _id: report._id,
          title: report.title,
          slug: report.slug,
          summary: report.summary,
          category: report.category,
          coverImage: report.coverImage,
          pricing: {
            singleUser: report.singleUserPrice || report.singleUserLicense,
            excelDatapack: report.excelDatapackPrice || report.excelDataPackLicense,
            enterprise: report.enterprisePrice || report.enterpriseLicensePrice
          }
        },
        action: 'inquiry',
        message: 'Inquiry page loaded successfully',
        formFields: [
          { name: 'name', type: 'text', required: true, label: 'Full Name' },
          { name: 'email', type: 'email', required: true, label: 'Email Address' },
          { name: 'phone', type: 'tel', required: false, label: 'Phone Number' },
          { name: 'company', type: 'text', required: false, label: 'Company Name' },
          { name: 'jobTitle', type: 'text', required: false, label: 'Job Title' },
          { name: 'country', type: 'text', required: false, label: 'Country' },
          {
            name: 'inquiryType', type: 'select', required: false, label: 'Inquiry Type',
            options: [
              { value: 'Inquiry Before Buying', label: 'General Inquiry' },
              { value: 'Pricing Information', label: 'Pricing Information' },
              { value: 'Custom Requirements', label: 'Custom Requirements' },
              { value: 'Bulk Purchase', label: 'Bulk Purchase' }
            ]
          },
          { name: 'message', type: 'textarea', required: true, label: 'Your Message' }
        ]
      }
    })
  } catch (error) {
    console.error('Inquiry page error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to load inquiry page'
    })
  }
})

// POST /api/reports/inquiry/:slug - Submit inquiry
router.post('/inquiry/:slug', validateSlugAndReport, async (req, res) => {
  try {
    const report = req.report
    const {
      name,
      email,
      phone,
      company,
      jobTitle,
      country,
      message,
      inquiryType = 'Inquiry Before Buying'
    } = req.body

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and message are required'
      })
    }

    // Import Inquiry model and email functions
    const Inquiry = (await import('../models/Inquiry.js')).default
    const { sendNotification, sendAutoResponse } = await import('./inquiries.js')

    // Create inquiry record
    const inquiry = await Inquiry.create({
      inquiryType: inquiryType || 'Inquiry Before Buying',
      name: name.trim(),
      email: email.trim(),
      phone: phone?.trim() || '',
      company: company?.trim() || '',
      jobTitle: jobTitle?.trim() || '',
      country: country?.trim() || '',
      message: message.trim(),
      pageReportTitle: report.title,
      reportCode: report.reportCode || '',
      reportId: report._id,
      reportTitle: report.title,
      reportSlug: report.slug,
      status: 'new'
    })

    // Send email notifications to Webmail (non-blocking but isolated)
    sendNotification(inquiry)
      .then(async (result) => {
        if (!result?.success) {
          console.warn('⚠️ [Report Inquiry] First notification attempt to Webmail failed, retrying once in 1s...');
          await new Promise((r) => setTimeout(r, 1000));
          return sendNotification(inquiry);
        }
      })
      .catch((err) => {
        console.error('❌ [Report Inquiry] Email notification error:', err);
      });

    if (inquiry.email && inquiry.email.includes('@')) {
      sendAutoResponse(inquiry).catch((err) => {
        console.warn('⚠️ [Report Inquiry] Customer auto-response notice:', err?.message || err);
      });
    }

    await trackInteraction(report._id, 'inquiry_submitted', {
      inquiryId: inquiry._id,
      inquiryType,
      email: email.trim()
    })

    res.json({
      success: true,
      data: {
        inquiryId: inquiry._id,
        message: 'Inquiry submitted successfully',
        redirectUrl: `/api/reports/thank-you/${report.slug}?type=inquiry`,
        nextSteps: [
          'We have received your inquiry',
          'Our team will respond within 24 hours',
          'You will receive updates via email'
        ]
      }
    })
  } catch (error) {
    console.error('Inquiry submission error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to submit inquiry'
    })
  }
})

// 6. Talk to Analyst Operations
// GET /api/reports/talk-to-analyst/:slug
router.get('/talk-to-analyst/:slug', validateSlugAndReport, async (req, res) => {
  try {
    const report = req.report

    await trackInteraction(report._id, 'talk_to_analyst_page_view', {
      slug: report.slug
    })

    res.json({
      success: true,
      data: {
        report: {
          _id: report._id,
          title: report.title,
          slug: report.slug,
          summary: report.summary,
          category: report.category,
          coverImage: report.coverImage
        },
        action: 'talk_to_analyst',
        message: 'Talk to analyst page loaded successfully',
        analystInfo: {
          availability: 'Available for consultation',
          responseTime: '24-48 hours',
          consultationTypes: [
            'Report clarification',
            'Custom analysis',
            'Market insights',
            'Data interpretation',
            'Industry trends discussion'
          ]
        },
        formFields: [
          { name: 'name', type: 'text', required: true, label: 'Full Name' },
          { name: 'email', type: 'email', required: true, label: 'Email Address' },
          { name: 'phone', type: 'tel', required: true, label: 'Phone Number' },
          { name: 'company', type: 'text', required: false, label: 'Company Name' },
          { name: 'jobTitle', type: 'text', required: false, label: 'Job Title' },
          { name: 'country', type: 'text', required: false, label: 'Country' },
          {
            name: 'consultationType', type: 'select', required: false, label: 'Consultation Type',
            options: [
              { value: 'General Consultation', label: 'General Consultation' },
              { value: 'Report Clarification', label: 'Report Clarification' },
              { value: 'Custom Analysis', label: 'Custom Analysis' },
              { value: 'Market Insights', label: 'Market Insights' },
              { value: 'Data Interpretation', label: 'Data Interpretation' }
            ]
          },
          { name: 'preferredTime', type: 'text', required: false, label: 'Preferred Time/Date' },
          { name: 'message', type: 'textarea', required: false, label: 'Additional Details' }
        ]
      }
    })
  } catch (error) {
    console.error('Talk to analyst page error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to load talk to analyst page'
    })
  }
})

// POST /api/reports/talk-to-analyst/:slug - Schedule analyst consultation
router.post('/talk-to-analyst/:slug', validateSlugAndReport, async (req, res) => {
  try {
    const report = req.report
    const {
      name,
      email,
      phone,
      company,
      jobTitle,
      country,
      message,
      preferredTime,
      consultationType = 'General Consultation'
    } = req.body

    // Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and phone are required for analyst consultation'
      })
    }

    // Import Inquiry model and email functions
    const Inquiry = (await import('../models/Inquiry.js')).default
    const { sendNotification, sendAutoResponse } = await import('./inquiries.js')

    // Create inquiry record for analyst consultation
    const inquiry = await Inquiry.create({
      inquiryType: 'Talk to Analyst/Expert',
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      company: company?.trim() || '',
      jobTitle: jobTitle?.trim() || '',
      country: country?.trim() || '',
      message: `${message?.trim() || ''}\n\nConsultation Type: ${consultationType}\nPreferred Time: ${preferredTime || 'Not specified'}`,
      pageReportTitle: report.title,
      reportCode: report.reportCode || '',
      reportId: report._id,
      reportTitle: report.title,
      reportSlug: report.slug,
      status: 'new',
      metadata: {
        consultationType,
        preferredTime: preferredTime || null
      }
    })

    // Send email notifications to Webmail (non-blocking but isolated)
    sendNotification(inquiry)
      .then(async (result) => {
        if (!result?.success) {
          console.warn('⚠️ [Report Talk Analyst] First notification attempt to Webmail failed, retrying once in 1s...');
          await new Promise((r) => setTimeout(r, 1000));
          return sendNotification(inquiry);
        }
      })
      .catch((err) => {
        console.error('❌ [Report Talk Analyst] Email notification error:', err);
      });

    if (inquiry.email && inquiry.email.includes('@')) {
      sendAutoResponse(inquiry).catch((err) => {
        console.warn('⚠️ [Report Talk Analyst] Customer auto-response notice:', err?.message || err);
      });
    }

    await trackInteraction(report._id, 'analyst_consultation_requested', {
      inquiryId: inquiry._id,
      consultationType,
      email: email.trim()
    })

    res.json({
      success: true,
      data: {
        inquiryId: inquiry._id,
        message: 'Analyst consultation request submitted successfully',
        expectedResponse: '24-48 hours',
        redirectUrl: `/api/reports/thank-you/${report.slug}?type=analyst`,
        nextSteps: [
          'Our analyst will contact you within 24-48 hours',
          'Please keep your phone available',
          'You will receive a confirmation email'
        ]
      }
    })
  } catch (error) {
    console.error('Analyst consultation request error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to submit analyst consultation request'
    })
  }
})

// 7. Thank You Page
// GET /api/reports/thank-you/:slug
router.get('/thank-you/:slug', validateSlugAndReport, async (req, res) => {
  try {
    const report = req.report
    const { type, orderId, inquiryId } = req.query

    await trackInteraction(report._id, 'thank_you_page_view', {
      slug: report.slug,
      type,
      orderId,
      inquiryId
    })

    let message = 'Thank you for your interest!'
    let nextSteps = []
    let additionalInfo = {}

    switch (type) {
      case 'sample':
        message = 'Thank you for requesting a sample!'
        nextSteps = [
          'We will send the sample report to your email within 24 hours',
          'Check your spam folder if you don\'t receive it',
          'Contact us if you need any assistance'
        ]
        break
      case 'order':
        message = 'Thank you for your order!'
        nextSteps = [
          'Your order has been received and is being processed',
          'You will receive a confirmation email shortly',
          'The report will be delivered within 24-48 hours'
        ]
        if (orderId) {
          additionalInfo.orderId = orderId
          additionalInfo.orderStatus = 'Processing'
        }
        break
      case 'inquiry':
        message = 'Thank you for your inquiry!'
        nextSteps = [
          'We have received your inquiry',
          'Our team will respond within 24 hours',
          'You will receive updates via email'
        ]
        break
      case 'analyst':
        message = 'Thank you for requesting analyst consultation!'
        nextSteps = [
          'Our analyst will contact you within 24-48 hours',
          'Please keep your phone available',
          'You will receive a confirmation email'
        ]
        break
      default:
        nextSteps = [
          'We have received your request',
          'Our team will get back to you soon'
        ]
    }

    res.json({
      success: true,
      data: {
        report: {
          title: report.title,
          slug: report.slug,
          category: report.category
        },
        message,
        nextSteps,
        type,
        additionalInfo,
        relatedReports: {
          url: `/api/reports/public/store?category=${encodeURIComponent(report.category)}`,
          message: 'Explore more reports in this category'
        },
        contactInfo: {
          email: 'support@bizwitresearch.com',
          phone: '+1-XXX-XXX-XXXX',
          businessHours: 'Monday to Friday, 9 AM to 6 PM EST'
        }
      }
    })
  } catch (error) {
    console.error('Thank you page error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to load thank you page'
    })
  }
})

// Additional utility routes for slug operations

// Get report by slug (for internal use)
router.get('/slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params
    const report = await Report.findOne({
      slug: slug.toLowerCase(),
      status: 'published'
    }).lean()

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      })
    }

    res.json({
      success: true,
      data: { report }
    })
  } catch (error) {
    console.error('Report lookup error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch report'
    })
  }
})

// Validate slug availability
router.get('/validate-slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params
    const exists = await Report.exists({ slug: slug.toLowerCase() })

    res.json({
      success: true,
      data: {
        slug,
        available: !exists,
        exists: !!exists
      }
    })
  } catch (error) {
    console.error('Slug validation error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to validate slug'
    })
  }
})

// Get all available categories for filtering
router.get('/public/categories', async (req, res) => {
  try {
    const categories = await Report.distinct('category', { status: 'published' })
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const count = await Report.countDocuments({
          category,
          status: 'published'
        })
        return { name: category, count }
      })
    )

    res.json({
      success: true,
      data: {
        categories: categoriesWithCounts.filter(cat => cat.name && cat.name.trim())
      }
    })
  } catch (error) {
    console.error('Categories fetch error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories'
    })
  }
})

// POST /api/reports/import - Import processed Excel/CSV data
router.post('/import', authenticate, requireRole('super_admin', 'admin', 'editor'), async (req, res) => {
  try {
    const { reports, duplicateHandling = 'update' } = req.body

    if (!reports || !Array.isArray(reports) || reports.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No reports data provided'
      })
    }

    console.log(`🚀 Starting import of ${reports.length} reports with ${duplicateHandling} handling`)

    let created = 0
    let updated = 0
    let skipped = 0
    let errors = 0
    const errorDetails = []

    // Process reports with proper HTML formatting preservation
    for (let i = 0; i < reports.length; i++) {
      const reportData = reports[i]

      try {
        // Generate unique slug if not provided
        if (!reportData.slug && reportData.title) {
          reportData.slug = await generateUniqueSlug(reportData.title)
        }

        // Set default values
        reportData.status = reportData.status || 'draft'
        reportData.visibility = reportData.visibility || 'public'
        reportData.reportType = reportData.reportType || 'market-research'
        reportData.currency = reportData.currency || 'USD'
        reportData.format = reportData.format || 'pdf'
        reportData.author = reportData.author || req.user?.name || 'System'

        // Handle duplicates based on strategy
        const filter = reportData.reportCode && reportData.reportCode.trim()
          ? { reportCode: reportData.reportCode }
          : {
            $or: [
              { slug: reportData.slug },
              { title: reportData.title }
            ]
          }

        if (duplicateHandling === 'skip') {
          const existing = await Report.findOne(filter)
          if (existing) {
            skipped++
            continue
          }
          await Report.create(reportData)
          created++
        } else if (duplicateHandling === 'create') {
          // Force create new (may create duplicates)
          await Report.create(reportData)
          created++
        } else {
          // Default: update existing or create new
          const result = await Report.findOneAndUpdate(
            filter,
            { $set: reportData },
            { new: true, upsert: true, runValidators: true }
          )

          if (result.isNew !== false) {
            created++
          } else {
            updated++
          }
        }

      } catch (error) {
        console.error(`Error processing report ${i + 1}:`, error.message)
        errors++
        errorDetails.push({
          row: i + 1,
          title: reportData.title || 'Unknown',
          error: error.message
        })
      }
    }

    const stats = {
      total: reports.length,
      created,
      updated,
      skipped,
      errors
    }

    console.log('✅ Import completed:', stats)

    res.json({
      success: true,
      message: `Import completed: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors`,
      stats,
      errorDetails: errorDetails.slice(0, 10) // Limit error details
    })

  } catch (error) {
    console.error('❌ Import error:', error)
    res.status(500).json({
      success: false,
      error: 'Import failed',
      message: error.message
    })
  }
})

// Utility function to generate slug from title
function generateSlug(title) {
  if (!title) return ''
  return slugify(title, {
    lower: true,
    strict: true,
    remove: /[*+~.()'"!:@]/g
  })
}

// Migration endpoint to populate missing slugs
router.post('/migrate-slugs', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    console.log('🔄 Starting slug migration...')

    // Find reports without slugs or with empty slugs
    const reportsWithoutSlugs = await Report.find({
      $or: [
        { slug: { $exists: false } },
        { slug: '' },
        { slug: null }
      ]
    })

    console.log(`📊 Found ${reportsWithoutSlugs.length} reports without slugs`)

    let updated = 0
    let errors = 0
    const errorDetails = []

    for (const report of reportsWithoutSlugs) {
      try {
        const newSlug = generateSlug(report.title)

        if (newSlug) {
          // Check if slug already exists
          const existingReport = await Report.findOne({ slug: newSlug, _id: { $ne: report._id } })

          let finalSlug = newSlug
          if (existingReport) {
            // Add timestamp to make it unique
            finalSlug = `${newSlug}-${Date.now()}`
          }

          await Report.findByIdAndUpdate(report._id, { slug: finalSlug })
          console.log(`✅ Updated report "${report.title}" with slug: ${finalSlug}`)
          updated++
        } else {
          console.log(`⚠️ Could not generate slug for report: ${report.title}`)
          errorDetails.push({
            id: report._id,
            title: report.title,
            error: 'Could not generate slug from title'
          })
          errors++
        }
      } catch (error) {
        console.error(`❌ Error updating report ${report._id}:`, error.message)
        errorDetails.push({
          id: report._id,
          title: report.title,
          error: error.message
        })
        errors++
      }
    }

    console.log('✅ Slug migration completed:', { updated, errors })

    res.json({
      success: true,
      message: `Slug migration completed: ${updated} updated, ${errors} errors`,
      stats: {
        total: reportsWithoutSlugs.length,
        updated,
        errors
      },
      errorDetails: errorDetails.slice(0, 10)
    })

  } catch (error) {
    console.error('❌ Slug migration error:', error)
    res.status(500).json({
      success: false,
      error: 'Slug migration failed',
      message: error.message
    })
  }
})


export default router
