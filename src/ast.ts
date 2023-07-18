/*
    program = let | expr | type-def

    let = ('let identifier expr)

    expr = var | block | fun | apply | assert

    var = identifier

    block  = ('block stmt+)
    stmt   = let | return | expr
    return = ('return expr)

    fun   = ('fun (param*) expr)
    param = identifier | (identifier type)

    apply  = (expr expr*)
    assert = (':: expr type)

    type-def = ('type identifier type)

    type =
        | forall
        | exists
        | type-fun
        | type-apply

    forall = ('forall (type-param+) type)
    exists = ('exists (type-param+) type)

    type-param =
        | identifier
        | (identifier ('fun hkt hkt+))
        | (identifier ('impl identifier type*))

    type-fun   = ('fun type+)
    type-apply = (type type+)
*/

import type { Parser } from './parse.js';
import { and, atom, lazy, list, or, plus, star, transform } from './parse.js';

export type AST =
    | AST.Let
    | AST.Expr
    | AST.Param
    | AST.TypeDef
    | AST.Type
    | AST.TypeParam
    | AST.TypeParamHKT
    | AST.HKT
    | AST.TypeParamImpl
    | AST.TypeImpl;

export namespace AST {
    export function create<const T extends AST>(value: T): T {
        return value;
    }

    export type Entity = Let | Param;

    export interface Let {
        t: 'let';
        id: number;
        name: string;
        parent?: AST;
        child: Expr | Type;
    }

    export type Expr = Var | Block | Fun | Apply | Assert;

    export interface Var {
        t: 'var';
        parent?: AST;
        name: string;
    }

    export interface Block {
        t: 'block';
        parent?: AST;
        children: Statement[];
    }

    export type Statement = Let | Expr;

    export interface Fun {
        t: 'fun';
        parent?: AST;
        params: Param[];
        body: Expr;
    }

    export interface Param {
        t: 'param';
        id: number;
        name: string;
        parent?: AST;
    }

    export interface Apply {
        t: 'apply';
        parent?: AST;
        head: Expr;
        args: Expr[];
    }

    export interface Assert {
        t: 'assert';
        parent?: AST;
        expr: Expr;
        type: Type;
    }

    export interface TypeDef {
        t: 'type-def';
        parent?: AST;
        id: number;
        name: string;
        type: Type;
    }

    export type Type = TypeVar | Forall | Exists | TypeFun | TypeApply;

    export interface TypeVar {
        t: 'type-var';
        parent?: AST;
        name: string;
    }

    export interface Forall {
        t: 'forall';
        parent?: AST;
        params: [TypeParam, ...TypeParam[]];
        body: Type;
    }

    export interface Exists {
        t: 'exists';
        parent?: AST;
        params: [TypeParam, ...TypeParam[]];
        body: Type;
    }

    export type TypeParam = TypeParamHKT | TypeParamImpl;

    export interface TypeParamHKT {
        t: 'type-param-hkt';
        parent?: AST;
        id: number;
        name: string;
        hkt?: HigherKind;
    }

    export type HKT = ConcreteKind | HigherKind;

    export interface ConcreteKind {
        t: 'concrete-kind';
        parent?: AST;
    }

    export interface HigherKind {
        t: 'higher-kind';
        parent?: AST;
        params: [HKT, HKT, ...HKT[]];
    }

    export interface TypeParamImpl {
        t: 'type-param-impl';
        parent?: AST;
        id: number;
        name: string;
        impl: [TypeImpl, ...TypeImpl[]];
    }

    export interface TypeImpl {
        t: 'type-impl';
        parent?: AST;
        name: string;
        args: Type[];
    }

    export interface TypeFun {
        t: 'type-fun';
        parent?: AST;
        params: [Type, ...Type[]];
    }

    export interface TypeApply {
        t: 'type-apply';
        parent?: AST;
        head: Type;
        args: [Type, ...Type[]];
    }

    export function stringify(ast: AST): string {
        switch (ast.t) {
            case 'let':
                return `let ${ast.name} = ${stringify(ast.child)}`;

            case 'var':
            case 'type-var':
                return ast.name;

            case 'block':
                return `{ ${ast.children.map(stringify).join(' ')} }`;

            case 'fun':
                return `(λ [${ast.params.map(stringify).join(', ')}] ${stringify(ast.body)})`;

            case 'param':
                return ast.name;

            case 'apply':
                if (ast.args.length === 0) return `(${stringify(ast.head)})`;
                else return `${stringify(ast.head)}(${ast.args.map(stringify).join(', ')})`;

            case 'assert':
                return `(${stringify(ast.expr)} ${stringify(ast.type)})`;

            case 'type-def':
                return `type ${ast.name} = ${stringify(ast.type)}`;

            case 'forall':
            case 'exists': {
                const h = ast.t === 'forall' ? '∀' : '∃';
                return `(${h} ${ast.params.map(stringify).join(', ')}. ${stringify(ast.body)})`;
            }

            case 'type-param-hkt':
                if (ast.hkt === undefined) return ast.name;
                else return `${ast.name}: ${stringify(ast.hkt)}`;

            case 'concrete-kind':
                return '*';

            case 'higher-kind':
                return `(${ast.params.map(stringify).join(' -> ')})`;

            case 'type-param-impl':
                return `${ast.name}: ${ast.impl.map(stringify).join(' + ')}`;

            case 'type-impl':
                if (ast.args.length === 0) return ast.name;
                else return `${ast.name}<${ast.args.map(stringify).join(', ')}>`;

            case 'type-fun':
                return `(fun ${ast.params.map(stringify).join(' ')})`;

            case 'type-apply':
                return `${stringify(ast.head)}<${ast.args.map(stringify).join(', ')}>`;
        }
    }
}

const KEYWORDS = ['let', 'block', 'fun', '::', 'type', 'forall', 'exists'];

const Identifier = transform(atom(/^[a-zA-Z_][a-zA-Z_0-9]*$/), name => {
    if (KEYWORDS.includes(name)) {
        throw Error(`invalid use of keyword \`${name}\``);
    }
    return name;
});

const Expr: Parser<AST.Expr> = lazy(() => or(Var, Block, Fun, Apply, Assert));

const Let: Parser<AST.Let> = lazy(() =>
    transform(list(and(atom('let'), Identifier, Expr)), input =>
        AST.create({
            t: 'let',
            id: 0,
            name: input[1],
            child: input[2],
        }),
    ),
);

const Var: Parser<AST.Var> = transform(Identifier, name =>
    AST.create({
        t: 'var',
        name,
    }),
);

const Block: Parser<AST.Block> = lazy(() =>
    transform(list(and(atom('block'), plus(Stmt))), input =>
        AST.create({
            t: 'block',
            children: input[1],
        }),
    ),
);

const Stmt: Parser<AST.Statement> = or(Let, Expr);

const Fun: Parser<AST.Fun> = lazy(() =>
    transform(list(and(atom('fun'), Params, Expr)), input =>
        AST.create({
            t: 'fun',
            params: input[1],
            body: input[2],
        }),
    ),
);

const Params: Parser<AST.Param[]> = transform(list(star(Identifier)), input =>
    input.map(name => AST.create({ t: 'param', id: 0, name })),
);

const Apply: Parser<AST.Apply> = transform(list(and(Expr, star(Expr))), input =>
    AST.create({
        t: 'apply',
        head: input[0],
        args: input[1],
    }),
);

const Assert: Parser<AST.Assert> = lazy(() =>
    transform(list(and(atom('::'), Expr, Type)), input =>
        AST.create({
            t: 'assert',
            expr: input[1],
            type: input[2] as any,
        }),
    ),
);

const TypeDef: Parser<AST.TypeDef> = lazy(() =>
    transform(list(and(atom('type'), Identifier, Type)), input =>
        AST.create({
            t: 'type-def',
            id: 0,
            name: input[1],
            type: input[2],
        }),
    ),
);

const Type = lazy(() => or(TypeVar, Forall, Exists, TypeFun, TypeApply));

const TypeVar: Parser<AST.TypeVar> = transform(Identifier, name => AST.create({ t: 'type-var', name }));

const Forall: Parser<AST.Forall> = lazy(() =>
    transform(list(and(atom('forall'), TypeParams, Type)), input =>
        AST.create({
            t: 'forall',
            params: input[1],
            body: input[2],
        }),
    ),
);

const Exists: Parser<AST.Exists> = lazy(() =>
    transform(list(and(atom('exists'), TypeParams, Type)), input =>
        AST.create({
            t: 'exists',
            params: input[1],
            body: input[2],
        }),
    ),
);

const TypeParams: Parser<[AST.TypeParam, ...AST.TypeParam[]]> = lazy(() => list(plus(TypeParam)));
const TypeParam: Parser<AST.TypeParam> = lazy(() => or(TypeParamHKT, TypeParamImpl));

const TypeParamHKT: Parser<AST.TypeParamHKT> = lazy(() => or(TypeParamConcrete, TypeParamHigherKinded));

const TypeParamConcrete: Parser<AST.TypeParamHKT> = transform(Identifier, name =>
    AST.create({
        t: 'type-param-hkt',
        id: 0,
        name,
    }),
);

const TypeParamHigherKinded: Parser<AST.TypeParamHKT> = lazy(() =>
    transform(list(and(Identifier, HigherKind)), input =>
        AST.create({
            t: 'type-param-hkt',
            id: 0,
            name: input[0],
            hkt: input[1],
        }),
    ),
);

const HKT: Parser<AST.HKT> = lazy(() => or(ConcreteKind, HigherKind));

const ConcreteKind: Parser<AST.ConcreteKind> = transform(atom('*'), () =>
    AST.create({
        t: 'concrete-kind',
    }),
);

const HigherKind: Parser<AST.HigherKind> = transform(list(and(HKT, plus(HKT))), ([head, tail]) =>
    AST.create({
        t: 'higher-kind',
        params: [head, ...tail] as [AST.HKT, AST.HKT, ...AST.HKT[]],
    }),
);

const TypeParamImpl: Parser<AST.TypeParamImpl> = lazy(() =>
    transform(list(and(Identifier, plus(TypeImpl))), input =>
        AST.create({
            t: 'type-param-impl',
            id: 0,
            name: input[0],
            impl: input[1],
        }),
    ),
);

const TypeImpl: Parser<AST.TypeImpl> = lazy(() => or(TypeImplUnary, TypeImplNary));

const TypeImplUnary: Parser<AST.TypeImpl> = transform(Identifier, name =>
    AST.create({
        t: 'type-impl',
        name,
        args: [] as AST.Type[],
    }),
);

const TypeImplNary: Parser<AST.TypeImpl> = transform(list(and(Identifier, plus(Type))), input =>
    AST.create({
        t: 'type-impl',
        name: input[0],
        args: input[1],
    }),
);

const TypeFun: Parser<AST.TypeFun> = lazy(() =>
    transform(list(and(atom('fun'), plus(Type))), input =>
        AST.create({
            t: 'type-fun',
            params: input[1],
        }),
    ),
);

const TypeApply: Parser<AST.TypeApply> = lazy(() =>
    transform(list(and(Type, plus(Type))), input =>
        AST.create({
            t: 'type-apply',
            head: input[0],
            args: input[1],
        }),
    ),
);

export const Language = or(Let, Expr, TypeDef);
