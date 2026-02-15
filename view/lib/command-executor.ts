import { ClassInfo, ClassKind, Visibility as UmlVisibility, createEmptyClass, createEmptyMember, createEmptyOperation, createEmptyParameter } from './class-diagram-types';
import { CliParser, CliCommand, AddTypeCommand, AddAttrCommand, AddMethodCommand, AddParamCommand, SetBaseCommand, SetImplCommand, RenameCommand, DeleteCommand } from './CliParser';

import { DomainModel } from './DomainModel';

const parser = new CliParser();

export function parseCommand(input: string): CliCommand | null {
    return parser.parse(input);
}

function mapVisibility(v: string): UmlVisibility {
    switch (v) {
        case 'private': return 'private';
        case 'protected': return 'protected';
        case 'package': return 'package';
        default: return 'public';
    }
}

/**
 * Ensures a class exists in the state, creating it if necessary.
 * Returns the class.
 */
function getOrCreateClass(model: DomainModel, name: string, preferredKind: ClassKind = 'class'): { updatedModel: DomainModel, target: ClassInfo } {
    let target = model.findClassByName(name);
    if (target) {
        return { updatedModel: model, target };
    }

    // Create new class
    const newClass = createEmptyClass();
    newClass.name = name;
    newClass.kind = preferredKind;
    if (preferredKind === 'interface') {
        newClass.isAbstract = false; // interfaces are interfaces
    }

    return {
        updatedModel: model.addClass(newClass),
        target: newClass
    };
}
export function executeAction(
    command: CliCommand,
    model: DomainModel
): DomainModel {
    if (!command) return model;

    switch (command.type) {
        case 'ADD_TYPE': {
            const addType = command as AddTypeCommand;

            // 1. メインクラスを取得または作成
            let { updatedModel: currentModel, target: newClass } =
                getOrCreateClass(model, addType.name);

            // 2. プロパティを更新
            newClass.kind = (
                addType.kind === 'i' ? 'interface' :
                    addType.kind === 's' ? 'struct' :
                        'class'
            ) as ClassKind;
            newClass.isAbstract = (addType.kind === 'ac');

            // 3. 継承リストの処理
            if (addType.extends !== undefined) {
                newClass.baseClassId = null;
                newClass.interfaces = [];

                if (addType.extends.length > 0) {
                    addType.extends.forEach((parentName, index) => {
                        let preferredKind: ClassKind = 'class';
                        if (addType.kind === 'i' || index > 0 || parentName.match(/^I[A-Z]/)) {
                            preferredKind = 'interface';
                        }

                        const { updatedModel: nextModel, target: parent } =
                            getOrCreateClass(currentModel, parentName, preferredKind);
                        currentModel = nextModel;

                        // 親の種類に基づいてリンク
                        if (parent.kind === 'interface') {
                            if (!newClass.interfaces.includes(parent.id)) {
                                newClass.interfaces = [...newClass.interfaces, parent.id];
                            }
                        } else {
                            if (!newClass.baseClassId) {
                                newClass.baseClassId = parent.id;
                            }
                        }
                    });
                }
            }

            // 4. 更新されたクラスを反映
            return currentModel.updateClassByName(addType.name, () => newClass);
        }

        case 'ADD_ATTR': {
            const addAttr = command as AddAttrCommand;

            // クラスが存在しない場合は警告して終了
            if (!model.findClassByName(addAttr.className)) {
                console.warn(`Class not found: ${addAttr.className}`);
                return model;
            }

            // 属性を追加
            return model.updateClassByName(addAttr.className, cls => {
                const newAttr = createEmptyMember();
                newAttr.name = addAttr.name;
                newAttr.type = addAttr.dataType || 'string';
                newAttr.visibility = mapVisibility(addAttr.visibility);
                newAttr.isStatic = addAttr.modifier === 'static';

                return { ...cls, members: [...cls.members, newAttr] };
            });
        }

        case 'ADD_METHOD': {
            const addMethod = command as AddMethodCommand;

            // クラスが存在しない場合は警告して終了
            if (!model.findClassByName(addMethod.className)) {
                console.warn(`Class not found: ${addMethod.className}`);
                return model;
            }

            // メソッドを追加
            return model.updateClassByName(addMethod.className, cls => {
                const newOp = createEmptyOperation();
                newOp.name = addMethod.name;
                newOp.returnType = addMethod.returnType || 'void';
                newOp.visibility = mapVisibility(addMethod.visibility);
                newOp.isStatic = addMethod.modifier === 'static';

                return { ...cls, operations: [...cls.operations, newOp] };
            });
        }

        case 'ADD_PARAM': {
            const addParam = command as AddParamCommand;

            // クラスが存在しない場合は警告して終了
            if (!model.findClassByName(addParam.className)) {
                console.warn(`Class not found: ${addParam.className}`);
                return model;
            }

            // パラメータを追加
            return model.updateClassByName(addParam.className, cls => ({
                ...cls,
                operations: cls.operations.map(op => {
                    if (op.name === addParam.methodName) {
                        const newParam = createEmptyParameter();
                        newParam.name = addParam.name;
                        newParam.type = addParam.dataType || 'string';
                        return { ...op, parameters: [...op.parameters, newParam] };
                    }
                    return op;
                })
            }));
        }

        case 'SET_BASE': {
            const setBase = command as SetBaseCommand;

            // 1. ターゲットクラスを確保
            let { updatedModel: currentModel, target: cls } =
                getOrCreateClass(model, setBase.className);

            // 2. 親クラスを確保
            const { updatedModel: afterParent, target: parent } =
                getOrCreateClass(currentModel, setBase.baseClassName, 'class');
            currentModel = afterParent;

            // 3. 継承関係を設定
            return currentModel.updateClassByName(setBase.className, c => ({
                ...c,
                baseClassId: parent.id
            }));
        }

        case 'SET_IMPL': {
            const setImpl = command as SetImplCommand;

            // 1. ターゲットクラスを確保
            let { updatedModel: currentModel, target: cls } =
                getOrCreateClass(model, setImpl.className);

            // 2. インターフェースを確保
            const { updatedModel: afterIface, target: iface } =
                getOrCreateClass(currentModel, setImpl.interfaceName, 'interface');
            currentModel = afterIface;

            // 3. インターフェース実装を設定
            return currentModel.updateClassByName(setImpl.className, c => {
                if (!c.interfaces.includes(iface.id)) {
                    return { ...c, interfaces: [...c.interfaces, iface.id] };
                }
                return c;
            });
        }

        case 'RENAME': {
            const rename = command as RenameCommand;

            if (rename.target === 'c') {
                // クラス名変更
                return model.updateClassByName(rename.oldName, c => ({
                    ...c,
                    name: rename.newName
                }));
            }

            // 属性またはメソッドの名前変更
            return model.updateClassByName(rename.className, cls => {
                if (rename.target === 'a') {
                    // 属性の名前変更
                    return {
                        ...cls,
                        members: cls.members.map(m =>
                            m.name === rename.oldName ? { ...m, name: rename.newName } : m
                        )
                    };
                }

                if (rename.target === 'm') {
                    // メソッドの名前変更
                    return {
                        ...cls,
                        operations: cls.operations.map(o =>
                            o.name === rename.oldName ? { ...o, name: rename.newName } : o
                        )
                    };
                }

                return cls;
            });
        }

        case 'DELETE': {
            const del = command as DeleteCommand;

            if (del.target === 'c') {
                // クラス削除
                return model.removeClassByName(del.className);
            }

            // 属性またはメソッドの削除
            return model.updateClassByName(del.className, cls => {
                if (del.target === 'a') {
                    // 属性削除
                    return {
                        ...cls,
                        members: cls.members.filter(m => m.name !== del.name)
                    };
                }

                if (del.target === 'm') {
                    // メソッド削除
                    return {
                        ...cls,
                        operations: cls.operations.filter(o => o.name !== del.name)
                    };
                }

                return cls;
            });
        }

        case 'RELATION': {
            // TODO: 関係性の処理は将来実装
            console.warn('RELATION command not yet implemented');
            return model;
        }

        default:
            console.warn(`Unknown command type: ${(command as any).type}`);
            return model;
    }
}