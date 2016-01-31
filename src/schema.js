/**
 *  Copyright (c) 2015-present, Jim Kynde Meyer
 *  All rights reserved.
 *
 *  This source code is licensed under the MIT license found in the
 *  LICENSE file in the root directory of this source tree.
 */
'use strict';

// ---- 'getSchemaTokensAndAST' command ----

const HashMap = require('hashmap');

const graphqlLanguage = require('graphql/language');
const Kinds = require('graphql/language/kinds');
const Source = require('graphql/language/source').Source;
const lexer = require('graphql/language/lexer');
const visit = require('graphql/language/visitor').visit;
const lex = lexer.lex;
const getTokenKindDesc = lexer.getTokenKindDesc;
const TokenKind = lexer.TokenKind;
const Stack = require('stackjs');

function getSchemaTokensAndAST(schemaBuffer) {

    let source = new Source(schemaBuffer, 'schema');
    let ast = {definitions:[]};
    let nodeScope = new Stack();
    let astNodeFromLoc = new HashMap();
    try {
        ast = graphqlLanguage.parse(schemaBuffer, {noSource: true});
        visit(ast, {
            enter: node => {
                let parent = nodeScope.isEmpty() ? null : nodeScope.peek();
                nodeScope.push(node);
                if(node.name) {
                    astNodeFromLoc.set(node.name.loc.start, { node: node, parent: parent });
                }
            },
            leave: node => {
                nodeScope.pop();
            }
        });
    } catch(e) {
        console.error('Unable to build schema AST', e)
    }
    let lexerFunc = lex(source);
    let token = lexerFunc();
    let tokens = [];
    let pos = 0;
    while(token.kind != TokenKind.EOF) {
        if(pos < token.start) {
            // add ws token that the lexer doesn't output
            tokens.push({
                text: schemaBuffer.substring(pos, token.start),
                type: 'ws',
                start: pos,
                end: token.start
            });
        }

        let text = token.value || getTokenKindDesc(token.kind); // punctuation tokens from the lexer don't have values
        let typeAndKind = getSchemaTokenTypeAndKind(token, astNodeFromLoc);
        if(typeAndKind.type == 'string') {
            // we need to add the quotes on strings for the token length to match the start and end positions
            text = '"' + text + '"';
        }
        tokens.push({
            text: text,
            type: typeAndKind.type,
            start: token.start,
            end: token.end,
            kind: typeAndKind.kind
        });
        pos = token.end;
        token = lexerFunc();
    }
    // add trailing ws if needed to ensure tokes cover buffer
    if(pos < schemaBuffer.length) {
        tokens.push({
            text: schemaBuffer.substring(pos, schemaBuffer.length),
            type: 'ws',
            start: pos,
            end: schemaBuffer.length
        });
    }

    return {
        tokens: tokens,
        ast: ast
    };
}


function getSchemaTokenTypeAndKind(token, astNodeFromLoc) {
    switch (token.kind) {
        case TokenKind.NAME:
            // keywords
            switch (token.value) {
                case 'type':
                case 'interface':
                case 'union':
                case 'scalar':
                case 'enum':
                case 'implements':
                    return { type: 'keyword' };
                case 'input':
                    let parent = (astNodeFromLoc.get(token.start) || {}).parent;
                    if(parent && parent.kind == Kinds.FIELD_DEFINITION) {
                        // input within a field definition is an attribute
                        return { type: 'attribute' };
                    }
                    return { type: 'keyword' };
            }
            // non-keyword, so use the ast to find out what the name represents in terms of type and kind
            return resolveTokenTypeAndKind(token, astNodeFromLoc);
        case TokenKind.STRING:
            return { type: 'string' };
        case TokenKind.INT:
        case TokenKind.FLOAT:
            return { type: 'number' };
        default:
            return { type: 'punctuation' };
    }
}

function resolveTokenTypeAndKind(token, astNodeFromLoc) {

    let nodeFromLoc = astNodeFromLoc.get(token.start);
    if(nodeFromLoc) {
        let node = nodeFromLoc.node;
        let parent = nodeFromLoc.parent;
        let type = '';
        switch(node.kind) {
            case Kinds.FIELD_DEFINITION:
                type = 'property';
                break;
            case Kinds.NAMED_TYPE:
                type = 'atom';
                break;
            case Kinds.INPUT_VALUE_DEFINITION:
                if(parent && parent.kind == Kinds.FIELD_DEFINITION) {
                    type = 'attribute';
                } else {
                    type = 'property';
                }
                break;
            default:
                type = 'def';
                break;
        }
        return { type: type, kind: node.kind }
    }
    return { type: '' };
}

module.exports = {
    getSchemaTokensAndAST: getSchemaTokensAndAST
};