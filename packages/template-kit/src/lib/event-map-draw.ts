// The event page's map (board C6), drawn in the browser by MapLibre GL over
// OpenFreeMap's vector tiles (the host BackGold's own maps use): the venue's
// pin in the brand's accent, at street level, with zoom buttons. Scrolling
// the page never moves it: a wheel zooms only with Ctrl (⌘ on a Mac) held and
// a finger drags it only with two (MapLibre's cooperative gestures). The
// credit, OpenFreeMap's and "© OpenStreetMap contributors", opens in the
// corner and folds to its ⓘ button after five seconds or the first touch of
// the map; the button opens it again. The map follows the page's light or
// dark mode (the mode switch's `data-gg-mode`, else the system's). This
// module is the lazy part of EventMap.astro, loaded when the map nears the
// screen; MapLibre's tile worker is its own file beside it. Without WebGL the
// map is not drawn and the place's address and its OpenStreetMap link stay.

import { AttributionControl, Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'

const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const
const OSM_CREDIT = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>'
const STREET_ZOOM = 15
const CREDIT_FOLDS_AFTER_MS = 5000
const PIN =
  '<svg viewBox="0 0 32 42" aria-hidden="true" focusable="false"><path d="M16 41s14-13.2 14-24.5A14 14 0 0 0 2 16.5C2 27.8 16 41 16 41z"/><circle cx="16" cy="16.5" r="5.5"/></svg>'

function mode(): keyof typeof STYLES {
  const chosen = document.documentElement.getAttribute('data-gg-mode')
  if (chosen === 'dark' || chosen === 'light') return chosen
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Draws the map into an EventMap figure (`data-lat`, `data-lng`, `data-label`). */
export function drawEventMap(figure: HTMLElement): void {
  const lat = Number(figure.dataset.lat)
  const lng = Number(figure.dataset.lng)
  const canvas = figure.querySelector<HTMLElement>('[data-event-map-canvas]')
  const fallback = figure.querySelector<HTMLElement>('[data-event-map-fallback]')
  if (!canvas || !Number.isFinite(lat) || !Number.isFinite(lng)) return
  setWorkerUrl(workerUrl)
  let style = mode()
  let map: MapLibreMap
  try {
    map = new MapLibreMap({
      container: canvas,
      style: STYLES[style],
      center: [lng, lat],
      zoom: STREET_ZOOM,
      cooperativeGestures: true,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    })
  } catch {
    return
  }
  map.addControl(new AttributionControl({ compact: true, customAttribution: OSM_CREDIT }), 'bottom-right')
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  const pin = document.createElement('span')
  pin.className = 'event-map-pin'
  pin.innerHTML = PIN
  new Marker({ element: pin, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map)
  map.getCanvas().setAttribute('aria-label', figure.dataset.label ?? 'Map')

  // The credit folds to its button once, after a while or the first touch.
  let folded = false
  const fold = () => {
    folded = true
    figure.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
  }
  for (const type of ['pointerdown', 'wheel', 'keydown'] as const) canvas.addEventListener(type, fold, { once: true, passive: true })
  map.once('load', () => {
    if (fallback) fallback.hidden = true
    figure.dataset.drawn = ''
    if (folded) fold()
    else window.setTimeout(fold, CREDIT_FOLDS_AFTER_MS)
  })

  const follow = () => {
    const next = mode()
    if (next === style) return
    style = next
    map.setStyle(STYLES[next])
  }
  new MutationObserver(follow).observe(document.documentElement, { attributes: true, attributeFilter: ['data-gg-mode'] })
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', follow)
}
