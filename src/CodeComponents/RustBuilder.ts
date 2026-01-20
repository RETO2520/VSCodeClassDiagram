import * as vscode from 'vscode';
import { CodeBuilder, IObjectModel, IAttributeModel, IOperationModel, IParameterModel, IClassModel, safeIdentifier, collectInheritedMembers, camelCase, snakeCase } from './CodeGenerator';

export class RustBuilder extends CodeBuilder {

    public generateImports(cls: IClassModel): string[] {
        const imports = new Set<string>();

        // Basic requirement: types from other classes need to be imported if we were doing a module per class.
        // For simplicity in this engine, we assume all are in the same crate or submodules.
        // However, we can collect referenced names to see if any standard traits or types are needed.

        // Example: if we use Vec, it's in prelude. if we use HashMap, we need 'use std::collections::HashMap;'
        return Array.from(imports);
    }

    public generateClassDeclaration(cls: IClassModel): string {
        const name = safeIdentifier(cls.name || 'Unnamed');
        if (cls.isInterface) {
            return `pub trait ${name} {`;
        }

        // Rust structs don't support inheritance. 
        // If it's abstract, we still use a struct but might not implement all methods.
        if (cls.isAbstract) {
            return `#[derive(Debug, Default)]\npub struct ${name} {`;
        }
        return `#[derive(Debug, Default)]\npub struct ${name} {`;
    }

    public generateAttributes(cls: IClassModel): string[] {
        const lines: string[] = [];
        if (cls.isInterface) {
            return lines;
        }

        if (Array.isArray(cls.attributes)) {
            for (const a of cls.attributes) {
                // Rust standard is snake_case for fields
                const fieldName = snakeCase(a.name || 'unnamed');
                const ty = this.TypeModel.mapTypeForLang(a.type || 'object', 'rust').name;
                const vis = (a.visibility === 'public') ? 'pub ' : '';
                lines.push(`    ${vis}${fieldName}: ${ty},`);
            }
        }
        lines.push('}');
        return lines;
    }

    public generateConstructor(cls: IClassModel): string[] {
        const lines: string[] = [];
        if (cls.isInterface) return lines;

        const name = safeIdentifier(cls.name || 'Unnamed');
        const attrs = Array.isArray(cls.attributes) ? cls.attributes : [];
        const used = new Set<string>();

        const params = attrs.map(a => {
            const pName = snakeCase(this.makeParamName(a.name || 'param', used));
            const ty = this.TypeModel.mapTypeForLang(a.type || 'object', 'rust').name;
            return { pName, ty, propName: snakeCase(a.name || 'unnamed') };
        });

        const paramsSig = params.map(p => `${p.pName}: ${p.ty}`).join(', ');

        lines.push('');
        lines.push(`impl ${name} {`);
        lines.push(`    pub fn new(${paramsSig}) -> Self {`);
        lines.push('        Self {');
        for (const p of params) {
            lines.push(`            ${p.propName}: ${p.pName},`);
        }
        lines.push('        }');
        lines.push('    }');
        lines.push('}');

        return lines;
    }

    public generateOperations(cls: IClassModel): string[] {
        const lines: string[] = [];
        const name = safeIdentifier(cls.name || 'Unnamed');

        if (cls.isInterface) {
            if (Array.isArray(cls.operations)) {
                for (const o of cls.operations) {
                    const sig = this.buildMethodSignature(o, false);
                    lines.push(`    ${sig};`);
                }
            }
            lines.push('}');
            return lines;
        }

        lines.push('');
        lines.push(`impl ${name} {`);

        if (Array.isArray(cls.operations)) {
            for (const o of cls.operations) {
                if (this.isPrivateMemberInAbstractClass(o, cls)) continue;
                if (this.isAbstractMemberInConcreteClass(o, cls)) continue;

                const methodLines = this.buildMethodImplementation(o);
                for (const l of methodLines) lines.push(`    ${l}`);
            }
        }

        // Handle interface implementations or abstract method overrides
        // In Rust, these would ideally be in a separate `impl Trait for Struct` block, 
        // but for this simple generator, we keep them in the main impl or as stubs.
        const inherited = collectInheritedMembers(cls, this.ObjectModel, this.ClassMaps);
        const implementedNames = new Set((cls.operations || []).map(o => snakeCase(o.name || '')));

        for (const [sig, info] of inherited.operations.entries()) {
            const inheritedOp = info.op;
            const origin = info.originClass;
            const isAbstract = ((inheritedOp.modifier || '').toLowerCase().includes('abstract')) || (origin && origin.isInterface);
            if (!isAbstract) continue;

            const mName = snakeCase(inheritedOp.name || '');
            if (implementedNames.has(mName)) continue;

            const methodLines = this.buildMethodImplementation(inheritedOp);
            for (const l of methodLines) lines.push(`    ${l}`);
        }

        lines.push('}');
        return lines;
    }

    public getClassClosing(): string {
        return '';
    }

    public getFileName(cls: IClassModel): string {
        // Rust files are typically snake_case
        return snakeCase(cls.name || 'Unnamed');
    }

    public getFileExtension(): string {
        return '.rs';
    }

    private buildMethodSignature(o: IOperationModel, isPublic: boolean): string {
        const mName = snakeCase(o.name || 'method');
        const params = (Array.isArray(o.parameters) ? o.parameters.map(p => `${snakeCase(p.name || 'p')}: ${this.TypeModel.mapTypeForLang(p.type || 'object', 'rust').name}`).join(', ') : '');
        const retType = this.TypeModel.mapTypeForLang(o.returnType || 'void', 'rust').name;
        const ret = (retType !== '()') ? ` -> ${retType}` : '';
        const vis = isPublic ? 'pub ' : '';
        return `${vis}fn ${mName}(&self${params ? ', ' + params : ''})${ret}`;
    }

    private buildMethodImplementation(o: IOperationModel): string[] {
        const isPublic = o.visibility === 'public';
        const sig = this.buildMethodSignature(o, isPublic);
        const retType = this.TypeModel.mapTypeForLang(o.returnType || 'void', 'rust').name;
        const body = (retType !== '()') ? 'unimplemented!()' : '// TODO';

        return [
            `${sig} {`,
            `        ${body}`,
            '    }'
        ];
    }
}
