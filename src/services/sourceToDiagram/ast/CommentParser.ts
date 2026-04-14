import * as cdt from '../../../../view/lib/class-diagram-types';
import { MemberNeeds, ClassOperation } from '../../../../view/lib/class-diagram-types';

export class CommentParser {

    /**
     * コメントの生テキストを行に分割し、先頭の装飾( //, /*, *, ///, # 等 )を除去する
     */
    static normalizeComment(text: string): string[] {
        return text.split('\n').map(line => {
            // 先頭の空白、続いて /* や // や * や /// や #、さらにその後の空白を除去
            return line.trim().replace(/^(?:\/+\*?|\*+|\#+)\s*/, '').replace(/\*+\/$/, '').trim();
        }).filter(line => line.length > 0);
    }

    /**
     * クラスのコメントから @alias を抽出する
     */
    static parseClassComments(rawText: string): { aliases: Map<string, string> } {
        const lines = this.normalizeComment(rawText);
        const aliases = new Map<string, string>();
        for (const line of lines) {
            // @alias "担当者" as "assignee" または @alias 担当者: assignee
            const match1 = line.match(/^@alias\s+"([^"]+)"\s+as\s+"([^"]+)"/i);
            if (match1) {
                aliases.set(match1[1].trim(), match1[2].trim());
                continue;
            }
            const match2 = line.match(/^@alias\s+([^:]+):\s+(.+)/i);
            if (match2) {
                aliases.set(match2[1].trim(), match2[2].trim());
            }
        }
        return { aliases };
    }

    /**
     * プロパティメンバーのコメントから @needs を抽出する
     */
    static parseMemberComments(rawText: string): MemberNeeds | undefined {
        const lines = this.normalizeComment(rawText);
        for (const line of lines) {
            const ownerMatch = line.match(/^@needs\s+owner\s+"([^"]*)"/i) || line.match(/^@needs\s+owner\s+(.+)$/i);
            if (ownerMatch) {
                return { isOwner: true, reason: ownerMatch[1].trim() };
            }
            const normalMatch = line.match(/^@needs\s+"([^"]*)"/i) || line.match(/^@needs\s+(.+)$/i);
            if (normalMatch) {
                return { isOwner: false, reason: normalMatch[1].trim() };
            }
        }
        return undefined;
    }

    /**
     * メソッドのコメントから @scenario, @given, @when, @how, @then, @why を抽出し、
     * ワークフロー形式にパースする
     */
    static parseOperationComments(rawText: string): NonNullable<ClassOperation['workflow']> | undefined {
        const lines = this.normalizeComment(rawText);

        let hasScenario = false;
        let scenarioName = "振る舞い";

        const nodes: any[] = [];
        const edges: any[] = [];

        const startId = cdt.createId();
        nodes.push({ id: startId, type: 'start', label: '開始', x: 200, y: 50 });
        let currentY = 150;
        let lastNodeId = startId;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            const scenarioMatch = line.match(/^@scenario\s+(.+)$/i);
            if (scenarioMatch) {
                hasScenario = true;
                scenarioName = scenarioMatch[1].trim();
                continue;
            }

            const stepMatch = line.match(/^@(given|when|then|how|why|and|but)\s+(.+)$/i);
            if (stepMatch) {
                hasScenario = true;
                const keyword = stepMatch[1].toLowerCase();
                const text = stepMatch[2].trim();

                if (keyword === 'how') {
                    if (lastNodeId !== startId && nodes.length > 1) { // 最後の通常ノードに結びつける
                        const lastNodeIndex = nodes.findIndex(n => n.id === lastNodeId);
                        if (lastNodeIndex !== -1) {
                            nodes[lastNodeIndex].metadata = nodes[lastNodeIndex].metadata || {};
                            nodes[lastNodeIndex].metadata.howSteps = nodes[lastNodeIndex].metadata.howSteps || [];
                            nodes[lastNodeIndex].metadata.howSteps.push(text);
                        }
                    }
                    continue;
                }

                if (keyword === 'why') {
                    if (lastNodeId !== startId && nodes.length > 1) {
                        const lastNodeIndex = nodes.findIndex(n => n.id === lastNodeId);
                        if (lastNodeIndex !== -1) {
                            nodes[lastNodeIndex].metadata = nodes[lastNodeIndex].metadata || {};
                            nodes[lastNodeIndex].metadata.whyReason = text;
                        }
                    }
                    continue;
                }

                const typeMap: Record<string, string> = {
                    'given': 'given', 'when': 'when', 'then': 'then',
                    'and': 'process', 'but': 'process'
                };

                let nodeType = typeMap[keyword] || 'process';
                let labelPrefix = '';

                if (keyword === 'and' || keyword === 'but') {
                    const prevNode = nodes.length > 1 ? nodes[nodes.length - 1] : null;
                    nodeType = prevNode ? prevNode.type : 'process';
                    labelPrefix = 'かつ: ';
                } else if (keyword === 'given') {
                    labelPrefix = 'Given: ';
                } else if (keyword === 'when') {
                    labelPrefix = 'When: ';
                } else if (keyword === 'then') {
                    labelPrefix = 'Then: ';
                } else {
                    labelPrefix = keyword + ': ';
                }

                const newId = cdt.createId();
                nodes.push({
                    id: newId,
                    type: nodeType,
                    label: labelPrefix + text,
                    x: 200,
                    y: currentY
                });

                edges.push({
                    from: lastNodeId,
                    to: newId,
                    condition: lastNodeId === startId ? scenarioName : undefined
                });

                lastNodeId = newId;
                currentY += 100;
            }
        }

        if (!hasScenario) {
            return undefined;
        }

        const endId = cdt.createId();
        nodes.push({ id: endId, type: 'end', label: '終了', x: 200, y: currentY });
        edges.push({ from: lastNodeId, to: endId });

        return { nodes, edges };
    }
}
