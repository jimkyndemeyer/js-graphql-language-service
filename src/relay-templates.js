/**
 *  Copyright (c) 2015-present, Jim Kynde Meyer
 *  All rights reserved.
 *
 *  This source code is licensed under the MIT license found in the
 *  LICENSE file in the root directory of this source tree.
 */
'use strict';
const HashMap = require('hashmap');

const comment = '#'.charCodeAt(0);
const ws = ' '.charCodeAt(0);
const newLine = '\n'.charCodeAt(0);
const templateMark = '$'.charCodeAt(0);
const templateLBrace = '{'.charCodeAt(0);
const templateRBrace = '}'.charCodeAt(0);

const typeName = '__typename';
const typeNameLength = typeName.length;

const relayTemplatePlaceHolder = '____';
const fragmentNamePlaceHolder = '____';
const fragmentNamePlaceHolderReplaceLength = fragmentNamePlaceHolder.length + 1; // +1 for ws after during replacement

const anonOperationNotAloneMessage = require('graphql/validation/rules/LoneAnonymousOperation').anonOperationNotAloneMessage();
const unusedFragMessage = require('graphql/validation/rules/NoUnusedFragments').unusedFragMessage(fragmentNamePlaceHolder);
const uniqueFragmentNames = require('graphql/validation/rules/UniqueFragmentNames').duplicateFragmentNameMessage(fragmentNamePlaceHolder);
const scalarLeafs = require('graphql/validation/rules/ScalarLeafs').requiredSubselectionMessage(relayTemplatePlaceHolder, relayTemplatePlaceHolder);
const noUndefinedVariables  = require('graphql/validation/rules/NoUndefinedVariables').undefinedVarMessage(relayTemplatePlaceHolder);

const relayValidationFilters = [
    (msg) => msg != anonOperationNotAloneMessage,
    (msg) => msg != uniqueFragmentNames,
    (msg) => msg.replace(/"[^"]+"/, '"'+fragmentNamePlaceHolder+'"') != unusedFragMessage,
    (msg) => msg.replace(/"[^"]+"/g, '"'+relayTemplatePlaceHolder+'"') != scalarLeafs,
    (msg) => msg.replace(/"[^"]+"/g, '"$'+relayTemplatePlaceHolder+'"') != noUndefinedVariables,
    (msg) => msg != 'Unknown directive "relay".',
    (msg) => msg.indexOf('"'+fragmentNamePlaceHolder+'"') == -1 // never show the placeholder errors (which should be caused by some other error)
];

module.exports = {

    /**
     * Creates a relay context that tracks any transformation made to the incoming buffer and request data
     */
    createRelayContext : function(textToParse) {
        return {
            textToParse: textToParse,
            shifts: [],
            templateFromPosition : new HashMap()
        };
    },

    /** Relay uses a shorthand "fragment on Foo" which doesn't follow the GraphQL spec, so we need to name the fragment to follow the grammar.
     * This means that once we insert additional text into the buffer, we need to 'unshift' tokens/annotations later in transformResponseData.
     */
    transformBufferAndRequestData : function(requestData, relayContext) {

        // first take care of the ${...} templates expressions
        this._transformTemplates(relayContext);

        // then apply any shifts, i.e. token insertions, to conform with the GraphQL grammar, e.g. 'fragment on Foo' -> 'fragment <name> on Foo'
        let graphQL = this._transformToGraphQL(relayContext);

        // finally transform the request data to align with the transformations that were applied to the original buffer
        this._transformRequestData(requestData, relayContext);

        return graphQL;
    },

    /**
     * Transforms the buffer into valid GraphQL, e.g. 'fragment on Foo' -> 'fragment <name> on Foo'
     */
    _transformToGraphQL : function(relayContext) {
        let baseOffset = 0;
        let transformedBuffer = relayContext.templatedTextToParse.replace(/(fragment[\s]+)(on)/g, (match, p1, p2, offset) => {
            relayContext.shifts.push({pos: baseOffset + offset + p1.length, length: fragmentNamePlaceHolderReplaceLength});
            baseOffset += fragmentNamePlaceHolderReplaceLength;
            return p1 + fragmentNamePlaceHolder + ' ' + p2;
        });
        relayContext.relayGraphQL = transformedBuffer;
        return transformedBuffer;
    },

    /**
     * Inline replace JS template expressions (e.g. ${Component.getFragment('viewer')}) with a '#{...}' comment or placeholder '__typename<remaining-white-space>'
     * The transformed text is assigned to 'templatedTextToParse' on the context
     */
    _transformTemplates : function(relayContext) {

        let templateFromPosition = relayContext.templateFromPosition;
        let templateBuffer = new Buffer(relayContext.textToParse);

        let line = 0;
        let column = 0;

        for (let i = 0; i < templateBuffer.length; i++) {
            let c = templateBuffer[i];
            switch (c) {
                case newLine:
                    line++;
                    column = 0;
                    break;
                default:
                    column++;
            }
            if (c == templateMark) {
                let next = templateBuffer[Math.min(i + 1, templateBuffer.length - 1)];
                if (next == templateLBrace) {
                    // found the start of a template expression, so replace it as '${...}' -> '__typename<remaining-white-space>' to make sure
                    // we have an 'always' valid SelectionSet when the template is the only selected field, e.g. in Relay injections
                    let templatePos = i;
                    for (let t = i + 1; t < templateBuffer.length; t++) {
                        var isNewLine = (templateBuffer[t] == newLine);
                        if (isNewLine || templateBuffer[t] == templateRBrace) {
                            // we're at the closing brace or new line
                            i = t;
                            if(isNewLine) {
                                i--; //backtrack to not include the new-line into the template
                            }
                            // store the original token text for later application in getTokens
                            templateFromPosition.set(templatePos, relayContext.textToParse.substring(templatePos, i + 1));
                            this._insertTypeNameWithPaddingOrComment(templateBuffer, templatePos, i);
                            break;
                        }
                    }
                }
            }
        }

        relayContext.templatedTextToParse = templateBuffer.toString();

    },

    /**
     * Makes sure we have at least one field selected in a SelectionSet, e.g. 'foo { ${Component.getFragment} }'.
     * If we can't fit the field inside the template expression, we change it to a temporary comment, ie. '${...}' -> '#{...}'
     */
    _insertTypeNameWithPaddingOrComment : function(buffer, startPos, endPos) {
        if(endPos - startPos < typeNameLength) {
            // can't fit the field inside the template expression so use a comment for now (expecting the user to keep typing)
            buffer[startPos] = comment;
            return;
        }
        if(startPos + typeNameLength >= buffer.length) {
            // cant fit the field inside the remaining buffer
            buffer[startPos] = comment;
            return;
        }
        let t = 0;
        for(let i = startPos; i < buffer.length; i++) {
            buffer[i] = typeName.charCodeAt(t++);
            if(t == typeNameLength) {
                // at end of typeName, so fill with ws to not upset token positions
                let w = i + 1;
                while(w < buffer.length && w <= endPos) {
                    buffer[w] = ws;
                    w++;
                }
                break;
            }
        }
    },

    /**
     * Transforms any positions as part of the request data based on the shifts made to the buffer
     */
    _transformRequestData : function(requestData, relayContext) {
        if(requestData.command == 'getHints' || requestData.command == 'getTokenDocumentation') {
            if(relayContext.shifts.length > 0) {
                let shiftsByLine = this._getShiftsByLines(relayContext, requestData.line);
                let shifts = shiftsByLine.get(requestData.line);
                if(shifts) {
                    shifts.forEach((shift) => {
                        // move the line cursor to the right to place it after the inserted tokens added during a shift
                        if(requestData.ch > shift.pos) {
                            requestData.ch += shift.length;
                        }
                    })
                }
            }
        }
    },

    _getShiftsByLines : function(relayContext, breakAtLine) {
        let shiftsByLine = new HashMap();
        let buffer = relayContext.relayGraphQL;
        let shiftIndexRef = {value: 0};
        let line = 0;
        for(let i = 0; i < buffer.length; i++) {
            let c = buffer.charCodeAt(i);
            if(c == newLine) {
                // get shifts for current line
                let lineShifts = this._getShifts(relayContext.shifts, shiftIndexRef, i);
                if(lineShifts != null) {
                    if(lineShifts.length > 0) {
                        shiftsByLine.set(line, lineShifts);
                    }
                } else {
                    // null indicates no more shifts
                    break;
                }
                if(breakAtLine && breakAtLine == line) {
                    break;
                }
                line++
            }
        }
        if(line == 0) {
            // no newlines encountered, so all the shifts belong to line 0
            shiftsByLine.set(0, relayContext.shifts);
        }
        return shiftsByLine;
    },

    _getShifts: function(shifts, shiftIndexRef, beforePos) {
        if(shiftIndexRef.value > shifts.length - 1) {
            // no more shifts
            return null
        }
        let ret = [];
        while(shiftIndexRef.value < shifts.length) {
            let shift = shifts[shiftIndexRef.value];
            if(shift.pos < beforePos) {
                ret.push(shift);
                shiftIndexRef.value++;
            } else {
                break;
            }
        }
        return ret;
    },

    /**
     * Reverses the transformation such that positions of returned tokens, error annotations etc. line up with the original text to parse.
     * Also restores any template tokens back to their original text.
     */
    transformResponseData: function(responseData, command, relayContext) {
        let shifts = relayContext.shifts;
        let hasShifts = shifts.length > 0;
        let templateFromPosition = relayContext.templateFromPosition;
        let hasTemplates = templateFromPosition.count() > 0;

        if(command == 'getTokens') {
            if(responseData.tokens && responseData.tokens.length > 0) {

                let tokensForOriginalBuffer = [];

                let shiftIndex = 0;
                let shiftDelta = 0;
                let shiftPos = hasShifts ? shifts[0].pos : null;

                for(let t = 0; t < responseData.tokens.length; t++) {

                    let token = responseData.tokens[t];

                    // apply shifts
                    if(hasShifts) {
                        if (token.start == shiftPos) {
                            // we shifted at this point by inserting one or more tokens, and we don't want them to appear in the response
                            shiftDelta += shifts[shiftIndex].length;
                            let skipTokensToPos = shiftPos + shifts[shiftIndex].length;
                            while (token.end < skipTokensToPos) {
                                t++;
                                token = responseData.tokens[t];
                            }
                            shiftIndex++;
                            if (shiftIndex < shifts.length) {
                                shiftPos = shifts[shiftIndex].pos;
                            } else {
                                shiftPos = -1; // no more shifts
                            }
                            token = null; // don't add the last token that made up the shift
                        } else {
                            // move the token back into its position before the shift
                            if (shiftDelta > 0) {
                                token.start -= shiftDelta;
                                token.end -= shiftDelta;
                            }
                        }
                    }

                    // restore template fragments
                    if(hasTemplates && token) {
                        let template = templateFromPosition.get(token.start);
                        if (template) {
                            if (token.type != 'comment') { // no merge on comments since they fill up their lines
                                let hasPadding = token.text.length < template.length;
                                if (hasPadding) {
                                    // we padded the template replacement, so merge the next ws token with this one
                                    token.end = token.start + template.length
                                    t++; // and skip it
                                }
                            }
                            token.text = template;
                            token.type = 'template-fragment';
                            if (token.text.length != token.end - token.start) {
                                console.error('Template replacement produced invalid token text range', token);
                            }
                        }
                    }

                    if(token) {
                        tokensForOriginalBuffer.push(token);
                    }

                }

                responseData.tokens = tokensForOriginalBuffer;
            }
        } else if(command == 'getAnnotations') {
            if(responseData.annotations && responseData.annotations.length > 0) {
                if(hasShifts) {
                    let shiftsByLine = this._getShiftsByLines(relayContext);
                    for (let i = 0; i < responseData.annotations.length; i++) {
                        let annotation = responseData.annotations[i];
                        let shiftsToApply = shiftsByLine.get(annotation.from.line);
                        if (shiftsToApply) {
                            shiftsToApply.forEach((shift) => {
                                annotation.from.ch -= shift.length;
                                annotation.to.ch -= shift.length;
                            });
                        }
                    }
                }
                responseData.annotations = this._filterAnnotations(responseData.annotations);
            }
        } else if(command == 'getHints') {
            // strip the '{' completion according to https://facebook.github.io/relay/docs/api-reference-relay-ql.html
            if(responseData.hints) {
                let relayHints = [];
                responseData.hints.forEach(hint => {
                    if(hint.text != '{') {
                        relayHints.push(hint);
                    }
                });
                responseData.hints = relayHints;

            }
        }

    },

    /**
     * Filters annotations for injected Relay GraphQL document-fragment
     */
    _filterAnnotations : function(annotations) {
        let relayAnnotations = annotations.filter((annotation) =>
            relayValidationFilters.every((filter) => filter(annotation.message))
        );
        return relayAnnotations;
    }
};