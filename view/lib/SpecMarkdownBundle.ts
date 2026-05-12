import type { ClassInfo, ClassOperation, Relationship, ParsedEndpoint } from './class-diagram-types'
import { generateMarkdownFromClasses } from './MarkdownGenerator'

export interface MarkdownInput {
    classes: ClassInfo[]
    relationships: Relationship[]
    endpoints?: ParsedEndpoint[]
}

export interface FlowMarkdownDocument {
    fileName: string
    className: string
    operationName: string
    markdown: string
}

export interface SpecMarkdownBundle {
    markdown: string
    flowDocuments: FlowMarkdownDocument[]
}

export function generateSpecMarkdownBundle(input: MarkdownInput): SpecMarkdownBundle {
    const baseMarkdown = generateMarkdownFromClasses(input)
    const flowDocuments = collectFlowDocuments(input.classes)
    if (flowDocuments.length === 0) return { markdown: baseMarkdown, flowDocuments: [] }

    const lines: string[] = [baseMarkdown, '', '## Flow Documents', '']
    for (const doc of flowDocuments) {
        lines.push(`- \`${doc.className}.${doc.operationName}()\`: [${doc.fileName}](./${doc.fileName})`)
    }

    return { markdown: lines.join('\n'), flowDocuments }
}

function collectFlowDocuments(classes: ClassInfo[]): FlowMarkdownDocument[] {
    const docs: FlowMarkdownDocument[] = []
    for (const cls of classes) {
        for (const op of cls.operations) {
            if (!hasFlowAst(op)) continue
            const fileName = `${toSafeFileToken(cls.name)}.${toSafeFileToken(op.name)}.flow.md`
            docs.push({
                fileName,
                className: cls.name,
                operationName: op.name,
                markdown: renderFlowMarkdown(cls.name, op, fileName),
            })
        }
    }
    return docs
}

function hasFlowAst(op: ClassOperation): boolean {
    const ast = op.workflowAst
    if (!ast) return false
    return (ast.variables?.length ?? 0) > 0 || (ast.body?.length ?? 0) > 0
}

function renderFlowMarkdown(className: string, op: ClassOperation, fileName: string): string {
    const lines: string[] = []
    lines.push(`# Flow: ${className}.${op.name}()`)
    lines.push('')
    lines.push(`- Method: \`${className}.${op.name}()\``)
    lines.push(`- Return Type: \`${op.returnType}\``)
    lines.push(`- Source: [spec.md](./spec.md)`)
    lines.push('')
    lines.push('```dsl')
    lines.push('Flow:')
    lines.push(...renderFlowAstLines(op.workflowAst!, 1))
    lines.push('```')
    lines.push('')
    lines.push(`[Back to spec](./spec.md)`)
    lines.push('')
    return lines.join('\n')
}

function renderFlowAstLines(ast: NonNullable<ClassOperation['workflowAst']>, depth: number): string[] {
    const lines: string[] = []
    const pad = (n: number) => '  '.repeat(n)

    for (const v of ast.variables ?? []) {
        const init = v.initialValue != null && String(v.initialValue).trim() !== '' ? ` = ${v.initialValue}` : ''
        lines.push(`${pad(depth)}var ${v.name}: ${v.type}${init}`)
    }

    lines.push(...renderFlowAstBody(ast.body ?? [], depth))
    return lines
}

function renderFlowAstBody(nodes: unknown[], depth: number): string[] {
    const lines: string[] = []
    const pad = (n: number) => '  '.repeat(n)

    for (const node of nodes as any[]) {
        if (!node || typeof node !== 'object') continue
        const t = String(node.type ?? '')

        if (t === 'if') {
            lines.push(`${pad(depth)}if ${node.condition ?? ''}`.trimEnd())
            lines.push(...renderFlowAstBody(Array.isArray(node.then) ? node.then : [], depth + 1))
            if (Array.isArray(node.else) && node.else.length > 0) {
                lines.push(`${pad(depth)}else`)
                lines.push(...renderFlowAstBody(node.else, depth + 1))
            }
            lines.push(`${pad(depth)}end`)
            continue
        }

        if (t === 'while') {
            lines.push(`${pad(depth)}while ${node.condition ?? ''}`.trimEnd())
            lines.push(...renderFlowAstBody(Array.isArray(node.body) ? node.body : [], depth + 1))
            lines.push(`${pad(depth)}end`)
            continue
        }

        if (t === 'forEach') {
            lines.push(`${pad(depth)}for ${node.variable ?? 'item'} in ${node.collection ?? 'collection'}`)
            lines.push(...renderFlowAstBody(Array.isArray(node.body) ? node.body : [], depth + 1))
            lines.push(`${pad(depth)}end`)
            continue
        }

        if (t === 'forRange') {
            lines.push(`${pad(depth)}for ${node.variable ?? 'i'} from ${node.from ?? '0'} to ${node.to ?? '0'}`)
            lines.push(...renderFlowAstBody(Array.isArray(node.body) ? node.body : [], depth + 1))
            lines.push(`${pad(depth)}end`)
            continue
        }

        if (t === 'switch') {
            lines.push(`${pad(depth)}switch ${node.expression ?? ''}`.trimEnd())
            const cases = Array.isArray(node.cases) ? node.cases : []
            for (const c of cases) {
                lines.push(`${pad(depth + 1)}case ${c?.value ?? ''}:`.trimEnd())
                lines.push(...renderFlowAstBody(Array.isArray(c?.body) ? c.body : [], depth + 2))
            }
            if (Array.isArray(node.default) && node.default.length > 0) {
                lines.push(`${pad(depth + 1)}default:`)
                lines.push(...renderFlowAstBody(node.default, depth + 2))
            }
            lines.push(`${pad(depth)}end`)
            continue
        }

        if (t === 'break') {
            lines.push(`${pad(depth)}break`)
            continue
        }

        if (t === 'continue') {
            lines.push(`${pad(depth)}continue`)
            continue
        }

        if (t === 'return') {
            const value = node.value != null && String(node.value).trim() !== '' ? ` ${node.value}` : ''
            lines.push(`${pad(depth)}return${value}`)
            continue
        }

        if (t === 'action') {
            const kind = String(node.kind ?? 'instruction')
            const stmt = String(node.statement ?? '').trim()
            lines.push(kind === 'code' ? `${pad(depth)}do ${stmt}` : `${pad(depth)}${stmt}`)
            continue
        }

        if (typeof node.statement === 'string') {
            lines.push(`${pad(depth)}${node.statement}`)
        }
    }

    return lines
}

function toSafeFileToken(value: string): string {
    return value
        .replace(/[^\w.-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_{2,}/g, '_') || 'unknown'
}

