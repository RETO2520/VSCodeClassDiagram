// src/ui/ClassEditorContainer.tsx
"use client"

import React, { useEffect, useState, useCallback } from "react";
import type { ClassInfo } from "@/lib/class-diagram-types";
import { ClassEditorPanel } from "./class-editor"; // 既存のコンポーネント（class-editor.tsx）
import { toUpdateClassInput, toAddMemberInputGui, toAddOperationInputGui } from "../lib/adapters/gui-adapter";
import { ClassDiagramService } from "../lib/application/ClassDiagramService";
import { postMessage } from "../../frontend/src/bridge/vscode-bridge";

/**
 * Props:
 *  - service: ClassDiagramService のインスタンス（extension bootstrap で生成して渡す）
 *
 * このコンテナは UI を Service に接続する責務のみを持ちます。
 */

export function ClassEditorContainer({
    service,
    setGlobalClasses,
    selectedId: externalSelectedId,
    onSelectClass: externalOnSelectClass,
}: {
    service: ClassDiagramService
    setGlobalClasses?: (classes: ClassInfo[]) => void
    selectedId?: string | null
    onSelectClass?: (id: string | null) => void
}) {
    // service 内部の DomainModel を UI 用に同期して表示する
    const [classes, setClasses] = useState<ClassInfo[]>(() => service.getModel().getClasses());
    const [internalSelectedId, setInternalSelectedId] = useState<string | null>(() => {
        const cls = service.getModel().getClasses()[0];
        return cls ? cls.id : null;
    });

    const selectedId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedId;
    const setSelectedId = useCallback((id: string | null) => {
        if (externalOnSelectClass) {
            externalOnSelectClass(id);
        } else {
            setInternalSelectedId(id);
        }
    }, [externalOnSelectClass]);

    const [busy, setBusy] = useState(false);

    // Helper: refresh local snapshot from service.model
    const refreshFromService = useCallback(() => {
        try {
            const all = service.getModel().getClasses();

            setClasses([...all]);
            // sync to global canvas state if parent provided setter
            if (setGlobalClasses) setGlobalClasses([...all]);
            if (selectedId && !all.find((c) => c.id === selectedId)) {
                setSelectedId(all.length ? all[0].id : null);
            }
        } catch (err) {
            console.error("refreshFromService error:", err);
        }
    }, [service, selectedId, setGlobalClasses, setSelectedId]);

    // initial sync

    useEffect(() => {
        const onChanged = () => refreshFromService();
        service.onModelChanged(onChanged);
        onChanged();
        return () => service.offModelChanged(onChanged);
    }, [service, refreshFromService]);
    // --- Handlers passed to ClassEditorPanel ---

    async function handleUpdateClass(id: string, updated: ClassInfo) {
        setBusy(true);
        try {
            const before = service.getModel().findClassById(id);
            if (!before) {
                // class missing: refresh and abort
                refreshFromService();
                return;
            }
            const dto = toUpdateClassInput(before, updated);
            // use applyUpdateClass (GUI path) which returns HandlerResult
            service.applyUpdateClass(dto);
            // after successful apply, refresh snapshot
            refreshFromService();
        } catch (err) {
            console.error("applyUpdateClass error:", err);
            // show UI feedback (toast/modal) as needed
        } finally {
            setBusy(false);
        }
    }

    function handleDeleteClass(id: string) {
        setBusy(true);
        try {
            const cls = service.getModel().findClassById(id);
            if (!cls) {
                refreshFromService();
                return;
            }
            // prefer id-based delete
            service.applyDelete({ target: "type", classId: id, className: cls.name });
            refreshFromService();
            const all = service.getModel().getClasses();
            setSelectedId(all.length ? all[0].id : null);
        } catch (err) {
            console.error("applyDelete error:", err);
        } finally {
            setBusy(false);
        }
    }

    function handleAddClass() {
        setBusy(true);
        try {
            // create a temporary unique name — you can replace with a modal input
            const name = `NewClass${Date.now().toString().slice(-4)}`;
            // GUI uses applyAddType (not CLI heuristics)
            service.applyAddType({ name, kind: "class" });
            refreshFromService();
            const created = service.getModel().findClassByName(name);
            postMessage({ command: 'log', level: 'info', text: `Created class: ${created?.name} (${created?.id})` });
            if (created) { setSelectedId(created.id); }
            // ensure global canvas state updated as well
            if (setGlobalClasses) setGlobalClasses(service.getModel().getClasses());
        } catch (err) {
            console.error("applyAddType error:", err);
        } finally {
            setBusy(false);
        }
    }

    // optional helpers to add blank member/operation via UI "Add" buttons exposed in gui-adapter
    function handleAddMemberGui(classId: string) {
        // use adapter convenience to create AddMemberInput with empty member
        const dto = toAddMemberInputGui(classId);
        // for GUI we prefer id-based path: applyAddMember (if exists) or applyUpdateClass with patch
        // Here we'll do an updateClass flow: fetch before, apply patch adding a member
        const before = service.getModel().findClassById(classId);
        if (!before) return;
        const newMembers = [...before.members, dto.member];
        service.applyUpdateClass({ classId, patch: { members: newMembers } });
        refreshFromService();
    }

    function handleAddOperationGui(classId: string) {
        const dto = toAddOperationInputGui(classId);
        const before = service.getModel().findClassById(classId);
        if (!before) return;
        const newOps = [...before.operations, dto.operation];
        service.applyUpdateClass({ classId, patch: { operations: newOps } });
        refreshFromService();
    }

    return (
        <div className="h-full">
            <ClassEditorPanel
                classes={classes}
                selectedId={selectedId}
                onSelectClass={(id) => setSelectedId(id)}
                onUpdateClass={handleUpdateClass}
                onDeleteClass={handleDeleteClass}
                onAddClass={handleAddClass}
            />
            {/* You can add status indicator */}
            {busy && <div className="sr-only">Applying...</div>}
        </div>
    );
}
export default ClassEditorContainer;
