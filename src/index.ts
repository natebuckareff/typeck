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
`;

for (const ast of builder.parse(source)) {
    if (AST.is(ast, ['let', 'type-def'])) {
        ctx.define(ast);
    }
    ctx.check(ast);
    console.log(AST.stringify(ast));
}
