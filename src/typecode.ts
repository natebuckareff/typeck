/*
    expr :=
        | quantified
        | hole
        | ref
        | var
        | fun
        | apply

    quantified :=
        | quantifier (Fun hkt hkt) expr
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

    export const stringify = (code: TypeCodeString, offset = 0): [string, number] => {
        const op = code.codePointAt(offset);

        switch (op) {
            case TypeOp.Forall:
            case TypeOp.Exists: {
                const h = op === TypeOp.Forall ? '∀' : '∃';
                const nextOp = code.codePointAt(offset + 1);
                if (nextOp === TypeOp.KindFun) {
                    const [param, paramOffset] = stringify(code, offset + 1);
                    const [expr, exprOffset] = stringify(code, paramOffset);
                    return [`${h} ${param}. ${expr}`, exprOffset];
                } else if (nextOp === TypeOp.Constr) {
                    const constrs: string[] = [];
                    offset += 1;
                    do {
                        const [constr, constrOffset] = stringify(code, offset);
                        offset = constrOffset;
                        constrs.push(constr);
                    } while (code.codePointAt(offset) === TypeOp.Constr);
                    const [expr, exprOffset] = stringify(code, offset);
                    return [`${h} ${constrs.join(' + ')}. ${expr}`, exprOffset];
                } else {
                    const [expr, exprOffset] = stringify(code, offset + 1);
                    return [`${h}. ${expr}`, exprOffset];
                }
            }

            case TypeOp.KindFun:
            case TypeOp.Fun: {
                const [param0, paramOffset0] = stringify(code, offset + 1);
                const [param1, paramOffset1] = stringify(code, paramOffset0);
                return [`(${param0} -> ${param1})`, paramOffset1];
            }

            case TypeOp.Kind:
                return ['*', offset + 1];

            case TypeOp.Constr:
                return stringify(code, offset + 1);

            case TypeOp.Hole:
                return ['_', offset + 1];

            case TypeOp.Ref: {
                const id = code.codePointAt(offset + 1);
                return [`&${id}`, offset + 2];
            }

            case TypeOp.Var: {
                const index = code.codePointAt(offset + 1);
                return [`${index}`, offset + 2];
            }

            case TypeOp.Apply: {
                const [arg0, argOffset0] = stringify(code, offset + 1);
                const [arg1, argOffset1] = stringify(code, argOffset0);
                return [`(${arg0} ${arg1})`, argOffset1];
            }

            default:
                throw Error('invalid type op');
        }
    };
}
