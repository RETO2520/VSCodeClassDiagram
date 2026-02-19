import { Command } from './Command';
import { CliCommandType } from '../CliParser';
import { DomainModel } from '../DomainModel';
import { DesignGraphAggregate } from '../DesignGraphModel';
import { HandlerResult } from '../handler-registry';
import { DesignGraphService } from '../application/DesignGraphService';
import { ClassDiagramService } from '../application/ClassDiagramService';

export class ApplySignletonPatternCommand extends Command {
    constructor(
        raw: string,
        public readonly className: string,
    ) {
        super(raw);
    }

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        const classDiagramService = new ClassDiagramService(model);
        const { model: newModel, events: modelEvents } = classDiagramService.applySingletonPattern({
            className: this.className
        });
        return { model: newModel, events: modelEvents };
    }
    readonly type: CliCommandType = 'APPLY_SINGLETON';
}