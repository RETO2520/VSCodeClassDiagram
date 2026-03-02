// view/components/ComponentEditorContainer.tsx
"use client"

import React, { useEffect, useState, useCallback } from "react";
import type { ComponentInfo, ComponentKind } from "@/lib/component-diagram-types";
import type { ClassInfo } from "@/lib/class-diagram-types";
import { ComponentEditorPanel } from "./component-editor";
import { ComponentService } from "../lib/application/ComponentService";
import { postMessage } from "../../frontend/src/bridge/vscode-bridge";

/**
 * Props:
 *  - service: ComponentService のインスタンス
 *
 * このコンテナは UI を ComponentService に接続する責務を持ちます。
 */

export function ComponentEditorContainer({
    service,
    selectedId: externalSelectedId,
    onSelectComponent: externalOnSelectComponent,
}: {
    service: ComponentService
    selectedId?: string | null
    onSelectComponent?: (id: string | null) => void
}) {
    // 状態管理
    const [components, setComponents] = useState<ComponentInfo[]>(() => service['componentDomain'].getComponents());
    const [classes, setClasses] = useState<ClassInfo[]>(() => service['classDomain'].getClasses());
    const [internalSelectedId, setInternalSelectedId] = useState<string | null>(() => {
        const comps = service['componentDomain'].getComponents();
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

    // 同期処理
    const refreshFromService = useCallback(() => {
        try {
            const allComps = service['componentDomain'].getComponents();
            const allCls = service['classDomain'].getClasses();

            setComponents([...allComps]);
            setClasses([...allCls]);

            if (selectedId && !allComps.find((c) => c.id === selectedId)) {
                setSelectedId(allComps.length ? allComps[0].id : null);
            }
        } catch (err) {
            console.error("refreshFromService error:", err);
        }
    }, [service, selectedId, setSelectedId]);

    // リスナー設定 (もし DomainModel が変更イベントを出すなら)
    // 注意: ComponentService 自身には onModelChanged がないので、
    // 必要に応じて service.classDomain や service.componentDomain にリスナーを張るか、
    // ここでは単純に props や useEffect での初回同期に留める。
    // ClassDiagramService.ts を参考に、同様の仕組みがあるか確認が必要。

    useEffect(() => {
        // 現在の ComponentService は内部に DomainModel を持っており、
        // ClassDiagramService のようなイベントバスがないため、
        // 開発の進展に合わせてイベント通知の仕組みを追加するのが望ましい。
        refreshFromService();
    }, [refreshFromService]);

    //Handlers
    const handleUpdateComponent = async (id: string, updated: ComponentInfo) => {
        setBusy(true);
        try {
            // ComponentService に直接 update メソッドがまだないので、
            // 内部の componentDomain を直接操作するか、Service を拡張する。
            // ここでは簡易的に DomainModel の updateComponent を呼び出し、結果をサービスに反映する想定。
            // (本来は Service にビジネスロジックを集約すべき)
            const nextDomain = service['componentDomain'].updateComponent(updated);
            // 本来はここが Service の仕事:
            // service.updateComponent(updated)

            // 暫定的に snapshot 更新
            (service as any).componentDomain = nextDomain;
            refreshFromService();
        } catch (err) {
            console.error("handleUpdateComponent error:", err);
        } finally {
            setBusy(false);
        }
    };

    const handleDeleteComponent = (id: string) => {
        setBusy(true);
        try {
            const res = service.removeComponent(id);
            (service as any).classDomain = res.classDomain;
            (service as any).componentDomain = res.componentDomain;
            refreshFromService();
            const all = service['componentDomain'].getComponents();
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
            const nextDomain = service['componentDomain'].addComponent(kind);
            (service as any).componentDomain = nextDomain;
            refreshFromService();
            const all = nextDomain.getComponents();
            const created = all[all.length - 1]; // addComponent は末尾に追加する
            if (created) setSelectedId(created.id);
        } catch (err) {
            console.error("handleAddComponent error:", err);
        } finally {
            setBusy(false);
        }
    };

    const handleAssignClass = (compId: string, classId: string) => {
        try {
            const res = service.assignClassToComponent(classId, compId);
            (service as any).classDomain = res.classDomain;
            (service as any).componentDomain = res.componentDomain;
            refreshFromService();
        } catch (err) {
            console.error("handleAssignClass error:", err);
        }
    }

    const handleUnassignClass = (compId: string, classId: string) => {
        try {
            const res = service.unassignClassFromComponent(classId, compId);
            (service as any).classDomain = res.classDomain;
            (service as any).componentDomain = res.componentDomain;
            refreshFromService();
        } catch (err) {
            console.error("handleUnassignClass error:", err);
        }
    }

    const handleAddChildComponent = (parentId: string, childId: string) => {
        try {
            const nextDomain = service['componentDomain'].addChildComponent(parentId, childId);
            (service as any).componentDomain = nextDomain;
            refreshFromService();
        } catch (err) {
            console.error("handleAddChildComponent error:", err);
        }
    }

    const handleRemoveChildComponent = (parentId: string, childId: string) => {
        try {
            const nextDomain = service['componentDomain'].removeChildComponent(parentId, childId);
            (service as any).componentDomain = nextDomain;
            refreshFromService();
        } catch (err) {
            console.error("handleRemoveChildComponent error:", err);
        }
    }

    return (
        <div className="h-full">
            <ComponentEditorPanel
                components={components}
                classes={classes}
                selectedId={selectedId}
                onSelectComponent={setSelectedId}
                onUpdateComponent={handleUpdateComponent}
                onDeleteComponent={handleDeleteComponent}
                onAddComponent={handleAddComponent}
                onAssignClass={handleAssignClass}
                onUnassignClass={handleUnassignClass}
                onAddChildComponent={handleAddChildComponent}
                onRemoveChildComponent={handleRemoveChildComponent}
            />
            {busy && <div className="sr-only">Processing...</div>}
        </div>
    );
}

export default ComponentEditorContainer;
