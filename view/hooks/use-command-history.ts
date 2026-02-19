// hooks/use-command-history.ts

import { useState, useCallback, useRef } from 'react';
import { ClassInfo } from '@/lib/class-diagram-types';
import { Command } from '@/lib/commands/Command';
import { executeAction } from '@/lib/command-executor';
import { DomainModel } from '@/lib/DomainModel';
import { DesignGraphAggregate } from '@/lib/DesignGraphModel';
import { HandlerResult } from '@/lib/handler-registry';

interface HistoryEntry {
    command: Command;
    prevState: ClassInfo[];
    prevGraph: DesignGraphAggregate;
    timestamp: number;
    result: HandlerResult;
}

interface UseCommandHistoryResult {
    classes: ClassInfo[];
    designGraph: DesignGraphAggregate;
    history: HistoryEntry[];
    redoStack: HistoryEntry[];
    executeCommand: (command: Command) => HandlerResult | undefined;
    undo: () => HandlerResult | undefined;
    redo: () => HandlerResult | undefined;
    canUndo: boolean;
    canRedo: boolean;
    setClasses: (updaterOrClasses: ClassInfo[] | ((prev: ClassInfo[]) => ClassInfo[])) => void;  // 互換性用
}

const MAX_HISTORY_SIZE = 50;

export function useCommandHistory(
    initialClasses: ClassInfo[] = [],
    initialGraph: DesignGraphAggregate = new DesignGraphAggregate({ nodes: {}, edges: {} })
): UseCommandHistoryResult {
    // DomainModel として状態を保持
    const modelRef = useRef<DomainModel>(DomainModel.from(initialClasses));
    const [model, setModel] = useState<DomainModel>(modelRef.current);

    // DesignGraphAggregate として状態を保持
    const graphRef = useRef<DesignGraphAggregate>(initialGraph);
    const [graph, setGraph] = useState<DesignGraphAggregate>(graphRef.current);

    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

    /**
     * コマンドを実行して履歴に追加
     */
    const executeCommand = useCallback((command: Command) => {
        const prevModel = modelRef.current;
        const prevGraph = graphRef.current;

        // コマンド実行（同期的に結果を取得）
        const result = executeAction(command, prevModel, prevGraph) as HandlerResult;

        // 履歴エントリを作成（スナップショットとして保存）
        const historyEntry: HistoryEntry = {
            command,
            prevState: prevModel.getClasses(), // 実行前の状態をスナップショット
            prevGraph: prevGraph,
            timestamp: Date.now(),
            result
        };

        // 履歴スタックを更新
        setHistory(prevHistory => {
            const newHistory = [...prevHistory, historyEntry];
            if (newHistory.length > MAX_HISTORY_SIZE) {
                newHistory.shift();
            }
            return newHistory;
        });

        // 新しいコマンド実行時はredoスタックをクリア
        setRedoStack([]);

        // モデルを更新（かつ参照を更新）
        setModel(result.model);
        modelRef.current = result.model;

        // グラフを更新（あれば）
        if (result.designGraph) {
            setGraph(result.designGraph);
            graphRef.current = result.designGraph;
        }

        return result as HandlerResult;
    }, []);

    /**
     * Undo: 最後のコマンドを取り消す
     */
    const undo = useCallback(() => {
        if (history.length === 0) {
            console.log('Nothing to undo');
            return undefined;
        }

        const lastEntry = history[history.length - 1];

        // redoスタックに現在の状態を保存
        setRedoStack(prev => [...prev, {
            command: lastEntry.command,
            prevState: model.getClasses(), // 現在の状態（undo前）
            prevGraph: graph,
            timestamp: Date.now(),
            result: lastEntry.result
        }]);

        // 履歴から削除
        setHistory(prev => prev.slice(0, -1));

        // 状態を戻す（スナップショットから復元）
        const restoredModel = DomainModel.from(lastEntry.prevState);
        setModel(restoredModel);
        modelRef.current = restoredModel;

        const restoredGraph = lastEntry.prevGraph;
        setGraph(restoredGraph);
        graphRef.current = restoredGraph;

        return {
            model: restoredModel,
            events: lastEntry.result?.events ?? [],
            designGraph: restoredGraph,
            graphEvents: []
        } as HandlerResult;
    }, [history, model, graph]);

    /**
     * Redo: Undoした操作をやり直す
     */
    const redo = useCallback(() => {
        if (redoStack.length === 0) {
            console.log('Nothing to redo');
            return undefined;
        }

        const redoEntry = redoStack[redoStack.length - 1];
        const prevModel = modelRef.current;
        const prevGraph = graphRef.current;

        const result = executeAction(redoEntry.command, prevModel, prevGraph) as HandlerResult;

        // 履歴に追加
        setHistory(prev => [...prev, {
            command: redoEntry.command,
            prevState: prevModel.getClasses(),
            prevGraph: prevGraph,
            timestamp: Date.now(),
            result: redoEntry.result
        }]);

        setModel(result.model);
        modelRef.current = result.model;

        if (result.designGraph) {
            setGraph(result.designGraph);
            graphRef.current = result.designGraph;
        }

        // redoスタックから削除
        setRedoStack(prev => prev.slice(0, -1));

        return result;
    }, [redoStack]);

    /**
     * 既存コードとの互換性用
     * React の setClasses パターンをサポート
     */
    const setClasses = useCallback((
        updaterOrClasses: ClassInfo[] | ((prev: ClassInfo[]) => ClassInfo[])
    ) => {
        setModel(prevModel => {
            const prevClasses = prevModel.getClasses();

            let newModel: DomainModel;
            if (typeof updaterOrClasses === 'function') {
                const newClasses = updaterOrClasses(prevClasses);
                newModel = DomainModel.from(newClasses);
            } else {
                newModel = DomainModel.from(updaterOrClasses);
            }
            modelRef.current = newModel;
            return newModel;
        });
    }, []);

    return {
        classes: model.getClasses(),
        designGraph: graph,
        history,
        redoStack,
        executeCommand,
        undo,
        redo,
        canUndo: history.length > 0,
        canRedo: redoStack.length > 0,
        setClasses // 直接操作用（既存のコードとの互換性）
    };
}