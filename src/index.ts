import { TypeOp } from './type-code.js';
import { TypeLang } from './type-lang.js';
import { print } from './util.js';

/*
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
*/

const ctx = new TypeLang.Context();

const Unit = 0;
const List = 1;
const Either = 2;

ctx.defineDatatype(0, 'Unit', []);
ctx.defineDatatype(1, 'List', [TypeOp.Concrete]);
ctx.defineDatatype(2, 'Either', [TypeOp.Concrete, TypeOp.Concrete]);

// <T, U>(t: T, u: U) -> U
const foo: TypeLang = {
    op: TypeOp.Forall,
    param: TypeOp.Concrete, // <T>
    expr: {
        op: TypeOp.Forall,
        param: TypeOp.Concrete, // <U>
        expr: {
            op: TypeOp.Fun,
            expr: [
                { op: TypeOp.Var, id: 1 }, // (t: T)
                {
                    op: TypeOp.Fun,
                    expr: [
                        { op: TypeOp.Var, id: 0 }, // (u: U)
                        { op: TypeOp.Var, id: 0 }, // -> U
                    ],
                },
            ],
        },
    },
};

// <X>(x: X, y: X) -> X
const bar: TypeLang = {
    op: TypeOp.Forall,
    param: TypeOp.Concrete, // <X>
    expr: {
        op: TypeOp.Fun,
        expr: [
            { op: TypeOp.Var, id: 0 }, // (x: X)
            {
                op: TypeOp.Fun,
                expr: [
                    { op: TypeOp.Var, id: 0 }, // (y: X)
                    { op: TypeOp.Var, id: 0 }, // -> X
                ],
            },
        ],
    },
};

print(`${TypeLang.stringify(foo)}   ~=   ${TypeLang.stringify(bar)}`);
console.log('--->', ctx.check(foo, []));
console.log('--->', ctx.check(bar, []));
console.log('--->', ctx.unify(bar, foo, TypeLang.UnityState.empty()));
