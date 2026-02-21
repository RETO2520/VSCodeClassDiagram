
import { Command } from './Command';
import { CliCommandType } from '../CliParser';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';

export class ApplyFactoryPatternCommand extends Command {
    readonly type: CliCommandType = 'APPLY_FACTORY';

    constructor(
        raw: string,
        public readonly factoryName: string,
        public readonly abstractName: string,
        public readonly concreteNames: string[]
    ) {
        super(raw);
    }

    execute(model: DomainModel): HandlerResult {

        const classDiagramService = new ClassDiagramService(model);
        const { model: newModel, events: modelEvents } = classDiagramService.applyFactoryPattern({
            factoryName: this.factoryName,
            abstractName: this.abstractName,
            concreteNames: this.concreteNames
        });

        return {
            model: newModel,
            events: modelEvents,
        };
    }
}
