/**
 * ComponentService.ts
 *
 * ============================================================
 * 🎯 目的
 * ------------------------------------------------------------
 * - ComponentDomainModel と DomainModel を橋渡しするサービス層
 * - 「コンポーネントへのクラスアサイン」など、両モデルをまたぐ
 *   ユースケースをここに集約する
 * - UIレイヤーはこのサービスを介して両モデルを操作する
 *
 * ============================================================
 * 🧠 設計方針
 * ------------------------------------------------------------
 * 1. 両モデルをまたぐ操作のみをここに置く
 *    （単一モデルで完結する操作は各モデルに委譲）
 * 2. イミュータブル: 操作は常に新しいモデルペアを返す
 * 3. ClassInfo.componentIds の書き込みは
 *    ComponentDomainModel.assignClass / unassignClass 経由のみ
 * 4. React依存を持たない
 *
 * ============================================================
 */

import { ClassInfo } from '../class-diagram-types'
import { DomainModel } from '../DomainModel'
import { ComponentDomainModel } from '../ComponentDomainModel'
import { ComponentKind, ComponentRelationship } from '../component-diagram-types'
import { DomainError } from '../DomainModel'

// ============================================================
// 操作結果の型
// ============================================================

/** 両モデルの更新結果をまとめて返す */
export interface ComponentServiceResult {
    classDomain: DomainModel
    componentDomain: ComponentDomainModel
}

/** 依存導出結果 */
export interface DeriveRelationshipsResult extends ComponentServiceResult {
    /** 導出・更新された ComponentRelationship */
    derived: ComponentRelationship[]
    /** 根拠が孤立した警告 */
    orphaned: Array<{ relationshipId: string; orphanedIds: string[] }>
}

// ============================================================
// ComponentService
// ============================================================

export class ComponentService {

    constructor(
        private readonly classDomain: DomainModel,
        private readonly componentDomain: ComponentDomainModel
    ) { }

    // ------------------------------------------------------------------
    // Folder-based synchronization
    // ------------------------------------------------------------------

    /**
     * Update internal componentDomain so that it mirrors the given set of
     * directory entries from the `.diagram` folder.  The folder hierarchy is
     * treated as the single source of truth for component/subsystem/application
     * structure – any existing components inside the domain model are discarded
     * and replaced with a fresh set derived from `files`.
     *
     * The expected naming conventions are enforced by the FileService, but this
     * method is tolerant: it looks at suffixes `_Application`, `_Subsystem`,
     * `_Component` on the last segment of each path in order to decide the
     * `ComponentKind`.  When no suffix is present the depth of the path is used
     * to infer kind (depth 1 → application, 2 → subsystem, >=3 → component).
     *
     * Structure is constructed in parent‑before‑child order so that
     * `addChildComponent` can be invoked safely.
     *
     * **Note:** because we throw away the previous domain state, things like
     * positions or class assignments will be lost when this method is executed.
     * Synchronization should therefore be driven only when the workspace
     * directory structure changes and the user understands that components are
     * re‑generated from scratch.
     *
     * @param files Array of file entries representing the contents of `.diagram`
     */
    syncFromDiagramFiles(files: Array<{ path: string; isDirectory: boolean }>): void {
        const newDomain = ComponentService.buildFromDiagramFiles(files);
        // mutate underlying domain (the rest of codebase currently relies on
        // imperatively poking componentDomain).  Keeping the same object
        // reference allows previously held references to continue working.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).componentDomain = newDomain;
    }

    /**
     * Helper that constructs a ComponentDomainModel from a list of directory
     * paths.  Public for testing.
     */
    static buildFromDiagramFiles(files: Array<{ path: string; isDirectory: boolean }>): ComponentDomainModel {
        // only directories are relevant for component hierarchy
        const dirs = files.filter(f => f.isDirectory).map(f => f.path);

        // sort by depth so parents are created before children
        dirs.sort((a, b) => a.split('/').length - b.split('/').length);

        let model = ComponentDomainModel.createEmpty();
        const pathToId = new Map<string, string>();

        const appSuffix = '_Application';
        const subsSuffix = '_Subsystem';
        const compSuffix = '_Component';

        type Item = { path: string; kind: ComponentKind; name: string; parentPath: string };
        const items: Item[] = [];

        for (const dir of dirs) {
            const parts = dir.split('/');
            const last = parts[parts.length - 1];
            let kind: ComponentKind;
            let name = last;

            if (last.endsWith(appSuffix)) {
                kind = 'application';
                name = last.slice(0, -appSuffix.length);
            } else if (last.endsWith(subsSuffix)) {
                kind = 'subsystem';
                name = last.slice(0, -subsSuffix.length);
            } else if (last.endsWith(compSuffix)) {
                kind = 'component';
                name = last.slice(0, -compSuffix.length);
            } else {
                // fall back to depth heuristics
                if (parts.length === 1) kind = 'application';
                else if (parts.length === 2) kind = 'subsystem';
                else kind = 'component';
            }

            const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
            items.push({ path: dir, kind, name, parentPath });
        }

        // create components
        for (const item of items) {
            model = model.addComponent(item.kind);
            // newly added component will be the last one in the list
            const comps = model.getComponents();
            const added = comps[comps.length - 1];
            model = model.updateComponent({ ...added, name: item.name });
            pathToId.set(item.path, added.id);
        }

        // build hierarchy
        for (const item of items) {
            if (!item.parentPath) continue;
            const parentId = pathToId.get(item.parentPath);
            const childId = pathToId.get(item.path);
            if (parentId && childId) {
                try {
                    model = model.addChildComponent(parentId, childId);
                } catch {
                    // ignore invalid parent/child combinations; folder names may
                    // not exactly match expected rules and will simply be
                    // treated as a flat list.
                }
            }
        }

        return model;
    }

    /** 現在の状態からサービスインスタンスを生成 */
    static create(
        classDomain: DomainModel,
        componentDomain: ComponentDomainModel
    ): ComponentService {
        return new ComponentService(classDomain, componentDomain)
    }

    // ----------------------------------------------------------
    // クラスとコンポーネントの紐付け
    // ----------------------------------------------------------

    /**
     * クラスをコンポーネントにアサインする。
     *
     * - ComponentDomainModel.classIds にクラスIDを追加
     * - ClassInfo.componentIds にコンポーネントIDを書き込む（唯一の書き込み口）
     * - 同一クラスを複数コンポーネントにアサイン可能
     */
    assignClassToComponent(classId: string, componentId: string): ComponentServiceResult {
        const classInfo = this.classDomain.findClassById(classId)
        if (!classInfo) throw new DomainError(`Class not found: ${classId}`)

        const { model: nextComponentDomain, updatedClass } =
            this.componentDomain.assignClass(classInfo, componentId)

        const nextClassDomain = this.classDomain.updateClass(classId, () => updatedClass)

        return { classDomain: nextClassDomain, componentDomain: nextComponentDomain }
    }

    /**
     * クラスのコンポーネントへのアサインを解除する。
     *
     * - ComponentDomainModel.classIds からクラスIDを除去
     * - ClassInfo.componentIds からコンポーネントIDを除去
     */
    unassignClassFromComponent(classId: string, componentId: string): ComponentServiceResult {
        const classInfo = this.classDomain.findClassById(classId)
        if (!classInfo) throw new DomainError(`Class not found: ${classId}`)

        const { model: nextComponentDomain, updatedClass } =
            this.componentDomain.unassignClass(classInfo, componentId)

        const nextClassDomain = this.classDomain.updateClass(classId, () => updatedClass)

        return { classDomain: nextClassDomain, componentDomain: nextComponentDomain }
    }

    /**
     * クラスのアサイン先コンポーネントを一括で入れ替える。
     * 既存のアサインをすべて解除してから新しいコンポーネント群にアサインする。
     */
    reassignClassToComponents(classId: string, newComponentIds: string[]): ComponentServiceResult {
        const classInfo = this.classDomain.findClassById(classId)
        if (!classInfo) throw new DomainError(`Class not found: ${classId}`)

        // 既存アサインを全解除
        const currentComponentIds = classInfo.componentIds ?? []
        let current: ComponentServiceResult = {
            classDomain: this.classDomain,
            componentDomain: this.componentDomain,
        }
        for (const cid of currentComponentIds) {
            current = ComponentService.create(
                current.classDomain,
                current.componentDomain
            ).unassignClassFromComponent(classId, cid)
        }

        // 新しいコンポーネントにアサイン
        for (const cid of newComponentIds) {
            current = ComponentService.create(
                current.classDomain,
                current.componentDomain
            ).assignClassToComponent(classId, cid)
        }

        return current
    }

    // ----------------------------------------------------------
    // 依存関係の導出（階層をまたぐ連鎖導出）
    // ----------------------------------------------------------

    /**
     * component層: クラス間 Relationship から component間依存を導出する。
     *
     * DomainModel.detectRelationships() の結果を使うため、
     * 両モデルを参照するこのサービスが担う。
     */
    deriveComponentRelationships(): DeriveRelationshipsResult {
        const classRelationships = this.classDomain.detectRelationships()

        // Relationship を { id, sourceId, targetId } に射影して渡す
        const lowerLevel = classRelationships.map(r => ({
            id: r.id,
            sourceId: r.sourceId,
            targetId: r.targetId,
        }))

        const { model: nextComponentDomain, orphaned } =
            this.componentDomain.deriveRelationships(lowerLevel, 'component')

        const derived = nextComponentDomain.getRelationships().filter(r => {
            const srcComp = nextComponentDomain.getComponent(r.sourceComponentId)
            const tgtComp = nextComponentDomain.getComponent(r.targetComponentId)
            return srcComp?.kind === 'component' && tgtComp?.kind === 'component'
        })

        return {
            classDomain: this.classDomain,
            componentDomain: nextComponentDomain,
            derived,
            orphaned,
        }
    }

    /**
     * subsystem層: component間 ComponentRelationship から subsystem間依存を導出する。
     */
    deriveSubsystemRelationships(): DeriveRelationshipsResult {
        const componentRelationships = this.componentDomain.getRelationships().filter(r => {
            const src = this.componentDomain.getComponent(r.sourceComponentId)
            const tgt = this.componentDomain.getComponent(r.targetComponentId)
            return src?.kind === 'component' && tgt?.kind === 'component'
        })

        const lowerLevel = componentRelationships.map(r => ({
            id: r.id,
            sourceId: r.sourceComponentId,
            targetId: r.targetComponentId,
        }))

        const { model: nextComponentDomain, orphaned } =
            this.componentDomain.deriveRelationships(lowerLevel, 'subsystem')

        const derived = nextComponentDomain.getRelationships().filter(r => {
            const srcComp = nextComponentDomain.getComponent(r.sourceComponentId)
            const tgtComp = nextComponentDomain.getComponent(r.targetComponentId)
            return srcComp?.kind === 'subsystem' && tgtComp?.kind === 'subsystem'
        })

        return {
            classDomain: this.classDomain,
            componentDomain: nextComponentDomain,
            derived,
            orphaned,
        }
    }

    /**
     * application層: subsystem間 ComponentRelationship から application間依存を導出する。
     */
    deriveApplicationRelationships(): DeriveRelationshipsResult {
        const subsystemRelationships = this.componentDomain.getRelationships().filter(r => {
            const src = this.componentDomain.getComponent(r.sourceComponentId)
            const tgt = this.componentDomain.getComponent(r.targetComponentId)
            return src?.kind === 'subsystem' && tgt?.kind === 'subsystem'
        })

        const lowerLevel = subsystemRelationships.map(r => ({
            id: r.id,
            sourceId: r.sourceComponentId,
            targetId: r.targetComponentId,
        }))

        const { model: nextComponentDomain, orphaned } =
            this.componentDomain.deriveRelationships(lowerLevel, 'application')

        const derived = nextComponentDomain.getRelationships().filter(r => {
            const srcComp = nextComponentDomain.getComponent(r.sourceComponentId)
            const tgtComp = nextComponentDomain.getComponent(r.targetComponentId)
            return srcComp?.kind === 'application' && tgtComp?.kind === 'application'
        })

        return {
            classDomain: this.classDomain,
            componentDomain: nextComponentDomain,
            derived,
            orphaned,
        }
    }

    /**
     * 全階層の依存を一括で連鎖導出する。
     * component → subsystem → application の順に導出する。
     *
     * 各層の orphaned をまとめて返す。
     */
    deriveAllRelationships(): DeriveRelationshipsResult & {
        subsystemOrphaned: Array<{ relationshipId: string; orphanedIds: string[] }>
        applicationOrphaned: Array<{ relationshipId: string; orphanedIds: string[] }>
    } {
        const compResult = ComponentService
            .create(this.classDomain, this.componentDomain)
            .deriveComponentRelationships()

        const subsysResult = ComponentService
            .create(compResult.classDomain, compResult.componentDomain)
            .deriveSubsystemRelationships()

        const appResult = ComponentService
            .create(subsysResult.classDomain, subsysResult.componentDomain)
            .deriveApplicationRelationships()

        return {
            classDomain: appResult.classDomain,
            componentDomain: appResult.componentDomain,
            derived: [...compResult.derived, ...subsysResult.derived, ...appResult.derived],
            orphaned: compResult.orphaned,
            subsystemOrphaned: subsysResult.orphaned,
            applicationOrphaned: appResult.orphaned,
        }
    }

    // ----------------------------------------------------------
    // コンポーネント削除（クラスのcomponentIdsも整合させる）
    // ----------------------------------------------------------

    /**
     * コンポーネントを削除し、アサインされていたクラスの
     * componentIds からも該当IDを除去する。
     */
    removeComponent(componentId: string): ComponentServiceResult {
        const comp = this.componentDomain.getComponent(componentId)
        if (!comp) throw new DomainError(`Component not found: ${componentId}`)

        // アサインされているクラスの componentIds をクリーンアップ
        let nextClassDomain = this.classDomain
        for (const classId of comp.classIds) {
            const classInfo = nextClassDomain.findClassById(classId)
            if (!classInfo) continue
            nextClassDomain = nextClassDomain.updateClass(classId, () => ({
                ...classInfo,
                componentIds: (classInfo.componentIds ?? []).filter(id => id !== componentId),
            }))
        }

        const nextComponentDomain = this.componentDomain.removeComponent(componentId)

        return { classDomain: nextClassDomain, componentDomain: nextComponentDomain }
    }

    // ----------------------------------------------------------
    // クエリ（読み取り専用）
    // ----------------------------------------------------------

    /**
     * 指定コンポーネントに属するクラスの ClassInfo 一覧を取得する。
     */
    getClassesInComponent(componentId: string): ClassInfo[] {
        const comp = this.componentDomain.getComponent(componentId)
        if (!comp) return []
        return comp.classIds
            .map(id => this.classDomain.findClassById(id))
            .filter((c): c is ClassInfo => c !== undefined)
    }

    /**
     * 指定クラスが所属するコンポーネント名の一覧を取得する。
     * クラス図エディタ上での「所属コンポーネント表示」に使用。
     */
    getComponentNamesForClass(classId: string): string[] {
        return this.componentDomain
            .getComponentsForClass(classId)
            .map(c => c.name)
    }

    /**
     * まだどのコンポーネントにもアサインされていないクラス一覧を返す。
     * コンポーネント図エディタでのアサイン候補表示に使用。
     */
    getUnassignedClasses(): ClassInfo[] {
        return this.classDomain.getClasses().filter(cls => {
            const componentIds = cls.componentIds ?? []
            return componentIds.length === 0
        })
    }

    /**
     * 指定 kind のコンポーネントに紐づくクラス数のサマリを返す。
     * 「コンポーネントの規模感」の把握に使用。
     */
    getComponentStats(kind: ComponentKind): Array<{
        componentId: string
        componentName: string
        classCount: number
    }> {
        return this.componentDomain.getByKind(kind).map(comp => ({
            componentId: comp.id,
            componentName: comp.name,
            classCount: comp.classIds.length,
        }))
    }

    // ----------------------------------------------------------
    // 複数DSL統合
    // ----------------------------------------------------------

    /**
     * 複数 DSL ファイルの内容を統合解析し、コンポーネントへの
     * クラス自動アサインと依存関係の連鎖導出を行う。
     *
     * DslIntegrator に委譲する便利メソッド。
     *
     * @param dslContents DSLファイルの dslPath → テキスト内容の配列
     * @returns 統合結果（新しいドメインモデルペア + 依存関係 + メタ情報）
     */
    integrateMultipleDsl(
        dslContents: Array<{ dslPath: string; content: string }>
    ): import('./DslIntegrator').IntegrationResult {
        // 遅延 import で循環依存を回避
        const { DslIntegrator } = require('./DslIntegrator') as typeof import('./DslIntegrator')
        return DslIntegrator.integrate(this.componentDomain, dslContents)
    }
}