#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

let Ajv;
try {
  Ajv = require('ajv');
} catch (e) {
  console.error('Missing dependency: please run `npm install ajv --save-dev`');
  process.exit(2);
}

const ajv = new Ajv({ allErrors: true, verbose: true });
const schemaPath = path.resolve(__dirname, '..', 'schema', 'ast.schema.json');
if (!fs.existsSync(schemaPath)) {
  console.error('Schema not found at', schemaPath);
  process.exit(2);
}
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const validate = ajv.compile(schema);

const argv = process.argv.slice(2);
if (argv.length < 1) {
  console.error('Usage: validate-ast <ast.json>');
  process.exit(2);
}

const astPath = path.resolve(process.cwd(), argv[0]);
if (!fs.existsSync(astPath)) {
  console.error('AST file not found:', astPath);
  process.exit(2);
}

let ast;
try {
  ast = JSON.parse(fs.readFileSync(astPath, 'utf8'));
} catch (err) {
  console.error('Failed to parse AST JSON:', err.message);
  process.exit(2);
}

const valid = validate(ast);
if (!valid) {
  console.error('AST validation failed:');
  console.error(validate.errors);
  process.exit(1);
}

console.log('AST is valid');
