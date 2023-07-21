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

import type { ASTBuilder } from './ast-builder.js';
import type { Parser } from './parse.js';
import { and, atom, lazy, list, or, plus, star, transform } from './parse.js';

export type AST =
    | AST.Let
    | AST.Expr
    | AST.Param
    | AST.Datatype
    | AST.TypeAlias
    | AST.Type
    | AST.TypeParam
    | AST.TypeParamHKT
    | AST.HKT
    | AST.TypeParamImpl
    | AST.TypeImpl;

export namespace AST {
    export type Language = Let | Expr | Datatype | TypeAlias;

    export type Entity = ValueEntity | TypeEntity;
    export type Scope = ValueScope | TypeScope;

    export type ValueEntity = Let | Param;
    export type ValueScope = Block | Fun;

    export interface Let {
        t: 'let';
        id: number;
        name: string;
        parent?: AST;
        child: Expr;
    }

    export type Expr = Literal | Var | Block | Fun | Apply | Assert;

    export type Literal = Integer;

    export interface Integer {
        t: 'literal-integer';
        parent?: AST;
        value: number;
    }

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
        generic: TypeParam[];
        params: Param[];
        ret: AST.Type;
        body: Expr;
    }

    export interface Param {
        t: 'param';
        parent?: AST;
        id: number;
        name: string;
        type: AST.Type;
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
        expr?: Expr; // XXX: Do we really need a unary assert?
        type: Type;
    }

    // TODO
    export interface Reflect {
        t: 'reflect';
        parent?: AST;
        target: Type;
    }

    // TODO
    export interface Impl {
        t: 'impl';
        params: TypeParam[];
        target: Var;
        methods: Method[];
    }

    // TODO
    export interface Method {
        t: 'method';
        id: number;
        name: string;
        impl: Fun;
    }

    export type TypeEntity = Datatype | TypeAlias | TypeParam;
    export type TypeScope = Forall;

    export interface Datatype {
        t: 'type-data';
        parent?: AST;
        id: number;
        name: string;
        type: Type; // XXX
    }

    export interface TypeAlias {
        t: 'type-alias';
        parent?: AST;
        id: number;
        name: string;
        type: Type;
    }

    export type Type = TypeVar | Forall | TypeFun | TypeApply | Infer;

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
        trait: TypeVar;
        args: Type[];
    }

    export interface TypeFun {
        t: 'type-fun';
        parent?: AST;
        params: [Type, Type, ...Type[]];
    }

    export interface TypeApply {
        t: 'type-apply';
        parent?: AST;
        head: TypeVar;
        args: [Type, ...Type[]];
    }

    // TODO
    export interface Infer {
        t: 'infer';
        parent?: AST;
        target: Expr;
    }

    // TODO
    export interface Trait {
        t: 'trait';
        parent?: AST;
        id: number;
        name: string;
        super: TypeVar;
        params: TypeParam[];
        assoc: TypeParam[];
        methods: TypeMethod[];
    }

    // TODO
    export interface TypeMethod {
        t: 'type-method';
        id: number;
        name: string;
        type: TypeFun;
    }

    export function is<X extends AST, const T extends X['t']>(
        ast: X,
        t: T[],
    ): ast is Extract<X, { t: T }> {
        return t.includes(ast.t as T);
    }

    export function stringify(ast: AST): string {
        switch (ast.t) {
            case 'let':
                return `let ${ast.name} = ${stringify(ast.child)}`;

            case 'integer':
                return ast.value + '';

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
                if (ast.expr === undefined) return `(:: ${stringify(ast.type)})`;
                else return `(:: ${stringify(ast.expr)} ${stringify(ast.type)})`;

            case 'infer':
                return `infer ${stringify(ast.target)}`;

            case 'type-data':
            case 'type-alias': {
                const h = ast.t === 'type-alias' ? 'type' : 'data';
                return `${h} ${ast.name} = ${stringify(ast.type)}`;
            }

            case 'forall':
                return `(∀ ${ast.params.map(stringify).join(', ')}. ${stringify(ast.body)})`;

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
                if (ast.args.length === 0) return ast.trait.name;
                else return `${ast.trait.name}<${ast.args.map(stringify).join(', ')}>`;

            case 'type-fun':
                return `(fun ${ast.params.map(stringify).join(' ')})`;

            case 'type-apply':
                return `${stringify(ast.head)}<${ast.args.map(stringify).join(', ')}>`;
        }
    }
}

const KEYWORDS = ['let', 'block', 'fun', '::', 'infer', 'type', 'forall', 'exists'];

const Identifier = transform(atom(/^[a-zA-Z_][a-zA-Z_0-9]*$/), name => {
    if (KEYWORDS.includes(name)) {
        throw Error(`invalid use of keyword \`${name}\``);
    }
    return name;
});

type ASTParser<T> = Parser<T, ASTBuilder>;

const Let: ASTParser<AST.Let> = lazy(() =>
    transform(list(and(atom('let'), Identifier, Expr)), (input, state) =>
        state.create({
            t: 'let',
            id: 0,
            name: input[1],
            child: input[2],
        }),
    ),
);

const Expr: ASTParser<AST.Expr> = lazy(() => or(Literal, Var, Block, Fun, Apply, Assert));

const Literal = lazy(() => Integer);

const Integer: ASTParser<AST.Integer> = transform(atom(/^(-+)?[0-9]+$/), (input, state) =>
    state.create({
        t: 'integer',
        value: Number.parseInt(input),
    }),
);

const Var: ASTParser<AST.Var> = transform(Identifier, (name, state) =>
    state.create({
        t: 'var',
        name,
    }),
);

const Block: ASTParser<AST.Block> = lazy(() =>
    transform(list(and(atom('block'), plus(Stmt))), (input, state) =>
        state.create({
            t: 'block',
            children: input[1],
        }),
    ),
);

const Stmt: ASTParser<AST.Statement> = or(Let, Expr);

const FunParser = lazy(() => list(and(atom('fun'), list(star(Param)), Type, Expr)));

const ConcreteFun: ASTParser<AST.Fun> = lazy(() =>
    transform(FunParser, (input, state) =>
        state.create({
            t: 'fun',
            generic: [] as AST.TypeParam[],
            params: input[1],
            ret: input[2],
            body: input[3],
        }),
    ),
);

const GenericFun: ASTParser<AST.Fun> = lazy(() =>
    transform(list(and(atom('forall'), TypeParams, FunParser)), (input, state) =>
        state.create({
            t: 'fun',
            generic: input[1],
            params: input[2][1],
            ret: input[2][2],
            body: input[2][3],
        }),
    ),
);

const Fun: ASTParser<AST.Fun> = or(ConcreteFun, GenericFun);

const Param: ASTParser<AST.Param> = lazy(() =>
    transform(list(and(Identifier, Type)), (input, state) =>
        state.create({
            t: 'param',
            id: 0,
            name: input[0],
            type: input[1],
        }),
    ),
);

const Apply: ASTParser<AST.Apply> = transform(list(and(Expr, star(Expr))), (input, state) =>
    state.create({
        t: 'apply',
        head: input[0],
        args: input[1],
    }),
);

const Assert: ASTParser<AST.Assert> = lazy(() => or(AssertUnary, AssertBinary));

// XXX: Do we really need this?
const AssertUnary: ASTParser<AST.Assert> = lazy(() =>
    transform(list(and(atom('::'), Type)), (input, state) =>
        state.create({
            t: 'assert',
            type: input[1] as any,
        }),
    ),
);

const AssertBinary: ASTParser<AST.Assert> = lazy(() =>
    transform(list(and(atom('::'), Expr, Type)), (input, state) =>
        state.create({
            t: 'assert',
            expr: input[1],
            type: input[2] as any,
        }),
    ),
);

const Infer: ASTParser<AST.Infer> = lazy(() =>
    transform(list(and(atom('infer'), Expr)), (input, state) =>
        state.create({
            t: 'infer',
            target: input[1],
        }),
    ),
);

const Datatype: ASTParser<AST.Datatype> = lazy(() =>
    transform(list(and(atom('data'), Identifier, Type)), (input, state) =>
        state.create({
            t: 'type-data',
            id: 0,
            name: input[1],
            type: input[2],
        }),
    ),
);

const TypeAlias: ASTParser<AST.TypeAlias> = lazy(() =>
    transform(list(and(atom('type'), Identifier, Type)), (input, state) =>
        state.create({
            t: 'type-alias',
            id: 0,
            name: input[1],
            type: input[2],
        }),
    ),
);

const Type = lazy(() => or(TypeVar, Forall, TypeFun, TypeApply, Infer));

const TypeVar: ASTParser<AST.TypeVar> = transform(Identifier, (name, state) =>
    state.create({ t: 'type-var', name }),
);

const Forall: ASTParser<AST.Forall> = lazy(() =>
    transform(list(and(atom('forall'), TypeParams, Type)), (input, state) =>
        state.create({
            t: 'forall',
            params: input[1],
            body: input[2],
        }),
    ),
);

const TypeParams: ASTParser<[AST.TypeParam, ...AST.TypeParam[]]> = lazy(() =>
    list(plus(TypeParam)),
);
const TypeParam: ASTParser<AST.TypeParam> = lazy(() => or(TypeParamHKT, TypeParamImpl));

const TypeParamHKT: ASTParser<AST.TypeParamHKT> = lazy(() =>
    or(TypeParamConcrete, TypeParamHigherKinded),
);

const TypeParamConcrete: ASTParser<AST.TypeParamHKT> = transform(Identifier, (name, state) =>
    state.create({
        t: 'type-param-hkt',
        id: 0,
        name,
    }),
);

const TypeParamHigherKinded: ASTParser<AST.TypeParamHKT> = lazy(() =>
    transform(list(and(Identifier, HigherKind)), (input, state) =>
        state.create({
            t: 'type-param-hkt',
            id: 0,
            name: input[0],
            hkt: input[1],
        }),
    ),
);

const HKT: ASTParser<AST.HKT> = lazy(() => or(ConcreteKind, HigherKind));

const ConcreteKind: ASTParser<AST.ConcreteKind> = transform(atom('*'), (_, state) =>
    state.create({
        t: 'concrete-kind',
    }),
);

const HigherKind: ASTParser<AST.HigherKind> = transform(
    list(and(HKT, plus(HKT))),
    ([head, tail], state) =>
        state.create({
            t: 'higher-kind',
            params: [head, ...tail] as [AST.HKT, AST.HKT, ...AST.HKT[]],
        }),
);

const TypeParamImpl: ASTParser<AST.TypeParamImpl> = lazy(() =>
    transform(list(and(Identifier, plus(TypeImpl))), (input, state) =>
        state.create({
            t: 'type-param-impl',
            id: 0,
            name: input[0],
            impl: input[1],
        }),
    ),
);

const TypeImpl: ASTParser<AST.TypeImpl> = lazy(() => or(TypeImplUnary, TypeImplNary));

const TypeImplUnary: ASTParser<AST.TypeImpl> = transform(Identifier, (name, state) =>
    state.create({
        t: 'type-impl',
        trait: state.create({
            t: 'type-var',
            name,
        }),
        args: [] as AST.Type[],
    }),
);

const TypeImplNary: ASTParser<AST.TypeImpl> = transform(
    list(and(Identifier, plus(Type))),
    (input, state) => {
        const trait = state.create({
            t: 'type-var',
            name: input[0],
        });
        return state.create({
            t: 'type-impl',
            trait,
            args: input[1],
        });
    },
);

const TypeFun: ASTParser<AST.TypeFun> = lazy(() =>
    transform(list(and(atom('fun'), Type, plus(Type))), (input, state) =>
        state.create({
            t: 'type-fun',
            params: [input[1], ...input[2]] as [AST.Type, AST.Type, ...AST.Type[]],
        }),
    ),
);

const TypeApply: ASTParser<AST.TypeApply> = lazy(() =>
    transform(list(and(TypeVar, plus(Type))), (input, state) =>
        state.create({
            t: 'type-apply',
            head: input[0],
            args: input[1],
        }),
    ),
);

export const Language: ASTParser<AST.Language> = or(Let, Expr, Datatype, TypeAlias);
