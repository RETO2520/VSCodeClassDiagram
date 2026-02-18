import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { DesignGraphAggregate } from '../DesignGraphModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { DesignGraphService } from '../application/DesignGraphService';
import { SetBaseInput } from '../application/dtos';

export class SetBaseCommand extends Command {
    readonly type = 'SET_BASE' as const;
    readonly className: string;
    readonly baseClassName: string;

    constructor(raw: string, className: string, baseClassName: string) {
        super(raw);
        this.className = className;
        this.baseClassName = baseClassName;
    }

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        const input: SetBaseInput = {
            className: this.className,
            baseClassName: this.baseClassName
        };
        const service = new ClassDiagramService(model);
        const result = service.setBaseFromCli(input);

        let nextGraph = graph;
        let graphEvents: any[] = [];
        if (graph) {
            const graphService = new DesignGraphService(graph);
            const r = graphService.setBaseClass(input);
            nextGraph = r.graph;
            graphEvents = r.events;
        }

        return {
            ...result,
            designGraph: nextGraph,
            graphEvents
        };
    }
}
