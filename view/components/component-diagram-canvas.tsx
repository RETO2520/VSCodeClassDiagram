"use client"

import React from "react"
import { ComponentNode } from "./component-node"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, Maximize2, Maximize } from "lucide-react"
import type { ComponentInfo, ComponentKind, ComponentRelationship, PortConnection } from "@/lib/component-diagram-types"
import type { ClassInfo, Relationship as ClassRelationship } from "@/lib/class-diagram-types"
import { postMessage } from "../../frontend/src/bridge/vscode-bridge"

// ==============================
// Types
// ==============================
interface PortInfo {
  id: string
  name: string
  type: "input" | "output"
  worldX: number
  worldY: number
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

interface PortGroup {
  inputs: PortInfo[]
  outputs: PortInfo[]
}

interface PortHit {
  componentId: string
  portId: string
  direction: "input" | "output"
  worldX: number
  worldY: number
  name: string
}

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
const MAX_EVIDENCE_TOOLTIP_LINES = 16
const SOCKET_RADIUS = 6
const SOCKET_HIT_RADIUS = 10

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

function drawSocket(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: string,
  stroke: string,
  isHot = false,
) {
  ctx.save()
  if (isHot) {
    ctx.shadowColor = fill
    ctx.shadowBlur = 10
  }
  ctx.beginPath()
  ctx.arc(x, y, SOCKET_RADIUS + 1.5, 0, Math.PI * 2)
  ctx.fillStyle = "rgba(255,255,255,0.95)"
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.6
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x, y, SOCKET_RADIUS - 1.5, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()

  ctx.beginPath()
  ctx.arc(x - 2, y - 2, 1.2, 0, Math.PI * 2)
  ctx.fillStyle = "rgba(255,255,255,0.85)"
  ctx.fill()
  ctx.restore()
}

function drawIconButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  fill = "#e2e8f0",
  text = "#1e3a8a",
) {
  ctx.save()
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 3)
  ctx.fill()
  ctx.strokeStyle = "#cbd5f5"
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = text
  ctx.font = `bold 10px ${MONO_FONT}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(label, x + w / 2, y + h / 2 + 0.5)
  ctx.restore()
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
  ports: PortGroup,
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

  // Port section
  const inHeaderX = x + BODY_PADDING
  const headerY = textY

  ctx.fillStyle = colors.bodyText
  ctx.font = `bold ${SMALL_FONT_SIZE}px ${MONO_FONT}`
  ctx.textAlign = "left"
  ctx.fillText("In:", inHeaderX, headerY)
  // [+] button input
  drawIconButton(ctx, inHeaderX + 34, headerY - 9, 16, 14, "+", "#dbeafe", "#1d4ed8")

  const outHeaderX = x + w - BODY_PADDING - reservedRightWidth
  ctx.fillStyle = colors.bodyText
  ctx.textAlign = "right"
  ctx.fillText("Out:", outHeaderX, headerY)
  // [+] button output
  drawIconButton(ctx, outHeaderX - 50, headerY - 9, 16, 14, "+", "#fee2e2", "#b91c1c")

  const maxWPort = Math.max(0, (w - BODY_PADDING * 2 - reservedRightWidth) / 2)
  const inputSocketX = x + BODY_PADDING + SOCKET_RADIUS + 2
  const outputSocketX = x + w - BODY_PADDING - reservedRightWidth - SOCKET_RADIUS - 2
  ctx.font = `${SMALL_FONT_SIZE}px ${MONO_FONT}`

  for (const p of ports.inputs) {
    if (p.worldY > maxY) break
    const isManual = comp.manualPorts?.some((mp) => mp.id === p.id)

    ctx.fillStyle = colors.bodyText
    ctx.textAlign = "left"
    ctx.fillText(clipText(ctx, p.name, maxWPort - 26), inputSocketX + 12, p.worldY + 4)
    if (isManual) {
      drawIconButton(ctx, inputSocketX + 24, p.worldY - 7, 16, 14, "–", "#fee2e2", "#b91c1c")
    }

    drawSocket(ctx, inputSocketX, p.worldY, "#22c55e", "#166534")
  }

  for (const p of ports.outputs) {
    if (p.worldY > maxY) break
    const isManual = comp.manualPorts?.some((mp) => mp.id === p.id)

    ctx.fillStyle = colors.bodyText
    ctx.textAlign = "right"
    ctx.fillText(clipText(ctx, p.name, maxWPort - 26), outputSocketX - 12, p.worldY + 4)
    if (isManual) {
      drawIconButton(ctx, outputSocketX - 40, p.worldY - 7, 16, 14, "–", "#fee2e2", "#b91c1c")
    }

    drawSocket(ctx, outputSocketX, p.worldY, "#ef4444", "#991b1b")
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

function buildComponentNodeData(
  comp: ComponentInfo,
  components: ComponentInfo[],
  classes: ClassInfo[],
  dslSummaryByPath: Record<string, DslSummary>,
) {
  const statsLabel =
    comp.kind === "component"
      ? (() => {
        const dslPath = comp.dslPath ?? ""
        const summary = dslPath ? dslSummaryByPath[dslPath] : undefined
        if (summary) return `DSL Classes: ${summary.classes.length}`
        if (dslPath) return `DSL: ${dslPath}`
        return `Classes: ${comp.classIds.length}`
      })()
      : `Children: ${comp.childComponentIds.length}`

  let childListTitle = ""
  let childItems: string[] = []

  if (comp.kind === "application") {
    childListTitle = "Subsystems"
    const subsystems = components.filter(
      (c) => c.kind === "subsystem" && comp.childComponentIds.includes(c.id),
    )
    childItems = subsystems.map((c) => c.name)
  } else if (comp.kind === "subsystem") {
    childListTitle = "Components"
    const comps = components.filter(
      (c) => c.kind === "component" && comp.childComponentIds.includes(c.id),
    )
    childItems = comps.map((c) => c.name)
  } else {
    const dslPath = comp.dslPath ?? ""
    const summary = dslPath ? dslSummaryByPath[dslPath] : undefined
    if (summary) {
      childListTitle = `DSL (${dslPath})`
      childItems = summary.classes.map((c) => `${c.name} [F:${c.memberCount} M:${c.operationCount}]`)
    } else {
      childListTitle = "Classes"
      childItems = comp.classIds.map((cid) => classes.find((cls) => cls.id === cid)?.name ?? cid)
    }
  }

  return { statsLabel, childListTitle, childItems }
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

function relationshipDisplayName(rel: ComponentRelationship, componentNameById: Map<string, string>): string {
  const sourceName = componentNameById.get(rel.sourceComponentId) ?? rel.sourceComponentId
  const targetName = componentNameById.get(rel.targetComponentId) ?? rel.targetComponentId
  return `${sourceName} -> ${targetName}`
}

function describeClassRelationshipEvidence(
  rel: ClassRelationship,
  classById: Map<string, ClassInfo>,
  classNameById: Map<string, string>,
): string {
  const classSourceName = classNameById.get(rel.sourceId) ?? rel.sourceId
  const classTargetName = classNameById.get(rel.targetId) ?? rel.targetId
  const sourceClass = classById.get(rel.sourceId)

  let via = rel.label?.trim() ?? ""
  if (rel.sourceMemberId && sourceClass) {
    const member = sourceClass.members.find((m) => m.id === rel.sourceMemberId)
    if (member) {
      via = `${member.name}: ${member.type}`
    } else {
      const op = sourceClass.operations.find((o) => o.id === rel.sourceMemberId)
      if (op) via = `${op.name}()`
    }
  }

  const relType = rel.type ? ` [${rel.type}]` : ""
  return via
    ? `- ${classSourceName} -> ${classTargetName}${relType} (${via})`
    : `- ${classSourceName} -> ${classTargetName}${relType}`
}

function buildEvidenceTooltipLines(
  rel: ComponentRelationship,
  relationshipById: Map<string, ComponentRelationship>,
  componentNameById: Map<string, string>,
  classRelationshipById: Map<string, ClassRelationship>,
  classById: Map<string, ClassInfo>,
  classNameById: Map<string, string>,
): string[] {
  if (rel.basedOnIds.length === 0) return ["No derived evidence"]

  const lines: string[] = []
  const visited = new Set<string>()

  const walk = (evidenceId: string, depth: number) => {
    if (lines.length >= MAX_EVIDENCE_TOOLTIP_LINES) return
    if (visited.has(evidenceId)) return
    visited.add(evidenceId)

    const lower = relationshipById.get(evidenceId)
    const indent = "  ".repeat(Math.min(depth, 3))
    if (!lower) {
      const classRel = classRelationshipById.get(evidenceId)
      if (classRel) {
        lines.push(`${indent}${describeClassRelationshipEvidence(classRel, classById, classNameById)}`)
      } else {
        lines.push(`${indent}- Lower-level relation (name unresolved)`)
      }
      return
    }

    lines.push(`${indent}- ${relationshipDisplayName(lower, componentNameById)}`)
    for (const childId of lower.basedOnIds) walk(childId, depth + 1)
  }

  for (const evidenceId of rel.basedOnIds) walk(evidenceId, 0)
  if (lines.length >= MAX_EVIDENCE_TOOLTIP_LINES) {
    lines.push("...and more")
  }
  return lines
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

function drawDiamondArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string) {
  const size = 10
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, -size / 2)
  ctx.lineTo(-size * 2, 0)
  ctx.lineTo(-size, size / 2)
  ctx.closePath()
  ctx.fillStyle = "white"
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

function drawParentRelationship(
  ctx: CanvasRenderingContext2D,
  parent: ComponentInfo,
  child: ComponentInfo,
) {
  const sCx = parent.x + parent.width / 2
  const sCy = parent.y + parent.height / 2
  const tCx = child.x + child.width / 2
  const tCy = child.y + child.height / 2

  const { sx, sy, side: sSide } = getEdgePoint(parent.x, parent.y, parent.width, parent.height, tCx, tCy)
  const { sx: tx, sy: ty, side: tSide } = getEdgePoint(child.x, child.y, child.width, child.height, sCx, sCy)

  // Use a distinct color (e.g., slate-400 or blue-400) for hierarchy
  const color = "#94a3b8"

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
  // Solid line for composition/hierarchy
  ctx.setLineDash([])
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
  ctx.stroke()
  ctx.restore()

  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  const angle = Math.atan2(last.y - prev.y, last.x - prev.x)

  // Draw diamond arrow at the parent end if we wanted UML style,
  // but let's draw a diamond at the child end to indicate "pointing to child" or vice versa.
  // UML Composition has diamond at the parent. Let's put the diamond at the parent side:
  const first = points[0]
  const second = points[1]
  const startAngle = Math.atan2(first.y - second.y, first.x - second.x)
  drawDiamondArrow(ctx, sx, sy, startAngle, color)
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

function getRelationshipRoute(
  rel: ComponentRelationship,
  components: ComponentInfo[],
): { source: ComponentInfo; target: ComponentInfo; points: { x: number; y: number }[] } | null {
  const source = components.find((c) => c.id === rel.sourceComponentId)
  const target = components.find((c) => c.id === rel.targetComponentId)
  if (!source || !target) return null

  const sCx = source.x + source.width / 2
  const sCy = source.y + source.height / 2
  const tCx = target.x + target.width / 2
  const tCy = target.y + target.height / 2

  const { sx, sy, side: sSide } = getEdgePoint(source.x, source.y, source.width, source.height, tCx, tCy)
  const { sx: tx, sy: ty, side: tSide } = getEdgePoint(target.x, target.y, target.width, target.height, sCx, sCy)

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

  return { source, target, points }
}

function getRelationshipLabelLayout(
  ctx: CanvasRenderingContext2D,
  rel: ComponentRelationship,
  points: { x: number; y: number }[],
) {
  const isDerived = rel.basedOnIds.length > 0
  const label = rel.label ?? (isDerived ? `${rel.basedOnIds.length} evidence` : "manual")
  if (!label) return null

  const midIdx = Math.floor(points.length / 2)
  const p1 = points[midIdx - 1] ?? points[0]
  const p2 = points[midIdx] ?? points[points.length - 1]
  const lx = (p1.x + p2.x) / 2
  const ly = (p1.y + p2.y) / 2

  ctx.save()
  ctx.font = "bold 10px sans-serif"
  const tw = ctx.measureText(label).width
  ctx.restore()

  return {
    isDerived,
    label,
    lx,
    ly,
    boxX: lx - tw / 2 - 6,
    boxY: ly - 18,
    boxW: tw + 12,
    boxH: 16,
  }
}

function drawComponentRelationship(
  ctx: CanvasRenderingContext2D,
  rel: ComponentRelationship,
  components: ComponentInfo[],
) {
  const route = getRelationshipRoute(rel, components)
  if (!route) return
  const { points } = route
  const tx = points[points.length - 1].x
  const ty = points[points.length - 1].y

  const color = "#64748b"
  const isDerived = rel.basedOnIds.length > 0

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

  const labelLayout = getRelationshipLabelLayout(ctx, rel, points)
  if (labelLayout) {
    ctx.save()
    ctx.font = "bold 10px sans-serif"
    ctx.fillStyle = "#0f172a"
    ctx.fillStyle = "rgba(255,255,255,0.9)"
    ctx.beginPath()
    ctx.roundRect(labelLayout.boxX, labelLayout.boxY, labelLayout.boxW, labelLayout.boxH, 4)
    ctx.fill()
    ctx.strokeStyle = "#e2e8f0"
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = "#334155"
    ctx.textAlign = "center"
    ctx.fillText(labelLayout.label, labelLayout.lx, labelLayout.ly - 6)
    ctx.restore()
  }
}

function drawPortConnection(
  ctx: CanvasRenderingContext2D,
  pc: PortConnection,
  componentPorts: Map<string, PortGroup>,
) {
  const srcPorts = componentPorts.get(pc.sourceComponentId)
  const tgtPorts = componentPorts.get(pc.targetComponentId)
  if (!srcPorts || !tgtPorts) return

  const srcPort = srcPorts.outputs.find(p => p.id === pc.sourcePortId)
  const tgtPort = tgtPorts.inputs.find(p => p.id === pc.targetPortId)
  if (!srcPort || !tgtPort) return

  const sx = srcPort.worldX
  const sy = srcPort.worldY
  const tx = tgtPort.worldX
  const ty = tgtPort.worldY
  const dx = Math.abs(tx - sx) * 0.4

  ctx.save()
  ctx.strokeStyle = "#8b5cf6"
  ctx.lineWidth = 2
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.bezierCurveTo(sx + dx, sy, tx - dx, ty, tx, ty)
  ctx.stroke()

  // arrowhead
  const arrowLen = 8
  const t = 0.98
  const t1 = 1 - t
  const ax = t1*t1*t1*sx + 3*t1*t1*t*(sx+dx) + 3*t1*t*t*(tx-dx) + t*t*t*tx
  const ay = t1*t1*t1*sy + 3*t1*t1*t*sy + 3*t1*t*t*ty + t*t*t*ty
  const angle = Math.atan2(ty - ay, tx - ax)
  ctx.fillStyle = "#8b5cf6"
  ctx.beginPath()
  ctx.moveTo(tx, ty)
  ctx.lineTo(tx - arrowLen * Math.cos(angle - Math.PI / 6), ty - arrowLen * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(tx - arrowLen * Math.cos(angle + Math.PI / 6), ty - arrowLen * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()

  // label
  if (pc.label) {
    const mx = (sx + tx) / 2
    const my = (sy + ty) / 2 - 8
    ctx.font = "bold 10px sans-serif"
    const tw = ctx.measureText(pc.label).width
    ctx.fillStyle = "rgba(255,255,255,0.9)"
    ctx.beginPath()
    ctx.roundRect(mx - tw / 2 - 4, my - 8, tw + 8, 16, 4)
    ctx.fill()
    ctx.strokeStyle = "#c4b5fd"
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = "#7c3aed"
    ctx.textAlign = "center"
    ctx.fillText(pc.label, mx, my + 4)
  }

  // draw sockets at endpoints
  drawSocket(ctx, sx, sy, "#a78bfa", "#7c3aed", false)
  drawSocket(ctx, tx, ty, "#a78bfa", "#7c3aed", false)

  ctx.restore()
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
  const items: Array<{ label: string; color: string; isParentLine?: boolean; isPortConnection?: boolean }> = [
    { label: "Application", color: kindColors("application").border },
    { label: "Subsystem", color: kindColors("subsystem").border },
    { label: "Component", color: kindColors("component").border },
    { label: "Parent Relation", color: "#94a3b8", isParentLine: true },
    { label: "Port Connection", color: "#8b5cf6", isPortConnection: true },
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
    ctx.lineWidth = it.isParentLine ? 2 : 3
    if (it.isParentLine) {
      ctx.setLineDash([])
    } else {
      ctx.setLineDash([])
    }
    ctx.moveTo(startX, y)
    ctx.lineTo(startX + lineLen, y)
    ctx.stroke()

    if (it.isParentLine) {
      drawDiamondArrow(ctx, startX, y, 0, it.color)
    }

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
  portConnections?: PortConnection[]
  classRelationships?: ClassRelationship[]
  classes: ClassInfo[]
  dslContentByPath?: Record<string, string>
  selectedId: string | null
  onSelectComponent: (id: string | null) => void
  onMoveComponent: (id: string, x: number, y: number) => void
  onResizeComponent?: (id: string, width: number, height: number) => void
  onAddPort?: (componentId: string, direction: "input" | "output") => void
  onDeletePort?: (componentId: string, portId: string) => void
  onAddRelationship?: (sourceComponentId: string, targetComponentId: string, label?: string) => void
  onAddPortConnection?: (
    sourceComponentId: string, sourcePortId: string,
    targetComponentId: string, targetPortId: string,
    label?: string
  ) => void
  onDeletePortConnection?: (connectionId: string) => void
  /** ドラッグ/リサイズが完了したタイミングのコミット通知（外部同期用） */
  onCommit?: () => void
}

export function ComponentDiagramCanvas({
  components,
  relationships,
  portConnections = [],
  classRelationships = [],
  classes,
  dslContentByPath = {},
  selectedId,
  onSelectComponent,
  onMoveComponent,
  onResizeComponent,
  onAddPort,
  onDeletePort,
  onAddRelationship,
  onAddPortConnection,
  onDeletePortConnection,
  onCommit,
}: ComponentDiagramCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [showComponentHeatmap, setShowComponentHeatmap] = useState(true)
  const [showClassHeatmap, setShowClassHeatmap] = useState(true)
  const [heatTooltip, setHeatTooltip] = useState<HeatTooltipState | null>(null)
  const [evidenceTooltip, setEvidenceTooltip] = useState<HeatTooltipState | null>(null)
  const [connecting, setConnecting] = useState<{
    from: PortHit
    toWorld: { x: number; y: number }
    hoverTarget?: PortHit
  } | null>(null)

  const interactionRef = useRef<{
    mode: "none" | "dragging-component" | "resizing-component" | "panning" | "connecting-port"
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

  const componentNameById = useMemo(() => {
    const result = new Map<string, string>()
    for (const comp of components) result.set(comp.id, comp.name)
    return result
  }, [components])

  const relationshipById = useMemo(() => {
    const result = new Map<string, ComponentRelationship>()
    for (const rel of relationships) result.set(rel.id, rel)
    return result
  }, [relationships])

  const classRelationshipById = useMemo(() => {
    const result = new Map<string, ClassRelationship>()
    for (const rel of classRelationships) result.set(rel.id, rel)
    return result
  }, [classRelationships])

  const classNameById = useMemo(() => {
    const result = new Map<string, string>()
    for (const cls of classes) result.set(cls.id, cls.name)
    return result
  }, [classes])

  const classById = useMemo(() => {
    const result = new Map<string, ClassInfo>()
    for (const cls of classes) result.set(cls.id, cls)
    return result
  }, [classes])

  const componentPorts = useMemo(() => {
    const ports = new Map<string, { inputs: PortInfo[]; outputs: PortInfo[] }>()
    for (const comp of components) {
      ports.set(comp.id, { inputs: [], outputs: [] })
    }

    for (const comp of components) {
      const compPorts = ports.get(comp.id)
      if (!compPorts) continue

      if (comp.manualPorts) {
        comp.manualPorts.forEach((mp) => {
          if (mp.direction === "input" && !compPorts.inputs.find((p) => p.id === mp.id)) {
            compPorts.inputs.push({ id: mp.id, name: mp.name, type: "input", worldX: 0, worldY: 0 })
          } else if (mp.direction === "output" && !compPorts.outputs.find((p) => p.id === mp.id)) {
            compPorts.outputs.push({ id: mp.id, name: mp.name, type: "output", worldX: 0, worldY: 0 })
          }
        })
      }

      let textY = comp.y + 48 + BODY_PADDING + 12
      if (comp.description) textY += LINE_HEIGHT
      textY += LINE_HEIGHT // for the summary line

      let itemsCount = 0
      if (comp.kind === "application") {
        itemsCount = components.filter((c) => c.kind === "subsystem" && comp.childComponentIds.includes(c.id)).length
      } else if (comp.kind === "subsystem") {
        itemsCount = components.filter((c) => c.kind === "component" && comp.childComponentIds.includes(c.id)).length
      } else {
        const dslPath = comp.dslPath ?? ""
        const summary = dslPath ? dslSummaryByPath[dslPath] : undefined
        if (summary) {
          itemsCount = summary.classes.length
        } else {
          itemsCount = comp.classIds.length
        }
      }

      if (itemsCount > 0) {
        textY += LINE_HEIGHT // for title
        for (let i = 0; i < itemsCount; i++) {
          textY += LINE_HEIGHT
        }
      }
      textY += LINE_HEIGHT // for the empty line before ports

      const reservedRightWidth = (showComponentHeatmap || showClassHeatmap) ? HEATMAP_PANEL_WIDTH + 8 : 0
      const inputSocketX = comp.x + BODY_PADDING + SOCKET_RADIUS + 2
      const outputSocketX = comp.x + comp.width - BODY_PADDING - reservedRightWidth - SOCKET_RADIUS - 2

      let inY = textY + LINE_HEIGHT
      const maxY = comp.y + comp.height - BODY_PADDING - 8
      for (const p of compPorts.inputs) {
        p.worldX = inputSocketX
        p.worldY = Math.min(inY, maxY)
        inY += LINE_HEIGHT
      }
      let outY = textY + LINE_HEIGHT
      for (const p of compPorts.outputs) {
        p.worldX = outputSocketX
        p.worldY = Math.min(outY, maxY)
        outY += LINE_HEIGHT
      }
    }
    return ports
  }, [
    components,
    dslSummaryByPath,
    showComponentHeatmap,
    showClassHeatmap,
  ])

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

    for (const comp of components) {
      for (const childId of comp.childComponentIds) {
        const child = components.find((c) => c.id === childId)
        if (child) {
          drawParentRelationship(ctx, comp, child)
        }
      }
    }

    for (const rel of relationships) {
      drawComponentRelationship(ctx, rel, components)
    }
    for (const pc of portConnections) {
      drawPortConnection(ctx, pc, componentPorts)
    }
    // Component boxes are rendered as React nodes overlaying the canvas.

    if (connecting) {
      const endX = connecting.hoverTarget?.worldX ?? connecting.toWorld.x
      const endY = connecting.hoverTarget?.worldY ?? connecting.toWorld.y
      const angle = Math.atan2(endY - connecting.from.worldY, endX - connecting.from.worldX)

      ctx.save()
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = "#f87171"
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(connecting.from.worldX, connecting.from.worldY)
      ctx.lineTo(endX, endY)
      ctx.stroke()
      if (Math.hypot(endX - connecting.from.worldX, endY - connecting.from.worldY) > 8) {
        drawOpenArrow(ctx, endX, endY, angle, "#f87171")
      }
      drawSocket(ctx, connecting.from.worldX, connecting.from.worldY, "#ef4444", "#991b1b", true)
      if (connecting.hoverTarget) {
        drawSocket(ctx, connecting.hoverTarget.worldX, connecting.hoverTarget.worldY, "#22c55e", "#166534", true)
      }
      ctx.restore()
    }

    ctx.restore()

    drawLegend(ctx, rect.width)
    drawZoomIndicator(ctx, zoom)
  }, [
    components,
    relationships,
    portConnections,
    classes,
    selectedId,
    zoom,
    panOffset,
    dslSummaryByPath,
    heatMetricsByComponentId,
    showComponentHeatmap,
    showClassHeatmap,
    componentPorts,
    connecting,
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

  function hitTestPortSocket(
    worldX: number,
    worldY: number,
    direction?: "input" | "output",
  ): PortHit | null {
    for (let i = components.length - 1; i >= 0; i--) {
      const comp = components[i]
      const ports = componentPorts.get(comp.id)
      if (!ports) continue

      const inputPorts = direction === "output" ? [] : ports.inputs
      const outputPorts = direction === "input" ? [] : ports.outputs

      for (const p of inputPorts) {
        const dx = worldX - p.worldX
        const dy = worldY - p.worldY
        if (dx * dx + dy * dy <= SOCKET_HIT_RADIUS * SOCKET_HIT_RADIUS) {
          return {
            componentId: comp.id,
            portId: p.id,
            direction: "input",
            worldX: p.worldX,
            worldY: p.worldY,
            name: p.name,
          }
        }
      }
      for (const p of outputPorts) {
        const dx = worldX - p.worldX
        const dy = worldY - p.worldY
        if (dx * dx + dy * dy <= SOCKET_HIT_RADIUS * SOCKET_HIT_RADIUS) {
          return {
            componentId: comp.id,
            portId: p.id,
            direction: "output",
            worldX: p.worldX,
            worldY: p.worldY,
            name: p.name,
          }
        }
      }
    }
    return null
  }

  function buildComponentHeatTooltip(
    comp: ComponentInfo,
    heat: ComponentHeatMetrics,
    classRelationships: ClassRelationship[]
  ): { title: string; lines: string[] } {
    const r = heat.componentRaw
    const totalFlow = r.incoming + r.outgoing

    const compClassIds = new Set(comp.classIds)
    const externalRels = classRelationships.filter((rel) => {
      const isSrcInside = compClassIds.has(rel.sourceId)
      const isTgtInside = compClassIds.has(rel.targetId)
      return (isSrcInside && !isTgtInside) || (!isSrcInside && isTgtInside)
    })

    let inheritanceCount = 0
    let delegationCount = 0 // association, aggregation, composition
    let dependencyCount = 0

    for (const rel of externalRels) {
      if (rel.type === "generalization" || rel.type === "realization") inheritanceCount++
      else if (rel.type === "association" || rel.type === "aggregation" || rel.type === "composition") delegationCount++
      else if (rel.type === "dependency") dependencyCount++
    }

    const nextActions: string[] = []

    if (r.incoming >= r.outgoing * 1.5) {
      nextActions.push("[受信偏重] 外部からの依存が集中しています。Facade/Portを設けて内部実装を隠蔽することを検討してください。")
    } else if (r.outgoing >= r.incoming * 1.5) {
      nextActions.push("[送信偏重] 外部への依存が多い状態です。変更の波及を抑えるため、依存先をインターフェースに依存させる(DIP)構成を推奨します。")
    } else if (totalFlow >= 8) {
      nextActions.push("[密結合の兆候] 入出力双方向に多数の依存があります。責務過多の可能性があるため、コンポーネントの分割を検討してください。")
    } else {
      nextActions.push("[安定] 入出力は概ね均衡しています。現在のL4(高負荷)クラスの増加率のみ監視してください。")
    }

    if (inheritanceCount > 0) {
      nextActions.push(`[継承: ${inheritanceCount}件] 境界を越える継承があります。結合度が非常に高いため、インターフェース抽出(実現)や委譲(コンポジション)への切り替えを検討してください。`)
    }
    if (delegationCount > totalFlow * 0.5 && delegationCount > 3) {
      nextActions.push(`[委譲/参照: ${delegationCount}件] 外部の実装への直接参照/委譲が多数発生しています。Facadeを配置して窓口を一本化することを推奨します。`)
    }
    if (dependencyCount > totalFlow * 0.5 && dependencyCount > 3) {
      nextActions.push(`[依存: ${dependencyCount}件] 特定機能への依存が集中しています。Port(DIP)を切って疎結合化を検討してください。`)
    }

    return {
      title: `${comp.name} / コンポーネント俯瞰`,
      lines: [
        `リンク: In ${r.incoming} / Out ${r.outgoing} (合計 ${totalFlow})`,
        `内部規模: 子要素 ${r.children}, クラス数 ${r.classLoad}`,
        `外部結合エッジ: 継承 ${inheritanceCount} / 委譲・参照 ${delegationCount} / 依存 ${dependencyCount}`,
        "--- 次アクション候補 ---",
        ...nextActions.map((action) => `• ${action}`),
      ],
    }
  }
  function buildClassHeatTooltip(
    comp: ComponentInfo,
    heat: ComponentHeatMetrics,
    classRelationships: ClassRelationship[],
    classes: ClassInfo[]
  ): { title: string; lines: string[] } {
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

    const topClassNames = topEntries.map((e) => `${e.label}(${e.value})`).join(", ") || "-"

    const classNameToId = new Map<string, string>()
    for (const cls of classes) {
      classNameToId.set(cls.name, cls.id)
    }

    let combinedInheritance = 0
    let combinedOutgoingDelegation = 0
    let combinedIncomingDependency = 0

    for (const topEntry of topEntries) {
      const cid = classNameToId.get(topEntry.label)
      if (!cid) continue

      for (const rel of classRelationships) {
        if (rel.sourceId === cid) {
          if (rel.type === "generalization" || rel.type === "realization") combinedInheritance++
          else if (rel.type === "association" || rel.type === "aggregation" || rel.type === "composition")
            combinedOutgoingDelegation++
        } else if (rel.targetId === cid) {
          if (rel.type === "dependency") combinedIncomingDependency++
        }
      }
    }

    const l4Ratio = bins[3] / Math.max(1, count)
    const nextActions: string[] = []

    if (l4Ratio >= 0.4) {
      nextActions.push("[全体: 偏り強] 上位クラスに負荷が過度に集中しています。責務を分割し、複数のクラスへ振る舞いを分散してください。")
    } else if (l4Ratio >= 0.2) {
      nextActions.push("[全体: やや偏り] 上位クラスのメソッド群が肥大化しつつあります。集約単位ごとにモジュールを分けることを検討してください。")
    } else {
      nextActions.push("[全体: 概ね均等] 現状維持。新規実装時はこの均等さを保ち、L4クラスの機能を増やしすぎないよう注意してください。")
    }

    if (combinedOutgoingDelegation > 5) {
      nextActions.push("[傾向: 送信委譲偏重] 上位負荷クラスが多数の外部クラスを委譲・操作しています。God Class化の恐れがあるため、Strategy/State等のパターンでロジックを委譲先に移すことを検討してください。")
    }
    if (combinedIncomingDependency > 5) {
      nextActions.push("[傾向: 受信依存偏重] 上位負荷クラスに他クラスからの利用（依存）が集中しています（共通Utility化の兆候）。巨大すぎる場合は関心事ごとにクラス空間を分割してください。")
    }
    if (combinedInheritance > 2) {
      nextActions.push("[傾向: 継承多用] 負荷上位クラスが複数の継承・実現を行っています。継承によりクラス規模が拡大している場合、委譲(Composition)への切り替えを検討してください。")
    }

    return {
      title: `${comp.name} / クラス負荷`,
      lines: [
        `負荷上位クラス: ${topClassNames}`,
        `4段階分布 (L1-L4): ${bins.join(" / ")} -> ${l4Ratio >= 0.4 ? "偏り強" : l4Ratio >= 0.2 ? "やや偏り" : "概ね均等"}`,
        `Min / Avg / Max: ${min} / ${avg.toFixed(1)} / ${max} (※メンバ操作数)`,
        `上位クラス結合傾向: 継承 ${combinedInheritance} / 送信委譲 ${combinedOutgoingDelegation} / 受信依存 ${combinedIncomingDependency}`,
        "--- 次アクション候補 ---",
        ...nextActions.map((action) => `• ${action}`),
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

  function hitTestEvidenceLabel(
    worldX: number,
    worldY: number,
  ): { rel: ComponentRelationship; sourceName: string; targetName: string } | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    for (let i = relationships.length - 1; i >= 0; i--) {
      const rel = relationships[i]
      if (rel.basedOnIds.length === 0) continue
      const route = getRelationshipRoute(rel, components)
      if (!route) continue
      const layout = getRelationshipLabelLayout(ctx, rel, route.points)
      if (!layout) continue
      if (
        worldX >= layout.boxX &&
        worldX <= layout.boxX + layout.boxW &&
        worldY >= layout.boxY &&
        worldY <= layout.boxY + layout.boxH
      ) {
        return {
          rel,
          sourceName: route.source.name,
          targetName: route.target.name,
        }
      }
    }
    return null
  }

  function hitTestHeaderAdd(
    worldX: number,
    worldY: number,
  ): { componentId: string; direction: "input" | "output" } | null {
    for (const comp of components) {
      let textY = comp.y + 48 + BODY_PADDING + 12
      if (comp.description) textY += LINE_HEIGHT
      textY += LINE_HEIGHT

      let itemsCount = 0
      if (comp.kind === "application") {
        itemsCount = components.filter((c) => c.kind === "subsystem" && comp.childComponentIds.includes(c.id)).length
      } else if (comp.kind === "subsystem") {
        itemsCount = components.filter((c) => c.kind === "component" && comp.childComponentIds.includes(c.id)).length
      } else {
        const dslPath = comp.dslPath ?? ""
        const summary = dslPath ? dslSummaryByPath[dslPath] : undefined
        if (summary) {
          itemsCount = summary.classes.length
        } else {
          itemsCount = comp.classIds.length
        }
      }

      if (itemsCount > 0) {
        textY += LINE_HEIGHT
        for (let i = 0; i < itemsCount; i++) {
          textY += LINE_HEIGHT
        }
      }

      const reservedRightWidth = (showComponentHeatmap || showClassHeatmap) ? HEATMAP_PANEL_WIDTH + 8 : 0
      const inHeaderX = comp.x + BODY_PADDING
      const outHeaderX = comp.x + comp.width - BODY_PADDING - reservedRightWidth

      const btnW = 16
      const btnH = 14
      const btnY = textY - 10
      const inputBtnX = inHeaderX + 34
      const outputBtnX = outHeaderX - 50

      if (worldX >= inputBtnX && worldX <= inputBtnX + btnW && worldY >= btnY && worldY <= btnY + btnH) {
        postMessage({ command: "log", level: "info", text: "hit input" })
        return { componentId: comp.id, direction: "input" }
      }
      if (worldX >= outputBtnX && worldX <= outputBtnX + btnW && worldY >= btnY && worldY <= btnY + btnH) {
        postMessage({ command: "log", level: "info", text: "hit output" })
        return { componentId: comp.id, direction: "output" }
      }
    }
    return null
  }

  function hitTestPortDelete(worldX: number, worldY: number): { componentId: string; portId: string } | null {
    for (const comp of components) {
      if (!comp.manualPorts) continue
      const ports = componentPorts.get(comp.id)
      if (!ports) continue

      for (const p of ports.inputs) {
        if (!comp.manualPorts.some((mp) => mp.id === p.id)) continue
        if (worldX >= p.worldX + 24 && worldX <= p.worldX + 40 && worldY >= p.worldY - 7 && worldY <= p.worldY + 7) {
          return { componentId: comp.id, portId: p.id }
        }
      }

      for (const p of ports.outputs) {
        if (!comp.manualPorts.some((mp) => mp.id === p.id)) continue
        if (worldX >= p.worldX - 40 && worldX <= p.worldX - 24 && worldY >= p.worldY - 7 && worldY <= p.worldY + 7) {
          return { componentId: comp.id, portId: p.id }
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

    const portHit = hitTestPortSocket(world.x, world.y, "output")
    if (portHit) {
      setConnecting({
        from: portHit,
        toWorld: { x: portHit.worldX, y: portHit.worldY },
      })
      interactionRef.current = {
        ...interactionRef.current,
        mode: "connecting-port",
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
      }
      return
    }

    const addHit = hitTestHeaderAdd(world.x, world.y)
    if (addHit && onAddPort) {
      postMessage({
        command: "log",
        level: "info",
        text: `invoke onAddPort (${addHit.direction})`,
      })
      onAddPort(addHit.componentId, addHit.direction)
      return
    }

    const delHit = hitTestPortDelete(world.x, world.y)
    if (delHit && onDeletePort) {
      onDeletePort(delHit.componentId, delHit.portId)
      return
    }

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

    if (interaction.mode === "connecting-port") {
      setHeatTooltip(null)
      setEvidenceTooltip(null)
      const hoverTarget = hitTestPortSocket(world.x, world.y, "input")
      setConnecting((prev) => (
        prev
          ? {
            ...prev,
            toWorld: { x: world.x, y: world.y },
            hoverTarget: hoverTarget ?? undefined,
          }
          : prev
      ))
      return
    }

    if (interaction.mode === "dragging-component" && interaction.componentId) {
      setHeatTooltip(null)
      setEvidenceTooltip(null)
      onMoveComponent(interaction.componentId, world.x - interaction.offsetX, world.y - interaction.offsetY)
      return
    }

    if (interaction.mode === "resizing-component" && interaction.componentId && onResizeComponent) {
      setHeatTooltip(null)
      setEvidenceTooltip(null)
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
      setEvidenceTooltip(null)
      const dx = screenX - interaction.startPanX
      const dy = screenY - interaction.startPanY
      setPanOffset({ x: interaction.startOffsetX + dx, y: interaction.startOffsetY + dy })
      return
    }

    const evidenceHit = hitTestEvidenceLabel(world.x, world.y)
    if (evidenceHit) {
      setHeatTooltip(null)
      const evidenceLines = buildEvidenceTooltipLines(
        evidenceHit.rel,
        relationshipById,
        componentNameById,
        classRelationshipById,
        classById,
        classNameById,
      )
      setEvidenceTooltip({
        screenX: screenX + 14,
        screenY: screenY + 14,
        title: `${evidenceHit.sourceName} -> ${evidenceHit.targetName}`,
        lines: evidenceLines,
      })
      return
    }
    setEvidenceTooltip(null)

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
        ? buildComponentHeatTooltip(heatHit.component, heat, classRelationships)
        : buildClassHeatTooltip(heatHit.component, heat, classRelationships, classes)

    setHeatTooltip({
      screenX: screenX + 14,
      screenY: screenY + 14,
      title: payload.title,
      lines: payload.lines,
    })
  }

  function handleMouseUp() {
    if (interactionRef.current.mode === "connecting-port") {
      if (connecting?.hoverTarget) {
        const target = connecting.hoverTarget
        if (target.componentId !== connecting.from.componentId) {
          if (onAddPortConnection) {
            onAddPortConnection(
              connecting.from.componentId, connecting.from.portId,
              target.componentId, target.portId,
            )
          } else if (onAddRelationship) {
            onAddRelationship(connecting.from.componentId, target.componentId, connecting.from.name)
          }
          onCommit?.()
        }
      }
      setConnecting(null)
      interactionRef.current.mode = "none"
      return
    }

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
          const socketHit = hitTestPortSocket(world.x, world.y)
          if (socketHit) {
            setCanvasCursor(socketHit.direction === "output" ? "crosshair" : "pointer")
            return
          }
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
          setEvidenceTooltip(null)
          setConnecting(null)
        }}
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
          transformOrigin: "top left",
        }}
      >
        {components.map((comp) => {
          const ports = componentPorts.get(comp.id) || { inputs: [], outputs: [] }
          const heat = heatMetricsByComponentId[comp.id]
          const { statsLabel, childListTitle, childItems } = buildComponentNodeData(
            comp,
            components,
            classes,
            dslSummaryByPath,
          )
          return (
            <ComponentNode
              key={comp.id}
              comp={comp}
              isSelected={comp.id === selectedId}
              childItems={childItems}
              childListTitle={childListTitle}
              statsLabel={statsLabel}
              ports={ports}
              heat={heat}
              showComponentHeatmap={showComponentHeatmap}
              showClassHeatmap={showClassHeatmap}
              onAddInputPort={() => onAddPort?.(comp.id, "input")}
              onAddOutputPort={() => onAddPort?.(comp.id, "output")}
              onDeletePort={(portId) => onDeletePort?.(comp.id, portId)}
            />
          )
        })}
      </div>

      {heatTooltip && !evidenceTooltip && (
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
      {evidenceTooltip && (
        <div
          className="absolute z-20 max-w-[520px] rounded border border-slate-200 bg-white/95 px-2 py-1.5 shadow-md"
          style={{
            left: evidenceTooltip.screenX,
            top: evidenceTooltip.screenY,
            pointerEvents: "none",
          }}
        >
          <div className="text-[11px] font-semibold text-slate-800">根拠となる関係: {evidenceTooltip.title}</div>
          {evidenceTooltip.lines.map((line, idx) => (
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
