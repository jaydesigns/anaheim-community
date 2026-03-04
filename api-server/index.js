import process from 'node:process'

import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { MongoClient, ObjectId } from 'mongodb'

dotenv.config()

const mongodbUri = process.env.MONGODB_URI
const databaseName = process.env.MONGODB_DB_NAME || 'anaheimCommunity'
const collectionName = process.env.MONGODB_COLLECTION_NAME || 'events'
const port = Number(process.env.API_PORT || 4000)
const corsOrigin = process.env.CORS_ORIGIN || '*'

if (!mongodbUri) {
  process.stderr.write('Missing MONGODB_URI. Set it in your environment or .env file.\n')
  process.exit(1)
}

const app = express()
app.use(cors({ origin: corsOrigin }))
app.use(express.json({ limit: '2mb' }))

const mongoClient = new MongoClient(mongodbUri)
await mongoClient.connect()

const collection = mongoClient.db(databaseName).collection(collectionName)

const normalizeEventDocument = (document) => {
  return {
    id: document._id.toString(),
    name: document.name || '',
    description: document.description || '',
    category: document.category || '',
    location: document.location || '',
    date: document.date || '',
    time: document.time || '',
    visibility: document.visibility || 'Public',
    contactPhone: document.contactPhone || '',
    contactEmail: document.contactEmail || '',
    coverPicture: document.coverPicture || '',
    lng: document.lng,
    lat: document.lat,
    createdAt: document.createdAt || null,
    updatedAt: document.updatedAt || null
  }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/events', async (_req, res) => {
  try {
    const results = await collection.find({}).sort({ createdAt: -1 }).toArray()
    res.json(results.map(normalizeEventDocument))
  } catch {
    res.status(500).json({ error: 'Unable to fetch events.' })
  }
})

app.post('/events', async (req, res) => {
  const payload = req.body || {}

  if (typeof payload.name !== 'string' || !payload.name.trim()) {
    res.status(400).json({ error: 'name is required' })
    return
  }

  if (typeof payload.location !== 'string' || !payload.location.trim()) {
    res.status(400).json({ error: 'location is required' })
    return
  }

  if (!Number.isFinite(payload.lng) || !Number.isFinite(payload.lat)) {
    res.status(400).json({ error: 'lng and lat are required numbers' })
    return
  }

  const now = new Date().toISOString()
  const eventDocument = {
    name: payload.name.trim(),
    description: typeof payload.description === 'string' ? payload.description : '',
    category: typeof payload.category === 'string' ? payload.category : '',
    location: payload.location.trim(),
    date: typeof payload.date === 'string' ? payload.date : '',
    time: typeof payload.time === 'string' ? payload.time : '',
    visibility: typeof payload.visibility === 'string' ? payload.visibility : 'Public',
    contactPhone: typeof payload.contactPhone === 'string' ? payload.contactPhone : '',
    contactEmail: typeof payload.contactEmail === 'string' ? payload.contactEmail : '',
    coverPicture: typeof payload.coverPicture === 'string' ? payload.coverPicture : '',
    lng: Number(payload.lng),
    lat: Number(payload.lat),
    createdAt: now,
    updatedAt: now
  }

  try {
    const insertResult = await collection.insertOne(eventDocument)
    const created = await collection.findOne({ _id: new ObjectId(insertResult.insertedId) })
    res.status(201).json(normalizeEventDocument(created))
  } catch {
    res.status(500).json({ error: 'Unable to create event.' })
  }
})

app.listen(port, () => {
  process.stdout.write(`Event API listening on http://localhost:${port}\n`)
})
