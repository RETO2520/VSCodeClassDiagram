import { Command } from './Command';
import { CliCommandType } from '../CliParser';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';

export class ApplyTemplatePatternCommand extends Command {
    constructor(
        raw: string,
        public readonly abstractClassName: string,
        public readonly concreteNames: string[]
    ) {
        super(raw);
    }

    execute(model: DomainModel): HandlerResult {
        const classDiagramService = new ClassDiagramService(model);
        const { model: newModel, events: modelEvents } = classDiagramService.applyTemplatePattern({
            abstractClassName: this.abstractClassName,
            concreteNames: this.concreteNames
        });
        return { model: newModel, events: modelEvents };
    }
    readonly type: CliCommandType = 'APPLY_TEMPLATE';
}