import { DesignGraphAggregate, DesignNode, NodeKind, EdgeKind, DesignEdge } from '../DesignGraphModel';
import { AddTypeInput, AddMemberInput, AddOperationInput, AddParameterInput, AddRelationshipInput, SetBaseInput, AddInterfaceImplInput } from './dtos';
import { createId } from '../class-diagram-types';

export class DesignGraphService {
    constructor(private graph: DesignGraphAggregate) { }

    getGraph(): DesignGraphAggregate {
        return this.graph;
    }

    addNode(input: AddTypeInput): { graph: DesignGraphAggregate, events: any[] } {
        // Map ClassKind to NodeKind
        let kind: NodeKind = 'class';
        if (input.kind === 'interface') kind = 'interface';
        // structs are treated as classes in the graph for now, or we could add 'struct' to NodeKind if needed.
        // DesignGraphModel definition: type NodeKind = "class" | "interface" | "method" | "field" | "parameter";
        // So strict mapping is needed. struct -> class (with metadata?) or just class.
        // For now mapping struct to class.

        const nodeId = createId();
        const node: DesignNode = {
            id: nodeId,
            kind: kind,
            name: input.name,
            metadata: {
                isAbstract: input.isAbstract,
                originalKind: input.kind
            }
        };

        try {
            this.graph = this.graph.addNode(node);
        } catch (e) {
            // Node might already exist.
            // In DomainModel logic, we checked existing. 
            // DesignGraphModel throws if exists.
            // We should probably check existence first or catch.
            // But for this initial implementation, let's assume calling code or graph handles it.
            // Actually DesignGraphAggregate throws.
            // Use find logic if available? DesignGraphAggregate exposes nodes map.
            if (this.graph.nodes[nodeId]) {
                return { graph: this.graph, events: [] };
            }
            // Using name to check existence is probably better but DesignGraphAggregate uses ID.
            // We need to check by name?
            const existing = Object.values(this.graph.nodes).find(n => n.name === input.name && (n.kind === 'class' || n.kind === 'interface'));
            if (existing) {
                return { graph: this.graph, events: [] };
            }
        }

        // Handling extends (simplified for now, ideally strictly separate edges)
        // input.extendsNames logic would go here, creating edges.

        return { graph: this.graph, events: [{ type: 'GRAPH_NODE_ADDED', payload: node }] };
    }

    // Add other methods as needed for commands
    addMember(input: AddMemberInput): { graph: DesignGraphAggregate, events: any[] } {
        // Find parent
        const parentNode = Object.values(this.graph.nodes).find(n => n.name === input.className);
        if (!parentNode) throw new Error(`Class ${input.className} not found`);

        const nodeId = createId();
        const node: DesignNode = {
            id: nodeId,
            kind: 'field', // ClassMember -> field
            name: input.member.name,
            parentId: parentNode.id,
            metadata: {
                type: input.member.type,
                visibility: input.member.visibility,
                isStatic: input.member.isStatic
            }
        };

        this.graph = this.graph.addNode(node);
        return { graph: this.graph, events: [{ type: 'GRAPH_NODE_ADDED', payload: node }] };
    }

    addOperation(input: AddOperationInput): { graph: DesignGraphAggregate, events: any[] } {
        const parentNode = Object.values(this.graph.nodes).find(n => n.name === input.className);
        if (!parentNode) throw new Error(`Class ${input.className} not found`);

        const nodeId = createId();
        const node: DesignNode = {
            id: nodeId,
            kind: 'method',
            name: input.operation.name,
            parentId: parentNode.id,
            metadata: {
                returnType: input.operation.returnType,
                visibility: input.operation.visibility,
                isStatic: input.operation.isStatic
            }
        };

        this.graph = this.graph.addNode(node);
        return { graph: this.graph, events: [{ type: 'GRAPH_NODE_ADDED', payload: node }] };
    }

    setBaseClass(input: SetBaseInput): { graph: DesignGraphAggregate, events: any[] } {
        const events: any[] = [];
        const subClass = Object.values(this.graph.nodes).find(n => n.name === input.className);
        if (!subClass) return { graph: this.graph, events };

        // Handle null/undefined baseClassName -> remove existing generalization
        if (!input.baseClassName) {
            // Find existing generalization edge from subClass
            // TODO: removal logic if supported. For now, we only add.
            return { graph: this.graph, events };
        }

        const baseClass = Object.values(this.graph.nodes).find(n => n.name === input.baseClassName);
        // If base class doesn't exist in graph, we might need to create it or skip?
        // DomainModel allows lazy creation or error.
        // Here we assume it exists or we add a placeholder?
        // Let's mimic addType logic: if not found, we strictly fail or ignore for now to avoid side effects.
        if (!baseClass) {
            // Optionally auto-create base class
            // const baseId = createId();
            // const baseNode: DesignNode = { id: baseId, kind: 'class', name: input.baseClassName, metadata: {} };
            // this.graph = this.graph.addNode(baseNode);
            // events.push({ type: 'GRAPH_NODE_ADDED', payload: baseNode });
            return { graph: this.graph, events };
        }

        // Check if edge already exists
        const existingEdge = Object.values(this.graph.edges).find(e =>
            e.from === subClass.id && e.to === baseClass.id && e.kind === 'inherits'
        );
        if (existingEdge) return { graph: this.graph, events };

        const edgeId = createId();
        const edge: DesignEdge = {
            id: edgeId,
            from: subClass.id,
            to: baseClass.id,
            kind: 'inherits'
        };

        this.graph = this.graph.addEdge(edge);
        events.push({ type: 'GRAPH_EDGE_ADDED', payload: edge });
        return { graph: this.graph, events };
    }

    addInterfaceImpl(input: AddInterfaceImplInput): { graph: DesignGraphAggregate, events: any[] } {
        const events: any[] = [];
        const implClass = Object.values(this.graph.nodes).find(n => n.name === input.className);
        const intf = Object.values(this.graph.nodes).find(n => n.name === input.interfaceName);

        if (!implClass || !intf) return { graph: this.graph, events };

        const existingEdge = Object.values(this.graph.edges).find(e =>
            e.from === implClass.id && e.to === intf.id && e.kind === 'implements'
        );
        if (existingEdge) return { graph: this.graph, events };

        const edgeId = createId();
        const edge: DesignEdge = {
            id: edgeId,
            from: implClass.id,
            to: intf.id,
            kind: 'implements'
        };

        this.graph = this.graph.addEdge(edge);
        events.push({ type: 'GRAPH_EDGE_ADDED', payload: edge });
        return { graph: this.graph, events };
    }
}
