import React from "react"
import type { ComponentInfo, ComponentKind } from "@/lib/component-diagram-types"

// ==============================
// Types for Component Node Props
// ==============================

export interface PortInfo {
  id: string
  name: string
  type: "input" | "output"
  worldX: number
  worldY: number
}

export interface PortGroup {
  inputs: PortInfo[]
  outputs: PortInfo[]
}

export interface DslClassSummary {
  name: string
  memberCount: number
  operationCount: number
}

export interface DslSummary {
  classes: DslClassSummary[]
}

export interface ComponentHeatMetrics {
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

export interface ComponentNodeProps {
  comp: ComponentInfo
  isSelected: boolean

  // Data for rendering internal lists
  childItems: string[]      // Subsystems/Components names or Class names depending on kind
  childListTitle: string

  // Stats line (e.g. "Classes: 3", or "Children: 2")
  statsLabel: string

  // Ports mapping
  ports: PortGroup

  // Heatmap data
  heat?: ComponentHeatMetrics
  showComponentHeatmap?: boolean
  showClassHeatmap?: boolean

  // Handlers
  onAddInputPort?: () => void
  onAddOutputPort?: () => void
  onDeletePort?: (portId: string) => void
}

// ==============================
// Helper Methods
// ==============================

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

function getStylesByKind(kind: ComponentKind, isSelected: boolean) {
  switch (kind) {
    case "component":
      return {
        container: `bg-slate-50 ${isSelected ? "ring-2 ring-blue-500 border-transparent" : "border-slate-700"} text-slate-900`,
        header: "bg-slate-900 text-slate-50",
        accent: "bg-sky-400",
      }
    case "subsystem":
      return {
        container: `bg-blue-50 ${isSelected ? "ring-2 ring-blue-500 border-transparent" : "border-blue-500"} text-blue-900`,
        header: "bg-blue-900 text-blue-100",
        accent: "bg-blue-400",
      }
    case "application":
      return {
        container: `bg-emerald-50 ${isSelected ? "ring-2 ring-blue-500 border-transparent" : "border-emerald-500"} text-emerald-900`,
        header: "bg-emerald-900 text-emerald-100",
        accent: "bg-emerald-400",
      }
  }
}

function HeatCellBar({ cells }: { cells: number[] }) {
  if (cells.length === 0) {
    return <div className="h-2 flex-1 bg-slate-300 rounded-sm"></div>
  }

  const bins = [0, 0, 0, 0]
  cells.forEach(v => {
    const idx = Math.min(3, Math.floor(v * 4))
    bins[idx] += 1
  })

  return (
    <div className="flex h-2 flex-1 border border-slate-200 rounded-sm overflow-hidden bg-white">
      {bins.map((count, i) => {
        if (count === 0) return null
        const hue = 215 - ((i + 0.5) / 4) * 210
        const sat = 88
        const light = 56 - ((i + 0.5) / 4) * 14
        const color = `hsl(${hue} ${sat}% ${light}%)`
        const widthPercent = (count / cells.length) * 100

        return (
          <div
            key={i}
            style={{ width: `${widthPercent}%`, backgroundColor: color }}
            className="h-full border-r border-slate-900/10 last:border-0"
          />
        )
      })}
    </div>
  )
}

// ==============================
// Component Node Definition
// ==============================

export function ComponentNode({
  comp,
  isSelected,
  childItems,
  childListTitle,
  statsLabel,
  ports,
  heat,
  showComponentHeatmap = true,
  showClassHeatmap = true,
  onAddInputPort,
  onAddOutputPort,
  onDeletePort
}: ComponentNodeProps) {
  const styles = getStylesByKind(comp.kind, isSelected)

  const hasHeatmap = heat && (showComponentHeatmap || showClassHeatmap)

  return (
    <div
      className={`absolute shadow-md rounded-xl font-mono text-sm border-2 overflow-visible select-none transition-shadow pointer-events-none ${styles.container}`}
      style={{
        left: comp.x,
        top: comp.y,
        width: comp.width,
        height: comp.height,
        // Since we are moving to standard React rendering,
        // you might want to switch to flex-based scaling or let the container dictate size.
        // For now, bounding box absolute positioning strictly matches the canvas version.
      }}
    >
      {/* Header */}
      <div className={`px-3 py-2 rounded-t-lg h-12 flex flex-col justify-center ${styles.header}`}>
        <div className="text-[11px] italic opacity-80">{kindLabel(comp.kind)}</div>
        <div className="font-bold text-[13px] truncate">{comp.name}</div>
      </div>

      {/* Body container */}
      <div className="p-3 flex flex-col gap-2 h-[calc(100%-3rem)] overflow-hidden relative">
        {/* Stats */}
        <div className="text-[11px] font-medium opacity-90">{statsLabel}</div>

        {/* Description */}
        {comp.description && (
          <div className="text-[11px] text-slate-500 truncate" title={comp.description}>
            {comp.description}
          </div>
        )}

        {/* Children / Class List */}
        {childItems.length > 0 && (
          <div className="flex-1 mt-1 flex flex-col min-h-0">
            <div className="text-[11px] font-bold mb-1">{childListTitle}:</div>
            <ul className="text-[11px] space-y-1 overflow-y-auto pr-2 custom-scrollbar">
              {childItems.map((item, idx) => (
                <li key={idx} className="truncate text-slate-700">- {item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Heatmap Panel (Absolute positioned to top right of content area if exists) */}
        {hasHeatmap && (
          <div className="absolute top-3 right-3 w-24 bg-white/95 rounded-md border border-slate-200 shadow-sm p-1.5 flex flex-col gap-1.5 z-10">
            {showComponentHeatmap && (
              <div className="flex items-center gap-1.5 text-[9px]">
                <span className="font-bold text-slate-600 w-5">Cmp</span>
                <HeatCellBar cells={heat.componentCells} />
                <span className="text-slate-500 w-4 text-right">{heat.componentCells.length}</span>
              </div>
            )}
            {showClassHeatmap && (
              <div className="flex items-center gap-1.5 text-[9px]">
                <span className="font-bold text-slate-600 w-5">Cls</span>
                <HeatCellBar cells={heat.classCells} />
                <span className="text-slate-500 w-4 text-right">{heat.classCells.length}</span>
              </div>
            )}
          </div>
        )}

        {/* Ports Section Header */}
        <div className="mt-auto flex justify-between items-center text-[11px] font-bold relative z-0">
          <div className="flex items-center gap-2">
            Requires
            <button
              className="w-4 h-4 bg-blue-100 text-blue-700 border border-blue-200 rounded flex items-center justify-center hover:bg-blue-200 pointer-events-auto"
              onClick={(e) => { e.stopPropagation(); onAddInputPort?.() }}
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="w-4 h-4 bg-red-100 text-red-700 border border-red-200 rounded flex items-center justify-center hover:bg-red-200 pointer-events-auto"
              onClick={(e) => { e.stopPropagation(); onAddOutputPort?.() }}
            >
              +
            </button>
            Provides
          </div>
        </div>
      </div>

      {/* Sockets (Absolute positioned along boundaries) */}
      {/* In HTML/React, port positioning can be matched by relying on `comp.y` offset, 
          or rendering ports cleanly spaced as part of the flex layout. 
          Given that `port.worldY` is relative to canvas, we offset it by `comp.y`.
          Here we draw them properly floating on the edges. */}
      {ports.inputs.map((p) => {
        const isManual = comp.manualPorts?.some(mp => mp.id === p.id)
        // Offset port from the top of the node, using world coordinates.
        const top = p.worldY - comp.y

        return (
          <div
            key={p.id}
            className="absolute left-0 flex items-center gap-1.5 -translate-x-1.5 translate-y-[-50%]"
            style={{ top }}
          >
            {/* Socket handle */}
            <div className="w-[15px] h-[15px] bg-green-500 border-2 border-green-800 rounded-full flex items-center justify-center shadow-sm z-10 cursor-crosshair">
              <div className="w-[3px] h-[3px] bg-white opacity-80 rounded-full translate-x-[-1px] translate-y-[-1px]" />
            </div>

            {/* Port label */}
            <div className="flex items-center gap-1 bg-white/70 backdrop-blur-sm rounded px-1">
              <span className="text-[11px] truncate max-w-[80px]" title={p.name}>{p.name}</span>
              {isManual && (
                <button
                  className="w-4 h-3.5 bg-red-100 text-red-700 border border-red-200 rounded flex items-center justify-center hover:bg-red-200 text-[10px] pointer-events-auto"
                  title="Remove manual port"
                  onClick={(e) => { e.stopPropagation(); onDeletePort?.(p.id) }}
                >
                  -
                </button>
              )}
            </div>
          </div>
        )
      })}

      {ports.outputs.map((p) => {
        const isManual = comp.manualPorts?.some(mp => mp.id === p.id)
        const top = p.worldY - comp.y

        return (
          <div
            key={p.id}
            className="absolute right-0 flex items-center gap-1.5 translate-x-1.5 translate-y-[-50%] flex-row-reverse"
            style={{ top }}
          >
            {/* Socket handle */}
            <div className="w-[15px] h-[15px] bg-red-500 border-2 border-red-800 rounded-full flex items-center justify-center shadow-sm z-10 cursor-crosshair">
              <div className="w-[3px] h-[3px] bg-white opacity-80 rounded-full translate-x-[-1px] translate-y-[-1px]" />
            </div>

            {/* Port label */}
            <div className="flex items-center gap-1 bg-white/70 backdrop-blur-sm rounded px-1 flex-row-reverse">
              <span className="text-[11px] truncate max-w-[80px]" title={p.name}>{p.name}</span>
              {isManual && (
                <button
                  className="w-4 h-3.5 bg-red-100 text-red-700 border border-red-200 rounded flex items-center justify-center hover:bg-red-200 text-[10px] pointer-events-auto"
                  title="Remove manual port"
                  onClick={(e) => { e.stopPropagation(); onDeletePort?.(p.id) }}
                >
                  -
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Resize Handle (Bottom Right) */}
      {isSelected && (
        <div className={`absolute bottom-0 right-0 w-3 h-3 ${styles.accent} opacity-90 cursor-se-resize rounded-Br-xl`} />
      )}
    </div>
  )
}
