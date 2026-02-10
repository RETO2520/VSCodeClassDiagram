"use client"

import React from "react"

import { useState, useMemo, useCallback, useRef } from "react"
import { ClassEditorPanel } from "@/components/class-editor"
import { DiagramCanvas } from "@/components/diagram-canvas"
import { detectRelationships } from "@/lib/detect-relationships"
import type { ClassInfo } from "@/lib/class-diagram-types"
import { createEmptyClass } from "@/lib/class-diagram-types"
import { GripVertical } from "lucide-react"

// ==============================
// Sample data
// ==============================
function createSampleData(): ClassInfo[] {
  return [
    {
      id: "cls_order",
      name: "Order",
      kind: "class",
      isAbstract: false,
      baseClassId: null,
      members: [
        { id: "m1", name: "id", type: "number", visibility: "private", isStatic: false, relationship: "auto", sourceMultiplicity: "1", targetMultiplicity: "1" },
        { id: "m2", name: "customer", type: "Customer", visibility: "private", isStatic: false, relationship: "auto", sourceMultiplicity: "1", targetMultiplicity: "1" },
        { id: "m3", name: "status", type: "OrderStatus", visibility: "private", isStatic: false, relationship: "auto", sourceMultiplicity: "1", targetMultiplicity: "1" },
      ],
      operations: [
        {
          id: "o1",
          name: "addItem",
          returnType: "void",
          visibility: "public",
          isStatic: false,
          parameters: [{ id: "p1", name: "item", type: "OrderItem" }],
        },
        {
          id: "o2",
          name: "calculateTotal",
          returnType: "number",
          visibility: "public",
          isStatic: false,
          parameters: [],
        },
        {
          id: "o_static",
          name: "getMaxId",
          returnType: "number",
          visibility: "public",
          isStatic: true,
          parameters: [],
        },
      ],
      interfaces: ["cls_serializable"],
      x: 320,
      y: 60,
    },
    {
      id: "cls_customer",
      name: "Customer",
      kind: "class",
      isAbstract: false,
      baseClassId: null,
      members: [
        { id: "m3", name: "name", type: "string", visibility: "private", isStatic: false, relationship: "auto", sourceMultiplicity: "1", targetMultiplicity: "1" },
        { id: "m4", name: "email", type: "string", visibility: "private", isStatic: false, relationship: "auto", sourceMultiplicity: "1", targetMultiplicity: "1" },
        { id: "m5", name: "address", type: "Address", visibility: "private", isStatic: false, relationship: "auto", sourceMultiplicity: "1", targetMultiplicity: "1" },
      ],
      operations: [
        {
          id: "o3",
          name: "getOrders",
          returnType: "Order[]",
          visibility: "public",
          isStatic: false,
          parameters: [],
        },
      ],
      interfaces: ["cls_serializable"],
      x: 60,
      y: 300,
    },
    {
      id: "cls_orderitem",
      name: "OrderItem",
      kind: "class",
      isAbstract: false,
      baseClassId: null,
      members: [
        { id: "m6", name: "product", type: "string", visibility: "private", isStatic: false, relationship: "auto", sourceMultiplicity: "1", targetMultiplicity: "1" },
        { id: "m7", name: "quantity", type: "number", visibility: "private", isStatic: false, relationship: "auto", sourceMultiplicity: "1", targetMultiplicity: "1" },
        { id: "m8", name: "price", type: "number", visibility: "private", isStatic: false, relationship: "auto", sourceMultiplicity: "1", targetMultiplicity: "1" },
      ],
      operations: [
        {
          id: "o4",
          name: "subtotal",
          returnType: "number",
          visibility: "public",
          isStatic: false,
          parameters: [],
        },
      ],
      interfaces: [],
      x: 620,
      y: 300,
    },
    {
      id: "cls_address",
      name: "Address",
      kind: "struct",
      isAbstract: false,
      baseClassId: null,
      members: [
        { id: "m9", name: "street", type: "string", visibility: "public", isStatic: false, relationship: "auto", sourceMultiplicity: "1", targetMultiplicity: "1" },
        { id: "m10", name: "city", type: "string", visibility: "public", isStatic: false, relationship: "auto", sourceMultiplicity: "1", targetMultiplicity: "1" },
        { id: "m11", name: "zip", type: "string", visibility: "public", isStatic: false, relationship: "auto", sourceMultiplicity: "1", targetMultiplicity: "1" },
      ],
      operations: [],
      interfaces: [],
      x: 60,
      y: 580,
    },
    {
      id: "cls_serializable",
      name: "Serializable",
      kind: "interface",
      isAbstract: false,
      baseClassId: null,
      members: [],
      operations: [
        {
          id: "o5",
          name: "serialize",
          returnType: "string",
          visibility: "public",
          isStatic: false,
          parameters: [],
        },
        {
          id: "o6",
          name: "deserialize",
          returnType: "void",
          visibility: "public",
          isStatic: false,
          parameters: [{ id: "p2", name: "data", type: "string" }],
        },
      ],
      interfaces: [],
      x: 620,
      y: 60,
    },
    {
      id: "cls_orderstatus",
      name: "OrderStatus",
      kind: "struct",
      isAbstract: false,
      baseClassId: null,
      members: [
        { id: "m12", name: "code", type: "number", visibility: "public", isStatic: false, relationship: "auto", sourceMultiplicity: "1", targetMultiplicity: "1" },
        { id: "m13", name: "label", type: "string", visibility: "public", isStatic: false, relationship: "auto", sourceMultiplicity: "1", targetMultiplicity: "1" },
      ],
      operations: [],
      interfaces: [],
      x: 340,
      y: 420,
    },
  ]
}

const MIN_PANEL_WIDTH = 360
const MAX_PANEL_WIDTH = 800
const DEFAULT_PANEL_WIDTH = 500

export default function Page() {
  const [classes, setClasses] = useState<ClassInfo[]>(createSampleData)
  const [selectedId, setSelectedId] = useState<string | null>("cls_order")
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH)
  const isDragging = useRef(false)
  const lastX = useRef(0)

  const relationships = useMemo(() => detectRelationships(classes), [classes])

  const handleUpdateClass = useCallback(
    (id: string, updated: ClassInfo) => {
      setClasses((prev) => prev.map((c) => (c.id === id ? updated : c)))
    },
    [],
  )

  const handleDeleteClass = useCallback((id: string) => {
    setClasses((prev) =>
      prev
        .filter((c) => c.id !== id)
        .map((c) => ({
          ...c,
          interfaces: c.interfaces.filter((ifId) => ifId !== id),
          baseClassId: c.baseClassId === id ? null : c.baseClassId,
        })),
    )
    setSelectedId(null)
  }, [])

  const handleAddClass = useCallback(() => {
    const newClass = createEmptyClass()
    setClasses((prev) => [...prev, newClass])
    setSelectedId(newClass.id)
  }, [])

  const handleMoveClass = useCallback(
    (id: string, x: number, y: number) => {
      setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, x, y } : c)))
    },
    [],
  )

  const handlePanelResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      lastX.current = e.clientX
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return
        const delta = ev.clientX - lastX.current
        lastX.current = ev.clientX
        setPanelWidth((prev) => Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, prev + delta)))
      }

      const onMouseUp = () => {
        isDragging.current = false
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        document.removeEventListener("mousemove", onMouseMove)
        document.removeEventListener("mouseup", onMouseUp)
      }

      document.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseup", onMouseUp)
    },
    [],
  )

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Left Panel - Editor (class list + detail side by side) */}
      <div className="flex-shrink-0" style={{ width: panelWidth }}>
        <ClassEditorPanel
          classes={classes}
          selectedId={selectedId}
          onSelectClass={setSelectedId}
          onUpdateClass={handleUpdateClass}
          onDeleteClass={handleDeleteClass}
          onAddClass={handleAddClass}
        />
      </div>

      {/* Outer resize handle between editor panel and canvas */}
      <div
        onMouseDown={handlePanelResizeStart}
        className="flex w-3 shrink-0 cursor-col-resize items-center justify-center bg-muted/50 transition-colors hover:bg-accent active:bg-accent"
        role="separator"
        aria-orientation="vertical"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Right Panel - Canvas */}
      <div className="flex-1 min-w-0">
        <DiagramCanvas
          classes={classes}
          relationships={relationships}
          selectedId={selectedId}
          onSelectClass={setSelectedId}
          onMoveClass={handleMoveClass}
        />
      </div>
    </div>
  )
}
