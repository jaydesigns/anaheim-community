import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEventInGraphqlAction, fetchEventsFromGraphqlAction, uploadCoverPictureToCloudinaryAction } from './events'

describe('events server actions', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
    vi.stubEnv('VITE_CLOUDINARY_NAME', 'demo')
    vi.stubEnv('VITE_CLOUDINARY_API_KEY', 'test_key')
    vi.stubEnv('VITE_CLOUDINARY_API_SECRET', 'test_secret')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('fetchEventsFromGraphqlAction queries events and maps docs', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          Events: {
            docs: [
              {
                id: 'evt_1',
                name: 'Basketball Night',
                description: 'Open gym',
                category: 'Sports',
                location: '123 Main St',
                date: '2026-03-04',
                time: '18:00',
                visibility: 'Public',
                contactPhone: '555-0100',
                contactEmail: 'events@example.org',
                coverPicture: '',
                coordinates: {
                  lng: -117.9143,
                  lat: 33.8353
                },
                createdAt: '2026-03-04T00:00:00.000Z',
                updatedAt: '2026-03-04T00:00:00.000Z'
              }
            ]
          }
        }
      })
    })

    const result = await fetchEventsFromGraphqlAction('Sports')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'evt_1',
      category: 'Sports',
      lng: -117.9143,
      lat: 33.8353
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:7890/api/graphql',
      expect.objectContaining({ method: 'POST' })
    )

    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(requestBody.variables).toEqual({
      where: {
        category: {
          equals: 'Sports'
        }
      }
    })
  })

  it('createEventInGraphqlAction posts mutation payload and maps created event', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          createEvent: {
            id: 'evt_created',
            name: 'Community Cleanup',
            description: 'Bring gloves',
            category: 'Service Opportunities',
            location: 'Anaheim, CA',
            date: '2026-03-05',
            time: '09:00',
            visibility: 'Public',
            contactPhone: '555-0200',
            contactEmail: 'cleanup@example.org',
            coverPicture: '',
            coordinates: {
              lng: -117.92,
              lat: 33.84
            },
            createdAt: '2026-03-04T00:00:00.000Z',
            updatedAt: '2026-03-04T00:00:00.000Z'
          }
        }
      })
    })

    const created = await createEventInGraphqlAction({
      name: 'Community Cleanup',
      description: 'Bring gloves',
      category: 'Service Opportunities',
      location: 'Anaheim, CA',
      date: '2026-03-05',
      time: '09:00',
      visibility: 'Public',
      contactPhone: '555-0200',
      contactEmail: 'cleanup@example.org',
      coverPicture: '',
      lng: -117.92,
      lat: 33.84
    })

    expect(created).toMatchObject({
      id: 'evt_created',
      name: 'Community Cleanup',
      lng: -117.92,
      lat: 33.84
    })

    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(requestBody.variables.data.coordinates).toEqual({
      lng: -117.92,
      lat: 33.84
    })
    expect(requestBody.variables.data.name).toBe('Community Cleanup')
  })

  it('uploadCoverPictureToCloudinaryAction uploads data URL and returns URL', async () => {
    const originalNow = Date.now
    Date.now = vi.fn(() => 1710000000000)

    try {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/community-cleanup.jpg'
        })
      })

      const uploadedUrl = await uploadCoverPictureToCloudinaryAction('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA')

      expect(uploadedUrl).toBe('https://res.cloudinary.com/demo/image/upload/v1/community-cleanup.jpg')
      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch.mock.calls[0][0]).toContain('https://api.cloudinary.com/v1_1/')
    } finally {
      Date.now = originalNow
    }
  })

  it('createEventInGraphqlAction sends existing coverPicture URL in mutation payload', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          createEvent: {
            id: 'evt_cloudinary',
            name: 'Cloudinary Event',
            description: 'Uploaded cover image',
            category: 'ServiceOpportunities',
            location: 'Anaheim, CA',
            date: '2026-03-05',
            time: '09:00',
            visibility: 'Public',
            contactPhone: '555-0200',
            contactEmail: 'cleanup@example.org',
            coverPicture: 'https://res.cloudinary.com/demo/image/upload/v1/community-cleanup.jpg',
            coordinates: {
              lng: -117.92,
              lat: 33.84
            },
            createdAt: '2026-03-04T00:00:00.000Z',
            updatedAt: '2026-03-04T00:00:00.000Z'
          }
        }
      })
    })

    const created = await createEventInGraphqlAction({
      name: 'Cloudinary Event',
      description: 'Uploaded cover image',
      category: 'ServiceOpportunities',
      location: 'Anaheim, CA',
      date: '2026-03-05',
      time: '09:00',
      visibility: 'Public',
      contactPhone: '555-0200',
      contactEmail: 'cleanup@example.org',
      coverPicture: 'https://res.cloudinary.com/demo/image/upload/v1/community-cleanup.jpg',
      lng: -117.92,
      lat: 33.84
    })

    expect(created).toMatchObject({
      id: 'evt_cloudinary',
      coverPicture: 'https://res.cloudinary.com/demo/image/upload/v1/community-cleanup.jpg'
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)

    const graphqlRequestBody = JSON.parse(global.fetch.mock.calls[0][1].body)
      expect(graphqlRequestBody.variables.data.coverPicture).toBe(
        'https://res.cloudinary.com/demo/image/upload/v1/community-cleanup.jpg'
      )
  })
})
