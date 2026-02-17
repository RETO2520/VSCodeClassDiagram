"use client"

import React from "react"
import { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Plus,
  Trash2,
  ChevronRight,
  Box,
  CircleDot,
  Layers,
  GripVertical,
} from "lucide-react"
import type {
  ClassInfo,
  ClassKind,
  Visibility,
  ClassMember,
  ClassOperation,
  OperationParameter,
  MemberRelationshipType,
} from "@/lib/class-diagram-types"
import {
  createEmptyMember,
  createEmptyOperation,
  createEmptyParameter,
  classKindLabel,
  MEMBER_RELATIONSHIP_OPTIONS,
  extractBaseTypeName,
  computeTypeFromMultiplicity,
} from "@/lib/class-diagram-types"

// ==============================
// ClassEditor - individual class editing
// ==============================

interface ClassEditorProps {
  classInfo: ClassInfo
  allClasses: ClassInfo[]
  onChange: (updated: ClassInfo) => void
  onDelete: () => void
}

const kindIcons: Record<ClassKind, React.ReactNode> = {
  class: <Box className="h-4 w-4" />,
  interface: <CircleDot className="h-4 w-4" />,
  struct: <Layers className="h-4 w-4" />,
}



export function ClassEditor({
  classInfo,
  allClasses,
  onChange,
  onDelete,
}: ClassEditorProps) {
  const [expandedParams, setExpandedParams] = useState<string | null>(null)

  const availableInterfaces = allClasses.filter(
    (c) => c.kind === "interface" && c.id !== classInfo.id
  )

  const availableBaseClasses = allClasses.filter(
    (c) => c.id !== classInfo.id && c.kind === "class"
  )

  function updateField<K extends keyof ClassInfo>(key: K, value: ClassInfo[K]) {
    onChange({ ...classInfo, [key]: value })
  }

  // --- Members ---
  function addMember() {
    updateField("members", [...classInfo.members, createEmptyMember()])
  }

  function updateMember(idx: number, updated: ClassMember) {
    const members = [...classInfo.members]
    members[idx] = updated
    updateField("members", members)
  }

  function removeMember(idx: number) {
    updateField("members", classInfo.members.filter((_, i) => i !== idx))
  }

  // --- Operations ---
  function addOperation() {
    updateField("operations", [...classInfo.operations, createEmptyOperation()])
  }

  function updateOperation(idx: number, updated: ClassOperation) {
    const operations = [...classInfo.operations]
    operations[idx] = updated
    updateField("operations", operations)
  }

  function removeOperation(idx: number) {
    updateField("operations", classInfo.operations.filter((_, i) => i !== idx))
  }

  // --- Params ---
  function addParameter(opIdx: number) {
    const op = classInfo.operations[opIdx]
    updateOperation(opIdx, {
      ...op,
      parameters: [...op.parameters, createEmptyParameter()],
    })
  }

  function updateParameter(opIdx: number, paramIdx: number, updated: OperationParameter) {
    const op = classInfo.operations[opIdx]
    const params = [...op.parameters]
    params[paramIdx] = updated
    updateOperation(opIdx, { ...op, parameters: params })
  }

  function removeParameter(opIdx: number, paramIdx: number) {
    const op = classInfo.operations[opIdx]
    updateOperation(opIdx, {
      ...op,
      parameters: op.parameters.filter((_, i) => i !== paramIdx),
    })
  }

  // --- Interfaces ---
  function addInterface(interfaceId: string) {
    if (!classInfo.interfaces.includes(interfaceId)) {
      updateField("interfaces", [...classInfo.interfaces, interfaceId])
    }
  }

  function removeInterface(interfaceId: string) {
    updateField("interfaces", classInfo.interfaces.filter((id) => id !== interfaceId))
  }

  const allClassNames = allClasses.map((c) => c.name)

  function isTypeReferencingClass(typeName: string): boolean {
    const baseName = typeName.replace(/\[\]/g, "").trim()
    const genericMatch = baseName.match(/<(.+)>/)
    const finalName = genericMatch ? genericMatch[1].trim() : baseName
    return allClasses.some((c) => c.name === finalName && c.id !== classInfo.id)
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {kindIcons[classInfo.kind]}
            <h3 className="text-sm font-semibold text-card-foreground">{classInfo.name}</h3>
            <Badge variant="outline" className="text-xs">
              {classKindLabel(classInfo.kind)}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <Separator />

        {/* Class Name & Kind & Abstract */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{"Class Name"}</Label>
            <Input
              value={classInfo.name}
              onChange={(e) => updateField("name", e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{"Kind"}</Label>
            <Select
              value={classInfo.kind}
              onValueChange={(v) => {
                const newKind = v as ClassKind
                const updates: Partial<ClassInfo> = { kind: newKind }
                if (newKind !== "class") {
                  updates.isAbstract = false
                  updates.baseClassId = null
                }
                onChange({ ...classInfo, ...updates })
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="class">Class</SelectItem>
                <SelectItem value="interface">Interface</SelectItem>
                <SelectItem value="struct">Struct</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Abstract (Class only) */}
          {classInfo.kind === "class" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="abstract-check"
                checked={classInfo.isAbstract}
                onCheckedChange={(checked) =>
                  updateField("isAbstract", checked === true)
                }
              />
              <Label htmlFor="abstract-check" className="text-xs text-muted-foreground cursor-pointer">
                {"Abstract"}
              </Label>
            </div>
          )}

          {/* Base Class (Class only) */}
          {classInfo.kind === "class" && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{"Base Class"}</Label>
              <Select
                value={classInfo.baseClassId ?? "__none__"}
                onValueChange={(v) =>
                  updateField("baseClassId", v === "__none__" ? null : v)
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {availableBaseClasses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.isAbstract ? " (abstract)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Interfaces (only for class and struct) */}
        {classInfo.kind !== "interface" && (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">{"Interfaces"}</Label>
              {classInfo.interfaces.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {classInfo.interfaces.map((ifId) => {
                    const ifClass = allClasses.find((c) => c.id === ifId)
                    return (
                      <Badge key={ifId} variant="secondary" className="flex items-center gap-1 text-xs">
                        {ifClass?.name ?? "Unknown"}
                        <button
                          type="button"
                          onClick={() => removeInterface(ifId)}
                          className="ml-1 text-muted-foreground hover:text-foreground"
                        >
                          {"x"}
                        </button>
                      </Badge>
                    )
                  })}
                </div>
              )}
              {availableInterfaces.length > 0 && (
                <Select onValueChange={(v) => addInterface(v)} value="">
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Add interface..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableInterfaces
                      .filter((i) => !classInfo.interfaces.includes(i.id))
                      .map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              {availableInterfaces.length === 0 && classInfo.interfaces.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {"No interfaces available."}
                </p>
              )}
            </div>
          </>
        )}

        {/* Members (Attributes) */}
        <Separator />
        <Accordion type="single" collapsible defaultValue="members">
          <AccordionItem value="members" className="border-none">
            <AccordionTrigger className="py-2 text-xs font-medium text-muted-foreground hover:no-underline">
              {"Attributes"} ({classInfo.members.length})
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <div className="flex flex-col gap-3">
                {classInfo.members.map((member, idx) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    allClassNames={allClassNames}
                    showRelationship={isTypeReferencingClass(member.type)}
                    onChange={(m) => updateMember(idx, m)}
                    onRemove={() => removeMember(idx)}
                  />
                ))}
                <Button variant="outline" size="sm" onClick={addMember} className="h-7 text-xs bg-transparent">
                  <Plus className="mr-1 h-3 w-3" />
                  {"Add Attribute"}
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Operations */}
        <Separator />
        <Accordion type="single" collapsible defaultValue="operations">
          <AccordionItem value="operations" className="border-none">
            <AccordionTrigger className="py-2 text-xs font-medium text-muted-foreground hover:no-underline">
              {"Operations"} ({classInfo.operations.length})
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <div className="flex flex-col gap-3">
                {classInfo.operations.map((op, idx) => (
                  <OperationRow
                    key={op.id}
                    operation={op}
                    allClassNames={allClassNames}
                    isExpanded={expandedParams === op.id}
                    onToggleExpand={() =>
                      setExpandedParams(expandedParams === op.id ? null : op.id)
                    }
                    onChange={(o) => updateOperation(idx, o)}
                    onRemove={() => removeOperation(idx)}
                    onAddParam={() => addParameter(idx)}
                    onUpdateParam={(pIdx, p) => updateParameter(idx, pIdx, p)}
                    onRemoveParam={(pIdx) => removeParameter(idx, pIdx)}
                  />
                ))}
                <Button variant="outline" size="sm" onClick={addOperation} className="h-7 text-xs bg-transparent">
                  <Plus className="mr-1 h-3 w-3" />
                  {"Add Operation"}
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </ScrollArea>
  )
}

// ==============================
// Sub-components
// ==============================

function VisibilitySelect({
  value,
  onChange,
}: {
  value: Visibility
  onChange: (v: Visibility) => void
}) {
  const symbols: Record<Visibility, string> = {
    public: "+",
    private: "-",
    protected: "#",
    package: "~",
  }
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Visibility)}>
      <SelectTrigger className="h-7 w-14 text-xs font-mono">
        <SelectValue>{symbols[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="public">+ public</SelectItem>
        <SelectItem value="private">- private</SelectItem>
        <SelectItem value="protected"># protected</SelectItem>
        <SelectItem value="package">~ package</SelectItem>
      </SelectContent>
    </Select>
  )
}

function MemberRow({
  member,
  allClassNames,
  showRelationship,
  onChange,
  onRemove,
}: {
  member: ClassMember
  allClassNames: string[]
  showRelationship: boolean
  onChange: (m: ClassMember) => void
  onRemove: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded border border-border p-2">
      {/* Main row */}
      <div className="flex items-center gap-1.5">
        <VisibilitySelect
          value={member.visibility}
          onChange={(v) => onChange({ ...member, visibility: v })}
        />
        <Input
          value={member.name}
          onChange={(e) => onChange({ ...member, name: e.target.value })}
          className="h-7 flex-1 text-xs"
          placeholder="name"
        />
        <span className="text-xs text-muted-foreground">:</span>
        <TypeInput
          value={member.type}
          allClassNames={allClassNames}
          onChange={(t) => onChange({ ...member, type: t })}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-6 w-6 shrink-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Options row */}
      <div className="flex items-center gap-3 pl-1">
        <div className="flex items-center gap-1.5">
          <Checkbox
            id={`static-${member.id}`}
            checked={member.isStatic}
            onCheckedChange={(checked) =>
              onChange({ ...member, isStatic: checked === true })
            }
            className="h-3.5 w-3.5"
          />
          <Label htmlFor={`static-${member.id}`} className="text-[10px] text-muted-foreground cursor-pointer">
            {"static"}
          </Label>
        </div>
      </div>

      {/* Relationship & Multiplicity (only when type references another class) */}
      {showRelationship && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-muted-foreground w-12 shrink-0">{"Rel."}</Label>
            <Select
              value={member.relationship}
              onValueChange={(v) => onChange({ ...member, relationship: v as MemberRelationshipType })}
            >
              <SelectTrigger className="h-6 text-[10px] flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEMBER_RELATIONSHIP_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-muted-foreground w-12 shrink-0">{"Source"}</Label>
            <Input
              value={member.sourceMultiplicity}
              onChange={(e) => onChange({ ...member, sourceMultiplicity: e.target.value })}
              className="h-6 flex-1 text-[10px] font-mono"
              placeholder="1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-muted-foreground w-12 shrink-0">{"Target"}</Label>
            <Input
              value={member.targetMultiplicity}
              onChange={(e) => {
                const newMult = e.target.value
                // Update the member's type based on target multiplicity
                const baseType = extractBaseTypeName(member.type)
                const newType = computeTypeFromMultiplicity(baseType, newMult)
                onChange({ ...member, targetMultiplicity: newMult, type: newType })
              }}
              className="h-6 flex-1 text-[10px] font-mono"
              placeholder="1"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function TypeInput({
  value,
  allClassNames,
  onChange,
}: {
  value: string
  allClassNames: string[]
  onChange: (v: string) => void
}) {
  const [showSuggestions, setShowSuggestions] = useState(false)

  const suggestions = allClassNames.filter(
    (name) =>
      name.toLowerCase().includes(value.toLowerCase()) && name !== value
  )

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setShowSuggestions(true)
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        className="h-7 w-24 text-xs"
        placeholder="type"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 z-50 mt-1 w-32 rounded-md border border-border bg-popover p-1 shadow-md">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="block w-full rounded px-2 py-1 text-left text-xs text-popover-foreground hover:bg-accent"
              onMouseDown={() => {
                onChange(s)
                setShowSuggestions(false)
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function OperationRow({
  operation,
  allClassNames,
  isExpanded,
  onToggleExpand,
  onChange,
  onRemove,
  onAddParam,
  onUpdateParam,
  onRemoveParam,
}: {
  operation: ClassOperation
  allClassNames: string[]
  isExpanded: boolean
  onToggleExpand: () => void
  onChange: (o: ClassOperation) => void
  onRemove: () => void
  onAddParam: () => void
  onUpdateParam: (idx: number, p: OperationParameter) => void
  onRemoveParam: (idx: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded border border-border p-2">
      <div className="flex items-center gap-1.5">
        <VisibilitySelect
          value={operation.visibility}
          onChange={(v) => onChange({ ...operation, visibility: v })}
        />
        <Input
          value={operation.name}
          onChange={(e) => onChange({ ...operation, name: e.target.value })}
          className="h-7 flex-1 text-xs"
          placeholder="name"
        />
        <span className="text-xs text-muted-foreground">:</span>
        <TypeInput
          value={operation.returnType}
          allClassNames={allClassNames}
          onChange={(t) => onChange({ ...operation, returnType: t })}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Static checkbox */}
      <div className="flex items-center gap-1.5 pl-1">
        <Checkbox
          id={`static-op-${operation.id}`}
          checked={operation.isStatic}
          onCheckedChange={(checked) =>
            onChange({ ...operation, isStatic: checked === true })
          }
          className="h-3.5 w-3.5"
        />
        <Label htmlFor={`static-op-${operation.id}`} className="text-[10px] text-muted-foreground cursor-pointer">
          {"static"}
        </Label>
      </div>

      {/* Parameters toggle */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronRight
          className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
        />
        {"Parameters"} ({operation.parameters.length})
      </button>

      {isExpanded && (
        <div className="ml-4 flex flex-col gap-1.5 border-l-2 border-border pl-3">
          {operation.parameters.map((param, pIdx) => (
            <div key={param.id} className="flex items-center gap-1.5">
              <Input
                value={param.name}
                onChange={(e) => onUpdateParam(pIdx, { ...param, name: e.target.value })}
                className="h-6 flex-1 text-xs"
                placeholder="param"
              />
              <span className="text-xs text-muted-foreground">:</span>
              <TypeInput
                value={param.type}
                allClassNames={allClassNames}
                onChange={(t) => onUpdateParam(pIdx, { ...param, type: t })}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemoveParam(pIdx)}
                className="h-5 w-5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={onAddParam} className="h-6 text-xs">
            <Plus className="mr-1 h-3 w-3" />
            {"Add Parameter"}
          </Button>
        </div>
      )}
    </div>
  )
}

// ==============================
// Resizable divider
// ==============================

function ResizeHandle({
  onResize,
}: {
  onResize: (deltaX: number) => void
}) {
  const handleRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const lastX = useRef(0)

  const onMouseDown = useCallback(
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
        onResize(delta)
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
    [onResize],
  )

  return (
    <div
      ref={handleRef}
      onMouseDown={onMouseDown}
      className="flex w-3 shrink-0 cursor-col-resize items-center justify-center border-x border-border bg-muted/50 transition-colors hover:bg-accent active:bg-accent"
      role="separator"
      aria-orientation="vertical"
    >
      <GripVertical className="h-4 w-4 text-muted-foreground" />
    </div>
  )
}

// ==============================
// Sidebar panel - split into resizable list + detail
// ==============================

interface ClassEditorPanelProps {
  classes: ClassInfo[]
  selectedId: string | null
  onSelectClass: (id: string) => void
  onUpdateClass: (id: string, updated: ClassInfo) => void
  onDeleteClass: (id: string) => void
  onAddClass: () => void
}

const MIN_LIST_WIDTH = 120
const MAX_LIST_WIDTH = 320
const DEFAULT_LIST_WIDTH = 180
const MIN_DETAIL_WIDTH = 240
const MAX_DETAIL_WIDTH = 900
const DEFAULT_DETAIL_WIDTH = 380

export function ClassEditorPanel({
  classes,
  selectedId,
  onSelectClass,
  onUpdateClass,
  onDeleteClass,
  onAddClass,
}: ClassEditorPanelProps) {
  const selectedClass = classes.find((c) => c.id === selectedId)
  const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH)
  const [detailWidth, setDetailWidth] = useState(DEFAULT_DETAIL_WIDTH)

  const handleListResize = useCallback((deltaX: number) => {
    setListWidth((prev) => {
      const next = prev + deltaX
      return Math.max(MIN_LIST_WIDTH, Math.min(MAX_LIST_WIDTH, next))
    })
  }, [])

  const handleDetailResize = useCallback((deltaX: number) => {
    setDetailWidth((prev) => {
      const next = prev + deltaX
      return Math.max(MIN_DETAIL_WIDTH, Math.min(MAX_DETAIL_WIDTH, next))
    })
  }, [])

  return (
    <div className="flex h-full border-r border-border bg-card">
      {/* Left: Class list */}
      <div
        className="flex h-full flex-shrink-0 flex-col border-r border-border"
        style={{ width: listWidth }}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          <h2 className="text-xs font-semibold text-card-foreground">{"Classes"}</h2>
          <Button variant="outline" size="sm" onClick={onAddClass} className="h-6 text-[10px] bg-transparent">
            <Plus className="mr-1 h-3 w-3" />
            {"New"}
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col">
            {classes.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-1 pr-1 transition-colors ${c.id === selectedId
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectClass(c.id)}
                  className="flex flex-1 items-center gap-2 overflow-hidden px-3 py-2 text-left text-xs"
                >
                  {kindIcons[c.kind]}
                  <span className="truncate flex-1">
                    {c.isAbstract && c.kind === "class" ? (
                      <span className="italic">{c.name}</span>
                    ) : (
                      c.name
                    )}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteClass(c.id)
                  }}
                  className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Resize handle between list and detail */}
      <ResizeHandle onResize={handleListResize} />

      {/* Right: Class detail editor */}
      <div className="flex-shrink-0 min-w-0" style={{ width: detailWidth }}>
        {selectedClass ? (
          <ClassEditor
            classInfo={selectedClass}
            allClasses={classes}
            onChange={(updated) => onUpdateClass(selectedClass.id, updated)}
            onDelete={() => onDeleteClass(selectedClass.id)}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-4">
            <p className="text-xs text-muted-foreground text-center">
              {"Select a class to edit, or create a new one."}
            </p>
          </div>
        )}
      </div>

      {/* Resize handle to adjust detail editor width */}
      <ResizeHandle onResize={handleDetailResize} />
    </div>
  )
}
