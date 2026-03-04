"use client"

import React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
const HEATMAP_PANEL_WIDTH = 96
const HEATMAP_CELL_SIZE = 8
const CLASS_TOOLTIP_TOP_N = 3

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
  dslSummaryByPath: Record<string, DslSummary>,
  heatMetricsByComponentId: Record<string, ComponentHeatMetrics>,
  showComponentHeatmap: boolean,
  showClassHeatmap: boolean,
) {
  const { x, y, width: w, height: h } = comp
  const colors = kindColors(comp.kind)
  const headerH = 48
  const heat = heatMetricsByComponentId[comp.id]
  const showHeatPanel = Boolean(heat) && (showComponentHeatmap || showClassHeatmap)
  const reservedRightWidth = showHeatPanel ? HEATMAP_PANEL_WIDTH + 8 : 0

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
      ? (() => {
        const dslPath = comp.dslPath ?? ""
        const summary = dslPath ? dslSummaryByPath[dslPath] : undefined
        if (summary) return `DSL Classes: ${summary.classes.length}`
        if (dslPath) return `DSL: ${dslPath}`
        return `Classes: ${comp.classIds.length}`
      })()
      : `Children: ${comp.childComponentIds.length}`
  let textY = y + headerH + BODY_PADDING + 12
  ctx.fillText(stats, x + BODY_PADDING, textY)

  // description (single line, clipped)
  if (comp.description) {
    const maxW = Math.max(0, w - BODY_PADDING * 2 - reservedRightWidth)
    const desc = clipText(ctx, comp.description, maxW)
    ctx.fillStyle = "#475569"
    textY += LINE_HEIGHT
    ctx.fillText(desc, x + BODY_PADDING, textY)
  }

  // child list (FolderTree と対応する階層情報)
  const maxY = y + h - BODY_PADDING - 8
  const maxW = Math.max(0, w - BODY_PADDING * 2 - reservedRightWidth)

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
    const dslPath = comp.dslPath ?? ""
    const summary = dslPath ? dslSummaryByPath[dslPath] : undefined
    if (summary) {
      title = `DSL (${dslPath})`
      items = summary.classes.map((c) => `${c.name} [F:${c.memberCount} M:${c.operationCount}]`)
    } else {
      title = "Classes"
      items = comp.classIds
        .map((cid) => classes.find((cls) => cls.id === cid)?.name ?? cid)
    }
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

  if (showHeatPanel && heat) {
    const { panelX, panelY, panelH } = getHeatPanelLayout(comp, showComponentHeatmap, showClassHeatmap)

    ctx.save()
    ctx.fillStyle = "rgba(255,255,255,0.92)"
    ctx.beginPath()
    ctx.roundRect(panelX, panelY, HEATMAP_PANEL_WIDTH, panelH, 6)
    ctx.fill()
    ctx.strokeStyle = "#e2e8f0"
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()

    let rowY = panelY + 6
    if (showComponentHeatmap) {
      drawHeatRatioRow(
        ctx,
        panelX + 6,
        rowY,
        "Cmp",
        heat.componentCells,
        HEATMAP_PANEL_WIDTH - 12,
        dominantLevelLabel(heat.componentCells),
      )
      rowY += 16
    }
    if (showClassHeatmap) {
      drawHeatRatioRow(
        ctx,
        panelX + 6,
        rowY,
        "Cls",
        heat.classCells,
        HEATMAP_PANEL_WIDTH - 12,
        dominantLevelLabel(heat.classCells),
      )
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

interface DslClassSummary {
  name: string
  memberCount: number
  operationCount: number
}

interface DslSummary {
  classes: DslClassSummary[]
}

interface ComponentHeatMetrics {
  componentCells: number[]
  classCells: number[]
  componentRaw: {
    incoming: number
    outgoing: number
    children: number
    classLoad: number
  }
  classRaw: number[]
  classLabels: string[]
}

interface HeatTooltipState {
  screenX: number
  screenY: number
  title: string
  lines: string[]
}

function parseDslSummary(dsl: string): DslSummary {
  const lines = dsl.split(/\r?\n/)
  const classes: DslClassSummary[] = []
  let current: DslClassSummary | null = null

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("//") || line.startsWith("#")) continue

    const classMatch = line.match(/^(?:abstract\s+)?(?:class|interface|struct)\s+(\w+)/i)
    if (classMatch) {
      if (current) classes.push(current)
      current = { name: classMatch[1], memberCount: 0, operationCount: 0 }
      continue
    }

    if (!current) continue
    if (!/^[+\-#~]/.test(line)) continue
    if (line.includes("(")) {
      current.operationCount += 1
    } else {
      current.memberCount += 1
    }
  }

  if (current) classes.push(current)
  return { classes }
}

function normalizeCells(values: number[]) {
  if (values.length === 0) return []
  const max = Math.max(...values, 1)
  return values.map((v) => Math.max(0, Math.min(1, v / max)))
}

function heatColor(v: number) {
  const clamped = Math.max(0, Math.min(1, v))
  const hue = 215 - clamped * 210
  const sat = 88
  const light = 56 - clamped * 14
  return `hsl(${hue} ${sat}% ${light}%)`
}

function drawHeatRatioRow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  cells: number[],
  panelWidth: number,
  badgeText?: string,
) {
  ctx.save()
  ctx.font = `bold 9px ${MONO_FONT}`
  ctx.fillStyle = "#475569"
  ctx.textAlign = "left"
  ctx.fillText(label, x, y + 7)

  const barX = x + 18
  const countText = badgeText ?? `${cells.length}`
  const countW = Math.ceil(ctx.measureText(countText).width)
  const barW = Math.max(24, panelWidth - 18 - countW - 8)

  if (cells.length === 0) {
    ctx.fillStyle = "#cbd5e1"
    ctx.fillRect(barX, y, barW, HEATMAP_CELL_SIZE)
  } else {
    const bins = [0, 0, 0, 0]
    for (const v of cells) {
      const idx = Math.min(3, Math.floor(v * 4))
      bins[idx] += 1
    }

    let accX = barX
    const total = Math.max(1, cells.length)
    for (let i = 0; i < bins.length; i++) {
      const segW = i === bins.length - 1
        ? barX + barW - accX
        : Math.round((bins[i] / total) * barW)
      if (segW <= 0) continue
      ctx.fillStyle = heatColor((i + 0.5) / bins.length)
      ctx.fillRect(accX, y, segW, HEATMAP_CELL_SIZE)
      accX += segW
    }
    // Explicitly show L1-L4 boundaries for faster balance reading.
    ctx.strokeStyle = "rgba(15,23,42,0.16)"
    ctx.lineWidth = 0.8
    for (let i = 1; i < 4; i++) {
      const boundaryX = barX + (barW * i) / 4
      ctx.beginPath()
      ctx.moveTo(boundaryX, y)
      ctx.lineTo(boundaryX, y + HEATMAP_CELL_SIZE)
      ctx.stroke()
    }
    ctx.strokeStyle = "rgba(15,23,42,0.2)"
    ctx.lineWidth = 0.8
    ctx.strokeRect(barX, y, barW, HEATMAP_CELL_SIZE)
  }

  ctx.fillStyle = "#64748b"
  ctx.textAlign = "left"
  ctx.fillText(countText, barX + barW + 3, y + 7)
  ctx.restore()
}

function buildHeatBins(cells: number[]) {
  const bins = [0, 0, 0, 0]
  for (const v of cells) {
    const idx = Math.min(3, Math.floor(v * 4))
    bins[idx] += 1
  }
  return bins
}

function dominantLevelLabel(cells: number[]) {
  if (cells.length === 0) return "L0"
  const bins = buildHeatBins(cells)
  let bestIdx = 0
  for (let i = 1; i < bins.length; i++) {
    if (bins[i] > bins[bestIdx]) bestIdx = i
  }
  return `L${bestIdx + 1}`
}

function getHeatPanelLayout(
  comp: ComponentInfo,
  showComponentHeatmap: boolean,
  showClassHeatmap: boolean,
) {
  const headerH = 48
  const panelX = comp.x + comp.width - BODY_PADDING - HEATMAP_PANEL_WIDTH
  const panelY = comp.y + headerH + BODY_PADDING - 2
  const rowCount = [showComponentHeatmap, showClassHeatmap].filter(Boolean).length
  const panelH = rowCount * 16 + 10
  return { panelX, panelY, panelH }
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
  dslContentByPath?: Record<string, string>
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
  dslContentByPath = {},
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
  const [showComponentHeatmap, setShowComponentHeatmap] = useState(true)
  const [showClassHeatmap, setShowClassHeatmap] = useState(true)
  const [heatTooltip, setHeatTooltip] = useState<HeatTooltipState | null>(null)

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

  const dslSummaryByPath = useMemo<Record<string, DslSummary>>(() => {
    const entries = Object.entries(dslContentByPath)
    const result: Record<string, DslSummary> = {}
    for (const [path, dsl] of entries) {
      if (!dsl) continue
      result[path] = parseDslSummary(dsl)
    }
    return result
  }, [dslContentByPath])

  const heatMetricsByComponentId = useMemo<Record<string, ComponentHeatMetrics>>(() => {
    const incoming = new Map<string, number>()
    const outgoing = new Map<string, number>()
    for (const rel of relationships) {
      outgoing.set(rel.sourceComponentId, (outgoing.get(rel.sourceComponentId) ?? 0) + 1)
      incoming.set(rel.targetComponentId, (incoming.get(rel.targetComponentId) ?? 0) + 1)
    }

    const componentById = new Map(components.map((c) => [c.id, c]))
    const classById = new Map(classes.map((c) => [c.id, c]))

    const classLoadOfComponent = (component: ComponentInfo) => {
      const dslPath = component.dslPath ?? ""
      const summary = dslPath ? dslSummaryByPath[dslPath] : undefined
      if (summary) return summary.classes.length
      return component.classIds.length
    }

    const result: Record<string, ComponentHeatMetrics> = {}
    for (const comp of components) {
      const incomingCount = incoming.get(comp.id) ?? 0
      const outgoingCount = outgoing.get(comp.id) ?? 0
      const childCount = comp.childComponentIds.length
      const ownClassLoad = classLoadOfComponent(comp)

      const componentCells = normalizeCells([incomingCount, outgoingCount, childCount, ownClassLoad])

      let classRawCells: number[] = []
      let classLabels: string[] = []
      if (comp.kind === "component") {
        const dslPath = comp.dslPath ?? ""
        const summary = dslPath ? dslSummaryByPath[dslPath] : undefined
        if (summary) {
          classRawCells = summary.classes.map((c) => c.memberCount + c.operationCount)
          classLabels = summary.classes.map((c) => c.name)
        } else {
          classRawCells = comp.classIds.map((classId) => {
            const cls = classById.get(classId)
            if (!cls) return 0
            return cls.members.length + cls.operations.length
          })
          classLabels = comp.classIds.map((classId) => classById.get(classId)?.name ?? classId)
        }
      } else {
        classRawCells = comp.childComponentIds.map((childId) => {
          const child = componentById.get(childId)
          if (!child) return 0
          return classLoadOfComponent(child)
        })
        classLabels = comp.childComponentIds.map((childId) => componentById.get(childId)?.name ?? childId)
      }

      result[comp.id] = {
        componentCells,
        classCells: normalizeCells(classRawCells),
        componentRaw: {
          incoming: incomingCount,
          outgoing: outgoingCount,
          children: childCount,
          classLoad: ownClassLoad,
        },
        classRaw: classRawCells,
        classLabels,
      }
    }

    return result
  }, [components, relationships, classes, dslSummaryByPath])

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
      drawComponentBox(
        ctx,
        comp,
        comp.id === selectedId,
        components,
        classes,
        dslSummaryByPath,
        heatMetricsByComponentId,
        showComponentHeatmap,
        showClassHeatmap,
      )
    }

    ctx.restore()

    drawLegend(ctx, rect.width)
    drawZoomIndicator(ctx, zoom)
  }, [
    components,
    relationships,
    classes,
    selectedId,
    zoom,
    panOffset,
    dslSummaryByPath,
    heatMetricsByComponentId,
    showComponentHeatmap,
    showClassHeatmap,
  ])

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

  function buildComponentHeatTooltip(comp: ComponentInfo, heat: ComponentHeatMetrics): { title: string; lines: string[] } {
    const r = heat.componentRaw
    const totalFlow = r.incoming + r.outgoing
    const hotspot =
      r.incoming >= r.outgoing * 1.5
        ? "受信偏重"
        : r.outgoing >= r.incoming * 1.5
          ? "送信偏重"
          : "入出力は均衡"
    const nextAction =
      totalFlow >= 8
        ? "次アクション: 依存本数が多い境界を1つ選び、Facade/Portで疎結合化"
        : "次アクション: この状態を維持し、L4の増加だけ監視"
    return {
      title: `${comp.name} / コンポーネント俯瞰`,
      lines: [
        `リンク: In ${r.incoming} / Out ${r.outgoing} (合計 ${totalFlow})`,
        `内部規模: 子要素 ${r.children}, クラス数 ${r.classLoad}`,
        `偏り判定: ${hotspot}`,
        nextAction,
      ],
    }
  }
  function buildClassHeatTooltip(comp: ComponentInfo, heat: ComponentHeatMetrics): { title: string; lines: string[] } {
    const entries = heat.classRaw
      .map((value, idx) => ({ value, label: heat.classLabels[idx] ?? `Item${idx + 1}` }))
      .filter((e) => Number.isFinite(e.value))
    const values = entries.map((e) => e.value)
    const count = values.length
    if (count === 0) {
      return {
        title: `${comp.name} / クラス負荷`,
        lines: ["クラス指標なし"],
      }
    }

    const sorted = [...values].sort((a, b) => a - b)
    const sum = sorted.reduce((acc, n) => acc + n, 0)
    const avg = sum / count
    const min = sorted[0]
    const max = sorted[count - 1]
    const median = sorted[Math.floor((count - 1) / 2)]
    const p90 = sorted[Math.floor((count - 1) * 0.9)]

    const bins = buildHeatBins(heat.classCells)

    const topEntries = [...entries]
      .sort((a, b) => b.value - a.value)
      .slice(0, CLASS_TOOLTIP_TOP_N)
      .map((e) => `${e.label}(${e.value})`)

    const l4Ratio = bins[3] / Math.max(1, count)
    const balance =
      l4Ratio >= 0.4
        ? "偏り強"
        : l4Ratio >= 0.2
          ? "やや偏り"
          : "概ね均等"
    const nextAction =
      l4Ratio >= 0.4
        ? "次アクション: 負荷上位クラスを分割し、責務を別クラスへ移譲"
        : l4Ratio >= 0.2
          ? "次アクション: 上位クラスのメソッド群を集約単位ごとに整理"
          : "次アクション: 現状維持。新規実装はL4集中を避ける"

    return {
      title: `${comp.name} / クラス負荷`,
      lines: [
        `負荷上位クラス: ${topEntries.join(", ") || "-"}`,
        `4段階分布 (L1-L4): ${bins.join(" / ")} -> ${balance}`,
        "L1-L4補足: L1=低負荷, L2=やや低, L3=やや高, L4=高負荷（同一コンポーネント内での相対評価）",
        `Min / Avg / Max: ${min} / ${avg.toFixed(1)} / ${max}`,
        `Median / P90: ${median} / ${p90}`,
        nextAction,
      ],
    }
  }
  function hitTestHeatRow(worldX: number, worldY: number): { component: ComponentInfo; row: "component" | "class" } | null {
    if (!showComponentHeatmap && !showClassHeatmap) return null
    for (let i = components.length - 1; i >= 0; i--) {
      const comp = components[i]
      const heat = heatMetricsByComponentId[comp.id]
      if (!heat) continue

      const { panelX, panelY, panelH } = getHeatPanelLayout(comp, showComponentHeatmap, showClassHeatmap)
      if (worldX < panelX || worldX > panelX + HEATMAP_PANEL_WIDTH) continue
      if (worldY < panelY || worldY > panelY + panelH) continue

      let rowY = panelY + 6
      const rowH = 12
      if (showComponentHeatmap) {
        if (worldY >= rowY && worldY <= rowY + rowH) {
          return { component: comp, row: "component" }
        }
        rowY += 16
      }
      if (showClassHeatmap) {
        if (worldY >= rowY && worldY <= rowY + rowH) {
          return { component: comp, row: "class" }
        }
      }
    }
    return null
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
      setHeatTooltip(null)
      onMoveComponent(interaction.componentId, world.x - interaction.offsetX, world.y - interaction.offsetY)
      return
    }

    if (interaction.mode === "resizing-component" && interaction.componentId && onResizeComponent) {
      setHeatTooltip(null)
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
      setHeatTooltip(null)
      const dx = screenX - interaction.startPanX
      const dy = screenY - interaction.startPanY
      setPanOffset({ x: interaction.startOffsetX + dx, y: interaction.startOffsetY + dy })
      return
    }

    const heatHit = hitTestHeatRow(world.x, world.y)
    if (!heatHit) {
      setHeatTooltip(null)
      return
    }

    const heat = heatMetricsByComponentId[heatHit.component.id]
    if (!heat) {
      setHeatTooltip(null)
      return
    }

    const payload =
      heatHit.row === "component"
        ? buildComponentHeatTooltip(heatHit.component, heat)
        : buildClassHeatTooltip(heatHit.component, heat)

    setHeatTooltip({
      screenX: screenX + 14,
      screenY: screenY + 14,
      title: payload.title,
      lines: payload.lines,
    })
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
          setHeatTooltip(null)
        }}
      />

      {heatTooltip && (
        <div
          className="absolute z-20 max-w-[460px] rounded border border-slate-200 bg-white/95 px-2 py-1.5 shadow-md"
          style={{
            left: heatTooltip.screenX,
            top: heatTooltip.screenY,
            pointerEvents: "none",
          }}
        >
          <div className="text-[11px] font-semibold text-slate-800">{heatTooltip.title}</div>
          {heatTooltip.lines.map((line, idx) => (
            <div key={idx} className="text-[10px] leading-4 text-slate-600">
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="absolute left-4 top-4 flex gap-2">
        <Button
          variant={showComponentHeatmap ? "default" : "outline"}
          size="sm"
          onClick={() => setShowComponentHeatmap((v) => !v)}
          className="h-7 px-2 text-[11px] shadow-sm"
          title="Toggle component-level mini heatmap"
        >
          Cmp Heat
        </Button>
        <Button
          variant={showClassHeatmap ? "default" : "outline"}
          size="sm"
          onClick={() => setShowClassHeatmap((v) => !v)}
          className="h-7 px-2 text-[11px] shadow-sm"
          title="Toggle class-level mini heatmap"
        >
          Cls Heat
        </Button>
      </div>

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
