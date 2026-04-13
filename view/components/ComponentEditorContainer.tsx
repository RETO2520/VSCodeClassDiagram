// view/components/ComponentEditorContainer.tsx
"use client"

import React, { useEffect, useState, useCallback } from "react";
import type { ComponentInfo, ComponentKind, ComponentRelationship } from "@/lib/component-diagram-types";
import type { ClassInfo } from "@/lib/class-diagram-types";
import { ComponentEditorPanel } from "./component-editor";
import { ComponentService } from "../lib/application/ComponentService";
import { DslIntegrator } from "../lib/application/DslIntegrator";
import { postMessage, onMessage } from "../../frontend/src/bridge/vscode-bridge";

/**
 * Props:
 *  - service: ComponentService のインスタンス
 *
 * このコンテナは UI を ComponentService に接続する責務を持ちます。
 */

export function ComponentEditorContainer({
    service,
    availableDslFiles,
    setGlobalComponents,
    setGlobalRelationships,
    refreshToken,
    selectedId: externalSelectedId,
    onSelectComponent: externalOnSelectComponent,
}: {
    service: ComponentService
    availableDslFiles?: string[]
    setGlobalComponents?: (components: ComponentInfo[]) => void
    setGlobalRelationships?: (relationships: ComponentRelationship[]) => void
    /**
     * 外部（Canvasなど）から service の状態を直接更新した後に、
     * このコンテナのスナップショットを取り直すためのトークン。
     */
    refreshToken?: number
    selectedId?: string | null
    onSelectComponent?: (id: string | null) => void
}) {
    // 状態管理 — ComponentService の公開 API を使用
    const [components, setComponents] = useState<ComponentInfo[]>(() => service.getComponents());
    const [classes, setClasses] = useState<ClassInfo[]>(() => service.getClasses());
    const [relationships, setRelationships] = useState<ComponentRelationship[]>(() => service.getRelationships());
    const [internalSelectedId, setInternalSelectedId] = useState<string | null>(() => {
        const comps = service.getComponents();
        return comps.length > 0 ? comps[0].id : null;
    });

    const selectedId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedId;
    const setSelectedId = useCallback((id: string | null) => {
        if (externalOnSelectComponent) {
            externalOnSelectComponent(id);
        } else {
            setInternalSelectedId(id);
        }
    }, [externalOnSelectComponent]);

    const [busy, setBusy] = useState(false);

    const saveContentListJson = useCallback((options?: { silent?: boolean }) => {
        try {
            const snap = service.getSnapshot();
            postMessage({
                command: 'saveComponentListJson',
                payload: {
                    components: snap.components,
                    relationships: snap.relationships,
                    silent: options?.silent ?? false,
                },
            });
        } catch (err) {
            console.error("saveContentListJson error:", err);
        }
    }, [service]);

    const loadContentListJson = useCallback(() => {
        try {
            postMessage({ command: 'loadComponentListJson' });
        } catch (err) {
            console.error("loadContentListJson error:", err);
        }
    }, []);

    // 同期処理 — 公開 API を使用
    const refreshFromService = useCallback(() => {
        try {
            const allComps = service.getComponents();
            const allCls = service.getClasses();
            const allRels = service.getRelationships();

            setComponents([...allComps]);
            setClasses([...allCls]);
            setRelationships([...allRels]);

            if (setGlobalComponents) setGlobalComponents([...allComps]);
            if (setGlobalRelationships) setGlobalRelationships([...allRels]);

            if (selectedId && !allComps.find((c) => c.id === selectedId)) {
                setSelectedId(allComps.length ? allComps[0].id : null);
            }
        } catch (err) {
            console.error("refreshFromService error:", err);
        }
    }, [service, selectedId, setSelectedId, setGlobalComponents, setGlobalRelationships]);

    // リスナー設定 — ComponentService の onModelChanged を使用
    useEffect(() => {
        service.onModelChanged(refreshFromService);
        refreshFromService();
        return () => service.offModelChanged(refreshFromService);
    }, [service, refreshFromService, refreshToken]);

    // ── DSL統合: IPC応答を受信したら integrate を実行 ──────────
    useEffect(() => {
        const cleanup = onMessage((msg) => {
            if (msg.command === 'diagramFilesBulkLoaded') {
                const files = (msg as any).payload?.files as Array<{ relativePath: string; dsl: string }> | undefined;
                if (!files || files.length === 0) return;

                try {
                    const dslContents = files.map(f => ({
                        dslPath: f.relativePath,
                        content: f.dsl,
                    }));

                    const result = DslIntegrator.integrate(
                        service.getComponentDomain(),
                        dslContents
                    );

                    // サービスの公開 API で内部状態を更新
                    service.setClassDomain(result.classDomain);
                    service.setComponentDomain(result.componentDomain);
                    // onModelChanged が refreshFromService を呼ぶので手動呼び出し不要

                    // 自動保存（サイレント）
                    saveContentListJson({ silent: true });
                } catch (err) {
                    console.error('[DslIntegrator] Integration failed:', err);
                }
            }
        });
        return cleanup;
    }, [service, refreshFromService, saveContentListJson]);

    // Handlers — すべて ComponentService の公開 API を使用
    const handleUpdateComponent = async (id: string, updated: ComponentInfo) => {
        setBusy(true);
        try {
            service.updateComponentMut(updated);
            // onModelChanged が refreshFromService を呼ぶ
        } catch (err) {
            console.error("handleUpdateComponent error:", err);
        } finally {
            setBusy(false);
        }
    };

    const handleDeleteComponent = (id: string) => {
        setBusy(true);
        try {
            service.removeComponentMut(id);
            const all = service.getComponents();
            setSelectedId(all.length ? all[0].id : null);
        } catch (err) {
            console.error("handleDeleteComponent error:", err);
        } finally {
            setBusy(false);
        }
    };

    const handleAddComponent = (kind: ComponentKind) => {
        setBusy(true);
        try {
            const created = service.addComponentMut(kind);
            if (created) setSelectedId(created.id);
        } catch (err) {
            console.error("handleAddComponent error:", err);
        } finally {
            setBusy(false);
        }
    };

    const handleAssignClass = (compId: string, classId: string) => {
        try {
            service.assignClassMut(classId, compId);
        } catch (err) {
            console.error("handleAssignClass error:", err);
        }
    }

    const handleUnassignClass = (compId: string, classId: string) => {
        try {
            service.unassignClassMut(classId, compId);
        } catch (err) {
            console.error("handleUnassignClass error:", err);
        }
    }

    const handleAddChildComponent = (parentId: string, childId: string) => {
        try {
            service.addChildComponentMut(parentId, childId);
        } catch (err) {
            console.error("handleAddChildComponent error:", err);
        }
    }

    const handleRemoveChildComponent = (parentId: string, childId: string) => {
        try {
            service.removeChildComponentMut(parentId, childId);
        } catch (err) {
            console.error("handleRemoveChildComponent error:", err);
        }
    }

    const handleIntegrateDsl = useCallback(() => {
        const paths = DslIntegrator.collectDslPaths(service.getComponentDomain());
        if (paths.length === 0) {
            console.warn('[DslIntegrator] No components have dslPath set');
            return;
        }
        // 既存の IPC を利用して DSL ファイル内容を一括リクエスト
        postMessage({
            command: 'loadDiagramFilesBulk',
            payload: { relativePaths: paths },
        });
    }, [service]);

    return (
        <div className="h-full">
            <ComponentEditorPanel
                components={components}
                classes={classes}
                availableDslFiles={availableDslFiles}
                relationships={relationships}
                selectedId={selectedId}
                onSelectComponent={setSelectedId}
                onUpdateComponent={handleUpdateComponent}
                onDeleteComponent={handleDeleteComponent}
                onAddComponent={handleAddComponent}
                onAssignClass={handleAssignClass}
                onUnassignClass={handleUnassignClass}
                onAddChildComponent={handleAddChildComponent}
                onRemoveChildComponent={handleRemoveChildComponent}
                onSaveContentListJson={() => saveContentListJson({ silent: false })}
                onLoadContentListJson={loadContentListJson}
                onIntegrateDsl={handleIntegrateDsl}
            />
            {busy && <div className="sr-only">Processing...</div>}
        </div>
    );
}

export default ComponentEditorContainer;
