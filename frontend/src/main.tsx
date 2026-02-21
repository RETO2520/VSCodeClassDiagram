import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './globals.css'
// ここで Service を生成
import { ClassDiagramService } from "../../view/lib/application/ClassDiagramService";
import { DomainModel } from "../../view/lib/DomainModel";
const service = new ClassDiagramService(DomainModel.createEmpty(), undefined); // eventDispatcher は必要に応じて実装
ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App service={service} />
    </React.StrictMode>,
)
