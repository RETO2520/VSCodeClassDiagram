import * as vscode from 'vscode';
import { CodeBuilder, IObjectModel, IAttributeModel, safeIdentifier, shouldEmitModifier, TypeModel, buildClassMaps, collectInheritedMembers, opSignatureKey, IClassModel, IOperationModel, IParameterModel, WorkflowAst, IActionNode, IIfNode, IWhileNode, IReturnNode, IWorkflowModel, IWorkflowEdge, IGeneratedFile, IForEachNode, IForRangeNode, ISwitchNode, IBreakNode, IContinueNode } from './CodeGenerator';
import console = require('node:console');


export class TypeScriptBuilder extends CodeBuilder {
    public generateTestFiles(cls: IClassModel): IGeneratedFile[] {
        if (cls.isInterface || cls.isAbstract) return [];

        const className = safeIdentifier(cls.name || 'Unnamed');
        const opBlocks: string[] = [];

        for (const op of cls.operations || []) {
            const scenarios = this.extractOperationScenarios(op);
            if (scenarios.length === 0) continue;
            opBlocks.push(...this.buildOperationTests(cls, op, scenarios));
        }

        if (opBlocks.length === 0) return [];

        const lines: string[] = [];
        lines.push(`import { ${className} } from '../${className}';`);
        lines.push('');
        lines.push(`describe('${this.escapeForSingleQuote(className)}', () => {`);
        lines.push(`  const createSut = () => new ${className}(/* TODO: constructor args */);`);
        lines.push('');
        lines.push(...opBlocks);
        lines.push('});');
        lines.push('');

        return [{
            relativePath: `${className}.test.ts`,
            content: lines.join('\n'),
        }];
    }

    public generateImports(cls: IClassModel): string[] {
        const importsValue = new Set<string>(); // needs normal import (value)
        const importsTypeOnly = new Set<string>(); // can be import type

        const bc = this.findBaseClass(cls);
        if (bc) {

            if (bc.name !== cls.name) {
                importsValue.add(bc.name);
            }
        }


        if (Array.isArray(cls.interfaces)) {
            for (const interfaceId of cls.interfaces) {
                const resultInterface = this.findClassById(interfaceId);
                if (resultInterface) {
                    importsTypeOnly.add(resultInterface.name);
                }
            }
        }

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

        for (const v of Array.from(importsValue)) importsTypeOnly.delete(v);

        this.filterOutBuiltins(importsValue, this.TypeModel);
        this.filterOutBuiltins(importsTypeOnly, this.TypeModel);

        const imports: string[] = [];
        const valueList = Array.from(importsValue).sort();
        for (const n of valueList) {
            const file = './' + safeIdentifier(n);
            const sym = safeIdentifier(n);
            imports.push(`import { ${sym} } from '${file}';`);
        }

        const typeList = Array.from(importsTypeOnly).sort();
        if (typeList.length > 0) {
            for (const n of typeList) {
                const file = './' + safeIdentifier(n);
                const sym = safeIdentifier(n);
                imports.push(`import type { ${sym} } from '${file}';`);
            }
        }

        return imports;
    }
    public generateClassDeclaration(cls: IClassModel): string {
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
            const structComment = cls.isStruct ? '/** struct */\n' : '';
            return `${structComment}${modifiers} ${name}${baseClause}${interfaceClause} {`;
        }
    }
    public generateAttributes(cls: IClassModel): string[] {
        const aa = this.analyzeAttribute(cls);
        return [...aa.owns, ...aa.inherits]
    }
    public generateConstructor(cls: IClassModel): string[] {
        const aa = this.analyzeAttribute(cls);  // 再利用
        return this.analyzeConstructor(cls, aa.ownAttrs, aa.inheritedAttrs);
    }
    public generateOperations(cls: IClassModel): string[] {
        const ao = this.analyzeOperation(cls);
        return [...ao.owns, ...ao.inherits];
    }
    public getClassClosing(): string {
        return '}';
    }
    public getFileName(cls: IClassModel): string {
        return safeIdentifier(cls.name || 'Unnamed');
    }
    public getFileExtension(): string {
        return '.ts';
    }
    public generateWorkflow(ast: WorkflowAst): string[] {
        const lines: string[] = [];
        // 変数定義
        for (const v of ast.variables) {
            const t = this.TypeModel.mapTypeForLang(v.type, 'typescript').name;
            const init = v.initialValue ? ` = ${v.initialValue}` : '';
            lines.push(`    let ${v.name}: ${t}${init};`);
        }
        if (ast.variables.length > 0) lines.push('');

        // ボディ
        lines.push(...this.buildWfNodes(ast.body, 1));
        return lines;
    }
    protected generateAction(node: IActionNode, indent: number): string[] {
        const stmt = node.statement.trim();
        if (stmt === 'UNIMPLEMENTED_LOGIC') {
            return [`${this.getIndent(indent)}throw new Error('Not implemented');`];
        }
        if (stmt.startsWith('//') || node.kind === 'comment') {
            return [`${this.getIndent(indent)}${stmt}`];
        }
        const suffix = (stmt.endsWith(';') || stmt.endsWith('}')) ? '' : ';';
        return [`${this.getIndent(indent)}${stmt}${suffix}`];
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
    protected generateForEach(node: IForEachNode, indent: number): string[] {
        const lines: string[] = [];
        lines.push(`${this.getIndent(indent)}for (const ${safeIdentifier(node.variable)} of ${node.collection}) {`);
        lines.push(...this.buildWfNodes(node.body, indent + 1));
        lines.push(`${this.getIndent(indent)}}`);
        return lines;
    }
    protected generateForRange(node: IForRangeNode, indent: number): string[] {
        const v = safeIdentifier(node.variable);
        const lines: string[] = [];
        lines.push(`${this.getIndent(indent)}for (let ${v} = ${node.from}; ${v} <= ${node.to}; ${v}++) {`);
        lines.push(...this.buildWfNodes(node.body, indent + 1));
        lines.push(`${this.getIndent(indent)}}`);
        return lines;
    }
    protected generateSwitch(node: ISwitchNode, indent: number): string[] {
        const lines: string[] = [];
        lines.push(`${this.getIndent(indent)}switch (${node.expression}) {`);
        for (const c of node.cases || []) {
            lines.push(`${this.getIndent(indent + 1)}case ${c.value}:`);
            lines.push(...this.buildWfNodes(c.body, indent + 2));
            lines.push(`${this.getIndent(indent + 2)}break;`);
        }
        if (node.default && node.default.length > 0) {
            lines.push(`${this.getIndent(indent + 1)}default:`);
            lines.push(...this.buildWfNodes(node.default, indent + 2));
        }
        lines.push(`${this.getIndent(indent)}}`);
        return lines;
    }
    protected generateBreak(_node: IBreakNode, indent: number): string[] {
        return [`${this.getIndent(indent)}break;`];
    }
    protected generateContinue(_node: IContinueNode, indent: number): string[] {
        return [`${this.getIndent(indent)}continue;`];
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

        const inherited = collectInheritedMembers(cls, this.ObjectModel, this.ClassMaps);
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
                virtualModifier = '?';

            } else {
                modifierText = emit ? (a.modifier + ' ') : '';
            }


            if (this.isPrivateMemberInAbstractClass(a, cls)) {
                continue;
            }
            if (this.isAbstractMemberInConcreteClass(a, cls)) {
                continue;
            }

            if (a.modifier !== 'abstract') {
                sb.ownAttrs.push({ name: prop, attr: a });
            }
            sb.owns.push(`  ${vis} ${modifierText}${prop}${virtualModifier}: ${t};`);
        }

        if (!cls.isInterface) {
            for (const [attrName, attrObj] of inherited.attributes.entries()) {
                const modStr = (attrObj.modifier || '').toLowerCase();
                const isAbstractProp = modStr.includes('abstract');
                if (!isAbstractProp) continue;
                const propSafe = safeIdentifier(attrName);
                if (implementedProps.has(propSafe)) continue;
                const t = this.TypeModel.mapTypeForLang(attrObj.type || 'any', 'typescript').name;
                if (attrObj.visibility === 'private') {
                    console.warn(`Warning: inherited property ${attrName} is private and cannot be overridden; skipping.`);
                    continue;
                }
                sb.inheritedAttrs.push({ name: attrName, attr: attrObj });
                sb.inherits.push(`  ${attrObj.visibility} override ${propSafe}: ${t};`);

            }
        }

        return sb;
    }

    analyzeConstructor(cls: IClassModel, ownAttributes: { name: string, attr: IAttributeModel }[], inheritedAttributes: { name: string, attr: IAttributeModel }[]): string[] {

        let constructorText: string[] = [];
        if (cls.isInterface) return constructorText;

        // ownAttributes.name is the property name (already fixed in analyzeAttribute)
        // inheritedAttributes.name is also the property name

        const baseAttrsToPass = inheritedAttributes.map(x => x.attr);
        const targetAttrsToPass = ownAttributes.map(x => x.attr);

        const usedParamNames = new Set<string>();
        const baseParams = this.buildParamListForAttributes(baseAttrsToPass, 'typescript', usedParamNames);
        const targetParams = this.buildParamListForAttributes(targetAttrsToPass, 'typescript', usedParamNames);
        const allParams = baseParams.concat(targetParams);
        const paramsSignature = allParams.map(p => `${p.paramName}: ${p.typeName}`).join(', ');

        let hasBase = false;
        if (cls.baseClass && cls.baseClass !== 'None') {
            hasBase = true;
        } else if (cls.baseClassId && this.ClassMaps.idToClass[cls.baseClassId]) {
            hasBase = true;
        }

        const baseArgList = baseParams.map(p => p.paramName).join(', ');


        // constructor
        constructorText.push('');
        constructorText.push(`  constructor(${paramsSignature}) {`);
        if (hasBase) {
            constructorText.push(`    super(${baseArgList});`);
        }

        // initialize own properties
        for (const p of targetParams) {
            const propName = safeIdentifier(p.propName);
            constructorText.push(`    this.${propName} = ${p.paramName};`);
        }

        constructorText.push('  }');
        constructorText.push('');
        return constructorText;
    }

    /**
     * workflow ノード群を JSDoc の @scenario / @given / @when / @then / @how / @why
     * アノテーション行に変換する。
     *
     * ノードの label は "Given: xxx" / "When: xxx" / "Then: xxx" / "And: xxx" /
     * "But: xxx" 形式を前提とする（TypescriptAstParser が生成する形式）。
     * keyword がない場合は @scenario ブロック直下の説明として処理する。
     */
    private workflowToJsDocLines(workflow: IWorkflowModel, stableId?: string): string[] {
        const lines: string[] = [];
        const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]));
        const outEdges = new Map<string, IWorkflowEdge[]>();
        for (const e of workflow.edges) {
            if (!outEdges.has(e.from)) outEdges.set(e.from, []);
            outEdges.get(e.from)!.push(e);
        }

        const startNode = workflow.nodes.find(n => n.type === 'start');
        if (!startNode) return lines;

        if (stableId) lines.push(`   * @id ${stableId}`);

        // start から出るエッジ = 各シナリオ
        const scenarioEdges = (outEdges.get(startNode.id) ?? [])
            .sort((a, b) => {
                const ax = nodeMap.get(a.to)?.x ?? 0;
                const bx = nodeMap.get(b.to)?.x ?? 0;
                return ax - bx;
            });

        const KEYWORD_TO_TAG: Record<string, string> = {
            'given': '@given',
            'when': '@when',
            'then': '@then',
            'and': '@and',
            'but': '@but',
            'how': '@how',
            'why': '@why',
            // 日本語キーワード
            '前提': '@given',
            'もし': '@when',
            'ならば': '@then',
            'かつ': '@and',
            'しかし': '@but',
        };

        for (const scenarioEdge of scenarioEdges) {
            const scenarioName = scenarioEdge.condition ?? '振る舞い';
            const srcSuffix = (scenarioEdge.srcs && scenarioEdge.srcs.length > 0)
                ? ' ' + scenarioEdge.srcs.map((s: { label: string; url: string }) => `src:${s.label} ${s.url}`).join(' ')
                : '';
            lines.push(`   * @scenario ${scenarioName}${srcSuffix}`);

            // シナリオのステップをたどる
            const visited = new Set<string>();
            let cur: string | null = scenarioEdge.to;
            while (cur) {
                if (visited.has(cur)) break;
                visited.add(cur);
                const node = nodeMap.get(cur);
                if (!node || node.type === 'start' || node.type === 'end') break;

                // "Keyword: text" 形式をパース
                const colonIdx = node.label.indexOf(': ');
                let tag = '@and';
                let text = node.label;
                if (colonIdx !== -1) {
                    const kw = node.label.slice(0, colonIdx).toLowerCase();
                    tag = KEYWORD_TO_TAG[kw] ?? '@and';
                    text = node.label.slice(colonIdx + 2);
                }
                lines.push(`   * ${tag} ${text}`);

                // How / Why メタデータ
                const howSteps: string[] | undefined = (node as any).metadata?.howSteps;
                if (howSteps && howSteps.length > 0) {
                    for (const s of howSteps) lines.push(`   * @how ${s}`);
                }
                const whyReason: string | undefined = (node as any).metadata?.whyReason;
                if (whyReason) lines.push(`   * @why ${whyReason}`);

                const nexts: IWorkflowEdge[] = (outEdges.get(cur) ?? []).filter(e => e.condition == null);
                cur = nexts.length > 0 ? nexts[0].to : null;
            }
        }
        return lines;
    }

    analyzeOperation(cls: IClassModel): { owns: string[], inherits: string[] } {
        let ownAttrs: string[] = [];
        let inheritedAttrs: string[] = [];
        let sb: { owns: string[], inherits: string[] } = { owns: ownAttrs, inherits: inheritedAttrs };
        const inherited = collectInheritedMembers(cls, this.ObjectModel, this.ClassMaps);
        const implementedSigs = new Set<string>((cls.operations || []).map((o: IOperationModel) => opSignatureKey(o)));

        for (const o of cls.operations) {
            const ret = this.TypeModel.mapTypeForLang(o.returnType || 'void', 'typescript').name;
            const method = safeIdentifier(o.name || 'method');
            const vis = o.visibility || 'public';
            const emit = shouldEmitModifier(o.modifier);
            const modOp = emit ? (o.modifier + ' ') : '';
            const paramsStr = (Array.isArray(o.parameters) ? o.parameters.map((p: IParameterModel) => `${safeIdentifier(p.name || 'p')}: ${this.TypeModel.mapTypeForLang(p.type || 'any', 'typescript').name}`).join(', ') : '');

            if (this.isAbstractMemberInConcreteClass(o, cls)) {
                continue;
            }

            if (o.modifier === 'abstract' || cls.isAbstract && o.modifier === 'abstract') {
                sb.owns.push(`  ${vis} abstract ${method}(${paramsStr}): ${ret};`);
            } else if (cls.isInterface) {
                sb.owns.push(`  ${method}(${paramsStr}): ${ret};`);
            } else {
                // ── JSDoc 生成 ──────────────────────────────────────────
                // 優先順位: (1) workflow ノード群  (2) gherkinRaw 生テキスト
                const hasWorkflow = !!o.workflow && (o.workflow.nodes?.length ?? 0) > 0;
                const hasGherkinRaw = !!(o.additionalInfo?.gherkinRaw);

                if (hasWorkflow || hasGherkinRaw) {
                    sb.owns.push('  /**');

                    if (hasWorkflow) {
                        // workflow ノードから構造化 JSDoc を生成
                        const jsdocLines = this.workflowToJsDocLines(
                            o.workflow!,
                            o.additionalInfo?.stableId,
                        );
                        for (const l of jsdocLines) sb.owns.push(l);
                    } else {
                        // フォールバック: gherkinRaw をそのまま出力
                        if (o.additionalInfo?.stableId) {
                            sb.owns.push(`   * @id ${o.additionalInfo.stableId}`);
                        }
                        for (const line of o.additionalInfo!.gherkinRaw!.split('\n')) {
                            if (line.trim()) sb.owns.push(`   * ${line}`);
                        }
                    }

                    sb.owns.push('   */');
                }

                sb.owns.push(`  ${vis} ${modOp}${method}(${paramsStr}): ${ret} {`);

                // ── メソッドボディ生成 ───────────────────────────────────
                // workflowAst がある場合はその構造に基づいたボイラープレートを生成
                if (o.workflowAst) {
                    const wfLines = this.generateWorkflow(o.workflowAst);
                    for (const l of wfLines) sb.owns.push(`  ${l}`);
                } else if (ret !== 'void') {
                    sb.owns.push(`    throw new Error('Not implemented');`);
                } else {
                    sb.owns.push(`    // TODO: implement`);
                }
                sb.owns.push('  }');
            }
        }

        for (const [sig, info] of inherited.operations.entries()) {
            const inheritedOp = info.op;
            const originClass = info.originClass;
            const isAbstract = ((inheritedOp.modifier || '').toLowerCase().includes('abstract')) || (originClass && originClass.isInterface);
            if (!isAbstract) continue;
            if (implementedSigs.has(sig)) continue;

            const ret = this.TypeModel.mapTypeForLang(inheritedOp.returnType || 'void', 'typescript').name;
            const method = safeIdentifier(inheritedOp.name || 'method');
            const paramsStr = (Array.isArray(inheritedOp.parameters) ? inheritedOp.parameters.map((p: IParameterModel) => `${safeIdentifier(p.name || 'p')}: ${this.TypeModel.mapTypeForLang(p.type || 'any', 'typescript').name}`).join(', ') : '');
            if (inheritedOp.visibility === 'private') {
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
        const builtinTs = new Set(['number', 'string', 'boolean', 'void', 'any', 'object', 'unknown', 'never', 'null', 'undefined', 'Array', 'Set', 'Map', 'Record', 'Promise', 'Error', 'Date', 'RegExp']);

        for (const name of Array.from(setIn)) {
            const lower = name.toLowerCase();
            // map common primitive names that might be used in model (string,int,bool)
            if (['int', 'integer', 'bool', 'boolean', 'double', 'float', 'string', 'object', 'void', 'char'].includes(lower)) {
                setIn.delete(name);
                continue;
            }
            const mapped = tm.mapTypeForLang(name, 'typescript')?.name || name;
            if (builtinTs.has(mapped)) setIn.delete(name);
        }
    }

    private extractOperationScenarios(op: IOperationModel): Array<{ name: string; steps: Array<{ keyword: string; text: string }> }> {
        if (op.workflow && (op.workflow.nodes?.length ?? 0) > 0) {
            return this.extractScenariosFromWorkflow(op.workflow);
        }
        if (op.additionalInfo?.gherkinRaw) {
            return this.extractScenariosFromRaw(op.additionalInfo.gherkinRaw);
        }
        return [];
    }

    private extractScenariosFromWorkflow(workflow: IWorkflowModel): Array<{ name: string; steps: Array<{ keyword: string; text: string }> }> {
        const out: Array<{ name: string; steps: Array<{ keyword: string; text: string }> }> = [];
        const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]));
        const outEdges = new Map<string, IWorkflowEdge[]>();
        for (const e of workflow.edges) {
            if (!outEdges.has(e.from)) outEdges.set(e.from, []);
            outEdges.get(e.from)!.push(e);
        }

        const startNode = workflow.nodes.find(n => n.type === 'start');
        if (!startNode) return out;

        const scenarioEdges = (outEdges.get(startNode.id) ?? [])
            .sort((a, b) => (nodeMap.get(a.to)?.x ?? 0) - (nodeMap.get(b.to)?.x ?? 0));

        let idx = 1;
        for (const scenarioEdge of scenarioEdges) {
            const scenario = {
                name: scenarioEdge.condition?.trim() || `Scenario ${idx++}`,
                steps: [] as Array<{ keyword: string; text: string }>,
            };

            const visited = new Set<string>();
            let cur: string | null = scenarioEdge.to;
            while (cur) {
                if (visited.has(cur)) break;
                visited.add(cur);
                const node = nodeMap.get(cur);
                if (!node || node.type === 'start' || node.type === 'end') break;
                scenario.steps.push(this.parseLabeledStep(node.label));
                const nexts: IWorkflowEdge[] = (outEdges.get(cur) ?? []).filter(e => e.condition == null);
                cur = nexts.length > 0 ? nexts[0].to : null;
            }

            if (scenario.steps.length > 0) out.push(scenario);
        }
        return out;
    }

    private extractScenariosFromRaw(gherkinRaw: string): Array<{ name: string; steps: Array<{ keyword: string; text: string }> }> {
        const scenarios: Array<{ name: string; steps: Array<{ keyword: string; text: string }> }> = [];
        let current: { name: string; steps: Array<{ keyword: string; text: string }> } | null = null;
        let unnamedCounter = 1;

        const pushCurrent = () => {
            if (current && current.steps.length > 0) scenarios.push(current);
        };

        const normalizeLine = (raw: string) => raw.trim().replace(/^\*\s*/, '');

        const lines = gherkinRaw.split('\n');
        for (const raw of lines) {
            const line = normalizeLine(raw);
            if (!line) continue;

            const scenarioTag = line.match(/^@scenario\s+(.+)$/i);
            const scenarioKeyword = line.match(/^(?:Scenario|シナリオ)\s*:\s*(.+)$/i);
            if (scenarioTag || scenarioKeyword) {
                pushCurrent();
                current = { name: (scenarioTag?.[1] ?? scenarioKeyword?.[1] ?? `Scenario ${unnamedCounter++}`).trim(), steps: [] };
                continue;
            }

            const taggedStep = line.match(/^@(given|when|then|and|but|how|why)\s+(.+)$/i);
            if (taggedStep) {
                if (!current) current = { name: `Scenario ${unnamedCounter++}`, steps: [] };
                current.steps.push({ keyword: taggedStep[1].toLowerCase(), text: taggedStep[2].trim() });
                continue;
            }


            const stepKeyword = line.match(/^(Given|When|Then|And|But|How|Why)\s*[: ]\s*(.+)$/i);
            if (stepKeyword) {
                if (!current) current = { name: `Scenario ${unnamedCounter++}`, steps: [] };
                current.steps.push({
                    keyword: this.normalizeKeyword(stepKeyword[1]),
                    text: stepKeyword[2].trim(),
                });
                continue;
            }
        }

        pushCurrent();
        return scenarios;
    }

    private parseLabeledStep(label: string): { keyword: string; text: string } {
        const m = label.match(/^([^:]+):\s*(.+)$/);
        if (!m) return { keyword: 'step', text: label.trim() };
        return {
            keyword: this.normalizeKeyword(m[1]),
            text: m[2].trim(),
        };
    }

    private normalizeKeyword(keyword: string): string {
        const k = keyword.trim().toLowerCase();
        const map: Record<string, string> = {
            'given': 'given',
            'when': 'when',
            'then': 'then',
            'and': 'and',
            'but': 'but',
            'how': 'how',
            'why': 'why',
            // 日本語キーワード
        };
        return map[k] ?? 'step';
    }

    private buildOperationTests(
        cls: IClassModel,
        op: IOperationModel,
        scenarios: Array<{ name: string; steps: Array<{ keyword: string; text: string }> }>
    ): string[] {
        const lines: string[] = [];
        const opName = safeIdentifier(op.name || 'method');
        const callArgs = (op.parameters || []).map(p => this.defaultValueForType(p.type)).join(', ');
        const returnsVoid = this.TypeModel.mapTypeForLang(op.returnType || 'void', 'typescript').name === 'void';

        lines.push(`  describe('${this.escapeForSingleQuote(opName)}', () => {`);
        for (const scenario of scenarios) {
            lines.push(`    it('${this.escapeForSingleQuote(scenario.name)}', () => {`);
            lines.push(`      const sut = createSut();`);

            for (const step of scenario.steps) {
                const tag = step.keyword === 'step' ? 'step' : step.keyword;
                lines.push(`      // ${tag.toUpperCase()}: ${step.text}`);
            }

            if (returnsVoid) {
                lines.push(`      sut.${opName}(${callArgs});`);
                lines.push(`      expect(true).toBe(true);`);
            } else {
                lines.push(`      const result = sut.${opName}(${callArgs});`);
                lines.push(`      expect(result).toBeDefined();`);
            }
            lines.push('    });');
            lines.push('');
        }
        lines.push('  });');
        lines.push('');
        return lines;
    }

    private defaultValueForType(typeName: string | undefined): string {
        const mapped = this.TypeModel.mapTypeForLang(typeName || 'any', 'typescript').name.toLowerCase();
        if (mapped === 'number') return '0';
        if (mapped === 'string') return `''`;
        if (mapped === 'boolean') return 'false';
        if (mapped === 'void') return 'undefined';
        if (mapped.endsWith('[]') || mapped === 'array') return '[]';
        return 'null as any';
    }

    private escapeForSingleQuote(text: string): string {
        return (text || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

}
