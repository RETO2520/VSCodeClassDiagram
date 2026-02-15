import { ClassInfo, ClassKind, Visibility as UmlVisibility, createEmptyClass, createEmptyMember, createEmptyOperation, createEmptyParameter } from './class-diagram-types';
import { CliParser, CliCommand, AddTypeCommand, AddAttrCommand, AddMethodCommand, AddParamCommand, SetBaseCommand, SetImplCommand, RenameCommand, DeleteCommand } from './CliParser';

import { DomainModel } from './DomainModel';
import { HandlerRegistry } from './handler-registry';
import { createHandlerRegistry } from './handlers/command-handlers';
const parser = new CliParser();
/**
 * グローバルハンドラーレジストリ
 * アプリケーション起動時に一度だけ初期化
 */
let registry: any = null
/**
 * ハンドラーレジストリを初期化
 */
export function initializeRegistry(): void {
    if (registry) {
        return // 既に初期化済み
    }
    registry = createHandlerRegistry()
}

/**
 * カスタムハンドラーを登録
 * アプリケーション固有のハンドラーを追加する場合に使用
 */
export function registerHandler(handler: any): void {
    if (!registry) {
        initializeRegistry()
    }
    registry.register(handler)
}
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
 * コマンドを実行
 * 
 * 旧 executeAction 関数の置き換え
 * switch 文の代わりにハンドラーレジストリにディスパッチ
 */
export function executeCommand(
    command: CliCommand,
    model: DomainModel
): DomainModel {
    if (!command) {
        return model
    }

    // レジストリが初期化されていない場合は初期化
    if (!registry) {
        initializeRegistry()
    }

    try {
        // ハンドラーにディスパッチ
        return registry.dispatch(command, model)
    } catch (error) {
        console.error(`Failed to execute command: ${command.type}`, error)
        throw error
    }
}
/**
 * バッチでコマンドを実行
 * 複数のコマンドを順次実行
 */
export function executeCommands(
    commands: CliCommand[],
    model: DomainModel
): DomainModel {
    let currentModel = model

    for (const command of commands) {
        currentModel = executeCommand(command, currentModel)
    }

    return currentModel
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
    return executeCommand(command, model)

}