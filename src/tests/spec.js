/**
 *  Copyright (c) 2015-present, Jim Kynde Meyer
 *  All rights reserved.
 *
 *  This source code is licensed under the MIT license found in the
 *  LICENSE file in the root directory of this source tree.
 */
'use scrict';

const request = require('supertest');
const app = require('../languageservice');
const fs = require('fs');
const path = require('path');

const url = '/js-graphql-language-service';


describe('GET /js-graphql-language-service', function(){
    it('responds with json', function(done){
        request(app)
            .get(url)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200, done);
    })
});


const getTokensGraphQL = fs.readFileSync(require.resolve('./data/getTokens.graphql'), 'utf-8');
describe('getTokens', function(){
    it('responds with expected tokens', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getTokens', buffer: getTokensGraphQL})
            .expect(require('./data/getTokens.json'))
            .expect(200, done);
    })
});


describe('getHints for Type', function(){
    it('responds with expected hint', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getHints', buffer: 'fragment foo on User { id }', line: 0, ch: 16 /* before 'User' */})
            .expect(require('./data/getHintsForType.json'))
            .expect(200, done);
    })
});


describe('getHints for Field', function(){
    it('responds with expected hint', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getHints', buffer: 'fragment F on __Schema { types }', line: 0, ch: 25 /* before 'types' */})
            .expect(require('./data/getHintsForField.json'))
            .expect(200, done);
    })
});


describe('getTokenDocumentation', function(){
    it('responds with expected doc', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getTokenDocumentation', buffer: 'fragment F on __Schema { types }', line: 0, ch: 25})
            .expect(require('./data/getTokenDocumentation.json'))
            .expect(200, done);
    })
});


describe('getTypeDocumentation', function(){
    it('responds with expected doc', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getTypeDocumentation', type: '__Schema'})
            .expect(require('./data/getTypeDocumentation.json'))
            .expect(200, done);
    })
});

const getAnnotationsGraphQL = fs.readFileSync(require.resolve('./data/getAnnotations.graphql'), 'utf-8');
describe('getAnnotations', function(){
    it('responds with expected annotations', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getAnnotations', buffer: getAnnotationsGraphQL})
            .expect(require('./data/getAnnotations.json'))
            .expect(200, done);
    })
});

describe('getAST', function(){
    it('responds with expected AST', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getAST', buffer: getAnnotationsGraphQL})
            .expect(require('./data/getAST.json'))
            .expect(200, done);
    })
});

const getSchemaText = fs.readFileSync(require.resolve('./data/getSchema.txt'), 'utf-8');
describe('getSchema', function(){
    it('responds with expected schema', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getSchema'})
            .expect(getSchemaText)
            .expect(200, done);
    })
});


// ---- Relay.QL tagged templates ----

const templateFragment1GraphQL = fs.readFileSync(require.resolve('./data/relay/templateFragment1.graphql'), 'utf-8');
describe('getTokens relay template fragments #1', function(){
    it('responds with expected tokens', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getTokens', buffer: templateFragment1GraphQL, env: 'relay'})
            .expect(require('./data/relay/templateFragment1.json'))
            .expect(200, done);
    })
});

const templateFragment2GraphQL = fs.readFileSync(require.resolve('./data/relay/templateFragment2.graphql'), 'utf-8');
describe('getTokens relay template fragments #2', function(){
    it('responds with expected tokens', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getTokens', buffer: templateFragment2GraphQL, env: 'relay'})
            .expect(require('./data/relay/templateFragment2.json'))
            .expect(200, done);
    })
});

describe('getTokens relay template fragments #3', function(){
    it('responds with expected tokens', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getTokens', buffer: "\n            fragment on Todo @relay(plural: true) {\n                id,\n                ${Todo.getFragment('todo')},\n            }\n        ", env: 'relay'})
            .expect(require('./data/relay/templateFragment3.json'))
            .expect(200, done);
    })
});

describe('getTokens relay template fragments #4', function(){
    it('responds with expected tokens', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getTokens', buffer: "\n            fragment on Todo @relay(plural: true) {\n                id,\n                ${Todo.getFragment('todo', {foo: 'bar'})},\n            }\n        ", env: 'relay'})
            .expect(require('./data/relay/templateFragment4.json'))
            .expect(200, done);
    })
});

describe('getTokens relay comment before fragment', function(){
    it('responds with expected tokens', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getTokens', buffer: "\n#            fragment on Ship {\n                id @include(if: true)\n                name\n            }\n        ", env: 'relay'})
            .expect(require('./data/relay/commentBeforeFragment.json'))
            .expect(200, done);
    })
});

describe('getTokens multiple place holders per line', function(){
    it('responds with valid token ranges', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getTokens', buffer: "{ nodes(first: ${10}, foo: ${100}) { id } }", env: 'relay'})
            .expect(require('./data/relay/multiplePlaceholdersPerLine.json'))
            .expect(200, done);
    })
});


// ---- TodoApp project ----

const todoAppProjectDir = path.join(__dirname, './data/projects/todoapp/');
describe('setting projectDir to Todo App', function(){
    it('responds with the watched project directory', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'setProjectDir', projectDir: todoAppProjectDir})
            .expect(JSON.stringify({projectDir: todoAppProjectDir }))
            .expect(200, done);
    })
});

const getTodoAppSchemaText = fs.readFileSync(require.resolve('./data/projects/todoapp/todoAppExpectedSchema.txt'), 'utf-8');
describe('getSchema with TodoApp project dir set', function(){
    it('responds with the TodoApp schema', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getSchema'})
            .expect(getTodoAppSchemaText)
            .expect(200, done);
    })
});

describe('getTokens for schema buffer', function(){
    it('responds with expected tokens', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getTokens', buffer: getTodoAppSchemaText})
            .expect(require('./data/projects/todoapp/getSchemaTokens.json'))
            .expect(200, done);
    })
});

const getRelayAnnotationsGraphQL = fs.readFileSync(require.resolve('./data/projects/todoapp/getAnnotations.graphql'), 'utf-8');
describe('Relay getAnnotations', function(){
    it('responds with filtered annotations', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getAnnotations', buffer: getRelayAnnotationsGraphQL, env: 'relay'})
            .expect({ annotations: []})
            .expect(200, done);
    })
});

const getApolloAnnotationsGraphQL = fs.readFileSync(require.resolve('./data/projects/todoapp/getApolloAnnotations.graphql'), 'utf-8');
describe('Apollo getAnnotations', function(){
    it('responds with filtered annotations', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getAnnotations', buffer: getApolloAnnotationsGraphQL, env: 'apollo'})
            .expect({ annotations: []})
            .expect(200, done);
    })
});

const getLokkaAnnotationsGraphQL = fs.readFileSync(require.resolve('./data/projects/todoapp/getLokkaAnnotations.graphql'), 'utf-8');
describe('Lokka getAnnotations', function(){
    it('responds with filtered annotations', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getAnnotations', buffer: getLokkaAnnotationsGraphQL, env: 'lokka'})
            .expect({ annotations: []})
            .expect(200, done);
    })
});

// ---- TodoApp Relay Modern project ----

const todoAppModernProjectDir = path.join(__dirname, './data/projects/todoapp-modern/');
describe('setting projectDir to Todo App modern', function(){
    it('responds with the watched project directory', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'setProjectDir', projectDir: todoAppModernProjectDir})
            .expect(JSON.stringify({projectDir: todoAppModernProjectDir }))
            .expect(200, done);
    })
});

const getTodoAppModernSchemaText = fs.readFileSync(require.resolve('./data/projects/todoapp-modern/todoAppModernExpectedSchema.txt'), 'utf-8');
describe('getSchema with TodoApp modern project dir set', function(){
    it('responds with the TodoApp schema', function(done){
        request(app)
            .post(url)
            .set('Content-Type', 'application/json')
            .send({ command: 'getSchema'})
            .expect(getTodoAppModernSchemaText)
            .expect(200, done);
    })
});
