import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import slugify from 'slugify'
import jwt from 'jsonwebtoken'
import Megatrend from '../models/Megatrend.js'
import MegatrendSubmission from '../models/MegatrendSubmission.js'
import SEOPage from '../models/SEOPage.js'
import Inquiry from '../models/Inquiry.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { sendMail } from '../utils/mailer.js'
import { sendNotification, sendAutoResponse, getNotificationRecipients } from './inquiries.js'

const router = Router()

// Storage config for uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext)
    const stamp = Date.now().toString(36)
    cb(null, `${slugify(base, { lower: true, strict: true })}-${stamp}${ext}`)
  }
})
const upload = multer({ storage })

// Helpers
const uniqueSlug = async (title, desired) => {
  let slug = desired || slugify(title || 'megatrend', { lower: true, strict: true })
  if (!slug) slug = Date.now().toString(36)
  let i = 0
  // ensure uniqueness
  while (true) {
    const exists = await Megatrend.findOne({ slug: i ? `${slug}-${i}` : slug }).lean()
    if (!exists) return i ? `${slug}-${i}` : slug
    i += 1
  }
}

async function notifySubmission(sub) {
  const recipients = getNotificationRecipients()
  const to = recipients.length === 1 ? recipients[0] : recipients
  const subject = `[Bizwit] Whitepaper Request: ${sub.megatrendTitle}`
  const text = `Name: ${sub.name}\nEmail: ${sub.email}\nCompany: ${sub.company}\nRole: ${sub.role}\nMegatrend: ${sub.megatrendTitle}\nAt: ${sub.createdAt?.toISOString()}`
  await sendMail({
    to,
    subject,
    text,
    replyTo: sub.email,
  })
}

// Public: list published megatrends
router.get("/public", async (req, res, next) => {
  try {
    const { q = "", tags, tag, limit = 50, offset = 0, isHome, isGtmStrategy } = req.query;
    const query = { status: "published" };
    if (isHome === "true") query.isHome = true;
    if (isGtmStrategy === "true") query.isGtmStrategy = true;
    if (q) {
      const rx = new RegExp(q, "i");
      query.$or = [
        { title: rx },
        { summary: rx },
        { content: rx },
        { tags: rx },
      ];
    }
    const tagList = [];
    if (tags)
      tagList.push(
        ...String(tags)
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      );
    if (tag) tagList.push(String(tag).toLowerCase());
    if (tagList.length) query.tags = { $all: tagList };

    const items = await Megatrend.find(query)
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(Number(offset))
      .limit(Math.min(200, Number(limit)));
    const total = await Megatrend.countDocuments(query);
    res.json({ items, total });
  } catch (e) {
    next(e);
  }
});

// Public: get one by slug (published only)
router.get("/public/:slug", async (req, res, next) => {
  try {
    const doc = await Megatrend.findOne({
      slug: req.params.slug,
      status: "published",
    });
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

// Public: submit whitepaper form and receive a short-lived token for download
router.post("/public/:slug/whitepaper", async (req, res, next) => {
  try {
    const mg = await Megatrend.findOne({
      slug: req.params.slug,
      status: "published",
    });
    if (!mg) return res.status(404).json({ error: "Megatrend not found" });
    if (!mg.whitepaper?.url)
      return res.status(400).json({ error: "Whitepaper not available" });

    const { name, email, company, role, agreed } = req.body || {};
    if (!name || !email || !company || !role) {
      return res
        .status(400)
        .json({ error: "Name, email, company, and role are required" });
    }

    const created = await MegatrendSubmission.create({
      megatrendId: mg._id ? String(mg._id) : mg.id,
      megatrendTitle: mg.title,
      name,
      email,
      company,
      role,
      agreed: !!agreed,
    });

    // Sync to main Inquiry collection for Admin -> Inquiry view and email delivery
    const inquiryDoc = await Inquiry.create({
      name,
      email,
      company,
      jobTitle: role || '',
      subject: `White Paper Request: ${mg.title}`,
      message: `Role: ${role || 'N/A'}. User requested whitepaper download for megatrend: ${mg.title}`,
      inquiryType: 'Download White Paper',
      pageReportTitle: mg.title,
      source: 'Megatrends API'
    }).catch((err) => console.error("Inquiry sync error in megatrends:", err));

    if (inquiryDoc) {
      sendNotification(inquiryDoc).catch((err) => console.error('Megatrends notification error:', err));
      sendAutoResponse(inquiryDoc).catch((err) => console.warn('Megatrends auto-response notice:', err));
    } else {
      notifySubmission(created).catch(() => {});
    }

    const token = jwt.sign(
      { sub: "whitepaper", mg: String(mg._id), ts: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: "10m" },
    );
    res.json({ ok: true, token });
  } catch (e) {
    next(e);
  }
});

// Public: download using token
router.get("/public/:slug/whitepaper/download", async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: "Token required" });
    let payload;
    try {
      payload = jwt.verify(String(token), process.env.JWT_SECRET);
    } catch (_) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    const mg = await Megatrend.findOne({
      slug: req.params.slug,
      status: "published",
    });
    if (!mg) return res.status(404).json({ error: "Megatrend not found" });
    if (String(mg._id) !== payload.mg)
      return res.status(400).json({ error: "Token mismatch" });
    if (!mg.whitepaper?.url)
      return res.status(400).json({ error: "Whitepaper not available" });
    // Redirect to file URL (served statically)
    return res.redirect(mg.whitepaper.url);
  } catch (e) {
    next(e);
  }
});

// Admin/editor below
// router.use(authenticate, requireRole('super_admin', 'admin', 'editor'))

// List (all)
router.get("/", async (req, res, next) => {
  try {
    const {
      q = "",
      status,
      tags,
      tag,
      limit = 50,
      offset = 0,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;
    const query = {};
    if (status) query.status = status;
    if (q) {
      const rx = new RegExp(q, "i");
      query.$or = [
        { title: rx },
        { summary: rx },
        { content: rx },
        { tags: rx },
      ];
    }
    const tagList = [];
    if (tags)
      tagList.push(
        ...String(tags)
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      );
    if (tag) tagList.push(String(tag).toLowerCase());
    if (tagList.length) query.tags = { $all: tagList };

    // Build sort object
    const sort = {};
    sort[sortBy] = order === "asc" ? 1 : -1;

    const items = await Megatrend.find(query)
      .sort(sort)
      .skip(Number(offset))
      .limit(Math.min(200, Number(limit)));
    const total = await Megatrend.countDocuments(query);
    res.json({ items, total });
  } catch (e) {
    next(e);
  }
});

// Create
router.post("/", async (req, res, next) => {
  try {
    const body = req.body || {}
    const slug = await uniqueSlug(body.title, body.slug || body.url)
    const doc = await Megatrend.create({ ...body, slug })
    res.status(201).json(doc)
  } catch (e) { next(e) }
})

// Read
router.get("/:id", async (req, res, next) => {
  try {
    const doc = await Megatrend.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

// Update
router.patch("/:id", async (req, res, next) => {
  try {
    const body = { ...req.body }
    if (body.title && !body.slug && !body.url) {
      body.slug = await uniqueSlug(body.title)
    } else if (body.slug || body.url) {
      body.slug = await uniqueSlug(body.title, body.slug || body.url)
    }
    const updated = await Megatrend.findByIdAndUpdate(req.params.id, body, { new: true })
    if (!updated) return res.status(404).json({ error: 'Not found' })
    res.json(updated)
  } catch (e) { next(e) }
})

// Delete
router.delete("/:id", async (req, res, next) => {
  try {
    const megatrend = await Megatrend.findById(req.params.id)
    const r = await Megatrend.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ error: "Not found" });
    if (megatrend?.slug) {
      await SEOPage.findOneAndDelete({ url: megatrend.slug }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Upload hero image
router.post("/:id/hero", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const fileUrl = `/uploads/${path.basename(req.file.path)}`;
    const updated = await Megatrend.findByIdAndUpdate(
      req.params.id,
      { heroImage: { url: fileUrl, alt: req.body?.alt || "" } },
      { new: true },
    );
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// Upload gallery image
router.post("/:id/images", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const fileUrl = `/uploads/${path.basename(req.file.path)}`;
    const updated = await Megatrend.findByIdAndUpdate(
      req.params.id,
      { $push: { images: { url: fileUrl, alt: req.body?.alt || "" } } },
      { new: true },
    );
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// Upload whitepaper (PDF or file)
router.post(
  "/:id/whitepaper",
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const fileUrl = `/uploads/${path.basename(req.file.path)}`;
      const updated = await Megatrend.findByIdAndUpdate(
        req.params.id,
        {
          whitepaper: {
            url: fileUrl,
            filename: req.file.originalname,
            size: req.file.size,
            mime: req.file.mimetype,
          },
        },
        { new: true },
      );
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) {
      next(e);
    }
  },
);

export default router;
