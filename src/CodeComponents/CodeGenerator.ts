import console = require('node:console');
import * as vscode from 'vscode';
interface ILanguageTypeModel {
    csharp: string;
    typescript: string;
    java: string;
    cpp: string;
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

interface ICodeBuilder {
    Build(outputFolder: vscode.Uri, model: IObjectModel): Promise<void>;
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

export abstract class CodeBuilder implements ICodeBuilder {
    TypeModel: TypeModel = new TypeModel();
    protected ObjectModel: IObjectModel;
    protected ClassMaps: { nameToClass: Record<string, IClassModel>, idToClass: Record<string, IClassModel> };
    protected AllClassNames: Set<string>;
    constructor(model: IObjectModel) {
        this.ObjectModel = model;
        this.ClassMaps = buildClassMaps(model);
        this.AllClassNames = new Set(Object.keys(this.ClassMaps.nameToClass));
    }


    async Build(outputFolder: vscode.Uri, model: IObjectModel): Promise<void> {
        for (const cls of model.classes) {

            const name = safeIdentifier(cls.name || 'Unnamed');
            const imports = this.generateImports(cls);  // 言語固有: インポート生成
            const classDeclaration = this.generateClassDeclaration(cls);  // 言語固有: クラス宣言
            const attributes = this.generateAttributes(cls);  // 言語固有: 属性生成
            const constructor = this.generateConstructor(cls);  // 言語固有: コンストラクタ生成
            const operations = this.generateOperations(cls);  // 言語固有: 操作生成

            // コード組み立て（共通）
            let sb: string[] = [];
            if (imports.length > 0) {
                sb.push(...imports);
                sb.push('');  // 空白行
            }
            sb.push(classDeclaration);
            sb.push(...attributes);
            sb.push(...constructor);
            sb.push(...operations);
            sb.push(this.getClassClosing());  // 言語固有: クラス閉じ（例: '}'）

            const text = sb.join('\n');

            const fileUri = vscode.Uri.joinPath(outputFolder, `${this.getFileName(cls)}${this.getFileExtension()}`);  // 言語固有: 拡張子
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(text, 'utf8'));
        }
    }
    // 抽象メソッド: 言語固有の実装をサブクラスで定義
    protected abstract generateImports(cls: IClassModel): string[];
    protected abstract generateClassDeclaration(cls: IClassModel): string;
    protected abstract generateAttributes(cls: IClassModel): string[];
    protected abstract generateConstructor(cls: IClassModel): string[];
    protected abstract generateOperations(cls: IClassModel): string[];
    protected abstract getClassClosing(): string;
    protected abstract getFileName(cls: IClassModel): string;
    protected abstract getFileExtension(): string;

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
            console.warn(`Warning: member ${member.name} is private and virtual; skipping.`);
            return true;
        }

        const isPrivateAndAbstract = (member.visibility === 'private' && modVal.includes('abstract'));
        if (isPrivateAndAbstract) {
            console.warn(`Warning: member ${member.name} is private and abstract; skipping.`);
            return true;
        }
        return false;
    }


    // 共通ヘルパ: 抽象クラス内のprivateメンバであるか
    protected isPrivateMemberInAbstractClass(member: IAttributeModel | IOperationModel, cls: IClassModel): boolean {
        if (!member || !cls) return false;
        if (cls.isAbstract && member.visibility === 'private') {
            console.warn(`Warning: member ${member.name} is private in abstract class ${cls.name}; skipping.`);
            return true;
        }
        return false;
    }

    // 共通ヘルパ: 具象クラスの抽象メンバであるか
    protected isAbstractMemberInConcreteClass(member: IAttributeModel | IOperationModel, cls: IClassModel): boolean {
        if (!member || !cls) return false;
        const modVal = (member.modifier || 'None').toLowerCase();
        if (!cls.isAbstract && modVal.includes('abstract')) {
            console.warn(`Warning: member ${member.name} is abstract in concrete class ${cls.name}; skipping.`);
            return true;
        }
        return false;
    }


}


export class TypeModel {
    private _primitiveTypes: IPrimitiveTypeMap = {};
    constructor() {
        this.addPrimitiveType('int', { csharp: 'int', typescript: 'number', java: 'int', cpp: 'int' });
        this.addPrimitiveType('string', { csharp: 'string', typescript: 'string', java: 'String', cpp: 'std::string' });
        this.addPrimitiveType('bool', { csharp: 'bool', typescript: 'boolean', java: 'boolean', cpp: 'bool' });
        this.addPrimitiveType('float', { csharp: 'float', typescript: 'number', java: 'float', cpp: 'float' });
        this.addPrimitiveType('double', { csharp: 'double', typescript: 'number', java: 'double', cpp: 'double' });
        this.addPrimitiveType('void', { csharp: 'void', typescript: 'void', java: 'void', cpp: 'void' });
        this.addPrimitiveType('char', { csharp: 'char', typescript: 'string', java: 'char', cpp: 'char' });
        this.addPrimitiveType('object', { csharp: 'object', typescript: 'object', java: 'Object', cpp: 'auto' });

    }
    addPrimitiveType(primitiveName: string, typeModel: ILanguageTypeModel) {
        this._primitiveTypes[primitiveName] = typeModel;
    }
    getType(primitiveName: string, language: string): string {
        const m = this._primitiveTypes[primitiveName];
        return m[language as keyof ILanguageTypeModel];
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


    private _builder: ICodeBuilder | null = null;
    constructor(builder: ICodeBuilder | null = null) {
        this._builder = builder;

    }

    async generate(outputFolder: vscode.Uri, model: IObjectModel) {
        if (!this._builder) {
            return null;
        }
        await this._builder.Build(outputFolder, model);
    }



}