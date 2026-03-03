"use client"

import React from "react"
import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Plus,
    Trash2,
    Save,
    Box,
    Layers,
    LayoutDashboard,
    GripVertical,
    Settings2,
    ChevronDown,
    ChevronRight,
} from "lucide-react"
import type { ComponentInfo, ComponentKind } from "@/lib/component-diagram-types"
import type { ClassInfo } from "@/lib/class-diagram-types"

// ==============================
// ComponentEditor - individual component editing
// ==============================

interface ComponentEditorProps {
    componentInfo: ComponentInfo
    allComponents: ComponentInfo[]
    allClasses: ClassInfo[]
    availableDslFiles?: string[]
    onChange: (updated: ComponentInfo) => void
    onDelete: () => void
    onAssignClass?: (classId: string) => void
    onUnassignClass?: (classId: string) => void
    onAddChildComponent?: (childId: string) => void
    onRemoveChildComponent?: (childId: string) => void
}

const kindIcons: Record<ComponentKind, React.ReactNode> = {
    component: <Box className="h-4 w-4" />,
    subsystem: <Layers className="h-4 w-4" />,
    application: <LayoutDashboard className="h-4 w-4" />,
}

function getKindLabel(kind: ComponentKind): string {
    switch (kind) {
        case "component": return "Component"
        case "subsystem": return "Subsystem"
        case "application": return "Application"
    }
}

export function ComponentEditor({
    componentInfo,
    allComponents,
    allClasses,
    availableDslFiles = [],
    onChange,
    onDelete,
    onAssignClass,
    onUnassignClass,
    onAddChildComponent,
    onRemoveChildComponent,
}: ComponentEditorProps) {

    function updateField<K extends keyof ComponentInfo>(key: K, value: ComponentInfo[K]) {
        onChange({ ...componentInfo, [key]: value })
    }

    const unassignedClasses = allClasses.filter(
        (cls) => !componentInfo.classIds.includes(cls.id)
    )

    const availableChildComponents = allComponents.filter((c) => {
        if (c.id === componentInfo.id) return false
        if (componentInfo.childComponentIds.includes(c.id)) return false

        // hierarchy rules:
        // subsystem can have component
        // application can have subsystem
        if (componentInfo.kind === "subsystem") return c.kind === "component"
        if (componentInfo.kind === "application") return c.kind === "subsystem"
        return false
    })

    return (
        <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {kindIcons[componentInfo.kind]}
                        <h3 className="text-sm font-semibold text-card-foreground">{componentInfo.name}</h3>
                        <Badge variant="outline" className="text-xs">
                            {getKindLabel(componentInfo.kind)}
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

                {/* Basic Info */}
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs text-muted-foreground">{"Name"}</Label>
                        <Input
                            value={componentInfo.name}
                            onChange={(e) => updateField("name", e.target.value)}
                            className="h-8 text-sm"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs text-muted-foreground">{"Kind"}</Label>
                        <Select
                            value={componentInfo.kind}
                            onValueChange={(v) => updateField("kind", v as ComponentKind)}
                        >
                            <SelectTrigger className="h-8 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="component">Component</SelectItem>
                                <SelectItem value="subsystem">Subsystem</SelectItem>
                                <SelectItem value="application">Application</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs text-muted-foreground">{"Description"}</Label>
                        <Textarea
                            value={componentInfo.description ?? ""}
                            onChange={(e) => updateField("description", e.target.value)}
                            className="min-h-[80px] text-sm resize-none"
                            placeholder="Design notes..."
                        />
                    </div>
                </div>

                {/* Component Level: Classes */}
                {componentInfo.kind === "component" && (
                    <>
                        <Separator />
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">{"DSL File"}</Label>
                            <Select
                                value={componentInfo.dslPath && componentInfo.dslPath.length > 0 ? componentInfo.dslPath : "__none__"}
                                onValueChange={(v) => updateField("dslPath", v === "__none__" ? undefined : v)}
                            >
                                <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder="Select DSL file..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">(None)</SelectItem>
                                    {availableDslFiles.map((path) => (
                                        <SelectItem key={path} value={path}>
                                            {path}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label className="text-xs font-medium text-muted-foreground">{"Classes"}</Label>
                            <div className="flex flex-wrap gap-1.5">
                                {componentInfo.classIds.map((classId) => {
                                    const cls = allClasses.find((c) => c.id === classId)
                                    return (
                                        <Badge key={classId} variant="secondary" className="flex items-center gap-1 text-xs px-2 py-0.5">
                                            {cls?.name ?? "Unknown"}
                                            <button
                                                type="button"
                                                onClick={() => onUnassignClass?.(classId)}
                                                className="ml-1 text-muted-foreground hover:text-foreground"
                                            >
                                                {"x"}
                                            </button>
                                        </Badge>
                                    )
                                })}
                            </div>
                            {unassignedClasses.length > 0 && (
                                <Select onValueChange={(v) => onAssignClass?.(v)} value="">
                                    <SelectTrigger className="h-8 text-sm">
                                        <SelectValue placeholder="Assign class..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {unassignedClasses.map((cls) => (
                                            <SelectItem key={cls.id} value={cls.id}>
                                                {cls.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </>
                )}

                {/* Subsystem/Application Level: Children */}
                {componentInfo.kind !== "component" && (
                    <>
                        <Separator />
                        <div className="flex flex-col gap-2">
                            <Label className="text-xs font-medium text-muted-foreground">
                                {componentInfo.kind === "application" ? "Subsystems" : "Components"}
                            </Label>
                            <div className="flex flex-wrap gap-1.5">
                                {componentInfo.childComponentIds.map((childId) => {
                                    const child = allComponents.find((c) => c.id === childId)
                                    return (
                                        <Badge key={childId} variant="secondary" className="flex items-center gap-1 text-xs px-2 py-0.5">
                                            {child?.name ?? "Unknown"}
                                            <button
                                                type="button"
                                                onClick={() => onRemoveChildComponent?.(childId)}
                                                className="ml-1 text-muted-foreground hover:text-foreground"
                                            >
                                                {"x"}
                                            </button>
                                        </Badge>
                                    )
                                })}
                            </div>
                            {availableChildComponents.length > 0 && (
                                <Select onValueChange={(v) => onAddChildComponent?.(v)} value="">
                                    <SelectTrigger className="h-8 text-sm">
                                        <SelectValue placeholder={`Add ${componentInfo.kind === "application" ? "subsystem" : "component"}...`} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableChildComponents.map((child) => (
                                            <SelectItem key={child.id} value={child.id}>
                                                {child.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </>
                )}
            </div>
        </ScrollArea>
    )
}

// ==============================
// ComponentEditorPanel
// ==============================

interface ComponentEditorPanelProps {
    components: ComponentInfo[]
    classes: ClassInfo[]
    availableDslFiles?: string[]
    selectedId: string | null
    onSelectComponent: (id: string) => void
    onUpdateComponent: (id: string, updated: ComponentInfo) => void
    onDeleteComponent: (id: string) => void
    onAddComponent: (kind: ComponentKind) => void
    onAssignClass?: (compId: string, classId: string) => void
    onUnassignClass?: (compId: string, classId: string) => void
    onAddChildComponent?: (parentId: string, childId: string) => void
    onRemoveChildComponent?: (parentId: string, childId: string) => void
    onSaveContentListJson?: () => void
}

const MIN_LIST_WIDTH = 120
const MAX_LIST_WIDTH = 320
const DEFAULT_LIST_WIDTH = 180
const MIN_DETAIL_WIDTH = 240
const MAX_DETAIL_WIDTH = 900
const DEFAULT_DETAIL_WIDTH = 380

export function ComponentEditorPanel({
    components,
    classes,
    availableDslFiles = [],
    selectedId,
    onSelectComponent,
    onUpdateComponent,
    onDeleteComponent,
    onAddComponent,
    onAssignClass,
    onUnassignClass,
    onAddChildComponent,
    onRemoveChildComponent,
    onSaveContentListJson,
}: ComponentEditorPanelProps) {
    const selectedComponent = components.find((c) => c.id === selectedId)
    const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH)
    const [detailWidth, setDetailWidth] = useState(DEFAULT_DETAIL_WIDTH)
    const [isListCollapsed, setIsListCollapsed] = useState(false)
    const [isDetailCollapsed, setIsDetailCollapsed] = useState(false)
    const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set())

    const componentById = useMemo(() => {
        return new Map(components.map((component) => [component.id, component]))
    }, [components])

    const childIdsByParent = useMemo(() => {
        const children = new Map<string, string[]>()
        for (const component of components) {
            const validChildren = component.childComponentIds.filter((childId) => componentById.has(childId))
            if (validChildren.length > 0) {
                children.set(component.id, validChildren)
            }
        }
        return children
    }, [components, componentById])

    const parentByChild = useMemo(() => {
        const parentMap = new Map<string, string>()
        for (const component of components) {
            for (const childId of component.childComponentIds) {
                if (!componentById.has(childId)) continue
                if (!parentMap.has(childId)) {
                    parentMap.set(childId, component.id)
                }
            }
        }
        return parentMap
    }, [components, componentById])

    const sortedComponents = useMemo(() => {
        const kindOrder: Record<ComponentKind, number> = {
            application: 0,
            subsystem: 1,
            component: 2,
        }
        return [...components].sort((a, b) => {
            if (kindOrder[a.kind] !== kindOrder[b.kind]) {
                return kindOrder[a.kind] - kindOrder[b.kind]
            }
            return a.name.localeCompare(b.name, "en", { sensitivity: "base" })
        })
    }, [components])

    const rootIds = useMemo(() => {
        return sortedComponents
            .filter((component) => !parentByChild.has(component.id))
            .map((component) => component.id)
    }, [sortedComponents, parentByChild])

    const displayRootIds = rootIds.length > 0 ? rootIds : sortedComponents.map((component) => component.id)

    useEffect(() => {
        setExpandedNodeIds((prev) => {
            const existingIds = new Set(components.map((c) => c.id))
            const next = new Set<string>()
            for (const id of prev) {
                if (existingIds.has(id)) {
                    next.add(id)
                }
            }
            for (const rootId of rootIds) {
                next.add(rootId)
            }
            return next
        })
    }, [components, rootIds])

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

    const toggleNode = useCallback((id: string) => {
        setExpandedNodeIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }, [])

    const renderTreeNode = useCallback((componentId: string, depth: number, path: Set<string> = new Set()): React.ReactNode => {
        const component = componentById.get(componentId)
        if (!component || path.has(componentId)) return null

        const childIds = childIdsByParent.get(componentId) ?? []
        const hasChildren = childIds.length > 0
        const isExpanded = expandedNodeIds.has(componentId)
        const isSelected = component.id === selectedId
        const nextPath = new Set(path)
        nextPath.add(componentId)

        return (
            <div key={component.id}>
                <div
                    className={`group flex items-center gap-1 pr-1 transition-colors ${isSelected
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        }`}
                >
                    <button
                        type="button"
                        onClick={() => onSelectComponent(component.id)}
                        className="flex flex-1 items-center gap-1 overflow-hidden py-2 text-left text-xs"
                        style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: "4px" }}
                    >
                        <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm ${hasChildren ? "hover:bg-muted/60" : ""}`}
                            onClick={(e) => {
                                if (!hasChildren) return
                                e.preventDefault()
                                e.stopPropagation()
                                toggleNode(component.id)
                            }}
                        >
                            {hasChildren ? (
                                isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                            ) : (
                                <span className="h-3 w-3" />
                            )}
                        </span>
                        {kindIcons[component.kind]}
                        <span className="truncate flex-1">{component.name}</span>
                    </button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                            e.stopPropagation()
                            onDeleteComponent(component.id)
                        }}
                        className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
                {hasChildren && isExpanded && (
                    <div>
                        {childIds.map((childId) => renderTreeNode(childId, depth + 1, nextPath))}
                    </div>
                )}
            </div>
        )
    }, [
        childIdsByParent,
        componentById,
        expandedNodeIds,
        onDeleteComponent,
        onSelectComponent,
        selectedId,
        toggleNode,
    ])

    return (
        <div className="flex h-full border-r border-border bg-card">
            {/* Sidebar Navigation */}
            <div className="w-12 flex flex-col items-center py-4 gap-4 border-r border-border bg-muted/30">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsListCollapsed(!isListCollapsed)}
                    className={`h-9 w-9 ${!isListCollapsed ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
                    title="Components"
                >
                    <Box className="h-5 w-5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsDetailCollapsed(!isDetailCollapsed)}
                    className={`h-9 w-9 ${!isDetailCollapsed ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
                    title="Editor"
                >
                    <Settings2 className="h-5 w-5" />
                </Button>
            </div>

            {/* Left: Component list */}
            {!isListCollapsed && (
                <div
                    className="flex h-full flex-shrink-0 flex-col"
                    style={{ width: listWidth }}
                >
                    <div className="flex items-center justify-between border-b border-border px-3 py-3">
                        <h2 className="text-xs font-semibold text-card-foreground">{"Components"}</h2>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onSaveContentListJson}
                                className="h-6 w-6 text-muted-foreground"
                                title="Save content list as JSON"
                            >
                                <Save className="h-3.5 w-3.5" />
                            </Button>
                            <Select onValueChange={(v) => onAddComponent(v as ComponentKind)} value="">
                                <SelectTrigger className="h-6 w-12 text-[10px] bg-transparent border-none p-0 focus:ring-0">
                                    <Plus className="h-4 w-4" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="component">New Component</SelectItem>
                                    <SelectItem value="subsystem">New Subsystem</SelectItem>
                                    <SelectItem value="application">New Application</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="flex flex-col">
                            {displayRootIds.map((rootId) => renderTreeNode(rootId, 0))}
                        </div>
                    </ScrollArea>
                </div>
            )}

            {/* Resize handle */}
            {!isListCollapsed && !isDetailCollapsed && <ResizeHandle onResize={handleListResize} />}

            {/* Right: Detail editor */}
            {!isDetailCollapsed && (
                <div className="flex-shrink-0 min-w-0 flex flex-col" style={{ width: detailWidth }}>
                    <div className="flex items-center justify-between border-b border-border px-3 py-3 bg-muted/20 h-[53px]">
                        <h2 className="text-xs font-semibold text-card-foreground truncate">
                            {selectedComponent ? `${selectedComponent.name} Editor` : "Editor"}
                        </h2>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        {selectedComponent ? (
                            <ComponentEditor
                                componentInfo={selectedComponent}
                                allComponents={components}
                                allClasses={classes}
                                availableDslFiles={availableDslFiles}
                                onChange={(updated) => onUpdateComponent(selectedComponent.id, updated)}
                                onDelete={() => onDeleteComponent(selectedComponent.id)}
                                onAssignClass={(classId) => onAssignClass?.(selectedComponent.id, classId)}
                                onUnassignClass={(classId) => onUnassignClass?.(selectedComponent.id, classId)}
                                onAddChildComponent={(childId) => onAddChildComponent?.(selectedComponent.id, childId)}
                                onRemoveChildComponent={(childId) => onRemoveChildComponent?.(selectedComponent.id, childId)}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center p-4">
                                <p className="text-xs text-muted-foreground text-center">
                                    {"Select a component to edit, or create a new one."}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!isDetailCollapsed && <ResizeHandle onResize={handleDetailResize} />}
        </div>
    )
}

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
