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
    createId,
} from './class-diagram-types'

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
        private readonly classMap: Map<string, ClassInfo>
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

        const newClass: ClassInfo = {
            id: classId,
            name,
            kind,
            isAbstract: false,
            members: [],
            operations: [],
            interfaces: [],
            baseClassId: null,
            x: 100 + Math.random() * 200,
            y: 100 + Math.random() * 200,
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

        for (const cls of this.classMap.values()) {
            // 継承関係
            if (cls.baseClassId) {
                const key = `generalization:${cls.id}:${cls.baseClassId}`
                if (!relationshipSet.has(key)) {
                    relationships.push({
                        id: createId(),
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
                        id: createId(),
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
                        // 自動判定
                        if (targetClass.kind === 'struct') {
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
                            id: createId(),
                            type: relType,
                            sourceId: cls.id,
                            targetId: targetClass.id,
                            label: member.name,
                            sourceMultiplicity: member.sourceMultiplicity,
                            targetMultiplicity: member.targetMultiplicity,
                        })
                        relationshipSet.add(key)
                    }
                }
            }

            // 操作パラメータからの依存関係
            for (const operation of cls.operations) {
                for (const param of operation.parameters) {
                    const baseType = this.extractBaseTypeName(param.type)
                    const targetClass = this.findClassByName(baseType)

                    if (targetClass && targetClass.id !== cls.id) {
                        const key = `dependency:${cls.id}:${targetClass.id}:${operation.name}:${param.name}`
                        if (!relationshipSet.has(key)) {
                            relationships.push({
                                id: createId(),
                                type: 'dependency',
                                sourceId: cls.id,
                                targetId: targetClass.id,
                                label: `${operation.name}(${param.name})`,
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
                parameters: op.parameters.map(p => ({ ...p }))
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