## 1.5.1 (2018-03-04)

Features:

- Support for strongly typed variable placeholders in GraphQL tagged templates (#19)

## 1.5.0 (2017-09-20)

Features:

- Support for loading the schema from .graphql file (Relay Modern projects) (#16)


## 1.4.0 (2017-01-29)

Features:

- Upgraded to `graphql 0.9.1` and `codemirror-graphql 0.6.2` (#10, #12, #14)
- Add support for top level Apollo fragment template placeholders (#13)

Fixes:

- Only use comment for placeholder if no significant tokens follow on the same line (#15)

## 1.3.2 (2016-10-30)

Fixes:

- Object literal for variables in getFragment closes Relay.QL template expression (#9)

## 1.3.1 (2016-09-25)

Features:

- Support __schema root in schema.json (#7)

## 1.3.0 (2016-09-11)

Features:

- Support for gql apollo and lokka environments (#6)

## 1.2.1 (2016-09-09)

Fixes:

- Invalid "Relay mutation must have a selection of subfields" error (#5)

## 1.2.0 (2016-08-28)

Changes:

- Upgraded to `graphql 0.7.0` to support breaking change in directive locations introspection (#4)
- Upgraded to `codemirror-graphql 0.5.4` to support schema shorthand syntax highlighting (#4)

## 1.1.2 (2016-06-09)

Fixes:

- Increased maximum size of JSON schema from 100kb to 32mb (#3)

## 1.1.1 (2016-02-03)

Changes:

- Upgraded to `graphql 0.4.16`.
- Upgraded to `codemirror-graphql 0.2.2` to enable fragment suggestions after '...'. See [js-graphql-intellij-plugin/issues/4](https://github.com/jimkyndemeyer/js-graphql-intellij-plugin/issues/4)

## 1.1.0 (2016-01-31)

Features:

- Support for GraphQL Schema Language (#1)


## 1.0.0 (2015-12-13)

Features:

- Initial release. Tokens, Annotations, Hints, Schema, Documentation.

