/**
 * domain-model-unified.ts
 *
 * ============================================================
 * 🎯 目的
 * ------------------------------------------------------------
 * - class-diagram-types.ts の型定義をベースとしたドメインモデル
 * - DDD Aggregate Root パターンの適用
 * - UI (React) からドメイン状態を分離
 * - 将来的な拡張に備えた設計
 *
 * ============================================================
 * 🧠 設計方針
 * ------------------------------------------------------------
 * 1. ClassInfo をベースとした実装
 * 2. イミュータブルな公開API
 * 3. 内部状態は可変(パフォーマンス重視)
 * 4. ドメインルールの厳格な適用
 * 5. React依存を持たない
 *
 * ============================================================
 */

import {
    ClassInfo,
    ClassMember,
    ClassOperation,
    OperationParameter,
    ClassKind,
    Visibility,
    RelationshipType,
    MemberRelationshipType,
    Relationship,
    ParsedEndpoint,
    createId,
    visibilitySymbol,
} from './class-diagram-types'

export interface DomainEvent {
    readonly type: string
    readonly payload: any
}

export abstract class BaseDomainEvent implements DomainEvent {

    readonly occurredAt: Date

    constructor() {
        this.occurredAt = new Date()
    }

    abstract readonly type: string
    abstract readonly payload: any
}


// ============================================================
// Layout helper
// ============================================================
const CELL_W = 220
const CELL_H = 160
const GRID_COLS = 5
const GRID_OX = 80
const GRID_OY = 80

export function findFreePosition(existing: { x: number; y: number }[]): { x: number; y: number } {
    for (let row = 0; row < 1000; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            const cx = GRID_OX + col * CELL_W
            const cy = GRID_OY + row * CELL_H
            const hit = existing.some(c =>
                Math.abs(c.x - cx) < CELL_W && Math.abs(c.y - cy) < CELL_H
            )
            if (!hit) return { x: cx, y: cy }
        }
    }
    return { x: GRID_OX, y: GRID_OY + existing.length * CELL_H }
}

/* ============================
   Domain Errors
============================ */

export class DomainError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'DomainError'
    }
}

export class DomainRuleViolation extends DomainError {
    constructor(message: string) {
        super(message)
        this.name = 'DomainRuleViolation'
    }
}

export class DomainValidationError extends DomainError {
    constructor(public readonly errors: string[]) {
        super(`Domain validation failed: ${errors.join(', ')}`)
        this.name = 'DomainValidationError'
    }
}

/* ============================
   Validation Result
============================ */

export interface ValidationResult {
    isValid: boolean
    errors: string[]
    warnings?: string[]
}

/* ============================
   Snapshot Types
============================ */

export interface DomainSnapshot {
    classes: ClassInfo[]
    timestamp: number
    version: string
}

/* ============================
   Aggregate Root
============================ */

export class DomainModel {

    /* ----------------------------
       Factory Methods
    ---------------------------- */

    /**
     * 空のモデルを作成
     */
    static createEmpty(): DomainModel {
        return new DomainModel(new Map())
    }

    /**
     * ClassInfo配列から作成
     */
    static from(classes: ClassInfo[]): DomainModel {
        const map = new Map<string, ClassInfo>()
        for (const cls of classes) {
            map.set(cls.id, cls)
        }
        return new DomainModel(map)
    }

    /**
     * スナップショットから復元
     */
    static fromSnapshot(snapshot: DomainSnapshot): DomainModel {
        return DomainModel.from(snapshot.classes)
    }

    /* ----------------------------
       Internal State
    ---------------------------- */

    private constructor(
        private readonly classMap: Map<string, ClassInfo>,
        private readonly workflowMap: Map<string, any> = new Map(),
        private readonly workflowAstMap: Map<string, any> = new Map()
    ) { }

    /* ----------------------------
       Core Operations
    ---------------------------- */

    /**
     * 完全なクローンを作成
     */
    clone(): DomainModel {
        return DomainModel.from(this.getClasses())
    }

    /**
     * 等価性チェック
     */
    equals(other: DomainModel): boolean {
        if (this === other) return true
        if (this.classMap.size !== other.classMap.size) return false

        for (const [id, cls] of this.classMap) {
            const otherCls = other.classMap.get(id)
            if (!otherCls) return false
            if (JSON.stringify(cls) !== JSON.stringify(otherCls)) return false
        }

        return true
    }

    /**
     * スナップショット生成
     */
    toSnapshot(): DomainSnapshot {
        return {
            classes: this.getClasses(),
            timestamp: Date.now(),
            version: '1.0'
        }
    }

    /**
     * JSON出力(デバッグ用)
     */
    toJSON(): ClassInfo[] {
        return this.getClasses()
    }

    /**
     * DSL文字列を取得
     * @param aliasMap alias宣言を含める場合に渡す（"日本語名" → "識別子名"）
     * @param endpoints エンドポイント定義を含める場合に渡す
     */
    toDSL(aliasMap?: Map<string, string>, endpoints?: ParsedEndpoint[]): string {
        const classes = this.getClasses();
        // generalization / realization は extends / implements として
        // クラスブロック内に出力するため、明示リレーションからは除外する
        const explicitRelTypes = new Set(["association", "aggregation", "composition", "dependency"]);
        const relationships = this
            .detectRelationships()
            .filter((r) => explicitRelTypes.has(r.type));

        const lines: string[] = [];

        lines.push("# generated by export-spec-dsl");
        lines.push(`# ${new Date().toLocaleString("ja-JP")}`);
        lines.push("");

        // ---- alias 宣言 ----
        if (aliasMap && aliasMap.size > 0) {
            for (const [alias, realName] of aliasMap.entries()) {
                lines.push(`alias "${alias}" as "${realName}"`);
            }
            lines.push("");
        }

        // ---- クラスブロック ----
        for (const cls of classes) {
            lines.push(...this.renderClassDsl(cls, this));
        }

        // ---- エンドポイントブロック ----
        if (endpoints && endpoints.length > 0) {
            lines.push("# Endpoints");
            lines.push("");
            for (const ep of endpoints) {
                lines.push(...this.renderEndpointDsl(ep));
            }
        }

        // ---- 明示リレーション ----
        if (relationships.length > 0) {
            lines.push("# Relations");
            lines.push("");
            for (const rel of relationships) {
                lines.push(this.renderRelationDsl(rel, this));
            }
            lines.push("");
        }

        return lines.join("\n");
    }


    renderClassDsl(cls: ClassInfo, model: DomainModel): string[] {
        const lines: string[] = [];

        // クラス宣言行
        const abstractPrefix = cls.isAbstract ? "abstract " : "";
        lines.push(`${abstractPrefix}${cls.kind} ${cls.name}`);

        // 継承（パーサがクラス宣言直後に期待するため先に出力）
        if (cls.baseClassId) {
            const base = model.findClassById(cls.baseClassId);
            if (base) {
                lines.push(`  extends ${base.name}`);
            }
        }

        // インターフェース実装
        if (cls.interfaces.length > 0) {
            const names = cls.interfaces
                .map((id) => model.findClassById(id)?.name ?? id)
                .join(", ");
            lines.push(`  implements ${names}`);
        }

        // メンバ（属性）
        for (const m of cls.members) {
            lines.push(`  ${this.renderMemberDsl(m)}`);
        }

        // 操作（メソッド）+ 各操作に紐づくシナリオ
        for (const op of cls.operations) {
            lines.push(`  ${this.renderOperationDsl(op)}`);

            // workflow が存在すればシナリオとして出力
            if (op.workflow && op.workflow.nodes.length > 0) {
                lines.push(...this.renderWorkflowDsl(op.workflow));
            }
        }

        lines.push("");
        return lines;
    }

    /**
     * ClassOperation の workflow（ノード・エッジ構造）を Gherkin DSL 形式に変換する。
     *
     * 復元ルール:
     *   - edge.condition != null のエッジを「シナリオ境界」として認識し
     *     "Scenario: <condition>" 行を出力する
     *   - src: アノテーションは edge.srcs から "src: label url" 形式で復元する
     *   - ノードの label は "<keyword>: <text>" 形式で格納されているため
     *     最初の ": " で分割して keyword と text を取り出す
     *   - start / end ノードはスキップする
     */
    renderWorkflowDsl(workflow: NonNullable<ClassOperation['workflow']>): string[] {
        const lines: string[] = [];
        const nodes = workflow.nodes ?? [];
        const edges = workflow.edges ?? [];

        if (nodes.length === 0) return lines;

        // id → node のマップ
        const nodeMap = new Map((nodes ?? []).map(n => [n.id, n]));

        // シナリオ開始エッジ（condition が設定されているエッジ）を x 座標でソートして
        // 複数シナリオを左→右の記述順で再現する
        let scenarioEdges = (edges ?? [])
            .filter(e => e && e.condition != null)
            .sort((a, b) => {
                const ax = nodeMap.get(a.to)?.x ?? 0;
                const bx = nodeMap.get(b.to)?.x ?? 0;
                return ax - bx;
            });

        // condition を持つエッジが1つもない（ASTから抽出されたなど）場合は、
        // startノードから出ているエッジをデフォルトのシナリオとして扱う
        if (scenarioEdges.length === 0) {
            const startNodeId = nodes.find(n => n.type === 'start')?.id;
            if (startNodeId) {
                scenarioEdges = (edges ?? [])
                    .filter(e => e.from === startNodeId)
                    .map(e => ({ ...e, condition: '振る舞い' }));
            }
        }

        for (const startEdge of scenarioEdges) {
            // ── Scenario ヘッダ行 ──
            const srcAnnotation = startEdge.srcs && startEdge.srcs.length > 0
                ? ' ' + startEdge.srcs.map((s: { label: string; url: string }) => `src: ${s.label} ${s.url}`).join(' ')
                : '';
            lines.push(`    Scenario: ${startEdge.condition}${srcAnnotation}`);

            // ── ステップを順番にたどる ──
            // startEdge.to から始まり end ノードまで edges を辿る
            let currentId: string | null = startEdge.to;
            const visited = new Set<string>();

            while (currentId) {
                if (visited.has(currentId)) break;
                visited.add(currentId);

                const node = nodeMap.get(currentId);
                if (!node || node.type === 'start' || node.type === 'end') break;

                // node.typeからキーワードを復元、fallbackとしてlabelから分離
                const TYPE_TO_KEYWORD: Record<string, string> = {
                    given: '前提', when: 'もし', then: 'ならば', how: 'How',
                    process: 'かつ', decision: 'かつ', loop: 'かつ', call: 'かつ',
                };
                const keywordFromType = TYPE_TO_KEYWORD[node.type];
                let keyword: string;
                let text: string;

                if (keywordFromType !== undefined) {
                    // typeベースで復元（ラベルにプレフィックスがあれば除去）
                    keyword = keywordFromType;
                    // 'ならば: (戻す)' や '処理: ' などをそのまま残しても parse 側は構わないが、
                    // keyword に吸収するものは削除しておく
                    text = node.label.replace(/^(Given|When|Then|How|And|But|前提|もし|ならば|かつ|しかし):\s*/i, '');
                    // コロン始まりの余分なprefixを除去除く (例: 'ならば: (戻す) ' -> '(戻す)')
                    if (text.startsWith(node.label.split(':')[0] + ': ')) {
                        text = text.split(':').slice(1).join(':').trim();
                    }
                } else {
                    // フォールバック: label の "keyword: text" 形式
                    const colonIdx = node.label.indexOf(': ');
                    if (colonIdx !== -1) {
                        keyword = node.label.slice(0, colonIdx);
                        text = node.label.slice(colonIdx + 2);
                    } else {
                        keyword = '';
                        text = node.label;
                    }
                }

                if (keyword) {
                    lines.push(`      ${keyword} ${text}`);
                } else {
                    lines.push(`      ${text}`);
                }

                // Howステップ（実装順指針）を出力
                const howSteps = node.metadata?.howSteps;
                if (howSteps && howSteps.length > 0) {
                    lines.push(`      How`);
                    for (const s of howSteps) {
                        lines.push(`        "${s}"`);
                    }
                }

                // Whyステップ（設計意図）を出力
                const whyReason = node.metadata?.whyReason;
                if (whyReason) {
                    lines.push(`      Why ${whyReason}`);
                }

                // 次のノードへ（シナリオ開始エッジ以外の edge.from === currentId を辿る）
                const nextEdge = edges.find(e =>
                    e.from === currentId &&
                    e.condition == null   // シナリオ境界エッジはスキップ
                );
                currentId = nextEdge ? nextEdge.to : null;
            }
        }

        return lines;
    }

    renderMemberDsl(m: ClassMember): string {
        const vis = visibilitySymbol(m.visibility);
        const modifier = m.isStatic ? "s " : m.isAbstract ? "a " : "";
        const base = `${vis} ${modifier}${m.name}: ${m.type}`;
        if (!m.needs) return base;
        const ownerToken = m.needs.isOwner ? " owner" : "";
        const reasonToken = m.needs.reason ? ` "${m.needs.reason}"` : "";
        return `${base}\n    needs${ownerToken}${reasonToken}`;
    }

    renderEndpointDsl(ep: ParsedEndpoint): string[] {
        const lines: string[] = [];
        lines.push(`endpoint ${ep.method} ${ep.path}`);
        if (ep.needs) {
            lines.push(`  needs ${ep.needs.target}`);
            if (ep.needs.reason) {
                lines.push(`    "${ep.needs.reason}"`);
            }
        }
        for (const scenario of ep.scenarios) {
            lines.push(`  Scenario: ${scenario.name}`);
            for (const step of scenario.steps) {
                if (step.keyword === 'How') {
                    lines.push(`    How`);
                    for (const s of step.howSteps ?? []) {
                        lines.push(`      "${s}"`);
                    }
                } else {
                    lines.push(`    ${step.keyword} ${step.text}`);
                }
            }
        }
        lines.push("");
        return lines;
    }
    renderOperationDsl(op: ClassOperation): string {
        const vis = visibilitySymbol(op.visibility);
        const modifier = op.isStatic ? "s " : op.isAbstract ? "a " : "";
        const params = op.parameters
            .map((p) => `${p.name}: ${p.type}`)
            .join(", ");
        return `${vis} ${modifier}${op.name}(${params}): ${op.returnType}`;
    }
    renderRelationDsl(rel: Relationship, model: DomainModel): string {
        const src = model.findClassById(rel.sourceId)?.name ?? rel.sourceId;
        const tgt = model.findClassById(rel.targetId)?.name ?? rel.targetId;

        const symbolMap: Record<string, string> = {
            association: "->",
            aggregation: "+>",
            composition: "*>",
            dependency: "-/>",
        };
        const symbol = symbolMap[rel.type] ?? "->";

        // ラベル・多重度があれば付加
        const label = rel.label ? ` :${rel.label}` : "";
        const multiplicity =
            rel.sourceMultiplicity || rel.targetMultiplicity
                ? ` ${rel.sourceMultiplicity ?? "1"} ${rel.targetMultiplicity ?? "1"}`
                : "";

        return `${src} ${symbol} ${tgt}${label}${multiplicity}`;
    }
    /* ============================
       Query Methods (読み取り専用)
    ============================ */

    /**
     * 全クラスを取得(コピーを返す)
     */
    getClasses(): ClassInfo[] {
        return Array.from(this.classMap.values()).map(cls => this.deepCopyClass(cls))
    }

    /**
     * クラス数を取得
     */
    getClassCount(): number {
        return this.classMap.size
    }

    /**
     * モデルが空かどうか
     */
    isEmpty(): boolean {
        return this.classMap.size === 0
    }

    /**
     * IDでクラスを検索
     */
    findClassById(id: string): ClassInfo | undefined {
        const cls = this.classMap.get(id)
        return cls ? this.deepCopyClass(cls) : undefined
    }

    /**
     * 名前でクラスを検索
     */
    findClassByName(name: string): ClassInfo | undefined {
        for (const cls of this.classMap.values()) {
            if (cls.name === name) {
                return this.deepCopyClass(cls)
            }
        }
        return undefined
    }

    /**
     * 複数のクラスをIDで取得
     */
    findClassesByIds(ids: string[]): ClassInfo[] {
        return ids
            .map(id => this.findClassById(id))
            .filter((cls): cls is ClassInfo => cls !== undefined)
    }

    /**
     * クラスが存在するか確認
     */
    hasClass(id: string): boolean {
        return this.classMap.has(id)
    }

    /**
     * クラス名が使用可能か確認
     */
    isClassNameAvailable(name: string, excludeId?: string): boolean {
        for (const cls of this.classMap.values()) {
            if (cls.name === name && cls.id !== excludeId) {
                return false
            }
        }
        return true
    }

    /**
     * 指定した kind のクラスのみ取得
     */
    getClassesByKind(kind: ClassKind): ClassInfo[] {
        return Array.from(this.classMap.values())
            .filter(cls => cls.kind === kind)
            .map(cls => this.deepCopyClass(cls))
    }

    /**
     * 統計情報を取得
     */
    getStats() {
        let totalMembers = 0
        let totalOperations = 0
        const kindCounts: Record<ClassKind, number> = {
            class: 0,
            interface: 0,
            struct: 0
        }

        for (const cls of this.classMap.values()) {
            kindCounts[cls.kind]++
            totalMembers += cls.members.length
            totalOperations += cls.operations.length
        }

        return {
            totalClasses: this.classMap.size,
            classCount: kindCounts.class,
            interfaceCount: kindCounts.interface,
            structCount: kindCounts.struct,
            totalMembers,
            totalOperations,
        }
    }

    /* ============================
       Command Methods (状態変更)
    ============================ */
    /**
       * クラスを登録（簡易版）
       * 最小限の情報でクラスを作成します
       * 
       * @param id - クラスID（指定しない場合は自動生成）
       * @param name - クラス名
       * @param kind - クラスの種別
       */
    registerClass(name: string, kind: ClassKind, id?: string): DomainModel {
        if (!this.isClassNameAvailable(name)) {
            throw new DomainRuleViolation(`Class name "${name}" already exists`)
        }

        const classId = id || createId()

        const pos = findFreePosition(Array.from(this.classMap.values()))

        const newClass: ClassInfo = {
            id: classId,
            name,
            kind,
            isAbstract: false,
            members: [],
            operations: [],
            interfaces: [],
            baseClassId: null,
            x: pos.x,
            y: pos.y,
            componentIds: [],
        }

        const newMap = new Map(this.classMap)
        newMap.set(classId, newClass)
        return new DomainModel(newMap)
    }

    /**
     * クラスを追加
     * 完全に構成されたClassInfoオブジェクトを追加します
     */
    addClass(classInfo: ClassInfo): DomainModel {
        if (this.classMap.has(classInfo.id)) {
            throw new DomainRuleViolation(`Class with id ${classInfo.id} already exists`)
        }

        if (!this.isClassNameAvailable(classInfo.name)) {
            throw new DomainRuleViolation(`Class name "${classInfo.name}" already exists`)
        }

        const newMap = new Map(this.classMap)
        newMap.set(classInfo.id, this.deepCopyClass(classInfo))
        return new DomainModel(newMap)
    }


    /**
     * クラスを削除
     */
    removeClass(classId: string): DomainModel {
        if (!this.classMap.has(classId)) {
            throw new DomainRuleViolation(`Class with id ${classId} not found`)
        }

        const newMap = new Map(this.classMap)
        newMap.delete(classId)

        // 継承・実装関係のクリーンアップ
        for (const [id, cls] of newMap) {
            let modified = false
            const newCls = { ...cls }

            // 基底クラスの参照を削除
            if (newCls.baseClassId === classId) {
                newCls.baseClassId = null
                modified = true
            }

            // インターフェース実装の参照を削除
            if (newCls.interfaces.includes(classId)) {
                newCls.interfaces = newCls.interfaces.filter(i => i !== classId)
                modified = true
            }

            if (modified) {
                newMap.set(id, newCls)
            }
        }

        return new DomainModel(newMap)
    }

    /**
     * 名前でクラスを削除
     */
    removeClassByName(className: string): DomainModel {
        const cls = this.findClassByName(className)
        if (!cls) {
            throw new DomainRuleViolation(`Class "${className}" not found`)
        }
        return this.removeClass(cls.id)
    }

    /**
     * クラスを更新
     */
    updateClass(classId: string, updater: (c: ClassInfo) => ClassInfo): DomainModel {
        const cls = this.classMap.get(classId)
        if (!cls) {
            throw new DomainRuleViolation(`Class with id ${classId} not found`)
        }

        const updated = updater(this.deepCopyClass(cls))

        // 名前の重複チェック
        if (updated.name !== cls.name && !this.isClassNameAvailable(updated.name, classId)) {
            throw new DomainRuleViolation(`Class name "${updated.name}" already exists`)
        }

        const newMap = new Map(this.classMap)
        newMap.set(classId, updated)
        return new DomainModel(newMap)
    }

    /**
     * 名前でクラスを更新
     */
    updateClassByName(className: string, updater: (c: ClassInfo) => ClassInfo): DomainModel {
        const cls = this.findClassByName(className)
        if (!cls) {
            throw new DomainRuleViolation(`Class "${className}" not found`)
        }
        return this.updateClass(cls.id, updater)
    }

    /**
     * クラス名を変更
     */
    renameClass(oldClassName: string, newName: string): DomainModel {
        return this.updateClassByName(oldClassName, cls => ({ ...cls, name: newName }))
    }



    /**
     * 複数クラスを一度に置き換え
     */
    replaceClasses(newClasses: ClassInfo[]): DomainModel {
        return DomainModel.from(newClasses)
    }


    /**
    * メンバー（属性）の可視性を変更
    */
    changeMemberVisibility(
        className: string,
        memberName: string,
        visibility: Visibility
    ): DomainModel {
        return this.updateMember(className, memberName, m => ({
            ...m,
            visibility,
        }))
    }

    /**
     * メンバー（属性）のモディファイアを変更
     * modifier: 's' = static, 'a' = abstract, null = none
     */
    changeMemberModifier(
        className: string,
        memberName: string,
        modifier: 'static' | 'abstract' | null
    ): DomainModel {
        return this.updateMember(className, memberName, m => ({
            ...m,
            isStatic: modifier === 'static',
            isAbstract: modifier === 'abstract',
        }))
    }

    /**
     * オペレーション（メソッド）の可視性を変更
     */
    changeOperationVisibility(
        className: string,
        operationName: string,
        visibility: Visibility
    ): DomainModel {
        return this.updateOperation(className, operationName, op => ({
            ...op,
            visibility,
        }))
    }

    /**
     * オペレーション（メソッド）のモディファイアを変更
     * modifier: 's' = static, 'a' = abstract, 'v' = virtual, null = none
     */
    changeOperationModifier(
        className: string,
        operationName: string,
        modifier: 'static' | 'abstract' | 'virtual' | null
    ): DomainModel {
        return this.updateOperation(className, operationName, op => ({
            ...op,
            isStatic: modifier === 'static',
            isAbstract: modifier === 'abstract',
            isVirtual: modifier === 'virtual',
        }))
    }

    /* ============================
       Inheritance Management
    ============================ */

    /**
     * 基底クラスを設定
     */
    setBaseClass(classId: string, parentId: string | null): DomainModel {
        if (parentId !== null) {
            if (!this.classMap.has(parentId)) {
                throw new DomainRuleViolation(`Parent class with id ${parentId} not found`)
            }

            if (classId === parentId) {
                throw new DomainRuleViolation('Cannot inherit from itself')
            }
        }

        return this.updateClass(classId, cls => {
            const updated = { ...cls, baseClassId: parentId }

            // 循環継承チェック
            if (parentId !== null && this.wouldCreateCircularInheritance(updated)) {
                throw new DomainRuleViolation('Circular inheritance detected')
            }

            return updated
        })
    }

    /**
     * インターフェース実装を追加
     */
    addInterfaceImplementation(classId: string, interfaceId: string): DomainModel {
        const targetInterface = this.classMap.get(interfaceId)
        if (!targetInterface) {
            throw new DomainRuleViolation(`Interface with id ${interfaceId} not found`)
        }

        if (targetInterface.kind !== 'interface') {
            throw new DomainRuleViolation('Target is not an interface')
        }

        return this.updateClass(classId, cls => {
            if (cls.interfaces.includes(interfaceId)) {
                return cls // 既に実装済み
            }
            return {
                ...cls,
                interfaces: [...cls.interfaces, interfaceId]
            }
        })
    }

    /**
     * インターフェース実装を削除
     */
    removeInterfaceImplementation(classId: string, interfaceId: string): DomainModel {
        return this.updateClass(classId, cls => ({
            ...cls,
            interfaces: cls.interfaces.filter(i => i !== interfaceId)
        }))
    }

    /* ============================
       Member Management
    ============================ */

    /**
     * メンバーを追加
     */
    addMember(className: string, member: ClassMember): DomainModel {
        const targetClass = this.findClassByName(className)
        if (!targetClass) {
            throw new DomainRuleViolation(`Class with name ${className} not found`)
        }
        return this.updateClass(targetClass.id, cls => {
            if (cls.members.some(m => m.name === member.name)) {
                throw new DomainRuleViolation(`Member "${member.name}" already exists`)
            }
            return {
                ...cls,
                members: [...cls.members, { ...member }]
            }
        })
    }

    /**
     * メンバーを削除
     */
    removeMember(className: string, memberName: string): DomainModel {
        const targetClass = this.findClassByName(className)
        if (!targetClass) {
            throw new DomainRuleViolation(`Class with name ${className} not found`)
        }
        const memberId = targetClass.members.find(m => m.name === memberName)?.id
        if (!memberId) {
            throw new DomainRuleViolation(`Member with name ${memberName} not found in class ${className}`)
        }
        return this.updateClass(targetClass.id, cls => ({
            ...cls,
            members: cls.members.filter(m => m.id !== memberId)
        }))
    }

    /**
     * メンバーを更新
     */
    updateMember(
        className: string,
        memberName: string,
        updater: (m: ClassMember) => ClassMember
    ): DomainModel {
        const targetClass = this.findClassByName(className)
        if (!targetClass) {
            throw new DomainRuleViolation(`Class with name ${className} not found`)
        }
        const targetMember = targetClass.members.find(m => m.name === memberName)
        if (!targetMember) {
            throw new DomainRuleViolation(`Member with name ${memberName} not found in class ${className}`)
        }
        return this.updateClassByName(className, cls => {
            const member = cls.members.find(m => m.id === targetMember.id)
            if (!member) {
                throw new DomainRuleViolation(`Member with id ${targetMember.id} not found`)
            }

            const updated = updater({ ...member })

            // 名前の重複チェック
            if (updated.name !== member.name &&
                cls.members.some(m => m.id !== targetMember.id && m.name === updated.name)) {
                throw new DomainRuleViolation(`Member name "${updated.name}" already exists`)
            }

            return {
                ...cls,
                members: cls.members.map(m => m.id === targetMember.id ? updated : m)
            }
        })
    }

    /* ============================
       Operation Management
    ============================ */

    /**
     * 操作を追加
     */
    addOperation(className: string, operation: ClassOperation): DomainModel {
        const targetClass = this.findClassByName(className)
        if (!targetClass) {
            throw new DomainRuleViolation(`Class with name ${className} not found`)
        }
        return this.updateClass(targetClass.id, cls => {
            if (cls.operations.some(op => op.name === operation.name)) {
                throw new DomainRuleViolation(`Operation "${operation.name}" already exists`)
            }
            return {
                ...cls,
                operations: [...cls.operations, { ...operation, parameters: [...operation.parameters] }]
            }
        })
    }

    /**
     * 操作を削除
     */
    removeOperation(className: string, operationName: string): DomainModel {
        const targetClass = this.findClassByName(className)
        if (!targetClass) {
            throw new DomainRuleViolation(`Class with name ${className} not found`)
        }
        const operationId = targetClass.operations.find(op => op.name === operationName)?.id
        if (!operationId) {
            throw new DomainRuleViolation(`Operation with name ${operationName} not found in class ${className}`)
        }
        return this.updateClass(targetClass.id, cls => ({
            ...cls,
            operations: cls.operations.filter(op => op.id !== operationId)
        }))
    }

    /**
     * 操作を更新
     */
    updateOperation(
        className: string,
        operationName: string,
        updater: (op: ClassOperation) => ClassOperation
    ): DomainModel {
        const targetClass = this.findClassByName(className)
        if (!targetClass) {
            throw new DomainRuleViolation(`Class with name ${className} not found`)
        }
        const targetOperation = targetClass.operations.find(op => op.name === operationName)
        if (!targetOperation) {
            throw new DomainRuleViolation(`Operation with name ${operationName} not found in class ${className}`)
        }
        return this.updateClass(targetClass.id, cls => {
            const operation = cls.operations.find(op => op.id === targetOperation.id)
            if (!operation) {
                throw new DomainRuleViolation(`Operation with id ${targetOperation.id} not found`)
            }

            const updated = updater({
                ...operation,
                parameters: [...operation.parameters]
            })

            // 名前の重複チェック
            if (updated.name !== operation.name &&
                cls.operations.some(op => op.id !== targetOperation.id && op.name === updated.name)) {
                throw new DomainRuleViolation(`Operation name "${updated.name}" already exists`)
            }

            return {
                ...cls,
                operations: cls.operations.map(op => op.id === targetOperation.id ? updated : op)
            }
        })
    }

    /**
     * オペレーションのワークフローデータを更新する。
     *
     * WorkflowEditorPanel が「Save Workflow」したときに ClassDiagramService 経由で呼ばれる。
     * classId と operationId で対象を一意に特定し、workflow / workflowAst を書き込む。
     *
     * @param classId     対象クラスのID
     * @param operationId 対象オペレーションのID
     * @param workflow    ワークフロー図のノード/エッジ構造
     * @param workflowAst workflow から生成された抽象構文木（省略可）
     */
    updateOperationWorkflow(
        classId: string,
        operationId: string,
        workflow: ClassOperation['workflow'],
        workflowAst?: ClassOperation['workflowAst'],
    ): DomainModel {
        const cls = this.classMap.get(classId)
        if (!cls) {
            throw new DomainRuleViolation(`Class with id "${classId}" not found`)
        }
        const op = cls.operations.find(o => o.id === operationId)
        if (!op) {
            throw new DomainRuleViolation(
                `Operation with id "${operationId}" not found in class "${cls.name}"`
            )
        }

        return this.updateClass(classId, c => ({
            ...c,
            operations: c.operations.map(o =>
                o.id === operationId
                    ? {
                        ...o,
                        workflow: workflow ? JSON.parse(JSON.stringify(workflow)) : undefined,
                        workflowAst: workflowAst ? JSON.parse(JSON.stringify(workflowAst)) : undefined,
                    }
                    : o
            ),
        }))
    }

    // ワークフローの更新
    updateWorkflow(opId: string, workflow: any, ast: any): DomainModel {
        const newWorkflowMap = new Map(this.workflowMap);
        const newAstMap = new Map(this.workflowAstMap);

        newWorkflowMap.set(opId, workflow);
        newAstMap.set(opId, ast);

        return new DomainModel(this.classMap, newWorkflowMap, newAstMap);
    }

    // 取得用メソッド
    getWorkflow(opId: string): any {
        return this.workflowMap.get(opId);
    }

    /**
     * パラメータを追加
     */
    addParameter(
        className: string,
        operationName: string,
        parameter: OperationParameter
    ): DomainModel {
        const targetClass = this.findClassByName(className)
        if (!targetClass) {
            throw new DomainRuleViolation(`Class with name ${className} not found`)
        }
        const targetOperation = targetClass.operations.find(op => op.name === operationName)
        if (!targetOperation) {
            throw new DomainRuleViolation(`Operation with name ${operationName} not found in class ${className}`)
        }
        return this.updateOperation(targetClass.name, targetOperation.name, op => {
            if (op.parameters.some(p => p.name === parameter.name)) {
                throw new DomainRuleViolation(`Parameter "${parameter.name}" already exists`)
            }
            return {
                ...op,
                parameters: [...op.parameters, { ...parameter }]
            }
        })
    }

    /**
     * パラメータを削除
     */
    removeParameter(
        classId: string,
        operationId: string,
        parameterId: string
    ): DomainModel {
        return this.updateOperation(classId, operationId, op => ({
            ...op,
            parameters: op.parameters.filter(p => p.id !== parameterId)
        }))
    }

    /* ============================
       Validation
    ============================ */

    /**
     * ドメインルールの検証
     */
    validate(): ValidationResult {
        const errors: string[] = []
        const warnings: string[] = []

        // 名前の重複チェック
        const names = new Map<string, string[]>()
        for (const cls of this.classMap.values()) {
            if (!names.has(cls.name)) {
                names.set(cls.name, [])
            }
            names.get(cls.name)!.push(cls.id)
        }

        for (const [name, ids] of names) {
            if (ids.length > 1) {
                errors.push(`Duplicate class name "${name}" found in ${ids.length} classes`)
            }
        }

        // 循環継承チェック
        if (this.hasCircularInheritance()) {
            errors.push('Circular inheritance detected in the model')
        }

        // 存在しないクラスへの参照チェック
        for (const cls of this.classMap.values()) {
            // 基底クラス
            if (cls.baseClassId && !this.classMap.has(cls.baseClassId)) {
                errors.push(`Class "${cls.name}" references non-existent base class id: ${cls.baseClassId}`)
            }

            // インターフェース
            for (const interfaceId of cls.interfaces) {
                if (!this.classMap.has(interfaceId)) {
                    errors.push(`Class "${cls.name}" references non-existent interface id: ${interfaceId}`)
                } else {
                    const targetClass = this.classMap.get(interfaceId)!
                    if (targetClass.kind !== 'interface') {
                        errors.push(`Class "${cls.name}" tries to implement "${targetClass.name}" which is not an interface`)
                    }
                }
            }

            // メンバの型参照警告
            for (const member of cls.members) {
                const baseType = this.extractBaseTypeName(member.type)
                if (baseType && !this.isPrimitiveType(baseType) && !this.findClassByName(baseType)) {
                    warnings.push(`Class "${cls.name}" member "${member.name}" references unknown type "${baseType}"`)
                }
            }

            // 操作の型参照警告
            for (const operation of cls.operations) {
                const returnType = this.extractBaseTypeName(operation.returnType)
                if (returnType && returnType !== 'void' && !this.isPrimitiveType(returnType) && !this.findClassByName(returnType)) {
                    warnings.push(`Class "${cls.name}" operation "${operation.name}" returns unknown type "${returnType}"`)
                }

                // ワークフローの警告
                if (operation.workflow) {
                    const ow = operation.workflow;
                    const context = `Class "${cls.name}" operation "${operation.name}" workflow`;

                    // 1. ノードIDの重複チェック
                    const nodeIds = new Set<string>();
                    for (const node of ow.nodes) {
                        if (nodeIds.has(node.id)) {
                            errors.push(`${context}: Duplicate node id found: "${node.id}"`);
                        }
                        nodeIds.add(node.id);
                    }

                    // 2. エッジの参照整合性チェック
                    for (const edge of ow.edges) {
                        if (!nodeIds.has(edge.from)) {
                            errors.push(`${context}: Edge references non-existent source node id: "${edge.from}"`);
                        }
                        if (!nodeIds.has(edge.to)) {
                            errors.push(`${context}: Edge references non-existent target node id: "${edge.to}"`);
                        }
                    }

                    // 3. 開始ノード・終了ノードの存在チェック
                    // 「どこからも入ってこないノード」を開始候補とする
                    const startNodes = ow.nodes.filter((n) => ow.edges.every((e) => e.to !== n.id));
                    if (ow.nodes.length > 0 && startNodes.length === 0) {
                        errors.push(`${context}: Has no start node (entry point)`);
                    } else if (startNodes.length > 1) {
                        // 任意：開始地点が複数ある場合に警告を出す場合
                        warnings.push(`${context}: Has multiple start nodes`);
                    }

                    // 「どこにも出ていかないノード」を終了候補とする
                    const endNodes = ow.nodes.filter((n) => ow.edges.every((e) => e.from !== n.id));
                    if (ow.nodes.length > 0 && endNodes.length === 0) {
                        errors.push(`${context}: Has no end node (terminal point)`);
                    }

                    // 4. 孤立ノードの警告
                    for (const node of ow.nodes) {
                        const isConnected = ow.edges.some(e => e.from === node.id || e.to === node.id);
                        if (!isConnected && ow.nodes.length > 1) {
                            warnings.push(`${context}: Isolated node found: "${node.label}" (id: ${node.id})`);
                        }
                    }

                    // --- 5. 循環参照（ループ）チェック ---
                    const hasCycle = (): string[] | null => {
                        const visited = new Set<string>(); // 完全に探索が終わったノード
                        const recStack = new Set<string>(); // 現在の探索パス上のノード

                        const dfs = (nodeId: string, path: string[]): string[] | null => {
                            visited.add(nodeId);
                            recStack.add(nodeId);
                            path.push(nodeId);

                            // このノードから出ているエッジを特定
                            const outEdges = ow.edges.filter(e => e.from === nodeId);
                            for (const edge of outEdges) {
                                if (!visited.has(edge.to)) {
                                    const cycle = dfs(edge.to, [...path]);
                                    if (cycle) return cycle;
                                } else if (recStack.has(edge.to)) {
                                    // 探索中のパスに戻ってきた ＝ 循環発見
                                    return [...path, edge.to];
                                }
                            }

                            recStack.delete(nodeId);
                            return null;
                        };

                        // すべてのノードを起点にチェック（孤立したループも検知するため）
                        for (const node of ow.nodes) {
                            if (!visited.has(node.id)) {
                                const cyclePath = dfs(node.id, []);
                                if (cyclePath) return cyclePath;
                            }
                        }
                        return null;
                    };

                    const cycle = hasCycle();
                    if (cycle) {
                        // 循環経路をラベルで表示して分かりやすくする
                        const pathLabels = cycle.map(id => ow.nodes.find(n => n.id === id)?.label || id).join(' -> ');
                        errors.push(`${context}: Circular path detected: ${pathLabels}`);
                    }
                }

                // パラメータの型参照警告
                for (const param of operation.parameters) {
                    const paramType = this.extractBaseTypeName(param.type)
                    if (paramType && !this.isPrimitiveType(paramType) && !this.findClassByName(paramType)) {
                        warnings.push(`Class "${cls.name}" operation "${operation.name}" parameter "${param.name}" references unknown type "${paramType}"`)
                    }
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        }
    }

    /**
     * 検証を実行し、エラーがあれば例外をスロー
     */
    assertValid(): void {
        const result = this.validate()
        if (!result.isValid) {
            throw new DomainValidationError(result.errors)
        }
    }

    /* ============================
       Relationship Detection
    ============================ */

    /**
     * 自動リレーションシップ検出
     */
    detectRelationships(): Relationship[] {
        const relationships: Relationship[] = []
        const relationshipSet = new Set<string>()
        const stableRelationshipId = (
            type: string,
            sourceId: string,
            targetId: string,
            label?: string,
            sourceMemberId?: string,
            sourceMultiplicity?: string,
            targetMultiplicity?: string,
        ): string => {
            return [
                'rel',
                type,
                sourceId,
                targetId,
                sourceMemberId ?? '',
                label ?? '',
                sourceMultiplicity ?? '',
                targetMultiplicity ?? '',
            ].join(':')
        }

        for (const cls of this.classMap.values()) {
            // 継承関係
            if (cls.baseClassId) {
                const key = `generalization:${cls.id}:${cls.baseClassId}`
                if (!relationshipSet.has(key)) {
                    relationships.push({
                        id: stableRelationshipId('generalization', cls.id, cls.baseClassId),
                        type: 'generalization',
                        sourceId: cls.id,
                        targetId: cls.baseClassId,
                    })
                    relationshipSet.add(key)
                }
            }

            // インターフェース実装
            for (const interfaceId of cls.interfaces) {
                const key = `realization:${cls.id}:${interfaceId}`
                if (!relationshipSet.has(key)) {
                    relationships.push({
                        id: stableRelationshipId('realization', cls.id, interfaceId),
                        type: 'realization',
                        sourceId: cls.id,
                        targetId: interfaceId,
                    })
                    relationshipSet.add(key)
                }
            }

            // メンバーからの関連
            for (const member of cls.members) {
                const baseType = this.extractBaseTypeName(member.type)
                const targetClass = this.findClassByName(baseType)

                if (targetClass) {
                    let relType: RelationshipType

                    if (member.relationship === 'auto') {
                        // needs.isOwner が true なら composition、それ以外は種別で自動判定
                        if (member.needs?.isOwner) {
                            relType = 'composition'
                        } else if (targetClass.kind === 'struct') {
                            relType = 'composition'
                        } else {
                            relType = 'aggregation'
                        }
                    } else {
                        // 明示指定
                        relType = member.relationship as RelationshipType
                    }

                    const key = `${relType}:${cls.id}:${targetClass.id}:${member.name}`
                    if (!relationshipSet.has(key)) {
                        relationships.push({
                            id: stableRelationshipId(
                                relType,
                                cls.id,
                                targetClass.id,
                                member.name,
                                member.id,
                                member.sourceMultiplicity,
                                member.targetMultiplicity,
                            ),
                            type: relType,
                            sourceId: cls.id,
                            targetId: targetClass.id,
                            label: member.name,
                            sourceMultiplicity: member.sourceMultiplicity,
                            targetMultiplicity: member.targetMultiplicity,
                            sourceMemberId: member.id,
                        })
                        relationshipSet.add(key)
                    }
                }
            }

            // 操作パラメータ・戻り値型からの依存関係
            for (const operation of cls.operations) {

                // パラメータ型からの依存（既存）
                for (const param of operation.parameters) {
                    const baseType = this.extractBaseTypeName(param.type)
                    const targetClass = this.findClassByName(baseType)

                    if (targetClass && targetClass.id !== cls.id) {
                        const key = `dependency:${cls.id}:${targetClass.id}:${operation.name}:${param.name}`
                        if (!relationshipSet.has(key)) {
                            relationships.push({
                                id: stableRelationshipId(
                                    'dependency',
                                    cls.id,
                                    targetClass.id,
                                    `${operation.name}(${param.name})`,
                                    operation.id,
                                ),
                                type: 'dependency',
                                sourceId: cls.id,
                                targetId: targetClass.id,
                                label: `${operation.name}(${param.name})`,
                                sourceMemberId: operation.id,
                            })
                            relationshipSet.add(key)
                        }
                    }
                }

                // 戻り値型からの依存（追加）
                // void / プリミティブ型は除外し、モデル内の既知クラスへの参照のみ対象にする
                const returnBaseType = this.extractBaseTypeName(operation.returnType)
                if (
                    returnBaseType &&
                    returnBaseType !== 'void' &&
                    !this.isPrimitiveType(returnBaseType)
                ) {
                    const targetClass = this.findClassByName(returnBaseType)
                    if (targetClass && targetClass.id !== cls.id) {
                        const key = `dependency:${cls.id}:${targetClass.id}:${operation.name}:returnType`
                        if (!relationshipSet.has(key)) {
                            relationships.push({
                                id: stableRelationshipId(
                                    'dependency',
                                    cls.id,
                                    targetClass.id,
                                    `${operation.name}(): ${operation.returnType}`,
                                    operation.id,
                                ),
                                type: 'dependency',
                                sourceId: cls.id,
                                targetId: targetClass.id,
                                label: `${operation.name}(): ${operation.returnType}`,
                                sourceMemberId: operation.id,
                            })
                            relationshipSet.add(key)
                        }
                    }
                }
            }
        }

        return relationships
    }

    /* ============================
       Internal Helpers
    ============================ */

    /**
     * ClassInfoのディープコピー
     */
    private deepCopyClass(cls: ClassInfo): ClassInfo {
        return {
            ...cls,
            members: cls.members.map(m => ({ ...m })),
            operations: cls.operations.map(op => ({
                ...op,
                parameters: op.parameters.map(p => ({ ...p })),
                // workflow / workflowAst はネストした構造体なので JSON ラウンドトリップで深くコピー
                ...(op.workflow !== undefined && {
                    workflow: JSON.parse(JSON.stringify(op.workflow))
                }),
                ...(op.workflowAst !== undefined && {
                    workflowAst: JSON.parse(JSON.stringify(op.workflowAst))
                }),
            })),
            interfaces: [...cls.interfaces],
        }
    }

    /**
     * 循環継承の検出
     */
    private hasCircularInheritance(): boolean {
        const visited = new Set<string>()

        const visit = (id: string, stack: Set<string>): boolean => {
            if (stack.has(id)) return true

            const cls = this.classMap.get(id)
            if (!cls || !cls.baseClassId) return false

            stack.add(id)
            const result = visit(cls.baseClassId, stack)
            stack.delete(id)

            return result
        }

        for (const id of this.classMap.keys()) {
            if (!visited.has(id)) {
                if (visit(id, new Set())) return true
                visited.add(id)
            }
        }

        return false
    }

    /**
     * 特定のクラスを更新した場合に循環継承が発生するかチェック
     */
    private wouldCreateCircularInheritance(updatedClass: ClassInfo): boolean {
        if (!updatedClass.baseClassId) return false

        const visited = new Set<string>()
        let current: string | null = updatedClass.baseClassId

        while (current) {
            if (current === updatedClass.id) return true
            if (visited.has(current)) return false

            visited.add(current)
            const cls = this.classMap.get(current)
            current = cls?.baseClassId || null
        }

        return false
    }

    /**
     * 型名からベースの型名を抽出
     */
    private extractBaseTypeName(type: string): string {
        let cleaned = type.replace(/\[\]/g, '').trim()
        const listMatch = cleaned.match(/^List<(.+)>$/i)
        if (listMatch) {
            cleaned = listMatch[1].trim()
        }
        const genericMatch = cleaned.match(/<(.+)>/)
        if (genericMatch) {
            cleaned = genericMatch[1].trim()
        }
        return cleaned
    }

    /**
     * プリミティブ型かどうか
     */
    private isPrimitiveType(type: string): boolean {
        const primitives = [
            'string', 'number', 'boolean', 'void', 'any', 'unknown', 'never',
            'int', 'float', 'double', 'char', 'byte', 'short', 'long',
            'String', 'Integer', 'Float', 'Double', 'Boolean', 'Character',
            'Object', 'Array', 'Date', 'Map', 'Set', 'List'
        ]
        return primitives.includes(type)
    }
}
