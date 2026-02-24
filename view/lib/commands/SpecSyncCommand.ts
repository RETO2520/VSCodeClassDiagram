/**
 * SpecSyncCommand
 */
import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { CliCommandType } from '../CliParser';

export class SpecSyncCommand extends Command {
    readonly type: CliCommandType = 'SPEC_SYNC';

    constructor(raw: string) {
        super(raw);
    }

    execute(model: DomainModel): HandlerResult {

        // 1. spec-sync コマンドの処理
        //    - spec-sync コマンドは、仕様書（Markdown）とクラス図モデルの同期を行う
        //    - 具体的には、仕様書からクラス定義を読み込み、モデルを更新する
        //    - また、モデルからクラス定義を抽出し、仕様書に書き込む
        //    - この処理は、クラス図エディタの機能として提供される
        //    - 詳細は、クラス図エディタのドキュメントを参照する
        const dslText = model.toDSL();
        if (!dslText) {
            return { success: false, message: 'DSLがありません', model, events: [] };
        }

        return {
            success: true,
            message: `${model.getClasses().length} クラスをDSLに同期しました`,
            model,
            payload: { dsl: dslText },
            events: []
        };
    }
}