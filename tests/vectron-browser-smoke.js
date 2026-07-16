"use strict";

// Firefox WebDriver-BiDi smoke test. Launch Vectron and Firefox as documented
// in README.md, with Firefox remote debugging on port 9223, then run this file.

const assert = require("assert");
const ws = new WebSocket(process.env.VECTRON_BIDI_URL || "ws://127.0.0.1:9223/session");
let id = 0;
const pending = new Map();
const browserErrors = [];

function call(method, params) {
    return new Promise((resolve, reject) => {
        const callId = ++id;
        pending.set(callId, {resolve, reject});
        ws.send(JSON.stringify({id:callId, method, params}));
    });
}

ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if(message.method === "log.entryAdded" && message.params && message.params.level === "error") {
        browserErrors.push(message.params.text || JSON.stringify(message.params));
    }
    if(message.id && pending.has(message.id)) {
        const task = pending.get(message.id);
        pending.delete(message.id);
        if(message.type === "error") task.reject(new Error(message.message || message.error));
        else task.resolve(message.result);
    }
};

ws.onerror = event => {
    console.error(event.message || event);
    process.exitCode = 1;
};

ws.onopen = async () => {
    try {
        await call("session.new", {capabilities:{}});
        await call("session.subscribe", {events:["log.entryAdded"]});
        const tree = await call("browsingContext.getTree", {});
        const context = tree.contexts[0].context;
        await call("browsingContext.reload", {context, wait:"complete"});
        await new Promise(resolve => setTimeout(resolve, 1000));

        const expression = `(async function() {
            var result = {};
            function importMapFile(name, content) {
                return new Promise(function(resolve, reject) {
                    var previousMapLoaded = window.codeViewer_onMapLoaded;
                    var timeout = setTimeout(function() {
                        window.codeViewer_onMapLoaded = previousMapLoaded;
                        reject(new Error('Timed out importing ' + name));
                    }, 3000);
                    window.codeViewer_onMapLoaded = function() {
                        clearTimeout(timeout);
                        window.codeViewer_onMapLoaded = previousMapLoaded;
                        try {
                            if(typeof previousMapLoaded === 'function') previousMapLoaded();
                        } finally {
                            resolve();
                        }
                    };
                    xml_handleFile(new File([content], name, {type:'text/plain'}));
                });
            }
            result.loaded = [typeof zoneTool_finishMovementPath,
                typeof wallTool_isGridDiagonalSegment, typeof preview3d_open,
                typeof aamap_addWithSymmetry];
            result.theme = {
                href:document.getElementById('theme').getAttribute('href'),
                darkToggleRemoved:!document.getElementById('dark-theme'),
                darkRenderer:config_isDark
            };
            result.mapHeaderDefaults = {
                revisionInputRemoved:!document.getElementById('map_version'),
                zoomDefault:_config_check_default('zoomStep'),
                zoomOptionDefault:document.querySelector(
                    '#zoom-step-select option[value="0.10"]').defaultSelected,
                savedZoomPreserved:_config_get('zoomStep')===null ||
                    (config_zoomStep===parseFloat(_config_get('zoomStep')) &&
                    parseFloat(document.getElementById('zoom-step-select').value)===
                    parseFloat(_config_get('zoomStep')))
            };
            result.levelPicker = {
                label:document.querySelector('.level-picker-label').textContent.trim(),
                down:document.querySelector('#level-previous i').classList.contains('fa-arrow-down'),
                current:document.getElementById('active-floor-label').textContent.trim(),
                up:document.querySelector('#level-next i').classList.contains('fa-arrow-up'),
                quickAdd:!!document.getElementById('level-new-quick'),
                deleteChoices:[document.getElementById('level-delete-shift').textContent.trim(),
                    document.getElementById('level-delete-keep').textContent.trim(),
                    document.getElementById('level-delete-cancel').textContent.trim()]
            };
            var zoneSettingRows=Array.from(document.querySelectorAll('#zone-tool-settings .vt-setting-row'))
                .filter(function(row){return row.querySelector('.vt-tool-name');});
            var shapeRow=document.getElementById('dZoneShape').closest('.vt-setting-row');
            var triggerRow=document.getElementById('dZoneTrigger').closest('.vt-setting-row');
            var shapeHelpTarget=shapeRow.querySelector('.vt-tool-name');
            var zoneWindow=document.getElementById('zone-tool-window');
            var panelDefault=[zoneWindow.style.width,zoneWindow.style.height];
            $(zoneWindow).show().css({left:'58px',top:'44px'});
            var shapeTooltip=$(shapeHelpTarget).data('bs.tooltip');
            shapeTooltip.options.animation=false;
            $(shapeHelpTarget).tooltip('show');
            var renderedZoneHelp=document.querySelector('.tooltip.in .tooltip-inner');
            var renderedHelpRect=renderedZoneHelp.closest('.tooltip').getBoundingClientRect();
            var shapeTooltipRendered=!!renderedZoneHelp &&
                /collision footprint/i.test(renderedZoneHelp.textContent);
            var tooltipOnscreen=renderedHelpRect.left>=4 && renderedHelpRect.top>=4 &&
                renderedHelpRect.right<=window.innerWidth-4 && renderedHelpRect.bottom<=window.innerHeight-4;
            $(shapeHelpTarget).tooltip('hide');
            var zoneTypeButton=document.querySelector('.zone-type-setting');
            $(zoneWindow).css({
                left:Math.max(4,window.innerWidth-zoneWindow.offsetWidth-2)+'px',
                top:'44px'
            });
            var zoneTypeTooltip=$(zoneTypeButton).data('bs.tooltip');
            var zoneTypePlacement=zoneTypeTooltip.options.placement;
            zoneTypeTooltip.options.animation=false;
            $(zoneTypeButton).tooltip('show');
            var renderedZoneTypeTip=document.querySelector('.tooltip.in');
            var zoneTypeTipRect=renderedZoneTypeTip.getBoundingClientRect();
            var zoneTypeTooltipOnscreen=zoneTypeTipRect.left>=4 && zoneTypeTipRect.top>=4 &&
                zoneTypeTipRect.right<=window.innerWidth-4 && zoneTypeTipRect.bottom<=window.innerHeight-4;
            $(zoneTypeButton).tooltip('hide');
            $(zoneWindow).hide();
            $('#dZoneMoving').prop('checked',true);
            $('#dZoneShape').val('circle');
            $('#dZoneRotationSpeed').val('30');
            zoneTool_updateSettings();
            var circleRotation=[document.getElementById('dZoneRotationSpeed').value,
                $('#zone-rotation-speed-setting').css('display')==='none'];
            $('#dZoneShape').val('rectangle');
            zoneTool_updateSettings();
            var rectangleRotationVisible=$('#zone-rotation-speed-setting').css('display')!=='none';
            $('#dZoneShape').val('circle');
            $('#dZoneMoving').prop('checked',false);
            zoneTool_updateSettings();
            var lineWidthInput=document.getElementById('dZoneLineWidth');
            lineWidthInput.value='0';
            var zeroLineWidthAccepted=zoneTool_getLineWidth(true)===0;
            lineWidthInput.value='2';
            result.zoneUi = {
                exitOption:!!document.querySelector('#dZoneTrigger option[value="on_exit"]'),
                tooltipRows:zoneSettingRows.every(function(row){
                    var target=row.querySelector('.vt-tool-name');
                    return !row.hasAttribute('rel') && target &&
                        target.getAttribute('rel')==='tooltip' &&
                        target.hasAttribute('data-original-title') && target.tabIndex===0;
                }),
                helpCount:document.querySelectorAll('#zone-tool-settings .zone-setting-help').length,
                shapeTooltipRendered:shapeTooltipRendered,
                tooltipOnscreen:tooltipOnscreen,
                zoneTypeTooltipOnscreen:zoneTypeTooltipOnscreen,
                zoneTypePlacement:zoneTypePlacement,
                placement:shapeHelpTarget.getAttribute('data-placement'),
                advancedFieldsRemoved:['dZonePriority','dZoneStartTick','dZoneEndTick']
                    .every(function(id){return !document.getElementById(id);}),
                healthReplacesRubber:!!document.querySelector('.zone-type-health') &&
                    !document.querySelector('.zone-type-rubber') && !!document.getElementById('dHealthDelta'),
                settingZone:!!document.querySelector('.zone-type-setting') &&
                    !!document.getElementById('dGameSetting') &&
                    !!document.getElementById('dGameSettingValue'),
                teleportInputsRemoved:['dTeleportX','dTeleportY','dTeleportLevel','dTeleportXDir','dTeleportYDir']
                    .every(function(id){return !document.getElementById(id);}),
                quickPlacementRemoved:!document.getElementById('zone-quick-placement-toggle') &&
                    !document.getElementById('zone-quick-size'),
                triggerHelp:/outside-to-inside/i.test(triggerRow.querySelector('.vt-tool-name').getAttribute('data-original-title')),
                keyboardHelp:/collision footprint/i.test(shapeHelpTarget.getAttribute('aria-label')) &&
                    shapeHelpTarget.getAttribute('data-trigger')==='hover focus',
                noActionLabel:!Array.from(document.querySelectorAll('#zone-tool-window .vt-tool-name'))
                    .some(function(node){return node.textContent.trim()==='Action';}),
                panelDefault:panelDefault,
                movementDefaults:[document.getElementById('dZoneMovementSpeed').value,
                    document.getElementById('dZoneRotationSpeed').value,
                    document.getElementById('dZoneMovementMode').value,
                    document.getElementById('dZoneSpawnAtVertices').checked],
                checkpointAutoIncrement:!!document.getElementById('dCheckpointAutoIncrement') &&
                    document.getElementById('dCheckpointAutoIncrement').checked,
                lineWidthMinimum:document.getElementById('dZoneLineWidth').min,
                zeroLineWidthAccepted:zeroLineWidthAccepted,
                zonePulseDefault:mapSettings_commands.filter(function(command){
                    return command.name==='ZONE_PULSE_SPEED';
                })[0].defaultVal,
                checkpointColor:zoneTool_typeArray[5][1],
                circleRotation:circleRotation,
                rectangleRotationVisible:rectangleRotationVisible
            };

            var checkpointVisual=new Zone(4,5,3,0,5,1,{zoneName:'checkpoint',
                shapeType:'circle',options:{}});
            checkpointVisual.render();
            result.checkpointVisual={stroke:checkpointVisual.obj.attr('stroke'),
                label:checkpointVisual.checkpointLabelObj.attr('text'),
                labelFill:checkpointVisual.checkpointLabelObj.attr('fill'),
                labelStroke:checkpointVisual.checkpointLabelObj.attr('stroke'),
                outlineFill:checkpointVisual.checkpointLabelOutlineObj.attr('fill'),
                outlineStroke:checkpointVisual.checkpointLabelOutlineObj.attr('stroke')};
            aamap_removeObjectVisuals(checkpointVisual);

            var authorPasswordInput=document.getElementById('map_author_password');
            $(authorPasswordInput).val('correct horse').trigger('input');
            await xml_waitForAuthorPasswordHash();
            var verifier=xml_author_password_hash;
            var verifierParts=verifier.split(':');
            var saltBytes=new Uint8Array((verifierParts[1]||'').match(/../g).map(function(pair){
                return parseInt(pair,16);
            }));
            var passwordEncoder=new TextEncoder();
            var passwordDomain=passwordEncoder.encode('ArmaRacing Author Password v1'+String.fromCharCode(0));
            var passwordBytes=passwordEncoder.encode('correct horse');
            var passwordPayload=new Uint8Array(passwordDomain.length+saltBytes.length+passwordBytes.length);
            passwordPayload.set(passwordDomain,0);
            passwordPayload.set(saltBytes,passwordDomain.length);
            passwordPayload.set(passwordBytes,passwordDomain.length+saltBytes.length);
            var expectedDigest=xml_bytesToHex(new Uint8Array(
                await crypto.subtle.digest('SHA-256',passwordPayload)));
            var passwordXml=aamap_buildXml('password-map','smoke','racing','1',4,[],verifier).xml;
            xml_process(passwordXml,true);
            var preservedVerifier=xml_author_password_hash;
            var preservedXml=aamap_buildXml('password-map','smoke','racing','1',4,[],
                preservedVerifier).xml;
            result.authorPassword={
                inputExists:authorPasswordInput.type==='password',
                viewToggleExists:!!document.getElementById('map-author-password-toggle'),
                confirmationExists:!!document.getElementById('export-password-popover'),
                maximumLength:authorPasswordInput.maxLength,
                format:/^sha256-v1:[0-9a-f]{32}:[0-9a-f]{64}$/.test(verifier),
                exactDigest:verifierParts[2]===expectedDigest,
                noPlaintext:passwordXml.indexOf('correct horse')<0,
                exported:passwordXml.indexOf('author_password_hash="'+verifier+'"')>=0,
                importedFieldBlank:authorPasswordInput.value==='',
                preserved:preservedVerifier===verifier &&
                    preservedXml.indexOf('author_password_hash="'+verifier+'"')>=0
            };

            aamap_objects.forEach(aamap_removeObjectVisuals);
            aamap_objects=[];
            xml_process('<Resource name="sloped" author="smoke" category="racing" version="1"><Map><World><Field level_height="8">' +
                '<Wall level="1"><Point x="0" y="0" height="2.5"/><Point x="10" y="0" height="7.25"/></Wall>' +
                '</Field></World></Map></Resource>',true);
            var importedSlopedWall=aamap_objects.filter(function(object){return object instanceof Wall;})[0];
            var importedSlopedXml=importedSlopedWall.getXML();
            var importedSlopedHeights=importedSlopedWall.points.map(function(point){return point.height;});
            aamap_objects.forEach(aamap_removeObjectVisuals);
            aamap_objects=[];
            aamap_setActiveLevel(1);
            wallTool_resetDraft();
            wallTool_mode='freeform';
            vectron_currentTool='wall';
            $('#dWallSlopedHeight').prop('checked',true).trigger('change');
            var slopedPointControlVisible=$('#wall-tool-point-height-section').css('display')!=='none';
            $('#dWallPointHeight').val('2.5');
            cursor_realX=aamap_realX(0); cursor_realY=aamap_realY(0);
            wallTool_handleFreeformClick();
            $('#dWallPointHeight').val('7.25');
            cursor_realX=aamap_realX(10); cursor_realY=aamap_realY(0);
            wallTool_handleFreeformClick();
            wallTool_finishWall();
            var authoredSlopedWall=aamap_objects[0];
            $('#dWallSlopedHeight').prop('checked',false).trigger('change');
            result.slopedWall={
                toggle:!!document.getElementById('dWallSlopedHeight'),
                pointInput:!!document.getElementById('dWallPointHeight'),
                pointControlVisible:slopedPointControlVisible,
                imported:importedSlopedWall.slopedHeight,
                heights:importedSlopedHeights,
                xml:importedSlopedXml,
                authoredHeights:authoredSlopedWall.points.map(function(point){return point.height;}),
                authoredXml:authoredSlopedWall.getXML()
            };

            $('#symmetry-x-toggle').prop('checked',true);
            $('#symmetry-y-toggle').prop('checked',false);
            var symmetrySpawn=new Spawn();
            symmetrySpawn.x=6;symmetrySpawn.y=2;symmetrySpawn.xDir=1;symmetrySpawn.yDir=0;
            var symmetryGroup=aamap_addWithSymmetry(symmetrySpawn);
            result.symmetryUi={x:!!document.getElementById('symmetry-x-toggle'),
                y:!!document.getElementById('symmetry-y-toggle'), count:symmetryGroup.length,
                positions:symmetryGroup.map(function(spawn){return [spawn.x,spawn.y];})
                    .sort(function(a,b){return a[0]-b[0];}),
                directions:symmetryGroup.map(function(spawn){return spawn.xDir;})
                    .sort(function(a,b){return a-b;})};
            aamap_removeObjectGroup(symmetryGroup);
            var symmetryModelCount=aamap_objects.length;
            $('#symmetry-check-toggle').prop('checked',true);
            vectron_render();
            var symmetrySourceRect=aamap_symmetryCheckClipRect({x:1,y:1});
            result.symmetryCheck={exists:!!document.getElementById('symmetry-check-toggle'),
                sourceStartsAtAxis:symmetrySourceRect.x===aamap_realX(0),
                fullHeight:symmetrySourceRect.y===0 && symmetrySourceRect.height===vectron_height,
                visualCopies:aamap_symmetryCheckObjects.length,
                modelUnchanged:aamap_objects.length===symmetryModelCount,
                expectedCopies:symmetryModelCount};
            $('#symmetry-check-toggle,#symmetry-x-toggle,#symmetry-y-toggle').prop('checked',false);
            vectron_render();

            selectTool_deselectAll();
            $('#xml-editor-close').trigger('mouseup');
            var nameInput=document.getElementById('map_name');
            nameInput.focus();
            nameInput.dispatchEvent(new KeyboardEvent('keydown',{key:String.fromCharCode(96),code:'Backquote',
                bubbles:true,cancelable:true}));
            var ignoredWhileTyping=!$('#xml-editor-overlay').hasClass('visible');
            nameInput.blur();
            document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'~',code:'Backquote',shiftKey:true,
                bubbles:true,cancelable:true}));
            var settingsOpened=gui_active;
            document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'~',code:'Backquote',shiftKey:true,
                bubbles:true,cancelable:true}));
            var settingsClosed=!gui_active;
            document.body.dispatchEvent(new KeyboardEvent('keydown',{key:String.fromCharCode(96),code:'Backquote',
                bubbles:true,cancelable:true}));
            var shortcutOpened=$('#xml-editor-overlay').hasClass('visible');
            var nativeCode=$('#xml-editor-content').val();
            var nativeFormatLabel=$('#code-viewer-format').text();
            $('#xml-editor-apply').trigger('mouseup');
            result.xmlEditor={typingGuard:ignoredWhileTyping, shortcut:shortcutOpened,
                remainsOpen:$('#xml-editor-overlay').hasClass('visible'),
                settingsShortcut:settingsOpened && settingsClosed,
                nativeFormat:nativeFormatLabel,
                nativePretty:/^\\{\\n  "format": "arma-racing-map",/.test(nativeCode) &&
                    JSON.parse(nativeCode).format==='arma-racing-map'};
            document.body.dispatchEvent(new KeyboardEvent('keydown',{key:String.fromCharCode(96),code:'Backquote',
                bubbles:true,cancelable:true}));
            result.xmlEditor.toggledClosed=!$('#xml-editor-overlay').hasClass('visible');
            codeViewer_setSourceFormat('legacy-xml');
            $('.toolbar-toolXml').trigger('mouseup');
            var legacyCode=$('#xml-editor-content').val();
            result.xmlEditor.legacyFormat=$('#code-viewer-format').text();
            result.xmlEditor.legacyPretty=/^<Resource[^>]*>\\n  <Map[^>]*>\\n/.test(legacyCode);
            $('#xml-editor-close').trigger('mouseup');
            codeViewer_setSourceFormat('armamap');

            aamap_objects.forEach(aamap_removeObjectVisuals);
            aamap_objects = [];
            xml_process('<Resource name="base-contract" author="smoke" category="racing" version="1"><Map><World><Field level_height="8">' +
                '<Spawn x="0" y="0"/><Floor level="0"><Point x="-2" y="-2"/><Point x="2" y="-2"/><Point x="2" y="2"/><Point x="-2" y="2"/></Floor>' +
                '<Wall level="1"><Point x="-4" y="-4"/><Point x="4" y="-4"/><Point x="4" y="4"/><Point x="-4" y="4"/><Point x="-4" y="-4"/></Wall>' +
                '</Field></World></Map></Resource>', true);
            aamap_drawFloorInfills();
            var baseContractXml=aamap_buildXml('base-contract','smoke','racing','1',4,[]).xml;
            document.querySelector('.level-delete-btn[data-level="0"]').click();
            result.baseFloorContract = {
                levels:aamap_existingLevels(),
                importedBaseFloors:aamap_objects.filter(function(object){
                    return object instanceof Floor && object.level===0;
                }).length,
                upperInfills:aamap_floorInfills.length,
                exportsBaseFloor:/<Floor level="0">/.test(baseContractXml),
                sparseDeleteOff:$('#level-delete-keep').css('display')==='none',
                deleteMessage:/permanent base/i.test($('#level-delete-message').text())
            };
            document.getElementById('level-delete-cancel').click();

            aamap_objects.forEach(aamap_removeObjectVisuals);
            aamap_objects = [];
            xml_process('<Resource name="zone-import" author="smoke" category="racing" version="1"><Map><World><Field>' +
                '<Zone type="setting" setting="JUMP_ENABLED" value="1" priority="99" start_tick="4" end_tick="8"><ShapeCircle radius="2"><Point x="0" y="0"/></ShapeCircle></Zone>' +
                '<Zone type="health" delta="-5" priority="-3" start_tick="1" end_tick="2"><ShapeCircle radius="2"><Point x="10" y="0"/></ShapeCircle></Zone>' +
                '<Zone type="checkpoint" order="0"><ShapeLine width="0"><Point x="-5" y="4"/><Point x="5" y="4"/></ShapeLine></Zone>' +
                '<Zone effect="checkpoint"><ShapeCircle radius="2"><Point x="15" y="0"/></ShapeCircle><Checkpoint id="2"/></Zone>' +
                '<Zone type="setting" setting="JUMP_ENABLED" value="2"><ShapeCircle radius="2"><Point x="20" y="0"/></ShapeCircle></Zone>' +
                '<Zone type="setting" setting="TURN_SPEED_LOSS" value="101"><ShapeCircle radius="2"><Point x="30" y="0"/></ShapeCircle></Zone>' +
                '</Field></World></Map></Resource>', true);
            var importedZones=aamap_objects.filter(function(object){return object instanceof Zone;});
            var importedZoneXml=importedZones.map(function(zone){return zone.getXML();}).join('');
            result.zoneImport={
                count:importedZones.length,
                kinds:importedZones.map(function(zone){return zone.zoneName;}),
                zeroWidth:importedZones.some(function(zone){
                    return zone.shapeType==='line' && zone.lineWidth===0 &&
                        /<ShapeLine width="0">/.test(zone.getXML());
                }),
                priorityDropped:!/priority=/.test(importedZoneXml),
                timingPreserved:/start_tick="4" end_tick="8"/.test(importedZoneXml) &&
                    /start_tick="1" end_tick="2"/.test(importedZoneXml),
                nestedCheckpointOrder:importedZones.some(function(zone) {
                    return zone.zoneName==='checkpoint' && zone.option===3;
                }),
                legacyFieldsDropped:importedZones.every(function(zone){
                    return !Object.prototype.hasOwnProperty.call(zone,'priority') &&
                        !Object.prototype.hasOwnProperty.call(zone,'startTick') &&
                    !Object.prototype.hasOwnProperty.call(zone,'endTick');
                })
            };
            var selectedLine=importedZones.filter(function(zone){
                return zone.shapeType==='line';
            })[0];
            selectedLine.lineWidth=2;
            selectedLine.updateLineBounds();
            selectTool_selectedObjs=[selectedLine];
            selectedLine.isSelected=true;
            vectron_currentTool='select';
            aamap_clearHistory();
            selectTool_updateSelectionProperties();
            var selectedLinePanelVisible=$('#selection-properties-window').css('display')!=='none';
            var selectedLineApplied=selectTool_applySelectedLineWidth('0');
            var selectedLineXml=selectedLine.getXML();
            aamap_undo();
            var selectedLineUndo=selectedLine.lineWidth;
            aamap_redo();
            result.selectedLineWidth={
                panelVisible:selectedLinePanelVisible,
                applied:selectedLineApplied,
                width:selectedLine.lineWidth,
                input:document.getElementById('selection-line-zone-width').value,
                xmlZero:/<ShapeLine width="0">/.test(selectedLineXml),
                undo:selectedLineUndo
            };

            aamap_objects.forEach(aamap_removeObjectVisuals);
            aamap_objects = [];
            aamap_clearHistory();
            aamap_resetLevels(1, []);
            document.getElementById('level-new-quick').click();
            result.quickLevelAdd = {
                levels:aamap_existingLevels(),
                activeLevel:aamap_activeLevel
            };
            aamap_undo();
            aamap_clearHistory();
            aamap_activeLevel=0; vectron_currentTool='ramp';
            rampTool_resetPlacement();
            function rampCursor(x,y){cursor_realX=aamap_realX(x);cursor_realY=aamap_realY(y);}
            rampCursor(1,2); rampTool_click();
            rampCursor(5,2); rampTool_click();
            document.getElementById('level-menu-toggle').click();
            var rampLevelMenuOpened=$('#level-menu').css('display')!=='none' &&
                document.getElementById('level-menu-toggle').getAttribute('aria-expanded')==='true';
            document.getElementById('level-new').click();
            aamap_undo();
            var rampUndo = {
                levels:aamap_existingLevels(), activeLevel:aamap_activeLevel,
                toLevel:rampTool_toLevel,
                firstEdge:rampTool_fromEdge.map(function(point){
                    return [Math.round(point.x * 1e9) / 1e9, Math.round(point.y * 1e9) / 1e9];
                })
            };
            aamap_redo();
            result.rampNewLevel = {
                menuOpened:rampLevelMenuOpened,
                levelCount:aamap_levelCount(),
                activeLevel:aamap_activeLevel,
                fromLevel:rampTool_fromLevel,
                toLevel:rampTool_toLevel,
                firstEdge:rampTool_fromEdge.map(function(point){
                    return [Math.round(point.x * 1e9) / 1e9, Math.round(point.y * 1e9) / 1e9];
                }),
                undo:rampUndo
            };
            rampTool_cancelPlacement();

            aamap_objects.forEach(aamap_removeObjectVisuals);
            aamap_objects=[];
            aamap_clearHistory();
            aamap_resetLevels(2,[8]);
            aamap_activeLevel=0;
            aamap_updateLayerControls();
            vectron_currentTool='zone'; zoneTool_type=7;
            $('#dZoneShape').val('circle');
            $('#dZoneMoving').prop('checked',false);
            zoneTool_resetPlacement();
            function teleportCursor(x,y){
                cursor_realX=cursor_neverSnappedX=aamap_realX(x);
                cursor_realY=cursor_neverSnappedY=aamap_realY(y);
            }
            teleportCursor(1,1); zoneTool_complete();
            teleportCursor(5,1); zoneTool_complete();
            var teleportSourceBeforeSwitch=zoneTool_pendingZone &&
                zoneTool_pendingZone.obj.attr('stroke')==='#e67e22' &&
                !!zoneTool_pendingZone.obj.node.parentNode;
            document.querySelector('.level-select-btn[data-level="1"]').click();
            var teleportSourceAfterSwitch=zoneTool_stage==='teleport-position' &&
                aamap_activeLevel===1 && zoneTool_pendingZone.obj.attr('stroke')==='#e67e22' &&
                !!zoneTool_pendingZone.obj.node.parentNode;
            teleportCursor(10,10); zoneTool_complete();
            teleportCursor(10,14); zoneTool_guide();
            var expectedTeleportGuide=spawnMarker_create(
                aamap_realX(10),aamap_realY(10),0,1,'#e67e22','#e67e22');
            var teleportGuideMatchesSpawn=zoneTool_guideObj.attr('path').toString()===
                expectedTeleportGuide.attr('path').toString() &&
                JSON.stringify(zoneTool_guideObj.transform())===JSON.stringify(expectedTeleportGuide.transform()) &&
                zoneTool_guideObj.attr('stroke')==='#e67e22';
            expectedTeleportGuide.remove();
            zoneTool_complete();
            var placedTeleport=aamap_objects.filter(function(object){
                return object instanceof Zone && object.zoneName==='teleport';
            })[0];
            var expectedFinalMarker=spawnMarker_create(
                aamap_realX(10),aamap_realY(10),0,1,'#e67e22','#e67e22');
            var teleportXml=placedTeleport.getXML();
            result.teleportPlacement={
                sourceBeforeSwitch:teleportSourceBeforeSwitch,
                sourceAfterSwitch:teleportSourceAfterSwitch,
                guideMatchesSpawn:teleportGuideMatchesSpawn,
                finalMatchesSpawn:placedTeleport.destinationObj.attr('path').toString()===
                    expectedFinalMarker.attr('path').toString() &&
                    JSON.stringify(placedTeleport.destinationObj.transform())===JSON.stringify(expectedFinalMarker.transform()),
                destination:[placedTeleport.options.destination_x,placedTeleport.options.destination_y,
                    placedTeleport.options.destination_level],
                direction:[Math.round(placedTeleport.options.xdir*1e9)/1e9,
                    Math.round(placedTeleport.options.ydir*1e9)/1e9],
                orange:placedTeleport.destinationObj.attr('stroke')==='#e67e22',
                cleanXml:!/priority=|start_tick=|end_tick=/.test(teleportXml)
            };
            expectedFinalMarker.remove();

            vectron_currentTool='select'; vectron_toolActive=false;
            selectTool_selectedObjs=[];
            selectTool_selectedTeleportDestination=null;
            vectron_render();
            teleportCursor(10,10);
            var destinationHit=selectTool_resolveHoveredSetFromCursor() &&
                selectTool_hoveredAamapObj===placedTeleport &&
                selectTool_hoveredPart==='teleport-destination';
            selectTool_start();
            var selectedLine=!!placedTeleport.teleportLinkObj &&
                placedTeleport.teleportLinkObj.attr('arrow-end')==='classic-wide-long';
            teleportCursor(12,13);
            selectTool_progress();
            var previewMoved=placedTeleport.destinationObj.attr('path').toString().indexOf(
                String(aamap_realX(12)))>=0;
            selectTool_complete();
            var sourceStayed=[placedTeleport.x,placedTeleport.y].map(function(value) {
                return Math.round(value*1e9)/1e9;
            });
            var movedDestination=[placedTeleport.options.destination_x,
                placedTeleport.options.destination_y,placedTeleport.options.destination_level];
            var movedXml=placedTeleport.getXML();
            aamap_undo();
            var undoDestination=[placedTeleport.options.destination_x,
                placedTeleport.options.destination_y];
            aamap_redo();
            var redoDestination=[placedTeleport.options.destination_x,
                placedTeleport.options.destination_y];
            result.teleportEditing={
                destinationHit:destinationHit, selectedLine:selectedLine,
                previewMoved:previewMoved, sourceStayed:sourceStayed,
                movedDestination:movedDestination,
                xmlMoved:/destination_x="12" destination_y="13" destination_level="1"/.test(movedXml),
                undoDestination:undoDestination, redoDestination:redoDestination
            };
            selectTool_deselectAll();

            aamap_objects.forEach(aamap_removeObjectVisuals);
            aamap_objects = [];
            aamap_clearHistory();
            aamap_resetLevels(4, [5,7,9]);
            var spawn = new Spawn(); spawn.level=0; spawn.x=0; spawn.y=0; aamap_add(spawn);
            var upper = new Wall(); upper.level=3; upper.points=[new WallPoint(0,0),new WallPoint(10,0)]; aamap_add(upper);
            aamap_deleteLevel(1, false);
            result.sparse = {levels:aamap_existingLevels(), upper:upper.level,
                heights:xml_level_heights.slice(), rows:document.querySelectorAll('.level-select-btn').length,
                missing:document.querySelectorAll('.level-missing-row').length};
            aamap_undo();

            $('#dZoneShape').val('circle');
            $('#dZoneMoving').prop('checked', true);
            $('#dZoneMovementSpeed').val('20');
            $('#dZoneRotationSpeed').val('30');
            $('#dZoneMovementMode').val('instant');
            $('#dZoneSpawnAtVertices').prop('checked',true);
            zoneTool_type=0; vectron_currentTool='zone'; aamap_activeLevel=0;
            function cursor(x,y){
                cursor_realX=cursor_neverSnappedX=aamap_realX(x);
                cursor_realY=cursor_neverSnappedY=aamap_realY(y);
            }
            cursor(2,3); zoneTool_complete(); cursor(6,3); zoneTool_complete();
            cursor(12,3); zoneTool_complete();
            result.movementFinished=zoneTool_finishMovementPath();
            var moving=aamap_objects.filter(function(object){return object instanceof Zone;})[0];
            result.moving={path:moving.movementPath.map(function(point){return [point.x,point.y];}),
                mode:moving.movementMode, spawnAtVertices:moving.spawnAtVertices,
                arrows:Array.from(moving.movementPathObj).filter(function(object){
                    return object.attr('arrow-end')==='classic-wide-long';
                }).length,
                xml:moving.getXML(), errors:aamap_validateForExport(4)};

            result.diagonal=[
                wallTool_isGridDiagonalSegment({x:0,y:0},{x:5,y:5}),
                wallTool_isGridDiagonalSegment({x:0,y:0},{x:5,y:4})
            ];
            $('#dZoneMoving').prop('checked',false);
            zoneTool_stage='shape'; zoneTool_type=0;
            $('#dZoneShape').val('polygon');
            zoneTool_points=[{x:0,y:0},{x:4,y:0}];
            cursor(8,4); zoneTool_guide();
            var polygonDiagonal=zoneTool_guideObj[1].attr('stroke');
            cursor(8,3); zoneTool_guide();
            var polygonOrdinary=zoneTool_guideObj[1].attr('stroke');
            $('#dZoneShape').val('line'); zoneTool_points=[{x:0,y:0}];
            cursor(-5,5); zoneTool_guide();
            result.zoneDiagonal=[polygonDiagonal,polygonOrdinary,
                zoneTool_guideObj[1].attr('stroke')];
            zoneTool_resetPlacement();

            document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'i',code:'KeyI',
                bubbles:true,cancelable:true}));
            var previewShortcut=preview3d_opened;
            preview3d_close();
            preview3d_open();
            result.preview={visible:$('#preview3d-overlay').is(':visible'),
                lines:preview3d_scene.lines.length, triangles:preview3d_scene.triangles.length,
                cycleHeight:PREVIEW3D_CYCLE_HEIGHT,
                projected:!!preview3d_projectPoint([0,10,0],{x:0,y:0,z:0,yaw:0,pitch:0,fov:68},800,600),
                shortcut:previewShortcut};
            preview3d_close();

            var canvas=document.getElementById('canvas_container');
            canvas.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:80,clientY:80}));
            canvas.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button:2,clientX:80,clientY:80}));
            result.contextMenuStayedOpen=$('#contextMenu').is(':visible');
            $('#contextMenu').hide(); aamap_active=true; eventHandler_contextMenu=false;

            var beforeNewMap={count:aamap_objects.length,name:xml_name,levels:aamap_levelExists.slice()};
            $('.toolbar-newMap').trigger('mouseup');
            var blankMap={count:aamap_objects.length,name:xml_name,levels:aamap_levelExists.slice()};
            aamap_undo();
            result.newMapUndo={blank:blankMap,
                restored:{count:aamap_objects.length,name:xml_name,levels:aamap_levelExists.slice()},
                expected:beforeNewMap};

            aamap_objects.forEach(aamap_removeObjectVisuals);
            aamap_resetLevels(2,[8]);
            aamap_objects=[];
            var exportSpawn=new Spawn(); exportSpawn.level=0; exportSpawn.x=0; exportSpawn.y=0;
            aamap_add(exportSpawn);
            var exportWall=new Wall(); exportWall.level=1;
            exportWall.points=[new WallPoint(0,0),new WallPoint(8,0)];
            aamap_add(exportWall);
            // New Map intentionally clears the author verifier. Re-establish
            // it here so this section reaches the floor-warning and password-
            // confirmation paths instead of correctly stopping at the
            // required-password guard.
            $('#map_author_password').val('correct horse').trigger('input');
            await xml_waitForAuthorPasswordHash();
            var originalConfirm=window.confirm;
            var originalSave=vectron_saveTextAsFile;
            var confirmCalls=0, saveCalls=0;
            window.confirm=function(message){
                confirmCalls++;
                return false;
            };
            vectron_saveTextAsFile=function(){ saveCalls++; };
            aamap_active=true;
            $('.toolbar-export').trigger('mouseup');
            var toolbarPromptCalls=confirmCalls;
            Mousetrap.trigger('mod+s');
            var shortcutPromptCalls=confirmCalls;
            eventHandler_downloadExportMap();
            var entryPromptCalls=confirmCalls;
            var savesAfterDeclines=saveCalls;
            var warnedMap=eventHandler_getExportMap();
            window.confirm=function(message){
                confirmCalls++;
                return /upper levels but no upper-level floors/i.test(message);
            };
            var accepted=eventHandler_downloadExportMap();
            $('#export-password-confirm').val('correct horse');
            var confirmed=await eventHandler_confirmExportPassword();
            var savesAfterAccept=saveCalls;
            var exportFloor=new Floor(1);
            exportFloor.points=[{x:0,y:0},{x:8,y:0},{x:0,y:8}];
            aamap_add(exportFloor);
            var flooredMap=eventHandler_getExportMap();
            var exportedWithoutPrompt=eventHandler_downloadExportMap();
            $('#export-password-confirm').val('correct horse');
            var floorConfirmed=await eventHandler_confirmExportPassword();
            var promptsAfterFloor=confirmCalls;
            aamap_resetLevels(1,[]);
            aamap_objects=[exportSpawn];
            var baseOnlyMap=eventHandler_getExportMap();
            window.confirm=originalConfirm;
            vectron_saveTextAsFile=originalSave;
            result.exportFloorWarning={
                sharedEntryPoints:toolbarPromptCalls===1 && shortcutPromptCalls===2 &&
                    entryPromptCalls===3,
                entryPromptCounts:[toolbarPromptCalls,shortcutPromptCalls,entryPromptCalls],
                warningCount:warnedMap.validationWarnings.length,
                declinedDidNotSave:savesAfterDeclines===0,
                confirmationOpened:accepted===false,
                confirmed:confirmed,
                savedAfterAccept:savesAfterAccept===1,
                floorSuppresses:flooredMap.validationWarnings.length===0,
                noFloorPrompt:confirmCalls===promptsAfterFloor,
                exportedWithoutPrompt:exportedWithoutPrompt===false && floorConfirmed,
                baseSuppresses:baseOnlyMap.validationWarnings.length===0,
                finalSaveCalls:saveCalls
            };

            aamap_objects.forEach(aamap_removeObjectVisuals);
            aamap_objects=[];
            armamap_process({
                format:'arma-racing-map',format_version:1,
                metadata:{name:'native-roundtrip',author:'smoke',revision:'1'},
                axes:[[1,0],[0.2,0.98],[-1,0]],
                levels:{count:2,gaps:[8]},
                settings:{ARCHITECT_TIME:'12.0',CYCLE_ACCEL:20,RIM_HEIGHT:8},
                spawns:[{level:0,position:[0,0],direction:[1,0]}],
                walls:[{level:0,points:[[0,0,2],[8,0]]}],floors:[],
                ramps:[{from_level:0,to_level:1,width:6,points:[[0,4],[12,4]]}],
                zones:[{type:'death',level:0,
                    shape:{type:'circle',center:[3,3],radius:2},
                    movement:{speed:5,rotation:17.5,mode:'circular',
                        spawn_at_vertices:false,path:[[3,3],[13,3]]}}],
                validation:{version:1,ticks:720,fraction:0,tick_rate:60,
                    fraction_scale:1000000,proof_algorithm:'fixture',replay_proof:'proof'}
            },true);
            var untouchedNative=eventHandler_getExportMap().document;
            var untouchedCompatibility=armamap_toCompatibilityXml(untouchedNative);
            var importedSparseWall=aamap_objects.filter(function(object){
                return object instanceof Wall;
            })[0];
            aamap_recordAction({label:'smoke mutation',undo:function(){},redo:function(){}});
            var mutatedNative=eventHandler_getExportMap().document;
            result.nativeRoundTrip={
                axes:untouchedNative.axes,
                validationPreserved:!!untouchedNative.validation &&
                    /<MapValidation\\b/.test(untouchedCompatibility),
                validationTyped:typeof untouchedNative.validation.version==='number' &&
                    typeof untouchedNative.validation.ticks==='number' &&
                    typeof untouchedNative.validation.fraction_scale==='number',
                circleRotationPreserved:untouchedNative.zones.length===1 &&
                    untouchedNative.zones[0].movement.rotation===17.5,
                sparseWall:importedSparseWall.heightAuthored===false &&
                    importedSparseWall.points[1].height===undefined &&
                    !Object.prototype.hasOwnProperty.call(untouchedNative.walls[0],'height') &&
                    untouchedNative.walls[0].points[1].length===2,
                twoPointRamp:untouchedNative.ramps.length===1 &&
                    untouchedNative.ramps[0].width===6 &&
                    untouchedNative.ramps[0].points.length===2,
                validationCleared:!mutatedNative.validation,
                authorTimeCleared:!Object.prototype.hasOwnProperty.call(
                    mutatedNative.settings,'ARCHITECT_TIME'),
                gameplaySettingKept:mutatedNative.settings.CYCLE_ACCEL==='20'
            };

            var legacyCoordinatesXml='<Resource name="legacy-coordinate-smoke" author="smoke" ' +
                'category="racing" version="1"><Map><World><Field level_height="8">' +
                '<Spawn x="110" y="210" xdir="0" ydir="1"/>' +
                '<Wall><Point x="100" y="200"/><Point x="140" y="200"/></Wall>' +
                '<Floor level="1"><Point x="105" y="205"/><Point x="115" y="205"/>' +
                '<Point x="105" y="215"/></Floor>' +
                '<Ramp from_level="0" to_level="1" width="4">' +
                '<Point x="110" y="220"/><Point x="120" y="220"/></Ramp>' +
                '<Zone type="teleport" destination_x="160" destination_y="260" ' +
                'destination_level="0" xdir="1" ydir="0" movement_speed="20">' +
                // The radius extends the remote path pose to (162,262), beyond
                // the teleport destination. This catches pivot-only bounds.
                '<ShapeCircle radius="12"><Point x="120" y="230"/></ShapeCircle>' +
                '<MovementPath><Point x="120" y="230"/><Point x="150" y="250"/>' +
                '</MovementPath></Zone>' +
                '<Zone type="death"><ShapeRectangle minx="115" miny="205" ' +
                'maxx="130" maxy="220"/></Zone>' +
                '<Zone type="death"><ShapePolygon scale="1"><Point x="130" y="240"/>' +
                '<Point x="0" y="0"/><Point x="5" y="0"/><Point x="0" y="5"/>' +
                '</ShapePolygon></Zone>' +
                '<Zone type="death"><ShapeLine width="0"><Point x="100" y="250"/>' +
                '<Point x="120" y="250"/></ShapeLine></Zone>' +
                '</Field></World></Map></Resource>';
            await importMapFile('legacy-coordinate-smoke.aamap.xml', legacyCoordinatesXml);
            var legacyCoordinatesBounds=aamap_getObjectsBounds(aamap_objects);
            var legacyCoordinatesSpawn=aamap_objects.filter(function(object){
                return object instanceof Spawn;
            })[0];
            var legacyCoordinatesWall=aamap_objects.filter(function(object){
                return object instanceof Wall;
            })[0];
            var legacyCoordinatesFloor=aamap_objects.filter(function(object){
                return object instanceof Floor;
            })[0];
            var legacyCoordinatesRamp=aamap_objects.filter(function(object){
                return object instanceof Ramp;
            })[0];
            var legacyCoordinatesZones=aamap_objects.filter(function(object){
                return object instanceof Zone;
            });
            var legacyCoordinatesTeleport=legacyCoordinatesZones.filter(function(zone){
                return zone.zoneName==='teleport';
            })[0];
            var legacyCoordinatesRectangle=legacyCoordinatesZones.filter(function(zone){
                return zone.shapeType==='rectangle';
            })[0];
            var legacyCoordinatesPolygon=legacyCoordinatesZones.filter(function(zone){
                return zone.shapeType==='polygon';
            })[0];
            var legacyCoordinatesLine=legacyCoordinatesZones.filter(function(zone){
                return zone.shapeType==='line';
            })[0];
            result.legacyImportCoordinates={
                legacy:{
                    format:codeViewer_sourceFormat,
                    bounds:legacyCoordinatesBounds,
                    viewport:[vectron_panX,vectron_panY],
                    spawn:[legacyCoordinatesSpawn.x,legacyCoordinatesSpawn.y,
                        legacyCoordinatesSpawn.xDir,legacyCoordinatesSpawn.yDir],
                    wall:legacyCoordinatesWall.points.map(function(point){return [point.x,point.y];}),
                    floor:legacyCoordinatesFloor.points,
                    rampSource:legacyCoordinatesRamp.sourceTwoPoint,
                    teleport:{source:[legacyCoordinatesTeleport.x,legacyCoordinatesTeleport.y],
                        destination:[legacyCoordinatesTeleport.options.destination_x,
                            legacyCoordinatesTeleport.options.destination_y],
                        path:legacyCoordinatesTeleport.movementPath,
                        remoteBounds:(function() {
                            var remote=legacyCoordinatesTeleport.movementPath[1];
                            return [remote.x-legacyCoordinatesTeleport.radius,
                                remote.y-legacyCoordinatesTeleport.radius,
                                remote.x+legacyCoordinatesTeleport.radius,
                                remote.y+legacyCoordinatesTeleport.radius];
                        })()},
                    rectangle:[legacyCoordinatesRectangle.minx,legacyCoordinatesRectangle.miny,
                        legacyCoordinatesRectangle.maxx,legacyCoordinatesRectangle.maxy],
                    polygon:{origin:[legacyCoordinatesPolygon.x,legacyCoordinatesPolygon.y],
                        points:legacyCoordinatesPolygon.polygonPoints},
                    line:[legacyCoordinatesLine.lineStart,legacyCoordinatesLine.lineEnd],
                    dimensions:{wall:legacyCoordinatesWall.points[1].x-
                            legacyCoordinatesWall.points[0].x,
                        rampWidth:legacyCoordinatesRamp.sourceTwoPoint.width,
                        circleRadius:legacyCoordinatesTeleport.radius,
                        rectangle:[legacyCoordinatesRectangle.maxx-
                                legacyCoordinatesRectangle.minx,
                            legacyCoordinatesRectangle.maxy-
                                legacyCoordinatesRectangle.miny],
                        line:legacyCoordinatesLine.lineEnd.x-
                            legacyCoordinatesLine.lineStart.x}
                }
            };
            await importMapFile('native-coordinate-smoke.armamap', JSON.stringify({
                format:'arma-racing-map',format_version:1,
                metadata:{name:'native-coordinate-smoke',tags:['racing']},
                axes:4,levels:{count:1,gaps:[]},settings:{},
                spawns:[{level:0,position:[100,200],direction:[1,0]}],
                walls:[{level:0,points:[[100,200],[140,200]]}],
                floors:[],ramps:[],zones:[]
            }));
            var nativeCoordinateSpawn=aamap_objects.filter(function(object){
                return object instanceof Spawn;
            })[0];
            var nativeCoordinateWall=aamap_objects.filter(function(object){
                return object instanceof Wall;
            })[0];
            result.legacyImportCoordinates.native={format:codeViewer_sourceFormat,
                spawn:[nativeCoordinateSpawn.x,nativeCoordinateSpawn.y],
                wall:nativeCoordinateWall.points.map(function(point){return [point.x,point.y];})};

            aamap_objects.forEach(aamap_removeObjectVisuals); aamap_objects=[];
            xml_process('<Map><World><Field><Axes number="2">' +
                '<Axis xdir="1" ydir="1"/><Axis xdir="-1" ydir="1"/></Axes>' +
                '<Spawn x="0" y="0"/></Field></World></Map>',true);
            var normalizedAxes=xml_axis_vectors.map(function(vector){return vector.slice();});
            aamap_objects.forEach(aamap_removeObjectVisuals); aamap_objects=[];
            xml_process('<Map><World><Field><Axes number="2" normalize="false">' +
                '<Axis xdir="2" ydir="1"/><Axis xdir="-3" ydir="4"/></Axes>' +
                '<Spawn x="0" y="0"/></Field></World></Map>',true);
            result.legacyAxes={normalized:normalizedAxes,
                unnormalized:xml_axis_vectors.map(function(vector){return vector.slice();})};
            aamap_objects.forEach(aamap_removeObjectVisuals); aamap_objects=[];
            armamap_process({format:'arma-racing-map',format_version:1,
                metadata:{name:'partial-gaps'},levels:{count:3,gaps:[6]},axes:4,
                settings:{},spawns:[{position:[0,0],direction:[1,0]}],
                walls:[],floors:[],ramps:[],zones:[]},true);
            result.partialLevelGaps=eventHandler_getExportMap().document.levels.gaps;

            var performanceWalls=[];
            for(var performanceIndex=0;performanceIndex<300;performanceIndex++) {
                var performanceX=performanceIndex%30;
                var performanceY=Math.floor(performanceIndex/30);
                performanceWalls.push({level:0,height:4,
                    points:[[performanceX,performanceY],[performanceX+0.75,performanceY+0.5]]});
            }
            var originalPerformancePath=vectron_screen.path;
            var performancePathCalls=0;
            vectron_screen.path=function() {
                performancePathCalls++;
                return originalPerformancePath.apply(this,arguments);
            };
            try {
                await importMapFile('large-import-smoke.armamap',JSON.stringify({
                    format:'arma-racing-map',format_version:1,
                    metadata:{name:'large-import-smoke',author:'smoke',tags:['racing']},
                    axes:8,levels:{count:1,gaps:[]},settings:{},
                    spawns:[{level:0,position:[0,0],direction:[1,0]}],
                    walls:performanceWalls,floors:[],ramps:[],zones:[]
                }));
            } finally {
                vectron_screen.path=originalPerformancePath;
            }
            result.importPerformance={objects:aamap_objects.length,
                pathCalls:performancePathCalls,bulkLoadEnded:!aamap_isBulkLoading()};
            return JSON.stringify(result);
        })()`;
        const evaluated = await call("script.evaluate", {
            expression, target:{context}, awaitPromise:true, resultOwnership:"none"
        });
        if(!evaluated.result) {
            throw new Error("Browser evaluation failed: " + JSON.stringify(evaluated));
        }
        const value = JSON.parse(evaluated.result.value);
        assert.deepStrictEqual(value.legacyImportCoordinates, {
            legacy:{
                format:'legacy-xml',bounds:{minx:100,miny:200,maxx:162,maxy:262},
                viewport:[-131,-231],spawn:[110,210,0,1],
                wall:[[100,200],[140,200]],
                floor:[{x:105,y:205},{x:115,y:205},{x:105,y:215}],
                rampSource:{start:{x:110,y:220},end:{x:120,y:220},width:4},
                teleport:{source:[120,230],destination:[160,260],
                    path:[{x:120,y:230},{x:150,y:250}],remoteBounds:[138,238,162,262]},
                rectangle:[115,205,130,220],
                polygon:{origin:[130,240],points:[{x:0,y:0},{x:5,y:0},{x:0,y:5}]},
                line:[{x:100,y:250},{x:120,y:250}],
                dimensions:{wall:40,rampWidth:4,circleRadius:12,rectangle:[15,15],line:20}
            },
            native:{format:'armamap',spawn:[100,200],wall:[[100,200],[140,200]]}
        });
        if(process.env.VECTRON_IMPORT_COORDINATES_ONLY === "1") {
            console.log("Vectron legacy-import coordinate preservation browser test passed.");
            return;
        }
        assert.deepStrictEqual(value.loaded, ["function", "function", "function", "function"]);
        assert.deepStrictEqual(value.theme, {
            href:"./css/vectron-dark.css", darkToggleRemoved:true, darkRenderer:true
        });
        assert.deepStrictEqual(value.mapHeaderDefaults, {
            revisionInputRemoved:true, zoomDefault:"0.10", zoomOptionDefault:true,
            savedZoomPreserved:true
        });
        assert.deepStrictEqual(value.levelPicker, {
            label:"Level", down:true, current:"0", up:true, quickAdd:true,
            deleteChoices:["Delete + shift above down", "Delete without shifting", "Cancel"]
        });
        assert.deepStrictEqual(value.quickLevelAdd, {levels:[0,1], activeLevel:1});
        assert.deepStrictEqual(value.zoneUi, {
            exitOption:true, tooltipRows:true, helpCount:0,
            shapeTooltipRendered:true, tooltipOnscreen:true,
            zoneTypeTooltipOnscreen:true, zoneTypePlacement:"auto right", placement:"auto left",
            advancedFieldsRemoved:true, healthReplacesRubber:true, settingZone:true,
            teleportInputsRemoved:true, quickPlacementRemoved:true,
            triggerHelp:true, keyboardHelp:true, noActionLabel:true,
            panelDefault:["340px","auto"], movementDefaults:["20","0","circular",false],
            checkpointAutoIncrement:true, checkpointColor:"#ffffff",
            lineWidthMinimum:"0", zeroLineWidthAccepted:true, zonePulseDefault:"0.1",
            circleRotation:["0",true], rectangleRotationVisible:true
        });
        assert.deepStrictEqual(value.checkpointVisual, {
            stroke:"#ffffff", label:"1", labelFill:"#ffffff", labelStroke:"none",
            outlineFill:"none", outlineStroke:"#000000"
        });
        assert.deepStrictEqual(value.authorPassword, {
            inputExists:true, viewToggleExists:true, confirmationExists:true,
            maximumLength:120, format:true, exactDigest:true, noPlaintext:true,
            exported:true, importedFieldBlank:true, preserved:true
        });
        assert.deepStrictEqual(value.slopedWall, {
            toggle:true, pointInput:true, pointControlVisible:true, imported:true,
            heights:[2.5,7.25],
            xml:'<Wall level="1">\n  <Point x="0" y="0" height="2.5"/>\n' +
                '  <Point x="10" y="0" height="7.25"/>\n</Wall>',
            authoredHeights:[2.5,7.25],
            authoredXml:'<Wall level="1">\n  <Point x="0" y="0" height="2.5"/>\n' +
                '  <Point x="10" y="0" height="7.25"/>\n</Wall>'
        });
        assert.deepStrictEqual(value.symmetryUi, {
            x:true, y:true, count:2, positions:[[-6,2],[6,2]], directions:[-1,1]
        });
        assert.deepStrictEqual(value.symmetryCheck, {
            exists:true, sourceStartsAtAxis:true, fullHeight:true,
            visualCopies:value.symmetryCheck.expectedCopies,
            modelUnchanged:true, expectedCopies:value.symmetryCheck.expectedCopies
        });
        assert.deepStrictEqual(value.xmlEditor, {
            typingGuard:true, shortcut:true, remainsOpen:true,
            settingsShortcut:true, nativeFormat:'.armamap JSON', nativePretty:true,
            toggledClosed:true, legacyFormat:'Legacy XML', legacyPretty:true
        });
        assert.deepStrictEqual(value.zoneImport, {
            count:4, kinds:["setting","health","checkpoint","checkpoint"], zeroWidth:true,
            priorityDropped:true, timingPreserved:true, nestedCheckpointOrder:true,
            legacyFieldsDropped:true
        });
        assert.deepStrictEqual(value.selectedLineWidth, {
            panelVisible:true, applied:true, width:0, input:"0", xmlZero:true, undo:2
        });
        assert.deepStrictEqual(value.teleportPlacement, {
            sourceBeforeSwitch:true, sourceAfterSwitch:true, guideMatchesSpawn:true,
            finalMatchesSpawn:true, destination:[10,10,1], direction:[0,1],
            orange:true, cleanXml:true
        });
        assert.deepStrictEqual(value.teleportEditing, {
            destinationHit:true, selectedLine:true, previewMoved:true,
            sourceStayed:[1,1], movedDestination:[12,13,1], xmlMoved:true,
            undoDestination:[10,10], redoDestination:[12,13]
        });
        assert.deepStrictEqual(value.baseFloorContract, {
            levels:[0,1], importedBaseFloors:0, upperInfills:0,
            exportsBaseFloor:false, sparseDeleteOff:true, deleteMessage:true
        });
        assert.deepStrictEqual(value.rampNewLevel, {
            menuOpened:true, levelCount:2, activeLevel:1, fromLevel:0, toLevel:1,
            firstEdge:[[1,2],[5,2]],
            undo:{levels:[0], activeLevel:0, toLevel:null, firstEdge:[[1,2],[5,2]]}
        });
        assert.deepStrictEqual(value.sparse, {levels:[0,2,3],upper:3,heights:[5,7,9],rows:3,missing:1});
        assert.strictEqual(value.movementFinished, true);
        assert.deepStrictEqual(value.moving.path, [[2,3],[12,3]]);
        assert.strictEqual(value.moving.mode, 'instant');
        assert.strictEqual(value.moving.spawnAtVertices, true);
        assert.strictEqual(value.moving.arrows, 1);
        assert.match(value.moving.xml, /movement_speed="20" rotation_speed="0"/);
        assert.match(value.moving.xml, /<MovementPath\b[^>]*\bloop="true"/);
        assert.match(value.moving.xml, /mode="instant" spawn_at_vertices="true"/);
        assert.deepStrictEqual(value.moving.errors, []);
        assert.deepStrictEqual(value.diagonal, [true,false]);
        assert.deepStrictEqual(value.zoneDiagonal, ['#00cfff','#ff0000','#00cfff']);
        assert.strictEqual(value.preview.visible, true);
        assert.ok(value.preview.lines > 0 && value.preview.triangles > 0);
        assert.ok(Math.abs(value.preview.cycleHeight - 1.0388507) < 1e-9);
        assert.strictEqual(value.preview.projected, true);
        assert.strictEqual(value.preview.shortcut, true);
        assert.strictEqual(value.contextMenuStayedOpen, true);
        assert.deepStrictEqual(value.newMapUndo.blank, {count:0,name:"",levels:[true]});
        assert.deepStrictEqual(value.newMapUndo.restored, value.newMapUndo.expected);
        assert.deepStrictEqual(value.exportFloorWarning, {
            sharedEntryPoints:true, entryPromptCounts:[1,2,3],
            warningCount:1, declinedDidNotSave:true,
            confirmationOpened:true, confirmed:true, savedAfterAccept:true, floorSuppresses:true,
            noFloorPrompt:true, exportedWithoutPrompt:true, baseSuppresses:true,
            finalSaveCalls:2
        });
        assert.deepStrictEqual(value.nativeRoundTrip, {
            axes:[[1,0],[0.2,0.98],[-1,0]], validationPreserved:true,
            validationTyped:true, circleRotationPreserved:true,
            sparseWall:true, twoPointRamp:true, validationCleared:true, authorTimeCleared:true,
            gameplaySettingKept:true
        });
        assert.deepStrictEqual(value.legacyAxes, {
            normalized:[[0.707,0.707],[-0.707,0.707]],
            unnormalized:[[2,1],[-3,4]]
        });
        assert.deepStrictEqual(value.partialLevelGaps, [6,6]);
        assert.strictEqual(value.importPerformance.objects, 301);
        assert.strictEqual(value.importPerformance.bulkLoadEnded, true);
        assert.ok(value.importPerformance.pathCalls <= 640,
            "Large imports must not create throwaway SVG placeholders: " +
            value.importPerformance.pathCalls + " path calls");
        assert.deepStrictEqual(browserErrors, []);
        console.log("Vectron Firefox moving-zone/levels/3D smoke test passed.");
    } catch(error) {
        console.error(error.stack || error);
        if(browserErrors.length) console.error("Browser errors:", browserErrors);
        process.exitCode = 1;
    } finally {
        ws.close();
    }
};
