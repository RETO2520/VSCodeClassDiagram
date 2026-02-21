import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { postMessage } from '../../../frontend/src/bridge/vscode-bridge';

export class ImportCommand extends Command {
    readonly type = 'IMPORT' as const;
    readonly format: string;
    readonly path: string;

    constructor(raw: string, format: string, path: string) {
        super(raw);
        this.format = format;
        this.path = path;
    }

    execute(model: DomainModel): HandlerResult {
        postMessage({ command: 'loadJson' });
        return { model, events: [] };
    }
}
