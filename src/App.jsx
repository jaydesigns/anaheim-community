import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import PartySocket from 'partysocket'
import { SearchBox } from '@mapbox/search-js-react'
import { MaterialSymbol } from './components/MaterialSymbol'
import ErrorBoundary from './components/ErrorBoundary'
import {
  createEventInGraphqlAction,
  fetchEventsFromGraphqlAction,
  geocodeLocationAction,
  uploadCoverPictureToCloudinaryAction
} from './server-actions/events'

import 'mapbox-gl/dist/mapbox-gl.css'
import './App.css'

const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
const partykitHost = import.meta.env.VITE_PARTYKIT_HOST || 'localhost:1999'
const defaultCenter = [-117.9143, 33.8353]

const categoryOptions = [
  'FreeCommunityEvents',
  'ServiceOpportunities',
  'LanguageTutorial',
  'Self_ReliancePrograms',
  'Sports',
  'YouthActivities',
  'YoungSingleAdults_18_35_',
  'SingleAdults_36__'
]

const categoryLabelMap = {
  FreeCommunityEvents: 'Free Community Events',
  ServiceOpportunities: 'Service Opportunities',
  LanguageTutorial: 'Language Tutorial',
  Self_ReliancePrograms: 'Self-Reliance Programs',
  Sports: 'Sports',
  YouthActivities: 'Youth Activities',
  YoungSingleAdults_18_35_: 'Young Single Adults (18-35)',
  SingleAdults_36__: 'Single Adults (36+)'
}

const categoryIconMap = {
  Sports: 'sports_soccer',
  YouthActivities: 'family_star',
  ServiceOpportunities: 'front_hand',
  LanguageTutorial: 'language',
  Self_ReliancePrograms: 'chat_bubble',
  YoungSingleAdults_18_35_: 'celebration',
  SingleAdults_36__: 'stars',
  FreeCommunityEvents: 'groups'
}

const minMarkerSize = 16
const maxMarkerSize = 32
const zoomForMinSize = 8
const zoomForMaxSize = 16
const clusterStartSize = 20
const clusterStartZoom = 10.8
const fallbackPresenceColors = ['#f44336', '#3f51b5', '#4caf50', '#ff9800', '#9c27b0', '#00acc1', '#8bc34a']
const presenceIconOptions = ['mouse', 'person', 'boy', 'girl']

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

const clamp = (value, min, max) => {
  return Math.max(min, Math.min(max, value))
}

const getMarkerSizeByZoom = (zoom) => {
  const ratio = (zoom - zoomForMinSize) / (zoomForMaxSize - zoomForMinSize)
  return clamp(minMarkerSize + ratio * (maxMarkerSize - minMarkerSize), minMarkerSize, maxMarkerSize)
}

const getClusterThresholdBySize = (markerSize) => {
  return clamp(markerSize * 1.45, 24, 40)
}

const createProximityGroups = (events, map, thresholdPixels) => {
  const projectedPoints = events.map((eventItem) => ({
    eventItem,
    point: map.project([eventItem.lng, eventItem.lat])
  }))

  const visited = new Array(projectedPoints.length).fill(false)
  const groups = []

  for (let index = 0; index < projectedPoints.length; index += 1) {
    if (visited[index]) {
      continue
    }

    const queue = [index]
    visited[index] = true
    const memberIndices = []

    while (queue.length > 0) {
      const currentIndex = queue.shift()
      memberIndices.push(currentIndex)

      for (let candidateIndex = 0; candidateIndex < projectedPoints.length; candidateIndex += 1) {
        if (visited[candidateIndex]) {
          continue
        }

        const dx = projectedPoints[currentIndex].point.x - projectedPoints[candidateIndex].point.x
        const dy = projectedPoints[currentIndex].point.y - projectedPoints[candidateIndex].point.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance <= thresholdPixels) {
          visited[candidateIndex] = true
          queue.push(candidateIndex)
        }
      }
    }

    groups.push(memberIndices.map((memberIndex) => projectedPoints[memberIndex].eventItem))
  }

  return groups
}

const getFallbackColorForParticipant = (participantId) => {
  if (!participantId) {
    return fallbackPresenceColors[0]
  }

  let hash = 0
  for (let index = 0; index < participantId.length; index += 1) {
    hash = (hash * 31 + participantId.charCodeAt(index)) | 0
  }

  return fallbackPresenceColors[Math.abs(hash) % fallbackPresenceColors.length]
}

const readFileAsDataUrl = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.onerror = () => {
      reject(new Error('Unable to read selected image file'))
    }
    reader.readAsDataURL(file)
  })
}

function App() {
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const presenceMarkersRef = useRef([])
  const presenceSocketRef = useRef(null)
  const selectedPresenceIconRef = useRef('person')
  const iconMenuRef = useRef(null)
  const longPressTimerRef = useRef(null)
  const lastPresencePointRef = useRef({ lng: defaultCenter[0], lat: defaultCenter[1] })
  const lastPresenceSentAtRef = useRef(0)
  const mapContainerRef = useRef(null)

  const [searchValue, setSearchValue] = useState('')
  const [activeCategory, setActiveCategory] = useState(null)
  const [events, setEvents] = useState([])
  const [participants, setParticipants] = useState([])
  const [selfParticipantId, setSelfParticipantId] = useState(null)
  const [selectedPresenceIcon, setSelectedPresenceIcon] = useState('person')
  const [presenceHint, setPresenceHint] = useState({ visible: false, x: 0, y: 0, text: '' })
  const [iconMenuState, setIconMenuState] = useState({ open: false, x: 0, y: 0 })
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [isCoverUploading, setIsCoverUploading] = useState(false)
  const [formValues, setFormValues] = useState(emptyForm)
  const [selectedLocationCoordinates, setSelectedLocationCoordinates] = useState(null)

  const [eventActionState, submitEventAction, isSubmitting] = useActionState(
    async (_previousState, payload) => {
      try {
        const { formValues: submittedValues, selectedCoordinates } = payload || {}

        if (!submittedValues?.name?.trim() || !submittedValues?.location?.trim()) {
          return {
            status: 'error',
            error: 'Event name and location are required.'
          }
        }

        const locationResult = selectedCoordinates
          ? {
              lng: selectedCoordinates.lng,
              lat: selectedCoordinates.lat,
              displayName: submittedValues.location
            }
          : await geocodeLocationAction(submittedValues.location)

        if (!locationResult) {
          return {
            status: 'error',
            error: 'Could not find that location. Please use a more specific address.'
          }
        }

        const createdEvent = await createEventInGraphqlAction({
          ...submittedValues,
          location: locationResult.displayName,
          lng: locationResult.lng,
          lat: locationResult.lat
        })

        return {
          status: 'success',
          createdEvent,
          flyTo: {
            lng: locationResult.lng,
            lat: locationResult.lat
          }
        }
      } catch (error) {
        return {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unable to add event right now. Please try again.'
        }
      }
    },
    {
      status: 'idle',
      error: ''
    }
  )

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
    selectedPresenceIconRef.current = selectedPresenceIcon
  }, [selectedPresenceIcon])

  useEffect(() => {
    if (!iconMenuState.open) {
      return
    }

    const onPointerDown = (eventTarget) => {
      if (!iconMenuRef.current || iconMenuRef.current.contains(eventTarget.target)) {
        return
      }

      setIconMenuState((previousState) => ({
        ...previousState,
        open: false
      }))
    }

    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [iconMenuState.open])

  useEffect(() => {
    if (selectedEventId && !visibleEvents.some((eventItem) => eventItem.id === selectedEventId)) {
      setSelectedEventId(null)
    }
  }, [selectedEventId, visibleEvents])

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
      presenceMarkersRef.current.forEach((marker) => marker.remove())
      presenceMarkersRef.current = []
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      presenceSocketRef.current?.close()
      mapRef.current?.remove()
    }
  }, [])

  useEffect(() => {
    const socket = new PartySocket({
      host: partykitHost,
      room: 'community-map-presence',
      party: 'main'
    })

    presenceSocketRef.current = socket

    socket.onmessage = (messageEvent) => {
      try {
        const payload = JSON.parse(messageEvent.data)

        if (payload?.type !== 'presence') {
          return
        }

        setSelfParticipantId(typeof payload.selfId === 'string' ? payload.selfId : null)
        setParticipants(Array.isArray(payload.participants) ? payload.participants : [])
      } catch {
        // ignore malformed payloads
      }
    }

    socket.onopen = () => {
      if (!mapRef.current) {
        return
      }

      const center = mapRef.current.getCenter()
      lastPresencePointRef.current = { lng: center.lng, lat: center.lat }
      socket.send(
        JSON.stringify({
          type: 'position',
          lng: center.lng,
          lat: center.lat,
          icon: selectedPresenceIconRef.current
        })
      )
    }

    return () => {
      socket.close()
      if (presenceSocketRef.current === socket) {
        presenceSocketRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current || !presenceSocketRef.current) {
      return
    }

    const map = mapRef.current
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0

    const sendPosition = (lng, lat, force = false) => {
      if (!presenceSocketRef.current || presenceSocketRef.current.readyState !== WebSocket.OPEN) {
        return
      }

      const now = performance.now()
      if (!force && now - lastPresenceSentAtRef.current < 60) {
        return
      }

      lastPresenceSentAtRef.current = now
      lastPresencePointRef.current = { lng, lat }

      presenceSocketRef.current.send(
        JSON.stringify({
          type: 'position',
          lng,
          lat,
          icon: selectedPresenceIconRef.current
        })
      )
    }

    const publishMapCenter = (force = false) => {
      const center = map.getCenter()
      sendPosition(center.lng, center.lat, force)
    }

    const onMouseMove = (eventTarget) => {
      sendPosition(eventTarget.lngLat.lng, eventTarget.lngLat.lat)
    }

    const onTouchMove = () => {
      publishMapCenter()
    }

    const onDesktopMoveEnd = () => {
      publishMapCenter()
    }

    if (isTouchDevice) {
      map.on('move', onTouchMove)
      map.on('moveend', onTouchMove)
      publishMapCenter(true)
    } else {
      map.on('mousemove', onMouseMove)
      map.on('moveend', onDesktopMoveEnd)
      publishMapCenter(true)
    }

    return () => {
      if (isTouchDevice) {
        map.off('move', onTouchMove)
        map.off('moveend', onTouchMove)
      } else {
        map.off('mousemove', onMouseMove)
        map.off('moveend', onDesktopMoveEnd)
      }
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    const loadEvents = async () => {
      try {
        const remoteEvents = await fetchEventsFromGraphqlAction(activeCategory)
        if (!isCancelled) {
          setEvents(remoteEvents)
        }
      } catch {
        if (!isCancelled) {
          setFormError('Unable to load events from server right now.')
        }
      }
    }

    loadEvents()

    return () => {
      isCancelled = true
    }
  }, [activeCategory])

  useEffect(() => {
    if (eventActionState.status === 'error') {
      setFormError(eventActionState.error || 'Unable to add event right now. Please try again.')
      return
    }

    if (eventActionState.status === 'success' && eventActionState.createdEvent) {
      setFormError('')
      setEvents((previousEvents) => [...previousEvents, eventActionState.createdEvent])
      setSelectedEventId(eventActionState.createdEvent.id)
      setIsFormOpen(false)
      setFormValues(emptyForm)
      setSelectedLocationCoordinates(null)
      setSearchValue('')
      setActiveCategory(eventActionState.createdEvent.category)

      mapRef.current?.flyTo({
        center: [eventActionState.flyTo.lng, eventActionState.flyTo.lat],
        zoom: 13.8
      })
    }
  }, [eventActionState])

  useEffect(() => {
    if (!presenceSocketRef.current || presenceSocketRef.current.readyState !== WebSocket.OPEN) {
      return
    }

    const latestPoint = lastPresencePointRef.current
    presenceSocketRef.current.send(
      JSON.stringify({
        type: 'position',
        lng: latestPoint.lng,
        lat: latestPoint.lat,
        icon: selectedPresenceIcon
      })
    )
  }, [selectedPresenceIcon])

  useEffect(() => {
    if (!mapRef.current) {
      return
    }

    const map = mapRef.current

    presenceMarkersRef.current.forEach((marker) => marker.remove())
    presenceMarkersRef.current = []

    participants.forEach((participant) => {
      if (typeof participant?.lng !== 'number' || typeof participant?.lat !== 'number') {
        return
      }

      const markerElement = document.createElement('div')
      markerElement.className = `presence-marker ${participant.id === selfParticipantId ? 'is-self' : ''}`
      markerElement.style.backgroundColor = participant.color || getFallbackColorForParticipant(participant.id)
      markerElement.setAttribute('aria-label', 'Active user')
      markerElement.innerHTML = `<span class="material-symbols-outlined presence-marker-icon">${participant.icon || 'person'}</span>`

      if (participant.id === selfParticipantId) {
        const point = map.project([participant.lng, participant.lat])

        const openHint = (text, x, y) => {
          setPresenceHint({
            visible: true,
            x,
            y,
            text
          })
        }

        const closeHint = () => {
          setPresenceHint((previousState) => ({
            ...previousState,
            visible: false
          }))
        }

        markerElement.addEventListener('mouseenter', () => {
          openHint('Right click to change icon', point.x, point.y - 18)
        })

        markerElement.addEventListener('mouseleave', () => {
          closeHint()
        })

        markerElement.addEventListener('contextmenu', (eventTarget) => {
          eventTarget.preventDefault()
          closeHint()
          setIconMenuState({
            open: true,
            x: eventTarget.clientX,
            y: eventTarget.clientY
          })
        })

        markerElement.addEventListener('touchstart', (eventTarget) => {
          const touchPoint = eventTarget.touches?.[0]
          if (!touchPoint) {
            return
          }

          openHint('Long press to change icon', touchPoint.clientX, touchPoint.clientY - 20)

          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
          }

          longPressTimerRef.current = setTimeout(() => {
            closeHint()
            setIconMenuState({
              open: true,
              x: touchPoint.clientX,
              y: touchPoint.clientY
            })
            longPressTimerRef.current = null
          }, 550)
        })

        const cancelLongPress = () => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
          }

          setTimeout(() => {
            closeHint()
          }, 600)
        }

        markerElement.addEventListener('touchend', cancelLongPress)
        markerElement.addEventListener('touchcancel', cancelLongPress)
      }

      const marker = new mapboxgl.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat([participant.lng, participant.lat])
        .addTo(map)

      presenceMarkersRef.current.push(marker)
    })
  }, [participants, selfParticipantId])

  useEffect(() => {
    if (!mapRef.current) {
      return
    }

    const map = mapRef.current

    const renderMarkers = () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []

      const currentZoom = map.getZoom()
      const currentMarkerSize = getMarkerSizeByZoom(currentZoom)
      const clusteringEnabled = currentMarkerSize <= clusterStartSize || currentZoom <= clusterStartZoom
      const proximityThreshold = getClusterThresholdBySize(currentMarkerSize)
      const groups = clusteringEnabled
        ? createProximityGroups(visibleEvents, map, proximityThreshold)
        : visibleEvents.map((eventItem) => [eventItem])

      groups.forEach((group) => {
        if (group.length === 1) {
          const eventItem = group[0]
          const markerElement = document.createElement('button')
          markerElement.className = `event-marker ${eventItem.id === selectedEventId ? 'is-selected' : ''}`
          markerElement.type = 'button'
          markerElement.style.width = `${currentMarkerSize}px`
          markerElement.style.height = `${currentMarkerSize}px`
          markerElement.setAttribute('aria-label', `${eventItem.category} marker`)
          markerElement.innerHTML = `<span class="material-symbols-outlined event-marker-icon" style="font-size:${Math.round(
            currentMarkerSize * 0.72
          )}px">${categoryIconMap[eventItem.category] || 'location_on'}</span>`

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
            .addTo(map)

          markerElement.addEventListener('click', () => {
            setSelectedEventId(eventItem.id)
            setIsFormOpen(false)
            map.flyTo({ center: [eventItem.lng, eventItem.lat], zoom: 13.8 })
          })

          markersRef.current.push(marker)
          return
        }

        const clusterElement = document.createElement('button')
        clusterElement.className = 'event-marker event-cluster-marker'
        clusterElement.type = 'button'
        const clusterSize = clamp(currentMarkerSize + 8, 24, 36)
        clusterElement.style.width = `${clusterSize}px`
        clusterElement.style.height = `${clusterSize}px`
        clusterElement.setAttribute('aria-label', `${group.length} events in this area`)
        clusterElement.innerHTML = `<span class="event-cluster-count">${group.length}</span>`

        const clusterLng = group.reduce((sum, eventItem) => sum + eventItem.lng, 0) / group.length
        const clusterLat = group.reduce((sum, eventItem) => sum + eventItem.lat, 0) / group.length

        const clusterMarker = new mapboxgl.Marker({ element: clusterElement, anchor: 'center' })
          .setLngLat([clusterLng, clusterLat])
          .addTo(map)

        clusterElement.addEventListener('click', () => {
          const bounds = new mapboxgl.LngLatBounds()
          group.forEach((eventItem) => {
            bounds.extend([eventItem.lng, eventItem.lat])
          })

          map.fitBounds(bounds, {
            padding: 90,
            maxZoom: 14
          })
        })

        markersRef.current.push(clusterMarker)
      })
    }

    renderMarkers()
    map.on('zoom', renderMarkers)
    map.on('moveend', renderMarkers)

    return () => {
      map.off('zoom', renderMarkers)
      map.off('moveend', renderMarkers)
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
    }
  }, [visibleEvents, selectedEventId])

  const onChangeField = (fieldName, value) => {
    setFormValues((previousValues) => ({
      ...previousValues,
      [fieldName]: value
    }))
  }

  const onCoverFileChange = async (eventTarget) => {
    const file = eventTarget.target.files?.[0]

    if (!file) {
      return
    }

    setFormError('')
    setIsCoverUploading(true)

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const uploadedImageUrl = await uploadCoverPictureToCloudinaryAction(dataUrl)
      onChangeField('coverPicture', uploadedImageUrl)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to upload cover picture right now.')
    } finally {
      setIsCoverUploading(false)
      eventTarget.target.value = ''
    }
  }

  const openForm = () => {
    setSelectedEventId(null)
    setFormError('')
    setSelectedLocationCoordinates(null)
    setIsFormOpen(true)
  }

  const closeForm = () => {
    setIsFormOpen(false)
    setFormError('')
  }

  const closeEventCard = () => {
    setSelectedEventId(null)
  }

  const toggleCategory = (categoryValue) => {
    setActiveCategory((previousCategory) => {
      if (previousCategory === categoryValue) {
        return null
      }

      return categoryValue
    })
  }

  const resetCategoryFilter = () => {
    setActiveCategory(null)
  }

  const onSubmitEvent = (eventTarget) => {
    eventTarget.preventDefault()
    setFormError('')
    startTransition(() => {
      submitEventAction({
        formValues,
        selectedCoordinates: selectedLocationCoordinates
      })
    })
  }

  const filteredCategories = categoryOptions.filter((categoryValue) => {
    const categoryLabel = categoryLabelMap[categoryValue] || categoryValue
    return categoryLabel.toLowerCase().includes(searchValue.toLowerCase().trim())
  })

  const pickPresenceIcon = (iconName) => {
    setSelectedPresenceIcon(iconName)
    setIconMenuState((previousState) => ({
      ...previousState,
      open: false
    }))
  }

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
          {filteredCategories.map((categoryValue) => {
            const isActive = activeCategory ? activeCategory === categoryValue : true
            const categoryLabel = categoryLabelMap[categoryValue] || categoryValue
            return (
              <button
                key={categoryValue}
                className={`chip ${isActive ? 'is-primary' : ''}`}
                type="button"
                onClick={() => toggleCategory(categoryValue)}
              >
                <MaterialSymbol name={categoryIconMap[categoryValue] || 'location_on'} className="chip-icon" />
                {categoryLabel}
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
          <ErrorBoundary>
            <form className="event-card event-form" onSubmit={onSubmitEvent}>
              <label className="cover-upload" htmlFor="cover-file-input">
                {formValues.coverPicture ? (
                  <img src={formValues.coverPicture} alt="Event cover preview" className="cover-preview" />
                ) : (
                  <span>{isCoverUploading ? 'Uploading cover picture...' : 'Upload cover picture'}</span>
                )}
              </label>
              <input
                id="cover-file-input"
                type="file"
                accept="image/*"
                onChange={onCoverFileChange}
                disabled={isCoverUploading || isSubmitting}
              />
              {isCoverUploading && <p className="cover-upload-status">Uploading cover picture…</p>}
              {!isCoverUploading && formValues.coverPicture && (
                <p className="cover-upload-status is-success">Upload complete</p>
              )}

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
                {categoryOptions.map((categoryValue) => (
                  <option key={categoryValue} value={categoryValue}>
                    {categoryLabelMap[categoryValue] || categoryValue}
                  </option>
                ))}
              </select>

              <div className="location-search">
                <SearchBox
                  accessToken={accessToken}
                  value={formValues.location}
                  proximity={defaultCenter}
                  placeholder="Location"
                  onChange={(value) => {
                    onChangeField('location', value)
                    setSelectedLocationCoordinates(null)
                  }}
                  onRetrieve={(result) => {
                    const topFeature = result?.features?.[0] || null

                    if (!topFeature) {
                      return
                    }

                    const center = topFeature.center || topFeature.geometry?.coordinates
                    const placeName =
                      topFeature.place_name ||
                      topFeature.properties?.full_address ||
                      topFeature.properties?.name_preferred ||
                      topFeature.text ||
                      formValues.location

                    if (Array.isArray(center) && center.length >= 2) {
                      setSelectedLocationCoordinates({
                        lng: center[0],
                        lat: center[1]
                      })
                    }

                    if (typeof placeName === 'string') {
                      onChangeField('location', placeName)
                    }
                  }}
                />
              </div>

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

              <button className="submit-button" type="submit" disabled={isSubmitting || isCoverUploading}>
                {isCoverUploading ? 'Uploading cover...' : isSubmitting ? 'Adding event...' : 'Add Event'}
              </button>
            </form>
          </ErrorBoundary>
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
              <p className="subtitle">{categoryLabelMap[selectedEvent.category] || selectedEvent.category}</p>
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

      {presenceHint.visible && (
        <div className="presence-hint-tooltip" style={{ left: presenceHint.x, top: presenceHint.y }}>
          {presenceHint.text}
        </div>
      )}

      {iconMenuState.open && (
        <div className="presence-icon-menu" ref={iconMenuRef} style={{ left: iconMenuState.x, top: iconMenuState.y }}>
          {presenceIconOptions.map((iconName) => (
            <button
              key={iconName}
              type="button"
              className={`presence-menu-item ${selectedPresenceIcon === iconName ? 'is-active' : ''}`}
              onClick={() => pickPresenceIcon(iconName)}
            >
              <MaterialSymbol name={iconName} className="presence-menu-icon" />
              {iconName}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export default App

