// hooks/use-command-history.ts

import { useState, useCallback, useRef } from 'react';
import { ClassInfo } from '@/lib/class-diagram-types';
import { CliCommand } from '@/lib/CliParser';
import { executeAction } from '@/lib/command-executor';
import { DomainModel } from '@/lib/DomainModel';
import { HandlerResult } from '@/lib/handler-registry';

interface HistoryEntry {
    command: CliCommand;
    prevState: ClassInfo[];
    timestamp: number;
    result: HandlerResult;
}

interface UseCommandHistoryResult {
    classes: ClassInfo[];
    history: HistoryEntry[];
    redoStack: HistoryEntry[];
    executeCommand: (command: CliCommand) => HandlerResult | undefined;
    undo: () => HandlerResult | undefined;
    redo: () => HandlerResult | undefined;
    canUndo: boolean;
    canRedo: boolean;
    setClasses: (updaterOrClasses: ClassInfo[] | ((prev: ClassInfo[]) => ClassInfo[])) => void;  // 互換性用
}

const MAX_HISTORY_SIZE = 50;

export function useCommandHistory(initialClasses: ClassInfo[] = []): UseCommandHistoryResult {
    // DomainModel として状態を保持
    const modelRef = useRef<DomainModel>(DomainModel.from(initialClasses));
    const [model, setModel] = useState<DomainModel>(modelRef.current);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

    /**
     * コマンドを実行して履歴に追加
     */
    const executeCommand = useCallback((command: CliCommand) => {
        const prevModel = modelRef.current;

        // コマンド実行（同期的に結果を取得）
        const result = executeAction(command, prevModel) as HandlerResult;

        // 履歴エントリを作成（スナップショットとして保存）
        const historyEntry: HistoryEntry = {
            command,
            prevState: prevModel.getClasses(), // 実行前の状態をスナップショット
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
            timestamp: Date.now(),
            result: lastEntry.result
        }]);

        // 履歴から削除
        setHistory(prev => prev.slice(0, -1));

        // 状態を戻す（スナップショットから復元）
        const restored = DomainModel.from(lastEntry.prevState);
        setModel(restored);
        modelRef.current = restored;

        return { model: restored, events: lastEntry.result?.events ?? [] } as HandlerResult;
    }, [history, model]);

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
        const newModelResult = executeAction(redoEntry.command, prevModel) as HandlerResult;

        // 履歴に追加
        setHistory(prev => [...prev, {
            command: redoEntry.command,
            prevState: prevModel.getClasses(),
            timestamp: Date.now(),
            result: redoEntry.result
        }]);

        setModel(newModelResult.model);
        modelRef.current = newModelResult.model;

        // redoスタックから削除
        setRedoStack(prev => prev.slice(0, -1));

        return newModelResult;
    }, [redoStack]);

    /**
     * 既存コードとの互換性用
     * React の setClasses パターンをサポート
     * 
     * オーバーロード: 配列または updater 関数を受け取る
     */
    const setClasses = useCallback((
        updaterOrClasses: ClassInfo[] | ((prev: ClassInfo[]) => ClassInfo[])
    ) => {
        setModel(prevModel => {
            const prevClasses = prevModel.getClasses();

            // 関数が渡された場合
            let newModel: DomainModel;
            if (typeof updaterOrClasses === 'function') {
                const newClasses = updaterOrClasses(prevClasses);
                newModel = DomainModel.from(newClasses);
            } else {
                // 配列が直接渡された場合
                newModel = DomainModel.from(updaterOrClasses);
            }
            modelRef.current = newModel;
            return newModel;
        });
    }, []);
    return {
        classes: model.getClasses(),
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