import * as vscode from 'vscode';
import { CodeBuilder, IClassModel, IObjectModel, pascalCase, safeIdentifier } from './CodeGenerator';


export class CppBuilder extends CodeBuilder {
    public async Build(outputFolder: vscode.Uri): Promise<void> {
        for (const cls of this.ObjectModel.classes) {
            const name = pascalCase(cls.name || 'Unnamed');

            // Header (.hpp)
            const hLines: string[] = [];
            const guard = `_${name.toUpperCase()}_HPP`;
            hLines.push(`#ifndef ${guard}`);
            hLines.push(`#define ${guard}`);
            hLines.push('');
            hLines.push(...this.generateImports(cls));
            hLines.push('');
            hLines.push(this.generateClassDeclaration(cls));
            hLines.push('public:');
            hLines.push(...this.generateAttributes(cls));
            hLines.push(...this.generateConstructor(cls));
            hLines.push(...this.generateOperations(cls));
            hLines.push(this.getClassClosing());
            hLines.push('');
            hLines.push(`#endif // ${guard}`);

            const hText = hLines.join('\n');
            const hUri = vscode.Uri.joinPath(outputFolder, `${name}.hpp`);
            await vscode.workspace.fs.writeFile(hUri, Buffer.from(hText, 'utf8'));

            // Source (.cpp)
            const cppLines: string[] = [];
            cppLines.push(`#include "${name}.hpp"`);
            cppLines.push('');
            cppLines.push(...this.generateImplementation(cls));

            const cppText = cppLines.join('\n');
            const cppUri = vscode.Uri.joinPath(outputFolder, `${name}.cpp`);
            await vscode.workspace.fs.writeFile(cppUri, Buffer.from(cppText, 'utf8'));
        }
    }

    public generateImports(cls: IClassModel): string[] {
        return [
            `#include <stdexcept>`,
            `#include <string>`
        ];
    }

    public generateClassDeclaration(cls: IClassModel): string {
        const name = pascalCase(cls.name || 'Unnamed');
        return `class ${name} {`;
    }

    public generateAttributes(cls: IClassModel): string[] {
        const lines: string[] = [];
        if (Array.isArray(cls.attributes)) {
            for (const a of cls.attributes) {
                const t = this.TypeModel.mapTypeForLang(a.type || 'auto', 'cpp').name;
                const prop = safeIdentifier(a.name || 'unnamed');
                lines.push(`  ${t} ${prop};`);
            }
        }
        return lines;
    }

    public generateConstructor(cls: IClassModel): string[] {
        const name = pascalCase(cls.name || 'Unnamed');
        return [`  ${name}() {}`];
    }

    public generateOperations(cls: IClassModel): string[] {
        const lines: string[] = [];
        if (Array.isArray(cls.operations)) {
            for (const o of cls.operations) {
                const ret = this.TypeModel.mapTypeForLang(o.returnType || 'void', 'cpp').name;
                const method = safeIdentifier(o.name || 'method');
                const params = (Array.isArray(o.parameters) ? o.parameters.map((p: any) => `${this.TypeModel.mapTypeForLang(p.type || 'auto', 'cpp').name} ${safeIdentifier(p.name || 'p')}`).join(', ') : '');
                if (o.modifier === 'abstract') {
                    lines.push(`  virtual ${ret} ${method}(${params}) = 0;`);
                } else {
                    lines.push(`  virtual ${ret} ${method}(${params});`);
                }
            }
        }
        return lines;
    }

    public getClassClosing(): string {
        return '};';
    }

    public getFileName(cls: IClassModel): string {
        return safeIdentifier(cls.name || 'Unnamed');
    }

    public getFileExtension(): string {
        return '.hpp'; // Default extension for base Build if not overridden
    }

    /**
     * C++ specific: Generate the implementation body for .cpp files
     */
    private generateImplementation(cls: IClassModel): string[] {
        const name = pascalCase(cls.name || 'Unnamed');
        const lines: string[] = [];
        if (Array.isArray(cls.operations)) {
            for (const o of cls.operations) {
                if (o.modifier === 'abstract') continue;

                const ret = this.TypeModel.mapTypeForLang(o.returnType || 'void', 'cpp').name;
                const method = safeIdentifier(o.name || 'method');
                const params = (Array.isArray(o.parameters) ? o.parameters.map((p: any) => `${this.TypeModel.mapTypeForLang(p.type || 'auto', 'cpp').name} ${safeIdentifier(p.name || 'p')}`).join(', ') : '');

                lines.push(`${ret} ${name}::${method}(${params}) {`);
                if (ret !== 'void') {
                    lines.push('  throw std::runtime_error("Not implemented");');
                } else {
                    lines.push('  // TODO');
                }
                lines.push('}');
                lines.push('');
            }
        }
        return lines;
    }

}
