import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';

export class ClearCommand extends Command {
    readonly type = 'CLEAR' as const;

    constructor(raw: string) {
        super(raw);
    }

    execute(model: DomainModel): HandlerResult {
        const service = new ClassDiagramService(model);
        service.replaceClassesFromArray([] as any);
        const ev = { type: 'MODEL_REPLACED', payload: { classes: [] } };
        return { success: true, model: service.getModel(), events: [ev] };
    }
}
