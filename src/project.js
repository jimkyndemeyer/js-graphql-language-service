/**
 *  Copyright (c) 2015, Jim Kynde Meyer
 *  All rights reserved.
 *
 *  This source code is licensed under the MIT license found in the
 *  LICENSE file in the root directory of this source tree.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const filewatcher = require('filewatcher');
const request = require('then-request');
const configFileName = 'graphql.config.json';
const introspectionQuery = require('graphql/utilities/introspectionQuery').introspectionQuery;
const project = {

    projectDir: null,
    projectFile : null,
    schemaFile: null,
    schemaUrl: null,
    watcher : null,
    schemaChangedCallbacks : [],

    setProjectDir : function(projectDir) {

        this.projectDir = projectDir;
        this.projectFile = path.join(projectDir, configFileName);
        this.schemaFile = null;
        this.schemaUrl = null;

        if(this.watcher) {
            this.watcher.removeAll();
        }

        // create watcher and register change handler
        this.watcher = filewatcher({
            forcePolling: false,
            debounce: 500,
            interval: 1000,
            persistent: false
        });

        this._watch(this.projectDir);
        if(this._fileExists(this.projectFile)) {
            this._watch(this.projectFile, true);
        }

        this.watcher.on('change', function(file, stat) {
            if(file == this.projectDir) {
                if(this.schemaFile == null && this.schemaUrl == null) {
                    // something changed in the project dir, and we don't have a schema, so see if we can load one
                    this._loadSchema();
                    if(this._fileExists(this.projectFile)) {
                        this._watch(this.projectFile, true);
                    }
                }
            } else if(file == this.projectFile || file == this.schemaFile) {
                if (stat && !stat.deleted) {
                    // file created or modified
                    this._loadSchema();
                } else {
                    // file deleted
                    this._sendSchemaChanged(null);
                }
            }
        }.bind(this));

        this._loadSchema();

    },

    _watch : function(file, log) {
        log = !this.watcher.watchers[file] && log;
        this.watcher.add(file);
        if(log) {
            console.log("Watching '" + file + "' for changes.");
        }
    },

    onSchemaChanged : function(callback) {
        this.schemaChangedCallbacks.push(callback);
    },

    _loadJSON : function(fileName) {
        try {
            var jsonString = fs.readFileSync(fileName, 'utf8');
            if(jsonString) {
                return JSON.parse(jsonString);
            }
        } catch(e) {
            console.error('Unable to load JSON from "'+fileName+"'", e);
        }
        return {};
    },

    _fileExists : function (file) {
        try {
            fs.accessSync(this.projectFile, fs.R_OK);
            return true;
        } catch (ignored) {
            // no file to read
        }
        return false;
    },

    _loadSchema : function() {
        try {
            if(!this._fileExists(this.projectFile)) {
                return;
            }
            let config = this._loadJSON(this.projectFile);
            if(config && config.schema) {
                let schemaConfig = config.schema;
                if(schemaConfig.file) {
                    try {
                        let schemaFile = path.isAbsolute(schemaConfig.file) ? schemaConfig.file : path.join(this.projectDir, schemaConfig.file);
                        let schema = this._loadJSON(schemaFile);
                        if(schema && schema.data) {
                            this.schemaFile = schemaFile;
                            this._watch(schemaFile, true);
                            this._sendSchemaChanged(schema, schemaFile);
                            return;
                        }
                    } catch(e) {
                        console.error("Couldn't load schema", e);
                    }

                } else if(schemaConfig.request && schemaConfig.request.url) {

                    try {
                        // need to do a network request to fetch the schema
                        let schemaRequestConfig = schemaConfig.request;
                        let doIntrospectionQuery = schemaRequestConfig.postIntrospectionQuery;
                        let method = doIntrospectionQuery ? 'POST' : schemaRequestConfig.method || 'GET';
                        if(doIntrospectionQuery) {
                            schemaRequestConfig.options = schemaRequestConfig.options || {};
                            schemaRequestConfig.options.headers = schemaRequestConfig.options.headers || {};
                            schemaRequestConfig.options.headers['Content-Type'] = 'application/json';
                            schemaRequestConfig.options.body = JSON.stringify({query: introspectionQuery});
                        }
                        request(method, schemaRequestConfig.url, schemaRequestConfig.options).then((schemaResponse) => {
                            if (schemaResponse.statusCode == 200) {
                                let schemaBody = schemaResponse.getBody('utf-8');
                                let schema = JSON.parse(schemaBody);
                                if(schema && schema.data) {
                                    this.schemaUrl = schemaRequestConfig.url;
                                    this._sendSchemaChanged(schema, schemaRequestConfig.url);
                                }
                            } else {
                                console.error("Error loading schema from '"+schemaRequestConfig.url+"'", schemaResponse, schemaConfig.request);
                                this._sendSchemaChanged(null);
                            }
                        }).catch((error) => {
                            console.error("Error loading schema from '"+schemaRequestConfig.url+"'", error, schemaConfig.request);
                        });
                    } catch (e) {
                        console.error("Couldn't load schema using request config", e, schemaConfig.request);
                    }
                    return;
                }
            }
        } catch (e) {
            console.error("Error loading schema from '" + this.projectFile + "'", e);
        }
        // fallback is no schema
        this._sendSchemaChanged(null);
    },

    _sendSchemaChanged : function(newSchema, url) {
        try {
            this.schemaChangedCallbacks.forEach(cb => cb.onSchemaChanged(newSchema, url));
        } catch (e) {
            console.error('Error signalling schema change', e);
        }
    }


};

module.exports = project;