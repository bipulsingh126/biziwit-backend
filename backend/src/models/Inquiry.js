import mongoose from 'mongoose'

const InquirySchema = new mongoose.Schema({
  inquiryNumber: { type: String, unique: true },
  slug: { type: String, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  company: { type: String, trim: true },
  jobTitle: { type: String, trim: true },
  country: { type: String, trim: true },
  reportCode: { type: String, trim: true },
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
  reportTitle: { type: String, trim: true },
  reportSlug: { type: String, trim: true },
  license: { type: String, trim: true },
  subject: { type: String, trim: true },
  message: { type: String, default: 'General Inquiry' },
  inquiryType: {
    type: String,
    enum: [
      'General Inquiry',
      'Report Request',
      'Custom Report',
      'Technical Support',
      'Partnership',
      'Media Inquiry',
      'Inquiry Before Buying',
      'Request for Sample',
      'Talk to Analyst/Expert',
      'Buy Now',
      'Contact Us',
      'Submit Your Profile',
      'Download White Paper',
      'White Paper Download',
      'Individual Service Page',
      'Subscription',
      'Other'
    ],
    default: 'General Inquiry',
    index: true
  },
  pageReportTitle: { type: String, trim: true }, // The page or report they're inquiring about
  source: { type: String, trim: true, default: 'website' },
  status: {
    type: String,
    enum: ['new', 'open', 'in_progress', 'resolved', 'closed'],
    default: 'new',
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tags: [{ type: String, trim: true }],
  notes: [{
    content: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  responseTime: { type: Date }, // When first response was sent
  resolvedAt: { type: Date }, // When inquiry was resolved
  meta: { type: Object },
}, { timestamps: true })

// Helper function to generate slug
InquirySchema.methods.generateSlug = function (baseText) {
  return baseText
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim('-');
};

// Generate inquiry number and slug before saving
InquirySchema.pre('save', async function (next) {
  if (!this.inquiryNumber) {
    const count = await mongoose.model('Inquiry').countDocuments()
    this.inquiryNumber = `INQ-${String(count + 1).padStart(6, '0')}`
  }

  // Generate slug if not provided or if inquiry number/subject changed
  if (!this.slug || this.isModified('inquiryNumber') || this.isModified('subject')) {
    let baseSlug = this.inquiryNumber.toLowerCase()
    if (this.subject) {
      const subjectSlug = this.generateSlug(this.subject)
      baseSlug = `${baseSlug}-${subjectSlug}`
    }

    let slug = baseSlug
    let counter = 1

    // Check for existing slugs and make unique
    while (await this.constructor.findOne({ slug: slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`
      counter++
    }

    this.slug = slug
  }

  next()
})

// Index for better search performance
InquirySchema.index({
  name: 'text',
  email: 'text',
  company: 'text',
  subject: 'text',
  message: 'text',
  pageReportTitle: 'text'
})

export default mongoose.model('Inquiry', InquirySchema)
