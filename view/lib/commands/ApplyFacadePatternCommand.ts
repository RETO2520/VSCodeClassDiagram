import { Command } from './Command';
import { CliCommandType } from '../CliParser';
import { DomainModel } from '../DomainModel';
import { DesignGraphAggregate } from '../DesignGraphModel';
import { HandlerResult } from '../handler-registry';
import { DesignGraphService } from '../application/DesignGraphService';
import { ClassDiagramService } from '../application/ClassDiagramService';

export class ApplyFacadePatternCommand extends Command {
    constructor(
        raw: string,
        public readonly facadeClassName: string,
        public readonly subsystemClassNames: string[]
    ) {
        super(raw);
    }

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        const classDiagramService = new ClassDiagramService(model);
        const { model: newModel, events: modelEvents } = classDiagramService.applyFacadePattern({
            facadeClassName: this.facadeClassName,
            subsystemClassNames: this.subsystemClassNames
        });
        return { model: newModel, events: modelEvents };
    }
    readonly type: CliCommandType = 'APPLY_FACADE';
}