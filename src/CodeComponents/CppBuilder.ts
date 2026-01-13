import * as vscode from 'vscode';
import { CodeBuilder, IClassModel, IObjectModel, pascalCase, safeIdentifier } from './CodeGenerator';


export class CppBuilder extends CodeBuilder {
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
            // header
            let h: string[] = [];
            const guard = `_${name.toUpperCase()}_HPP`;
            h.push(`#ifndef ${guard}`);
            h.push(`#define ${guard}`);
            h.push('');
            h.push(`#include <stdexcept>`);
            h.push(`#include <string>`);
            h.push('');
            h.push(`class ${name} {`);
            h.push('public:');
            // constructor
            h.push(`  ${name}() {}`);
            // methods (declarations)
            if (Array.isArray(cls.operations)) {
                for (const o of cls.operations) {
                    const ret = this.TypeModel.mapTypeForLang(o.returnType || 'void', 'cpp').name;
                    const method = safeIdentifier(o.name || 'method');
                    const params = (Array.isArray(o.parameters) ? o.parameters.map((p: any) => `${this.TypeModel.mapTypeForLang(p.type || 'auto', 'cpp').name} ${safeIdentifier(p.name || 'p')}`).join(', ') : '');
                    if (o.modifier === 'abstract') {
                        h.push(`  virtual ${ret} ${method}(${params}) = 0;`);
                    } else {
                        h.push(`  virtual ${ret} ${method}(${params});`);
                    }
                }
            }
            // attributes as public members by default
            if (Array.isArray(cls.attributes)) {
                for (const a of cls.attributes) {
                    const t = this.TypeModel.mapTypeForLang(a.type || 'auto', 'cpp').name;
                    const prop = safeIdentifier(a.name || 'unnamed');
                    h.push(`  ${t} ${prop};`);
                }
            }
            h.push('};');
            h.push('');
            h.push(`#endif // ${guard}`);

            // cpp implementation: simple throw for non-void return
            let cppimpl: string[] = [];
            cppimpl.push(`#include "${name}.hpp"`);
            cppimpl.push('');
            if (Array.isArray(cls.operations)) {
                for (const o of cls.operations) {
                    const ret = this.TypeModel.mapTypeForLang(o.returnType || 'void', 'cpp').name;
                    const method = safeIdentifier(o.name || 'method');
                    const params = (Array.isArray(o.parameters) ? o.parameters.map((p: any) => `${this.TypeModel.mapTypeForLang(p.type || 'auto', 'cpp').name} ${safeIdentifier(p.name || 'p')}`).join(', ') : '');
                    if (o.modifier !== 'abstract') {
                        cppimpl.push(`${ret} ${name}::${method}(${params}) {`);
                        if (ret !== 'void') cppimpl.push('  throw std::runtime_error("Not implemented");');
                        else cppimpl.push('  // TODO');
                        cppimpl.push('}');
                        cppimpl.push('');
                    }
                }
            }

            // write files
            const hText = h.join('\n');
            const cppText = cppimpl.join('\n');
            const hUri = vscode.Uri.joinPath(outputFolder, `${name}.hpp`);
            const cppUri = vscode.Uri.joinPath(outputFolder, `${name}.cpp`);
            await vscode.workspace.fs.writeFile(hUri, Buffer.from(hText, 'utf8'));
            await vscode.workspace.fs.writeFile(cppUri, Buffer.from(cppText, 'utf8'));
        }
    }
}
