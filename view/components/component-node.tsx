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
  connectedPortIds?: string[]
  hasInvalidPortNames?: boolean

  // Heatmap data
  heat?: ComponentHeatMetrics
  showComponentHeatmap?: boolean
  showClassHeatmap?: boolean

  // Handlers
  onAddInputPort?: () => void
  onAddOutputPort?: () => void
  onDeletePort?: (portId: string) => void
  onRenamePort?: (portId: string, nextName: string) => void
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

  const bins = buildHeatBins(cells)

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

function buildHeatBins(cells: number[]) {
  const bins = [0, 0, 0, 0]
  cells.forEach((v) => {
    const idx = Math.min(3, Math.floor(v * 4))
    bins[idx] += 1
  })
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
  connectedPortIds,
  hasInvalidPortNames = false,
  heat,
  showComponentHeatmap = true,
  showClassHeatmap = true,
  onAddInputPort,
  onAddOutputPort,
  onDeletePort,
  onRenamePort
}: ComponentNodeProps) {
  const styles = getStylesByKind(comp.kind, isSelected)
  const warningClass = hasInvalidPortNames ? "border-amber-500 ring-2 ring-amber-400" : ""

  const hasHeatmap = heat && (showComponentHeatmap || showClassHeatmap)
  const connectedPortIdSet = new Set(connectedPortIds ?? [])
  const portRowCount = Math.max(ports.inputs.length, ports.outputs.length)

  return (
    <div
      className={`absolute shadow-md rounded-xl font-mono text-sm border-2 overflow-visible select-none transition-shadow pointer-events-none ${styles.container} ${warningClass}`}
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
        <div
          className="font-bold text-[13px] leading-[15px] break-words"
          title={comp.name}
        >
          {comp.name}
        </div>
      </div>

      {/* Body container */}
      <div className="p-3 flex flex-col h-[calc(100%-3rem)] overflow-visible relative z-20">
        <div className="flex flex-col">
          {/* Stats */}
          <div className="text-[11px] font-medium opacity-90 leading-[18px] h-[18px]">{statsLabel}</div>

          {/* Description */}
          {comp.description && (
            <div className="text-[11px] text-slate-500 truncate leading-[18px] h-[18px]" title={comp.description}>
              {comp.description}
            </div>
          )}

          {/* Children / Class List */}
          {childItems.length > 0 && (
            <div className="mt-1 flex flex-col">
              <div className="text-[11px] font-bold leading-[18px] h-[18px]">{childListTitle}:</div>
              <ul className="text-[11px] space-y-0 pr-2">
                {childItems.map((item, idx) => (
                  <li key={idx} className="truncate text-slate-700 leading-[18px] h-[18px]">- {item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Heatmap Panel (Absolute positioned to top right of content area if exists) */}
        {hasHeatmap && (
          <div className="absolute top-3 right-3 w-28 bg-white/95 rounded-md border border-slate-200 shadow-sm p-1.5 flex flex-col gap-1 z-10">
            {showComponentHeatmap && (
              <div className="flex items-center gap-1.5 text-[9px] h-3">
                <span className="font-bold text-slate-600 w-5 shrink-0">Cmp</span>
                <HeatCellBar cells={heat.componentCells} />
                <span className="text-slate-500 text-right tabular-nums tracking-tight shrink-0 whitespace-nowrap">
                  {dominantLevelLabel(heat.componentCells)}
                </span>
              </div>
            )}
            {showClassHeatmap && (
              <div className="flex items-center gap-1.5 text-[9px] h-3">
                <span className="font-bold text-slate-600 w-5 shrink-0">Cls</span>
                <HeatCellBar cells={heat.classCells} />
                <span className="text-slate-500 text-right tabular-nums tracking-tight shrink-0 whitespace-nowrap">
                  {dominantLevelLabel(heat.classCells)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Ports Section Header (always visible) */}
        <div className="flex justify-between items-center text-[11px] font-bold mt-2 leading-[18px] h-[18px]">
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

        {/* Ports List (flow layout, two columns) */}
        <div className="mt-1 flex flex-col gap-0">
          {Array.from({ length: portRowCount }).map((_, idx) => {
            const inputPort = ports.inputs[idx]
            const outputPort = ports.outputs[idx]

            return (
              <div key={idx} className="grid grid-cols-2 gap-x-4 items-center h-[18px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  {inputPort ? (
                    <>
                      <div
                        className={[
                          "w-[15px] h-[15px] border-2 border-green-800 rounded-full flex items-center justify-center shadow-sm z-10",
                          connectedPortIdSet.has(inputPort.id) ? "bg-green-500" : "bg-black",
                        ].join(" ")}
                      />
                      <div className="flex items-center gap-1 min-w-0">
                        {comp.manualPorts?.some((mp) => mp.id === inputPort.id) ? (
                          <input
                            className="text-[11px] truncate max-w-[140px] bg-transparent border border-slate-200 rounded px-1 h-4 pointer-events-auto"
                            value={inputPort.name}
                            title={inputPort.name}
                            onChange={(e) => onRenamePort?.(inputPort.id, e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="text-[11px] truncate max-w-[140px]" title={inputPort.name}>{inputPort.name}</span>
                        )}
                        {comp.manualPorts?.some((mp) => mp.id === inputPort.id) && (
                          <button
                            className="w-4 h-3.5 bg-red-100 text-red-700 border border-red-200 rounded flex items-center justify-center hover:bg-red-200 text-[10px] pointer-events-auto"
                            title="Remove manual port"
                            onClick={(e) => { e.stopPropagation(); onDeletePort?.(inputPort.id) }}
                          >
                            -
                          </button>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="flex items-center gap-1.5 justify-end min-w-0">
                  {outputPort ? (
                    <>
                      <div className="flex items-center gap-1 min-w-0 justify-end">
                        {comp.manualPorts?.some((mp) => mp.id === outputPort.id) ? (
                          <input
                            className="text-[11px] truncate max-w-[140px] bg-transparent border border-slate-200 rounded px-1 h-4 pointer-events-auto text-right"
                            value={outputPort.name}
                            title={outputPort.name}
                            onChange={(e) => onRenamePort?.(outputPort.id, e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="text-[11px] truncate max-w-[140px]" title={outputPort.name}>{outputPort.name}</span>
                        )}
                        {comp.manualPorts?.some((mp) => mp.id === outputPort.id) && (
                          <button
                            className="w-4 h-3.5 bg-red-100 text-red-700 border border-red-200 rounded flex items-center justify-center hover:bg-red-200 text-[10px] pointer-events-auto"
                            title="Remove manual port"
                            onClick={(e) => { e.stopPropagation(); onDeletePort?.(outputPort.id) }}
                          >
                            -
                          </button>
                        )}
                      </div>
                      <div
                        className={[
                          "w-[15px] h-[15px] border-2 border-red-800 rounded-full flex items-center justify-center shadow-sm z-10",
                          connectedPortIdSet.has(outputPort.id) ? "bg-red-500" : "bg-black",
                        ].join(" ")}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Resize Handle (Bottom Right) */}
      {isSelected && (
        <div className={`absolute bottom-0 right-0 w-3 h-3 ${styles.accent} opacity-90 cursor-se-resize rounded-Br-xl`} />
      )}
    </div>
  )
}
