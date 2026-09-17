import mongoose from 'mongoose'
import { slugifyReportUrl } from '../utils/slugify.js'

const reportSchema = new mongoose.Schema({
  // Basic required fields
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  searchTitle: {
    type: String,
    trim: true,
    lowercase: true,
    select: false
  },

  // Content fields
  subTitle: {
    type: String,
    trim: true,
    default: ''
  },
  summary: {
    type: String,
    trim: true,
    default: ''
  },
  content: {
    type: String,
    default: ''
  },
  tableOfContents: {
    type: String,
    default: ''
  },

  // SEO fields
  titleTag: {
    type: String,
    trim: true,
    default: ''
  },
  url: {
    type: String,
    trim: true,
    default: ''
  },
  metaDescription: {
    type: String,
    trim: true,
    default: ''
  },
  keywords: {
    type: String,
    trim: true,
    default: ''
  },

  // Categories (consolidated definition)
  category: {
    type: String,
    trim: true,
    default: '',
    index: true
  },
  subCategory: {
    type: String,
    trim: true,
    default: '',
    index: true
  },

  // Domain and Region fields
  domain: {
    type: String,
    trim: true,
    default: ''
  },
  subdomain: {
    type: String,
    trim: true,
    default: ''
  },


  // Segmentation and Companies fields
  segmentCompanies: {
    type: String,
    trim: true,
    default: ''
  },
  // Legacy fields for backward compatibility
  segment: {
    type: String,
    trim: true,
    default: ''
  },
  segmentationContent: {
    type: String,
    trim: true,
    default: ''
  },
  companies: {
    type: String,
    trim: true,
    default: ''
  },
  reportDescription: {
    type: String,
    trim: true,
    default: ''
  },

  // Tags as simple string array
  tags: [String],

  // Images
  coverImage: {
    url: String,
    alt: String
  },
  images: [{
    url: String,
    alt: String,
    caption: String
  }],

  // Report Details
  reportCode: {
    type: String,
    trim: true,
    unique: true,
    sparse: true
  },
  numberOfPages: {
    type: Number,
    min: 1,
    default: 1
  },
  publishDate: {
    type: Date,
    default: Date.now
  },

  // Report metadata
  reportDate: {
    type: Date,
    default: Date.now
  },
  reportCategories: {
    type: String,
    trim: true,
    default: ''
  },


  // Pricing fields
  excelDatapackPrice: {
    type: String,
    trim: true,
    default: ''
  },
  singleUserPrice: {
    type: String,
    trim: true,
    default: ''
  },
  enterprisePrice: {
    type: String,
    trim: true,
    default: ''
  },
  internetHandlingCharges: {
    type: String,
    trim: true,
    default: ''
  },

  // Homepage display
  trendingReportForHomePage: {
    type: Boolean,
    default: false
  },

  // Status and flags
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  featured: {
    type: Boolean,
    default: false
  },
  popular: {
    type: Boolean,
    default: false
  },

  // SEO basic fields
  metaTitle: {
    type: String,
    trim: true
  },

  // Publishing info
  author: {
    type: String,
    trim: true
  },
  publishedAt: Date,

  // Access control
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },

  // Report specific
  industry: {
    type: String,
    trim: true
  },
  reportType: {
    type: String,
    default: 'market-research'
  },
  price: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  format: {
    type: String,
    enum: ['pdf', 'html', 'docx'],
    default: 'pdf'
  },

  // License fields
  excelDataPackLicense: {
    type: String,
    default: ''
  },
  singleUserLicense: {
    type: String,
    default: ''
  },
  enterpriseLicensePrice: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
})

// Simple text index for search
reportSchema.index({
  title: 'text',
  summary: 'text',
  content: 'text'
})

// Basic indexes (category and subCategory indexes are defined in schema with index: true)
reportSchema.index({ status: 1 })
reportSchema.index({ domain: 1 })

// Note: slug and reportCode indexes are automatically created by unique: true constraints
reportSchema.index({ trendingReportForHomePage: 1 })

// Auto-generate slug and searchTitle from title
reportSchema.pre('save', function (next) {
  if (this.isModified('title')) {
    this.searchTitle = this.title.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // Generate or normalize slug to ensure it's URL-safe without spaces
  if (!this.slug || (this.isModified('title') && !this.isModified('slug'))) {
    this.slug = slugifyReportUrl(this.title) || `report-${Date.now()}`;
  } else if (this.isModified('slug')) {
    this.slug = slugifyReportUrl(this.slug, this.title) || `report-${Date.now()}`;
  }

  // Auto-generate report code if not provided
  if (!this.reportCode) {
    const prefix = 'RPT'
    const timestamp = Date.now().toString().slice(-6)
    this.reportCode = `${prefix}${timestamp}`
  }

  next()
})

// Middleware to update category references when report is saved
reportSchema.post('save', async function (doc) {
  try {
    const Category = mongoose.model('Category')

    // Update category references if category is specified
    if (doc.category && doc.category.trim()) {
      const category = await Category.findOne({
        name: { $regex: new RegExp(`^${doc.category.trim()}$`, 'i') }
      })

      if (category) {
        // Add report to category if not already present
        if (!category.reports.includes(doc._id)) {
          category.reports.push(doc._id)
          category.reportCount = category.reports.length
          await category.save()
        }

        // Update subcategory references if subcategory is specified
        if (doc.subCategory && doc.subCategory.trim()) {
          const subcategory = category.subcategories.find(sub =>
            sub.name.toLowerCase() === doc.subCategory.trim().toLowerCase()
          )

          if (subcategory && !subcategory.reports.includes(doc._id)) {
            subcategory.reports.push(doc._id)
            subcategory.reportCount = subcategory.reports.length
            await category.save()
          }
        }
      }
    }
  } catch (error) {
    console.error('Error updating category references:', error)
  }
})

// Middleware to remove category references when report is deleted
reportSchema.post('findOneAndDelete', async function (doc) {
  if (!doc) return

  try {
    const Category = mongoose.model('Category')

    // Remove report from all categories and subcategories
    const categories = await Category.find({
      $or: [
        { reports: doc._id },
        { 'subcategories.reports': doc._id }
      ]
    })

    for (const category of categories) {
      // Remove from category reports
      category.reports = category.reports.filter(id => !id.equals(doc._id))
      category.reportCount = category.reports.length

      // Remove from subcategory reports
      category.subcategories.forEach(sub => {
        sub.reports = sub.reports.filter(id => !id.equals(doc._id))
        sub.reportCount = sub.reports.length
      })

      await category.save()
    }
  } catch (error) {
    console.error('Error removing category references:', error)
  }
})

const Report = mongoose.model('Report', reportSchema)

export default Report