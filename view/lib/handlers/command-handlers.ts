/**
 * command-handlers.ts
 * 
 * 全てのコマンドハンドラーの実装
 * executeAction の switch 文を撤廃し、ハンドラーパターンに移行
 */

import { DomainModel } from '../DomainModel'
import { Command, CommandHandler } from '../handler-registry'
import {
    ClassInfo,
    ClassKind,
    Visibility,
    createId,
    createEmptyMember,
    createEmptyOperation,
    createEmptyParameter,
} from '../class-diagram-types'
import { AddTypeCommand, AddAttrCommand, AddMethodCommand, AddParamCommand, SetBaseCommand, SetImplCommand, RenameCommand, DeleteCommand, CliCommand } from '../CliParser'

/* ============================
   Utility Functions
============================ */

/**
 * 可視性文字列をVisibility型にマッピング
 */
export function mapVisibility(v: string): Visibility {
    switch (v) {
        case 'private': return 'private'
        case 'protected': return 'protected'
        case 'package': return 'package'
        default: return 'public'
    }
}

/**
 * クラスが存在しない場合は作成して返す
 */
export function getOrCreateClass(
    model: DomainModel,
    name: string,
    preferredKind: ClassKind = 'class'
): { updatedModel: DomainModel; target: ClassInfo } {
    let target = model.findClassByName(name)
    if (target) {
        return { updatedModel: model, target }
    }

    // 新しいクラスを作成
    const updatedModel = model.registerClass(name, preferredKind)
    target = updatedModel.findClassByName(name)!

    return { updatedModel, target }
}

/* ============================
   Command Handlers
============================ */

/**
 * ADD_TYPE ハンドラー
 * クラス、抽象クラス、インターフェース、構造体を追加
 */
export class AddTypeHandler implements CommandHandler<AddTypeCommand> {
    readonly commandType = 'ADD_TYPE'

    execute(command: AddTypeCommand, model: DomainModel): DomainModel {
        // 1. メインクラスを取得または作成
        let { updatedModel: currentModel, target: newClass } =
            getOrCreateClass(model, command.name)

        // 2. プロパティを更新
        const kind: ClassKind = (
            command.kind === 'i' ? 'interface' :
                command.kind === 's' ? 'struct' :
                    'class'
        )
        const isAbstract = command.kind === 'ac'

        newClass = { ...newClass, kind, isAbstract }

        // 3. 継承リストの処理
        if (command.extends !== undefined) {
            const interfaces: string[] = []
            let baseClassId: string | null = null

            if (command.extends.length > 0) {
                command.extends.forEach((parentName, index) => {
                    let preferredKind: ClassKind = 'class'

                    // 最初のextendsがインターフェースか判定
                    if (command.kind === 'i' || index > 0 || parentName.match(/^I[A-Z]/)) {
                        preferredKind = 'interface'
                    }

                    const { updatedModel: nextModel, target: parent } =
                        getOrCreateClass(currentModel, parentName, preferredKind)
                    currentModel = nextModel

                    // 親の種類に基づいてリンク
                    if (parent.kind === 'interface') {
                        if (!interfaces.includes(parent.id)) {
                            interfaces.push(parent.id)
                        }
                    } else {
                        if (!baseClassId) {
                            baseClassId = parent.id
                        }
                    }
                })
            }

            newClass = { ...newClass, baseClassId, interfaces }
        }

        // 4. 更新されたクラスを反映
        return currentModel.updateClassByName(command.name, () => newClass)
    }
}

/**
 * ADD_ATTR ハンドラー
 * クラスに属性(メンバー)を追加
 */
export class AddAttrHandler implements CommandHandler<AddAttrCommand> {
    readonly commandType = 'ADD_ATTR'

    execute(command: AddAttrCommand, model: DomainModel): DomainModel {
        // クラスが存在しない場合は警告して終了
        const targetClass = model.findClassByName(command.className)
        if (!targetClass) {
            console.warn(`Class not found: ${command.className}`)
            return model
        }

        // 属性を作成
        const newAttr = createEmptyMember()
        newAttr.name = command.name
        newAttr.type = command.dataType || 'string'
        newAttr.visibility = mapVisibility(command.visibility)
        newAttr.isStatic = command.modifier === 'static'

        // 属性を追加
        return model.addMember(targetClass.id, newAttr)
    }
}

/**
 * ADD_METHOD ハンドラー
 * クラスにメソッド(操作)を追加
 */
export class AddMethodHandler implements CommandHandler<AddMethodCommand> {
    readonly commandType = 'ADD_METHOD'

    execute(command: AddMethodCommand, model: DomainModel): DomainModel {
        // クラスが存在しない場合は警告して終了
        const targetClass = model.findClassByName(command.className)
        if (!targetClass) {
            console.warn(`Class not found: ${command.className}`)
            return model
        }

        // メソッドを作成
        const newOp = createEmptyOperation()
        newOp.name = command.name
        newOp.returnType = command.returnType || 'void'
        newOp.visibility = mapVisibility(command.visibility)
        newOp.isStatic = command.modifier === 'static'

        // メソッドを追加
        return model.addOperation(targetClass.id, newOp)
    }
}

/**
 * ADD_PARAM ハンドラー
 * メソッドにパラメータを追加
 */
export class AddParamHandler implements CommandHandler<AddParamCommand> {
    readonly commandType = 'ADD_PARAM'

    execute(command: AddParamCommand, model: DomainModel): DomainModel {
        // クラスが存在しない場合は警告して終了
        const targetClass = model.findClassByName(command.className)
        if (!targetClass) {
            console.warn(`Class not found: ${command.className}`)
            return model
        }

        // メソッドを検索
        const operation = targetClass.operations.find(
            op => op.name === command.methodName
        )
        if (!operation) {
            console.warn(`Method not found: ${command.methodName} in ${command.className}`)
            return model
        }

        // パラメータを作成
        const newParam = createEmptyParameter()
        newParam.name = command.name
        newParam.type = command.dataType || 'string'

        // パラメータを追加
        return model.addParameter(targetClass.id, operation.id, newParam)
    }
}

/**
 * SET_BASE ハンドラー
 * クラスの基底クラスを設定
 */
export class SetBaseHandler implements CommandHandler<SetBaseCommand> {
    readonly commandType = 'SET_BASE'

    execute(command: SetBaseCommand, model: DomainModel): DomainModel {
        // 1. ターゲットクラスを確保
        let { updatedModel: currentModel, target: cls } =
            getOrCreateClass(model, command.className)

        // 2. 親クラスを確保
        const { updatedModel: afterParent, target: parent } =
            getOrCreateClass(currentModel, command.baseClassName, 'class')
        currentModel = afterParent

        // 3. 継承関係を設定
        return currentModel.setBaseClass(cls.id, parent.id)
    }
}

/**
 * SET_IMPL ハンドラー
 * クラスのインターフェース実装を設定
 */
export class SetImplHandler implements CommandHandler<SetImplCommand> {
    readonly commandType = 'SET_IMPL'

    execute(command: SetImplCommand, model: DomainModel): DomainModel {
        // 1. ターゲットクラスを確保
        let { updatedModel: currentModel, target: cls } =
            getOrCreateClass(model, command.className)

        // 2. インターフェースを確保
        const { updatedModel: afterIface, target: iface } =
            getOrCreateClass(currentModel, command.interfaceName, 'interface')
        currentModel = afterIface

        // 3. インターフェース実装を設定
        return currentModel.addInterfaceImplementation(cls.id, iface.id)
    }
}

/**
 * RENAME ハンドラー
 * クラス、属性、メソッドの名前を変更
 */
export class RenameHandler implements CommandHandler<RenameCommand> {
    readonly commandType = 'RENAME'

    execute(command: RenameCommand, model: DomainModel): DomainModel {
        if (command.target === 'c') {
            // クラス名変更
            const targetClass = model.findClassByName(command.oldName)
            if (!targetClass) {
                console.warn(`Class not found: ${command.oldName}`)
                return model
            }
            return model.renameClass(targetClass.id, command.newName)
        }

        // 属性またはメソッドの名前変更
        if (!command.className) {
            console.warn('className is required for attribute/method rename')
            return model
        }

        const targetClass = model.findClassByName(command.className)
        if (!targetClass) {
            console.warn(`Class not found: ${command.className}`)
            return model
        }

        if (command.target === 'a') {
            // 属性の名前変更
            const member = targetClass.members.find(m => m.name === command.oldName)
            if (!member) {
                console.warn(`Attribute not found: ${command.oldName}`)
                return model
            }
            return model.updateMember(targetClass.id, member.id, m => ({
                ...m,
                name: command.newName
            }))
        }

        if (command.target === 'm') {
            // メソッドの名前変更
            const operation = targetClass.operations.find(op => op.name === command.oldName)
            if (!operation) {
                console.warn(`Method not found: ${command.oldName}`)
                return model
            }
            return model.updateOperation(targetClass.id, operation.id, op => ({
                ...op,
                name: command.newName
            }))
        }

        return model
    }
}

/**
 * DELETE ハンドラー
 * クラス、属性、メソッドを削除
 */
export class DeleteHandler implements CommandHandler<DeleteCommand> {
    readonly commandType = 'DELETE'

    execute(command: DeleteCommand, model: DomainModel): DomainModel {
        if (command.target === 'c') {
            // クラス削除
            const targetClass = model.findClassByName(command.className)
            if (!targetClass) {
                console.warn(`Class not found: ${command.className}`)
                return model
            }
            return model.removeClass(targetClass.id)
        }

        // 属性またはメソッドの削除
        const targetClass = model.findClassByName(command.className)
        if (!targetClass) {
            console.warn(`Class not found: ${command.className}`)
            return model
        }

        if (command.target === 'a' && command.name) {
            // 属性削除
            const member = targetClass.members.find(m => m.name === command.name)
            if (!member) {
                console.warn(`Attribute not found: ${command.name}`)
                return model
            }
            return model.removeMember(targetClass.id, member.id)
        }

        if (command.target === 'm' && command.name) {
            // メソッド削除
            const operation = targetClass.operations.find(op => op.name === command.name)
            if (!operation) {
                console.warn(`Method not found: ${command.name}`)
                return model
            }
            return model.removeOperation(targetClass.id, operation.id)
        }

        return model
    }
}

/* ============================
   Handler Factory
============================ */

/**
 * 全ハンドラーを登録したレジストリを生成
 */
export function createHandlerRegistry(): any {
    // handler-registry.ts の HandlerRegistry を想定
    // 実際の型は handler-registry.ts に依存
    const registry = {
        handlers: new Map<string, CommandHandler>(),

        register(handler: CommandHandler): void {
            if (this.handlers.has(handler.commandType)) {
                throw new Error(
                    `Handler already registered for ${handler.commandType}`
                )
            }
            this.handlers.set(handler.commandType, handler)
        },

        dispatch(command: CliCommand, model: DomainModel): DomainModel {
            const handler = this.handlers.get(command.type)
            if (!handler) {
                throw new Error(
                    `No handler registered for ${command.type}`
                )
            }
            return handler.execute(command, model)
        }
    }

    // 全ハンドラーを登録
    registry.register(new AddTypeHandler())
    registry.register(new AddAttrHandler())
    registry.register(new AddMethodHandler())
    registry.register(new AddParamHandler())
    registry.register(new SetBaseHandler())
    registry.register(new SetImplHandler())
    registry.register(new RenameHandler())
    registry.register(new DeleteHandler())

    return registry
}

/* ============================
   Exports
============================ */

export const handlers = {
    AddTypeHandler,
    AddAttrHandler,
    AddMethodHandler,
    AddParamHandler,
    SetBaseHandler,
    SetImplHandler,
    RenameHandler,
    DeleteHandler,
}