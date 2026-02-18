import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { DesignGraphAggregate } from '../DesignGraphModel';
import { HandlerResult } from '../handler-registry';
import { postMessage } from '../../../frontend/src/bridge/vscode-bridge';
import { modelForExport } from '../../../frontend/src/adapters/model-adapter';

export class SaveCommand extends Command {
    readonly type = 'SAVE' as const;
    readonly path?: string;

    constructor(raw: string, path?: string) {
        super(raw);
        this.path = path;
    }

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        postMessage({ command: 'saveJson', payload: modelForExport(model.getClasses()) as any });
        return { model, events: [] };
    }
}
