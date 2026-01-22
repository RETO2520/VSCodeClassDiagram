// Type definitions for VS Code Class Diagram Webview scripts

interface Attribute {
    name: string;
    type: string;
    visibility: 'public' | 'private' | 'protected' | 'package';
    modifier: 'None' | 'Static' | 'Abstract';
}

interface Parameter {
    name: string;
    type: string;
}

interface Operation {
    name: string;
    returnType: string;
    visibility: 'public' | 'private' | 'protected' | 'package';
    modifier: 'None' | 'Static' | 'Abstract';
    parameters: Parameter[];
}

interface ClassModel {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    baseClassId: string | null;
    interfaces: string[];
    isAbstract: boolean;
    isInterface: boolean;
    attributes: Attribute[];
    operations: Operation[];
    // properties used during export/UI
    baseClass?: string;
}

interface DiagramModel {
    classes: ClassModel[];
}

interface AppState {
    model: DiagramModel;
    editingNameId: string | null;
    editingDraft: string;
    primitiveTypes: string[];
}

// Global VS Code API
declare function acquireVsCodeApi(): {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
};

// Extend global Window interface
interface Window {
    adjustSvgSize(): void;
    vscode: {
        postMessage(message: any): void;
        getState(): any;
        setState(state: any): void;
    };
}
