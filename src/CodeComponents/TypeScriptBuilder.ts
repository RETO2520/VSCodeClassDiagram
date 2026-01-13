import * as vscode from 'vscode';
import { CodeBuilder, IObjectModel, IAttributeModel, safeIdentifier, shouldEmitModifier, TypeModel, buildClassMaps, collectInheritedMembers, opSignatureKey, IClassModel, IOperationModel, IParameterModel } from './CodeGenerator';
import console = require('node:console');


export class TypeScriptBuilder extends CodeBuilder {
    protected generateImports(cls: IClassModel): string[] {
        const importsValue = new Set<string>(); // needs normal import (value)
        const importsTypeOnly = new Set<string>(); // can be import type

        // 1) baseClass (if any) - in our modelForExport baseClass is name; but in extension we may have internal baseClassId; adjust accordingly.
        // We expect generateTypeScript receives modelForExport (names). If not, handle both cases.
        const bc = this.findBaseClass(cls);
        if (bc) {

            if (bc.name !== cls.name) {
                importsValue.add(bc.name);
            }
        }


        // 2) interfaces (implements) - these are type-only (interfaces), can be imported as 'import type'
        if (Array.isArray(cls.interfaces)) {
            // interfaces might be ids (internal) or names (export). Try resolve to names.
            for (const interfaceId of cls.interfaces) {
                const resultInterface = this.findClassById(interfaceId);
                if (resultInterface) {
                    importsTypeOnly.add(resultInterface.name);
                }
            }
        }

        // 3) attributes types
        if (Array.isArray(cls.attributes)) {
            for (const a of cls.attributes) {
                const refs = this.referencedClassNamesFromType(a.type);
                for (const r of refs) {
                    if (r === cls.name) continue;
                    // attributes are type-only usage
                    importsTypeOnly.add(r);
                }
            }
        }

        // 4) operations: return types + parameters
        if (Array.isArray(cls.operations)) {
            for (const op of cls.operations) {
                const refsRet = this.referencedClassNamesFromType(op.returnType);
                for (const r of refsRet) { if (r !== cls.name) importsTypeOnly.add(r); }
                if (Array.isArray(op.parameters)) {
                    for (const p of op.parameters) {
                        const refsP = this.referencedClassNamesFromType(p.type);
                        for (const r of refsP) { if (r !== cls.name) importsTypeOnly.add(r); }
                    }
                }
            }
        }

        // If any type was marked both type-only and value import, prefer normal import
        for (const v of Array.from(importsValue)) importsTypeOnly.delete(v);
        // Remove builtin / primitives

        this.filterOutBuiltins(importsValue, this.TypeModel);
        this.filterOutBuiltins(importsTypeOnly, this.TypeModel);

        // Now build import strings
        const imports: string[] = [];
        // value imports first
        const valueList = Array.from(importsValue).sort();
        for (const n of valueList) {
            // file name based on safeIdentifier
            const file = './' + safeIdentifier(n);
            const sym = safeIdentifier(n);
            imports.push(`import { ${sym} } from '${file}';`);
        }
        // type-only imports
        const typeList = Array.from(importsTypeOnly).sort();
        if (typeList.length > 0) {
            // For modern TS emit single `import type { A, B } from './X'` per file.
            // But since each referenced name is in its own file, create separate imports:
            for (const n of typeList) {
                const file = './' + safeIdentifier(n);
                const sym = safeIdentifier(n);
                imports.push(`import type { ${sym} } from '${file}';`);
            }
        }

        return imports;
    }
    protected generateClassDeclaration(cls: IClassModel): string {
        let modifiers = '';
        const name = safeIdentifier(cls.name || 'Unnamed');
        const bases: string[] = [];
        const interfaces: string[] = [];
        let baseClause = '';
        let interfaceClause = '';
        if (cls.isInterface) {
            modifiers = 'export interface';
        }
        else if (cls.isAbstract) {
            modifiers = 'export abstract class';
        }
        else {
            modifiers = 'export class';
        }
        if (cls.baseClass && cls.baseClass !== 'None') {
            bases.push(safeIdentifier(cls.baseClass));
        }
        for (const i of cls.interfaces) {
            const resultInterface = this.findClassById(i);
            if (resultInterface) {
                interfaces.push(safeIdentifier(resultInterface.name));
            }
        }
        if (cls.isInterface) {
            interfaceClause = interfaces.length > 0 ? (' extends ' + interfaces.join(', ')) : '';
            return `${modifiers} ${name}${interfaceClause} {`;
        } else {
            baseClause = bases.length > 0 ? (' extends ' + bases.join(', ')) : '';
            interfaceClause = interfaces.length > 0 ? (' implements ' + interfaces.join(', ')) : '';
            return `${modifiers} ${name}${baseClause}${interfaceClause} {`;
        }
    }
    protected generateAttributes(cls: IClassModel): string[] {
        const aa = this.analyzeAttribute(cls);
        return [...aa.owns, ...aa.inherits]
    }
    protected generateConstructor(cls: IClassModel): string[] {
        const aa = this.analyzeAttribute(cls);  // 再利用
        return this.analyzeConstructor(cls, aa.ownAttrs, aa.inheritedAttrs);
    }
    protected generateOperations(cls: IClassModel): string[] {
        const ao = this.analyzeOperatetion(cls);
        return [...ao.owns, ...ao.inherits];
    }
    protected getClassClosing(): string {
        return '}';
    }
    protected getFileName(cls: IClassModel): string {
        return safeIdentifier(cls.name || 'Unnamed');
    }
    protected getFileExtension(): string {
        return '.ts';
    }



    analyzeAttribute(cls: IClassModel): { owns: string[], inherits: string[], ownAttrs: { name: string, attr: IAttributeModel }[], inheritedAttrs: { name: string, attr: IAttributeModel }[] } {

        const inheritedAttrObjects: { name: string, attr: IAttributeModel }[] = [];
        const ownAttrObjects: { name: string, attr: IAttributeModel }[] = [];
        let ownAttrTexts: string[] = [];
        let inheritedAttrTexts: string[] = [];
        let sb: {
            owns: string[],
            inherits: string[],
            ownAttrs: { name: string, attr: IAttributeModel }[],
            inheritedAttrs: { name: string, attr: IAttributeModel }[]
        } = { owns: ownAttrTexts, inherits: inheritedAttrTexts, ownAttrs: ownAttrObjects, inheritedAttrs: inheritedAttrObjects };
        // 
        // --- prepare inherited info: use collectInheritedMembers ---
        const inherited = collectInheritedMembers(cls, this.ObjectModel, this.ClassMaps);
        // implemented signatures in subclass (for methods)
        const implementedSigs = new Set<string>((cls.operations || []).map((o: IOperationModel) => opSignatureKey(o)));
        // implemented props in subclass (safe identifier form)
        const implementedProps = new Set((cls.attributes || []).map((a: IAttributeModel) => safeIdentifier(a.name || '')));



        if (!Array.isArray(cls.attributes)) return sb;
        for (const a of cls.attributes) {

            const t = this.TypeModel.mapTypeForLang(a.type || 'any', 'typescript').name;
            const prop = safeIdentifier(a.name || 'unnamed');
            const vis = a.visibility || 'private';
            const emit = shouldEmitModifier(a.modifier);
            let modifierText = '';
            let virtualModifier = '';

            if (a.modifier === 'virtual') {
                // TypeScript does not have 'virtual' keyword; ignore
                virtualModifier = '?';

            } else {
                modifierText = emit ? (a.modifier + ' ') : '';
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
                sb.ownAttrs.push({ name: t, attr: a });
            }
            //sb.owns
            sb.owns.push(`  ${vis} ${modifierText}${prop}${virtualModifier}: ${t};`);
        }

        if (!cls.isInterface) {
            for (const [attrName, attrObj] of inherited.attributes.entries()) {
                // pair could be [name, attrObj] for Map or entries
                const modStr = (attrObj.modifier || '').toLowerCase();
                const isAbstractProp = modStr.includes('abstract');
                if (!isAbstractProp) continue;
                const propSafe = safeIdentifier(attrName);
                if (implementedProps.has(propSafe)) continue;
                const t = this.TypeModel.mapTypeForLang(attrObj.type || 'any', 'typescript').name;
                // TypeScript override keyword (TS 4.3+). If you need backward compatibility, remove 'override'.
                if (attrObj.visibility === 'private') {
                    // private properties cannot be overridden; skip
                    console.warn(`Warning: inherited property ${attrName} is private and cannot be overridden; skipping.`);
                    continue;
                }
                sb.inheritedAttrs.push({ name: attrName, attr: attrObj });
                //targetAttrs.push({ name: attrName, attr: attrObj });
                sb.inherits.push(`  ${attrObj.visibility} override ${propSafe}: ${t};`);

            }
        }

        return sb;
    }

    analyzeConstructor(cls: IClassModel, ownAttributs: { name: string, attr: IAttributeModel }[], inheritedAttributs: { name: string, attr: IAttributeModel }[]): string[] {

        let constructorText: string[] = [];
        if (cls.isInterface) return constructorText;
        // own attributes

        const ownAttrs = Array.isArray(cls.attributes) ? cls.attributes : [];

        // build parameter lists:
        // - baseParams: inherited attributes that are NOT overridden in subclass (i.e. subclass doesn't declare same name)
        const implementedPropNames = new Set((ownAttrs || []).map(a => (a.name || '')));
        const baseAttrsToPass = inheritedAttributs.filter(x => !implementedPropNames.has(x.name)).map(x => x.attr);
        const targetAttrsToPass = ownAttributs.filter(x => !implementedPropNames.has(x.name)).map(x => x.attr);
        // order: baseAttrsToPass (from ancestors) first, then ownAttrs
        const usedParamNames = new Set<string>();
        const baseParams = this.buildParamListForAttributes(baseAttrsToPass, 'typescript', usedParamNames);
        const targetParams = this.buildParamListForAttributes(targetAttrsToPass, 'typescript', usedParamNames);
        //const ownParams = this.buildParamListForAttributes(ownAttrs, 'typescript', usedParamNames);
        // --- constructor generation ---
        // Build parameter string: baseParams then ownParams
        const allParams = baseParams.concat(targetParams);
        const paramsSignature = allParams.map(p => `${p.paramName}: ${p.typeName}`).join(', ');
        //const paramsSignature = baseParams.map(p => `${p.paramName}: ${p.typeName}`).join(', ');

        // Inheritance: if there is a base class, call super with base param names (in same order)
        let hasBase = false;
        if (cls.baseClass !== 'None' || (cls.baseClassId && this.ClassMaps.idToClass[cls.baseClassId])) {
            hasBase = true;
        }
        //const hasBase = !!(cls.baseClass || (cls.baseClassId && idToClass[cls.baseClassId]));

        const baseArgList = baseParams.map(p => p.paramName).join(', ');


        // constructor
        constructorText.push('');
        constructorText.push(`  constructor(${paramsSignature}) {`);
        if (hasBase) {
            constructorText.push(`    super(${baseArgList});`);
        }
        // initialise own properties
        for (const p of baseParams) {
            const propName = safeIdentifier(p.propName);
            constructorText.push(`    this.${propName} = ${p.paramName};`);
        }
        for (const p of targetParams) {
            const propName = safeIdentifier(p.propName);
            constructorText.push(`    this.${propName} = ${p.paramName};`);
        }
        // Optionally: also set overridden inherited properties if subclass overrides them — but we already excluded overridden from baseParams.
        constructorText.push('  }');
        constructorText.push('');
        return constructorText;
    }

    analyzeOperatetion(cls: IClassModel): { owns: string[], inherits: string[] } {
        let ownAttrs: string[] = [];
        let inheritedAttrs: string[] = [];
        let sb: { owns: string[], inherits: string[] } = { owns: ownAttrs, inherits: inheritedAttrs };
        const inherited = collectInheritedMembers(cls, this.ObjectModel, this.ClassMaps);
        // implemented signatures in subclass (for methods)
        const implementedSigs = new Set<string>((cls.operations || []).map((o: IOperationModel) => opSignatureKey(o)));

        for (const o of cls.operations) {
            const ret = this.TypeModel.mapTypeForLang(o.returnType || 'void', 'typescript').name;
            const method = safeIdentifier(o.name || 'method');
            const vis = o.visibility || 'public';
            const emit = shouldEmitModifier(o.modifier);
            const modOp = emit ? (o.modifier + ' ') : '';
            const paramsStr = (Array.isArray(o.parameters) ? o.parameters.map((p: IParameterModel) => `${safeIdentifier(p.name || 'p')}: ${this.TypeModel.mapTypeForLang(p.type || 'any', 'typescript').name}`).join(', ') : '');

            if (this.isPrivateMemberInAbstractClass(o, cls)) {
                //console.warn(`Warning: method ${method} is private in an abstract class; skipping.`);
                continue;
            }

            if (this.isAbstractMemberInConcreteClass(o, cls)) {
                //console.warn(`Warning: method ${method} is abstract in a non-abstract class; skipping.`);
                continue;
            }

            if (o.modifier === 'abstract' || cls.isAbstract && o.modifier === 'abstract') {
                sb.owns.push(`  ${vis} abstract ${method}(${paramsStr}): ${ret};`);
            } else if (cls.isInterface) {
                sb.owns.push(`  ${method}(${paramsStr}): ${ret};`);
            } else {
                sb.owns.push(`  ${vis} ${modOp}${method}(${paramsStr}): ${ret} {`);
                if (ret !== 'void') sb.owns.push(`    throw new Error('Not implemented');`);
                else sb.owns.push(`    // TODO`);
                sb.owns.push('  }');
            }
        }

        // --- inherited abstract METHODS: implement stubs for abstract/interface methods not implemented in this class ---
        for (const [sig, info] of inherited.operations.entries()) {
            const inheritedOp = info.op;
            const originClass = info.originClass;
            const isAbstract = ((inheritedOp.modifier || '').toLowerCase().includes('abstract')) || (originClass && originClass.isInterface);
            if (!isAbstract) continue;
            if (implementedSigs.has(sig)) continue;

            // build stub
            const ret = this.TypeModel.mapTypeForLang(inheritedOp.returnType || 'void', 'typescript').name;
            const method = safeIdentifier(inheritedOp.name || 'method');
            const paramsStr = (Array.isArray(inheritedOp.parameters) ? inheritedOp.parameters.map((p: IParameterModel) => `${safeIdentifier(p.name || 'p')}: ${this.TypeModel.mapTypeForLang(p.type || 'any', 'typescript').name}`).join(', ') : '');
            // use override keyword (TS 4.3+). If you want optional, make configurable.
            if (inheritedOp.visibility === 'private') {
                // private methods cannot be overridden; skip
                console.warn(`Warning: inherited method ${method} is private and cannot be overridden; skipping.`);
                continue;
            }
            if (originClass.isInterface) {
                sb.inherits.push(`  public ${method}(${paramsStr}): ${ret} {`);
            } else {
                sb.inherits.push(`  public override ${method}(${paramsStr}): ${ret} {`);
            }

            if (ret !== 'void') sb.inherits.push(`    throw new Error('Not implemented');`);
            else sb.inherits.push(`    // TODO`);
            sb.inherits.push('  }');
            sb.inherits.push('');
        }
        return sb;
    }

    // helper: find referenced class-names in a type string.
    // We extract identifier tokens (simple heuristic) and keep those that match class names.
    referencedClassNamesFromType(typeStr: string | undefined): Set<string> {
        const out = new Set<string>();
        if (!typeStr) return out;
        // remove array markers and common generic chars
        // tokenise identifiers
        const tokens = (typeStr.match(/[A-Za-z_]\w*/g) || []);
        for (const t of tokens) {
            if (this.AllClassNames.has(t)) out.add(t);
        }
        return out;
    }
    filterOutBuiltins(setIn: Set<string>, tm: TypeModel) {
        const builtinTs = new Set(['number', 'string', 'boolean', 'void', 'any', 'object', 'unknown', 'never', 'null', 'undefined']);

        for (const name of Array.from(setIn)) {
            const lower = name.toLowerCase();
            // map common primitive names that might be used in model (string,int,bool)
            if (['int', 'integer', 'bool', 'boolean', 'double', 'float', 'string', 'object', 'void'].includes(lower)) {
                setIn.delete(name);
                continue;
            }
            const mapped = tm.mapTypeForLang(name, 'typescript')?.name || name;
            if (builtinTs.has(mapped)) setIn.delete(name);
        }
    }

}
