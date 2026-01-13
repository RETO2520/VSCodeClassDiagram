import * as vscode from 'vscode';
import { CodeBuilder, collectInheritedMembers, IClassModel, IObjectModel, IOperationModel, IParameterModel, opSignatureKey, pascalCase, safeIdentifier, shouldEmitModifier } from './CodeGenerator';


export class JavaBuilder extends CodeBuilder {
    protected generateImports(cls: IClassModel): string[] {
        const imports: string[] = [];
        return imports;
    }
    protected generateClassDeclaration(cls: IClassModel): string {
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
    protected generateAttributes(cls: IClassModel): string[] {
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
    protected generateConstructor(cls: IClassModel): string[] {
        const constructorExp: string[] = [];
        if (cls.isInterface) {
            return constructorExp;
        }
        const name = pascalCase(cls.name || 'Unnamed');
        constructorExp.push(`\tpublic ${name}() { }`);
        constructorExp.push('');
        return constructorExp;
    }
    protected generateOperations(cls: IClassModel): string[] {
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
                if (this.isPrivateMemberInAbstractClass(o, cls)) {
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
                    if (ret !== 'void') {
                        operations.push('\t\tthrow new UnsupportedOperationException("Not implemented");');
                    }
                    else {
                        operations.push('\t\t// TODO');
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
    protected getClassClosing(): string {
        return "}";
    }
    protected getFileName(cls: IClassModel): string {
        return safeIdentifier(cls.name || 'Unnamed');
    }
    protected getFileExtension(): string {
        return ".java";
    }
    async BuildCode(outputFolder: vscode.Uri, model: IObjectModel): Promise<void> {
        for (const cls of model.classes) {
            const name = pascalCase(cls.name || 'Unnamed');
            let sb: string[] = [];
            // package omitted; users can move file to package manually
            if (cls.isInterface) {
                sb.push(`public interface ${name} {`);
                if (Array.isArray(cls.attributes)) {
                    for (const a of cls.attributes) {
                        const t = this.TypeModel.mapTypeForLang(a.type || 'Object', 'java').name;
                        const prop = safeIdentifier(a.name || 'unnamed');
                        sb.push(`  ${t} ${prop};`);
                    }
                }
                // operations as signatures
                if (Array.isArray(cls.operations)) {
                    for (const o of cls.operations) {
                        const ret = this.TypeModel.mapTypeForLang(o.returnType || 'void', 'java').name;
                        const params = (Array.isArray(o.parameters) ? o.parameters.map((p: any) => `${this.TypeModel.mapTypeForLang(p.type || 'Object', 'java').name} ${safeIdentifier(p.name || 'p')}`).join(', ') : '');
                        sb.push(`  ${ret} ${safeIdentifier(o.name || 'method')}(${params});`);
                    }
                }
                sb.push('}');
            } else {
                const modifiers = cls.isAbstract ? 'public abstract class' : 'public class';
                const bases: string[] = [];
                //if (cls.baseClass && cls.baseClass !== 'None') bases.push(pascalCase(cls.baseClass));
                const impls: string[] = [];
                if (Array.isArray(cls.interfaces)) for (const i of cls.interfaces) if (i) impls.push(pascalCase(i));
                const extendsClause = bases.length > 0 ? (' extends ' + bases[0]) : '';
                const implClause = impls.length > 0 ? (' implements ' + impls.join(', ')) : '';
                sb.push(`${modifiers} ${name}${extendsClause}${implClause} {`);
                // attributes
                if (Array.isArray(cls.attributes)) {
                    for (const a of cls.attributes) {
                        const t = this.TypeModel.mapTypeForLang(a.type || 'Object', 'java').name;
                        const prop = safeIdentifier(a.name || 'unnamed');
                        const vis = a.visibility || 'private';
                        const emit = shouldEmitModifier(a.modifier);
                        const modText = emit ? (a.modifier + ' ') : '';
                        sb.push(`  ${vis} ${modText}${t} ${prop};`);
                    }
                }
                sb.push('');
                // constructor
                sb.push(`  public ${name}() { }`);
                sb.push('');
                // operations
                if (Array.isArray(cls.operations)) {
                    for (const o of cls.operations) {
                        const ret = this.TypeModel.mapTypeForLang(o.returnType || 'void', 'java').name;
                        const methodName = safeIdentifier(o.name || 'method');
                        const vis = o.visibility || 'private';
                        const emit = shouldEmitModifier(o.modifier);
                        const modText = emit ? (o.modifier + ' ') : '';
                        const params = (Array.isArray(o.parameters) ? o.parameters.map((p: any) => `${this.TypeModel.mapTypeForLang(p.type || 'Object', 'java').name} ${safeIdentifier(p.name || 'p')}`).join(', ') : '');
                        if (o.modifier === 'abstract' && cls.isAbstract) {
                            sb.push(`  ${vis} abstract ${ret} ${methodName}(${params});`);
                        } else {
                            sb.push(`  ${vis} ${modText}${ret} ${methodName}(${params}) {`);
                            if (ret !== 'void') sb.push('    throw new UnsupportedOperationException("Not implemented");');
                            else sb.push('    // TODO');
                            sb.push('  }');
                        }
                    }
                }
                sb.push('}');
            }

            const text = sb.join('\n');
            const fileUri = vscode.Uri.joinPath(outputFolder, `${name}.java`);
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(text, 'utf8'));
        }
    }

}
