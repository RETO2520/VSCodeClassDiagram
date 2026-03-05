/**
 * ComponentDomainModel.ts
 *
 * ============================================================
 * 🎯 目的
 * ------------------------------------------------------------
 * - component-diagram-types.ts の型定義をベースとしたドメインモデル
 * - DomainModel.ts と並列に存在するコンポーネント図専用 Aggregate Root
 * - コンポーネント・サブシステム・アプリケーションの階層管理
 * - ClassInfo.componentIds への書き込み責務を一手に担う
 *
 * ============================================================
 * 🧠 設計方針
 * ------------------------------------------------------------
 * 1. ComponentInfo / ComponentRelationship をベースとした実装
 * 2. DomainModel.ts に倣ったイミュータブルな公開API
 * 3. 内部状態は可変（パフォーマンス重視）
 * 4. ClassInfo.componentIds の書き込みはこのモデルのみが行う
 * 5. React依存を持たない
 *
 * ============================================================
 */

import { ClassInfo, createId } from './class-diagram-types'
import {
    ComponentInfo,
    ComponentKind,
    ComponentRelationship,
    createEmptyComponent,
    deriveComponentRelationships,
    findOrphanedBasedOnIds,
} from './component-diagram-types'

import {
    DomainError,
    DomainRuleViolation,
    DomainValidationError,
    ValidationResult,
    findFreePosition,
} from './DomainModel'

// ============================================================
// Snapshot
// ============================================================

export interface ComponentDomainSnapshot {
    components: ComponentInfo[]
    relationships: ComponentRelationship[]
    timestamp: number
    version: string
}

// ============================================================
// Domain Events
// ============================================================

export interface ComponentDomainEvent {
    readonly type: string
    readonly payload: unknown
    readonly occurredAt: Date
}

export class ComponentAddedEvent implements ComponentDomainEvent {
    readonly type = 'ComponentAdded'
    readonly occurredAt = new Date()
    constructor(readonly payload: { component: ComponentInfo }) { }
}

export class ComponentRemovedEvent implements ComponentDomainEvent {
    readonly type = 'ComponentRemoved'
    readonly occurredAt = new Date()
    constructor(readonly payload: { componentId: string }) { }
}

export class ComponentUpdatedEvent implements ComponentDomainEvent {
    readonly type = 'ComponentUpdated'
    readonly occurredAt = new Date()
    constructor(readonly payload: { component: ComponentInfo }) { }
}

export class ClassAssignedEvent implements ComponentDomainEvent {
    readonly type = 'ClassAssigned'
    readonly occurredAt = new Date()
    constructor(readonly payload: { classId: string; componentId: string }) { }
}

export class ClassUnassignedEvent implements ComponentDomainEvent {
    readonly type = 'ClassUnassigned'
    readonly occurredAt = new Date()
    constructor(readonly payload: { classId: string; componentId: string }) { }
}

export class RelationshipDerivedEvent implements ComponentDomainEvent {
    readonly type = 'RelationshipDerived'
    readonly occurredAt = new Date()
    constructor(readonly payload: { derived: ComponentRelationship[]; orphaned: string[] }) { }
}

// ============================================================
// Aggregate Root
// ============================================================

export class ComponentDomainModel {

    /* ----------------------------
       Factory Methods
    ---------------------------- */

    static createEmpty(): ComponentDomainModel {
        return new ComponentDomainModel(new Map(), new Map())
    }

    static from(
        components: ComponentInfo[],
        relationships: ComponentRelationship[] = []
    ): ComponentDomainModel {
        const compMap = new Map<string, ComponentInfo>()
        for (const c of components) compMap.set(c.id, c)

        const relMap = new Map<string, ComponentRelationship>()
        for (const r of relationships) relMap.set(r.id, r)

        return new ComponentDomainModel(compMap, relMap)
    }

    static fromSnapshot(snapshot: ComponentDomainSnapshot): ComponentDomainModel {
        return ComponentDomainModel.from(snapshot.components, snapshot.relationships)
    }

    /* ----------------------------
       Internal State
    ---------------------------- */

    private constructor(
        private readonly componentMap: Map<string, ComponentInfo>,
        private readonly relationshipMap: Map<string, ComponentRelationship>
    ) { }

    /* ----------------------------
       Core Operations
    ---------------------------- */

    clone(): ComponentDomainModel {
        return ComponentDomainModel.from(this.getComponents(), this.getRelationships())
    }

    toSnapshot(): ComponentDomainSnapshot {
        return {
            components: this.getComponents(),
            relationships: this.getRelationships(),
            timestamp: Date.now(),
            version: '1.0',
        }
    }

    /* ----------------------------
       Query
    ---------------------------- */

    getComponents(): ComponentInfo[] {
        return Array.from(this.componentMap.values()).map(c => this.deepCopyComponent(c))
    }

    getComponent(id: string): ComponentInfo | undefined {
        const c = this.componentMap.get(id)
        return c ? this.deepCopyComponent(c) : undefined
    }

    getRelationships(): ComponentRelationship[] {
        return Array.from(this.relationshipMap.values()).map(r => ({ ...r, basedOnIds: [...r.basedOnIds] }))
    }

    /** 特定の kind のコンポーネント一覧を取得 */
    getByKind(kind: ComponentKind): ComponentInfo[] {
        return this.getComponents().filter(c => c.kind === kind)
    }

    /** classId を内包するコンポーネント一覧を取得 */
    getComponentsForClass(classId: string): ComponentInfo[] {
        return this.getComponents().filter(c => c.classIds.includes(classId))
    }

    /** componentId を内包する親コンポーネント一覧を取得 */
    getParentsOf(componentId: string): ComponentInfo[] {
        return this.getComponents().filter(c => c.childComponentIds.includes(componentId))
    }

    /* ----------------------------
       Component CRUD
    ---------------------------- */

    addComponent(kind: ComponentKind): ComponentDomainModel {
        const existing = Array.from(this.componentMap.values())
        const comp = createEmptyComponent(kind, existing)
        const next = new Map(this.componentMap)
        next.set(comp.id, comp)
        return new ComponentDomainModel(next, new Map(this.relationshipMap))
    }

    removeComponent(componentId: string): ComponentDomainModel {
        if (!this.componentMap.has(componentId)) {
            throw new DomainError(`Component not found: ${componentId}`)
        }

        const nextComp = new Map(this.componentMap)
        nextComp.delete(componentId)

        // 親コンポーネントの childComponentIds からも除去
        for (const [id, comp] of nextComp) {
            if (comp.childComponentIds.includes(componentId)) {
                nextComp.set(id, {
                    ...comp,
                    childComponentIds: comp.childComponentIds.filter(cid => cid !== componentId),
                })
            }
        }

        // 関連するRelationshipを削除
        const nextRel = new Map(this.relationshipMap)
        for (const [rid, rel] of nextRel) {
            if (rel.sourceComponentId === componentId || rel.targetComponentId === componentId) {
                nextRel.delete(rid)
            }
        }

        return new ComponentDomainModel(nextComp, nextRel)
    }

    updateComponent(updated: ComponentInfo): ComponentDomainModel {
        if (!this.componentMap.has(updated.id)) {
            throw new DomainError(`Component not found: ${updated.id}`)
        }
        const next = new Map(this.componentMap)
        next.set(updated.id, { ...updated })
        return new ComponentDomainModel(next, new Map(this.relationshipMap))
    }

    updateComponentPosition(id: string, x: number, y: number): ComponentDomainModel {
        const comp = this.componentMap.get(id)
        if (!comp) throw new DomainError(`Component not found: ${id}`)
        return this.updateComponent({ ...comp, x, y })
    }

    updateComponentSize(id: string, width: number, height: number): ComponentDomainModel {
        const comp = this.componentMap.get(id)
        if (!comp) throw new DomainError(`Component not found: ${id}`)
        return this.updateComponent({ ...comp, width, height })
    }

    /* ----------------------------
       Hierarchy Management
    ---------------------------- */

    /**
     * 子コンポーネントを親に追加する。
     * - component → subsystem/application のみ許可
     * - subsystem → application のみ許可
     * - 循環参照は禁止
     */
    addChildComponent(parentId: string, childId: string): ComponentDomainModel {
        const parent = this.componentMap.get(parentId)
        const child = this.componentMap.get(childId)

        if (!parent) throw new DomainError(`Parent component not found: ${parentId}`)
        if (!child) throw new DomainError(`Child component not found: ${childId}`)
        if (parent.kind === 'component') {
            throw new DomainRuleViolation(`component層は子コンポーネントを持てません: ${parentId}`)
        }
        if (parent.childComponentIds.includes(childId)) {
            return this // 既に追加済み
        }
        if (this.wouldCreateCircularReference(parentId, childId)) {
            throw new DomainRuleViolation(`循環参照が発生します: ${parentId} → ${childId}`)
        }

        const next = new Map(this.componentMap)
        next.set(parentId, {
            ...parent,
            childComponentIds: [...parent.childComponentIds, childId],
        })
        return new ComponentDomainModel(next, new Map(this.relationshipMap))
    }

    removeChildComponent(parentId: string, childId: string): ComponentDomainModel {
        const parent = this.componentMap.get(parentId)
        if (!parent) throw new DomainError(`Parent component not found: ${parentId}`)

        const next = new Map(this.componentMap)
        next.set(parentId, {
            ...parent,
            childComponentIds: parent.childComponentIds.filter(id => id !== childId),
        })
        return new ComponentDomainModel(next, new Map(this.relationshipMap))
    }

    /* ----------------------------
       Class Assignment
       ※ ClassInfo.componentIds への書き込みはここが唯一の責務
    ---------------------------- */

    /**
     * クラスをコンポーネントにアサインする。
     * ClassInfo を受け取り、componentIds を更新した新しい ClassInfo を返す。
     * 呼び出し元は返却された ClassInfo を DomainModel に反映すること。
     */
    assignClass(classInfo: ClassInfo, componentId: string): {
        model: ComponentDomainModel
        updatedClass: ClassInfo
    } {
        const comp = this.componentMap.get(componentId)
        if (!comp) throw new DomainError(`Component not found: ${componentId}`)
        if (comp.kind !== 'component') {
            throw new DomainRuleViolation(`クラスは component層にのみアサインできます: ${componentId}`)
        }

        // ComponentInfo 側の classIds を更新
        const nextComp = new Map(this.componentMap)
        if (!comp.classIds.includes(classInfo.id)) {
            nextComp.set(componentId, {
                ...comp,
                classIds: [...comp.classIds, classInfo.id],
            })
        }

        // ClassInfo 側の componentIds を更新（書き込みの唯一の責務）
        const updatedClass: ClassInfo = classInfo.componentIds?.includes(componentId)
            ? classInfo
            : {
                ...classInfo,
                componentIds: [...(classInfo.componentIds ?? []), componentId],
            }

        return {
            model: new ComponentDomainModel(nextComp, new Map(this.relationshipMap)),
            updatedClass,
        }
    }

    /**
     * クラスのコンポーネントへのアサインを解除する。
     * 返却された updatedClass を DomainModel に反映すること。
     */
    unassignClass(classInfo: ClassInfo, componentId: string): {
        model: ComponentDomainModel
        updatedClass: ClassInfo
    } {
        const comp = this.componentMap.get(componentId)
        if (!comp) throw new DomainError(`Component not found: ${componentId}`)

        const nextComp = new Map(this.componentMap)
        nextComp.set(componentId, {
            ...comp,
            classIds: comp.classIds.filter(id => id !== classInfo.id),
        })

        const updatedClass: ClassInfo = {
            ...classInfo,
            componentIds: (classInfo.componentIds ?? []).filter(id => id !== componentId),
        }

        return {
            model: new ComponentDomainModel(nextComp, new Map(this.relationshipMap)),
            updatedClass,
        }
    }

    /* ----------------------------
       Relationship Management
    ---------------------------- */

    /**
     * 下位層の依存関係からコンポーネント間依存を自動導出する。
     *
     * - component層: DomainModel.detectRelationships() の結果を渡す
     * - subsystem層: component間の ComponentRelationship を渡す
     * - application層: subsystem間の ComponentRelationship を渡す
     *
     * 既存の手動ラベルは保持され、根拠IDのみマージされる。
     * 孤立した根拠（下位層から削除済み）は警告として返す。
     */
    deriveRelationships(
        lowerLevelRelationships: Array<{ id: string; sourceId: string; targetId: string }>,
        targetKind: ComponentKind
    ): {
        model: ComponentDomainModel
        orphaned: Array<{ relationshipId: string; orphanedIds: string[] }>
    } {
        const targetComponents = Array.from(this.componentMap.values()).filter(c => c.kind === targetKind)

        // classId/componentId → ComponentInfo のマップ
        const memberToComponents = new Map<string, string[]>()
        for (const comp of targetComponents) {
            const memberIds = targetKind === 'component' ? comp.classIds : comp.childComponentIds
            for (const memberId of memberIds) {
                const list = memberToComponents.get(memberId) ?? []
                list.push(comp.id)
                memberToComponents.set(memberId, list)
            }
        }

        // ペアごとに basedOnIds を集約
        const pairMap = new Map<string, Set<string>>()
        for (const rel of lowerLevelRelationships) {
            const srcComps = memberToComponents.get(rel.sourceId) ?? []
            const tgtComps = memberToComponents.get(rel.targetId) ?? []
            for (const src of srcComps) {
                for (const tgt of tgtComps) {
                    if (src === tgt) continue
                    const key = `${src}:${tgt}`
                    const set = pairMap.get(key) ?? new Set()
                    set.add(rel.id)
                    pairMap.set(key, set)
                }
            }
        }

        // 既存との差分マージ
        const existing = this.getRelationships().filter(r =>
            targetComponents.some(c => c.id === r.sourceComponentId) &&
            targetComponents.some(c => c.id === r.targetComponentId)
        )
        const existingMap = new Map(existing.map(r => [`${r.sourceComponentId}:${r.targetComponentId}`, r]))

        const nextRelMap = new Map(this.relationshipMap)
        const derived: ComponentRelationship[] = []

        for (const [key, basedOnIds] of pairMap.entries()) {
            const [sourceComponentId, targetComponentId] = key.split(':')
            const existingRel = existingMap.get(key)

            if (existingRel) {
                const merged: ComponentRelationship = {
                    ...existingRel,
                    // Recompute evidence from current lower-level relationships.
                    // Do not keep stale IDs from previous derive runs.
                    basedOnIds: Array.from(basedOnIds),
                }
                nextRelMap.set(merged.id, merged)
                derived.push(merged)
                existingMap.delete(key)
            } else {
                const newRel: ComponentRelationship = {
                    id: createId(),
                    sourceComponentId,
                    targetComponentId,
                    basedOnIds: Array.from(basedOnIds),
                }
                nextRelMap.set(newRel.id, newRel)
                derived.push(newRel)
            }
        }

        // 根拠が消えた関係も残す（孤立根拠として検知）
        for (const remaining of existingMap.values()) {
            nextRelMap.set(remaining.id, remaining)
        }

        // 孤立根拠の検出
        const lowerLevelIds = new Set(lowerLevelRelationships.map(r => r.id))
        const orphaned = findOrphanedBasedOnIds(
            Array.from(nextRelMap.values()),
            lowerLevelIds
        )

        return {
            model: new ComponentDomainModel(new Map(this.componentMap), nextRelMap),
            orphaned,
        }
    }

    /** Relationship を手動で追加（根拠なし） */
    addRelationship(sourceComponentId: string, targetComponentId: string, label?: string): ComponentDomainModel {
        if (!this.componentMap.has(sourceComponentId)) {
            throw new DomainError(`Source component not found: ${sourceComponentId}`)
        }
        if (!this.componentMap.has(targetComponentId)) {
            throw new DomainError(`Target component not found: ${targetComponentId}`)
        }
        const rel: ComponentRelationship = {
            id: createId(),
            sourceComponentId,
            targetComponentId,
            basedOnIds: [],
            label,
        }
        const next = new Map(this.relationshipMap)
        next.set(rel.id, rel)
        return new ComponentDomainModel(new Map(this.componentMap), next)
    }

    /** Relationship のラベルを更新 */
    updateRelationshipLabel(relationshipId: string, label: string): ComponentDomainModel {
        const rel = this.relationshipMap.get(relationshipId)
        if (!rel) throw new DomainError(`Relationship not found: ${relationshipId}`)
        const next = new Map(this.relationshipMap)
        next.set(relationshipId, { ...rel, label })
        return new ComponentDomainModel(new Map(this.componentMap), next)
    }

    removeRelationship(relationshipId: string): ComponentDomainModel {
        if (!this.relationshipMap.has(relationshipId)) {
            throw new DomainError(`Relationship not found: ${relationshipId}`)
        }
        const next = new Map(this.relationshipMap)
        next.delete(relationshipId)
        return new ComponentDomainModel(new Map(this.componentMap), next)
    }

    /* ----------------------------
       Validation
    ---------------------------- */

    validate(): ValidationResult {
        const errors: string[] = []
        const warnings: string[] = []

        for (const comp of this.componentMap.values()) {
            // 名前の空白チェック
            if (!comp.name.trim()) {
                errors.push(`コンポーネント名が空です: id=${comp.id}`)
            }

            // childComponentIds の参照整合性
            for (const childId of comp.childComponentIds) {
                if (!this.componentMap.has(childId)) {
                    errors.push(`存在しない子コンポーネントを参照しています: ${comp.name} → ${childId}`)
                }
            }

            // component層が childComponentIds を持っている場合は警告
            if (comp.kind === 'component' && comp.childComponentIds.length > 0) {
                warnings.push(`component層が子コンポーネントを持っています: ${comp.name}`)
            }
        }

        // Relationship の参照整合性
        for (const rel of this.relationshipMap.values()) {
            if (!this.componentMap.has(rel.sourceComponentId)) {
                errors.push(`Relationship の参照先コンポーネントが存在しません: source=${rel.sourceComponentId}`)
            }
            if (!this.componentMap.has(rel.targetComponentId)) {
                errors.push(`Relationship の参照先コンポーネントが存在しません: target=${rel.targetComponentId}`)
            }
        }

        // 循環参照チェック
        if (this.hasCircularChildReference()) {
            errors.push('コンポーネント階層に循環参照があります')
        }

        return { isValid: errors.length === 0, errors, warnings }
    }

    assertValid(): void {
        const result = this.validate()
        if (!result.isValid) {
            throw new DomainValidationError(result.errors)
        }
    }

    /* ----------------------------
       Internal Helpers
    ---------------------------- */

    private deepCopyComponent(comp: ComponentInfo): ComponentInfo {
        return {
            ...comp,
            classIds: [...comp.classIds],
            childComponentIds: [...comp.childComponentIds],
        }
    }

    private wouldCreateCircularReference(parentId: string, childId: string): boolean {
        // childId の子孫に parentId が含まれるか
        const visited = new Set<string>()
        const stack = [childId]
        while (stack.length > 0) {
            const current = stack.pop()!
            if (current === parentId) return true
            if (visited.has(current)) continue
            visited.add(current)
            const comp = this.componentMap.get(current)
            if (comp) stack.push(...comp.childComponentIds)
        }
        return false
    }

    private hasCircularChildReference(): boolean {
        for (const id of this.componentMap.keys()) {
            if (this.wouldCreateCircularReference(id, id)) return true
        }
        return false
    }
}
