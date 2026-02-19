import { Command } from './Command';
import { CliCommandType } from '../CliParser';
import { DomainModel } from '../DomainModel';
import { DesignGraphAggregate } from '../DesignGraphModel';
import { HandlerResult } from '../handler-registry';
import { DesignGraphService } from '../application/DesignGraphService';
import { ClassDiagramService } from '../application/ClassDiagramService';

export class ApplyAdapterPatternCommand extends Command {
    constructor(
        raw: string,
        public readonly adapterName: string,
        public readonly targetName: string,
        public readonly adapteeNames: string[]
    ) {
        super(raw);
    }

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        const classDiagramService = new ClassDiagramService(model);
        const { model: newModel, events: modelEvents } = classDiagramService.applyAdapterPattern({
            adapterName: this.adapterName,
            targetName: this.targetName,
            adapteeNames: this.adapteeNames
        });
        return { model: newModel, events: modelEvents };
    }
    readonly type: CliCommandType = 'APPLY_ADAPTER';
}