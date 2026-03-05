// ==============================
// UML Component Diagram Data Model
// ==============================
//
// 設計方針:
//   - クラスをまとめるのが Component
//   - Component をまとめるのが Subsystem
//   - Subsystem をまとめるのが Application
//   - 各層の依存関係は下位層の根拠IDを連鎖参照することでトレース可能
// ==============================

import { Relationship, createId } from './class-diagram-types'

// ==============================
// ComponentKind
// ==============================

/**
 * コンポーネントの階層種別
 * - component   : クラス群をまとめる最小単位
 * - subsystem   : コンポーネント群をまとめる中間層
 * - application : サブシステム群をまとめる最上位層
 */
export type ComponentKind = 'component' | 'subsystem' | 'application'

// ==============================
// ComponentInfo
// ==============================

/**
 * コンポーネント情報
 *
 * 階層に応じた使い分け:
 *   component   → classIds に ClassInfo.id を格納, childComponentIds は空
 *   subsystem   → childComponentIds に component の id を格納, classIds は空
 *   application → childComponentIds に subsystem の id を格納, classIds は空
 *
 * ただし複数コンポーネントへの所属を許容するため、
 * classIds は排他ではなく参照の集合として扱う。
 */
export interface ComponentInfo {
    id: string
    name: string
    kind: ComponentKind
    /** 内包する ClassInfo の ID一覧 (component層が主に使用) */
    classIds: string[]
    /** 内包する子 ComponentInfo の ID一覧 (subsystem/application層が主に使用) */
    childComponentIds: string[]
    /** キャンバス上の位置・サイズ */
    x: number
    y: number
    width: number
    height: number
    /** 設計メモ・補足説明 */
    description?: string
    dslPath?: string
}

// ==============================
// ComponentRelationship
// ==============================

/**
 * コンポーネント間の依存関係
 *
 * basedOnIds には依存の根拠となった下位層のIDを格納する。
 *
 * 根拠の連鎖イメージ:
 *   ClassA → ClassB (Relationship.id = "rel-1")
 *     └─ comp-1 → comp-2 (basedOnIds: ["rel-1"])
 *          └─ subsys-1 → subsys-2 (basedOnIds: ["comp-rel-1"])
 *               └─ app-1 → app-2 (basedOnIds: ["subsys-rel-1"])
 *
 * 根拠となるIDが参照先から削除された場合、
 * basedOnIds に残留するIDを「孤立した根拠」として検知できる。
 */
export interface ComponentRelationship {
    id: string
    sourceComponentId: string
    targetComponentId: string
    /**
     * 依存の根拠となった下位層のID群。
     * - component層: Relationship.id を格納
     * - subsystem層: ComponentRelationship.id (component間) を格納
     * - application層: ComponentRelationship.id (subsystem間) を格納
     * - 手動追加の場合は空配列
     */
    basedOnIds: string[]
    /**
     * 手動で付与した依存の意味・ラベル。
     * 自動導出のたたき台に対してユーザーが上書きする想定。
     */
    label?: string
}

// ==============================
// Helper Functions
// ==============================

export function createEmptyComponent(
    kind: ComponentKind,
    existing: { x: number; y: number }[] = []
): ComponentInfo {
    const pos = pickFreeComponentPosition(existing)
    return {
        id: createId(),
        name: kind === 'application' ? 'NewApplication'
            : kind === 'subsystem' ? 'NewSubsystem'
                : 'NewComponent',
        kind,
        classIds: [],
        childComponentIds: [],
        x: pos.x,
        y: pos.y,
        width: 320,
        height: 240,
    }
}

/** コンポーネント配置用の簡易グリッド */
function pickFreeComponentPosition(
    existing: { x: number; y: number }[]
): { x: number; y: number } {
    const GW = 360, GH = 280, OX = 80, OY = 80, COLS = 3
    for (let row = 0; row < 1000; row++) {
        for (let col = 0; col < COLS; col++) {
            const cx = OX + col * GW
            const cy = OY + row * GH
            if (!existing.some(c => Math.abs(c.x - cx) < GW && Math.abs(c.y - cy) < GH))
                return { x: cx, y: cy }
        }
    }
    return { x: OX, y: OY + existing.length * GH }
}

/**
 * クラス間の Relationship からコンポーネント間の依存を自動導出する。
 *
 * - 同一コンポーネント内のクラス間関係は除外
 * - 同じコンポーネントペアの根拠は basedOnIds にまとめる
 * - 既存の ComponentRelationship がある場合は basedOnIds をマージして返す
 */
export function deriveComponentRelationships(
    components: ComponentInfo[],
    classRelationships: Relationship[],
    existing: ComponentRelationship[] = []
): ComponentRelationship[] {

    // classId → componentId[] のマップ
    const classToComponents = new Map<string, string[]>()
    for (const comp of components) {
        for (const classId of comp.classIds) {
            const list = classToComponents.get(classId) ?? []
            list.push(comp.id)
            classToComponents.set(classId, list)
        }
    }

    // sourceComponentId:targetComponentId → basedOnIds のマップ
    const pairMap = new Map<string, Set<string>>()

    for (const rel of classRelationships) {
        const sourceComps = classToComponents.get(rel.sourceId) ?? []
        const targetComps = classToComponents.get(rel.targetId) ?? []

        for (const srcComp of sourceComps) {
            for (const tgtComp of targetComps) {
                if (srcComp === tgtComp) continue // 同一コンポーネントは除外
                const key = `${srcComp}:${tgtComp}`
                const set = pairMap.get(key) ?? new Set()
                set.add(rel.id)
                pairMap.set(key, set)
            }
        }
    }

    // 既存の ComponentRelationship を key → オブジェクト のマップに
    const existingMap = new Map<string, ComponentRelationship>()
    for (const cr of existing) {
        existingMap.set(`${cr.sourceComponentId}:${cr.targetComponentId}`, cr)
    }

    const result: ComponentRelationship[] = []

    for (const [key, basedOnIds] of pairMap.entries()) {
        const [sourceComponentId, targetComponentId] = key.split(':')
        const existingRel = existingMap.get(key)

        if (existingRel) {
            // 既存があれば basedOnIds をマージ（手動ラベルは保持）
            result.push({
                ...existingRel,
                basedOnIds: Array.from(basedOnIds),
            })
            existingMap.delete(key)
        } else {
            result.push({
                id: createId(),
                sourceComponentId,
                targetComponentId,
                basedOnIds: Array.from(basedOnIds),
            })
        }
    }

    // 根拠が完全に消えたものも既存から引き継ぐ（孤立根拠として検知できるよう残す）
    for (const remaining of existingMap.values()) {
        result.push(remaining)
    }

    return result
}

/**
 * ComponentRelationship の中で、根拠となるIDが
 * 下位層に存在しない「孤立した根拠」を検出する。
 */
export function findOrphanedBasedOnIds(
    componentRelationships: ComponentRelationship[],
    lowerLevelIds: Set<string>
): Array<{ relationshipId: string; orphanedIds: string[] }> {
    const result = []
    for (const cr of componentRelationships) {
        const orphaned = cr.basedOnIds.filter(id => !lowerLevelIds.has(id))
        if (orphaned.length > 0) {
            result.push({ relationshipId: cr.id, orphanedIds: orphaned })
        }
    }
    return result
}
