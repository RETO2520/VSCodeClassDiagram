import * as vscode from 'vscode';
import { CodeBuilder, IClassModel, IObjectModel, pascalCase, safeIdentifier, shouldEmitModifier } from './CodeGenerator';


export class JavaBuilder extends CodeBuilder {
    protected generateImports(cls: IClassModel): string[] {
        throw new Error('Method not implemented.');
    }
    protected generateClassDeclaration(cls: IClassModel): string {
        throw new Error('Method not implemented.');
    }
    protected generateAttributes(cls: IClassModel): string[] {
        throw new Error('Method not implemented.');
    }
    protected generateConstructor(cls: IClassModel): string[] {
        throw new Error('Method not implemented.');
    }
    protected generateOperations(cls: IClassModel): string[] {
        throw new Error('Method not implemented.');
    }
    protected getClassClosing(): string {
        throw new Error('Method not implemented.');
    }
    protected getFileName(cls: IClassModel): string {
        return safeIdentifier(cls.name || 'Unnamed');
    }
    protected getFileExtension(): string {
        throw new Error('Method not implemented.');
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
