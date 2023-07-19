/*
    expr :=
        | quantified
        | hole
        | ref
        | var
        | fun
        | apply

    quantified :=
        | quantifier (KindFun hkt hkt) expr
        | quantifier (Constr expr)+ expr
        | quantifier expr
        where
            quantifier := Forall | Exists
            hkt := Kind | Fun hkt hkt

    ref := Ref Byte
    var := Var Byte
    fun := Fun expr expr
    apply := Apply expr expr
*/

// prettier-ignore
export enum TypeOp {
    Forall  = 0x00, // Generic function type
    Exists  = 0x01, // Existential type
    KindFun = 0x02, // Higher-kinded type
    Kind    = 0x03, // Kind of concrete types
    Constr  = 0x04, // Type parameter constraint
    Hole    = 0x05, // Top-level reference
    Ref     = 0x06, // Top-level reference
    Var     = 0x07, // Bound variable (De Bruijn) index
    Fun     = 0x08, // Function type
    Apply   = 0x09, // Application
}

export type TypeInstr = TypeOp | number;

export type TypeCodeString = string & { readonly TypeCodeString: unique symbol };

export namespace TypeCode {
    export function encode(input: Iterable<TypeInstr>): TypeCodeString {
        let output: string = '';
        for (const instr of input) {
            if (instr > 0xffff) {
                throw Error('invalid instruction; uint16 overflow');
            }
            output += String.fromCharCode(instr & 0xffff);
        }
        return output as TypeCodeString;
    }
}
