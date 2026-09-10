"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import createGlobe from "cobe"

interface InteractiveMarker {
  id: string
  location: [number, number]
  name: string
  models: number
}

interface GlobeInteractiveProps {
  markers?: InteractiveMarker[]
  className?: string
  speed?: number
  theme?: "auto" | "light" | "dark"
}

const defaultMarkers: InteractiveMarker[] = [
  // Original regional markers
  { id: "hq", location: [37.78, -122.44], name: "HQ", models: 12 },
  { id: "eu", location: [52.52, 13.41], name: "EU", models: 8 },
  { id: "asia", location: [35.68, 139.65], name: "Asia", models: 15 },
  { id: "latam", location: [-23.55, -46.63], name: "LATAM", models: 5 },
  { id: "mena", location: [25.2, 55.27], name: "MENA", models: 7 },
  { id: "oceania", location: [-33.87, 151.21], name: "APAC", models: 4 },

  // Cities (models count reflecting the locations in each city)
  { id: "new-york", location: [40.7128, -74.0060], name: "New York", models: 4 },
  { id: "los-angeles", location: [34.0522, -118.2437], name: "Los Angeles", models: 2 },
  { id: "seattle", location: [47.6062, -122.3321], name: "Seattle", models: 2 },
  { id: "chicago", location: [41.8781, -87.6298], name: "Chicago", models: 2 },
  { id: "san-francisco", location: [37.7749, -122.4194], name: "San Francisco", models: 2 },
  { id: "vancouver", location: [49.2827, -123.1207], name: "Vancouver", models: 1 },
  { id: "toronto", location: [43.6532, -79.3832], name: "Toronto", models: 1 },
  { id: "london", location: [51.5074, -0.1278], name: "London", models: 3 },
  { id: "paris", location: [48.8566, 2.3522], name: "Paris", models: 2 },
  { id: "barcelona", location: [41.3851, 2.1734], name: "Barcelona", models: 2 },
  { id: "madrid", location: [40.4168, -3.7038], name: "Madrid", models: 1 },
  { id: "rome", location: [41.9028, 12.4964], name: "Rome", models: 2 },
  { id: "pisa", location: [43.7228, 10.4017], name: "Pisa", models: 1 },
  { id: "florence", location: [43.7696, 11.2558], name: "Florence", models: 1 },
  { id: "amsterdam", location: [52.3676, 4.9041], name: "Amsterdam", models: 2 },
  { id: "berlin", location: [52.5200, 13.4050], name: "Berlin", models: 2 },
  { id: "frankfurt", location: [50.1109, 8.6821], name: "Frankfurt", models: 1 },
  { id: "giza", location: [30.0131, 31.2089], name: "Giza", models: 1 },
  { id: "dubai", location: [25.2048, 55.2708], name: "Dubai", models: 1 },
  { id: "tokyo", location: [35.6762, 139.6503], name: "Tokyo", models: 2 },
  { id: "sydney", location: [-33.8688, 151.2093], name: "Sydney", models: 1 },
]

export function GlobeInteractive({
  markers = defaultMarkers,
  className = "",
  speed = 0.003,
  theme = "auto",
}: GlobeInteractiveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerInteracting = useRef<{ x: number; y: number } | null>(null)
  const dragOffset = useRef({ phi: 0, theta: 0 })
  const phiOffsetRef = useRef(0)
  const thetaOffsetRef = useRef(0)
  const isPausedRef = useRef(false)
  const phiRef = useRef(0)
  const [hovered, setHovered] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    if (theme === "dark") { setIsDark(true); return }
    if (theme === "light") { setIsDark(false); return }

    const checkDark = () => {
      const isDarkClass = document.documentElement.classList.contains("dark")
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      setIsDark(isDarkClass || prefersDark)
    }

    checkDark()
    const observer = new MutationObserver(checkDark)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    mediaQuery.addEventListener("change", checkDark)

    return () => {
      observer.disconnect()
      mediaQuery.removeEventListener("change", checkDark)
    }
  }, [theme])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerInteracting.current = { x: e.clientX, y: e.clientY }
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing"
    isPausedRef.current = true
  }, [])

  const handlePointerUp = useCallback(() => {
    if (pointerInteracting.current !== null) {
      phiOffsetRef.current += dragOffset.current.phi
      thetaOffsetRef.current += dragOffset.current.theta
      dragOffset.current = { phi: 0, theta: 0 }
    }
    pointerInteracting.current = null
    if (canvasRef.current) canvasRef.current.style.cursor = "grab"
    isPausedRef.current = false
  }, [])

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (pointerInteracting.current !== null) {
        dragOffset.current = {
          phi: (e.clientX - pointerInteracting.current.x) / 300,
          theta: (e.clientY - pointerInteracting.current.y) / 1000,
        }
      }
    }
    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    window.addEventListener("pointerup", handlePointerUp, { passive: true })
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [handlePointerUp])

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    let globe: ReturnType<typeof createGlobe> | null = null
    let animationId: number

    const colors = isDark
      ? {
          dark: 1,
          baseColor: [0.2, 0.25, 0.35] as [number, number, number],
          markerColor: [0.35, 0.65, 1] as [number, number, number],
          glowColor: [0.12, 0.16, 0.24] as [number, number, number],
          arcColor: [0.35, 0.65, 1] as [number, number, number],
        }
      : {
          dark: 0,
          baseColor: [1, 1, 1] as [number, number, number],
          markerColor: [0.1, 0.2, 0.45] as [number, number, number],
          glowColor: [0.94, 0.93, 0.91] as [number, number, number],
          arcColor: [0.15, 0.3, 0.55] as [number, number, number],
        }

    function init() {
      const width = canvas.offsetWidth
      if (width === 0) return
      if (globe) return

      globe = createGlobe(canvas, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width, height: width,
        phi: phiRef.current, theta: 0.2,
        dark: colors.dark, diffuse: 1.5,
        mapSamples: 16000, mapBrightness: 10,
        baseColor: colors.baseColor,
        markerColor: colors.markerColor,
        glowColor: colors.glowColor,
        markerElevation: 0,
        markers: markers.map((m) => ({ location: m.location, size: 0.02, id: m.id })),
        arcs: [], arcColor: colors.arcColor,
        arcWidth: 0.5, arcHeight: 0.25, opacity: 0.7,
      })

      function animate() {
        if (!isPausedRef.current) phiRef.current += speed
        globe!.update({
          phi: phiRef.current + phiOffsetRef.current + dragOffset.current.phi,
          theta: 0.2 + thetaOffsetRef.current + dragOffset.current.theta,
        })
        animationId = requestAnimationFrame(animate)
      }
      animate()
      setTimeout(() => canvas && (canvas.style.opacity = "1"))
    }

    if (canvas.offsetWidth > 0) {
      init()
    } else {
      const ro = new ResizeObserver((entries) => {
        if (entries[0]?.contentRect.width > 0) {
          ro.disconnect()
          init()
        }
      })
      ro.observe(canvas)
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
      if (globe) globe.destroy()
    }
  }, [markers, speed, isDark])

  return (
    <div className={`relative aspect-square select-none ${className}`}>
      <style>{`
        @keyframes fade-slide-in {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        style={{
          width: "100%", height: "100%", cursor: "grab", opacity: 0,
          transition: "opacity 1.2s ease", borderRadius: "50%", touchAction: "none",
        }}
      />
      {markers.map((m) => {
        const isSelected = active === m.id || hovered === m.id

        return (
          <div
            key={m.id}
            onMouseEnter={() => setHovered(m.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => setActive(active === m.id ? null : m.id)}
            style={{
              position: "absolute",
              positionAnchor: `--cobe-${m.id}`,
              bottom: "anchor(top)",
              left: "anchor(center)",
              translate: "-50% 50%",
              pointerEvents: "auto",
              cursor: "pointer",
              opacity: `var(--cobe-visible-${m.id}, 0)`,
              filter: `blur(calc((1 - var(--cobe-visible-${m.id}, 0)) * 6px))`,
              zIndex: isSelected ? 30 : 10,
            }}
          >
            {/* Interactive Dot Target */}
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: isDark ? "#5b92e5" : "#1a1a2e",
                border: "2px solid #ffffff",
                boxShadow: "0 0 8px rgba(0,0,0,0.3)",
                transform: isSelected ? "scale(1.4)" : "scale(1)",
                transition: "transform 0.2s ease, background-color 0.2s ease",
              }}
            />

            {/* Hover / Active Badge Card */}
            {isSelected && (
              <div
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  marginBottom: 6,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "0.35rem 0.6rem",
                  background: isDark ? "#ffffff" : "#1a1a2e",
                  color: isDark ? "#0f172a" : "#ffffff",
                  borderRadius: 4,
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                  animation: "fade-slide-in 0.15s ease-out forwards",
                }}
              >
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.6rem",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  {m.name}
                </span>
                <span
                  style={{
                    fontFamily: "system-ui, sans-serif",
                    fontSize: "0.55rem",
                    opacity: 0.8,
                    marginTop: "0.1rem",
                  }}
                >
                  {m.models} {m.models === 1 ? "model" : "models"}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}