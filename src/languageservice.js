/**
 *  Copyright (c) 2015-present, Jim Kynde Meyer
 *  All rights reserved.
 *
 *  This source code is licensed under the MIT license found in the
 *  LICENSE file in the root directory of this source tree.
 */
'use strict';
const util = require('util');
const express = require('express');
const bodyParser = require("body-parser");
const relayTemplates = require('./relay-templates');


// ---- Start CodeMirror wrapper ----

const mock = new (require('mock-browser').mocks).MockBrowser;
const document = mock.getDocument();
const navigator = mock.getNavigator();

global.window = global;
global.document = document;
global.navigator = navigator;

document.createRange = function () {
    return {
        startNode: null, start: null, end: null, endNode: null,
        setStart: function (node, start) { this.startNode = node; this.start = start; },
        setEnd: function (node, end) { this.endNode = node, this.end = end; },
        getBoundingClientRect: function () { return null; }
    }
};

// cm needs a parent node to replace the text area
const cmContainer = document.createElement('div');
const cmTextArea = document.createElement('textarea');
cmContainer.appendChild(cmTextArea);
cmTextArea.value = '';

// ---- End CodeMirror wrapper ----


// CodeMirror requires and initialization
const CodeMirror = require('codemirror');
require('codemirror/addon/hint/show-hint');
require('codemirror/addon/lint/lint');
require('codemirror-graphql/hint');
require('codemirror-graphql/lint');
require('codemirror-graphql/mode');

const cm = CodeMirror.fromTextArea(cmTextArea, { mode: 'graphql'});
let cmCurrentDocValue = null;


// GraphQL requires
const graphqlLanguage = require('graphql/language');
const buildClientSchema = require('graphql/utilities/buildClientSchema').buildClientSchema;

// Schema commands
const getSchemaTokensAndAST = require('./schema').getSchemaTokensAndAST;

// prepare schema
const printSchema = require('graphql/utilities/schemaPrinter').printSchema;
const exampleSchemaJson = require('../schemas/builtin-schema.json');
const exampleSchema = buildClientSchema(exampleSchemaJson.data);

let schema = exampleSchema;
let schemaVersion = 0;
let schemaUrl = '';

// project
const project = require('./project');
project.onSchemaChanged({
    onSchemaChanged: function(newSchema, url) {
        if(newSchema && newSchema.data) {
            try {
                schema = buildClientSchema(newSchema.data);
                schemaVersion++;
                schemaUrl = url;
                let schemaJson = JSON.stringify(newSchema);
                if(schemaJson.length > 500) {
                    schemaJson = schemaJson.substr(0, 500) + " ...";
                }
                console.log("Loaded schema from '"+(url||'unknown')+"': " + schemaJson);
            } catch (e) {
                console.error("Error creating client schema", e);
            }
        } else {
            schema = exampleSchema;
            schemaVersion++;
        }
    }
});

// setup express endpoint for the language service and register the 'application/graphql' mime-type
const app = express();
app.use(bodyParser.json({limit: '32mb'}));
app.use(bodyParser.text({type: 'application/graphql' }));

app.all('/js-graphql-language-service', function (req, res) {

    let raw = req.get('Content-Type') == 'application/graphql';

    // prepare request data
    let requestData = {
        command: req.body.command || req.query.command || 'getTokens',
        relay: req.body.relay || req.query.relay == 'true',
        projectDir: req.body.projectDir || req.query.projectDir,
        buffer: (raw ? req.body : req.body.buffer || req.query.buffer) || '',
        line: parseInt(req.body.line || req.query.line || '0', 10),
        ch: parseInt(req.body.ch || req.query.ch || '0', 10),
    };


    // ---- Documentation and Project Commands ----

    if(requestData.command == 'getTypeDocumentation') {
        let typeName = req.body.type || req.query.type;
        let typeDoc = getTypeDocumentation(typeName)
        res.header('Content-Type', 'application/json');
        res.send(JSON.stringify(typeDoc));
        return;
    } else if(requestData.command == 'getFieldDocumentation') {
        let typeName = req.body.type || req.query.type;
        let fieldName = req.body.field || req.query.field;
        let fieldDoc = getFieldDocumentation(typeName, fieldName);
        res.header('Content-Type', 'application/json');
        res.send(JSON.stringify(fieldDoc));
        return;
    } else if(requestData.command == 'setProjectDir') {
        console.log("Setting Project Dir '"+requestData.projectDir+"'");
        project.setProjectDir(requestData.projectDir);
        res.header('Content-Type', 'application/json');
        res.send({projectDir:requestData.projectDir});
        return;
    } else if(requestData.command == 'getSchema') {
        res.header('Content-Type', 'text/plain');
        res.send(printSchema(schema));
        return;
    } else if(requestData.command == 'getSchemaWithVersion') {
        res.header('Content-Type', 'application/json');
        res.send(JSON.stringify({
            schema: printSchema(schema),
            queryType: (schema.getQueryType() || '').toString(),
            mutationType: (schema.getMutationType() || '').toString(),
            subscriptionType: (schema.getSubscriptionType() || '').toString(),
            url: schemaUrl,
            version: schemaVersion
        }));
        return;
    }


    // ---- CodeMirror Commands ----

    res.header('Content-Type', 'application/json');

    // update CodeMirror's text buffer
    let textToParse = requestData.buffer || '';


    // -- Relay templates --

    let relayContext = null;
    if(requestData.relay) {
        relayContext = relayTemplates.createRelayContext(textToParse);
        textToParse = relayTemplates.transformBufferAndRequestData(requestData, relayContext);
    }


    // -- Perform the requested command --

    if(cmCurrentDocValue != textToParse) {
        // only tell CM to re-parse if the doc has changed
        // TODO: only update changed areas of the text for performance
        cm.doc.setValue(textToParse);
        cmCurrentDocValue = textToParse;
    }

    let responseData = {};
    if(requestData.command == 'getTokens') {
        responseData = getTokens(cm, textToParse);
    } else if(requestData.command == 'getHints') {
        responseData = getHints(cm, requestData.line, requestData.ch);
    } else if(requestData.command == 'getTokenDocumentation') {
        responseData = getTokenDocumentation(cm, requestData.line, requestData.ch);
    } else if(requestData.command == 'getAnnotations') {
        responseData = getAnnotations(cm, textToParse);
    } else if(requestData.command == 'getAST') {
        responseData = getAST(textToParse);
    } else if(requestData.command == 'getSchemaTokensAndAST') {
        responseData = getSchemaTokensAndAST(textToParse);
    } else {
        responseData.error = 'Unknown command "'+requestData.command+'"';
    }

    if(requestData.relay && relayContext) {
        relayTemplates.transformResponseData(responseData, requestData.command, relayContext);
    }


    // -- send the response --

    res.send(JSON.stringify(responseData));
});


// ---- 'getTokens' command ----

const lineSeparator = cm.doc.lineSeparator();
const lineSeparatorLength = lineSeparator.length;

function getTokens(cm, textToParse) {
    let tokens = [];
    let lineNum = 0;
    let lineCount = cm.lineCount();
    let lineTokens = cm.getLineTokens(lineNum, true);
    let lineStartPos = 0;

    while (lineNum < lineCount) {
        for (let i = 0; i < lineTokens.length; i++) {
            let token = lineTokens[i];
            let state = token.state;
            let tokenRet = {
                text: token.string,
                type: token.type || 'ws',
                start: lineStartPos + token.start,
                end: lineStartPos + token.end,
                scope: (state.levels||[]).length,
                kind: state.kind
            };

            if(tokenRet.type == 'ws' && tokenRet.text == ',') {
                if(tokenRet.text == ',') {
                    // preserve the commas
                    tokenRet.type = 'punctuation';
                }
            }

            if(tokenRet.type == 'string') {
                // we need separate tokens for the string contents and the surrounding quotes to auto-close quotes in intellij
                let text = tokenRet.text;
                let openQuote = Object.assign({}, tokenRet, {type: 'open_quote', text:'"', end: tokenRet.start + 1});
                let closeQuote = Object.assign({}, tokenRet, {type:'close_quote', text:'"', start: tokenRet.end - 1});
                tokens.push(openQuote);
                if(text.charAt(0)=='"') {
                    tokenRet.start++;
                }
                let hasCloseQuote = (text.length > 1 && text.charAt(text.length-1)=='"');
                if(hasCloseQuote) {
                    tokenRet.end--;
                }
                if(tokenRet.start != tokenRet.end) {
                    tokenRet.text = text.substring(1, text.length - (hasCloseQuote ? 1 : 0));
                    tokens.push(tokenRet);
                }
                if(hasCloseQuote) {
                    tokens.push(closeQuote);
                }
            } else {
                tokens.push(tokenRet);
            }

        }
        lineStartPos += cm.getLine(lineNum).length + lineSeparatorLength;
        lineNum++;
        if(lineNum < lineCount) {
            // insert a line break token
            tokens.push({
                text: lineSeparator,
                type: 'ws',
                start: lineStartPos - lineSeparatorLength,
                end: lineStartPos
            });
        }
        lineTokens = cm.getLineTokens(lineNum, true);
    }
    if(tokens.length == 0 && textToParse) {
        // didn't get any tokens from the graphql codemirror mode
        return null;
    }
    return {tokens: tokens};
}


// ---- 'getHints' command ----

const isRelayType = function(type) {
    if(type) {
        let typeName = type.toString();
        if(typeName == 'Node' || typeName == 'PageInfo!' || typeName.indexOf('Edge]')!=-1 || typeName.indexOf('Connection')!=-1) {
            return true;
        }
        let interfaces = type.getInterfaces ? type.getInterfaces() : null;
        if(interfaces) {
            for(let i = 0; i < interfaces.length; i++) {
                let interfaceName = interfaces[i].toString();
                if(interfaceName == 'Node') {
                    return true;
                }
            }
        }
    }
    return false;
};

const hintHelper = cm.getHelper({line: 0, ch: 0}, 'hint');
function getHints(cm, line, ch, fullType, tokenName) {
    if(hintHelper) {

        // move cursor to location of the hint
        cm.setCursor(line, ch, {scroll:false});

        let hints = hintHelper(cm, { schema: schema });
        if(hints && hints.list) {
            if(tokenName) {
                let list = hints.list;
                hints.list = [];
                for(let i = 0; i < list.length; i++) {
                    if(list[i].text == tokenName) {
                        hints.list.push(list[i]);
                        break;
                    }
                }
            }
            // remove the type property since it can contain circular GraphQL type references
            hints.list.forEach(function(hint) {
                if(hint.type) {
                    if(fullType) {
                        hint.fullType = hint.type;
                    }
                    hint.description = hint.description || hint.type.description;
                    hint.relay = isRelayType(hint.type);
                    hint.type = hint.type.toString();
                }
            });
            // add the from/to of the text span to remove before inserting the completion
            return {
                hints: hints.list,
                from: hints.from,
                to: hints.to
            }
        }
        // empty result
        return { hints: [], from: null, to: null };
    }
    return {}
}


// ---- 'getTypeDocumentation' command ----

function _getSchemaType(typeName) {
    let type = schema.getTypeMap()[typeName];
    if(!type) {
        if(typeName == 'Query') {
            type = schema.getQueryType();
        } else if(typeName == 'Mutation') {
            type = schema.getMutationType();
        } else if(typeName == 'Subscription') {
            type = schema.getSubscriptionType();
        }
    }
    return type;
}

function getTypeDocumentation(typeName) {
    let ret = {};
    let type = _getSchemaType(typeName);
    if(type) {
        let interfaces = type.getInterfaces ? type.getInterfaces() : [];
        let fields = type.getFields ? type.getFields() : {};
        let fieldsList = [];
        for (let f in fields) {
            fieldsList.push(fields[f]);
        }
        let implementations = type.getPossibleTypes ? type.getPossibleTypes() : [];

        ret = {
            type: type.toString(),
            description: type.description,
            interfaces : interfaces.map(function(intf) {
                return intf.toString();
            }),
            implementations: implementations.map(function(impl) {
                return impl.toString();
            }),
            fields: fieldsList.map(function(field) {
                return {
                    name: field.name,
                    args: (field.args || []).map(function(arg) {
                        return {
                            name: arg.name,
                            type: arg.type.toString(),
                            description: arg.description
                        }
                    }),
                    type: field.type.toString(),
                    description: field.description
                };
            })
        }
    }
    return ret;
}


// ---- 'getFieldDocumentation' command ----

function getFieldDocumentation(typeName, fieldName) {
    let doc = {};
    let type = _getSchemaType(typeName);
    if(type) {
        let fields = type.getFields ? type.getFields() : {};
        let field = fields[fieldName];
        if(field) {
            doc.type = field.type.toString();
            doc.description = field.description;
        }
    }
    return doc;
}


// ---- 'getTokenDocumentation' command ----

function getTokenDocumentation(cm, line, ch) {
    let doc = {};
    let token = cm.getTokenAt({line:line, ch: ch + 1/*if we don't +1 cm will return the token that ends at ch */}, true);
    if(token && token.state) {
        let tokenText = token.state.name;
        let hintsRes = getHints(cm, line, ch, true, tokenText);
        if(hintsRes && hintsRes.hints) {
            let matchingHint = null;
            hintsRes.hints.forEach(function(hint) {
                if(hint.text == tokenText) {
                    matchingHint = hint;
                }
            });
            if(matchingHint) {
                let type = matchingHint.fullType;
                if(type) {
                    doc.type = type.toString();
                    doc.description = matchingHint.description;
                }

            }
        }
    }

    return doc;
}


// ---- 'getAnnotations' command ----

const lintHelper = cm.getHelper({line: 0, ch: 0}, 'lint');
function getAnnotations(cm, text) {
    if(lintHelper) {
        let annotations = lintHelper(text, { schema: schema }, cm);
        if(annotations) {
            let ranges = {};
            let uniqueAnnotations = [];
            annotations.forEach(ann => {
                try {
                    let range = ann.from.line + ":" + ann.from.ch + "-" + ann.to.line + ":" + ann.to.ch
                    if(!ranges[range]) {
                        uniqueAnnotations.push(ann);
                        ranges[range] = ann;
                    }
                } catch (e) {
                    console.error('Unable to determine range for annotation', ann, e);
                }
            });
            return {
                annotations: uniqueAnnotations
            }
        }
    }
    return {}
}


// ---- 'getAST' command ----

function getAST(text) {
    try {
        let ast = graphqlLanguage.parse(text, {noSource: true});
        return ast;
    } catch (e) {
        return {error: e, locations: e.locations, nodes: e.nodes};
    }
}


module.exports = app;