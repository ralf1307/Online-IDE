import { Module } from "../../compiler/parser/Module.js";
import { InterpreterState } from "../../interpreter/Interpreter.js";
import { Main } from "../Main.js";
import { MyCompletionItemProvider } from "./MyCompletionItemProvider.js";
import { defineMyJava } from "./MyJava.js";
import { MySignatureHelpProvider } from "./MySignatureHelpProvider.js";
import { Klass, Interface } from "../../compiler/types/Class.js";
import { Method, Attribute, PrimitiveType } from "../../compiler/types/Types.js";
import { getDeclarationAsString } from "../../compiler/types/DeclarationHelper.js";
import { MyHoverProvider } from "./MyHoverProvider.js";
import { MainBase } from "../MainBase.js";
import { MyCodeActionProvider } from "./MyCodeActionProvider.js";
import { MyReferenceProvider } from "./MyReferenceProvider.js";
import { Enum } from "../../compiler/types/Enum.js";
import { Workspace } from "../../workspace/Workspace.js";

export type HistoryEntry = {
    module_id: number,
    workspace_id: number,
    position: monaco.Position;
}

export class Editor implements monaco.languages.RenameProvider {

    editor: monaco.editor.IStandaloneCodeEditor;

    highlightCurrentMethod: boolean = true;

    cw: monaco.editor.IContentWidget = null;

    lastPosition: HistoryEntry;
    dontPushNextCursorMove: number = 0;

    constructor(public main: MainBase, private showMinimap: boolean, private isEmbedded: boolean) {
    }

    initGUI($element: JQuery<HTMLElement>) {



        defineMyJava();

        monaco.editor.defineTheme('myCustomThemeDark', {
            base: 'vs-dark', // can also be vs-dark or hc-black
            inherit: true, // can also be false to completely replace the builtin rules
            rules: [
                { token: 'method', foreground: 'dcdcaa', fontStyle: 'italic' },
                { token: 'print', foreground: 'dcdcaa', fontStyle: 'italic bold' },
                { token: 'class', foreground: '3DC9B0' },
                { token: 'number', foreground: 'b5cea8' },
                { token: 'type', foreground: '499cd6' },
                { token: 'identifier', foreground: '9cdcfe' },
                { token: 'statement', foreground: 'bb96c0', fontStyle: 'bold' },
                { token: 'keyword', foreground: '68bed4', fontStyle: 'bold' },
                // { token: 'comment.js', foreground: '008800', fontStyle: 'bold italic underline' },
            ],
            colors: {
                "editor.background": "#1e1e1e",
                "jo_highlightMethod": "#2b2b7d"
            }
        });

        monaco.editor.defineTheme('myCustomThemeLight', {
            base: 'vs', // can also be vs-dark or hc-black
            inherit: true, // can also be false to completely replace the builtin rules
            rules: [
                { token: 'method', foreground: '694E16', fontStyle: 'italic bold' },
                { token: 'print', foreground: '811f3f', fontStyle: 'italic bold' },
                { token: 'class', foreground: 'a03030' },
                { token: 'number', foreground: '404040' },
                { token: 'type', foreground: '0000ff', fontStyle: 'bold' },
                { token: 'identifier', foreground: '001080' },
                { token: 'statement', foreground: '8000e0', fontStyle: 'bold' },
                { token: 'keyword', foreground: '00a000', fontStyle: 'bold' },
                { token: 'comment', foreground: '808080', fontStyle: 'italic' },
            ],
            colors: {
                "editor.background": "#FFFFFF",
                "editor.foreground": "#000000",
                "editor.inactiveSelectionBackground": "#E5EBF1",
                "editorIndentGuide.background": "#D3D3D3",
                "editorIndentGuide.activeBackground": "#939393",
                "editor.selectionHighlightBackground": "#ADD6FF80",
                "editorSuggestWidget.background": "#F3F3F3",
                "activityBarBadge.background": "#007ACC",
                "sideBarTitle.foreground": "#6F6F6F",
                "list.hoverBackground": "#E8E8E8",
                "input.placeholderForeground": "#767676",
                "searchEditor.textInputBorder": "#CECECE",
                "settings.textInputBorder": "#CECECE",
                "settings.numberInputBorder": "#CECECE",
                "statusBarItem.remoteForeground": "#FFF",
                "statusBarItem.remoteBackground": "#16825D",
                "jo_highlightMethod": "#babaec"
            }
        });


        this.editor = monaco.editor.create($element[0], {
            // value: [
            //     'function x() {',
            //     '\tconsole.log("Hello world!");',
            //     '}'
            // ].join('\n'),
            // language: 'myJava',
            language: 'myJava',
            lightbulb: {
                enabled: true
            },
            // gotoLocation: {
            //     multipleReferences: "gotoAndPeek"
            // },
            lineDecorationsWidth: 0,
            peekWidgetDefaultFocus: "tree",
            fixedOverflowWidgets: true,
            quickSuggestions: true,
            quickSuggestionsDelay: 10,
            fontSize: 14,
            fontFamily: "Consolas, Roboto Mono",
            fontWeight: "500",
            roundedSelection: true,
            selectOnLineNumbers: false,
            // selectionHighlight: false,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            occurrencesHighlight: false,
            autoIndent: "full",
            dragAndDrop: true,
            formatOnType: true,
            formatOnPaste: true,
            suggestFontSize: 16,
            suggestLineHeight: 22,
            suggest: {
                localityBonus: true,
                insertMode: "replace"
                // snippetsPreventQuickSuggestions: false
            },
            parameterHints: { enabled: true, cycle: true },
            // //@ts-ignore
            // contribInfo: {
            //     suggestSelection: 'recentlyUsedByPrefix',
            // },

            mouseWheelZoom: this.isEmbedded,

            minimap: {
                enabled: this.showMinimap
            },
            scrollbar: {
                vertical: 'auto',
                horizontal: 'auto'
            },
            theme: "myCustomThemeDark",
            // automaticLayout: true


        }
        );

        this.editor.onKeyDown((e: monaco.IKeyboardEvent) => {
            let state = this.main.getInterpreter().state;

            if ([InterpreterState.done, InterpreterState.error, InterpreterState.not_initialized].indexOf(state) < 0) {

                if (e.code.indexOf("Arrow") >= 0 || e.code.indexOf("Page") >= 0) return; // don't react to Cursor keys

                this.main.getActionManager().trigger("interpreter.stop");
            }
        });

        // this.uri = monaco.Uri.from({ path: '/file1.java', scheme: 'file' })
        // this.modelJava = monaco.editor.createModel("", "myJava", this.uri);
        // this.editor.setModel(this.modelJava);

        let that = this;

        let mouseWheelListener = (event: WheelEvent) => {
            if (event.ctrlKey === true) {

                that.changeEditorFontSize(Math.sign(event.deltaY), true);

                event.preventDefault();
            }
        };

        if (!this.isEmbedded) {

            let _main: Main = <Main>this.main;

            _main.windowStateManager.registerBackButtonListener((event: PopStateEvent) => {
                let historyEntry: HistoryEntry = <HistoryEntry>event.state;
                if(event.state == null) return;
                let workspace: Workspace = _main.workspaceList.find((ws) => ws.id == historyEntry.workspace_id);
                if(workspace == null) return;
                let module: Module = workspace.moduleStore.findModuleById(historyEntry.module_id);
                if(module == null) return; 

                // console.log("Processing pop state event, returning to module " + historyEntry.module_id);

                if(workspace != _main.currentWorkspace) 
                {
                    that.dontPushNextCursorMove++;
                    _main.projectExplorer.setWorkspaceActive(workspace);
                    that.dontPushNextCursorMove--;
                }
                if(module != _main.getCurrentlyEditedModule()){
                    that.dontPushNextCursorMove++;
                    _main.projectExplorer.setModuleActive(module);
                    that.dontPushNextCursorMove--;
                } 
                that.dontPushNextCursorMove++;
                that.editor.setPosition(historyEntry.position);
                that.editor.revealPosition(historyEntry.position);
                that.dontPushNextCursorMove--;
                that.pushHistoryState(true, historyEntry);
            });
        }

        this.editor.onDidChangeConfiguration((event) => {
            if (event.hasChanged(monaco.editor.EditorOption.fontInfo) && this.isEmbedded) {

                this.main.getBottomDiv().errorManager.registerLightbulbOnClickFunctions();

            }
        });

        this.editor.onDidChangeCursorPosition((event) => {

            let currentModelId = this.main.getCurrentlyEditedModule().file.id;
            let pushNeeded = this.lastPosition == null
                || event.source == "api"
                || currentModelId != this.lastPosition.module_id
                || Math.abs(this.lastPosition.position.lineNumber - event.position.lineNumber) > 20;
            
            if(pushNeeded && this.dontPushNextCursorMove == 0){
                this.pushHistoryState(false, this.getPositionForHistory());
            } else if(currentModelId == history.state?.module_id){

                    this.pushHistoryState(true, this.getPositionForHistory());
            }

            that.onDidChangeCursorPosition(event.position);

            that.onEvaluateSelectedText(event);

        });

        // We need this to set our model after user uses Strg+click on identifier
        this.editor.onDidChangeModel((event) => {

            let element: HTMLDivElement = <any>$element.find('.monaco-editor')[0];
            element.removeEventListener("wheel", mouseWheelListener);
            element.addEventListener("wheel", mouseWheelListener, { passive: false });

            if (this.main.getCurrentWorkspace() == null) return;

            let module = this.main.getCurrentWorkspace().getModuleByMonacoModel(this.editor.getModel());
            if (this.main instanceof Main && module != null) {

                // if(!this.dontPushHistoryStateOnNextModelChange){
                //     this.lastPosition = {
                //         position: this.editor.getPosition(),
                //         workspace_id: this.main.getCurrentWorkspace().id,
                //         module_id: module.file.id
                //     }
                //     this.pushHistoryState(false);
                // }
                // this.dontPushHistoryStateOnNextModelChange = false;

                this.main.projectExplorer.setActiveAfterExternalModelSet(module);

                let pushNeeded = this.lastPosition == null
                    || module.file.id != this.lastPosition.module_id;
                
                if(pushNeeded && this.dontPushNextCursorMove == 0){
                    this.pushHistoryState(false, this.getPositionForHistory());
                }    

            }

        });

        monaco.languages.registerRenameProvider('myJava', this);

        monaco.languages.registerDefinitionProvider('myJava', {
            provideDefinition: (model, position, cancellationToken) => {
                return that.provideDefinition(model, position, cancellationToken);
            }
        });

        monaco.languages.registerHoverProvider('myJava', new MyHoverProvider(this));

        monaco.languages.registerCompletionItemProvider('myJava', new MyCompletionItemProvider(this.main));
        monaco.languages.registerCodeActionProvider('myJava', new MyCodeActionProvider(this.main));
        monaco.languages.registerReferenceProvider('myJava', new MyReferenceProvider(this.main));


        monaco.languages.registerSignatureHelpProvider('myJava', new MySignatureHelpProvider(this.main));

        this.editor.onMouseDown((e: monaco.editor.IEditorMouseEvent) => {
            const data = e.target.detail;
            if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN &&
                e.target.type !== monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS || data.isAfterLines) {
                return;
            }
            that.onMarginMouseDown(e.target.position.lineNumber);
            return;
        });


        // If editor is instantiated before fonts are loaded then indentation-lines
        // are misplaced, see https://github.com/Microsoft/monaco-editor/issues/392
        // so:
        setTimeout(() => {
            monaco.editor.remeasureFonts();
        }, 2000);

        this.addActions();

        //@ts-ignore
        this.editor.onDidType((text) => { that.onDidType(text) });

        return this.editor;
    }

    getPositionForHistory(): HistoryEntry {
        return {
            position: this.editor.getPosition(),
            workspace_id: this.main.getCurrentWorkspace().id,
            module_id: this.main.getCurrentlyEditedModule().file.id
        }
    }

    lastPushTime: number = 0;
    pushHistoryState(replace: boolean, historyEntry: HistoryEntry){
        
        if(this.main.isEmbedded()) return;

        if(replace){
            history.replaceState(historyEntry, ""); //`Java-Online, ${module.file.name} (Zeile ${this.lastPosition.position.lineNumber}, Spalte ${this.lastPosition.position.column})`);
            // console.log("Replace History state with workspace-id: " + historyEntry.workspace_id + ", module-id: " + historyEntry.module_id);
        } else {
            let time = new Date().getTime();
            if(time - this.lastPushTime > 200){
                history.pushState(historyEntry, ""); //`Java-Online, ${module.file.name} (Zeile ${historyEntry.position.lineNumber}, Spalte ${historyEntry.position.column})`);
            } else {
                history.replaceState(historyEntry, "");
            }
            this.lastPushTime = time;
            // console.log("Pushed History state with workspace-id: " + historyEntry.workspace_id + ", module-id: " + historyEntry.module_id);
        }

        this.lastPosition = historyEntry;
    }

    onDidType(text: string) {
        //        const endOfCommentText = " * \n */";

        const insertEndOfComment = (pos, insertText: string, newLine: number, newColumn: number) => {
            const range = new monaco.Range(
                pos.lineNumber,
                pos.column,
                pos.lineNumber,
                pos.column
            );
            this.editor.executeEdits("new-bullets", [
                { range, text: insertText }
            ]);

            // Set position after bulletText
            this.editor.setPosition({
                lineNumber: newLine,
                column: newColumn
            });
        };

        if (text === "\n") {
            const model = this.editor.getModel();
            const position = this.editor.getPosition();
            const prevLine = model.getLineContent(position.lineNumber - 1);
            if (prevLine.trim().indexOf("/*") === 0 && !prevLine.trimRight().endsWith("*/")) {
                const nextLine = position.lineNumber < model.getLineCount() ? model.getLineContent(position.lineNumber + 1) : "";
                if(!nextLine.trim().startsWith("*")){
                    let spacesAtBeginningOfLine: string = prevLine.substr(0, prevLine.length - prevLine.trimLeft().length);
                    if (prevLine.trim().indexOf("/**") === 0) {
                        insertEndOfComment(position, "\n" + spacesAtBeginningOfLine + " */", position.lineNumber, position.column + 3 + spacesAtBeginningOfLine.length);
                    } else {
                        insertEndOfComment(position, " * \n" + spacesAtBeginningOfLine + " */", position.lineNumber, position.column + 3 + spacesAtBeginningOfLine.length);
                    }
                }
            }
        }
    }



    lastTime: number = 0;
    setFontSize(fontSizePx: number) {

        // console.log("Set font size: " + fontSizePx);
        let time = new Date().getTime();
        if (time - this.lastTime < 150) return;
        this.lastTime = time;

        let editorfs = this.editor.getOptions().get(monaco.editor.EditorOption.fontSize);

        if (this.main instanceof Main) {
            this.main.viewModeController.saveFontSize(fontSizePx);
        }

        if (fontSizePx != editorfs) {
            this.editor.updateOptions({
                fontSize: fontSizePx
            });

            // editor does not set fontSizePx, but fontSizePx * zoomfactor with unknown zoom factor, so 
            // we have to do this dirty workaround:
            let newEditorfs = this.editor.getOptions().get(monaco.editor.EditorOption.fontSize);
            let factor = newEditorfs / fontSizePx;
            this.editor.updateOptions({
                fontSize: fontSizePx / factor
            });

            let bottomDiv1 = this.main.getBottomDiv();
            if (bottomDiv1 != null && bottomDiv1.console != null) {
                bottomDiv1.console.editor.updateOptions({
                    fontSize: fontSizePx / factor
                });
            }

        }

        let bottomDiv = this.main.getBottomDiv();
        if (bottomDiv != null && bottomDiv.console != null) {
            let $commandLine = bottomDiv.$bottomDiv.find('.jo_commandline');
            $commandLine.css({
                height: (fontSizePx * 1.1 + 4) + "px",
                "line-height": (fontSizePx * 1.1 + 4) + "px"
            })
            bottomDiv.console.editor.layout();
        }


        // let newEditorfs = this.editor.getOptions().get(monaco.editor.EditorOption.fontSize);

        // console.log({editorFS: editorfs, newFs: fontSizePx, newEditorFs: newEditorfs});


        jQuery('.jo_editorFontSize').css('font-size', fontSizePx + "px");
        jQuery('.jo_editorFontSize').css('line-height', (fontSizePx + 2) + "px");

        document.documentElement.style.setProperty('--breakpoint-size', fontSizePx + 'px');
        document.documentElement.style.setProperty('--breakpoint-radius', fontSizePx / 2 + 'px');


        this.main.getBottomDiv().errorManager.registerLightbulbOnClickFunctions();

    }

    changeEditorFontSize(delta: number, dynamic: boolean = true) {
        let editorfs = this.editor.getOptions().get(monaco.editor.EditorOption.fontSize);

        if (dynamic) {
            if (editorfs < 10) {
                delta *= 1;
            } else if (editorfs < 20) {
                delta *= 2;
            } else {
                delta *= 4;
            }
        }

        let newEditorFs = editorfs + delta;
        if (newEditorFs >= 6 && newEditorFs <= 80) {
            this.setFontSize(newEditorFs);
        }
    }


    addActions() {
        this.editor.addAction({
            // An unique identifier of the contributed action.
            id: 'Find bracket',

            // A label of the action that will be presented to the user.
            label: 'Finde korrespondierende Klammer',

            // An optional array of keybindings for the action.
            keybindings: [
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_K],

            // A precondition for this action.
            precondition: null,

            // A rule to evaluate on top of the precondition in order to dispatch the keybindings.
            keybindingContext: null,

            contextMenuGroupId: 'navigation',

            contextMenuOrder: 1.5,

            // Method that will be executed when the action is triggered.
            // @param editor The editor instance is passed in as a convinience
            run: function (ed) {
                ed.getAction('editor.action.jumpToBracket').run();
                return null;
            }
        });

        //console.log(this.editor.getSupportedActions());
    }

    onEvaluateSelectedText(event: monaco.editor.ICursorPositionChangedEvent) {

        let that = this;

        if (that.cw != null) {
            that.editor.removeContentWidget(that.cw);
            that.cw = null;
        }

        if (that.main.getInterpreter().state == InterpreterState.paused) {

            let model = that.editor.getModel();
            let text = model.getValueInRange(that.editor.getSelection());
            if (text != null && text.length > 0) {
                let evaluator = this.main.getCurrentWorkspace().evaluator;
                let result = evaluator.evaluate(text);
                if (result.error == null && result.value != null) {
                    let v = result.value.type.debugOutput(result.value);

                    monaco.editor.colorize(text + ": ", 'myJava', { tabSize: 3 }).then((text) => {
                        if (text.endsWith("<br/>")) text = text.substr(0, text.length - 5);
                        that.cw = {
                            getId: function () {
                                return 'my.content.widget';
                            },
                            getDomNode: function () {
                                let dn = jQuery('<div class="jo_editorTooltip jo_codeFont">' + text + v + '</div>');
                                return dn[0];
                            },
                            getPosition: function () {
                                return {
                                    position: event.position,
                                    preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE, monaco.editor.ContentWidgetPositionPreference.BELOW]
                                };
                            }
                        };
                        that.editor.addContentWidget(that.cw);

                    });


                }
            }

        }


    }

    onMarginMouseDown(lineNumber: number) {
        let module = this.getCurrentlyEditedModule();
        if (module == null) {
            return;
        }

        module.toggleBreakpoint(lineNumber, true);

        if (this.main.getInterpreter().moduleStore != null) {
            let runningModule = this.main.getInterpreter().moduleStore.findModuleByFile(module.file);
            if (runningModule != null) runningModule.toggleBreakpoint(lineNumber, false);
        }

    }

    elementDecoration: string[] = [];
    onDidChangeCursorPosition(position: { lineNumber: number, column: number }) {

        if (position == null) position = this.editor.getPosition();

        let module = this.getCurrentlyEditedModule();
        if (module == null) {
            this.elementDecoration = this.editor.deltaDecorations(this.elementDecoration, []);
            return;
        }

        let element = module.getElementAtPosition(position.lineNumber, position.column);

        let decorations: monaco.editor.IModelDeltaDecoration[] = [];

        if (element != null) {
            let usagePositions = element.usagePositions;
            let upInCurrentModule = usagePositions.get(module);
            if (upInCurrentModule != null) {
                for (let up of upInCurrentModule) {
                    decorations.push({
                        range: { startColumn: up.column, startLineNumber: up.line, endColumn: up.column + up.length, endLineNumber: up.line },
                        options: {
                            className: 'jo_revealSyntaxElement', isWholeLine: false, overviewRuler: {
                                color: { id: "editorIndentGuide.background" },
                                darkColor: { id: "editorIndentGuide.activeBackground" },
                                position: monaco.editor.OverviewRulerLane.Left
                            }
                        }
                    });
                }
            }

        }


        if (this.highlightCurrentMethod) {

            let method = module.getMethodDeclarationAtPosition(position);
            if (method != null) {
                decorations.push({
                    range: { startColumn: 0, startLineNumber: method.position.line, endColumn: 100, endLineNumber: method.scopeTo.line },
                    options: {
                        className: 'jo_highlightMethod', isWholeLine: true, overviewRuler: {
                            color: { id: "jo_highlightMethod" },
                            darkColor: { id: "jo_highlightMethod" },
                            position: monaco.editor.OverviewRulerLane.Left
                        },
                        minimap: {
                            color: { id: 'jo_highlightMethod' },
                            position: monaco.editor.MinimapPosition.Inline
                        },
                        zIndex: -100
                    }
                })
            }

        }

        this.elementDecoration = this.editor.deltaDecorations(this.elementDecoration, decorations);

    }

    getCurrentlyEditedModule(): Module {
        return this.main.getCurrentlyEditedModule();
    }

    dontDetectLastChange() {
        // this.dontDetectLastChanging = true;
    }

    provideRenameEdits(model: monaco.editor.ITextModel, position: monaco.Position,
        newName: string, token: monaco.CancellationToken):
        monaco.languages.ProviderResult<monaco.languages.WorkspaceEdit & monaco.languages.Rejection> {

        let currentlyEditedModule = this.getCurrentlyEditedModule();
        if (currentlyEditedModule == null) {
            return null;
        }

        let element = currentlyEditedModule.getElementAtPosition(position.lineNumber, position.column);
        if (element == null) {
            return;
        }

        let usagePositions = element.usagePositions;

        //06.06.2020
        let resourceEdits: monaco.languages.WorkspaceTextEdit[] = [];

        usagePositions.forEach((usagePositionsInModule, module) => {
            if (usagePositionsInModule != null) {
                let edits: monaco.languages.TextEdit[] = [];
                for (let up of usagePositionsInModule) {
                    resourceEdits.push(
                        {
                            resource: module.uri, edit:
                            {
                                range: { startColumn: up.column, startLineNumber: up.line, endLineNumber: up.line, endColumn: up.column + up.length },
                                text: newName
                            }
                        });
                }
                if (edits.length > 0) {
                    module.file.dirty = true;
                    module.file.saved = false;
                    module.file.identical_to_repository_version = false;

                }
            }

        });

        console.log(resourceEdits);

        return {
            edits: resourceEdits
        }

    }

    provideDefinition(model: monaco.editor.ITextModel, position: monaco.Position, cancellationToken: monaco.CancellationToken):
        monaco.languages.ProviderResult<monaco.languages.Definition> {

        let module: Module = this.main.getCurrentWorkspace().getModuleByMonacoModel(model);

        if (module == null) {
            return null;
        }

        let element = module.getElementAtPosition(position.lineNumber, position.column);
        if (element == null) return null;

        let decl = element.declaration;

        if (decl == null) {
            // class from Base-Module? Let definition point to current position, so that ctrl + click opens peek references widget
            if (element instanceof Klass || element instanceof Enum || element instanceof Interface || element instanceof Method || element instanceof Attribute) {
                return Promise.resolve({
                    range: {
                        startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
                        startColumn: position.column, endColumn: position.column + element.identifier.length
                    },
                    uri: module.uri
                });
            } else {
                return null;
            }
        }

        return Promise.resolve({
            range: {
                startLineNumber: decl.position.line, endLineNumber: decl.position.line,
                startColumn: decl.position.column, endColumn: decl.position.column + decl.position.length
            },
            uri: decl.module.uri
        });

    }

}