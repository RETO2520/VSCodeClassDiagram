"use client"

import React from "react"
import { useRef, useCallback, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, Maximize2, Maximize } from "lucide-react"
import type {
  ClassInfo,
  Relationship,
  ClassOperation,
  ClassMember,
} from "@/lib/class-diagram-types"
import {
  visibilitySymbol,
  classKindStereotype,
} from "@/lib/class-diagram-types"

// ==============================
// Constants
// ==============================
const FONT_SIZE = 13
const SMALL_FONT_SIZE = 11
const HEADER_PADDING = 10
const SECTION_PADDING = 6
const LINE_HEIGHT = 18
const MIN_WIDTH = 160
const HORIZONTAL_PAD = 12
const STEREOTYPE_FONT_SIZE = 10
const MONO_FONT = '"SF Mono", "Cascadia Code", "Fira Code", monospace'

const MIN_ZOOM = 0.2
const MAX_ZOOM = 3
const ZOOM_STEP = 0.15

// ==============================
// Colors
// ==============================
function getColors(kind: ClassInfo["kind"], isAbstract: boolean) {
  switch (kind) {
    case "class":
      return {
        headerBg: isAbstract ? "#312e81" : "#1e293b",
        headerText: isAbstract ? "#e0e7ff" : "#f8fafc",
        bodyBg: isAbstract ? "#eef2ff" : "#f8fafc",
        bodyText: isAbstract ? "#312e81" : "#1e293b",
        border: isAbstract ? "#6366f1" : "#334155",
        stereotypeText: isAbstract ? "#818cf8" : "#94a3b8",
      }
    case "interface":
      return {
        headerBg: "#1e3a5f",
        headerText: "#dbeafe",
        bodyBg: "#eff6ff",
        bodyText: "#1e3a5f",
        border: "#3b82f6",
        stereotypeText: "#60a5fa",
      }
    case "struct":
      return {
        headerBg: "#365314",
        headerText: "#ecfccb",
        bodyBg: "#f7fee7",
        bodyText: "#365314",
        border: "#65a30d",
        stereotypeText: "#84cc16",
      }
  }
}

// ==============================
// Measure text
// ==============================
function measureText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  bold = false,
  italic = false,
): number {
  ctx.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${fontSize}px ${MONO_FONT}`
  return ctx.measureText(text).width
}

// ==============================
// Format member/operation as UML string
// ==============================
function formatMember(m: ClassMember): string {
  return `${visibilitySymbol(m.visibility)} ${m.name}: ${m.type}`
}

function formatOperation(op: ClassOperation): string {
  const params = op.parameters.map((p) => `${p.name}: ${p.type}`).join(", ")
  return `${visibilitySymbol(op.visibility)} ${op.name}(${params}): ${op.returnType}`
}

// ==============================
// Calculate class box dimensions
// ==============================
function calculateClassDimensions(
  ctx: CanvasRenderingContext2D,
  classInfo: ClassInfo,
): {
  width: number
  height: number
  headerHeight: number
  membersHeight: number
  operationsHeight: number
  memberOffsets: Record<string, number>
} {
  const stereotype = classKindStereotype(classInfo)
  const stereotypeWidth = stereotype
    ? measureText(ctx, stereotype, STEREOTYPE_FONT_SIZE, false, true)
    : 0
  const nameWidth = measureText(ctx, classInfo.name, FONT_SIZE, true, classInfo.isAbstract)

  let maxTextWidth = Math.max(stereotypeWidth, nameWidth)

  for (const m of classInfo.members) {
    const w = measureText(ctx, formatMember(m), SMALL_FONT_SIZE, false, m.isAbstract)
    maxTextWidth = Math.max(maxTextWidth, w)
  }

  for (const op of classInfo.operations) {
    const w = measureText(ctx, formatOperation(op), SMALL_FONT_SIZE, false, op.isAbstract)
    maxTextWidth = Math.max(maxTextWidth, w)
  }

  const width = Math.max(MIN_WIDTH, maxTextWidth + HORIZONTAL_PAD * 2)

  let headerHeight = HEADER_PADDING * 2 + FONT_SIZE
  if (stereotype) {
    headerHeight += STEREOTYPE_FONT_SIZE + 4
  }

  const membersHeight =
    classInfo.members.length > 0
      ? SECTION_PADDING * 2 + classInfo.members.length * LINE_HEIGHT
      : SECTION_PADDING * 2 + LINE_HEIGHT * 0.5

  const operationsHeight =
    classInfo.operations.length > 0
      ? SECTION_PADDING * 2 + classInfo.operations.length * LINE_HEIGHT
      : SECTION_PADDING * 2 + LINE_HEIGHT * 0.5

  const height = headerHeight + membersHeight + operationsHeight

  // Calculate offsets for each member/operation center
  const memberOffsets: Record<string, number> = {}
  const membersSectionY = headerHeight
  classInfo.members.forEach((m, i) => {
    memberOffsets[m.id] = membersSectionY + SECTION_PADDING + (i + 0.5) * LINE_HEIGHT
  })

  const operationsSectionY = membersSectionY + membersHeight
  classInfo.operations.forEach((op, i) => {
    memberOffsets[op.id] = operationsSectionY + SECTION_PADDING + (i + 0.5) * LINE_HEIGHT
  })

  return {
    width,
    height,
    headerHeight,
    membersHeight,
    operationsHeight,
    memberOffsets,
  }
}

// ==============================
// Draw a single class box
// ==============================
function drawClassBox(
  ctx: CanvasRenderingContext2D,
  classInfo: ClassInfo,
  isSelected: boolean,
) {
  const dims = calculateClassDimensions(ctx, classInfo)
  const { x, y } = classInfo
  const colors = getColors(classInfo.kind, classInfo.isAbstract)
  const stereotype = classKindStereotype(classInfo)

  // Shadow
  ctx.save()
  ctx.shadowColor = "rgba(0, 0, 0, 0.12)"
  ctx.shadowBlur = 8
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2

  const r = 6
  ctx.beginPath()
  ctx.roundRect(x, y, dims.width, dims.height, r)
  ctx.fillStyle = colors.bodyBg
  ctx.fill()
  ctx.restore()

  // Header background
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, dims.width, dims.headerHeight, [r, r, 0, 0])
  ctx.fillStyle = colors.headerBg
  ctx.fill()
  ctx.restore()

  // Border
  ctx.beginPath()
  ctx.roundRect(x, y, dims.width, dims.height, r)
  ctx.strokeStyle = isSelected ? "#3b82f6" : colors.border
  ctx.lineWidth = isSelected ? 2.5 : 1.5
  ctx.stroke()

  // Section dividers
  const membersSectionY = y + dims.headerHeight
  ctx.beginPath()
  ctx.moveTo(x, membersSectionY)
  ctx.lineTo(x + dims.width, membersSectionY)
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 1
  ctx.stroke()

  const operationsSectionY = membersSectionY + dims.membersHeight
  ctx.beginPath()
  ctx.moveTo(x, operationsSectionY)
  ctx.lineTo(x + dims.width, operationsSectionY)
  ctx.stroke()

  // Header text
  let textY = y + HEADER_PADDING
  if (stereotype) {
    ctx.font = `italic ${STEREOTYPE_FONT_SIZE}px ${MONO_FONT}`
    ctx.fillStyle = colors.stereotypeText
    ctx.textAlign = "center"
    ctx.fillText(stereotype, x + dims.width / 2, textY + STEREOTYPE_FONT_SIZE)
    textY += STEREOTYPE_FONT_SIZE + 4
  }

  // Class name (italic if abstract)
  const nameItalic = classInfo.isAbstract ? "italic " : ""
  ctx.font = `${nameItalic}bold ${FONT_SIZE}px ${MONO_FONT}`
  ctx.fillStyle = colors.headerText
  ctx.textAlign = "center"
  ctx.fillText(classInfo.name, x + dims.width / 2, textY + FONT_SIZE)

  // Members
  ctx.fillStyle = colors.bodyText
  ctx.textAlign = "left"
  if (classInfo.members.length > 0) {
    classInfo.members.forEach((m, i) => {
      const my = membersSectionY + SECTION_PADDING + (i + 1) * LINE_HEIGHT - 3
      const text = formatMember(m)

      if (m.isStatic) {
        ctx.font = `${m.isAbstract ? "italic " : ""}${SMALL_FONT_SIZE}px ${MONO_FONT}`
        ctx.fillText(text, x + HORIZONTAL_PAD, my)
        const tw = ctx.measureText(text).width
        ctx.beginPath()
        ctx.moveTo(x + HORIZONTAL_PAD, my + 2)
        ctx.lineTo(x + HORIZONTAL_PAD + tw, my + 2)
        ctx.strokeStyle = colors.bodyText
        ctx.lineWidth = 1
        ctx.stroke()
      } else {
        ctx.font = `${m.isAbstract ? "italic " : ""}${SMALL_FONT_SIZE}px ${MONO_FONT}`
        ctx.fillText(text, x + HORIZONTAL_PAD, my)
      }
    })
  }

  // Operations
  if (classInfo.operations.length > 0) {
    classInfo.operations.forEach((op, i) => {
      const oy = operationsSectionY + SECTION_PADDING + (i + 1) * LINE_HEIGHT - 3
      const text = formatOperation(op)

      if (op.isStatic) {
        ctx.font = `${op.isAbstract ? "italic " : ""}${SMALL_FONT_SIZE}px ${MONO_FONT}`
        ctx.fillStyle = colors.bodyText
        ctx.fillText(text, x + HORIZONTAL_PAD, oy)
        const tw = ctx.measureText(text).width
        ctx.beginPath()
        ctx.moveTo(x + HORIZONTAL_PAD, oy + 2)
        ctx.lineTo(x + HORIZONTAL_PAD + tw, oy + 2)
        ctx.strokeStyle = colors.bodyText
        ctx.lineWidth = 1
        ctx.stroke()
      } else {
        ctx.font = `${op.isAbstract ? "italic " : ""}${SMALL_FONT_SIZE}px ${MONO_FONT}`
        ctx.fillStyle = colors.bodyText
        ctx.fillText(text, x + HORIZONTAL_PAD, oy)
      }
    })
  }

  return dims
}

// ==============================
// Draw relationship line
// ==============================
function drawRelationship(
  ctx: CanvasRenderingContext2D,
  rel: Relationship,
  classes: ClassInfo[],
) {
  const source = classes.find((c) => c.id === rel.sourceId)
  const target = classes.find((c) => c.id === rel.targetId)
  if (!source || !target) return

  const sDims = calculateClassDimensions(ctx, source)
  const tDims = calculateClassDimensions(ctx, target)

  const sCx = source.x + sDims.width / 2
  const sCy = source.y + sDims.height / 2
  const tCx = target.x + tDims.width / 2
  const tCy = target.y + tDims.height / 2

  // Determine fixed Y offsets if members are specified
  const sLocalY = rel.sourceMemberId ? sDims.memberOffsets[rel.sourceMemberId] : undefined
  const tLocalY = rel.targetMemberId ? tDims.memberOffsets[rel.targetMemberId] : undefined

  // Calculate connection points
  // 1st pass: get potentially fixed Y
  const { sy: initialSy } = getEdgePoint(source.x, source.y, sDims.width, sDims.height, tCx, tCy, sLocalY)
  const { sy: initialTy } = getEdgePoint(target.x, target.y, tDims.width, tDims.height, sCx, sCy, tLocalY)

  // 2nd pass: use the (possibly shifted) Y from the other side as hint
  const { sx, sy, side: sSide } = getEdgePoint(source.x, source.y, sDims.width, sDims.height, tCx, initialTy, sLocalY)
  const { sx: tx, sy: ty, side: tSide } = getEdgePoint(target.x, target.y, tDims.width, tDims.height, sCx, initialSy, tLocalY)

  const lineColors: Record<string, string> = {
    association: "#64748b",
    aggregation: "#0ea5e9",
    composition: "#22c55e",
    dependency: "#f59e0b",
    realization: "#8b5cf6",
    generalization: "#ef4444",
  }
  const color = lineColors[rel.type] || "#64748b"

  // --- Orthogonal Routing ---
  const points: { x: number; y: number }[] = []
  points.push({ x: sx, y: sy })

  // Logic to determine intermediate points
  if (sSide === "left" || sSide === "right") {
    if (tSide === "left" || tSide === "right") {
      const midX = (sx + tx) / 2
      points.push({ x: midX, y: sy })
      points.push({ x: midX, y: ty })
    } else {
      // tSide is top or bottom
      points.push({ x: tx, y: sy })
    }
  } else {
    // sSide is top or bottom
    if (tSide === "top" || tSide === "bottom") {
      const midY = (sy + ty) / 2
      points.push({ x: sx, y: midY })
      points.push({ x: tx, y: midY })
    } else {
      // tSide is left or right
      points.push({ x: sx, y: ty })
    }
  }
  points.push({ x: tx, y: ty })

  // Draw line
  ctx.save()
  if (rel.type === "dependency" || rel.type === "realization") {
    ctx.setLineDash([6, 4])
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.stroke()
  ctx.restore()

  // Angles for heads
  const lastPoint = points[points.length - 1]
  const prevPoint = points[points.length - 2]
  const targetAngle = Math.atan2(lastPoint.y - prevPoint.y, lastPoint.x - prevPoint.x)

  const firstPoint = points[0]
  const secondPoint = points[1]
  const sourceAngle = Math.atan2(secondPoint.y - firstPoint.y, secondPoint.x - firstPoint.x)

  switch (rel.type) {
    case "aggregation":
      drawDiamond(ctx, sx, sy, sourceAngle, color, false)
      drawOpenArrow(ctx, tx, ty, targetAngle, color)
      break
    case "composition":
      drawDiamond(ctx, sx, sy, sourceAngle, color, true)
      drawOpenArrow(ctx, tx, ty, targetAngle, color)
      break
    case "dependency":
      drawOpenArrow(ctx, tx, ty, targetAngle, color)
      break
    case "realization":
      drawHollowTriangle(ctx, tx, ty, targetAngle, color)
      break
    case "generalization":
      drawHollowTriangle(ctx, tx, ty, targetAngle, color)
      break
    case "association":
    default:
      drawOpenArrow(ctx, tx, ty, targetAngle, color)
      break
  }

  // Label
  if (rel.label) {
    // Find middle segment
    const midIdx = Math.floor(points.length / 2)
    const p1 = points[midIdx - 1]
    const p2 = points[midIdx]
    const labelX = (p1.x + p2.x) / 2
    const labelY = (p1.y + p2.y) / 2

    ctx.save()
    ctx.font = `${STEREOTYPE_FONT_SIZE}px sans-serif`
    ctx.fillStyle = color
    ctx.textAlign = "center"
    ctx.fillText(rel.label, labelX, labelY - 8)
    ctx.restore()
  }

  // Multiplicity labels
  if (rel.sourceMultiplicity || rel.targetMultiplicity) {
    ctx.save()
    ctx.font = "bold 10px sans-serif"
    ctx.fillStyle = "#1e293b"

    if (rel.sourceMultiplicity) {
      const p1 = points[0]
      const p2 = points[1]
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
      const perpAngle = angle + Math.PI / 2
      const offset = 14
      const smx = p1.x + Math.cos(perpAngle) * offset + Math.cos(angle) * 16
      const smy = p1.y + Math.sin(perpAngle) * offset + Math.sin(angle) * 16
      ctx.textAlign = "center"
      ctx.fillText(rel.sourceMultiplicity, smx, smy)
    }

    if (rel.targetMultiplicity) {
      const p2 = points[points.length - 1]
      const p1 = points[points.length - 2]
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
      const perpAngle = angle + Math.PI / 2
      const offset = 14
      const tmx = p2.x + Math.cos(perpAngle) * offset - Math.cos(angle) * 16
      const tmy = p2.y + Math.sin(perpAngle) * offset - Math.sin(angle) * 16
      ctx.textAlign = "center"
      ctx.fillText(rel.targetMultiplicity, tmx, tmy)
    }

    ctx.restore()
  }
}

function getEdgePoint(
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  px: number,
  py: number,
  fixedLocalY?: number,
): { sx: number; sy: number; side: "top" | "bottom" | "left" | "right" } {
  const cx = rx + rw / 2
  const cy = ry + rh / 2

  if (fixedLocalY !== undefined) {
    const sx = px > cx ? rx + rw : rx
    const sy = ry + fixedLocalY
    return { sx, sy, side: px > cx ? "right" : "left" }
  }

  const dx = px - cx
  const dy = py - cy

  if (dx === 0 && dy === 0) return { sx: cx, sy: cy, side: "top" }

  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  let sx: number
  let sy: number
  let side: "top" | "bottom" | "left" | "right"

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

// --- Arrow head helpers ---

function drawOpenArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
) {
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

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
  filled: boolean,
) {
  const size = 12
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(size, -size / 2.5)
  ctx.lineTo(size * 2, 0)
  ctx.lineTo(size, size / 2.5)
  ctx.closePath()
  ctx.fillStyle = filled ? color : "#ffffff"
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

function drawHollowTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
) {
  const size = 12
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, -size / 2)
  ctx.lineTo(-size, size / 2)
  ctx.closePath()
  ctx.fillStyle = "#ffffff"
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

// ==============================
// Canvas Component with Zoom & Pan
// ==============================

interface DiagramCanvasProps {
  classes: ClassInfo[]
  relationships: Relationship[]
  selectedId: string | null
  onSelectClass: (id: string | null) => void
  onMoveClass: (id: string, x: number, y: number) => void
}

export function DiagramCanvas({
  classes,
  relationships,
  selectedId,
  onSelectClass,
  onMoveClass,
}: DiagramCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // View transform state
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })

  // Interaction state refs (to avoid re-renders during drag)
  const interactionRef = useRef<{
    mode: "none" | "dragging-class" | "panning"
    classId: string | null
    offsetX: number
    offsetY: number
    startPanX: number
    startPanY: number
    startOffsetX: number
    startOffsetY: number
  }>({
    mode: "none",
    classId: null,
    offsetX: 0,
    offsetY: 0,
    startPanX: 0,
    startPanY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  })

  /** Convert screen coordinates to world coordinates */
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      return {
        x: (screenX - panOffset.x) / zoom,
        y: (screenY - panOffset.y) / zoom,
      }
    },
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

    // Clear
    ctx.clearRect(0, 0, rect.width, rect.height)

    // Draw grid (in screen space, before transform so it tiles nicely)
    drawGrid(ctx, rect.width, rect.height, zoom, panOffset)

    // Apply view transform
    ctx.save()
    ctx.translate(panOffset.x, panOffset.y)
    ctx.scale(zoom, zoom)

    for (const rel of relationships) {
      drawRelationship(ctx, rel, classes)
    }

    for (const cls of classes) {
      drawClassBox(ctx, cls, cls.id === selectedId)
    }

    ctx.restore()

    // Draw legend in screen space (top-right, unaffected by zoom/pan)
    drawLegend(ctx, rect.width)

    // Zoom indicator
    drawZoomIndicator(ctx, zoom)
  }, [classes, relationships, selectedId, zoom, panOffset])

  useEffect(() => {
    draw()
    const resizeObserver = new ResizeObserver(() => draw())
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    return () => resizeObserver.disconnect()
  }, [draw])

  function hitTest(worldX: number, worldY: number): string | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    for (let i = classes.length - 1; i >= 0; i--) {
      const cls = classes[i]
      const dims = calculateClassDimensions(ctx, cls)
      if (
        worldX >= cls.x &&
        worldX <= cls.x + dims.width &&
        worldY >= cls.y &&
        worldY <= cls.y + dims.height
      ) {
        return cls.id
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
      // Dragging a class box
      const cls = classes.find((c) => c.id === hitId)
      if (cls) {
        onSelectClass(hitId)
        interactionRef.current = {
          mode: "dragging-class",
          classId: hitId,
          offsetX: world.x - cls.x,
          offsetY: world.y - cls.y,
          startPanX: 0,
          startPanY: 0,
          startOffsetX: 0,
          startOffsetY: 0,
        }
      }
    } else {
      // Panning the canvas
      onSelectClass(null)
      interactionRef.current = {
        mode: "panning",
        classId: null,
        offsetX: 0,
        offsetY: 0,
        startPanX: screenX,
        startPanY: screenY,
        startOffsetX: panOffset.x,
        startOffsetY: panOffset.y,
      }
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const interaction = interactionRef.current
    if (interaction.mode === "none") return

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    if (interaction.mode === "dragging-class" && interaction.classId) {
      const world = screenToWorld(screenX, screenY)
      onMoveClass(
        interaction.classId,
        world.x - interaction.offsetX,
        world.y - interaction.offsetY,
      )
    } else if (interaction.mode === "panning") {
      const dx = screenX - interaction.startPanX
      const dy = screenY - interaction.startPanY
      setPanOffset({
        x: interaction.startOffsetX + dx,
        y: interaction.startOffsetY + dy,
      })
    }
  }

  function handleMouseUp() {
    interactionRef.current.mode = "none"
  }

  // Use refs for wheel handler to get stable references
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
    if (classes.length === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()

    // Calculate bounding box of all classes
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const cls of classes) {
      const dims = calculateClassDimensions(ctx, cls)
      minX = Math.min(minX, cls.x)
      minY = Math.min(minY, cls.y)
      maxX = Math.max(maxX, cls.x + dims.width)
      maxY = Math.max(maxY, cls.y + dims.height)
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

  function calculateHierarchicalLayout() {
    if (classes.length === 0) return []
    const canvas = canvasRef.current
    if (!canvas) return []
    const ctx = canvas.getContext("2d")
    if (!ctx) return []

    // 1. Build adjacency list for inheritance/realization
    // We want to go from Parent -> Children for level assignment
    const adj = new Map<string, string[]>()
    const inDegree = new Map<string, number>()

    classes.forEach(c => {
      adj.set(c.id, [])
      inDegree.set(c.id, 0)
    })

    classes.forEach(c => {
      const parents = []
      if (c.baseClassId) parents.push(c.baseClassId)
      if (c.interfaces) parents.push(...c.interfaces)

      parents.forEach(pId => {
        if (adj.has(pId)) {
          adj.get(pId)!.push(c.id)
          inDegree.set(c.id, (inDegree.get(c.id) || 0) + 1)
        }
      })
    })

    // 2. Assign levels using BFS (Topological sort style)
    const levels = new Map<string, number>()
    const queue: { id: string; level: number }[] = []

    // Start with nodes that have no parents in the diagram
    classes.forEach(c => {
      if (inDegree.get(c.id) === 0) {
        queue.push({ id: c.id, level: 0 })
      }
    })

    while (queue.length > 0) {
      const { id, level } = queue.shift()!
      levels.set(id, Math.max(levels.get(id) || 0, level))

      adj.get(id)?.forEach(childId => {
        queue.push({ id: childId, level: level + 1 })
      })
    }

    // Handle nodes with cycles or disconnected (should be covered by queue init, but just in case)
    classes.forEach(c => {
      if (!levels.has(c.id)) levels.set(c.id, 0)
    })

    // 3. Group by levels and calculate positions
    const levelGroups: Record<number, string[]> = {}
    levels.forEach((level, id) => {
      if (!levelGroups[level]) levelGroups[level] = []
      levelGroups[level].push(id)
    })

    const VERTICAL_GAP = 100
    const HORIZONTAL_GAP = 40
    const results: { id: string; x: number; y: number }[] = []

    let currentY = 0
    const levelIndices = Object.keys(levelGroups).map(Number).sort((a, b) => a - b)

    levelIndices.forEach(level => {
      const ids = levelGroups[level]
      let currentX = 0
      let maxHeightInLevel = 0

      // Calculate total width of this level to center it
      const dimsList = ids.map(id => {
        const cls = classes.find(c => c.id === id)!
        const d = calculateClassDimensions(ctx, cls)
        return { id, ...d }
      })

      const totalLevelWidth = dimsList.reduce((sum, d) => sum + d.width, 0) + (ids.length - 1) * HORIZONTAL_GAP

      // Starting X to center the level
      let startX = -totalLevelWidth / 2

      dimsList.forEach(d => {
        results.push({
          id: d.id,
          x: startX,
          y: currentY
        })
        startX += d.width + HORIZONTAL_GAP
        maxHeightInLevel = Math.max(maxHeightInLevel, d.height)
      })

      currentY += maxHeightInLevel + VERTICAL_GAP
    })

    return results
  }

  function handleAlignAll() {
    const layout = calculateHierarchicalLayout()
    if (layout.length === 0) return

    layout.forEach(pos => {
      onMoveClass(pos.id, pos.x, pos.y)
    })

    // After repositioning all classes, fit to view
    setTimeout(() => {
      handleFitAll()
    }, 50)
  }

  return (
    <div ref={containerRef} className="relative h-full w-full bg-background">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ cursor: interactionRef.current.mode === "panning" ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* Zoom controls */}
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

// ==============================
// Grid (drawn in screen space, respecting zoom/pan)
// ==============================
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

  // Skip drawing if grid too dense or too sparse
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

// ==============================
// Zoom indicator
// ==============================
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

// ==============================
// Legend
// ==============================
function drawLegend(ctx: CanvasRenderingContext2D, canvasWidth: number) {
  const legends = [
    { label: "Association", color: "#64748b", dash: false },
    { label: "Aggregation", color: "#0ea5e9", dash: false },
    { label: "Composition", color: "#22c55e", dash: false },
    { label: "Dependency", color: "#f59e0b", dash: true },
    { label: "Realization", color: "#8b5cf6", dash: true },
    { label: "Generalization", color: "#ef4444", dash: false },
  ]

  const startX = canvasWidth - 190
  const startY = 16
  const lineLen = 30
  const lineSpacing = 22

  ctx.save()
  ctx.font = "11px sans-serif"

  ctx.fillStyle = "rgba(255,255,255,0.92)"
  const boxW = 186
  const boxH = legends.length * lineSpacing + 14
  ctx.beginPath()
  ctx.roundRect(startX - 10, startY - 6, boxW, boxH, 4)
  ctx.fill()
  ctx.strokeStyle = "#e2e8f0"
  ctx.lineWidth = 1
  ctx.stroke()

  legends.forEach((leg, i) => {
    const y = startY + i * lineSpacing + 10

    ctx.beginPath()
    ctx.strokeStyle = leg.color
    ctx.lineWidth = 2
    if (leg.dash) ctx.setLineDash([5, 3])
    else ctx.setLineDash([])
    ctx.moveTo(startX, y)
    ctx.lineTo(startX + lineLen, y)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = "#475569"
    ctx.textAlign = "left"
    ctx.fillText(leg.label, startX + lineLen + 8, y + 4)
  })

  ctx.restore()
}
