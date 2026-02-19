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
import { createId } from '../class-diagram-types';
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
        console.log('Model changed, notifying listeners...'); // log for debugging
        for (const l of this.modelChangedListeners) {
            console.log('Notifying listener...', l); // log for debugging
            try { l() } catch (e) { console.error('modelChanged listener error', e) }
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
        console.log(`applyAddType: ${input.name} (${input.kind})`); // log input for debugging
        const existing = this.model.findClassByName(input.name)

        if (existing) {
            console.log(`Class ${input.name} already exists, treating as update`); // log for debugging
            // If class already exists, treat as update (set kind/isAbstract)
            const updated = this.model.updateClassByName(input.name, cls => ({ ...cls, kind: input.kind, isAbstract: !!input.isAbstract }))
            const ev: DomainEvent = {
                type: 'TYPE_UPDATED',
                payload: { className: input.name, classInfo: updated.findClassByName(input.name)! }
            }
            this.model = updated
            this.notifyModelChanged();
            this.dispatcher?.dispatchAll([ev])
            return { model: this.model, events: [ev] }
        }

        // create new class
        let currentModel = this.model
        currentModel = currentModel.registerClass(input.name, input.kind)
        console.log(`Registered new class: ${input.name} (${input.kind})`); // log for debugging
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
        this.dispatcher?.dispatchAll([event])
        return { model: this.model, events: [event] }
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
        return { model: this.model, events: [event] }
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
        return { model: this.model, events: [event] }
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
        return { model: this.model, events: [event] }
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
        return { model: this.model, events: [event] }
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
        return { model: this.model, events: [event] }
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
            return { model: this.model, events: [event] }
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
            return { model: this.model, events: [event] }
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
            return { model: this.model, events: [event] }
        }

        return { model: this.model, events: [] }
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
            return { model: this.model, events: [event] }
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
            return { model: this.model, events: [event] }
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
            return { model: this.model, events: [event] }
        }

        return { model: this.model, events: [] }
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
        return { model: this.model, events: [event] }
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
        return { model: this.model, events: [event] }
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
        return { model: this.model, events: [ev] }
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
        return { model: this.model, events: [ev] }
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
        return { model: this.model, events: [ev] }
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
        return { model: this.model, events: [event] }
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
        return { model: this.model, events: [ev] }
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

        return { model: this.model, events };
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

        return { model: this.model, events };
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
        return { model: this.model, events: [] };
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
        return { model: this.model, events: [] };

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
        return { model: this.model, events: [] };
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
        return { model: this.model, events: [] };

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
        return { model: this.model, events: [] };
    }

    toPasscalName(name: string): string {
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    toCamelCase(name: string): string {
        return name.charAt(0).toLowerCase() + name.slice(1);
    }
}

