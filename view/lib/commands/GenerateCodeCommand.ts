import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { postMessage } from '../../../frontend/src/bridge/vscode-bridge';
import { modelForExport } from '../../../frontend/src/adapters/model-adapter';

export class GenerateCodeCommand extends Command {
    readonly type = 'GENERATE_CODE' as const;
    readonly language: string;
    readonly path?: string;

    constructor(raw: string, language: string, path?: string) {
        super(raw);
        this.language = language;
        this.path = path;
    }

    execute(model: DomainModel): HandlerResult {
        const allowed = new Set(['csharp', 'java', 'ts', 'rust', 'cpp']);
        if (!this.language) {
            postMessage({ command: 'log', level: 'warn', text: `generate-code requires a language argument` });
            return { success: false, model, events: [] };
        }
        if (!allowed.has(this.language)) {
            postMessage({ command: 'log', level: 'warn', text: `Language not supported for generate-code: ${this.language}` });
            return { success: false, model, events: [] };
        }
        postMessage({ command: 'generateCode', payload: { model: modelForExport(model.getClasses()), language: this.language } as any });
        return { success: true, model, events: [] };
    }
}
