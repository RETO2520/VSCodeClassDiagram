/**
 * command-handlers.ts
 * 
 * 全てのコマンドハンドラーの実装
 * executeAction の switch 文を撤廃し、ハンドラーパターンに移行
 */

import { DomainModel } from '../DomainModel'
import { CommandHandler, HandlerRegistry } from '../handler-registry'
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

export const CommandTypes = {
    ADD_ATTR: 'ADD_ATTR',
    ADD_TYPE: 'ADD_TYPE',
    ADD_METHOD: 'ADD_METHOD',
    ADD_PARAM: 'ADD_PARAM',
    SET_BASE: 'SET_BASE',
    SET_IMPL: 'SET_IMPL',
    RENAME: 'RENAME',
    DELETE: 'DELETE',
} as const
/* ============================
   Utility Functions
============================ */

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
    readonly commandType = CommandTypes.ADD_TYPE

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
    readonly commandType = CommandTypes.ADD_ATTR

    execute(command: AddAttrCommand, model: DomainModel): DomainModel {

        // 属性を作成
        const newAttr = createEmptyMember()
        newAttr.name = command.name
        newAttr.type = command.dataType || 'string'
        newAttr.visibility = command.visibility
        newAttr.isStatic = command.modifier === 'static'

        // 属性を追加
        return model.addMember(command.className, newAttr)
    }
}

/**
 * ADD_METHOD ハンドラー
 * クラスにメソッド(操作)を追加
 */
export class AddMethodHandler implements CommandHandler<AddMethodCommand> {
    readonly commandType = CommandTypes.ADD_METHOD

    execute(command: AddMethodCommand, model: DomainModel): DomainModel {

        // メソッドを作成
        const newOp = createEmptyOperation()
        newOp.name = command.name
        newOp.returnType = command.returnType || 'void'
        newOp.visibility = command.visibility;
        newOp.isStatic = command.modifier === 'static'

        // メソッドを追加
        return model.addOperation(command.className, newOp)
    }
}

/**
 * ADD_PARAM ハンドラー
 * メソッドにパラメータを追加
 */
export class AddParamHandler implements CommandHandler<AddParamCommand> {
    readonly commandType = CommandTypes.ADD_PARAM

    execute(command: AddParamCommand, model: DomainModel): DomainModel {


        // パラメータを作成
        const newParam = createEmptyParameter()
        newParam.name = command.name
        newParam.type = command.dataType || 'string'

        // パラメータを追加
        return model.addParameter(command.className, command.methodName, newParam)
    }
}

/**
 * SET_BASE ハンドラー
 * クラスの基底クラスを設定
 */
export class SetBaseHandler implements CommandHandler<SetBaseCommand> {
    readonly commandType = CommandTypes.SET_BASE

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
    readonly commandType = CommandTypes.SET_IMPL

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
    readonly commandType = CommandTypes.RENAME

    execute(command: RenameCommand, model: DomainModel): DomainModel {
        if (command.target === 'c') {
            return model.renameClass(command.oldName, command.newName)
        }

        if (command.target === 'a') {
            return model.updateMember(command.className, command.oldName, m => ({
                ...m,
                name: command.newName
            }))
        }

        if (command.target === 'm') {
            return model.updateOperation(command.className, command.oldName, op => ({
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
    readonly commandType = CommandTypes.DELETE

    execute(command: DeleteCommand, model: DomainModel): DomainModel {
        if (command.target === 'c') {
            // クラス削除
            return model.removeClassByName(command.className)
        }

        if (command.target === 'a' && command.name) {
            // 属性削除
            return model.removeMember(command.className, command.name)
        }

        if (command.target === 'm' && command.name) {
            // メソッド削除
            return model.removeOperation(command.className, command.name)
        }

        return model
    }
}

/* ============================
   Handler Factory
============================ */

/**
 * 全ハンドラーを登録したレジストリを生成
 * @returns 全ハンドラーが登録された HandlerRegistry
 */
export function createHandlerRegistry(
    extraHandlers: CommandHandler[] = []
): HandlerRegistry {
    const registry = new HandlerRegistry()
    const coreHandlers = [
        new AddTypeHandler(),
        new AddAttrHandler(),
        new AddMethodHandler(),
        new AddParamHandler(),
        new SetBaseHandler(),
        new SetImplHandler(),
        new RenameHandler(),
        new DeleteHandler(),
    ];
    // 全ハンドラーを登録
    [...coreHandlers, ...extraHandlers].forEach(handler => registry.register(handler))
    return registry
}

/**
 * 全ハンドラーを配列で返す
 * HandlerRegistry.registerAll() で使用可能
 * 
 * @returns CommandHandler の配列
 */
export function createAllHandlers(): CommandHandler[] {
    return [
        new AddTypeHandler(),
        new AddAttrHandler(),
        new AddMethodHandler(),
        new AddParamHandler(),
        new SetBaseHandler(),
        new SetImplHandler(),
        new RenameHandler(),
        new DeleteHandler(),
    ]
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