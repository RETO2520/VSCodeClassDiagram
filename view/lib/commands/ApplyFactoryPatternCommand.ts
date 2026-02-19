
import { Command } from './Command';
import { CliCommandType } from '../CliParser';
import { DomainModel } from '../DomainModel';
import { DesignGraphAggregate } from '../DesignGraphModel';
import { HandlerResult } from '../handler-registry';
import { DesignGraphService } from '../application/DesignGraphService';
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

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        if (!graph) throw new Error('DesignGraphAggregate is required for ApplyFactoryPatternCommand');

        const graphService = new DesignGraphService(graph);
        const { graph: newGraph, events: graphEvents } = graphService.applyFactoryPattern({
            factoryName: this.factoryName,
            abstractName: this.abstractName,
            concreteNames: this.concreteNames
        });

        const classDiagramService = new ClassDiagramService(model);
        const { model: newModel, events: modelEvents } = classDiagramService.applyFactoryPattern({
            factoryName: this.factoryName,
            abstractName: this.abstractName,
            concreteNames: this.concreteNames
        });

        return {
            model: newModel,
            events: modelEvents,
            designGraph: newGraph,
            graphEvents
        };
    }
}
