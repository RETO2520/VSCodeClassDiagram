import * as vscode from 'vscode';
import { CodeBuilder, collectInheritedMembers, IClassModel, IObjectModel, IOperationModel, IParameterModel, opSignatureKey, pascalCase, safeIdentifier, shouldEmitModifier, WorkflowAst, IActionNode, IIfNode, IWhileNode, IReturnNode } from './CodeGenerator';


export class JavaBuilder extends CodeBuilder {
    public generateImports(cls: IClassModel): string[] {
        const imports: string[] = [];
        return imports;
    }
    public generateClassDeclaration(cls: IClassModel): string {
        let declaration: string = '';
        let modifiers = '';
        const name = safeIdentifier(cls.name || 'Unnamed');
        if (cls.isInterface) {
            modifiers = 'public interface';
        }
        else if (cls.isAbstract) {
            modifiers = 'public abstract class';
        }
        else {
            modifiers = 'public class';
        }
        const bases: string[] = [];
        const impls: string[] = [];
        if (cls.baseClass && cls.baseClass !== 'None') {
            bases.push(pascalCase(cls.baseClass));
        }
        if (Array.isArray(cls.interfaces)) {
            for (const i of cls.interfaces) {
                if (i) {
                    const resultInterface = this.findClassById(i);
                    if (resultInterface) {
                        impls.push(pascalCase(resultInterface.name));
                    }

                }
            }
        }
        const extendsClause = bases.length > 0 ? (' extends ' + bases[0]) : '';
        const implClause = impls.length > 0 ? (' implements ' + impls.join(', ')) : '';
        declaration = `${modifiers} ${name}${extendsClause}${implClause} {`;
        return declaration;
    }
    public generateAttributes(cls: IClassModel): string[] {
        const attrbutes: string[] = [];
        if (Array.isArray(cls.attributes)) {
            for (const a of cls.attributes) {
                if (this.isAbstractMember(a)) {
                    continue;
                }
                if (this.isVirtualMember(a)) {
                    continue;
                }
                const t = this.TypeModel.mapTypeForLang(a.type || 'Object', 'java').name;
                const prop = safeIdentifier(a.name || 'unnamed');
                const vis = a.visibility || 'private';
                const emit = shouldEmitModifier(a.modifier);
                const modText = emit ? (a.modifier + ' ') : '';
                attrbutes.push(`\t${vis} ${modText}${t} ${prop};`);
            }
        }
        attrbutes.push('');
        return attrbutes;
    }
    public generateConstructor(cls: IClassModel): string[] {
        const constructorExp: string[] = [];
        if (cls.isInterface) {
            return constructorExp;
        }
        const name = pascalCase(cls.name || 'Unnamed');
        constructorExp.push(`\tpublic ${name}() { }`);
        constructorExp.push('');
        return constructorExp;
    }
    public generateOperations(cls: IClassModel): string[] {
        const operations: string[] = [];

        const inherited = collectInheritedMembers(cls, this.ObjectModel, this.ClassMaps);
        const implementedSigs = new Set<string>((cls.operations || []).map((o: IOperationModel) => opSignatureKey(o)));
        if (Array.isArray(cls.operations)) {
            for (const o of cls.operations) {
                if (this.isVirtualMember(o)) {
                    continue;
                }
                if (this.isAbstractMemberInConcreteClass(o, cls)) {
                    continue;
                }

                const ret = this.TypeModel.mapTypeForLang(o.returnType || 'void', 'java').name;
                const methodName = safeIdentifier(o.name || 'method');
                const vis = o.visibility || 'private';
                const emit = shouldEmitModifier(o.modifier);
                const modText = emit ? (o.modifier + ' ') : '';
                const params = (Array.isArray(o.parameters) ? o.parameters.map((p: any) => `${this.TypeModel.mapTypeForLang(p.type || 'Object', 'java').name} ${safeIdentifier(p.name || 'p')}`).join(', ') : '');
                if (o.modifier === 'abstract' && cls.isAbstract) {
                    operations.push(`\t${vis} abstract ${ret} ${methodName}(${params});`);
                } else if (cls.isInterface) {
                    operations.push(`\t${vis} ${ret} ${methodName}(${params});`);
                } else {
                    operations.push(`\t${vis} ${modText}${ret} ${methodName}(${params}) {`);
                    if (o.workflowAst) {
                        const wfLines = this.generateWorkflow(o.workflowAst);
                        for (const l of wfLines) {
                            operations.push(l);
                        }
                    } else {
                        if (ret !== 'void') {
                            operations.push('\t\tthrow new UnsupportedOperationException("Not implemented");');
                        }
                        else {
                            operations.push('\t\t// TODO');
                        }
                    }
                    operations.push('\t}');
                }
            }
        }
        for (const [sig, info] of inherited.operations.entries()) {
            const k = sig;
            const inheritedOp = info.op;
            const originClass = info.originClass;
            const isAbstract = ((inheritedOp.modifier || '').toLowerCase().includes('abstract')) || (originClass && originClass.isInterface);
            if (!isAbstract) continue;
            if (implementedSigs.has(k)) continue; // implemented in subclass

            const ret = this.TypeModel.mapTypeForLang(inheritedOp.returnType || 'void', 'csharp').name;
            const method = pascalCase(inheritedOp.name || 'Method');
            const paramsStr = (Array.isArray(inheritedOp.parameters) ? inheritedOp.parameters.map((p: IParameterModel) => `${this.TypeModel.mapTypeForLang(p.type || 'object', 'csharp').name} ${safeIdentifier(p.name || 'param')}`).join(', ') : '');

            if (inheritedOp.visibility === 'private') {
                console.warn(`Warning: inherited method ${method} is private and cannot be overridden; skipping.`);
                continue;
            }
            const vis = inheritedOp.visibility || 'protected';
            operations.push('');
            operations.push('\t@Override');
            operations.push(`\t${vis} ${ret} ${method}(${paramsStr})`);
            operations.push('\t{');
            if (ret !== 'void') {
                operations.push('\t\tthrow new NotImplementedException();');
            }
            else {
                operations.push('\t\t// TODO');
            }
            operations.push('\t}');
        }
        return operations;
    }
    public getClassClosing(): string {
        return "}";
    }
    public getFileName(cls: IClassModel): string {
        return safeIdentifier(cls.name || 'Unnamed');
    }
    public getFileExtension(): string {
        return ".java";
    }

    public generateWorkflow(ast: WorkflowAst): string[] {
        const lines: string[] = [];
        // 変数定義
        for (const v of ast.variables) {
            const t = this.TypeModel.mapTypeForLang(v.type, 'java').name;
            const init = v.initialValue ? ` = ${v.initialValue}` : '';
            lines.push(`${this.getIndent(2)}${t} ${safeIdentifier(v.name)}${init};`);
        }
        if (ast.variables.length > 0) lines.push('');

        // ボディ
        lines.push(...this.buildWfNodes(ast.body, 2));
        return lines;
    }

    protected generateAction(node: IActionNode, indent: number): string[] {
        return [`${this.getIndent(indent)}${node.statement};`];
    }

    protected generateIf(node: IIfNode, indent: number): string[] {
        const lines: string[] = [];
        lines.push(`${this.getIndent(indent)}if (${node.condition}) {`);
        lines.push(...this.buildWfNodes(node.then, indent + 1));
        if (node.else && node.else.length > 0) {
            lines.push(`${this.getIndent(indent)}} else {`);
            lines.push(...this.buildWfNodes(node.else, indent + 1));
        }
        lines.push(`${this.getIndent(indent)}}`);
        return lines;
    }

    protected generateWhile(node: IWhileNode, indent: number): string[] {
        const lines: string[] = [];
        lines.push(`${this.getIndent(indent)}while (${node.condition}) {`);
        lines.push(...this.buildWfNodes(node.body, indent + 1));
        lines.push(`${this.getIndent(indent)}}`);
        return lines;
    }

    protected generateReturn(node: IReturnNode, indent: number): string[] {
        const val = node.value ? ` ${node.value}` : '';
        return [`${this.getIndent(indent)}return${val};`];
    }

    protected override getIndent(level: number): string {
        return '\t'.repeat(level);
    }
}
