import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { DesignGraphAggregate } from '../DesignGraphModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { DesignGraphService } from '../application/DesignGraphService';
import { AddInterfaceImplInput } from '../application/dtos';

export class SetImplCommand extends Command {
    readonly type = 'SET_IMPL' as const;
    readonly className: string;
    readonly interfaceName: string;

    constructor(raw: string, className: string, interfaceName: string) {
        super(raw);
        this.className = className;
        this.interfaceName = interfaceName;
    }

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        const input: AddInterfaceImplInput = {
            className: this.className,
            interfaceName: this.interfaceName
        };
        const service = new ClassDiagramService(model);
        const result = service.addInterfaceImplFromCli(input);

        let nextGraph = graph;
        let graphEvents: any[] = [];
        if (graph) {
            const graphService = new DesignGraphService(graph);
            const r = graphService.addInterfaceImpl(input);
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
