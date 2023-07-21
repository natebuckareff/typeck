import { ASTBuilder } from './ast-builder.js';
import { AST } from './ast.js';
import { Context } from './context.js';
import { Repository } from './repository.js';

const repo = new Repository();
const ctx = Context.empty(repo);
const builder = new ASTBuilder();

const source = `
    (let x 100)
    (let y x)
    (let foo (fun [x] x))
    (type Z (infer foo))
    (data Y (infer foo))
`;

const roots: AST[] = [];

for (const ast of builder.parse(source)) {
    if (AST.is(ast, ['let', 'type-alias', 'type-data'])) {
        ctx.define(ast);
    }
    roots.push(ast);
}

for (const ast of roots) {
    ctx.check(ast);
    console.log(AST.stringify(ast));
}

interface Foo {
    readonly Foo: unique symbol;
}

interface Bar {
    readonly Bar: unique symbol;
}

// function foo<T extends Foo>(x: Foo) {
//     let y: T = x
//     //
// }

let a: <T>(t: T) => T = {} as any;
let b: (x: number) => number = {} as any;
b = a; // error
