// src/application/ClassDiagramService.ts

import { DomainModel, DomainEvent, DomainRuleViolation } from '../DomainModel'
import {
    AddTypeInput,
    AddMemberInput,
    AddOperationInput,
    AddParameterInput,
    SetBaseInput,
    AddInterfaceImplInput,
    RenameInput,
    DeleteInput,
    UpdateClassInput,
    AddRelationshipInput,
    ChangeModifierInput
} from './dtos'
import { HandlerResult } from '../handler-registry'
import type { ClassInfo, ClassKind, ClassMember, ClassOperation, OperationParameter, Relationship, Visibility } from '../class-diagram-types'
import { createId, extractBaseTypeName } from '../class-diagram-types';
import { postMessage } from '../../../frontend/src/bridge/vscode-bridge';
/**
 * Optional EventDispatcher interface - if you have one.
 * If not available, you can omit dispatcher and call service methods directly and handle returned events.
 */
export interface EventDispatcher {
    dispatchAll(events: DomainEvent[]): void
}

/**
 * ClassDiagramService
 *
 * Responsibilities:
 * - Accept normalized DTOs from adapters (CLI/GUI)
 * - Perform application-level logic (name->id resolution, getOrCreate rules for CLI, multi-step use cases)
 * - Call DomainModel methods (which enforce domain rules)
 * - Produce DomainEvent[] and update internal model
 */
export class ClassDiagramService {
    private model: DomainModel
    // inside ClassDiagramService class (プロパティに追加)
    private modelChangedListeners: Array<() => void> = [];
    constructor(initialModel?: DomainModel, private readonly dispatcher?: EventDispatcher) {
        this.model = initialModel ?? DomainModel.createEmpty()
    }

    /** expose current model (read-only) */
    getModel(): DomainModel {
        return this.model
    }

    /** Replace internal model (rare) */
    setModel(model: DomainModel): void {
        this.model = model
        this.notifyModelChanged();
    }

    /**
     * 名前でクラスを検索する便利メソッド。
     * SpecDslParser 等から利用する。
     */
    getClassByName(name: string): ClassInfo | undefined {
        return this.model.findClassByName(name)
    }

    /**
     * クラス名・操作名でオペレーションを検索する便利メソッド。
     * SpecDslParser 等から利用する。
     */
    getOperationByName(className: string, operationName: string): ClassOperation | undefined {
        const cls = this.model.findClassByName(className)
        return cls?.operations.find(op => op.name === operationName)
    }

    /**
     * 現在モデルを Spec DSL テキストとして取得する
     */
    toSpecDslText(): string {
        return this.model.toDSL();
    }
    /* =====================
       Helper: getOrCreateClass (returns updated model and the target ClassInfo)
       - preferredKind may be used when creating parent classes inferred from CLI
    ===================== */
    private getOrCreateClass(currentModel: DomainModel, name: string, preferredKind: ClassKind = 'class'): { model: DomainModel, target: ClassInfo } {
        const existing = currentModel.findClassByName(name)
        if (existing) {
            return { model: currentModel, target: existing }
        }

        const nextModel = currentModel.registerClass(name, preferredKind)
        const target = nextModel.findClassByName(name)!
        return { model: nextModel, target }
    }
    // public API
    public onModelChanged(listener: () => void): void {
        this.modelChangedListeners.push(listener);
    }

    public offModelChanged(listener: () => void): void {
        this.modelChangedListeners = this.modelChangedListeners.filter(l => l !== listener);
    }

    // internal helper - call this whenever this.model が更新
    private notifyModelChanged(): void {
        //postMessage({ command: 'log', level: 'debug', text: 'Model changed, notifying listeners...' });
        for (const l of this.modelChangedListeners) {
            //postMessage({ command: 'log', level: 'debug', text: 'Notifying listener...' });
            try {
                l()
            } catch (e) {
                postMessage({ command: 'log', level: 'error', text: 'modelChanged listener error : ' + e })
            }
        }
    }
    /* =====================
       Core "apply" methods for normalized DTOs
       These correspond to domain primitives but will perform light resolution:
         - when classId is available, prefer id-based flow (via findClassById resolution)
         - when only className is available, use name-based APIs of DomainModel
       They DO NOT perform CLI-specific heuristics like "treat name starting with I as interface" — use *FromCli variants* for that.
    ===================== */

    applyAddType(input: AddTypeInput): HandlerResult {
        // add/register class (if already present, DomainModel.registerClass will throw; we treat as update?)
        //console.log(`applyAddType: ${input.name} (${input.kind})`); // log input for debugging
        const existing = this.model.findClassByName(input.name)

        if (existing) {
            //console.log(`Class ${input.name} already exists, treating as update`); // log for debugging
            // If class already exists, treat as update (set kind/isAbstract)
            const updated = this.model.updateClassByName(input.name, cls => ({ ...cls, kind: input.kind, isAbstract: !!input.isAbstract }))
            const ev: DomainEvent = {
                type: 'TYPE_UPDATED',
                payload: { className: input.name, classInfo: updated.findClassByName(input.name)! }
            }
            this.model = updated
            this.notifyModelChanged();
            //postMessage({ command: 'log', level: 'debug', text: 'Class updated: ' + input.name });
            this.dispatcher?.dispatchAll([ev])
            return { success: true, model: this.model, events: [ev] }
        }

        // create new class
        let currentModel = this.model
        currentModel = currentModel.registerClass(input.name, input.kind)
        //postMessage({ command: 'log', level: 'debug', text: 'Registered new class: ' + input.name });
        // update isAbstract if needed
        if (input.isAbstract) {
            currentModel = currentModel.updateClassByName(input.name, cls => ({ ...cls, isAbstract: true }))
        }

        // Note: extendsNames handling should be done in FromCli method (if you want to auto-create parents)
        const created = currentModel.findClassByName(input.name)!
        const event: DomainEvent = {
            type: 'TYPE_ADDED',
            payload: { className: input.name, classInfo: created }
        }

        this.model = currentModel
        this.notifyModelChanged();
        //postMessage({ command: 'log', level: 'debug', text: 'Class added: ' + input.name });
        this.dispatcher?.dispatchAll([event])
        return { success: true, model: this.model, events: [event] }
    }

    applyAddMember(input: AddMemberInput): HandlerResult {
        // resolve by id or name
        let classNameToUse: string | undefined = input.className
        if (input.classId && !classNameToUse) {
            const cls = this.model.findClassById(input.classId)
            if (!cls) throw new DomainRuleViolation(`Class id ${input.classId} not found`)
            classNameToUse = cls.name
        }
        if (!classNameToUse) throw new DomainRuleViolation('className or classId required')

        const result = this.model.addMember(classNameToUse, input.member)
        const event: DomainEvent = {
            type: 'MEMBER_ADDED',
            payload: { className: classNameToUse, member: input.member }
        }
        this.model = result
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll([event])
        return { success: true, model: this.model, events: [event] }
    }

    /**
     * メンバの needs 宣言（設計意図・owner責務）を更新する。
     *
     * SpecDslParser の Pass2.5 から呼ばれる正規経路。
     * DomainModel.updateMember を通すことでモデル更新と notifyModelChanged が保証される。
     *
     * @param input.className  対象クラス名
     * @param input.memberName 対象メンバ名
     * @param input.needs      設定する MemberNeeds（null で削除）
     */
    applyUpdateMemberNeeds(input: {
        className: string
        memberName: string
        needs: import('../class-diagram-types').MemberNeeds | null
    }): HandlerResult {
        const cls = this.model.findClassByName(input.className)
        if (!cls) throw new DomainRuleViolation(`Class "${input.className}" not found`)

        const member = cls.members.find(m => m.name === input.memberName)
        if (!member) throw new DomainRuleViolation(
            `Member "${input.memberName}" not found in class "${input.className}"`
        )

        const updated = this.model.updateMember(
            input.className,
            input.memberName,
            m => ({ ...m, needs: input.needs ?? undefined })
        )

        const event: DomainEvent = {
            type: 'MEMBER_UPDATED',
            payload: {
                className: input.className,
                member: updated.findClassByName(input.className)!
                    .members.find(m => m.name === input.memberName)!,
                oldName: input.memberName,
                newName: input.memberName,
            },
        }

        this.model = updated
        this.notifyModelChanged()
        this.dispatcher?.dispatchAll([event])
        return { success: true, model: this.model, events: [event] }
    }

    applyAddOperation(input: AddOperationInput): HandlerResult {
        let classNameToUse: string | undefined = input.className
        if (input.classId && !classNameToUse) {
            const cls = this.model.findClassById(input.classId)
            if (!cls) throw new DomainRuleViolation(`Class id ${input.classId} not found`)
            classNameToUse = cls.name
        }
        if (!classNameToUse) throw new DomainRuleViolation('className or classId required')

        const result = this.model.addOperation(classNameToUse, input.operation)
        const event: DomainEvent = {
            type: 'OPERATION_ADDED',
            payload: { className: classNameToUse, operation: input.operation }
        }
        this.model = result
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll([event])
        return { success: true, model: this.model, events: [event] }
    }

    /**
     * オペレーションのワークフローデータを更新する。
     *
     * WorkflowEditorPanel の「Save Workflow」ボタンから呼ばれる唯一の保存経路。
     * DomainModel.updateOperationWorkflow → model 更新 → notifyModelChanged()
     * という正規フローを通ることで JSON 保存にも確実に反映される。
     *
     * @param input.classId     対象クラスのID
     * @param input.operationId 対象オペレーションのID
     * @param input.workflow    ワークフロー図のノード/エッジ構造
     * @param input.workflowAst workflow から生成された抽象構文木（省略可）
     */
    applyUpdateOperationWorkflow(input: {
        classId: string
        operationId: string
        workflow: ClassOperation['workflow']
        workflowAst?: ClassOperation['workflowAst']
    }): HandlerResult {
        const cls = this.model.findClassById(input.classId)
        if (!cls) throw new DomainRuleViolation(`Class id "${input.classId}" not found`)

        const op = cls.operations.find(o => o.id === input.operationId)
        if (!op) throw new DomainRuleViolation(
            `Operation id "${input.operationId}" not found in class "${cls.name}"`
        )

        const updated = this.model.updateOperationWorkflow(
            input.classId,
            input.operationId,
            input.workflow,
            input.workflowAst,
        )

        const event: DomainEvent = {
            type: 'OPERATION_WORKFLOW_UPDATED',
            payload: {
                classId: input.classId,
                className: cls.name,
                operationId: input.operationId,
                operationName: op.name,
            },
        }

        this.model = updated
        this.notifyModelChanged()
        this.dispatcher?.dispatchAll([event])
        return { success: true, model: this.model, events: [event] }
    }

    applyAddParameter(input: AddParameterInput): HandlerResult {
        const classNameToUse = input.className ?? (input.classId ? (() => { const c = this.model.findClassById(input.classId!); if (!c) throw new DomainRuleViolation(`Class id ${input.classId} not found`); return c.name })() : undefined)
        if (!classNameToUse) throw new DomainRuleViolation('className or classId required')

        const result = this.model.addParameter(classNameToUse, input.operationName, input.parameter)
        const event: DomainEvent = {
            type: 'PARAMETER_ADDED',
            payload: { className: classNameToUse, operationName: input.operationName, parameter: input.parameter }
        }
        this.model = result
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll([event])
        return { success: true, model: this.model, events: [event] }
    }


    applySetBase(input: SetBaseInput): HandlerResult {
        // resolve class and base by id or name
        const classId = input.classId ?? (input.className ? this.model.findClassByName(input.className)?.id : undefined)
        const baseId = input.baseClassId ?? (input.baseClassName ? this.model.findClassByName(input.baseClassName)?.id : null)
        if (!classId) throw new DomainRuleViolation('classId or className required')
        // baseId may be null (to unset)
        const result = this.model.setBaseClass(classId, baseId ?? null)
        const event: DomainEvent = {
            type: 'BASE_CLASS_ADDED',
            payload: { className: this.model.findClassById(classId)!.name, baseClassName: baseId ? this.model.findClassById(baseId)!.name : null }
        }
        this.model = result
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll([event])
        return { success: true, model: this.model, events: [event] }
    }

    applyAddInterfaceImpl(input: AddInterfaceImplInput): HandlerResult {
        const classId = input.classId ?? (input.className ? this.model.findClassByName(input.className)?.id : undefined)
        const ifaceId = input.interfaceId ?? (input.interfaceName ? this.model.findClassByName(input.interfaceName)?.id : undefined)
        if (!classId) throw new DomainRuleViolation('classId or className required')
        if (!ifaceId) throw new DomainRuleViolation('interfaceId or interfaceName required')

        const result = this.model.addInterfaceImplementation(classId, ifaceId)
        const event: DomainEvent = {
            type: 'IMPLEMENTED_INTERFACE_ADDED',
            payload: { className: this.model.findClassById(classId)!.name, interfaceName: this.model.findClassById(ifaceId)!.name }
        }
        this.model = result
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll([event])
        return { success: true, model: this.model, events: [event] }
    }

    applyRename(input: RenameInput): HandlerResult {
        if (input.target === 'type') {
            const result = this.model.renameClass(input.oldName, input.newName)
            const updatedClass = result.findClassByName(input.newName)!
            const event: DomainEvent = {
                type: 'TYPE_UPDATED',
                payload: { className: input.newName, classInfo: updatedClass }
            }
            this.model = result
            this.notifyModelChanged();
            this.dispatcher?.dispatchAll([event])
            return { success: true, model: this.model, events: [event] }
        }

        if (input.target === 'member') {
            if (!input.className) throw new DomainRuleViolation('className is required to rename member')
            // capture previous member for event if desired
            const cls = this.model.findClassByName(input.className)
            if (!cls) throw new DomainRuleViolation(`Class ${input.className} not found`)
            const oldMember = cls.members.find(m => m.name === input.oldName)
            if (!oldMember) throw new DomainRuleViolation(`Member ${input.oldName} not found in ${input.className}`)

            const result = this.model.updateMember(input.className, input.oldName, m => ({ ...m, name: input.newName }))
            const newMember = result.findClassByName(input.className)!.members.find(m => m.name === input.newName)!
            const event: DomainEvent = {
                type: 'MEMBER_UPDATED',
                payload: { className: input.className!, member: newMember, oldName: input.oldName, newName: input.newName }
            }
            this.model = result
            this.notifyModelChanged();
            this.dispatcher?.dispatchAll([event])
            return { success: true, model: this.model, events: [event] }
        }

        if (input.target === 'operation') {
            if (!input.className) throw new DomainRuleViolation('className is required to rename operation')
            const cls = this.model.findClassByName(input.className)
            if (!cls) throw new DomainRuleViolation(`Class ${input.className} not found`)
            const oldOp = cls.operations.find(o => o.name === input.oldName)
            if (!oldOp) throw new DomainRuleViolation(`Operation ${input.oldName} not found in ${input.className}`)

            const result = this.model.updateOperation(input.className, input.oldName, op => ({ ...op, name: input.newName }))
            const newOp = result.findClassByName(input.className)!.operations.find(o => o.name === input.newName)!
            const event: DomainEvent = {
                type: 'OPERATION_UPDATED',
                payload: { className: input.className!, operation: newOp, oldName: input.oldName, newName: input.newName }
            }
            this.model = result
            this.notifyModelChanged();
            this.dispatcher?.dispatchAll([event])
            return { success: true, model: this.model, events: [event] }
        }

        return { success: true, model: this.model, events: [] }
    }

    applyDelete(input: DeleteInput): HandlerResult {
        if (input.target === 'type') {
            if (!input.className && !input.classId) throw new DomainRuleViolation('className or classId required to delete type')
            // get class name
            const clsName = input.className ?? this.model.findClassById(input.classId!)!.name
            // remove and emit
            const result = this.model.removeClassByName(clsName)
            const event: DomainEvent = { type: 'TYPE_REMOVED', payload: { className: clsName } }
            this.model = result
            this.notifyModelChanged();
            this.dispatcher?.dispatchAll([event])
            return { success: true, model: this.model, events: [event] }
        }

        if (input.target === 'member') {
            if (!input.className && !input.classId) throw new DomainRuleViolation('className or classId required to delete member')
            const className = input.className ?? this.model.findClassById(input.classId!)!.name
            // capture member before removal
            const cls = this.model.findClassByName(className)
            if (!cls) throw new DomainRuleViolation(`Class ${className} not found`)
            const member = cls.members.find(m => m.name === input.name)
            if (!member) throw new DomainRuleViolation(`Member ${input.name} not found in ${className}`)
            const result = this.model.removeMember(className, input.name!)
            const event: DomainEvent = { type: 'MEMBER_REMOVED', payload: { className, member } }
            this.model = result
            this.notifyModelChanged();
            this.dispatcher?.dispatchAll([event])
            return { success: true, model: this.model, events: [event] }
        }

        if (input.target === 'operation') {
            if (!input.className && !input.classId) throw new DomainRuleViolation('className or classId required to delete operation')
            const className = input.className ?? this.model.findClassById(input.classId!)!.name
            const cls = this.model.findClassByName(className)
            if (!cls) throw new DomainRuleViolation(`Class ${className} not found`)
            const op = cls.operations.find(o => o.name === input.name)
            if (!op) throw new DomainRuleViolation(`Operation ${input.name} not found in ${className}`)
            const result = this.model.removeOperation(className, input.name!)
            const event: DomainEvent = { type: 'OPERATION_REMOVED', payload: { className, operation: op } }
            this.model = result
            this.notifyModelChanged();
            this.dispatcher?.dispatchAll([event])
            return { success: true, model: this.model, events: [event] }
        }

        return { success: true, model: this.model, events: [] }
    }

    applyUpdateClass(input: UpdateClassInput): HandlerResult {
        const result = this.model.updateClass(input.classId, cls => ({ ...cls, ...(input.patch as Partial<ClassInfo>) }))
        const event: DomainEvent = {
            type: 'TYPE_UPDATED',
            payload: { className: result.findClassById(input.classId)!.name, classInfo: result.findClassById(input.classId)! }
        }
        this.model = result
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll([event])
        return { success: true, model: this.model, events: [event] }
    }

    /**
     * Replace entire model from ClassInfo[] and notify listeners.
     * Useful when loading a full diagram snapshot from JSON.
     */
    public replaceClassesFromArray(classes: ClassInfo[]): void {
        const next = DomainModel.from(classes)
        this.model = next
        const ev: DomainEvent = { type: 'MODEL_REPLACED', payload: { classes } }
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll([ev])
    }

    /* =====================
       CLI-specific convenience methods
       These implement "getOrCreate" and common CLI heuristics.
       Keep CLI heuristics here so DomainModel stays clean.
    ===================== */

    addTypeFromCli(input: AddTypeInput): HandlerResult {
        // create or update primary class
        let currentModel = this.model
        let { model: nextModel, target: newClass } = this.getOrCreateClass(currentModel, input.name, input.kind)
        currentModel = nextModel

        // set kind/isAbstract
        newClass = { ...newClass, kind: input.kind, isAbstract: !!input.isAbstract }

        // process extendsNames if any (auto create parents/interfaces)
        let baseClassId: string | null = null
        const interfaces: string[] = []

        if (input.extendsNames && input.extendsNames.length > 0) {
            for (let i = 0; i < input.extendsNames.length; ++i) {
                const parentName = input.extendsNames[i]
                // heuristic: if parentName looks like I[A-Z] or input.kind === 'i' etc, prefer interface
                let preferred: ClassKind = 'class'
                if (input.kind === 'interface' || i > 0 || parentName.match(/^I[A-Z]/)) {
                    preferred = 'interface'
                }
                const created = this.getOrCreateClass(currentModel, parentName, preferred)
                currentModel = created.model
                const parent = created.target
                if (parent.kind === 'interface') {
                    if (!interfaces.includes(parent.id)) interfaces.push(parent.id)
                } else {
                    if (!baseClassId) baseClassId = parent.id
                }
            }
        }

        // apply updates to main class
        newClass = { ...newClass, baseClassId, interfaces }
        const updatedModel = currentModel.updateClassByName(input.name, () => newClass)

        const event: DomainEvent = {
            type: 'TYPE_ADDED',
            payload: { className: input.name, classInfo: newClass }
        }

        this.model = updatedModel
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll([event])
        return { success: true, model: this.model, events: [event] }
    }

    addMemberFromCli(input: AddMemberInput): HandlerResult {
        // if class not exist, create it (CLI convention)
        let { model: m, target: cls } = this.getOrCreateClass(this.model, input.className!)
        // add member
        const result = m.addMember(cls.name, input.member)
        const ev: DomainEvent = { type: 'MEMBER_ADDED', payload: { className: cls.name, member: input.member } }
        this.model = result
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll([ev])
        return { success: true, model: this.model, events: [ev] }
    }

    setBaseFromCli(input: SetBaseInput): HandlerResult {
        // ensure both classes exist (create if necessary)
        let currentModel = this.model
        const parentName = input.baseClassName!
        const childName = input.className!

        const createdChild = this.getOrCreateClass(currentModel, childName)
        currentModel = createdChild.model
        const createdParent = this.getOrCreateClass(currentModel, parentName, 'class')
        currentModel = createdParent.model

        const child = currentModel.findClassByName(childName)!
        const parent = currentModel.findClassByName(parentName)!
        const result = currentModel.setBaseClass(child.id, parent.id)
        const ev: DomainEvent = { type: 'BASE_CLASS_ADDED', payload: { className: childName, baseClassName: parentName } }
        this.model = result
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll([ev])
        return { success: true, model: this.model, events: [ev] }
    }

    addInterfaceImplFromCli(input: AddInterfaceImplInput): HandlerResult {
        let currentModel = this.model
        const childName = input.className!
        const ifaceName = input.interfaceName!

        const childCreated = this.getOrCreateClass(currentModel, childName)
        currentModel = childCreated.model
        const ifaceCreated = this.getOrCreateClass(currentModel, ifaceName, 'interface')
        currentModel = ifaceCreated.model

        const child = currentModel.findClassByName(childName)!
        const iface = currentModel.findClassByName(ifaceName)!
        const result = currentModel.addInterfaceImplementation(child.id, iface.id)
        const ev: DomainEvent = { type: 'IMPLEMENTED_INTERFACE_ADDED', payload: { className: childName, interfaceName: ifaceName } }
        this.model = result
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll([ev])
        return { success: true, model: this.model, events: [ev] }
    }

    applyChangeModifierFromCli(input: ChangeModifierInput): HandlerResult {
        console.log(`applyChangeModifierFromCli: ${input.className}.${input.memberName} (${input.target}) visibility=${input.patch.visibility} modifier=${input.patch.modifier}`); // log input for debugging
        const target = input.target;
        let currentModel = this.model
        if (input.target === 'member') {
            // 可視性の変更
            if (input.patch.visibility !== undefined) {
                currentModel = currentModel.changeMemberVisibility(
                    input.className,
                    input.memberName,
                    input.patch.visibility as Visibility
                )
            }
            // モディファイアの変更
            currentModel = currentModel.changeMemberModifier(
                input.className,
                input.memberName,
                input.patch.modifier as 'static' | 'abstract' | null
            )

        } else {
            // 可視性の変更
            if (input.patch.visibility !== undefined) {
                currentModel = currentModel.changeOperationVisibility(
                    input.className,
                    input.memberName,
                    input.patch.visibility as Visibility
                )
            }
            // モディファイアの変更
            currentModel = currentModel.changeOperationModifier(
                input.className,
                input.memberName,
                (input.patch.modifier ?? null) as 'static' | 'abstract' | 'virtual' | null
            )

        }

        const event: DomainEvent = {
            type: 'MODIFIER_CHANGED',
            payload: { target, className: input.className, memberName: input.memberName, visibility: input.patch.visibility ?? null, modifier: input.patch.modifier ?? null }
        }
        this.model = currentModel
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll([event])
        return { success: true, model: this.model, events: [event] }
    }
    /* =====================
       Relationship helpers - if DomainModel lacks addRelationship, keep minimal support
       (If DomainModel supports addRelationship/removeRelationship/updateRelationship, use them)
    ===================== */
    applyAddRelationship(input: AddRelationshipInput): HandlerResult {
        // If domain lacks relationship methods, just produce event and leave model unchanged.
        // If you have model.addRelationship, call it instead and return actual updated model.
        const rel: Relationship = input.relationship as Relationship
        // If DomainModel implements an addRelationship(...) method, call it; otherwise no-op on model.
        // Example:
        // const next = this.model.addRelationship(rel)
        // produce event RELATIONSHIP_ADDED with payload
        const ev: DomainEvent = { type: 'RELATIONSHIP_ADDED', payload: { relationship: rel } }
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll([ev])
        return { success: true, model: this.model, events: [ev] }
    }

    applyFactoryPattern(input: {
        factoryName: string,
        abstractName: string,
        concreteNames: string[]
    }): HandlerResult {
        const events: DomainEvent[] = [];
        let currentModel = this.model;

        // 1. Validate and resolve concrete types
        const concreteClasses: ClassInfo[] = [];
        for (const name of input.concreteNames) {
            const cls = currentModel.findClassByName(name);
            if (!cls) {
                throw new DomainRuleViolation(`Concrete type '${name}' not found.`);
            }
            concreteClasses.push(cls);
        }

        // 2. Create Abstract Node (Interface by default for Factory Pattern)
        const abstractKind: ClassKind = 'interface';
        const { model: modelWithAbstract, target: abstractClassInfo } = this.getOrCreateClass(currentModel, input.abstractName, abstractKind);
        currentModel = modelWithAbstract;

        // Force kind to interface if it was existing as something else (REQUIRED for addInterfaceImplementation)
        if (currentModel.findClassByName(input.abstractName)!.kind !== 'interface') {
            currentModel = currentModel.updateClassByName(input.abstractName, cls => ({ ...cls, kind: 'interface' }));
        }

        const abstractClass = currentModel.findClassByName(input.abstractName)!;

        events.push({
            type: 'TYPE_ADDED',
            payload: { className: abstractClass.name, classInfo: abstractClass }
        });

        // 3. Update Concrete Classes to implement Abstract Node
        for (const concrete of concreteClasses) {
            currentModel = currentModel.addInterfaceImplementation(concrete.id, abstractClass.id);
            events.push({
                type: 'IMPLEMENTED_INTERFACE_ADDED',
                payload: { className: concrete.name, interfaceName: abstractClass.name }
            });
        }

        // 4. Create Factory Class
        const { model: modelWithFactory, target: factoryClassInfo } = this.getOrCreateClass(currentModel, input.factoryName, 'class');
        currentModel = modelWithFactory;

        // Add create() method to Factory
        const createOp: ClassOperation = {
            id: createId(),
            name: 'create',
            returnType: abstractClass.name,
            visibility: 'public',
            parameters: [],
            isStatic: false,
            isAbstract: false
        };
        currentModel = currentModel.addOperation(factoryClassInfo.name, createOp);
        const factoryClass = currentModel.findClassByName(factoryClassInfo.name)!;

        events.push({
            type: 'TYPE_ADDED',
            payload: { className: factoryClass.name, classInfo: factoryClass }
        });

        // 5. Add creation method added event
        events.push({
            type: 'MEMBER_ADDED', // Simplified event for operation addition
            payload: { className: factoryClass.name, member: createOp }
        });

        // 6. Migrate existing generation methods from Callers
        // Search for methods named "create[ConcreteClassName]" across all classes
        for (const concrete of concreteClasses) {
            const methodName = `create${concrete.name}`;

            // Get current list of classes from latest model
            const allClasses = currentModel.getClasses();
            for (const cls of allClasses) {
                if (cls.name === factoryClass.name) continue;

                const opsToMigrate = cls.operations.filter(o => o.name === methodName);
                if (opsToMigrate.length > 0) {

                    // Use updateClass to remove operations in one go per class if possible,
                    // but for simplicity and events, we can just use removeOperation correctly.
                    for (const op of opsToMigrate) {
                        currentModel = currentModel.removeOperation(cls.name, op.name);
                        events.push({
                            type: 'OPERATION_REMOVED',
                            payload: { className: cls.name, operation: op }
                        });
                    }
                }
            }
        }

        this.model = currentModel;
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll(events);

        return { success: true, model: this.model, events };
    }

    applySingletonPattern(input: {
        className: string
    }): HandlerResult {
        const events: DomainEvent[] = [];
        let currentModel = this.model;

        // 1. Find the class
        const cls = currentModel.findClassByName(input.className);
        if (!cls) {
            throw new DomainRuleViolation(`Class '${input.className}' not found.`);
        }

        // 2. instanceメンバの追加
        const instanceMember: ClassMember = {
            id: createId(),
            name: 'instance',
            visibility: 'private',
            type: cls.name,
            isStatic: true,
            isAbstract: false,
            relationship: 'auto',
            sourceMultiplicity: "",
            targetMultiplicity: ""
        };
        currentModel = currentModel.addMember(cls.name, instanceMember);
        events.push({
            type: 'MEMBER_ADDED',
            payload: { className: cls.name, member: instanceMember }
        });

        // 3. getInstanceメソッドの追加
        const getInstanceOp: ClassOperation = {
            id: createId(),
            name: 'getInstance',
            returnType: cls.name,
            visibility: 'public',
            parameters: [],
            isStatic: true,
            isAbstract: false
        };
        currentModel = currentModel.addOperation(cls.name, getInstanceOp);
        events.push({
            type: 'OPERATION_ADDED',
            payload: { className: cls.name, operation: getInstanceOp }
        });


        this.model = currentModel;
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll(events);

        return { success: true, model: this.model, events };
    }

    applyAdapterPattern(
        input: {
            adapterName: string,
            targetName: string,
            adapteeNames: string[]
        }
    ): HandlerResult {
        const events: DomainEvent[] = [];
        let currentModel = this.model;
        // 1. Adapterクラスの取得
        const adaperClass = this.model.findClassByName(input.adapterName);
        if (!adaperClass) {
            throw new DomainRuleViolation(`Adapter class '${input.adapterName}' not found.`);
        }

        // 2. Targetクラスの取得
        const targetClass = this.model.findClassByName(input.targetName);
        if (!targetClass) {
            throw new DomainRuleViolation(`Target class '${input.targetName}' not found.`);
        }

        if (targetClass.kind !== 'interface') {
            throw new DomainRuleViolation(`Target class is not kind of interface`);
        }

        currentModel = currentModel.addInterfaceImplementation(adaperClass.id, targetClass.id);

        // 3. Adapteeクラスの取得
        const adapteeClasses = input.adapteeNames.map(name => {
            const cls = this.model.findClassByName(name);
            if (!cls) {
                throw new DomainRuleViolation(`Adaptee class '${name}' not found.`);
            }
            return cls;
        });

        if (adapteeClasses.length === 0) {
            throw new DomainRuleViolation(`Adaptee class needs length > 0.`);
        }

        for (const adaptee of adapteeClasses) {
            // Adapteeクラスのメンバを付与する

            const adapteeMember: ClassMember = {
                id: createId(),
                name: this.toCamelCase(adaptee.name),
                visibility: 'private',
                type: adaptee.name,
                isStatic: false,
                isAbstract: false,
                relationship: 'auto',
                sourceMultiplicity: "",
                targetMultiplicity: ""
            };
            currentModel = currentModel.addMember(adaperClass.name, adapteeMember);
        }
        this.model = currentModel;
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll(events);
        return { success: true, model: this.model, events: [] };
    }

    applyTemplatePattern(
        input: {
            abstractClassName: string,
            concreteNames: string[]
        }
    ): HandlerResult {
        const events: DomainEvent[] = [];
        let currentModel = this.model;

        const abstractClass = currentModel.findClassByName(input.abstractClassName);
        if (!abstractClass) {
            throw new DomainRuleViolation(`Abstract class '${input.abstractClassName}' not found.`);
        }

        if (!abstractClass?.isAbstract) {
            throw new DomainRuleViolation(`Class is not abstract class : '${input.abstractClassName}'`)
        }

        if (abstractClass.operations.length === 0) {
            throw new DomainRuleViolation(`To apply the template pattern, you need at least one template method and an abstract method to be defined in child classes. : '${input.abstractClassName}'`);
        }

        const abstractOperations = abstractClass.operations.filter(op => op.isAbstract);
        if (abstractOperations.length === 0) {
            throw new DomainRuleViolation(`At least one abstract method must be defined in the child class. : '${input.abstractClassName}'`);
        }

        if (input.concreteNames.length === 0) {
            throw new DomainRuleViolation(`At least one concrete class must be specified.`);
        }

        for (const concreteName of input.concreteNames) {
            const concreteClass = currentModel.findClassByName(concreteName);

            if (!concreteClass) {
                postMessage({ command: 'log', level: 'warn', text: `Class '${concreteName}' not found.` })
                continue;
            }
            if (concreteClass.kind !== 'class') {
                throw new DomainRuleViolation(`Concrete class is not kind of class : '${concreteName}'`);
            }

            currentModel = currentModel.setBaseClass(concreteClass.id, abstractClass.id);
        }

        this.model = currentModel;
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll(events);
        return { success: true, model: this.model, events: [] };

    }

    applyStrategyPattern(
        input: {
            contextClassName: string,
            strategyInterfaceName: string,
            strategyConcreteClassNames: string[]
        }
    ): HandlerResult {
        const events: DomainEvent[] = [];
        let currentModel = this.model;


        const contextClass = currentModel.findClassByName(input.contextClassName);
        if (!contextClass) {
            throw new DomainRuleViolation(`Concrete class '${input.contextClassName}' not found.`);
        }

        const strategyInterface = currentModel.findClassByName(input.strategyInterfaceName);
        if (!strategyInterface) {
            throw new DomainRuleViolation(`Interface class '${input.strategyInterfaceName}' not found.`);
        }

        if (strategyInterface.kind !== 'interface') {
            throw new DomainRuleViolation(`Interface class is not kind of interface : '${input.strategyInterfaceName}'`);
        }


        const contextStrategyMember: ClassMember = {
            id: createId(),
            name: this.toCamelCase(strategyInterface.name),
            visibility: 'private',
            type: strategyInterface.name,
            isStatic: false,
            isAbstract: false,
            relationship: 'auto',
            sourceMultiplicity: "",
            targetMultiplicity: ""
        };
        currentModel = currentModel.addMember(contextClass.name, contextStrategyMember);
        if (input.strategyConcreteClassNames.length === 0) {
            throw new DomainRuleViolation(`Strategy concrete class needs length > 0.`);
        }

        for (const concreteName of input.strategyConcreteClassNames) {
            const concreteClass = currentModel.findClassByName(concreteName);
            if (!concreteClass) {
                postMessage({ command: 'log', level: 'warn', text: `Strategy concrete class '${concreteName}' not found.` })
                continue;
            }
            if (concreteClass.kind !== 'class') {
                throw new DomainRuleViolation(`Strategy concrete class is not kind of class : '${concreteName}'`);
            }

            currentModel = currentModel.addInterfaceImplementation(concreteClass.id, strategyInterface.id);
        }

        this.model = currentModel;
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll(events);
        return { success: true, model: this.model, events: [] };
    }

    applyObserverPattern(
        input: {
            subjectClassName: string,
            observerInterfaceName: string,
            observerConcreteClassNames: string[]
        }
    ): HandlerResult {
        const events: DomainEvent[] = [];
        let currentModel = this.model;

        // register observer interface 
        currentModel = currentModel.registerClass(input.observerInterfaceName, 'interface', createId());
        const observerInterface = currentModel.findClassByName(input.observerInterfaceName);
        if (!observerInterface) {
            throw new DomainRuleViolation(`observer interface '${input.observerInterfaceName}' not found.`);
        }
        const observerUpdateOperation: ClassOperation = {
            id: createId(),
            name: 'update',
            returnType: 'void',
            visibility: 'public',
            parameters: [],
            isStatic: false,
            isAbstract: false
        }
        currentModel = currentModel.addOperation(observerInterface.name, observerUpdateOperation);



        // register subject class if not exists
        currentModel = currentModel.registerClass(input.subjectClassName, 'class', createId());
        const subjectClass = currentModel.findClassByName(input.subjectClassName);
        if (!subjectClass) {
            throw new DomainRuleViolation(`subject class '${input.subjectClassName}' not found.`);
        }
        const subjectObserversAttribute: ClassMember = {
            id: createId(),
            name: this.toCamelCase(observerInterface.name),
            visibility: 'private',
            type: `${observerInterface.name}[]`,
            isStatic: false,
            isAbstract: false,
            relationship: 'auto',
            sourceMultiplicity: "1",
            targetMultiplicity: "*"
        }

        currentModel = currentModel.addMember(subjectClass.name, subjectObserversAttribute);

        const subjectAttachParameter: OperationParameter = {
            id: createId(),
            name: this.toCamelCase(observerInterface.name),
            type: observerInterface.name,
        }
        const subjectDetachParameter: OperationParameter = {
            id: createId(),
            name: this.toCamelCase(observerInterface.name),
            type: observerInterface.name,
        }

        const subjectAttachOperation: ClassOperation = {
            id: createId(),
            name: 'attach',
            returnType: 'void',
            visibility: 'public',
            parameters: [],
            isStatic: false,
            isAbstract: false
        };
        const subjectDetachOperation: ClassOperation = {
            id: createId(),
            name: 'detach',
            returnType: 'void',
            visibility: 'public',
            parameters: [],
            isStatic: false,
            isAbstract: false
        };
        const notifyOperation: ClassOperation = {
            id: createId(),
            name: 'notify',
            returnType: 'void',
            visibility: 'public',
            parameters: [],
            isStatic: false,
            isAbstract: false
        }
        currentModel = currentModel.addOperation(subjectClass.name, subjectAttachOperation);
        currentModel = currentModel.addParameter(subjectClass.name, subjectAttachOperation.name, subjectAttachParameter);

        currentModel = currentModel.addOperation(subjectClass.name, subjectDetachOperation);
        currentModel = currentModel.addParameter(subjectClass.name, subjectDetachOperation.name, subjectDetachParameter);

        currentModel = currentModel.addOperation(subjectClass.name, notifyOperation);


        // observer interfaceを付与する
        for (const concreteName of input.observerConcreteClassNames) {
            const concreteClass = currentModel.findClassByName(concreteName);
            if (!concreteClass) {
                postMessage({ command: 'log', level: 'warn', text: `Observer concrete class '${concreteName}' not found.` })
                continue;
            }
            if (concreteClass.kind !== 'class') {
                throw new DomainRuleViolation(`Observer concrete class is not kind of class : '${concreteName}'`);
            }

            currentModel = currentModel.addInterfaceImplementation(concreteClass.id, observerInterface.id);
        }

        this.model = currentModel;
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll(events);
        return { success: true, model: this.model, events: [] };

    }

    applyFacadePattern(
        input: {
            facadeClassName: string,
            subsystemClassNames: string[]
        }
    ): HandlerResult {
        const events: DomainEvent[] = [];
        let currentModel = this.model;


        const facadeClass = currentModel.findClassByName(input.facadeClassName);
        if (!facadeClass) {
            throw new DomainRuleViolation(`Facade class '${input.facadeClassName}' not found.`);
        }
        if (input.subsystemClassNames.length < 2) {
            throw new DomainRuleViolation(`Subsystem class names is less than 2.`);
        }
        // register subsystem classes if not exists
        for (const subsystemName of input.subsystemClassNames) {
            const subsystemClass = currentModel.findClassByName(subsystemName);
            if (!subsystemClass) {
                throw new DomainRuleViolation(`Subsystem class '${subsystemName}' not found.`);
            }

            // add composition relationship from facade to subsystem
            const compositionMember: ClassMember = {
                id: createId(),
                name: this.toCamelCase(subsystemClass.name),
                visibility: 'private',
                type: subsystemClass.name,
                isStatic: false,
                isAbstract: false,
                relationship: 'auto',
                sourceMultiplicity: "1",
                targetMultiplicity: "1"
            };
            currentModel = currentModel.addMember(facadeClass.name, compositionMember);
        }

        // facade classに operationを追加する(なければ)
        if (facadeClass.operations.length === 0) {
            const facadeOperation: ClassOperation = {
                id: createId(),
                name: 'operation',
                returnType: 'void',
                visibility: 'public',
                parameters: [],
                isStatic: false,
                isAbstract: false
            };
            currentModel = currentModel.addOperation(facadeClass.name, facadeOperation);
        } else {
            postMessage({ command: 'log', level: 'warn', text: `Facade class '${input.facadeClassName}' already has operations. This message is output when the Facade class has one or more methods. ` })
        }

        this.model = currentModel;
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll(events);
        return { success: true, model: this.model, events: [] };
    }

    /* =====================
       Refactoring Methods
    ===================== */

    /**
     * クラスの public メソッドからインターフェースを抽出し、implements 関係を追加する。
     */
    applyExtractInterface(input: {
        className: string,
        interfaceName: string
    }): HandlerResult {
        const events: DomainEvent[] = [];
        let currentModel = this.model;

        const source = currentModel.findClassByName(input.className);
        if (!source) {
            throw new DomainRuleViolation(`クラス "${input.className}" が見つかりません`);
        }

        const publicOps = source.operations.filter(op => op.visibility === 'public');
        if (publicOps.length === 0) {
            throw new DomainRuleViolation(`"${input.className}" に public メソッドがありません`);
        }

        // インターフェースを作成
        currentModel = currentModel.registerClass(input.interfaceName, 'interface');
        const iface = currentModel.findClassByName(input.interfaceName)!;

        events.push({
            type: 'TYPE_ADDED',
            payload: { className: input.interfaceName, classInfo: iface }
        });

        // public メソッドのシグネチャをインターフェースにコピー
        for (const op of publicOps) {
            const ifaceOp: ClassOperation = {
                id: createId(),
                name: op.name,
                returnType: op.returnType,
                visibility: 'public',
                parameters: op.parameters.map(p => ({ ...p, id: createId() })),
                isStatic: false,
                isAbstract: true
            };
            currentModel = currentModel.addOperation(input.interfaceName, ifaceOp);
            events.push({
                type: 'OPERATION_ADDED',
                payload: { className: input.interfaceName, operation: ifaceOp }
            });
        }

        // ソースクラスに implements を追加
        const updatedIface = currentModel.findClassByName(input.interfaceName)!;
        currentModel = currentModel.addInterfaceImplementation(source.id, updatedIface.id);
        events.push({
            type: 'IMPLEMENTED_INTERFACE_ADDED',
            payload: { className: input.className, interfaceName: input.interfaceName }
        });

        this.model = currentModel;
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll(events);
        return { success: true, model: this.model, events };
    }

    /**
     * 複数クラスの共通メンバ・メソッドを親クラスに引き上げる。
     */
    applyExtractSuperclass(input: {
        classNames: string[],
        superName: string
    }): HandlerResult {
        const events: DomainEvent[] = [];
        let currentModel = this.model;

        // 指定クラスを取得
        const classes: import('../class-diagram-types').ClassInfo[] = [];
        for (const name of input.classNames) {
            const cls = currentModel.findClassByName(name);
            if (!cls) {
                throw new DomainRuleViolation(`クラスが見つかりません: ${name}`);
            }
            classes.push(cls);
        }

        // 共通メンバを特定（name と type が すべてのクラスに存在するもの）
        const firstClass = classes[0];
        const commonMembers = firstClass.members.filter(m =>
            classes.every(cls => cls.members.some(cm => cm.name === m.name && cm.type === m.type))
        );
        const commonOps = firstClass.operations.filter(op =>
            classes.every(cls => cls.operations.some(co => co.name === op.name && co.returnType === op.returnType))
        );

        // 親クラスを作成
        currentModel = currentModel.registerClass(input.superName, 'class');
        const superClass = currentModel.findClassByName(input.superName)!;

        events.push({
            type: 'TYPE_ADDED',
            payload: { className: input.superName, classInfo: superClass }
        });

        // 共通メンバを親クラスに追加
        for (const m of commonMembers) {
            const newMember: ClassMember = {
                id: createId(),
                name: m.name,
                type: m.type,
                visibility: m.visibility,
                isStatic: m.isStatic,
                isAbstract: m.isAbstract,
                relationship: m.relationship,
                sourceMultiplicity: m.sourceMultiplicity,
                targetMultiplicity: m.targetMultiplicity
            };
            currentModel = currentModel.addMember(input.superName, newMember);
            events.push({
                type: 'MEMBER_ADDED',
                payload: { className: input.superName, member: newMember }
            });
        }

        // 共通メソッドを親クラスに追加
        for (const op of commonOps) {
            const newOp: ClassOperation = {
                id: createId(),
                name: op.name,
                returnType: op.returnType,
                visibility: op.visibility,
                parameters: op.parameters.map(p => ({ ...p, id: createId() })),
                isStatic: op.isStatic,
                isAbstract: op.isAbstract
            };
            currentModel = currentModel.addOperation(input.superName, newOp);
            events.push({
                type: 'OPERATION_ADDED',
                payload: { className: input.superName, operation: newOp }
            });
        }

        // 各子クラスに基底クラスを設定し、共通メンバ・メソッドを削除
        const updatedSuper = currentModel.findClassByName(input.superName)!;
        for (const name of input.classNames) {
            const cls = currentModel.findClassByName(name)!;
            currentModel = currentModel.setBaseClass(cls.id, updatedSuper.id);
            events.push({
                type: 'BASE_CLASS_ADDED',
                payload: { className: name, baseClassName: input.superName }
            });

            // 共通メンバを子クラスから削除
            for (const m of commonMembers) {
                try {
                    currentModel = currentModel.removeMember(name, m.name);
                    events.push({
                        type: 'MEMBER_REMOVED',
                        payload: { className: name, member: m }
                    });
                } catch { /* メンバが見つからない場合は無視 */ }
            }

            // 共通メソッドを子クラスから削除
            for (const op of commonOps) {
                try {
                    currentModel = currentModel.removeOperation(name, op.name);
                    events.push({
                        type: 'OPERATION_REMOVED',
                        payload: { className: name, operation: op }
                    });
                } catch { /* メソッドが見つからない場合は無視 */ }
            }
        }

        this.model = currentModel;
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll(events);
        return { success: true, model: this.model, events };
    }

    /**
     * ソースクラスのメンバ・メソッドをターゲットクラスに統合し、ソースクラスを削除する。
     */
    applyInlineClass(input: {
        sourceClass: string,
        targetClass: string
    }): HandlerResult {
        const events: DomainEvent[] = [];
        let currentModel = this.model;

        const source = currentModel.findClassByName(input.sourceClass);
        if (!source) {
            throw new DomainRuleViolation(`"${input.sourceClass}" が見つかりません`);
        }
        const target = currentModel.findClassByName(input.targetClass);
        if (!target) {
            throw new DomainRuleViolation(`"${input.targetClass}" が見つかりません`);
        }

        // ソースのメンバをターゲットに追加
        for (const m of source.members) {
            // 重複チェック: ターゲットに同名メンバが無い場合のみ追加
            const existing = currentModel.findClassByName(input.targetClass)!;
            if (!existing.members.some(em => em.name === m.name)) {
                const newMember: ClassMember = {
                    id: createId(),
                    name: m.name,
                    type: m.type,
                    visibility: m.visibility,
                    isStatic: m.isStatic,
                    isAbstract: m.isAbstract,
                    relationship: m.relationship,
                    sourceMultiplicity: m.sourceMultiplicity,
                    targetMultiplicity: m.targetMultiplicity
                };
                currentModel = currentModel.addMember(input.targetClass, newMember);
                events.push({
                    type: 'MEMBER_ADDED',
                    payload: { className: input.targetClass, member: newMember }
                });
            }
        }

        // ソースのメソッドをターゲットに追加
        for (const op of source.operations) {
            const existing = currentModel.findClassByName(input.targetClass)!;
            if (!existing.operations.some(eo => eo.name === op.name)) {
                const newOp: ClassOperation = {
                    id: createId(),
                    name: op.name,
                    returnType: op.returnType,
                    visibility: op.visibility,
                    parameters: op.parameters.map(p => ({ ...p, id: createId() })),
                    isStatic: op.isStatic,
                    isAbstract: op.isAbstract
                };
                currentModel = currentModel.addOperation(input.targetClass, newOp);
                events.push({
                    type: 'OPERATION_ADDED',
                    payload: { className: input.targetClass, operation: newOp }
                });
            }
        }

        // ソースクラスを削除
        currentModel = currentModel.removeClassByName(input.sourceClass);
        events.push({
            type: 'TYPE_REMOVED',
            payload: { className: input.sourceClass }
        });

        this.model = currentModel;
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll(events);
        return { success: true, model: this.model, events };
    }

    /**
     * ソースクラスを分割するための新しいクラスをシェルとして生成し、関連を追加する。
     */
    applySplitClass(input: {
        sourceClass: string,
        newNames: string[]
    }): HandlerResult {
        const events: DomainEvent[] = [];
        let currentModel = this.model;

        const source = currentModel.findClassByName(input.sourceClass);
        if (!source) {
            throw new DomainRuleViolation(`"${input.sourceClass}" が見つかりません`);
        }

        // 分割先クラスをシェルとして生成し、ソースとの関連メンバを追加
        for (const name of input.newNames) {
            currentModel = currentModel.registerClass(name, 'class');
            const newClass = currentModel.findClassByName(name)!;
            events.push({
                type: 'TYPE_ADDED',
                payload: { className: name, classInfo: newClass }
            });

            // ソースクラスに分割先への参照メンバを追加
            const refMember: ClassMember = {
                id: createId(),
                name: this.toCamelCase(name),
                visibility: 'private',
                type: name,
                isStatic: false,
                isAbstract: false,
                relationship: 'association',
                sourceMultiplicity: '',
                targetMultiplicity: ''
            };
            currentModel = currentModel.addMember(input.sourceClass, refMember);
            events.push({
                type: 'MEMBER_ADDED',
                payload: { className: input.sourceClass, member: refMember }
            });
        }

        this.model = currentModel;
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll(events);
        return { success: true, model: this.model, events };
    }

    /**
     * 依存性逆転: Client→Concrete の直接依存をインターフェース経由に変換する。
     *
     * 1. Concrete の public メソッドから I<Concrete> インターフェースを抽出
     * 2. Concrete に I<Concrete> の implements を追加
     * 3. Client のメンバ型・パラメータ型・戻り値型で Concrete → I<Concrete> に書き換え
     */
    applyInvertDependency(input: {
        clientClass: string,
        concreteClass: string,
        interfaceName?: string
    }): HandlerResult {
        const events: DomainEvent[] = [];
        let currentModel = this.model;

        const client = currentModel.findClassByName(input.clientClass);
        if (!client) {
            throw new DomainRuleViolation(`クラス "${input.clientClass}" が見つかりません`);
        }
        const concrete = currentModel.findClassByName(input.concreteClass);
        if (!concrete) {
            throw new DomainRuleViolation(`クラス "${input.concreteClass}" が見つかりません`);
        }

        const ifaceName = input.interfaceName ?? `I${input.concreteClass}`;

        // ── 1. インターフェース抽出 ─────────────────────
        const publicOps = concrete.operations.filter(op => op.visibility === 'public');

        // 同名インターフェースが既に存在する場合は作成をスキップ
        let iface = currentModel.findClassByName(ifaceName);
        if (!iface) {
            currentModel = currentModel.registerClass(ifaceName, 'interface');
            iface = currentModel.findClassByName(ifaceName)!;
            events.push({
                type: 'TYPE_ADDED',
                payload: { className: ifaceName, classInfo: iface }
            });

            for (const op of publicOps) {
                const ifaceOp: ClassOperation = {
                    id: createId(),
                    name: op.name,
                    returnType: op.returnType,
                    visibility: 'public',
                    parameters: op.parameters.map(p => ({ ...p, id: createId() })),
                    isStatic: false,
                    isAbstract: true
                };
                currentModel = currentModel.addOperation(ifaceName, ifaceOp);
                events.push({
                    type: 'OPERATION_ADDED',
                    payload: { className: ifaceName, operation: ifaceOp }
                });
            }
        }

        // ── 2. Concrete に implements を追加 ────────────
        const updatedIface = currentModel.findClassByName(ifaceName)!;
        if (!concrete.interfaces.includes(updatedIface.id)) {
            currentModel = currentModel.addInterfaceImplementation(concrete.id, updatedIface.id);
            events.push({
                type: 'IMPLEMENTED_INTERFACE_ADDED',
                payload: { className: input.concreteClass, interfaceName: ifaceName }
            });
        }

        // ── 3. Client の参照型を書き換え ─────────────────
        const concreteName = input.concreteClass;
        currentModel = currentModel.updateClassByName(input.clientClass, cls => {
            const updatedMembers = cls.members.map(m => {
                const base = extractBaseTypeName(m.type);
                if (base === concreteName) {
                    return { ...m, type: m.type.replace(concreteName, ifaceName) };
                }
                return m;
            });
            const updatedOps = cls.operations.map(op => {
                let changed = false;
                let newReturnType = op.returnType;
                const returnBase = extractBaseTypeName(op.returnType);
                if (returnBase === concreteName) {
                    newReturnType = op.returnType.replace(concreteName, ifaceName);
                    changed = true;
                }
                const newParams = op.parameters.map(p => {
                    const pBase = extractBaseTypeName(p.type);
                    if (pBase === concreteName) {
                        return { ...p, type: p.type.replace(concreteName, ifaceName) };
                    }
                    return p;
                });
                if (changed || newParams !== op.parameters) {
                    return { ...op, returnType: newReturnType, parameters: newParams };
                }
                return op;
            });
            return { ...cls, members: updatedMembers, operations: updatedOps };
        });
        events.push({
            type: 'CLASS_UPDATED',
            payload: { className: input.clientClass }
        });

        this.model = currentModel;
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll(events);
        return { success: true, model: this.model, events };
    }

    /**
     * 循環依存の解消: ClassA⇔ClassB の循環を検出し、
     * ClassB 側にインターフェースを導入して ClassA→I<ClassB>←ClassB に変換する。
     */
    applyResolveCircular(input: {
        classA: string,
        classB: string
    }): HandlerResult {
        const currentModel = this.model;

        const classA = currentModel.findClassByName(input.classA);
        if (!classA) {
            throw new DomainRuleViolation(`クラス "${input.classA}" が見つかりません`);
        }
        const classB = currentModel.findClassByName(input.classB);
        if (!classB) {
            throw new DomainRuleViolation(`クラス "${input.classB}" が見つかりません`);
        }

        // ── 循環依存の確認 ────────────────────────────
        const hasDep = (from: ClassInfo, toName: string): boolean => {
            // メンバ型に toName が含まれるか
            for (const m of from.members) {
                if (extractBaseTypeName(m.type) === toName) return true;
            }
            // 操作パラメータ・戻り値型に含まれるか
            for (const op of from.operations) {
                if (extractBaseTypeName(op.returnType) === toName) return true;
                for (const p of op.parameters) {
                    if (extractBaseTypeName(p.type) === toName) return true;
                }
            }
            return false;
        };

        const aToB = hasDep(classA, input.classB);
        const bToA = hasDep(classB, input.classA);

        if (!aToB || !bToA) {
            throw new DomainRuleViolation(
                `"${input.classA}" と "${input.classB}" の間に循環依存が検出されませんでした`
            );
        }

        // ── DIP を適用して A→B の直接依存を解消 ──────────
        return this.applyInvertDependency({
            clientClass: input.classA,
            concreteClass: input.classB
        });
    }


    applyResolveCircularInheritance(input: {
        classA: string,
        classB: string
    }): HandlerResult {
        const events: DomainEvent[] = [];
        let currentModel = this.model;

        const classA = currentModel.findClassByName(input.classA);
        if (!classA) {
            throw new DomainRuleViolation('Class "' + input.classA + '" not found');
        }
        const classB = currentModel.findClassByName(input.classB);
        if (!classB) {
            throw new DomainRuleViolation('Class "' + input.classB + '" not found');
        }

        const visited = new Set<string>();
        let cur: import('../class-diagram-types').ClassInfo | undefined = classA;
        let hasCycle = false;
        while (cur && cur.baseClassId) {
            if (visited.has(cur.id)) {
                hasCycle = true;
                break;
            }
            visited.add(cur.id);
            cur = currentModel.getClasses().find(c => c.id === cur!.baseClassId);
        }

        if (!hasCycle) {
            throw new DomainRuleViolation(
                'No circular inheritance detected between "' + input.classA + '" and "' + input.classB + '"'
            );
        }

        currentModel = currentModel.updateClassByName(input.classB, cls => ({
            ...cls,
            baseClassId: null
        }));
        events.push({
            type: 'BASE_CLASS_REMOVED',
            payload: { className: input.classB }
        });

        const aOps = classA.operations.filter(op => op.visibility === 'public');
        const bOps = classB.operations.filter(op => op.visibility === 'public');
        const commonOps = aOps.filter(aOp =>
            bOps.some(bOp => bOp.name === aOp.name && bOp.returnType === aOp.returnType)
        );

        if (commonOps.length > 0) {
            const ifaceName = 'I' + input.classA + input.classB + 'Common';

            currentModel = currentModel.registerClass(ifaceName, 'interface');
            const iface = currentModel.findClassByName(ifaceName)!;
            events.push({
                type: 'TYPE_ADDED',
                payload: { className: ifaceName, classInfo: iface }
            });

            for (const op of commonOps) {
                const ifaceOp: ClassOperation = {
                    id: createId(),
                    name: op.name,
                    returnType: op.returnType,
                    visibility: 'public',
                    parameters: op.parameters.map(p => ({ ...p, id: createId() })),
                    isStatic: false,
                    isAbstract: true
                };
                currentModel = currentModel.addOperation(ifaceName, ifaceOp);
                events.push({
                    type: 'OPERATION_ADDED',
                    payload: { className: ifaceName, operation: ifaceOp }
                });
            }

            const updatedIface = currentModel.findClassByName(ifaceName)!;
            for (const name of [input.classA, input.classB]) {
                const cls = currentModel.findClassByName(name)!;
                if (!cls.interfaces.includes(updatedIface.id)) {
                    currentModel = currentModel.addInterfaceImplementation(cls.id, updatedIface.id);
                    events.push({
                        type: 'IMPLEMENTED_INTERFACE_ADDED',
                        payload: { className: name, interfaceName: ifaceName }
                    });
                }
            }
        }

        this.model = currentModel;
        this.notifyModelChanged();
        this.dispatcher?.dispatchAll(events);
        return { success: true, model: this.model, events };
    }

    /**
     * 型名を一括リネームする。
     */
    applyRenameType(input: {
        oldName: string,
        newName: string
    }): HandlerResult {
        return this.applyRename({
            target: 'type',
            oldName: input.oldName,
            newName: input.newName
        });
    }

    toPasscalName(name: string): string {
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    toCamelCase(name: string): string {
        return name.charAt(0).toLowerCase() + name.slice(1);
    }
}