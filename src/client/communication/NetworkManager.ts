import { Main } from "../main/Main.js";
import { ajax } from "./AjaxHelper.js";
import { WorkspaceData, FileData, SendUpdatesRequest, SendUpdatesResponse, CreateOrDeleteFileOrWorkspaceRequest, CRUDResponse, UpdateUserSettingsRequest, UpdateUserSettingsResponse, DuplicateWorkspaceRequest, DuplicateWorkspaceResponse, ClassData, DistributeWorkspaceRequest, DistributeWorkspaceResponse } from "./Data.js";
import { Workspace } from "../workspace/Workspace.js";
import { Module } from "../compiler/parser/Module.js";

export class NetworkManager {
    
    timerhandle: any;

    ownUpdateFrequencyInSeconds: number = 25;
    teacherUpdateFrequencyInSeconds: number = 5;

    updateFrequencyInSeconds: number = 25;
    forcedUpdateEvery: number = 2;
    forcedUpdatesInARow: number = 0;
    secondsTillNextUpdate: number = this.updateFrequencyInSeconds;
    errorHappened: boolean = false;

    interval: any;

    constructor(private main: Main, private $updateTimerDiv: JQuery<HTMLElement>){        
        
    }

    initializeTimer() {

        let that = this;
        this.$updateTimerDiv.find('svg').attr('width', that.updateFrequencyInSeconds);

        if(this.interval != null) clearInterval(this.interval);

        let counterTillForcedUpdate: number = this.forcedUpdateEvery;

        this.interval = setInterval(()=>{
            
            if(that.main.user == null) return; // don't call server if no user is logged in

            that.secondsTillNextUpdate--;

            if(that.secondsTillNextUpdate < 0 ){
                that.secondsTillNextUpdate = that.updateFrequencyInSeconds;
                counterTillForcedUpdate--;
                let forceUpdate = counterTillForcedUpdate == 0;
                if(forceUpdate){
                    this.forcedUpdatesInARow++;
                    counterTillForcedUpdate = this.forcedUpdateEvery;
                    if(this.forcedUpdatesInARow > 50){
                        counterTillForcedUpdate = this.forcedUpdateEvery * 50;
                    }
                } 
                that.sendUpdates(() => {}, forceUpdate);
            }

            let $rect = this.$updateTimerDiv.find('.jo_updateTimerRect');

            $rect.attr('width', that.secondsTillNextUpdate + "px");
            
            if(that.errorHappened){
                $rect.css('fill', '#c00000');                
                this.$updateTimerDiv.attr('title',"Fehler beim letzten Speichervorgang -> Werd's wieder versuchen");
            } else {
                $rect.css('fill', '#008000');                
                this.$updateTimerDiv.attr('title',that.secondsTillNextUpdate + " Sekunden bis zum nächsten Speichern");
            }

        }, 1000);
        
    }
    
    sendUpdates(callback?: ()=>void, sendIfNothingIsDirty: boolean = false, sendBeacon: boolean = false){

        if(this.main.user == null || this.main.user.is_testuser){
            if(callback != null) callback();
            return;
        } 

        this.main.projectExplorer.writeEditorTextToFile();

        let classDiagram = this.main.rightDiv?.classDiagram;
        let userSettings = this.main.user.settings;

        if(classDiagram?.dirty || this.main.userDataDirty){
            
            this.main.userDataDirty = false;
            userSettings.classDiagram = classDiagram?.serialize();
            this.sendUpdateUserSettings(() => {}, sendBeacon);
            this.forcedUpdatesInARow = 0;
        }

        classDiagram.dirty = false;

        let wdList: WorkspaceData[] = [];
        let fdList: FileData[] = [];

        for(let ws of this.main.workspaceList){

            if(!ws.saved){
                wdList.push(ws.getWorkspaceData(false));
                ws.saved = true;
                this.forcedUpdatesInARow = 0;
            }
            
            for(let m of ws.moduleStore.getModules(false)){
                if(!m.file.saved){
                    this.forcedUpdatesInARow = 0;
                    m.file.text = m.getProgramTextFromMonacoModel();
                    fdList.push(m.getFileData(ws));
                    // console.log("Save file " + m.file.name);
                    m.file.saved = true;
                }
            }
        }
        
        let request: SendUpdatesRequest = {
            workspacesWithoutFiles: wdList,
            files: fdList, 
            owner_id: this.main.workspacesOwnerId,
            userId: this.main.user.id,
            language: 0
        }

        let that = this;
        if(wdList.length > 0 || fdList.length > 0 || sendIfNothingIsDirty){

            if(sendBeacon){
                navigator.sendBeacon("sendUpdates", JSON.stringify(request));
            } else {

                ajax('sendUpdates', request, (response: SendUpdatesResponse) => {
                    that.errorHappened = !response.success;
                    if(!that.errorHappened){
    
                        if(this.main.workspacesOwnerId == this.main.user.id){
                            that.updateWorkspaces(request, response);
                        }
    
                        if(callback != null){
                            callback();
                            return;
                        }
                    }
                }, () => {
                    that.errorHappened = true;
                } );

            }

        } else {
            if(callback != null){
                callback();
                return;
            }
        }
        
    }
    
    sendCreateWorkspace(w: Workspace, owner_id: number, callback: (error: string) => void) {

        if(this.main.user.is_testuser){
            w.id = Math.round(Math.random() * 10000000);
            callback(null);
            return;
        }

        let wd: WorkspaceData = w.getWorkspaceData(false);
        let request: CreateOrDeleteFileOrWorkspaceRequest = {
            type: "create",
            entity: "workspace",
            data: wd,
            owner_id: owner_id,            
            userId: this.main.user.id
        }

        ajax("createOrDeleteFileOrWorkspace", request, (response: CRUDResponse) => {
            w.id = response.id;
            callback(null);
        }, callback);

    }

    sendCreateFile(m: Module, ws: Workspace, owner_id: number, callback: (error: string) => void) {

        if(this.main.user.is_testuser){
            m.file.id = Math.round(Math.random() * 10000000);
            callback(null);
            return;
        }


        let fd: FileData = m.getFileData(ws);
        let request: CreateOrDeleteFileOrWorkspaceRequest = {
            type: "create",
            entity: "file",
            data: fd,
            owner_id: owner_id,
            userId: this.main.user.id
        }

        ajax("createOrDeleteFileOrWorkspace", request, (response: CRUDResponse) => {
            m.file.id = response.id;
            callback(null);
        }, callback);

    }

    sendDuplicateWorkspace(ws: Workspace, callback: (error: string, workspaceData?: WorkspaceData) => void) {

        if(this.main.user.is_testuser){
            callback("Diese Aktion ist für den Testuser nicht möglich.", null);
            return;
        }


        let request: DuplicateWorkspaceRequest = {
            workspace_id: ws.id,
            language: 0
        }

        ajax("duplicateWorkspace", request, (response: DuplicateWorkspaceResponse) => {
            callback(response.message, response.workspace)
        }, callback);

    }

    sendDistributeWorkspace(ws: Workspace, klasse: ClassData, student_ids: number[], callback: (error: string) => void) {

        if(this.main.user.is_testuser){
            callback("Diese Aktion ist für den Testuser nicht möglich.");
            return;
        }


        this.sendUpdates(() => {

            let request: DistributeWorkspaceRequest = {
                workspace_id: ws.id,
                class_id: klasse?.id,
                student_ids: student_ids,
                language: 0
            }
    
            ajax("distributeWorkspace", request, (response: DistributeWorkspaceResponse) => {
                callback(response.message)
            }, callback);
    
        }, false);

    }


    sendCreateRepository(ws: Workspace, publish_to: number, repoName: string, repoDescription: string, callback: (error: string, repository_id?: number) => void) {

        if(this.main.user.is_testuser){
            callback("Diese Aktion ist für den Testuser nicht möglich.");
            return;
        }


        this.sendUpdates(() => {

            let request = {
                workspace_id: ws.id,
                publish_to: publish_to,
                name: repoName,
                description: repoDescription
            }
    
            ajax("createRepository", request, (response: {success: boolean, message?: string, repository_id?: number}) => {
                ws.moduleStore.getModules(false).forEach(m => {
                    m.file.is_copy_of_id = m.file.id;
                    m.file.repository_file_version = 1;
                })
                ws.repository_id = response.repository_id;
                ws.has_write_permission_to_repository = true;
                callback(response.message, response.repository_id)
            }, callback);
    
        }, true);


    }

    sendDeleteWorkspaceOrFile(type: "workspace" | "file", id: number, callback: (error: string) => void) {

        if(this.main.user.is_testuser){
            callback(null);
            return;
        }


        let request: CreateOrDeleteFileOrWorkspaceRequest = {
            type: "delete",
            entity: type,
            id: id,
            userId: this.main.user.id
        }

        ajax("createOrDeleteFileOrWorkspace", request, (response: CRUDResponse) => {
            if(response.success){
                callback(null);
            } else {
                callback("Netzwerkfehler!");
            }
        }, callback);

    }

    sendUpdateUserSettings(callback: (error: string) => void, sendBeacon: boolean = false){

        if(this.main.user.is_testuser){
            callback(null);
            return;
        }

        let request: UpdateUserSettingsRequest = {
            settings: this.main.user.settings,
            userId: this.main.user.id
        }

        if(sendBeacon){
            navigator.sendBeacon("updateUserSettings", JSON.stringify(request));
        } else {
            ajax("updateUserSettings", request, (response: UpdateUserSettingsResponse) => {
                if(response.success){
                    callback(null);
                } else {
                    callback("Netzwerkfehler!");
                }
            }, callback);
        }


    }


    private updateWorkspaces(sendUpdatesRequest: SendUpdatesRequest, sendUpdatesResponse: SendUpdatesResponse){

        let idToRemoteWorkspaceDataMap: Map<number, WorkspaceData> = new Map();

        let fileIdsSended = [];
        sendUpdatesRequest.files.forEach(file => fileIdsSended.push(file.id));

        sendUpdatesResponse.workspaces.workspaces.forEach(wd => idToRemoteWorkspaceDataMap.set(wd.id, wd));

        let newWorkspaceNames: string[] = [];

        for (let remoteWorkspace of sendUpdatesResponse.workspaces.workspaces) {

            let localWorkspaces = this.main.workspaceList.filter(ws => ws.id == remoteWorkspace.id);

            // Did student get a workspace from his/her teacher?
            if (localWorkspaces.length == 0) {
                newWorkspaceNames.push(remoteWorkspace.name);
                this.createNewWorkspaceFromWorkspaceData(remoteWorkspace);
            }

        }



        for(let workspace of this.main.workspaceList){
            let remoteWorkspace: WorkspaceData = idToRemoteWorkspaceDataMap.get(workspace.id);
            if(remoteWorkspace != null){
                let idToRemoteFileDataMap: Map<number, FileData> = new Map();
                remoteWorkspace.files.forEach(fd => idToRemoteFileDataMap.set(fd.id, fd));
                
                let idToModuleMap: Map<number, Module> = new Map();
                // update/delete files if necessary
                for(let module of workspace.moduleStore.getModules(false)){
                    let fileId = module.file.id;
                    idToModuleMap.set(fileId, module);
                    let remoteFileData = idToRemoteFileDataMap.get(fileId);
                    if(remoteFileData == null){
                        this.main.projectExplorer.fileListPanel.removeElement(module);
                        this.main.currentWorkspace.moduleStore.removeModule(module);
                    } else if(remoteFileData.version > module.file.version){
                        if(fileIdsSended.indexOf(fileId) < 0 || remoteFileData.forceUpdate){
                            module.file.text = remoteFileData.text;
                            module.model.setValue(remoteFileData.text);

                            module.file.saved = true;
                            module.lastSavedVersionId = module.model.getAlternativeVersionId()
                        }
                        module.file.version = remoteFileData.version;
                    }
                }

                // add files if necessary
                for(let remoteFile of remoteWorkspace.files){
                    if(idToModuleMap.get(remoteFile.id) == null){
                        this.createFile(workspace, remoteFile);
                    }
                }
            }
        }        

        if(newWorkspaceNames.length > 0){
            let message: string = newWorkspaceNames.length > 1 ? "Folgende Workspaces hat Deine Lehrkraft Dir gesendet: " : "Folgenden Workspace hat Deine Lehrkraft Dir gesendet: ";
            message += newWorkspaceNames.join(", ");
            alert(message);
        }

        this.main.projectExplorer.workspaceListPanel.sortElements();
        this.main.projectExplorer.fileListPanel.sortElements();

    }

    public createNewWorkspaceFromWorkspaceData(remoteWorkspace: WorkspaceData, withSort: boolean = false):Workspace {
        let w = this.main.createNewWorkspace(remoteWorkspace.name, remoteWorkspace.owner_id);
        w.id = remoteWorkspace.id;
        w.repository_id = remoteWorkspace.repository_id;
        w.has_write_permission_to_repository = remoteWorkspace.has_write_permission_to_repository;
        w.path = remoteWorkspace.path;
        w.isFolder = remoteWorkspace.isFolder;

        this.main.workspaceList.push(w);
        let path = remoteWorkspace.path.split("/");
        if(path.length == 1 && path[0] == "") path = [];
        this.main.projectExplorer.workspaceListPanel.addElement({
            name: remoteWorkspace.name,
            externalElement: w,
            iconClass: remoteWorkspace.repository_id == null ? "workspace" : "repository",
            isFolder: remoteWorkspace.isFolder,
            path: path
        });

        for (let fileData of remoteWorkspace.files) {
            this.createFile(w, fileData);
        }

        if(withSort){
            this.main.projectExplorer.workspaceListPanel.sortElements();
            this.main.projectExplorer.fileListPanel.sortElements();
        }
        return w;
    }

    private createFile(workspace: Workspace, remoteFile: FileData) {
        let ae: any = null; //AccordionElement
        if (workspace == this.main.currentWorkspace) {
            ae = {
                name: remoteFile.name,
                externalElement: null
            }

            this.main.projectExplorer.fileListPanel.addElement(ae);
        }

        let f: any = { // File
            id: remoteFile.id,
            name: remoteFile.name,
            dirty: false,
            saved: true,
            text: remoteFile.text,
            version: remoteFile.version,
            is_copy_of_id: remoteFile.is_copy_of_id,
            repository_file_version: remoteFile.repository_file_version,
            identical_to_repository_version: true,
            workspace_id: workspace.id,
            panelElement: ae
        };
        let m = this.main.projectExplorer.getNewModule(f); //new Module(f, this.main);
        if (ae != null) ae.externalElement = m;
        let modulStore = workspace.moduleStore;
        modulStore.putModule(m);

    }



}