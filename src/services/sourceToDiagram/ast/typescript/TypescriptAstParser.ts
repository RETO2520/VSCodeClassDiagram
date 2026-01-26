import * as vscode from 'vscode';
import { IAstParser } from '../IAstParser';
import { ClassInfo, OperationInfo, AttributeInfo, ParameterInfo } from '../../types';
import { Logger } from '../../../../LoggerComponents/Logger';

/**
 * TypeScriptおよびJavaScript用のASTパーサー
 * @typescript-eslint/parserを使用してASTを構築し、クラス情報を抽出する
 */
export class TypeScriptAstParser implements IAstParser {
    private logger: Logger;
    private parser: any = null;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * @typescript-eslint/parserを動的にロードする
     */
    private async loadParser(): Promise<boolean> {
        return false;
        if (this.parser) return true;
        try {
            //this.parser = await import('@typescript-eslint/parser');
            return true;
        } catch (error) {
            this.logger.warn(`Failed to load @typescript-eslint/parser: ${error}. AST parsing for TS/JS will be disabled.`);
            return false;
        }
    }

    public supports(languageId: string): boolean {
        return languageId === 'typescript' || languageId === 'javascript' ||
            languageId === 'typescriptreact' || languageId === 'javascriptreact';
    }

    public async parse(uri: vscode.Uri, content: string): Promise<ClassInfo[]> {
        if (!(await this.loadParser())) return [];

        try {
            const ast = this.parser.parse(content, {
                range: true,
                loc: true,
                tokens: true,
                comment: true,
                ecmaFeatures: {
                    jsx: true
                }
            });

            const classes: ClassInfo[] = [];
            this.visitNode(ast, uri, classes);
            return classes;
        } catch (error) {
            this.logger.error(`Error parsing AST for ${uri.fsPath}: ${error}`);
            return [];
        }
    }

    private visitNode(node: any, uri: vscode.Uri, classes: ClassInfo[]): void {
        if (!node) return;

        if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression' || node.type === 'TSEnumDeclaration') {
            classes.push(this.extractClassInfo(node, uri));
        } else if (node.type === 'TSInterfaceDeclaration') {
            classes.push(this.extractInterfaceInfo(node, uri));
        }

        // 再帰的に子ノードを探索
        for (const key in node) {
            const child = node[key];
            if (Array.isArray(child)) {
                child.forEach(c => {
                    if (c && typeof c.type === 'string') this.visitNode(c, uri, classes);
                });
            } else if (child && typeof child.type === 'string') {
                this.visitNode(child, uri, classes);
            }
        }
    }

    private extractClassInfo(node: any, uri: vscode.Uri): ClassInfo {
        const classInfo: ClassInfo = {
            name: node.id ? node.id.name : 'AnonymousClass',
            kind: node.abstract ? 'abstract' : 'class',
            interfaces: [],
            location: {
                uri: uri,
                range: this.convertRange(node.loc)
            },
            attributes: [],
            operations: []
        };

        if (node.superClass) {
            classInfo.baseClass = node.superClass.name || 'Unknown';
        }

        if (node.implements) {
            classInfo.interfaces = node.implements.map((imp: any) => imp.expression.name);
        }

        if (node.body && node.body.body) {
            for (const member of node.body.body) {
                if (member.type === 'PropertyDefinition' || member.type === 'MethodDefinition' || member.type === 'TSAbstractMethodDefinition' || member.type === 'TSAbstractPropertyDefinition') {
                    this.extractMemberInfo(member, classInfo);
                }
            }
        }

        return classInfo;
    }

    private extractInterfaceInfo(node: any, uri: vscode.Uri): ClassInfo {
        const classInfo: ClassInfo = {
            name: node.id.name,
            kind: 'interface',
            interfaces: [],
            location: {
                uri: uri,
                range: this.convertRange(node.loc)
            },
            attributes: [],
            operations: []
        };

        if (node.extends) {
            classInfo.interfaces = node.extends.map((ext: any) => ext.expression.name);
        }

        if (node.body && node.body.body) {
            for (const member of node.body.body) {
                if (member.type === 'TSPropertySignature') {
                    classInfo.attributes.push(this.extractAttributeInfo(member));
                } else if (member.type === 'TSMethodSignature') {
                    classInfo.operations.push(this.extractOperationInfo(member));
                }
            }
        }

        return classInfo;
    }

    private extractMemberInfo(node: any, classInfo: ClassInfo): void {
        const isMethod = node.type === 'MethodDefinition' || node.type === 'TSAbstractMethodDefinition';
        const isProperty = node.type === 'PropertyDefinition' || node.type === 'TSAbstractPropertyDefinition';

        if (isMethod) {
            classInfo.operations.push(this.extractOperationInfo(node));
        } else if (isProperty) {
            classInfo.attributes.push(this.extractAttributeInfo(node));
        }
    }

    private extractOperationInfo(node: any): OperationInfo {
        const key = node.key || node;
        const name = key.name || 'anonymous';

        return {
            name: name,
            returnType: this.extractTypeName(node.value?.returnType || node.returnType),
            parameters: this.extractParameters(node.value || node),
            visibility: node.accessibility || 'public',
            modifiers: this.extractModifiers(node),
            location: this.convertRange(node.loc)
        };
    }

    private extractAttributeInfo(node: any): AttributeInfo {
        const key = node.key || node;
        const name = key.name || 'anonymous';

        return {
            name: name,
            type: this.extractTypeName(node.typeAnnotation),
            visibility: node.accessibility || 'public',
            modifiers: this.extractModifiers(node),
            location: this.convertRange(node.loc)
        };
    }

    private extractParameters(node: any): ParameterInfo[] {
        if (!node.params) return [];
        return node.params.map((p: any) => ({
            name: p.name || (p.left ? p.left.name : 'param'),
            type: this.extractTypeName(p.typeAnnotation),
            isOptional: p.optional || false
        }));
    }

    private extractTypeName(typeAnnot: any): string {
        if (!typeAnnot || !typeAnnot.typeAnnotation) return 'any';
        const type = typeAnnot.typeAnnotation;
        if (type.type === 'TSTypeReference' && type.typeName) {
            return type.typeName.name;
        }
        if (type.type === 'TSNumberKeyword') return 'number';
        if (type.type === 'TSStringKeyword') return 'string';
        if (type.type === 'TSBooleanKeyword') return 'boolean';
        if (type.type === 'TSVoidKeyword') return 'void';
        return 'any';
    }

    private extractModifiers(node: any): string[] {
        const mods: string[] = [];
        if (node.static) mods.push('static');
        if (node.readonly) mods.push('readonly');
        if (node.type === 'TSAbstractMethodDefinition' || node.type === 'TSAbstractPropertyDefinition' || node.abstract) {
            mods.push('abstract');
        }
        return mods;
    }

    private convertRange(loc: any): vscode.Range {
        if (!loc) return new vscode.Range(0, 0, 0, 0);
        return new vscode.Range(
            loc.start.line - 1,
            loc.start.column,
            loc.end.line - 1,
            loc.end.column
        );
    }
}
