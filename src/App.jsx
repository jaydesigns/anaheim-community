import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { MaterialSymbol } from './components/MaterialSymbol'

import 'mapbox-gl/dist/mapbox-gl.css'
import './App.css'

const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
const defaultCenter = [-117.9143, 33.8353]
const localStorageKey = 'communityEvents'

const categoryOptions = [
  'Free Community Events',
  'Service Opportunities',
  'Language Tutorial',
  'Self-Reliance Programs',
  'Sports',
  'Youth Activities',
  'Young Single Adults (18-35)',
  'Single Adults (36+)'
]

const categoryIconMap = {
  Sports: 'sports_soccer',
  'Youth Activities': 'family_star',
  'Service Opportunities': 'front_hand',
  'Language Tutorial': 'language',
  'Self-Reliance Programs': 'chat_bubble',
  'Young Single Adults (18-35)': 'celebration',
  'Single Adults (36+)': 'stars',
  'Free Community Events': 'groups'
}

const emptyForm = {
  name: '',
  description: '',
  category: categoryOptions[0],
  location: '',
  date: '',
  time: '',
  visibility: 'Public',
  contactPhone: '',
  contactEmail: '',
  coverPicture: ''
}

const readEventsFromStorage = () => {
  try {
    const rawValue = localStorage.getItem(localStorageKey)
    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((eventItem) => {
      return (
        typeof eventItem?.id === 'string' &&
        typeof eventItem?.name === 'string' &&
        typeof eventItem?.location === 'string' &&
        typeof eventItem?.lng === 'number' &&
        typeof eventItem?.lat === 'number'
      )
    })
  } catch {
    return []
  }
}

const geocodeLocation = async (query) => {
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

function App() {
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const mapContainerRef = useRef(null)

  const [searchValue, setSearchValue] = useState('')
  const [activeCategory, setActiveCategory] = useState(null)
  const [events, setEvents] = useState(() => readEventsFromStorage())
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formValues, setFormValues] = useState(emptyForm)

  const selectedEvent = useMemo(() => {
    return events.find((eventItem) => eventItem.id === selectedEventId) || null
  }, [events, selectedEventId])

  const visibleEvents = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase()

    return events.filter((eventItem) => {
      const categoryIsActive = !activeCategory || eventItem.category === activeCategory
      if (!categoryIsActive) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      return [eventItem.name, eventItem.description, eventItem.location, eventItem.category]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)
    })
  }, [events, activeCategory, searchValue])

  const areChipsCollapsed = isFormOpen || Boolean(selectedEvent)

  useEffect(() => {
    mapboxgl.accessToken = accessToken

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      center: defaultCenter,
      zoom: 10.9,
      style: 'mapbox://styles/mapbox/light-v11'
    })

    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

    return () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      mapRef.current?.remove()
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(localStorageKey, JSON.stringify(events))
  }, [events])

  useEffect(() => {
    if (!mapRef.current) {
      return
    }

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    visibleEvents.forEach((eventItem) => {
      const markerElement = document.createElement('button')
      markerElement.className = `event-marker ${eventItem.id === selectedEventId ? 'is-selected' : ''}`
      markerElement.type = 'button'
      markerElement.setAttribute('aria-label', `${eventItem.category} marker`)
      markerElement.innerHTML = `<span class="material-symbols-outlined event-marker-icon">${categoryIconMap[eventItem.category] || 'location_on'}</span>`

      const popupContent = document.createElement('div')
      popupContent.className = 'event-popup'

      const title = document.createElement('strong')
      title.textContent = eventItem.name
      popupContent.appendChild(title)

      const locationLine = document.createElement('p')
      locationLine.textContent = eventItem.location
      popupContent.appendChild(locationLine)

      const dateTimeLine = document.createElement('p')
      dateTimeLine.textContent = `${eventItem.date || 'Date TBD'} ${eventItem.time || ''}`.trim()
      popupContent.appendChild(dateTimeLine)

      const popup = new mapboxgl.Popup({ offset: 25 }).setDOMContent(popupContent)

      const marker = new mapboxgl.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat([eventItem.lng, eventItem.lat])
        .setPopup(popup)
        .addTo(mapRef.current)

      markerElement.addEventListener('click', () => {
        setSelectedEventId(eventItem.id)
        setIsFormOpen(false)
        mapRef.current?.flyTo({ center: [eventItem.lng, eventItem.lat], zoom: 13.8 })
      })

      markersRef.current.push(marker)
    })
  }, [visibleEvents, selectedEventId])

  const onChangeField = (fieldName, value) => {
    setFormValues((previousValues) => ({
      ...previousValues,
      [fieldName]: value
    }))
  }

  const onCoverFileChange = (eventTarget) => {
    const file = eventTarget.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      onChangeField('coverPicture', typeof reader.result === 'string' ? reader.result : '')
    }
    reader.readAsDataURL(file)
  }

  const openForm = () => {
    setSelectedEventId(null)
    setFormError('')
    setIsFormOpen(true)
  }

  const closeForm = () => {
    setIsFormOpen(false)
    setFormError('')
  }

  const closeEventCard = () => {
    setSelectedEventId(null)
  }

  const toggleCategory = (categoryName) => {
    setActiveCategory((previousCategory) => {
      if (previousCategory === categoryName) {
        return null
      }

      return categoryName
    })
  }

  const resetCategoryFilter = () => {
    setActiveCategory(null)
  }

  const onSubmitEvent = async (eventTarget) => {
    eventTarget.preventDefault()
    setFormError('')

    if (!formValues.name.trim() || !formValues.location.trim()) {
      setFormError('Event name and location are required.')
      return
    }

    setIsSubmitting(true)

    try {
      const locationResult = await geocodeLocation(formValues.location)

      if (!locationResult) {
        setFormError('Could not find that location. Please use a more specific address.')
        return
      }

      const eventId = `${Date.now()}`
      const newEvent = {
        id: eventId,
        ...formValues,
        location: locationResult.displayName,
        lng: locationResult.lng,
        lat: locationResult.lat
      }

      setEvents((previousEvents) => [...previousEvents, newEvent])
      setSelectedEventId(eventId)
      setIsFormOpen(false)
      setFormValues(emptyForm)
      setSearchValue('')
      setActiveCategory(newEvent.category)

      mapRef.current?.flyTo({ center: [locationResult.lng, locationResult.lat], zoom: 13.8 })
    } catch {
      setFormError('Unable to add event right now. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredCategories = categoryOptions.filter((categoryName) => {
    return categoryName.toLowerCase().includes(searchValue.toLowerCase().trim())
  })

  return (
    <>
      <div id="map-container" ref={mapContainerRef} />

      <aside className="top-sidebar">
        <div className="search-row">
          <input
            className="search-input"
            placeholder="Search events or categories"
            value={searchValue}
            onChange={(eventTarget) => setSearchValue(eventTarget.target.value)}
          />
          <button className="search-icon" type="button" aria-label="Search categories">
            <MaterialSymbol name="search" />
          </button>
        </div>

        <div className={`chips-row ${areChipsCollapsed ? 'is-collapsed' : ''}`}>
          {filteredCategories.map((categoryName) => {
            const isActive = activeCategory ? activeCategory === categoryName : true
            return (
              <button
                key={categoryName}
                className={`chip ${isActive ? 'is-primary' : ''}`}
                type="button"
                onClick={() => toggleCategory(categoryName)}
              >
                <MaterialSymbol name={categoryIconMap[categoryName] || 'location_on'} className="chip-icon" />
                {categoryName}
              </button>
            )
          })}
          <button type="button" className="chips-reset-button" onClick={resetCategoryFilter}>
            Reset
          </button>
        </div>
      </aside>

      <section className="left-panel">
        {isFormOpen && (
          <form className="event-card event-form" onSubmit={onSubmitEvent}>
            <label className="cover-upload" htmlFor="cover-file-input">
              {formValues.coverPicture ? (
                <img src={formValues.coverPicture} alt="Event cover preview" className="cover-preview" />
              ) : (
                <span>Upload cover picture</span>
              )}
            </label>
            <input id="cover-file-input" type="file" accept="image/*" onChange={onCoverFileChange} />

            <input
              value={formValues.name}
              onChange={(eventTarget) => onChangeField('name', eventTarget.target.value)}
              className="text-input"
              placeholder="Name"
              required
            />
            <textarea
              value={formValues.description}
              onChange={(eventTarget) => onChangeField('description', eventTarget.target.value)}
              className="text-input description-input"
              placeholder="Description"
            />

            <select
              value={formValues.category}
              onChange={(eventTarget) => onChangeField('category', eventTarget.target.value)}
              className="text-input"
            >
              {categoryOptions.map((categoryName) => (
                <option key={categoryName} value={categoryName}>
                  {categoryName}
                </option>
              ))}
            </select>

            <input
              value={formValues.location}
              onChange={(eventTarget) => onChangeField('location', eventTarget.target.value)}
              className="text-input"
              placeholder="Location"
              required
            />

            <div className="date-time-row">
              <input
                type="date"
                value={formValues.date}
                onChange={(eventTarget) => onChangeField('date', eventTarget.target.value)}
                className="text-input"
              />
              <input
                type="time"
                value={formValues.time}
                onChange={(eventTarget) => onChangeField('time', eventTarget.target.value)}
                className="text-input"
              />
            </div>

            <select
              value={formValues.visibility}
              onChange={(eventTarget) => onChangeField('visibility', eventTarget.target.value)}
              className="text-input"
            >
              <option value="Public">Public</option>
              <option value="Private (Invite Only)">Private (Invite Only)</option>
            </select>

            <input
              value={formValues.contactPhone}
              onChange={(eventTarget) => onChangeField('contactPhone', eventTarget.target.value)}
              className="text-input"
              placeholder="Contact phone"
            />
            <input
              type="email"
              value={formValues.contactEmail}
              onChange={(eventTarget) => onChangeField('contactEmail', eventTarget.target.value)}
              className="text-input"
              placeholder="Contact email"
            />

            {formError && <p className="form-error">{formError}</p>}

            <button className="submit-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding event...' : 'Add Event'}
            </button>
          </form>
        )}

        {!isFormOpen && selectedEvent && (
          <article className="event-card">
            <div className="card-media">
              {selectedEvent.coverPicture ? (
                <img src={selectedEvent.coverPicture} alt={selectedEvent.name} className="cover-preview" />
              ) : (
                <span>No cover picture</span>
              )}
            </div>

            <div className="card-content">
              <div className="card-close-row">
                <button type="button" className="icon-only-button" onClick={closeEventCard} aria-label="Close event card">
                  <MaterialSymbol name="close" className="action-icon" />
                </button>
              </div>
              <h2>{selectedEvent.name}</h2>
              <p className="subtitle">{selectedEvent.category}</p>
              <p>{selectedEvent.description || 'No description provided.'}</p>
              <p>Location: {selectedEvent.location}</p>
              <p>
                Date and Time: {selectedEvent.date || 'TBD'} {selectedEvent.time || ''}
              </p>
              <p>Public or Private: {selectedEvent.visibility}</p>
              <p>Contact Phone: {selectedEvent.contactPhone || 'N/A'}</p>
              <p>Contact Email: {selectedEvent.contactEmail || 'N/A'}</p>

              <div className="action-row">
                <button type="button">RSVP</button>
                <button type="button">
                  <MaterialSymbol name="today" className="action-icon" />
                  Add to Calendar
                </button>
                <button type="button">
                  <MaterialSymbol name="share" className="action-icon" />
                  Share
                </button>
              </div>
            </div>
          </article>
        )}

        <div className="add-events-bar">
          <h3>Community Events</h3>
          <button
            type="button"
            onClick={isFormOpen ? closeForm : openForm}
            aria-label={isFormOpen ? 'Close add event form' : 'Add new event'}
          >
            <MaterialSymbol name={isFormOpen ? 'close' : 'add'} />
          </button>
        </div>
      </section>
    </>
  )
}

export default App

