# JS GraphQL Language Service

A Node.js powered language service that provides a GraphQL language API on top of [codemirror-graphql](https://github.com/graphql/codemirror-graphql) and [graphql-js](https://github.com/graphql/graphql-js).

It provides various GraphQL language features in [js-graphql-intellij-plugin](https://github.com/jimkyndemeyer/js-graphql-intellij-plugin) for IntelliJ IDEA and WebStorm, including:
 
- Schema-aware completion and error highlighting
- Syntax highlighting
- Configurable GraphQL schema retrieval and reloading based on a local file or a url using 'then-request'
- Schema documentation for types and tokens

Inspired by TypeScript's language service, this project makes it possible to leverage Facebook's JavaScript implementation of GraphQL inside IDEs such as IntelliJ IDEA and WebStorm -- without re-implementing GraphQL in Java.

## Running
`npm run-script start` starts the language service at http://127.0.0.1:3000/js-graphql-language-service

## Using the Language Service API

The API is based on POSTing JSON commands. The following commands are supported:

- `setProjectDir`: Set the project directory from which a `graphql.config.json` can be loaded to determine how the Schema can be retrieved from a file or url
- `getSchema`: Gets the GraphQL schema that has been loaded using the `setProjectDir` command, falling back to a bare-bones default schema
- `getTokens`: Gets the tokens contained in a buffer, optionally with support for Relay.QL templates using `{relay:true}`
- `getAnnotations`: Gets the errors contained in a buffer, optionally with support for Relay.QL templates using `{relay:true}`
- `getHints`: Gets the schema-aware completions for a buffer at a specified `line` anc `ch`, optionally with support for Relay.QL templates using `{relay:true}`
- `getAST`: Gets the GraphQL AST of a buffer, optionally with support for Relay.QL templates using `{relay:true}`
- `getTokenDocumentation`: Gets the schema documentation for a token in a buffer at a specified `line` anc `ch`, optionally with support for Relay.QL templates using `{relay:true}` 
- `getTypeDocumentation`: Gets schema documentation for a specific GraphQL Type based on the description, fields, implementations, and interfaces specified in the current schema

Please see [src/tests/spec.js](src/tests/spec.js) for examples of how to use the language service, and [src/tests/data](src/tests/data) for the response data.

## Building

Make sure browserify is installed globally with:

```
npm install -g browserify
```

To bundle the bin\server.js file into a single dist/js-graphql-language-service.dist.js file for distribution:

```
npm run-script bundle-to-dist
```

Or, the dist file can be outputted directly into a `js-graphql-intellij-plugin` checkout using:

```
npm run-script bundle-to-intellij-plugin
```

## License
MIT