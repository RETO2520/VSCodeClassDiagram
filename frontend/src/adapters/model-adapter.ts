/**
 * Data model adapter: converts between media/ ClassModel format
 * and view/ ClassInfo format.
 *
 * media/ uses: ClassModel { attributes, operations, isInterface, isAbstract, isStruct, width, height }
 * view/  uses: ClassInfo  { members, operations, kind, isAbstract }
 */

import type {
    ClassInfo,
    ClassMember,
    ClassOperation,
    ClassKind,
    Visibility,
    MemberRelationshipType,
    OperationParameter,
} from '../../../view/lib/class-diagram-types'

// ==============================
// media/ side types (matching media/types.d.ts)
// ==============================

export interface MediaAttribute {
    name: string
    type: string
    visibility: 'public' | 'private' | 'protected' | 'package'
    modifier: string // 'None' | 'Static' | 'Abstract' | 'aggregation' | 'composition' etc.
}

export interface MediaParameter {
    name: string
    type: string
}

export interface MediaOperation {
    name: string
    returnType: string
    visibility: 'public' | 'private' | 'protected' | 'package'
    modifier: string // 'None' | 'Static' | 'Abstract' etc.
    parameters: MediaParameter[]
}

export interface MediaClassModel {
    id: string
    name: string
    x: number
    y: number
    width: number
    height: number
    baseClassId: string | null
    baseClass?: string
    interfaces: string[]
    isAbstract: boolean
    isInterface: boolean
    isStruct?: boolean
    attributes: MediaAttribute[]
    operations: MediaOperation[]
}

export interface MediaDiagramModel {
    classes: MediaClassModel[]
}

// ==============================
// Stored metadata for round-trip fidelity
// ==============================

/** Per-class metadata that media/ uses but view/ doesn't track */
export interface MediaClassMeta {
    width: number
    height: number
    /** Original attribute modifiers that don't map cleanly to view/ */
    attributeModifiers: Record<string, string>
    /** Original operation modifiers */
    operationModifiers: Record<string, string>
}

// Store metadata keyed by class ID for round-trip
const classMetaMap = new Map<string, MediaClassMeta>()

// ==============================
// media → view conversion
// ==============================

function mediaVisibilityToView(vis: string): Visibility {
    if (vis === 'public' || vis === 'private' || vis === 'protected' || vis === 'package') {
        return vis
    }
    return 'private'
}

function mediaKindToView(cls: MediaClassModel): ClassKind {
    if (cls.isInterface) return 'interface'
    if (cls.isStruct) return 'struct'
    return 'class'
}

function mediaModifierToRelationship(modifier: string): MemberRelationshipType {
    const mod = (modifier || 'None').toLowerCase()
    if (mod === 'aggregation') return 'aggregation'
    if (mod === 'composition') return 'composition'
    return 'auto'
}

function mediaAttributeToMember(attr: MediaAttribute, idx: number): ClassMember {
    const mod = (attr.modifier || 'None').toLowerCase()
    return {
        id: `m_${idx}`,
        name: attr.name,
        type: attr.type,
        visibility: mediaVisibilityToView(attr.visibility),
        isStatic: mod === 'static',
        relationship: mediaModifierToRelationship(attr.modifier),
        sourceMultiplicity: '1',
        targetMultiplicity: '1',
    }
}

function mediaOperationToView(op: MediaOperation, idx: number): ClassOperation {
    const mod = (op.modifier || 'None').toLowerCase()
    return {
        id: `o_${idx}`,
        name: op.name,
        returnType: op.returnType,
        visibility: mediaVisibilityToView(op.visibility),
        isStatic: mod === 'static',
        parameters: op.parameters.map((p, pi) => ({
            id: `p_${idx}_${pi}`,
            name: p.name,
            type: p.type,
        })),
    }
}

export function mediaClassToView(cls: MediaClassModel): ClassInfo {
    // Store metadata for round-trip
    const attrMods: Record<string, string> = {
    }
    cls.attributes.forEach((a, i) => {
        attrMods[`m_${i}`] = a.modifier || 'None'
    })
    const opMods: Record<string, string> = {
    }
    cls.operations.forEach((o, i) => {
        opMods[`o_${i}`] = o.modifier || 'None'
    })
    classMetaMap.set(cls.id, {
        width: cls.width || 400,
        height: cls.height || 120,
        attributeModifiers: attrMods,
        operationModifiers: opMods,
    })

    return {
        id: cls.id,
        name: cls.name,
        kind: mediaKindToView(cls),
        isAbstract: cls.isAbstract,
        members: cls.attributes.map(mediaAttributeToMember),
        operations: cls.operations.map(mediaOperationToView),
        interfaces: cls.interfaces || [],
        baseClassId: cls.baseClassId || null,
        x: cls.x,
        y: cls.y,
    }
}

export function mediaDiagramToView(model: MediaDiagramModel): ClassInfo[] {
    if (!model || !model.classes) return []
    return model.classes.map(mediaClassToView)
}

// ==============================
// view → media conversion
// ==============================

function viewVisibilityToMedia(vis: Visibility): 'public' | 'private' | 'protected' | 'package' {
    return vis
}

function viewKindToMediaFlags(kind: ClassKind, isAbstract: boolean): {
    isInterface: boolean
    isAbstract: boolean
    isStruct: boolean
} {
    return {
        isInterface: kind === 'interface',
        isAbstract: kind === 'class' && isAbstract,
        isStruct: kind === 'struct',
    }
}

function viewMemberToAttribute(member: ClassMember, classMeta?: MediaClassMeta): MediaAttribute {
    // Try to restore original modifier from metadata
    let modifier = 'None'
    if (classMeta && classMeta.attributeModifiers[member.id]) {
        modifier = classMeta.attributeModifiers[member.id]
    } else {
        // Derive from view properties
        if (member.isStatic) {
            modifier = 'Static'
        } else if (member.relationship === 'aggregation') {
            modifier = 'aggregation'
        } else if (member.relationship === 'composition') {
            modifier = 'composition'
        } else {
            modifier = 'None'
        }
    }

    return {
        name: member.name,
        type: member.type,
        visibility: viewVisibilityToMedia(member.visibility),
        modifier,
    }
}

function viewOperationToMedia(op: ClassOperation, classMeta?: MediaClassMeta): MediaOperation {
    let modifier = 'None'
    if (classMeta && classMeta.operationModifiers[op.id]) {
        modifier = classMeta.operationModifiers[op.id]
    } else {
        if (op.isStatic) modifier = 'Static'
    }

    return {
        name: op.name,
        returnType: op.returnType,
        visibility: viewVisibilityToMedia(op.visibility),
        modifier,
        parameters: op.parameters.map(p => ({
            name: p.name,
            type: p.type,
        })),
    }
}

export function viewClassToMedia(cls: ClassInfo): MediaClassModel {
    const meta = classMetaMap.get(cls.id)
    const flags = viewKindToMediaFlags(cls.kind, cls.isAbstract)

    return {
        id: cls.id,
        name: cls.name,
        x: cls.x,
        y: cls.y,
        width: meta?.width ?? 400,
        height: meta?.height ?? 120,
        baseClassId: cls.baseClassId,
        interfaces: cls.interfaces || [],
        isAbstract: flags.isAbstract,
        isInterface: flags.isInterface,
        isStruct: flags.isStruct,
        attributes: cls.members.map(m => viewMemberToAttribute(m, meta)),
        operations: cls.operations.map(o => viewOperationToMedia(o, meta)),
    }
}

export function viewDiagramToMedia(classes: ClassInfo[]): MediaDiagramModel {
    return {
        classes: classes.map(viewClassToMedia),
    }
}

// ==============================
// Model migration (matching media/main.utils.js migrateModel)
// ==============================

export function migrateMediaModel(model: MediaDiagramModel): MediaDiagramModel {
    if (!model || !model.classes) {
        return {
            classes: []
        }
    }

    const nameToId: Record<string, string> = {
    }
    const idToClass: Record<string, MediaClassModel> = {
    }

    for (const c of model.classes) {
        if (!c.id) c.id = Math.random().toString(36).substring(2, 10)
        nameToId[c.name] = c.id
        idToClass[c.id] = c
    }

    for (const c of model.classes) {
        if (!Array.isArray(c.interfaces)) c.interfaces = []
        if (typeof c.isAbstract === 'undefined') c.isAbstract = false
        if (typeof c.isInterface === 'undefined') c.isInterface = false
        if (!Array.isArray(c.attributes)) c.attributes = []
        if (!Array.isArray(c.operations)) c.operations = []

        c.interfaces = c.interfaces.map(it => {
            if (!it) return null
            if (idToClass[it]) return it
            if (nameToId[it]) return nameToId[it]
            return null
        }).filter((x): x is string => !!x)

        if (typeof c.baseClassId === 'undefined') {
            if (c.baseClass && nameToId[c.baseClass]) {
                c.baseClassId = nameToId[c.baseClass]
            } else {
                c.baseClassId = null
            }
        } else {
            if (c.baseClassId && !idToClass[c.baseClassId] && nameToId[c.baseClassId]) {
                c.baseClassId = nameToId[c.baseClassId]
            }
            if (c.baseClassId && !idToClass[c.baseClassId]) c.baseClassId = null
        }
    }

    const validIds = new Set(model.classes.map(c => c.id))
    for (const c of model.classes) {
        c.interfaces = c.interfaces.filter(id => validIds.has(id))
    }

    return model
}

/** Prepare model for export (matches media/main.utils.js modelForExport) */
export function modelForExport(classes: ClassInfo[]): object {
    const mediaModel = viewDiagramToMedia(classes)
    const idToName: Record<string, string> = {
    }
    for (const c of mediaModel.classes) idToName[c.id] = c.name

    return {
        classes: mediaModel.classes.map(c => ({
            ...c,
            baseClass: c.baseClassId ? idToName[c.baseClassId] : 'None',
        })),
    }
}
