/*
    expr :=
        | forall
        | hole
        | ref
        | var
        | fun
        | apply

    forall :=
        | Forall (KindFun hkt hkt) expr
        | Forall (Constr expr)+ expr
        | Forall expr
        where
            quantifier := Forall | Exists
            hkt := Kind | Fun hkt hkt

    ref := Ref Byte
    var := Var Byte
    fun := Fun expr expr
    apply := Apply expr expr
*/

import type { TypeLang } from './type-lang';

// prettier-ignore
export enum TypeOp {
    Forall   = 0x00, // Generic function type
    Concrete = 0x01, // Kind of concrete types
    Hkt      = 0x02, // Higher-kinded type
    Impl     = 0x03, // Type parameter constraint
    Hole     = 0x04, // Top-level reference
    Ref      = 0x05, // Top-level reference
    Var      = 0x06, // Bound variable (De Bruijn) index
    Fun      = 0x07, // Function type
    Apply    = 0x08, // Application
}

export type TypeInstr = TypeOp | number;

export type TypeCode = string & { readonly TypeCodeString: unique symbol };

export namespace TypeCode {
    export function* compile(ast: TypeLang): Iterable<TypeInstr> {
        if (ast === TypeOp.Concrete) {
            return ast;
        }

        yield ast.op;

        switch (ast.op) {
            case TypeOp.Forall: {
                if (Array.isArray(ast.param)) {
                    for (const impl of ast.param) {
                        yield TypeOp.Impl;
                        yield* compile(impl);
                    }
                } else {
                    yield* compile(ast.param);
                }
                return;
            }

            case TypeOp.Hkt:
            case TypeOp.Fun:
            case TypeOp.Apply:
                yield* compile(ast.expr[0]);
                yield* compile(ast.expr[1]);
                return;

            case TypeOp.Hole:
            case TypeOp.Ref:
            case TypeOp.Var:
                yield ast.id;
                return;
        }
    }

    export function encode(input: Iterable<TypeInstr>): TypeCode {
        let output: string = '';
        for (const instr of input) {
            if (instr > 0xffff) {
                throw Error('invalid instruction; uint16 overflow');
            }
            output += String.fromCharCode(instr & 0xffff);
        }
        return output as TypeCode;
    }
}
