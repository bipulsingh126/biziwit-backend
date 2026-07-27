import express from 'express'
import * as fs from 'fs'
import dotenv from 'dotenv'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import path from 'path'
import { fileURLToPath } from 'url'
import { connectDB } from './src/config/db.js'
import { ssrHandler } from './src/utils/ssrHandler.js'
import { generateSitemap } from './src/utils/sitemapGenerator.js'
import customReportRoutes from './src/routes/customReports.js'
import megatrendSubmissionRoutes from './src/routes/megatrendSubmissions.js'
import authRoutes from './src/routes/auth.js'
import User from './src/models/User.js'
import reportsRoutes from './src/routes/reports.js'
import ordersRoutes from './src/routes/orders.js'
import Stripe from 'stripe'
import Order from './src/models/Order.js'
import inquiriesRoutes from './src/routes/inquiries.js'
import newsletterRoutes from './src/routes/newsletter.js'
import postsRoutes from './src/routes/posts.js'
import megatrendsRoutes from './src/routes/megatrends.js'
import customReportRequestsRoutes from './src/routes/customReportRequests.js'
import usersRoutes from './src/routes/users.js'
import analyticsRoutes from './src/routes/analytics.js'
import seoPagesRoutes from './src/routes/seoPages.js'
import categoriesRoutes from './src/routes/categories.js'
import blogsRoutes from './src/routes/blogs.js'
import caseStudiesRoutes from './src/routes/caseStudies.js'
import servicePagesRoutes from './src/routes/servicePages.js'
import homePageRoutes from './src/routes/homePage.js'
import testimonialsRoutes from './src/routes/testimonials.js'
import contentRoutes from './src/routes/content.js'
import socialShareRoutes from './src/routes/socialShare.js'

dotenv.config()

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'MONGODB_URI']
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar])

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '))
  console.error('Please copy .env.example to .env and configure the required variables')
  process.exit(1)
}

const app = express()

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || ''
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null

// Environment-based CORS origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:3001',
  'https://admin.bizwitresearch.com',
  'https://bizwitresearch.com',
  'https://api.bizwitresearch.com',
  process.env.FRONTEND_URL,
  process.env.ADMIN_URL
].filter(Boolean) // Remove undefined values

// --- www to non-www redirect (production only) ---
// IMPORTANT: This redirects FROM www TO non-www
// If you need the opposite (non-www to www), swap the logic
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const host = req.headers.host || '';

    // Redirect www.bizwitresearch.com → bizwitresearch.com
    if (host.startsWith('www.')) {
      const newHost = host.replace(/^www\./, '');
      return res.redirect(301, `https://${newHost}${req.originalUrl}`);
    }

    // If you need to redirect non-www → www instead, use this:
    // if (!host.startsWith('www.') && host.includes('bizwitresearch.com')) {
    //   return res.redirect(301, `https://www.${host}${req.originalUrl}`);
    // }

    next();
  });
}

// Security and CORS headers middleware
app.use((req, res, next) => {
  // Remove problematic headers
  res.removeHeader('Origin-Agent-Cluster')

  // Add security headers for cross-origin requests
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none')
  res.header('Cross-Origin-Opener-Policy', 'unsafe-none')
  res.header('Cross-Origin-Resource-Policy', 'cross-origin')

  // Special handling for static file requests (images, uploads)
  if (req.path.startsWith('/uploads') || req.path.startsWith('/images')) {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control')
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Last-Modified, ETag')
    res.header('Vary', 'Origin')
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      res.header('Access-Control-Allow-Origin', origin)
      res.header('Access-Control-Allow-Credentials', 'true')
    } else {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Credentials', 'false')
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control')
    return res.status(200).end()
  }

  next()
})


// CORS Configuration - Environment-aware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true)

    // In development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true)
    }

    // In production, check allowed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    // Fallback: allow all origins for now (can be restricted later)
    return callback(null, true)
  },
  credentials: true, // Enable credentials for authentication
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar']
}))

// Stripe webhook must be before JSON parser
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(400).send('Stripe not configured')
    const sig = req.headers['stripe-signature']
    const event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const orderId = session.metadata?.orderId
      if (orderId) {
        await Order.findByIdAndUpdate(orderId, {
          status: 'paid',
          payment: {
            provider: 'stripe',
            status: 'paid',
            currency: session.currency,
            amount: (session.amount_total || 0) / 100,
            stripe: { paymentIntentId: session.payment_intent, checkoutSessionId: session.id },
          }
        })
      }
    } else if (event.type === 'checkout.session.expired') {
      const session = event.data.object
      const orderId = session.metadata?.orderId
      if (orderId) {
        await Order.findByIdAndUpdate(orderId, { status: 'failed', 'payment.status': 'failed' })
      }
    }
    res.json({ received: true })
  } catch (err) {
    console.error('Stripe webhook error', err)
    res.status(400).send(`Webhook Error: ${err.message}`)
  }
})

// Configure Helmet with CORS-friendly settings and Content Security Policy
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "unsafe-none" },
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
      "img-src": ["'self'", "data:", "https://www.google.com", "https://www.gstatic.com", "https://*.stripe.com", "https://*.bizwitresearch.com"],
      "connect-src": [
        "'self'",
        "https://www.google.com",
        "https://www.gstatic.com",
        "https://api.bizwitresearch.com",
        "https://bizwitresearch.com",
        "http://localhost:*",
        "https://*.stripe.com"
      ],
      "frame-src": ["'self'", "https://www.google.com", "https://www.gstatic.com", "https://*.stripe.com"],
      "object-src": ["'none'"],
      "upgrade-insecure-requests": [],
    },
  },
}))


app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(morgan('dev'))
app.use(express.static("public"));

// Enhanced static file serving with comprehensive CORS headers
app.use('/uploads', (req, res, next) => {
  // Most permissive CORS headers for image serving
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.header('Access-Control-Allow-Headers', '*')
  res.header('Access-Control-Expose-Headers', '*')
  res.header('Cross-Origin-Resource-Policy', 'cross-origin')
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none')
  res.header('Cross-Origin-Opener-Policy', 'unsafe-none')

  // Cache headers for better performance
  res.header('Cache-Control', 'public, max-age=31536000') // 1 year cache
  res.header('Vary', 'Origin')

  // Handle OPTIONS requests for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  next()
}, express.static(UPLOAD_DIR, {
  // Additional express.static options for better file serving
  maxAge: '1y',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Set appropriate content type based on file extension
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg')
    } else if (path.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png')
    } else if (path.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif')
    } else if (path.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp')
    } else if (path.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml')
    }
  }
}))

app.use('/images', (req, res, next) => {
  // Most permissive CORS headers for image serving
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.header('Access-Control-Allow-Headers', '*')
  res.header('Access-Control-Expose-Headers', '*')
  res.header('Cross-Origin-Resource-Policy', 'cross-origin')
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none')
  res.header('Cross-Origin-Opener-Policy', 'unsafe-none')

  // Cache headers for better performance
  res.header('Cache-Control', 'public, max-age=31536000') // 1 year cache
  res.header('Vary', 'Origin')

  // Handle OPTIONS requests for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  next()
}, express.static(path.join(process.cwd(), 'public', 'images'), {
  // Additional express.static options for better file serving
  maxAge: '1y',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Set appropriate content type based on file extension
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg')
    } else if (path.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png')
    } else if (path.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif')
    } else if (path.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp')
    } else if (path.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml')
    }
  }
}))

// Explicit image serving route with CORS
app.get('/uploads/*', (req, res, next) => {
  // Set most permissive CORS headers
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.header('Access-Control-Allow-Headers', '*')
  res.header('Access-Control-Expose-Headers', '*')
  res.header('Cross-Origin-Resource-Policy', 'cross-origin')
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none')
  res.header('Cross-Origin-Opener-Policy', 'unsafe-none')

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  next()
})

// Explicit images serving route with CORS
app.get('/images/*', (req, res, next) => {
  // Set most permissive CORS headers
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.header('Access-Control-Allow-Headers', '*')
  res.header('Access-Control-Expose-Headers', '*')
  res.header('Cross-Origin-Resource-Policy', 'cross-origin')
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none')
  res.header('Cross-Origin-Opener-Policy', 'unsafe-none')

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  next()
})

// Health check
app.get('/health', (req, res) => res.json({ ok: true }))

// Favicon route to prevent 404 errors
app.get('/favicon.ico', (req, res) => res.status(204).end())

// --- robots.txt ---
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /uploads/
Disallow: /admin
Disallow: /*?*download-sample
Disallow: /*?*buy-now
Disallow: /*?*inquiry

Sitemap: https://www.bizwitresearch.com/sitemap.xml
`);
});

// --- Dynamic sitemap.xml ---
let sitemapCache = { xml: null, ts: 0 };
app.get('/sitemap.xml', async (req, res) => {
  try {
    const now = Date.now();
    // Cache sitemap for 1 hour
    if (sitemapCache.xml && (now - sitemapCache.ts) < 3600000) {
      res.type('application/xml');
      return res.send(sitemapCache.xml);
    }
    const xml = await generateSitemap();
    sitemapCache = { xml, ts: now };
    res.type('application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap generation error:', err);
    res.status(500).send('Error generating sitemap');
  }
});

// Root route moved to /api/status to allow SSR to handle homepage
app.get('/api/status', (req, res) => {
  res.json({
    message: 'bizwit Admin Panel API - Server is running',
    version: '1.0.0',
    status: 'Active'
  })
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/custom-reports', customReportRoutes)
app.use('/api/megatrend-submissions', megatrendSubmissionRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/orders', ordersRoutes)
app.use('/api/inquiries', inquiriesRoutes)
app.use('/api/newsletter', newsletterRoutes)
app.use('/api/posts', postsRoutes)
app.use('/api/megatrends', megatrendsRoutes)
app.use('/api/custom-report-requests', customReportRequestsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/seo-pages', seoPagesRoutes)
app.use('/api/categories', categoriesRoutes)
app.use('/api/blogs', blogsRoutes)
app.use('/api/case-studies', caseStudiesRoutes)
app.use('/api/service-pages', servicePagesRoutes)
app.use('/api/homepage', homePageRoutes)
app.use('/api/testimonials', testimonialsRoutes)
app.use('/api/content', contentRoutes)
app.use('/share', socialShareRoutes)

// --- SSR & Frontend Static Files ---

// Serve static files from frontend build (CSS, JS, Images)
// This must be BEFORE the SSR catch-all
// Production Path: /var/www/bizwit_code/dist (if configured)
// Local Path: ../dist (Vite builds to project root dist/)
const frontendDistPath = path.join(__dirname, '../frontend/dist');
console.log(`📂 Serving frontend static files from: ${frontendDistPath}`);

if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath, { index: false }));
} else {
  console.warn(`⚠️ Frontend build not found at ${frontendDistPath}. SSR will fail until built.`);
}

// SSR Handler (Catch-all for non-API routes)
// Using regex pattern instead of * for Express 5.x compatibility
app.get(/^\/(?!api\/|uploads\/|images\/|assets\/|index\.html|favicon\.ico|robots\.txt|sitemap\.xml).*/, ssrHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path
  })
})

// Image upload error handler
app.use((err, req, res, next) => {
  // Handle multer errors specifically
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'File too large',
      message: 'The uploaded file exceeds the maximum allowed size'
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      error: 'Too many files',
      message: 'Maximum number of files exceeded'
    });
  }

  if (err.message && err.message.includes('Only image files are allowed')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid file type',
      message: 'Only image files are allowed'
    });
  }

  // General error handler
  console.error('Error occurred:', err)
  res.status(err.status || 500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  })
})

// Seed default admin function
const seedDefaultAdmin = async () => {
  try {
    // Only create admin user if none exists
    const adminCount = await User.countDocuments({ role: { $in: ['admin', 'super_admin'] } })

    if (adminCount === 0) {
      console.log('📝 No admin users found. Creating default admin users...')

      // Create both mainadmin and admin users
      const defaultAdmins = [
        {
          name: 'Main Admin',
          email: 'mainadmin@bizwit.com',
          password: 'MainAdmin@2024',
          role: 'super_admin'
        },
        {
          name: 'Admin',
          email: 'admin@bizwit.com',
          password: 'Admin@123',
          role: 'admin'
        }
      ]

      for (const adminData of defaultAdmins) {
        try {
          await User.create(adminData)
          console.log(`✅ Created ${adminData.role}: ${adminData.email}`)
        } catch (err) {
          console.error(`❌ Failed to create ${adminData.email}:`, err.message)
        }
      }
    } else {
      console.log('✓ Admin users already exist')
    }
  } catch (error) {
    console.error('✗ Error seeding default admin:', error.message)
  }
}

export { app, connectDB, seedDefaultAdmin }
