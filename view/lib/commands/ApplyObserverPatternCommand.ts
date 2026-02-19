import { Command } from './Command';
import { CliCommandType } from '../CliParser';
import { DomainModel } from '../DomainModel';
import { DesignGraphAggregate } from '../DesignGraphModel';
import { HandlerResult } from '../handler-registry';
import { DesignGraphService } from '../application/DesignGraphService';
import { ClassDiagramService } from '../application/ClassDiagramService';

export class ApplyObserverPatternCommand extends Command {
    constructor(
        raw: string,
        public readonly subjectClassName: string,
        public readonly observerInterfaceName: string,
        public readonly observerConcreteClassNames: string[]
    ) {
        super(raw);
    }

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        const classDiagramService = new ClassDiagramService(model);
        const { model: newModel, events: modelEvents } = classDiagramService.applyObserverPattern({
            subjectClassName: this.subjectClassName,
            observerInterfaceName: this.observerInterfaceName,
            observerConcreteClassNames: this.observerConcreteClassNames

        });
        return { model: newModel, events: modelEvents };
    }
    readonly type: CliCommandType = 'APPLY_OBSERVER';
}