import { Command } from './Command';
import { CliCommandType } from '../CliParser';
import { DomainModel } from '../DomainModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';

export class ApplyStrategyPatternCommand extends Command {
    constructor(
        raw: string,
        public readonly contextClassName: string,
        public readonly strategyInterfaceName: string,
        public readonly strategyConcreteClassNames: string[]
    ) {
        super(raw);
    }

    execute(model: DomainModel): HandlerResult {
        const classDiagramService = new ClassDiagramService(model);
        const { model: newModel, events: modelEvents } = classDiagramService.applyStrategyPattern({
            contextClassName: this.contextClassName,
            strategyInterfaceName: this.strategyInterfaceName,
            strategyConcreteClassNames: this.strategyConcreteClassNames

        });
        return { model: newModel, events: modelEvents };
    }
    readonly type: CliCommandType = 'APPLY_STRATEGY';
}