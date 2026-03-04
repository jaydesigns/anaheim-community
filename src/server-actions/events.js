'use server'

const graphqlEndpoint = import.meta.env.VITE_GRAPHQL_ENDPOINT || 'http://localhost:7890/api/graphql'
const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''

const eventFieldsFragment = `
  id
  name
  description
  category
  location
  date
  time
  visibility
  contactPhone
  contactEmail
  coverPicture
  coordinates {
    lng
    lat
  }
  createdAt
  updatedAt
`

const getEventsQuery = `
  query Events($where: Event_where) {
    Events(where: $where) {
      docs {
        ${eventFieldsFragment}
      }
    }
  }
`

const createEventMutation = `
  mutation CreateEvent($data: mutationEventInput!) {
    createEvent(data: $data) {
      ${eventFieldsFragment}
    }
  }
`

const isDataUrlImage = (value) => {
  return typeof value === 'string' && value.startsWith('data:image/')
}

const toHex = (buffer) => {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

const getSha1Hex = async (value) => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable for Cloudinary signature generation')
  }

  const encodedValue = new TextEncoder().encode(value)
  const digest = await globalThis.crypto.subtle.digest('SHA-1', encodedValue)
  return toHex(digest)
}

export const uploadCoverPictureToCloudinaryAction = async (coverPicture) => {
  const cloudinaryName = import.meta.env.VITE_CLOUDINARY_NAME || import.meta.env.CLOUDINARY_NAME || ''
  const cloudinaryApiKey = import.meta.env.VITE_CLOUDINARY_API_KEY || import.meta.env.CLOUDINARY_API_KEY || ''
  const cloudinaryApiSecret = import.meta.env.VITE_CLOUDINARY_API_SECRET || import.meta.env.CLOUDINARY_API_SECRET || ''

  if (!coverPicture || typeof coverPicture !== 'string') {
    return ''
  }

  if (!isDataUrlImage(coverPicture)) {
    return coverPicture
  }

  if (!cloudinaryName || !cloudinaryApiKey || !cloudinaryApiSecret) {
    throw new Error('Cloudinary environment variables are missing')
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const signaturePayload = `timestamp=${timestamp}${cloudinaryApiSecret}`
  const signature = await getSha1Hex(signaturePayload)

  const formData = new FormData()
  formData.append('file', coverPicture)
  formData.append('api_key', cloudinaryApiKey)
  formData.append('timestamp', String(timestamp))
  formData.append('signature', signature)

  const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryName}/image/upload`, {
    method: 'POST',
    body: formData
  })

  const uploadPayload = await uploadResponse.json()

  if (!uploadResponse.ok) {
    throw new Error(uploadPayload?.error?.message || 'Cloudinary upload failed')
  }

  const uploadedImageUrl = uploadPayload?.secure_url || uploadPayload?.url
  if (!uploadedImageUrl) {
    throw new Error('Cloudinary upload did not return an image URL')
  }

  return uploadedImageUrl
}

const mapGraphqlEventToAppEvent = (eventItem) => {
  if (!eventItem || typeof eventItem !== 'object') {
    return null
  }

  const lng = eventItem.coordinates?.lng
  const lat = eventItem.coordinates?.lat
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    return null
  }

  return {
    id: String(eventItem.id || ''),
    name: eventItem.name || '',
    description: eventItem.description || '',
    category: eventItem.category || 'FreeCommunityEvents',
    location: eventItem.location || '',
    date: eventItem.date || '',
    time: eventItem.time || '',
    visibility: eventItem.visibility || 'Public',
    contactPhone: eventItem.contactPhone || '',
    contactEmail: eventItem.contactEmail || '',
    coverPicture: eventItem.coverPicture || '',
    lng,
    lat,
    createdAt: eventItem.createdAt || null,
    updatedAt: eventItem.updatedAt || null
  }
}

const graphqlRequest = async (query, variables) => {
  const response = await fetch(graphqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  })

  if (!response.ok) {
    throw new Error('GraphQL request failed')
  }

  const payload = await response.json()
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'GraphQL returned errors')
  }

  return payload.data
}

export const fetchEventsFromGraphqlAction = async (category = null) => {
  const where = category
    ? {
        category: {
          equals: category
        }
      }
    : null

  const data = await graphqlRequest(getEventsQuery, { where })
  const eventList = data?.Events?.docs

  if (!Array.isArray(eventList)) {
    return []
  }

  return eventList.map(mapGraphqlEventToAppEvent).filter(Boolean)
}

export const createEventInGraphqlAction = async (eventData) => {
  const data = await graphqlRequest(createEventMutation, {
    data: {
      category: eventData.category || null,
      contactEmail: eventData.contactEmail || null,
      contactPhone: eventData.contactPhone || null,
      coordinates: {
        lng: typeof eventData.lng === 'number' ? eventData.lng : null,
        lat: typeof eventData.lat === 'number' ? eventData.lat : null
      },
      coverPicture: eventData.coverPicture || null,
      date: eventData.date || null,
      description: eventData.description || null,
      location: eventData.location || null,
      name: eventData.name || null,
      time: eventData.time || null,
      visibility: eventData.visibility || null
    }
  })

  const created = mapGraphqlEventToAppEvent(data?.createEvent)
  if (!created) {
    throw new Error('Created event response is invalid')
  }

  return created
}

export const geocodeLocationAction = async (query) => {
  const encodedQuery = encodeURIComponent(query)
  const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?limit=1&access_token=${accessToken}`
  const response = await fetch(endpoint)

  if (!response.ok) {
    throw new Error('Unable to resolve location')
  }

  const geocodingData = await response.json()
  const topResult = geocodingData?.features?.[0]

  if (!topResult || !Array.isArray(topResult.center)) {
    return null
  }

  return {
    lng: topResult.center[0],
    lat: topResult.center[1],
    displayName: topResult.place_name || query
  }
}
