import * as vscode from 'vscode';
import { CodeBuilder, IObjectModel, IAttributeModel, IOperationModel, safeIdentifier, typeName, pascalCase, collectInheritedMembers, buildClassMaps, opSignatureKey, IParameterModel, IClassModel, camelCase } from './CodeGenerator';
import console = require('node:console');


export class CSharpBuilder extends CodeBuilder {

    protected ownAttrs: { name: string, attr: IAttributeModel }[] = []
    protected inheritedAttrs: { name: string, attr: IAttributeModel }[] = []
    public generateImports(cls: IClassModel): string[] {
        const imports: string[] = [];
        imports.push('using System;');
        imports.push('');
        return imports;
    }
    public generateClassDeclaration(cls: IClassModel): string {
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
    public generateAttributes(cls: IClassModel): string[] {
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
                const modVal = (a.modifier || 'None').toLowerCase();
                const emitModifier = (modVal !== 'none' && modVal !== 'aggregation' && modVal !== 'composition');
                const mod = emitModifier ? (a.modifier + ' ') : '';

                if (this.isPrivateVirtualAbstractMember(a)) {
                    continue;
                }

                if (this.isPrivateMemberInAbstractClass(a, cls)) {
                    continue;
                }
                if (this.isAbstractMemberInConcreteClass(a, cls)) {
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
        for (const [attrName, attrObj] of inherited.attributes.entries()) {
            const modStr = (attrObj.modifier || '').toLowerCase();
            const isAbstractProp = modStr.includes('abstract');
            if (!isAbstractProp) continue;
            const propName = pascalCase(attrName);
            if (implementedProps.has(propName)) continue;
            if (attrObj.visibility === 'private') {
                console.warn(`Warning: inherited property ${propName} is private and cannot be overridden; skipping.`);
                continue;
            }
            this.inheritedAttrs.push({ name: attrName, attr: attrObj });
            const t = this.TypeModel.mapTypeForLang(attrObj.type || 'object', 'csharp').name;
            attrs.push('');
            attrs.push(`    ${attrObj.visibility} override ${t} ${propName} { get; set; }`);
        }
        return attrs;
    }
    public generateConstructor(cls: IClassModel): string[] {
        const constructorExp: string[] = [];
        const ownAttrs = Array.isArray(cls.attributes) ? cls.attributes : [];
        const name = safeIdentifier(cls.name || 'Unnamed');
        const implementedPropNames = new Set((ownAttrs || []).map(a => (a.name || '')));
        const baseAttrsToPass = this.inheritedAttrs.filter(x => !implementedPropNames.has(x.name)).map(x => x.attr);
        const targetAttrsToPass = this.ownAttrs.filter(x => !implementedPropNames.has(x.name)).map(x => x.attr);
        const usedParamNames = new Set<string>();
        const baseParams = this.buildParamListForAttributes(baseAttrsToPass, 'csharp', usedParamNames);
        const targetParams = this.buildParamListForAttributes(targetAttrsToPass, 'csharp', usedParamNames);
        const baseCtorArgs = baseParams.map(p => p.paramName).join(', ');
        const ctorParamsSig = baseParams.concat(targetParams).map(p => `${p.typeName} ${p.paramName}`).join(', ');


        let hasBase = false;
        if (cls.baseClass !== 'None' || (cls.baseClassId && this.ClassMaps.idToClass[cls.baseClassId])) {
            hasBase = true;
        }

        if (!cls.isInterface) {
            const baseCtorSuffix = baseParams.length > 0 ? ` : base(${baseCtorArgs})` : '';
            constructorExp.push('');
            constructorExp.push(`    public ${name}(${ctorParamsSig})${baseCtorSuffix}`);
            constructorExp.push('    {');

            for (const p of targetParams) {
                const propName = pascalCase(p.propName);
                constructorExp.push(`        this.${propName} = ${p.paramName};`);
            }
            constructorExp.push('    }');
        }
        return constructorExp;
    }
    public generateOperations(cls: IClassModel): string[] {
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
                const modVal = (op.modifier || 'None').toLowerCase();
                const emitModifier = (modVal !== 'none' && modVal !== 'aggregation' && modVal !== 'composition');
                const mod = emitModifier ? (op.modifier + ' ') : '';
                const params = (Array.isArray(op.parameters) ? op.parameters.map((p: any) => `${typeName(p.type || 'object')} ${safeIdentifier(p.name || 'param')}`).join(', ') : '');

                if (this.isPrivateVirtualAbstractMember(op)) {
                    continue;
                }

                if (this.isPrivateMemberInAbstractClass(op, cls)) {
                    continue;
                }
                if (this.isAbstractMemberInConcreteClass(op, cls)) {
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
    public getClassClosing(): string {
        return '}';
    }
    public getFileName(cls: IClassModel): string {
        return safeIdentifier(cls.name || 'Unnamed');
    }
    public getFileExtension(): string {
        return '.cs';
    }


}
