import { Router } from 'express'
import Stripe from 'stripe'
import paypal from '@paypal/checkout-server-sdk'
import Order from '../models/Order.js'
import { authenticate, requireRole } from '../middleware/auth.js'

const router = Router()

// Stripe init (optional if not configured)
const stripeSecret = process.env.STRIPE_SECRET_KEY || ''
const stripe = stripeSecret ? new Stripe(stripeSecret) : null

// PayPal client factory
function paypalClient() {
  const envName = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase()
  const clientId = process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  const environment = envName === 'live'
    ? new paypal.core.LiveEnvironment(clientId, clientSecret)
    : new paypal.core.SandboxEnvironment(clientId, clientSecret)
  return new paypal.core.PayPalHttpClient(environment)
}

// Create order
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {}
    if (!Array.isArray(body.items) || !body.items.length) {
      return res.status(400).json({ error: 'Items required' })
    }
    const subtotal = body.items.reduce((sum, it) => sum + Number(it.unitPrice) * Number(it.quantity), 0)
    const tax = Number(body.tax || 0)
    const total = Number(body.total ?? subtotal + tax)
    const currency = (body.currency || 'usd').toLowerCase()
    const order = await Order.create({
      items: body.items,
      subtotal, tax, total, currency,
      status: 'payment_pending',
      customer: body.customer || {},
      notes: body.notes || '',
      payment: {
        provider: body.provider || 'stripe',
        status: 'pending',
        amount: total,
        currency,
      }
    })
    res.status(201).json(order)
  } catch (e) { next(e) }
})

// Stripe: create Checkout Session for an order
router.post('/:id/stripe/checkout', async (req, res, next) => {
  try {
    if (!stripe) return res.status(400).json({ error: 'Stripe not configured' })
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: order.items.map(it => ({
        price_data: {
          currency: order.currency,
          product_data: { name: it.title },
          unit_amount: Math.round(Number(it.unitPrice) * 100),
        },
        quantity: it.quantity,
      })),
      success_url: req.body.successUrl || `${process.env.CLIENT_URL}/payments/success?order=${order._id}`,
      cancel_url: req.body.cancelUrl || `${process.env.CLIENT_URL}/payments/cancel?order=${order._id}`,
      metadata: { orderId: order._id.toString() },
    })

    order.payment = {
      ...order.payment,
      provider: 'stripe',
      status: 'pending',
      stripe: { checkoutSessionId: session.id },
    }
    await order.save()

    res.json({ url: session.url, sessionId: session.id })
  } catch (e) { next(e) }
})

// PayPal: create order
router.post('/:id/paypal/create', async (req, res, next) => {
  try {
    const client = paypalClient()
    if (!client) return res.status(400).json({ error: 'PayPal not configured' })
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })

    const request = new paypal.orders.OrdersCreateRequest()
    request.prefer('return=representation')
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: order.currency.toUpperCase(),
          value: order.total.toFixed(2),
        },
      }],
      application_context: {
        return_url: req.body.returnUrl || `${process.env.CLIENT_URL}/payments/paypal/success?order=${order._id}`,
        cancel_url: req.body.cancelUrl || `${process.env.CLIENT_URL}/payments/paypal/cancel?order=${order._id}`,
      },
    })
    const response = await client.execute(request)

    order.payment = {
      ...order.payment,
      provider: 'paypal',
      status: 'pending',
      paypal: { orderId: response.result.id },
    }
    await order.save()

    const approveLink = (response.result.links || []).find(l => l.rel === 'approve')
    res.json({ id: response.result.id, approveUrl: approveLink?.href })
  } catch (e) { next(e) }
})

// PayPal: capture
router.post('/:id/paypal/capture', async (req, res, next) => {
  try {
    const client = paypalClient()
    if (!client) return res.status(400).json({ error: 'PayPal not configured' })
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (!order.payment?.paypal?.orderId) return res.status(400).json({ error: 'No PayPal order associated' })

    const request = new paypal.orders.OrdersCaptureRequest(order.payment.paypal.orderId)
    request.requestBody({})
    const response = await client.execute(request)

    const captureId = response.result?.purchase_units?.[0]?.payments?.captures?.[0]?.id
    order.status = 'paid'
    order.payment.status = 'paid'
    order.payment.paypal.captureId = captureId
    await order.save()
    res.json({ ok: true, captureId })
  } catch (e) { next(e) }
})

// Admin routes below: require authentication & roles
router.use(authenticate, requireRole('super_admin', 'admin', 'editor'))

// Admin: list orders
router.get('/', async (req, res, next) => {
  try {
    const { q = '', status, limit = 50, offset = 0 } = req.query
    const query = {}
    if (status) query.status = status
    if (q) {
      const rx = new RegExp(q, 'i')
      query.$or = [{ 'customer.name': rx }, { 'customer.email': rx }, { number: rx }]
    }
    const items = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Math.min(200, Number(limit)))
    const total = await Order.countDocuments(query)
    res.json({ items, total })
  } catch (e) { next(e) }
})

// Admin: get/update/delete
router.get('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const doc = await Order.findById(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Not found' })
    res.json(doc)
  } catch (e) { next(e) }
})

router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const updated = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!updated) return res.status(404).json({ error: 'Not found' })
    res.json(updated)
  } catch (e) { next(e) }
})

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const r = await Order.findByIdAndDelete(req.params.id)
    if (!r) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
