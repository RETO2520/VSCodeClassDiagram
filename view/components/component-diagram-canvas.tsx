"use client"

import React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, Maximize2, Maximize } from "lucide-react"
import type { ComponentInfo, ComponentKind, ComponentRelationship } from "@/lib/component-diagram-types"
import type { ClassInfo } from "@/lib/class-diagram-types"

// ==============================
// Constants
// ==============================
const FONT_SIZE = 13
const SMALL_FONT_SIZE = 11
const HEADER_PADDING = 10
const BODY_PADDING = 10
const LINE_HEIGHT = 18
const CORNER_RADIUS = 8
const RESIZE_HANDLE_SIZE = 12

const MIN_ZOOM = 0.2
const MAX_ZOOM = 3
const ZOOM_STEP = 0.15

const MONO_FONT = '"SF Mono", "Cascadia Code", "Fira Code", monospace'

function kindLabel(kind: ComponentKind) {
  switch (kind) {
    case "component":
      return "<<component>>"
    case "subsystem":
      return "<<subsystem>>"
    case "application":
      return "<<application>>"
  }
}

function kindColors(kind: ComponentKind) {
  switch (kind) {
    case "component":
      return {
        headerBg: "#0f172a",
        headerText: "#f8fafc",
        bodyBg: "#f8fafc",
        bodyText: "#0f172a",
        border: "#334155",
        accent: "#38bdf8",
      }
    case "subsystem":
      return {
        headerBg: "#1e3a8a",
        headerText: "#dbeafe",
        bodyBg: "#eff6ff",
        bodyText: "#1e3a8a",
        border: "#3b82f6",
        accent: "#60a5fa",
      }
    case "application":
      return {
        headerBg: "#064e3b",
        headerText: "#d1fae5",
        bodyBg: "#ecfdf5",
        bodyText: "#064e3b",
        border: "#10b981",
        accent: "#34d399",
      }
  }
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function drawComponentBox(
  ctx: CanvasRenderingContext2D,
  comp: ComponentInfo,
  isSelected: boolean,
  allComponents: ComponentInfo[],
  classes: ClassInfo[],
) {
  const { x, y, width: w, height: h } = comp
  const colors = kindColors(comp.kind)
  const headerH = 48

  // shadow
  ctx.save()
  ctx.shadowColor = "rgba(0, 0, 0, 0.12)"
  ctx.shadowBlur = 10
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2
  drawRoundRect(ctx, x, y, w, h, CORNER_RADIUS)
  ctx.fillStyle = colors.bodyBg
  ctx.fill()
  ctx.restore()

  // header
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, headerH, [CORNER_RADIUS, CORNER_RADIUS, 0, 0])
  ctx.fillStyle = colors.headerBg
  ctx.fill()
  ctx.restore()

  // border
  drawRoundRect(ctx, x, y, w, h, CORNER_RADIUS)
  ctx.strokeStyle = isSelected ? "#3b82f6" : colors.border
  ctx.lineWidth = isSelected ? 2.5 : 1.5
  ctx.stroke()

  // header text
  ctx.textAlign = "left"
  ctx.fillStyle = colors.headerText
  ctx.font = `italic ${SMALL_FONT_SIZE}px ${MONO_FONT}`
  ctx.fillText(kindLabel(comp.kind), x + HEADER_PADDING, y + 18)

  ctx.font = `bold ${FONT_SIZE}px ${MONO_FONT}`
  ctx.fillText(comp.name, x + HEADER_PADDING, y + 38)

  // body text (summary)
  ctx.fillStyle = colors.bodyText
  ctx.font = `${SMALL_FONT_SIZE}px ${MONO_FONT}`
  const stats =
    comp.kind === "component"
      ? `Classes: ${comp.classIds.length}`
      : `Children: ${comp.childComponentIds.length}`
  let textY = y + headerH + BODY_PADDING + 12
  ctx.fillText(stats, x + BODY_PADDING, textY)

  // description (single line, clipped)
  if (comp.description) {
    const maxW = Math.max(0, w - BODY_PADDING * 2)
    const desc = clipText(ctx, comp.description, maxW)
    ctx.fillStyle = "#475569"
    textY += LINE_HEIGHT
    ctx.fillText(desc, x + BODY_PADDING, textY)
  }

  // child list (FolderTree と対応する階層情報)
  const maxY = y + h - BODY_PADDING - 8
  const maxW = Math.max(0, w - BODY_PADDING * 2)

  // 1 行分空ける
  textY += LINE_HEIGHT
  if (textY > maxY) return

  let title = ""
  let items: string[] = []

  if (comp.kind === "application") {
    title = "Subsystems"
    const subsystems = allComponents.filter(
      (c) => c.kind === "subsystem" && comp.childComponentIds.includes(c.id),
    )
    items = subsystems.map((c) => c.name)
  } else if (comp.kind === "subsystem") {
    title = "Components"
    const comps = allComponents.filter(
      (c) => c.kind === "component" && comp.childComponentIds.includes(c.id),
    )
    items = comps.map((c) => c.name)
  } else {
    title = "Classes"
    items = comp.classIds
      .map((cid) => classes.find((cls) => cls.id === cid)?.name ?? cid)
  }

  if (items.length > 0) {
    ctx.fillStyle = colors.bodyText
    ctx.font = `bold ${SMALL_FONT_SIZE}px ${MONO_FONT}`
    const titleText = `${title}:`
    ctx.fillText(titleText, x + BODY_PADDING, textY)

    ctx.font = `${SMALL_FONT_SIZE}px ${MONO_FONT}`
    textY += LINE_HEIGHT
    for (const name of items) {
      if (textY > maxY) break
      const line = `- ${clipText(ctx, name, maxW - 16)}`
      ctx.fillText(line, x + BODY_PADDING + 8, textY)
      textY += LINE_HEIGHT
    }
  }

  // resize handle (bottom-right)
  if (isSelected) {
    ctx.save()
    ctx.fillStyle = colors.accent
    ctx.globalAlpha = 0.9
    ctx.fillRect(
      x + w - RESIZE_HANDLE_SIZE,
      y + h - RESIZE_HANDLE_SIZE,
      RESIZE_HANDLE_SIZE,
      RESIZE_HANDLE_SIZE,
    )
    ctx.restore()
  }
}

function clipText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (maxWidth <= 0) return ""
  if (ctx.measureText(text).width <= maxWidth) return text
  const ell = "…"
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const s = text.slice(0, mid) + ell
    if (ctx.measureText(s).width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo) + ell
}

function getEdgePoint(
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  px: number,
  py: number,
): { sx: number; sy: number; side: "top" | "bottom" | "left" | "right" } {
  const cx = rx + rw / 2
  const cy = ry + rh / 2
  const dx = px - cx
  const dy = py - cy
  if (dx === 0 && dy === 0) return { sx: cx, sy: cy, side: "top" }

  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  let sx = cx
  let sy = cy
  let side: "top" | "bottom" | "left" | "right" = "top"

  if (absDx / rw > absDy / rh) {
    sx = dx > 0 ? rx + rw : rx
    sy = cy + (dy * (rw / 2)) / absDx
    side = dx > 0 ? "right" : "left"
  } else {
    sy = dy > 0 ? ry + rh : ry
    sx = cx + (dx * (rh / 2)) / absDy
    side = dy > 0 ? "bottom" : "top"
  }

  return { sx, sy, side }
}

function drawOpenArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string) {
  const size = 12
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(-size, -size / 2)
  ctx.lineTo(0, 0)
  ctx.lineTo(-size, size / 2)
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

function drawComponentRelationship(
  ctx: CanvasRenderingContext2D,
  rel: ComponentRelationship,
  components: ComponentInfo[],
) {
  const source = components.find((c) => c.id === rel.sourceComponentId)
  const target = components.find((c) => c.id === rel.targetComponentId)
  if (!source || !target) return

  const sCx = source.x + source.width / 2
  const sCy = source.y + source.height / 2
  const tCx = target.x + target.width / 2
  const tCy = target.y + target.height / 2

  const { sx, sy, side: sSide } = getEdgePoint(source.x, source.y, source.width, source.height, tCx, tCy)
  const { sx: tx, sy: ty, side: tSide } = getEdgePoint(target.x, target.y, target.width, target.height, sCx, sCy)

  const color = "#64748b"
  const isDerived = rel.basedOnIds.length > 0

  // orthogonal routing
  const points: { x: number; y: number }[] = [{ x: sx, y: sy }]
  if (sSide === "left" || sSide === "right") {
    if (tSide === "left" || tSide === "right") {
      const midX = (sx + tx) / 2
      points.push({ x: midX, y: sy })
      points.push({ x: midX, y: ty })
    } else {
      points.push({ x: tx, y: sy })
    }
  } else {
    if (tSide === "top" || tSide === "bottom") {
      const midY = (sy + ty) / 2
      points.push({ x: sx, y: midY })
      points.push({ x: tx, y: midY })
    } else {
      points.push({ x: sx, y: ty })
    }
  }
  points.push({ x: tx, y: ty })

  ctx.save()
  if (!isDerived) ctx.setLineDash([6, 4]) // manual relationship
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
  ctx.stroke()
  ctx.restore()

  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  const angle = Math.atan2(last.y - prev.y, last.x - prev.x)
  drawOpenArrow(ctx, tx, ty, angle, color)

  const label = rel.label ?? (isDerived ? `${rel.basedOnIds.length} evidence` : "manual")
  if (label) {
    const midIdx = Math.floor(points.length / 2)
    const p1 = points[midIdx - 1] ?? points[0]
    const p2 = points[midIdx] ?? points[points.length - 1]
    const lx = (p1.x + p2.x) / 2
    const ly = (p1.y + p2.y) / 2
    ctx.save()
    ctx.font = `bold 10px sans-serif`
    ctx.fillStyle = "#0f172a"
    const tw = ctx.measureText(label).width
    ctx.fillStyle = "rgba(255,255,255,0.9)"
    ctx.beginPath()
    ctx.roundRect(lx - tw / 2 - 6, ly - 18, tw + 12, 16, 4)
    ctx.fill()
    ctx.strokeStyle = "#e2e8f0"
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = "#334155"
    ctx.textAlign = "center"
    ctx.fillText(label, lx, ly - 6)
    ctx.restore()
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: number,
  panOffset: { x: number; y: number },
) {
  ctx.save()
  ctx.strokeStyle = "#e2e8f0"
  ctx.lineWidth = 0.5

  const baseGridSize = 20
  const gridSize = baseGridSize * zoom
  if (gridSize < 6) {
    ctx.restore()
    return
  }

  const startX = panOffset.x % gridSize
  const startY = panOffset.y % gridSize
  for (let x = startX; x < width; x += gridSize) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = startY; y < height; y += gridSize) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  ctx.restore()
}

function drawZoomIndicator(ctx: CanvasRenderingContext2D, zoom: number) {
  const text = `${Math.round(zoom * 100)}%`
  ctx.save()
  ctx.font = "bold 11px sans-serif"
  ctx.fillStyle = "rgba(255,255,255,0.9)"
  const tw = ctx.measureText(text).width
  ctx.beginPath()
  ctx.roundRect(12, 12, tw + 16, 24, 4)
  ctx.fill()
  ctx.strokeStyle = "#e2e8f0"
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = "#475569"
  ctx.textAlign = "left"
  ctx.fillText(text, 20, 29)
  ctx.restore()
}

function drawLegend(ctx: CanvasRenderingContext2D, canvasWidth: number) {
  const items: Array<{ label: string; color: string }> = [
    { label: "Application", color: kindColors("application").border },
    { label: "Subsystem", color: kindColors("subsystem").border },
    { label: "Component", color: kindColors("component").border },
  ]

  const startX = canvasWidth - 170
  const startY = 16
  const lineLen = 26
  const lineSpacing = 20

  ctx.save()
  ctx.font = "11px sans-serif"

  ctx.fillStyle = "rgba(255,255,255,0.92)"
  const boxW = 166
  const boxH = items.length * lineSpacing + 14
  ctx.beginPath()
  ctx.roundRect(startX - 10, startY - 6, boxW, boxH, 4)
  ctx.fill()
  ctx.strokeStyle = "#e2e8f0"
  ctx.lineWidth = 1
  ctx.stroke()

  items.forEach((it, i) => {
    const y = startY + i * lineSpacing + 10
    ctx.beginPath()
    ctx.strokeStyle = it.color
    ctx.lineWidth = 3
    ctx.moveTo(startX, y)
    ctx.lineTo(startX + lineLen, y)
    ctx.stroke()

    ctx.fillStyle = "#475569"
    ctx.textAlign = "left"
    ctx.fillText(it.label, startX + lineLen + 8, y + 4)
  })

  ctx.restore()
}

// ==============================
// Canvas Component
// ==============================
interface ComponentDiagramCanvasProps {
  components: ComponentInfo[]
  relationships: ComponentRelationship[]
  classes: ClassInfo[]
  selectedId: string | null
  onSelectComponent: (id: string | null) => void
  onMoveComponent: (id: string, x: number, y: number) => void
  onResizeComponent?: (id: string, width: number, height: number) => void
  /** ドラッグ/リサイズが完了したタイミングのコミット通知（外部同期用） */
  onCommit?: () => void
}

export function ComponentDiagramCanvas({
  components,
  relationships,
  classes,
  selectedId,
  onSelectComponent,
  onMoveComponent,
  onResizeComponent,
  onCommit,
}: ComponentDiagramCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })

  const interactionRef = useRef<{
    mode: "none" | "dragging-component" | "resizing-component" | "panning"
    componentId: string | null
    offsetX: number
    offsetY: number
    startPanX: number
    startPanY: number
    startOffsetX: number
    startOffsetY: number
    startW: number
    startH: number
    startWorldX: number
    startWorldY: number
  }>({
    mode: "none",
    componentId: null,
    offsetX: 0,
    offsetY: 0,
    startPanX: 0,
    startPanY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    startW: 0,
    startH: 0,
    startWorldX: 0,
    startWorldY: 0,
  })

  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => ({
      x: (screenX - panOffset.x) / zoom,
      y: (screenY - panOffset.y) / zoom,
    }),
    [zoom, panOffset],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, rect.width, rect.height)
    drawGrid(ctx, rect.width, rect.height, zoom, panOffset)

    ctx.save()
    ctx.translate(panOffset.x, panOffset.y)
    ctx.scale(zoom, zoom)

    for (const rel of relationships) {
      drawComponentRelationship(ctx, rel, components)
    }
    for (const comp of components) {
      drawComponentBox(ctx, comp, comp.id === selectedId, components, classes)
    }

    ctx.restore()

    drawLegend(ctx, rect.width)
    drawZoomIndicator(ctx, zoom)
  }, [components, relationships, classes, selectedId, zoom, panOffset])

  useEffect(() => {
    draw()
    const resizeObserver = new ResizeObserver(() => draw())
    if (containerRef.current) resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [draw])

  function hitTest(worldX: number, worldY: number): string | null {
    for (let i = components.length - 1; i >= 0; i--) {
      const c = components[i]
      if (worldX >= c.x && worldX <= c.x + c.width && worldY >= c.y && worldY <= c.y + c.height) {
        return c.id
      }
    }
    return null
  }

  function hitTestResizeHandle(worldX: number, worldY: number, comp: ComponentInfo): boolean {
    const hx = comp.x + comp.width - RESIZE_HANDLE_SIZE
    const hy = comp.y + comp.height - RESIZE_HANDLE_SIZE
    return worldX >= hx && worldX <= hx + RESIZE_HANDLE_SIZE && worldY >= hy && worldY <= hy + RESIZE_HANDLE_SIZE
  }

  function handleMouseDown(e: React.MouseEvent) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const world = screenToWorld(screenX, screenY)

    const hitId = hitTest(world.x, world.y)
    if (hitId) {
      const comp = components.find((c) => c.id === hitId)
      if (!comp) return
      onSelectComponent(hitId)

      if (hitId === selectedId && hitTestResizeHandle(world.x, world.y, comp) && onResizeComponent) {
        interactionRef.current = {
          ...interactionRef.current,
          mode: "resizing-component",
          componentId: hitId,
          startW: comp.width,
          startH: comp.height,
          startWorldX: world.x,
          startWorldY: world.y,
          offsetX: 0,
          offsetY: 0,
          startPanX: 0,
          startPanY: 0,
          startOffsetX: 0,
          startOffsetY: 0,
        }
      } else {
        interactionRef.current = {
          ...interactionRef.current,
          mode: "dragging-component",
          componentId: hitId,
          offsetX: world.x - comp.x,
          offsetY: world.y - comp.y,
          startPanX: 0,
          startPanY: 0,
          startOffsetX: 0,
          startOffsetY: 0,
          startW: 0,
          startH: 0,
          startWorldX: 0,
          startWorldY: 0,
        }
      }
    } else {
      onSelectComponent(null)
      interactionRef.current = {
        ...interactionRef.current,
        mode: "panning",
        componentId: null,
        offsetX: 0,
        offsetY: 0,
        startPanX: screenX,
        startPanY: screenY,
        startOffsetX: panOffset.x,
        startOffsetY: panOffset.y,
        startW: 0,
        startH: 0,
        startWorldX: 0,
        startWorldY: 0,
      }
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const interaction = interactionRef.current
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const world = screenToWorld(screenX, screenY)

    if (interaction.mode === "dragging-component" && interaction.componentId) {
      onMoveComponent(interaction.componentId, world.x - interaction.offsetX, world.y - interaction.offsetY)
      return
    }

    if (interaction.mode === "resizing-component" && interaction.componentId && onResizeComponent) {
      const comp = components.find((c) => c.id === interaction.componentId)
      if (!comp) return
      const dw = world.x - interaction.startWorldX
      const dh = world.y - interaction.startWorldY
      const newW = Math.max(180, interaction.startW + dw)
      const newH = Math.max(120, interaction.startH + dh)
      onResizeComponent(interaction.componentId, newW, newH)
      return
    }

    if (interaction.mode === "panning") {
      const dx = screenX - interaction.startPanX
      const dy = screenY - interaction.startPanY
      setPanOffset({ x: interaction.startOffsetX + dx, y: interaction.startOffsetY + dy })
    }
  }

  function handleMouseUp() {
    const wasInteractive =
      interactionRef.current.mode === "dragging-component" || interactionRef.current.mode === "resizing-component"
    interactionRef.current.mode = "none"
    if (wasInteractive) onCommit?.()
  }

  const [canvasCursor, setCanvasCursor] = useState<string>("grab")

  // wheel zoom: keep stable refs
  const zoomRef = useRef(zoom)
  const panOffsetRef = useRef(panOffset)
  zoomRef.current = zoom
  panOffsetRef.current = panOffset

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = canvas!.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top

      const curZoom = zoomRef.current
      const curPan = panOffsetRef.current
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, curZoom + delta))

      const factor = newZoom / curZoom
      const newPanX = screenX - (screenX - curPan.x) * factor
      const newPanY = screenY - (screenY - curPan.y) * factor

      setZoom(newZoom)
      setPanOffset({ x: newPanX, y: newPanY })
    }

    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [])

  function handleZoomIn() {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const newZoom = Math.min(MAX_ZOOM, zoom + ZOOM_STEP)
    const factor = newZoom / zoom
    const newPanX = centerX - (centerX - panOffset.x) * factor
    const newPanY = centerY - (centerY - panOffset.y) * factor
    setZoom(newZoom)
    setPanOffset({ x: newPanX, y: newPanY })
  }

  function handleZoomOut() {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const newZoom = Math.max(MIN_ZOOM, zoom - ZOOM_STEP)
    const factor = newZoom / zoom
    const newPanX = centerX - (centerX - panOffset.x) * factor
    const newPanY = centerY - (centerY - panOffset.y) * factor
    setZoom(newZoom)
    setPanOffset({ x: newPanX, y: newPanY })
  }

  function handleFitAll() {
    if (components.length === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const c of components) {
      minX = Math.min(minX, c.x)
      minY = Math.min(minY, c.y)
      maxX = Math.max(maxX, c.x + c.width)
      maxY = Math.max(maxY, c.y + c.height)
    }

    const contentW = maxX - minX
    const contentH = maxY - minY
    const padding = 60
    const scaleX = (rect.width - padding * 2) / contentW
    const scaleY = (rect.height - padding * 2) / contentH
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(scaleX, scaleY)))

    const newPanX = (rect.width - contentW * newZoom) / 2 - minX * newZoom
    const newPanY = (rect.height - contentH * newZoom) / 2 - minY * newZoom
    setZoom(newZoom)
    setPanOffset({ x: newPanX, y: newPanY })
  }

  function handleAlignAll() {
    if (components.length === 0) return

    const groups: Record<ComponentKind, ComponentInfo[]> = {
      application: [],
      subsystem: [],
      component: [],
    }
    for (const c of components) groups[c.kind].push(c)

    const kindOrder: ComponentKind[] = ["application", "subsystem", "component"]
    const GAP_X = 40
    const GAP_Y = 120
    const START_X = 0
    const START_Y = 0

    let y = START_Y
    for (const kind of kindOrder) {
      const row = groups[kind]
      if (row.length === 0) continue
      let x = START_X
      for (const c of row) {
        onMoveComponent(c.id, x, y)
        x += c.width + GAP_X
      }
      const maxH = Math.max(...row.map((c) => c.height))
      y += maxH + GAP_Y
    }

    setTimeout(() => handleFitAll(), 50)
    onCommit?.()
  }

  return (
    <div ref={containerRef} className="relative h-full w-full bg-background">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{
          cursor:
            interactionRef.current.mode === "panning"
              ? "grabbing"
              : canvasCursor,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={(e) => {
          handleMouseMove(e)
          if (interactionRef.current.mode !== "none") return

          const canvas = canvasRef.current
          if (!canvas) return
          const rect = canvas.getBoundingClientRect()
          const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
          const hitId = hitTest(world.x, world.y)
          if (!hitId) {
            setCanvasCursor("grab")
            return
          }
          const comp = components.find((c) => c.id === hitId)
          if (!comp) {
            setCanvasCursor("grab")
            return
          }
          if (hitId === selectedId && onResizeComponent && hitTestResizeHandle(world.x, world.y, comp)) {
            setCanvasCursor("nwse-resize")
          } else {
            setCanvasCursor("grab")
          }
        }}
        onMouseUp={() => handleMouseUp()}
        onMouseLeave={() => {
          handleMouseUp()
          setCanvasCursor("grab")
        }}
      />

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
        <Button
          variant="outline"
          size="icon"
          onClick={handleAlignAll}
          className="h-8 w-8 bg-card shadow-sm"
          title="Align all"
        >
          <Maximize className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleFitAll}
          className="h-8 w-8 bg-card shadow-sm"
          title="Fit all"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomIn}
          className="h-8 w-8 bg-card shadow-sm"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomOut}
          className="h-8 w-8 bg-card shadow-sm"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

