import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { postMessage } from '../../../frontend/src/bridge/vscode-bridge';

export class LoadCommand extends Command {
    readonly type = 'LOAD' as const;
    readonly path: string;

    constructor(raw: string, path: string) {
        super(raw);
        this.path = path;
    }

    execute(model: DomainModel): HandlerResult {
        postMessage({ command: 'loadJson' });
        return { model, events: [] };
    }
}
