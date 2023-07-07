export namespace AST {
    export type VarType = Type.Entity['t'] | 'partial-key';

    export type Var<T extends VarType> = number & { readonly T: T; readonly Var: unique symbol };

    export function Var<const T extends VarType>(id: number): Var<T> {
        return id as Var<T>;
    }

    export type Type = Type.Definition | Type.Param | Type.Expr;

    export namespace Type {
        export type Definition = Alias | Data;

        export interface Alias {
            t: 'type-alias';
            id: Var<this['t']>;
            name: string;
            params: Param[];
            type: Expr;
        }

        export interface Data {
            t: 'type-data';
            id: Var<this['t']>;
            name: string;
            params: Param[];
            ctors: { name?: string; type: Fun }[];
        }

        export interface Param {
            t: 'type-param';
            id: Var<this['t']>;
            name: string;
            constraints: number[];
        }

        // Entity ASTs have ids
        export type Entity = Alias | Data | Param | Partial | Hole;

        // Symbolic ASTs have names
        export type Symbolic = Alias | Data | Param;

        // Domain ASTs bind parameters
        export type Domain = Definition | Fun;

        export type Expr = Param['id'] | Partial | Hole | Apply | Tuple | Fun;

        export interface Partial {
            t: 'type-partial';
            id: Var<this['t']>;
            type: Expr;
        }

        export interface Hole {
            t: 'type-hole';
            id: Var<this['t']>;
        }

        export interface Apply {
            t: 'type-apply';
            head: Alias['id'] | Data['id'];
            args: Expr[];
        }

        export interface Tuple {
            t: 'type-tuple';
            elements: Expr[];
        }

        export interface Fun {
            t: 'type-fun';
            tparams: Param[];
            params: Expr[];
            ret: Expr;
        }
    }
}
