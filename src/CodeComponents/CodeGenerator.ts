import console = require('node:console');
import * as vscode from 'vscode';
import { Logger } from '../LoggerComponents/Logger';
interface ILanguageTypeModel {
    csharp: string;
    typescript: string;
    java: string;
    cpp: string;
    rust: string;
}

export interface IObjectModel {
    classes: IClassModel[];
}

export interface IClassModel {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    baseClass: string;
    baseClassId: string;
    interfaces: string[];
    isAbstract: boolean;
    isInterface: boolean;
    isStruct?: boolean;
    attributes: IAttributeModel[];
    operations: IOperationModel[];
}
export interface IAttributeModel {
    name: string;
    type: string;
    visibility: string;
    modifier: string;
}
export interface IOperationModel {
    name: string;
    returnType: string;
    visibility: string;
    modifier: string;
    parameters: IParameterModel[];
    workflow?: IWorkflowModel;
    workflowAst?: WorkflowAst; // 新しく追加
}

export interface IWorkflowModel {
    nodes: IWorkflowNode[];
    edges: IWorkflowEdge[];
}

export interface IWorkflowNode {
    id: string;
    // start, end, process, decision, loop, call
    type: string;
    label: string;
    x: number;
    y: number;
}

export interface IWorkflowEdge {
    from: string;
    to: string;
    condition: boolean;
}

/**
 * 言語中立なワークフロー抽象構文木 (AST)
 */
export interface WorkflowAst {
    variables: IVariableModel[];
    body: WfAstNode[];
}

export interface IVariableModel {
    name: string;
    type: string;
    initialValue?: string;
}

export type WfAstNode =
    | IActionNode
    | IIfNode
    | IWhileNode
    | IReturnNode
    | ISequenceNode;

export interface IActionNode {
    type: 'action';
    statement: string; // 例: "count = count + 1"
}

export interface IIfNode {
    type: 'if';
    condition: string;
    then: WfAstNode[];
    else?: WfAstNode[];
}

export interface IWhileNode {
    type: 'while';
    condition: string;
    body: WfAstNode[];
}

export interface IReturnNode {
    type: 'return';
    value?: string;
}

export interface ISequenceNode {
    type: 'sequence';
    nodes: WfAstNode[];
}


export interface IParameterModel {
    name: string;
    type: string;
}

export interface ITypeModel {
    name: string;
    initial: string;
}

interface IPrimitiveTypeMap {
    [key: string]: ILanguageTypeModel;
}

export interface IGeneratorBuilder {
    Build(outputFolder: vscode.Uri): Promise<void>;
    generateImports(cls: IClassModel): string[];
    generateClassDeclaration(cls: IClassModel): string;
    generateAttributes(cls: IClassModel): string[];
    generateConstructor(cls: IClassModel): string[];
    generateOperations(cls: IClassModel): string[];
    generateWorkflow(ast: WorkflowAst): string[];
    getClassClosing(): string;
    getFileName(cls: IClassModel): string;
    getFileExtension(): string;
}

export function pascalCase(s: string) {
    if (!s) return 'Unnamed';
    return s.split(/[_\s-]+/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}
export function camelCase(s: string) {
    if (!s) return 'unnamed';
    const parts = s.split(/[_\s-]+/).filter(p => p.length > 0).map(p => p.charAt(0).toUpperCase() + p.slice(1));
    if (parts.length === 0) return 'unnamed';
    const pascal = parts.join('');
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
export function snakeCase(s: string) {
    if (!s) return 'unnamed';
    // 非英数字をアンダースコアに置換し、先頭末尾のアンダースコアを削除、複数連続を1つにまとめて小文字化
    const out = s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_').toLowerCase();
    return out.length > 0 ? out : 'unnamed';
}
export function safeIdentifier(s: string) {
    if (!s) return 'Unnamed';
    let out = s.replace(/[^a-zA-Z0-9_]/g, '_');
    if (!/^[a-zA-Z_]/.test(out)) out = '_' + out;
    return out;
}
export function typeName(t: string) {
    if (!t) return 'object';
    // primitive mapping quick
    const map: any = { 'int': 'int', 'string': 'string', 'bool': 'bool', 'void': 'void', 'double': 'double', 'float': 'float' };
    return map[t] || t;
}
export function shouldEmitModifier(mod: string) {
    if (!mod) return false;
    const v = mod.toLowerCase();
    return !(v === 'none' || v === 'aggregation' || v === 'composition');
}

// 共通ヘルパ：モデルから名→クラスマップ作成
export function buildClassMaps(model: IObjectModel) {
    const nameToClass: Record<string, IClassModel> = {};
    const idToClass: Record<string, IClassModel> = {};
    if (!model || !Array.isArray(model.classes)) return { nameToClass, idToClass };
    for (const c of model.classes) {
        if (c.name) nameToClass[c.name] = c;
        if (c.id) idToClass[c.id] = c;
    }
    return { nameToClass, idToClass };
}

export function opSignatureKey(op: IOperationModel) {
    const params = (op.parameters || []).map((p: any) => (p.type || 'any')).join(',');
    return `${op.name || 'unnamed'}(${params})`;
}

// collectInheritedMembers: 再帰的に base クラス → 親の属性・操作を集める
export function collectInheritedMembers(cls: IClassModel, model: IObjectModel, opts?: { nameToClass?: any, idToClass?: any }) {
    const { nameToClass, idToClass } = opts || buildClassMaps(model);
    const inheritedAttrs = new Map<string, IAttributeModel>(); // name -> attr
    const inheritedOps = new Map<string, { op: IOperationModel, originClass: IClassModel }>();   // signature -> op
    const visited = new Set<string>();

    function visit(c: any) {
        if (!c) return;
        if (!c.id && !c.name) return;
        const marker = c.id || c.name;
        if (visited.has(marker)) return;
        visited.add(marker);

        let base: IClassModel | null = null;


        if (c.id && idToClass[c.id]) {
            base = idToClass[c.id];
        }

        if (base) {

            visit(base);

            for (const a of (base.attributes || [])) {
                if (!inheritedAttrs.has(a.name)) inheritedAttrs.set(a.name, a);
            }
            for (const o of (base.operations || [])) {
                const k = opSignatureKey(o);
                if (!inheritedOps.has(k)) inheritedOps.set(k, { op: o, originClass: base });
            }
        }


        if (Array.isArray(c.interfaces)) {
            for (const ifaceRef of c.interfaces) {
                // ifaceRef may be name or id; try both maps
                const iface = nameToClass[ifaceRef] || idToClass[ifaceRef] || null;
                if (!iface) continue;

                visit(iface);
                for (const o of (iface.operations || [])) {
                    const k = opSignatureKey(o);
                    if (!inheritedOps.has(k)) inheritedOps.set(k, { op: o, originClass: iface });
                }
                // interfaces usually don't have attributes but if they do, treat similarly (optional)
                for (const a of (iface.attributes || [])) {
                    if (!inheritedAttrs.has(a.name)) inheritedAttrs.set(a.name, a);
                }
            }
        }
    }

    // clsの親から開始します。cls自身のメンバーを継承として含めたくないからです。
    let startParent: IClassModel | null = null;

    if (cls.baseClassId && idToClass[cls.baseClassId]) startParent = idToClass[cls.baseClassId];
    if (startParent) {
        visit(startParent);
    }
    // また、cls によって直接実装されたインターフェースも含めます (継承された抽象オペレーションとして扱われます)
    if (Array.isArray(cls.interfaces)) {
        for (const ifaceRef of cls.interfaces) {
            const iface = nameToClass[ifaceRef] || idToClass[ifaceRef] || null;
            if (!iface) continue;
            visit(iface);
        }
    }

    return {
        attributes: inheritedAttrs, // Map(name -> attr)
        operations: inheritedOps    // Map(sig -> {op, originClass})
    };
}

export abstract class CodeBuilder implements IGeneratorBuilder {
    TypeModel: TypeModel;
    protected ObjectModel: IObjectModel;
    protected ClassMaps: { nameToClass: Record<string, IClassModel>, idToClass: Record<string, IClassModel> };
    protected AllClassNames: Set<string>;
    protected logger: Logger | null;
    constructor(model: IObjectModel, typeModel: TypeModel, logger: Logger | null = null) {
        this.ObjectModel = model;
        this.TypeModel = typeModel;
        this.logger = logger;
        this.ClassMaps = buildClassMaps(model);
        this.AllClassNames = new Set(Object.keys(this.ClassMaps.nameToClass));
    }


    async Build(outputFolder: vscode.Uri): Promise<void> {
        this.logger?.info(`Starting code generation for language in: ${outputFolder.fsPath}`);
        this.logger?.show(true);

        let overwriteAll = false;
        let skipAll = false;

        for (const cls of this.ObjectModel.classes) {
            const fileName = `${this.getFileName(cls)}${this.getFileExtension()}`;
            const fileUri = vscode.Uri.joinPath(outputFolder, fileName);

            let fileExists = false;
            try {
                await vscode.workspace.fs.stat(fileUri);
                fileExists = true;
            } catch {
                fileExists = false;
            }

            if (fileExists) {
                if (skipAll) {
                    this.logger?.info(`Skipping existing file (Skip All): ${fileName}`);
                    continue;
                }
                if (!overwriteAll) {
                    const result = await vscode.window.showWarningMessage(
                        `File '${fileName}' already exists. Overwrite?`,
                        { modal: true },
                        'Yes',
                        'Yes to All',
                        'No',
                        'No to All'
                    );

                    if (result === 'No') {
                        this.logger?.info(`User skipped file: ${fileName}`);
                        continue;
                    } else if (result === 'No to All') {
                        skipAll = true;
                        this.logger?.info(`User skipped file and all subsequent existing files: ${fileName}`);
                        continue;
                    } else if (result === 'Yes to All') {
                        overwriteAll = true;
                        this.logger?.info(`User opted to overwrite all remaining files.`);
                    } else if (result === undefined) {
                        this.logger?.warn(`Generation cancelled for ${fileName}`);
                        continue;
                    }
                    // 'Yes' falls through to generation
                }
            }

            this.logger?.info(`Generating class: ${cls.name || 'Unnamed'} -> ${fileName}`);

            const imports = this.generateImports(cls);
            const classDeclaration = this.generateClassDeclaration(cls);
            const attributes = this.generateAttributes(cls);
            const constructor = this.generateConstructor(cls);
            const operations = this.generateOperations(cls);

            let sb: string[] = [];
            if (imports.length > 0) {
                sb.push(...imports);
                sb.push('');
            }
            sb.push(classDeclaration);
            sb.push(...attributes);
            sb.push(...constructor);
            sb.push(...operations);
            sb.push(this.getClassClosing());

            const text = sb.join('\n');
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(text, 'utf8'));
            this.logger?.info(`Successfully wrote: ${fileName}`);
        }
        this.logger?.info('Code generation completed.');
    }
    // 抽象メソッド: 言語固有の実装をサブクラスで定義
    public abstract generateImports(cls: IClassModel): string[];
    public abstract generateClassDeclaration(cls: IClassModel): string;
    public abstract generateAttributes(cls: IClassModel): string[];
    public abstract generateConstructor(cls: IClassModel): string[];
    public abstract generateOperations(cls: IClassModel): string[];
    public abstract getClassClosing(): string;
    public abstract getFileName(cls: IClassModel): string;
    public abstract getFileExtension(): string;

    protected getAttributes() {

    }

    protected existsClassName(className: string): boolean {
        return this.AllClassNames.has(className);
    }

    protected findClassById(id: string): IClassModel | undefined {
        return this.ObjectModel.classes.find(x => x.id === id);
    }

    protected findBaseClass(cls: IClassModel): IClassModel | null {
        if ('baseClassId' in cls && cls.baseClassId) {
            const l = this.ObjectModel.classes.find(x => x.id === cls.baseClassId);
            return l ?? null;
        }

        if (cls.baseClass) {
            const byName = this.ClassMaps.nameToClass[cls.baseClass];
            if (byName) return byName;
        }

        return null;
    }

    protected makeParamName(base: string, used: Set<string>) {
        let s = safeIdentifier(base || 'param');
        s = s.charAt(0).toLowerCase() + s.slice(1);
        if (!/^[a-zA-Z_]/.test(s)) s = '_' + s;
        let out = s;
        let i = 1;
        while (used.has(out)) {
            out = `${s}_${i++}`;
        }
        used.add(out);
        return out;
    }

    protected buildParamListForAttributes(attrs: Array<IAttributeModel>, language: string, usedNames: Set<string>) {
        const params: Array<{ propName: string, paramName: string, typeName: string }> = [];
        for (const a of attrs || []) {
            const propName = a.name || 'unnamed';
            const paramName = this.makeParamName(propName, usedNames);
            const typeName = this.TypeModel.mapTypeForLang(a.type || (language === 'csharp' ? 'object' : 'any'), language).name;
            params.push({ propName, paramName, typeName });
        }
        return params;
    }

    // 共通ヘルパ: クラス図上、抽象メンバであるか
    protected isAbstractMember(member: IAttributeModel | IOperationModel): boolean {
        if (!member) return false;
        const modVal = (member.modifier || '').toLowerCase();
        if (modVal.includes('abstract')) return true;
        return false;

    }

    // 共通ヘルパ: クラス図上、仮想メンバであるか
    protected isVirtualMember(member: IAttributeModel | IOperationModel): boolean {
        if (!member) return false;
        const modVal = (member.modifier || '').toLowerCase();
        if (modVal.includes('virtual')) return true;
        return false;

    }

    // 共通ヘルパ: private識別子で、かつvirtualまたはabstract識別子のメンバであるか
    protected isPrivateVirtualAbstractMember(member: IAttributeModel | IOperationModel): boolean {
        if (!member) return false;
        const modVal = (member.modifier || '').toLowerCase();

        const isPrivateAndVirtual = (member.visibility === 'private' && modVal.includes('virtual'));
        if (isPrivateAndVirtual) {
            this.logger?.warn(`Warning: member ${member.name} is private and virtual; skipping.`);
            return true;
        }

        const isPrivateAndAbstract = (member.visibility === 'private' && modVal.includes('abstract'));
        if (isPrivateAndAbstract) {
            this.logger?.warn(`Warning: member ${member.name} is private and abstract; skipping.`);
            return true;
        }
        return false;
    }

    // 共通ヘルパ: 抽象クラス内の属性区画がprivateであるか
    protected isPrivateAttributeInAbstractClass(member: IAttributeModel, cls: IClassModel): boolean {
        if (!member || !cls) return false;
        if (cls.isAbstract && member.visibility === 'private') {
            this.logger?.warn(`Warning: member ${member.name} is private in abstract class ${cls.name}; skipping.`);
            return true;
        }
        return false;
    }

    // 共通ヘルパ: 抽象クラス内の操作区画がprivateであるか
    protected isPrivateOperationInAbstractClass(member: IOperationModel, cls: IClassModel): boolean {
        if (!member || !cls) return false;
        if (cls.isAbstract && member.visibility === 'private') {
            this.logger?.warn(`Warning: member ${member.name} is private in abstract class ${cls.name}; skipping.`);
            return true;
        }
        return false;
    }

    // 共通ヘルパ: 抽象クラス内のprivateメンバであるか
    protected isPrivateMemberInAbstractClass(member: IAttributeModel | IOperationModel, cls: IClassModel): boolean {
        if (!member || !cls) return false;
        if (cls.isAbstract && member.visibility === 'private') {
            this.logger?.warn(`Warning: member ${member.name} is private in abstract class ${cls.name}; skipping.`);
            return true;
        }
        return false;
    }

    // 共通ヘルパ: 具象クラスの抽象メンバであるか
    protected isAbstractMemberInConcreteClass(member: IAttributeModel | IOperationModel, cls: IClassModel): boolean {
        if (!member || !cls) return false;
        const modVal = (member.modifier || 'None').toLowerCase();
        if (!cls.isAbstract && modVal.includes('abstract')) {
            this.logger?.warn(`Warning: member ${member.name} is abstract in concrete class ${cls.name}; skipping.`);
            return true;
        }
        return false;
    }

    public abstract generateWorkflow(ast: WorkflowAst): string[];

    /**
     * 再帰的にワークフローノードを処理するためのディスパッチャ
     * 各言語固有のビルダーで、具体的なノード生成メソッドを実装する際に利用する
     */
    protected buildWfNodes(nodes: WfAstNode[], indent: number): string[] {
        let lines: string[] = [];
        for (const node of nodes) {
            lines = lines.concat(this.buildWfNode(node, indent));
        }
        return lines;
    }

    protected buildWfNode(node: WfAstNode, indent: number): string[] {
        switch (node.type) {
            case 'action':
                return this.generateAction(node, indent);
            case 'if':
                return this.generateIf(node, indent);
            case 'while':
                return this.generateWhile(node, indent);
            case 'return':
                return this.generateReturn(node, indent);
            case 'sequence':
                return this.buildWfNodes(node.nodes, indent);
            default:
                return [];
        }
    }

    protected abstract generateAction(node: IActionNode, indent: number): string[];
    protected abstract generateIf(node: IIfNode, indent: number): string[];
    protected abstract generateWhile(node: IWhileNode, indent: number): string[];
    protected abstract generateReturn(node: IReturnNode, indent: number): string[];

    protected getIndent(level: number): string {
        return '    '.repeat(level);
    }
}


export class TypeModel {
    private _primitiveTypes: IPrimitiveTypeMap = {};
    constructor() {
        this.addPrimitiveType('int', {
            csharp: 'int',
            typescript: 'number',
            java: 'int',
            cpp: 'int',
            rust: 'i32'
        });
        this.addPrimitiveType('string', {
            csharp: 'string',
            typescript: 'string',
            java: 'String',
            cpp: 'std::string',
            rust: 'String'
        });
        this.addPrimitiveType('bool', {
            csharp: 'bool',
            typescript: 'boolean',
            java: 'boolean',
            cpp: 'bool',
            rust: 'bool'
        });
        this.addPrimitiveType('float', {
            csharp: 'float',
            typescript: 'number',
            java: 'float',
            cpp: 'float',
            rust: 'f32'
        });
        this.addPrimitiveType('double', {
            csharp: 'double',
            typescript: 'number',
            java: 'double',
            cpp: 'double',
            rust: 'f64'
        });
        this.addPrimitiveType('void', {
            csharp: 'void',
            typescript: 'void',
            java: 'void',
            cpp: 'void',
            rust: '()'
        });
        this.addPrimitiveType('char', {
            csharp: 'char',
            typescript: 'string',
            java: 'char',
            cpp: 'char',
            rust: 'String'
        });
        this.addPrimitiveType('object', {
            csharp: 'object',
            typescript: 'object',
            java: 'Object',
            cpp: 'auto',
            rust: '()'
        });

    }
    addPrimitiveType(primitiveName: string, typeModel: ILanguageTypeModel) {
        this._primitiveTypes[primitiveName] = typeModel;
    }
    getType(primitiveName: string, language: string): string {
        const m = this._primitiveTypes[primitiveName];
        return m[language as keyof ILanguageTypeModel];
    }
    getTypesForLang(language: string): string[] {
        const types: string[] = [];
        if (!language) {
            return types;
        }
        const langKeyMap: Record<string, keyof ILanguageTypeModel> = {
            csharp: 'csharp',
            typescript: 'typescript',
            java: 'java',
            cpp: 'cpp',
            rust: 'rust'
        };

        const prop = langKeyMap[language];
        if (!prop) return types;

        const vals = Object.values(this._primitiveTypes)
            .map(m => m[prop])
            .filter(v => typeof v === 'string' && v.length > 0);


        return Array.from(new Set(vals));
    }

    mapTypeForLang(typeName: string, language: string): ITypeModel {
        const t = typeName.trim();
        if (!typeName) {
            switch (language) {
                case 'typescript':
                    return { name: 'any', initial: 'null' };
                case 'java':
                    return { name: 'Object', initial: 'null' };
                case 'cpp':
                    return { name: 'auto', initial: 'null' };
                default:
                    return { name: 'object', initial: 'null' };
            }
        }
        const low = t.toLowerCase();
        if (this._primitiveTypes[low]) {
            const typeName = this.getType(low, language);
            // primitive型に応じて initalを定める
            let initText = '';
            switch (typeName) {
                case 'number':
                    initText = '0';
                    break;
                case 'string':
                    initText = `''`;
                    break;
                default:
                    initText = 'null'
                    break;
            }
            return { name: typeName, initial: initText };
        }
        switch (language) {
            case 'csharp':
                return { name: t, initial: 'null' };
            case 'typescript':
                return { name: t.replace(/</g, '<').replace(/>/g, '>'), initial: 'null' };
            case 'java':
                return { name: t.replace(/</g, '<').replace(/>/g, '>'), initial: 'null' };
            case 'cpp':
                if (t.startsWith('List<')) {
                    const inner = t.slice(5, -1);
                    return { name: `std::vector<${this.mapTypeForLang(inner, 'cpp').name}>`, initial: 'null' };
                }
                return { name: t, initial: 'null' };
            default:
                return { name: t, initial: 'null' };
        }

    }
}


export class CodeGenerator {


    private _builder: IGeneratorBuilder | null = null;
    constructor(builder: IGeneratorBuilder | null = null) {
        this._builder = builder;

    }

    async generate(outputFolder: vscode.Uri) {
        if (!this._builder) {
            return null;
        }
        await this._builder.Build(outputFolder);
    }



}