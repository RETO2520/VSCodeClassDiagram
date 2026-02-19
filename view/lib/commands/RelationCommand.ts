import { Command } from './Command';
import { DomainModel } from '../DomainModel';
import { DesignGraphAggregate, EdgeKind } from '../DesignGraphModel';
import { HandlerResult } from '../handler-registry';
import { ClassDiagramService } from '../application/ClassDiagramService';
import { DesignGraphService } from '../application/DesignGraphService';
import { AddRelationshipInput } from '../application/dtos';
import { Relationship, createId } from '../class-diagram-types';

export class RelationCommand extends Command {
    readonly type = 'RELATION' as const;
    readonly source: string;
    readonly target: string;
    readonly symbol: string;
    readonly multiplicity?: string;

    constructor(raw: string, source: string, target: string, symbol: string, multiplicity?: string) {
        super(raw);
        this.source = source;
        this.target = target;
        this.symbol = symbol;
        this.multiplicity = multiplicity;
    }

    execute(model: DomainModel, graph?: DesignGraphAggregate): HandlerResult {
        const classDiagramService = new ClassDiagramService(model);
        let result: HandlerResult = { model, events: [] };

        // 1. Logical Synchronization (DomainModel)
        switch (this.symbol) {
            case '>|':
                result = classDiagramService.setBaseFromCli({ className: this.source, baseClassName: this.target });
                break;
            case '>/':
                result = classDiagramService.addInterfaceImplFromCli({ className: this.source, interfaceName: this.target });
                break;
            default:
                // Other associations/dependencies are currently handled as generic relationships if needed
                const relationship: Relationship = {
                    id: '',
                    type: this.symbol,
                    sourceId: this.source,
                    targetId: this.target,
                    label: undefined,
                    sourceMultiplicity: this.multiplicity,
                    targetMultiplicity: undefined
                } as Relationship;
                result = classDiagramService.applyAddRelationship({ relationship });
                break;
        }

        // 2. Visual Synchronization (DesignGraph)
        if (graph) {
            const graphService = new DesignGraphService(graph);
            let edgeKind: EdgeKind | undefined;

            switch (this.symbol) {
                case '>|': edgeKind = 'inherits'; break;
                case '>/': edgeKind = 'implements'; break;
                case '+>': edgeKind = 'instantiates'; break;
                case '->': edgeKind = 'references'; break;
                case 'o>': edgeKind = 'delegates'; break;
                case '*>': edgeKind = 'references'; break;
                case '-/>': edgeKind = 'calls'; break;
            }

            if (edgeKind) {
                const graphResult = graphService.addEdgeByNames(this.source, this.target, edgeKind);
                result = {
                    ...result,
                    designGraph: graphResult.graph,
                    graphEvents: graphResult.events
                };

                // If it's an instantiation (+>), also add a generation method to the model
                if (this.symbol === '+>') {
                    const methodResult = classDiagramService.applyAddOperation({
                        className: this.source,
                        operation: {
                            id: createId(),
                            name: `create${this.target}`,
                            returnType: this.target,
                            visibility: 'public',
                            parameters: [],
                            isStatic: false
                        }
                    });
                    result = {
                        ...result,
                        model: methodResult.model,
                        events: [...result.events, ...methodResult.events]
                    };
                }
            }
        }

        return result;
    }
}
