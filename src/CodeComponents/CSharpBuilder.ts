import * as vscode from 'vscode';
import { CodeBuilder, IObjectModel, IAttributeModel, IOperationModel, safeIdentifier, typeName, pascalCase, collectInheritedMembers, buildClassMaps, opSignatureKey, IParameterModel, IClassModel, camelCase } from './CodeGenerator';
import console = require('node:console');


export class CSharpBuilder extends CodeBuilder {

    protected ownAttrs: { name: string, attr: IAttributeModel }[] = []
    protected inheritedAttrs: { name: string, attr: IAttributeModel }[] = []
    protected generateImports(cls: IClassModel): string[] {
        const imports: string[] = [];
        imports.push('using System;');
        imports.push('');
        return imports;
    }
    protected generateClassDeclaration(cls: IClassModel): string {
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
        if (cls.baseClass && cls.baseClass !== 'None') bases.push(safeIdentifier(cls.baseClass));
        if (Array.isArray(cls.interfaces)) {
            for (const i of cls.interfaces) {
                if (i) {
                    const resultInterface = this.findClassById(i);
                    if (resultInterface) {
                        bases.push(safeIdentifier(resultInterface.name));
                    }
                    //const resolved = nameToClass[i] ? i : (idToClass[i] ? idToClass[i].name : i);
                    //if (resolved) bases.push(safeIdentifier(resolved));

                }
            }
        }
        const baseClause = bases.length > 0 ? (' : ' + bases.join(', ')) : '';
        let declaration = `${modifiers} ${name}${baseClause}\n{`;
        return declaration;
    }
    protected generateAttributes(cls: IClassModel): string[] {
        const attrs: string[] = [];
        const inherited = collectInheritedMembers(cls, this.ObjectModel, this.ClassMaps);
        const implementedProps = new Set((cls.attributes || []).map((a: any) => pascalCase(a.name || '')));

        this.ownAttrs = [];
        // attributes => properties
        if (Array.isArray(cls.attributes)) {
            for (const a of cls.attributes) {
                const t = typeName(a.type || 'object');
                const prop = pascalCase(a.name || 'Unnamed');
                const cProp = camelCase(prop);
                const vis = a.visibility || 'private';
                //const mod = (a.modifier && a.modifier !== 'None') ? (a.modifier + ' ') : '';
                // replace with:
                const modVal = (a.modifier || 'None').toLowerCase();
                // treat aggregation/composition same as None (do not emit modifier)
                const emitModifier = (modVal !== 'none' && modVal !== 'aggregation' && modVal !== 'composition');
                const mod = emitModifier ? (a.modifier + ' ') : '';

                if (this.isPrivateVirtualAbstractMember(a)) {
                    //console.warn(`Warning: property ${prop} is private and abstract; skipping.`);
                    continue;
                }

                if (this.isPrivateMemberInAbstractClass(a, cls)) {
                    //console.warn(`Warning: property ${prop} is private in an abstract class; skipping.`);
                    continue;
                }
                if (this.isAbstractMemberInConcreteClass(a, cls)) {
                    //console.warn(`Warning: property ${prop} is abstract in a non-abstract class; skipping.`);
                    continue;
                }

                if (a.modifier !== 'abstract') {
                    this.ownAttrs.push({ name: t, attr: a });
                }

                if (cls.isInterface) {
                    attrs.push(`    ${t} ${prop} { get; set; }`);
                } else {

                    attrs.push(`    private ${t} _${cProp};`); // データ保持用
                    attrs.push(`    ${vis} ${mod}${t} ${prop} { get { return _${cProp}; } set { _${cProp} = value; } }`);
                }
            }
        }

        this.inheritedAttrs = [];
        // For any inherited abstract attributes (properties) not implemented in cls, generate override properties
        for (const [attrName, attrObj] of inherited.attributes.entries()) {
            // attrObj might be attribute object
            const modStr = (attrObj.modifier || '').toLowerCase();
            const isAbstractProp = modStr.includes('abstract');
            if (!isAbstractProp) continue;
            const propName = pascalCase(attrName);
            if (implementedProps.has(propName)) continue; // already implemented in subclass
            if (attrObj.visibility === 'private') {
                // private properties cannot be overridden; skip
                console.warn(`Warning: inherited property ${propName} is private and cannot be overridden; skipping.`);
                continue;
            }
            this.inheritedAttrs.push({ name: attrName, attr: attrObj });
            const t = this.TypeModel.mapTypeForLang(attrObj.type || 'object', 'csharp').name;
            // emit override property
            attrs.push('');
            attrs.push(`    ${attrObj.visibility} override ${t} ${propName} { get; set; }`);
        }
        return attrs;
    }
    protected generateConstructor(cls: IClassModel): string[] {
        const constructorExp: string[] = [];
        const ownAttrs = Array.isArray(cls.attributes) ? cls.attributes : [];
        const name = safeIdentifier(cls.name || 'Unnamed');
        // build parameter lists:
        // - baseParams: inherited attributes that are NOT overridden in subclass (i.e. subclass doesn't declare same name)
        const implementedPropNames = new Set((ownAttrs || []).map(a => (a.name || '')));
        const baseAttrsToPass = this.inheritedAttrs.filter(x => !implementedPropNames.has(x.name)).map(x => x.attr);
        const targetAttrsToPass = this.ownAttrs.filter(x => !implementedPropNames.has(x.name)).map(x => x.attr);
        // order: baseAttrsToPass (from ancestors) first, then ownAttrs
        const usedParamNames = new Set<string>();
        const baseParams = this.buildParamListForAttributes(baseAttrsToPass, 'csharp', usedParamNames);
        const targetParams = this.buildParamListForAttributes(targetAttrsToPass, 'csharp', usedParamNames);
        //const ownParams = this.buildParamListForAttributes(ownAttrs, 'typescript', usedParamNames);
        // --- constructor generation ---
        // prepare constructor signature
        // base param signature (for base ctor call)
        const baseCtorArgs = baseParams.map(p => p.paramName).join(', ');
        const ctorParamsSig = baseParams.concat(targetParams).map(p => `${p.typeName} ${p.paramName}`).join(', ');

        // Inheritance: if there is a base class, call super with base param names (in same order)
        let hasBase = false;
        if (cls.baseClass !== 'None' || (cls.baseClassId && this.ClassMaps.idToClass[cls.baseClassId])) {
            hasBase = true;
        }
        // constructor default (only for classes)
        if (!cls.isInterface) {
            const baseCtorSuffix = baseParams.length > 0 ? ` : base(${baseCtorArgs})` : '';
            constructorExp.push('');
            constructorExp.push(`    public ${name}(${ctorParamsSig})${baseCtorSuffix}`);
            constructorExp.push('    {');
            // initialize own properties
            for (const p of targetParams) {
                const propName = pascalCase(p.propName);
                constructorExp.push(`        this.${propName} = ${p.paramName};`);
            }
            constructorExp.push('    }');
            //sb.push('');
            //sb.push(`    public ${name}() { }`);
        }
        return constructorExp;
    }
    protected generateOperations(cls: IClassModel): string[] {
        const operations: string[] = [];
        const inherited = collectInheritedMembers(cls, this.ObjectModel, this.ClassMaps);
        const implementedSigs = new Set<string>((cls.operations || []).map((o: IOperationModel) => opSignatureKey(o)));
        const implementedProps = new Set((cls.attributes || []).map((a: any) => pascalCase(a.name || '')));
        // operations => methods
        if (Array.isArray(cls.operations)) {
            for (const op of cls.operations) {
                const ret = typeName(op.returnType || 'void');
                const method = pascalCase(op.name || 'Method');
                const vis = op.visibility || 'private';
                //const mod = (op.modifier && op.modifier !== 'None') ? (op.modifier + ' ') : '';
                // replace with:
                const modVal = (op.modifier || 'None').toLowerCase();
                // treat aggregation/composition same as None (do not emit modifier)
                const emitModifier = (modVal !== 'none' && modVal !== 'aggregation' && modVal !== 'composition');
                const mod = emitModifier ? (op.modifier + ' ') : '';
                const params = (Array.isArray(op.parameters) ? op.parameters.map((p: any) => `${typeName(p.type || 'object')} ${safeIdentifier(p.name || 'param')}`).join(', ') : '');

                if (this.isPrivateVirtualAbstractMember(op)) {
                    //console.warn(`Warning: method ${method} is private and abstract; skipping.`);
                    continue;
                }

                if (this.isPrivateMemberInAbstractClass(op, cls)) {
                    //console.warn(`Warning: method ${method} is private in an abstract class; skipping.`);
                    continue;
                }
                if (this.isAbstractMemberInConcreteClass(op, cls)) {
                    //console.warn(`Warning: method ${method} is abstract in a non-abstract class; skipping.`);
                    continue;
                }

                if (cls.isInterface) {
                    operations.push(`    ${ret} ${method}(${params});`);
                } else {
                    operations.push('');
                    if (modVal === 'abstract') {
                        operations.push(`    ${vis} abstract ${ret} ${method}(${params});`);
                    } else {
                        operations.push(`    ${vis} ${mod}${ret} ${method}(${params})`);
                        operations.push('    {');
                        if (ret !== 'void') {
                            operations.push('        throw new NotImplementedException();');
                        } else {
                            operations.push('        // TODO');
                        }
                        operations.push('    }');
                    }

                }
            }
        }



        for (const [sig, info] of inherited.operations.entries()) {

            const k = sig;
            const inheritedOp = info.op;
            const originClass = info.originClass;
            // qualify "abstractness": treat if op.modifier contains 'abstract' OR origin is interface
            const isAbstract = ((inheritedOp.modifier || '').toLowerCase().includes('abstract')) || (originClass && originClass.isInterface);
            if (!isAbstract) continue;
            if (implementedSigs.has(k)) continue; // implemented in subclass

            // create stub - follow same param list as inheritedOp
            const ret = this.TypeModel.mapTypeForLang(inheritedOp.returnType || 'void', 'csharp').name;
            const method = pascalCase(inheritedOp.name || 'Method');
            const paramsStr = (Array.isArray(inheritedOp.parameters) ? inheritedOp.parameters.map((p: IParameterModel) => `${this.TypeModel.mapTypeForLang(p.type || 'object', 'csharp').name} ${safeIdentifier(p.name || 'param')}`).join(', ') : '');
            // override (C# requires override for abstract methods)
            if (inheritedOp.visibility === 'private') {
                // private methods cannot be overridden; skip
                console.warn(`Warning: inherited method ${method} is private and cannot be overridden; skipping.`);
                continue;
            }
            const vis = inheritedOp.visibility || 'protected';
            const modStr = 'override ';
            operations.push('');
            operations.push(`    ${vis} ${modStr}${ret} ${method}(${paramsStr})`);
            operations.push('    {');
            if (ret !== 'void') operations.push('        throw new NotImplementedException();');
            else operations.push('        // TODO');
            operations.push('    }');
        }
        return operations;
    }
    protected getClassClosing(): string {
        return '}';
    }
    protected getFileName(cls: IClassModel): string {
        return safeIdentifier(cls.name || 'Unnamed');
    }
    protected getFileExtension(): string {
        return '.cs';
    }
    async BuildCode(outputFolder: vscode.Uri, model: IObjectModel) {
        const { nameToClass, idToClass } = buildClassMaps(model);

        for (const cls of model.classes) {
            const name = safeIdentifier(cls.name || 'Unnamed');
            let sb: string[] = [];

            sb.push('using System;');
            sb.push('');
            // class signature
            let modifiers = '';
            if (cls.isInterface) modifiers = 'public interface';
            else if (cls.isAbstract) modifiers = 'public abstract class';
            else modifiers = 'public class';

            const bases: string[] = [];
            if (cls.baseClass && cls.baseClass !== 'None') bases.push(safeIdentifier(cls.baseClass));
            if (Array.isArray(cls.interfaces)) {
                for (const i of cls.interfaces) {
                    if (i) {
                        //const resolved = nameToClass[i] ? i : (idToClass[i] ? idToClass[i].name : i);
                        //if (resolved) bases.push(safeIdentifier(resolved));
                        bases.push(safeIdentifier(i));
                    }
                }
            }
            const baseClause = bases.length > 0 ? (' : ' + bases.join(', ')) : '';
            sb.push(`${modifiers} ${name}${baseClause}`);
            sb.push('{');

            // For any inherited abstract operations not implemented in cls, generate stubs
            const inherited = collectInheritedMembers(cls, model, { nameToClass, idToClass });
            // collect operation signatures already implemented in this class
            const implementedSigs = new Set<string>((cls.operations || []).map((o: any) => opSignatureKey(o)));
            // implemented property names in this class (PascalCase), so we don't duplicate
            const implementedProps = new Set((cls.attributes || []).map((a: any) => pascalCase(a.name || '')));

            const targetAttrs: any[] = [];
            // attributes => properties
            if (Array.isArray(cls.attributes)) {
                for (const a of cls.attributes) {
                    const t = typeName(a.type || 'object');
                    const prop = pascalCase(a.name || 'Unnamed');
                    const vis = a.visibility || 'private';
                    //const mod = (a.modifier && a.modifier !== 'None') ? (a.modifier + ' ') : '';
                    // replace with:
                    const modVal = (a.modifier || 'None').toLowerCase();
                    // treat aggregation/composition same as None (do not emit modifier)
                    const emitModifier = (modVal !== 'none' && modVal !== 'aggregation' && modVal !== 'composition');
                    const mod = emitModifier ? (a.modifier + ' ') : '';

                    if (this.isPrivateVirtualAbstractMember(a)) {
                        //console.warn(`Warning: property ${prop} is private and abstract; skipping.`);
                        continue;
                    }

                    if (this.isPrivateMemberInAbstractClass(a, cls)) {
                        //console.warn(`Warning: property ${prop} is private in an abstract class; skipping.`);
                        continue;
                    }
                    if (this.isAbstractMemberInConcreteClass(a, cls)) {
                        //console.warn(`Warning: property ${prop} is abstract in a non-abstract class; skipping.`);
                        continue;
                    }

                    if (a.modifier !== 'abstract') {
                        targetAttrs.push({ name: t, attr: a });
                    }

                    if (cls.isInterface) {
                        sb.push(`    ${t} ${prop} { get; set; }`);
                    } else {
                        sb.push(`    ${vis} ${mod}${t} ${prop} { get; set; }`);
                    }
                }
            }

            const inheritedAttrs: any[] = [];
            // For any inherited abstract attributes (properties) not implemented in cls, generate override properties
            for (const [attrName, attrObj] of inherited.attributes.entries()) {
                // attrObj might be attribute object
                const modStr = (attrObj.modifier || '').toLowerCase();
                const isAbstractProp = modStr.includes('abstract');
                if (!isAbstractProp) continue;
                const propName = pascalCase(attrName);
                if (implementedProps.has(propName)) continue; // already implemented in subclass
                if (attrObj.visibility === 'private') {
                    // private properties cannot be overridden; skip
                    console.warn(`Warning: inherited property ${propName} is private and cannot be overridden; skipping.`);
                    continue;
                }
                inheritedAttrs.push({ name: attrName, attr: attrObj });
                const t = this.TypeModel.mapTypeForLang(attrObj.type || 'object', 'csharp').name;
                // emit override property
                sb.push('');
                sb.push(`    ${attrObj.visibility} override ${t} ${propName} { get; set; }`);
            }

            const ownAttrs = Array.isArray(cls.attributes) ? cls.attributes : [];

            // build parameter lists:
            // - baseParams: inherited attributes that are NOT overridden in subclass (i.e. subclass doesn't declare same name)
            const implementedPropNames = new Set((ownAttrs || []).map(a => (a.name || '')));
            const baseAttrsToPass = inheritedAttrs.filter(x => !implementedPropNames.has(x.name)).map(x => x.attr);
            const targetAttrsToPass = targetAttrs.filter(x => !implementedPropNames.has(x.name)).map(x => x.attr);
            // order: baseAttrsToPass (from ancestors) first, then ownAttrs
            const usedParamNames = new Set<string>();
            const baseParams = this.buildParamListForAttributes(baseAttrsToPass, 'csharp', usedParamNames);
            const targetParams = this.buildParamListForAttributes(targetAttrsToPass, 'csharp', usedParamNames);
            //const ownParams = this.buildParamListForAttributes(ownAttrs, 'typescript', usedParamNames);
            // --- constructor generation ---
            // prepare constructor signature
            // base param signature (for base ctor call)
            const baseCtorArgs = baseParams.map(p => p.paramName).join(', ');
            const ctorParamsSig = baseParams.concat(targetParams).map(p => `${p.typeName} ${p.paramName}`).join(', ');

            // Inheritance: if there is a base class, call super with base param names (in same order)
            let hasBase = false;
            if (cls.baseClass !== 'None' || (cls.baseClassId && idToClass[cls.baseClassId])) {
                hasBase = true;
            }
            // constructor default (only for classes)
            if (!cls.isInterface) {
                const baseCtorSuffix = baseParams.length > 0 ? ` : base(${baseCtorArgs})` : '';
                sb.push('');
                sb.push(`    public ${name}(${ctorParamsSig})${baseCtorSuffix}`);
                sb.push('    {');
                // initialize own properties
                for (const p of targetParams) {
                    const propName = pascalCase(p.propName);
                    sb.push(`        this.${propName} = ${p.paramName};`);
                }
                sb.push('    }');
                //sb.push('');
                //sb.push(`    public ${name}() { }`);
            }



            // operations => methods
            if (Array.isArray(cls.operations)) {
                for (const op of cls.operations) {
                    const ret = typeName(op.returnType || 'void');
                    const method = pascalCase(op.name || 'Method');
                    const vis = op.visibility || 'private';
                    //const mod = (op.modifier && op.modifier !== 'None') ? (op.modifier + ' ') : '';
                    // replace with:
                    const modVal = (op.modifier || 'None').toLowerCase();
                    // treat aggregation/composition same as None (do not emit modifier)
                    const emitModifier = (modVal !== 'none' && modVal !== 'aggregation' && modVal !== 'composition');
                    const mod = emitModifier ? (op.modifier + ' ') : '';
                    const params = (Array.isArray(op.parameters) ? op.parameters.map((p: any) => `${typeName(p.type || 'object')} ${safeIdentifier(p.name || 'param')}`).join(', ') : '');

                    if (this.isPrivateVirtualAbstractMember(op)) {
                        //console.warn(`Warning: method ${method} is private and abstract; skipping.`);
                        continue;
                    }

                    if (this.isPrivateMemberInAbstractClass(op, cls)) {
                        //console.warn(`Warning: method ${method} is private in an abstract class; skipping.`);
                        continue;
                    }
                    if (this.isAbstractMemberInConcreteClass(op, cls)) {
                        //console.warn(`Warning: method ${method} is abstract in a non-abstract class; skipping.`);
                        continue;
                    }

                    if (cls.isInterface) {
                        sb.push(`    ${ret} ${method}(${params});`);
                    } else {
                        sb.push('');
                        if (modVal === 'abstract') {
                            sb.push(`    ${vis} abstract ${ret} ${method}(${params});`);
                        } else {
                            sb.push(`    ${vis} ${mod}${ret} ${method}(${params})`);
                            sb.push('    {');
                            if (ret !== 'void') {
                                sb.push('        throw new NotImplementedException();');
                            } else {
                                sb.push('        // TODO');
                            }
                            sb.push('    }');
                        }

                    }
                }
            }



            for (const [sig, info] of inherited.operations.entries()) {

                const k = sig;
                const inheritedOp = info.op;
                const originClass = info.originClass;
                // qualify "abstractness": treat if op.modifier contains 'abstract' OR origin is interface
                const isAbstract = ((inheritedOp.modifier || '').toLowerCase().includes('abstract')) || (originClass && originClass.isInterface);
                if (!isAbstract) continue;
                if (implementedSigs.has(k)) continue; // implemented in subclass

                // create stub - follow same param list as inheritedOp
                const ret = this.TypeModel.mapTypeForLang(inheritedOp.returnType || 'void', 'csharp').name;
                const method = pascalCase(inheritedOp.name || 'Method');
                const paramsStr = (Array.isArray(inheritedOp.parameters) ? inheritedOp.parameters.map((p: IParameterModel) => `${this.TypeModel.mapTypeForLang(p.type || 'object', 'csharp').name} ${safeIdentifier(p.name || 'param')}`).join(', ') : '');
                // override (C# requires override for abstract methods)
                if (inheritedOp.visibility === 'private') {
                    // private methods cannot be overridden; skip
                    console.warn(`Warning: inherited method ${method} is private and cannot be overridden; skipping.`);
                    continue;
                }
                const vis = inheritedOp.visibility || 'protected';
                const modStr = 'override ';
                sb.push('');
                sb.push(`    ${vis} ${modStr}${ret} ${method}(${paramsStr})`);
                sb.push('    {');
                if (ret !== 'void') sb.push('        throw new NotImplementedException();');
                else sb.push('        // TODO');
                sb.push('    }');
            }
            sb.push('}');

            const text = sb.join('\n');
            const fileUri = vscode.Uri.joinPath(outputFolder, `${name}.cs`);
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(text, 'utf8'));
        }


    }

}
