import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './globals.css'

// ここで Service を生成
import { ClassDiagramService } from "../../view/lib/application/ClassDiagramService";
import { DomainModel } from "../../view/lib/DomainModel";
import { ComponentService } from "../../view/lib/application/ComponentService";
import { ComponentDomainModel } from "../../view/lib/ComponentDomainModel";
const model = DomainModel.createEmpty();
const componentModel = ComponentDomainModel.createEmpty();
const service = new ClassDiagramService(model, undefined); // eventDispatcher は必要に応じて実装
const componentService = new ComponentService(model, componentModel);
ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App service={service} componentService={componentService} />
    </React.StrictMode>,
)
