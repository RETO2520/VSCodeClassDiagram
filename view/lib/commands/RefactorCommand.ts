import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { CliCommandType } from '../CliParser';
import { postMessage } from '../../../frontend/src/bridge/vscode-bridge';
import { SpecSyncCommand } from './SpecSyncCommand';

export class RefactorCommand extends Command {
    readonly type: CliCommandType = 'REFACTOR';

    constructor(raw: string, readonly params: RefactorParams, readonly sync: boolean = false) {
        super(raw);
    }

    execute(model: DomainModel): HandlerResult {
        const service = new ClassDiagramService(model);
        return this.executeFromService(service);
    }

    executeFromService(service: ClassDiagramService): HandlerResult {
        postMessage({ command: 'log', level: 'info', text: 'RefactorCommand: ' + this.params.kind });

        let refactorResult: HandlerResult | undefined;

        try {
            switch (this.params.kind) {
                case 'extract-interface': {
                    const { className, interfaceName } = this.params;
                    const result = service.applyExtractInterface({ className, interfaceName });
                    refactorResult = {
                        ...result,
                        message: `${interfaceName} を抽出し、${className} に implements を追加しました`
                    };
                    break;
                }

                case 'extract-superclass': {
                    const { classNames, superName } = this.params;
                    const result = service.applyExtractSuperclass({ classNames, superName });
                    refactorResult = {
                        ...result,
                        message: `${superName} を作成し、共通メンバを引き上げました`
                    };
                    break;
                }

                case 'inline-class': {
                    const { sourceClass, targetClass } = this.params;
                    const result = service.applyInlineClass({ sourceClass, targetClass });
                    refactorResult = {
                        ...result,
                        message: `${sourceClass} のメンバを ${targetClass} にインライン化し、削除しました`
                    };
                    break;
                }

                case 'split-class': {
                    const { sourceClass, newNames } = this.params;
                    const result = service.applySplitClass({ sourceClass, newNames });
                    refactorResult = {
                        ...result,
                        message: `${sourceClass} の分割先 [${newNames.join(', ')}] を生成しました。メンバを移動してください。`
                    };
                    break;
                }

                case 'rename-type': {
                    const { oldName, newName } = this.params;
                    const result = service.applyRenameType({ oldName, newName });
                    refactorResult = {
                        ...result,
                        message: `${oldName} → ${newName} に一括リネームしました`
                    };
                    break;
                }

                case 'invert-dependency': {
                    const { clientClass, concreteClass } = this.params;
                    const result = service.applyInvertDependency({ clientClass, concreteClass });
                    refactorResult = {
                        ...result,
                        message: `${clientClass} → I${concreteClass} ← ${concreteClass} に依存性を逆転しました`
                    };
                    break;
                }

                case 'resolve-circular': {
                    const { classA, classB } = this.params;
                    const result = service.applyResolveCircular({ classA, classB });
                    refactorResult = {
                        ...result,
                        message: `${classA} ⇔ ${classB} の循環依存を I${classB} の導入で解消しました`
                    };
                    break;
                }

                case 'resolve-circular-inheritance': {
                    const { classA, classB } = this.params;
                    const result = service.applyResolveCircularInheritance({ classA, classB });
                    refactorResult = {
                        ...result,
                        message: `${classA} ⇔ ${classB} の循環継承を解消しました`
                    };
                    break;
                }
            }
        } catch (err: any) {
            return {
                success: false,
                message: err?.message ?? String(err),
                model: service.getModel(),
                events: []
            };
        }

        if (!refactorResult) {
            return { success: false, model: service.getModel(), events: [] };
        }

        return this.appendSyncIfNeeded(refactorResult);
    }

    /**
     * リファクタリング成功後、sync オプションが有効なら SpecSyncCommand を実行して
     * payload.dsl を結果にマージする。
     */
    private appendSyncIfNeeded(result: HandlerResult): HandlerResult {
        if (!this.sync || !result.success) return result;

        const syncCmd = new SpecSyncCommand('spec-sync');
        const syncResult = syncCmd.execute(result.model);
        if (syncResult.success && syncResult.payload?.dsl) {
            return {
                ...result,
                payload: { ...result.payload, dsl: syncResult.payload.dsl },
                message: `${result.message ?? ''} → spec-sync 完了`
            };
        }
        return result;
    }
}
// commands/RefactorCommand.ts

export type RefactorKind =
    | 'extract-interface'   // クラスの public メソッドからインターフェースを抽出
    | 'extract-superclass'  // 共通メンバを親クラスに引き上げ
    | 'inline-class'        // 小さすぎるクラスを呼び出し元に統合
    | 'split-class'         // 責務過多のクラスを分割
    | 'rename-type'         // DSL全文の型名を一括置換（spec-rename-typeの別名）
    | 'invert-dependency'   // 依存性逆転（インターフェース導入で DIP 適用）
    | 'resolve-circular'    // 循環依存解消（インターフェース導入で片方向化）
    | 'resolve-circular-inheritance';  // 循環継承解消（baseClass クリア + 共通インターフェース抽出）

export type RefactorParams =
    | { kind: 'extract-interface'; className: string; interfaceName: string }
    | { kind: 'extract-superclass'; classNames: string[]; superName: string }
    | { kind: 'inline-class'; sourceClass: string; targetClass: string }
    | { kind: 'split-class'; sourceClass: string; newNames: string[] }
    | { kind: 'rename-type'; oldName: string; newName: string }
    | { kind: 'invert-dependency'; clientClass: string; concreteClass: string }
    | { kind: 'resolve-circular'; classA: string; classB: string }
    | { kind: 'resolve-circular-inheritance'; classA: string; classB: string };
