import { vartype, type Var } from './var.js';

export type AST = AST.Type | AST.Value;

export namespace AST {
    export function istype(ast: AST): ast is Type {
        if (typeof ast === 'number') {
            return vartype(ast).startsWith('type:');
        } else {
            return ast.t.startsWith('type:');
        }
    }

    export type Type = Type.Definition | Type.Ctor | Type.Method | Type.Param | Type.Expr;

    export namespace Type {
        export type Definition = Alias | Data | Trait;

        export interface Alias {
            t: 'type:alias';
            id: Var<this>;
            name: string;
            params: Param[];
            type: Expr;
        }

        export interface Data {
            t: 'type:data';
            id: Var<this>;
            name: string;
            params: Param[];
            ctors: Ctor[];
        }

        export interface Ctor {
            t: 'type:data-ctor';
            id: Var<this>;
            name?: string;
            type: Fun;
        }

        export interface Trait {
            t: 'type:trait';
            id: Var<this>;
            name: string;
            super: Var<this>[];
            params: Param[];
            assoc: Param[];
            methods: Method[];
        }

        export interface Method {
            t: 'type:trait-method';
            id: Var<this>;
            name: string;
            type: Fun;
        }

        export interface Param {
            t: 'type:param';
            id: Var<this>;
            name: string;
            constraints: Var<Trait>[];
        }

        // Entity ASTs have ids
        export type Entity = Alias | Data | Ctor | Trait | Method | Param | Partial | Hole;

        // Symbolic ASTs have names
        export type Symbolic = Alias | Data | Ctor | Trait | Method | Param;

        // Domain ASTs bind parameters (or holes, for Partial)
        export type Domain = Definition | Forall | Partial | Fun;

        export type Expr = Param['id'] | Hole['id'] | Forall | Partial | Apply | Tuple | Fun;

        // Existential type; essentially the same thing as `&dyn` in Rust
        export interface Forall {
            t: 'type:forall';
            params: Param[];
            type: Expr;
        }

        export interface Partial {
            t: 'type:partial';
            id: Var<this>;
            holes: Hole[];
            type: Expr;
        }

        // Unambiguously reference a Hole by combining the unique Partial ID
        // with the possibly reused Hole ID
        export namespace Partial {
            export type Key = string & { readonly PartialKey: unique symbol };

            export function pack(partial: AST.Type.Partial['id'], hole: AST.Type.Hole['id']): Key {
                return `${partial}:${hole}` as Key;
            }

            export function unpack(pk: Key): [AST.Type.Partial['id'], AST.Type.Hole['id']] {
                const [p, h] = pk.split(':');
                return [+p! as AST.Type.Partial['id'], +h! as AST.Type.Hole['id']];
            }
        }

        export interface Hole {
            t: 'type:hole';
            id: Var<this>;
        }

        export interface Apply {
            t: 'type:apply';
            head: Alias['id'] | Data['id'] | Trait['id'];
            args: Expr[];
        }

        export interface Tuple {
            t: 'type:tuple';
            elements: Expr[];
        }

        export interface Fun {
            t: 'type:fun';
            tparams: Param[];
            params: Expr[];
            ret: Expr;
        }
    }

    export function isvalue(ast: AST): ast is Value {
        if (typeof ast === 'number') {
            return vartype(ast).startsWith('value:');
        } else {
            return ast.t.startsWith('value:');
        }
    }

    export type Value = Value.Impl | Value.Method | Value.Expr | Value.FunParam | Value.Let | Value.Ret;

    export namespace Value {
        export interface Impl {
            t: 'value:impl';
            id: Var<this>;
            name: string;
            params: Type.Param[];
            target: Type.Expr; // XXX
            methods: Method[];
        }

        export interface Method {
            t: 'value:method';
            id: Var<this>;
            name: string;
            fun: Fun;
        }

        export type Entity = Impl | Method | FunParam | Let;
        export type Symbolic = Impl | FunParam | Let;

        export type Expr = FunParam['id'] | Let['id'] | Apply | Tuple | Fun | Block | Cond;

        export interface Apply {
            t: 'value:apply';
            head: Expr;
            args: Expr[];
        }

        export interface Tuple {
            t: 'value:tuple';
            elements: Expr[];
        }

        export interface Fun {
            t: 'value:fun';
            type: Type.Fun;
            params: FunParam[];
            body: Expr;
        }

        export interface FunParam {
            t: 'value:fun-param';
            id: Var<this>;
            name: string;
        }

        export interface Block {
            t: 'value:block';
            body: (Let | Ret | Expr)[];
        }

        export interface Let {
            t: 'value:let';
            id: Var<this>;
            name: string;
            type?: Type.Expr;
            value: Expr;
        }

        export interface Ret {
            t: 'value:ret';
            value: Expr;
        }

        export interface Cond {
            t: 'value:cond';
            branches: { cond: Expr; expr: Expr }[];
            otherwise?: Expr;
        }
    }
}
