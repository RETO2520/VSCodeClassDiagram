import * as vscode from 'vscode';
import { CodeBuilder, IObjectModel, IAttributeModel, IOperationModel, IParameterModel, IClassModel, safeIdentifier, collectInheritedMembers, camelCase, snakeCase } from './CodeGenerator';

export class RustBuilder extends CodeBuilder {

    protected generateImports(cls: IClassModel): string[] {
        // Rust has few automatic imports here; leave empty for now
        return [];
    }

    protected generateClassDeclaration(cls: IClassModel): string {
        const name = safeIdentifier(cls.name || 'Unnamed');
        if (cls.isInterface) {
            return `pub trait ${name} {`;
        }
        // struct for classes (abstract treated same as struct with comment)
        if (cls.isAbstract) {
            return `// abstract
pub struct ${name} {`;
        }
        return `pub struct ${name} {`;
    }

    protected generateAttributes(cls: IClassModel): string[] {
        const lines: string[] = [];
        if (cls.isInterface) {
            // interface: no fields
            //lines.push('}');
            return lines;
        }

        // emit fields
        if (Array.isArray(cls.attributes)) {
            for (const a of cls.attributes) {
                const fieldName = snakeCase(safeIdentifier(a.name || 'unnamed'));
                const ty = this.TypeModel.mapTypeForLang(a.type || '', 'rust').name;
                const vis = (a.visibility === 'public') ? 'pub ' : '';
                lines.push(`    ${vis}${fieldName}: ${ty},`);
            }
        }
        lines.push('}');
        return lines;
    }

    protected generateConstructor(cls: IClassModel): string[] {
        const lines: string[] = [];
        if (cls.isInterface) return lines;
        const name = safeIdentifier(cls.name || 'Unnamed');

        // build params from attributes (no inheritance chaining for Rust)
        const attrs = Array.isArray(cls.attributes) ? cls.attributes : [];
        const used = new Set<string>();
        const params = attrs.map(a => {
            const pName = snakeCase(this.makeParamName(a.name || 'param', used));
            const ty = this.TypeModel.mapTypeForLang(a.type || '', 'rust').name;
            return { pName, ty, propName: snakeCase(safeIdentifier(a.name || 'unnamed')) };
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
        lines.push('');

        return lines;
    }

    protected generateOperations(cls: IClassModel): string[] {
        const lines: string[] = [];

        // interface methods -> trait signatures
        if (cls.isInterface) {
            if (Array.isArray(cls.operations)) {
                for (const o of cls.operations) {
                    const sig = this.buildTraitMethodSignature(o);
                    lines.push(`    ${sig};`);
                }
            }
            lines.push('}');
            return lines;
        }

        // For classes: implement methods in impl block
        const name = safeIdentifier(cls.name || 'Unnamed');
        lines.push('');
        lines.push(`impl ${name} {`);

        if (Array.isArray(cls.operations)) {
            for (const o of cls.operations) {
                if (this.isPrivateMemberInAbstractClass(o, cls)) continue;
                if (this.isAbstractMemberInConcreteClass(o, cls)) continue;
                const methodLines = this.buildMethod(o);
                for (const l of methodLines) lines.push(`    ${l}`);
            }
        }

        // inherited abstract/interface methods -> stubs
        const inherited = collectInheritedMembers(cls, this.ObjectModel, this.ClassMaps);
        const implementedSigs = new Set<string>((cls.operations || []).map(o => this.opKey(o)));
        for (const [sig, info] of inherited.operations.entries()) {
            const inheritedOp = info.op as IOperationModel;
            const origin = info.originClass;
            const isAbstract = ((inheritedOp.modifier || '').toLowerCase().includes('abstract')) || (origin && origin.isInterface);
            if (!isAbstract) continue;
            const key = this.opKey(inheritedOp);
            if (implementedSigs.has(key)) continue;
            const methodLines = this.buildMethod(inheritedOp, true);
            for (const l of methodLines) lines.push(`    ${l}`);
        }

        lines.push('}');
        lines.push('');
        return lines;
    }

    protected getClassClosing(): string {
        return '';
    }

    protected getFileName(cls: IClassModel): string {
        return safeIdentifier(cls.name || 'Unnamed');
    }

    protected getFileExtension(): string {
        return '.rs';
    }

    // ---- helpers ----
    private mapToRustType(t: string): string {
        if (!t) return '()';
        const low = t.toLowerCase();
        if (low === 'int' || low === 'integer') return 'i32';
        if (low === 'long') return 'i64';
        if (low === 'float') return 'f32';
        if (low === 'double') return 'f64';
        if (low === 'string' || low === 'char') return 'String';
        if (low === 'bool' || low === 'boolean') return 'bool';
        if (low === 'void') return '()';
        if (low === 'object') return '()';
        // generics: List<T> -> Vec<T>
        const listMatch = t.match(/^List<(.+)>$/);
        if (listMatch) {
            const inner = listMatch[1].trim();
            return `Vec<${this.mapToRustType(inner)}> `;
        }
        // fallback: use as-is (assume it's a type name)
        return safeIdentifier(t);
    }

    private buildTraitMethodSignature(o: IOperationModel): string {
        const name = safeIdentifier(o.name || 'method');
        const params = (Array.isArray(o.parameters) ? o.parameters.map(p => `${safeIdentifier(p.name || 'p')}: ${this.TypeModel.mapTypeForLang(p.type || '', 'rust').name}`).join(', ') : '');
        const ret = (o.returnType && o.returnType !== 'void') ? `-> ${this.TypeModel.mapTypeForLang(o.returnType || '', 'rust').name}` : '';
        return `fn ${name}(${params}) ${ret}`.trim();
    }

    private buildMethod(o: IOperationModel, isStub: boolean = false): string[] {
        const name = safeIdentifier(o.name || 'method');
        const params = (Array.isArray(o.parameters) ? o.parameters.map(p => `${safeIdentifier(p.name || 'p')}: ${this.TypeModel.mapTypeForLang(p.type || '', 'rust').name}`).join(', ') : '');
        const ret = (o.returnType && o.returnType !== 'void') ? `-> ${this.TypeModel.mapTypeForLang(o.returnType || '', 'rust').name}` : '';
        const sig = `pub fn ${name}(&self${params ? ', ' + params : ''}) ${ret} {`;
        const body = o.returnType && o.returnType !== 'void' ? `unimplemented!()` : `// TODO`;
        return [sig, `        ${body}`, '    }'];
    }

    private opKey(op: IOperationModel): string {
        const params = (op.parameters || []).map(p => (p.type || '')).join(',');
        return `${op.name || 'unnamed'}(${params})`;
    }

}
