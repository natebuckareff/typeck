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
        | quantifier (Constr Byte expr?)+ expr
        | quantifier expr
        where
            quantifier := Forall | Exists
            hkt := Kind | Fun hkt hkt

    ref := Ref Byte
    var := Var Byte
    fun := Fun expr expr
    apply := Apply expr expr
*/

import type { Expr, FunHKT, Kind } from './type-ast';

// prettier-ignore
export enum TypeOp {
    Forall = 0x00, // Generic function type
    Exists = 0x01, // Existential type
    Kind   = 0x02, // Higher-kinded type
    Constr = 0x03, // Type parameter constraint
    Hole   = 0x04, // Top-level reference
    Ref    = 0x05, // Top-level reference
    Var    = 0x06, // Bound variable (De Bruijn) index
    Fun    = 0x07, // Function type
    Apply  = 0x08, // Application
}

export type Instr = TypeOp | number;

interface State {
    depth: number;
    bindings: Map<number, number>;
}

type Value = Expr | FunHKT | Kind;

function* encodeApply(exprs: Value[], state: State): Iterable<Instr> {
    // (f x y z)
    // ((f x) y z)
    // (((f x) y) z)
    if (exprs.length < 2) {
        throw Error('invalid length');
    }
    for (let i = 0; i < exprs.length - 1; ++i) {
        yield TypeOp.Apply;
    }
    for (const e of exprs) {
        yield* _encode(e, state);
    }
}

function* encodeFun(prefix: TypeOp, exprs: Value[], state: State): Iterable<Instr> {
    // a -> a -> a -> a
    // a -> (a -> a -> a)
    // a -> (a -> (a -> a))
    if (exprs.length < 2) {
        throw Error('invalid length');
    }
    for (let i = 0; i < exprs.length - 1; ++i) {
        const e = exprs[i]!;
        yield prefix;
        yield* _encode(e, state);
    }
    yield* _encode(exprs[exprs.length - 1]!, state);
}

export function encode(expr: Expr): Instr[] {
    return [..._encode(expr, { bindings: new Map(), depth: 0 })];
}

function* _encode(expr: Value, state: State): Iterable<Instr> {
    if (expr === '*') {
        yield TypeOp.Kind;
        return;
    }

    switch (expr.t) {
        case 'forall':
        case 'exists': {
            const next = { ...state };
            for (const param of expr.params) {
                next.depth += 1;
                next.bindings.set(param.id, next.depth);

                yield expr.t === 'forall' ? TypeOp.Forall : TypeOp.Exists;

                if (param.t === 'param-constrained') {
                    for (const { id, args } of param.constraints) {
                        yield TypeOp.Constr;
                        const ref: Expr = { t: 'ref', id };
                        if (args.length === 0) {
                            yield* _encode(ref, next);
                        } else {
                            yield* encodeApply([ref, ...args], next);
                        }
                    }
                } else {
                    yield* _encode(param.kind, next);
                }
            }

            yield* _encode(expr.expr, next);

            return;
        }

        case 'fun-hkt':
            yield* encodeFun(TypeOp.Fun, expr.params, state);
            yield TypeOp.Kind;
            return;

        case 'fun':
            yield* encodeFun(TypeOp.Fun, expr.params, state);
            return;

        case 'hole':
            yield TypeOp.Hole;
            yield expr.id;
            return;

        case 'ref':
            yield TypeOp.Ref;
            yield expr.id;
            return;

        case 'var':
            const param = state.bindings.get(expr.id);
            if (param === undefined) {
                throw Error('variable not bound');
            }
            yield TypeOp.Var;
            yield state.depth - param;
            return;

        case 'apply':
            yield* encodeApply([expr.head, ...expr.args], state);
            return;
    }
}

export interface Range {
    start: number;
    end: number;
}

export type Disasm<C extends boolean = true> =
    | { t: 'forall'; range: Range; param?: Disasm<C>; body: Disasm<C> }
    | { t: 'exists'; range: Range; param?: Disasm<C>; body: Disasm<C> }
    | { t: 'fun'; range: Range; param: Disasm<C>; ret: Disasm<C> }
    | { t: 'hole'; range: Range; id: number }
    | { t: 'ref'; range: Range; id: number }
    | { t: 'var'; range: Range; id: number }
    | { t: 'kind'; range: Range }
    | { t: 'constr'; range: Range; exprs: Disasm<C>[] }
    | { t: 'apply'; range: Range; head: Disasm<C>; arg: Disasm<C> };

export function disassemble(bytecode: Instr[], offset: number = 0): Disasm {
    if (bytecode.length === 0) {
        throw Error('bytecode empty');
    }

    const byte = bytecode[offset];

    if (byte === undefined) {
        throw Error('unexpected end-of-bytecode');
    }

    switch (byte) {
        case TypeOp.Forall:
        case TypeOp.Exists: {
            const t = byte === TypeOp.Forall ? 'forall' : 'exists';
            const peek = bytecode[offset + 1];
            if (peek === TypeOp.Constr || peek === TypeOp.Fun) {
                const param = disassemble(bytecode, offset + 1);
                const body = disassemble(bytecode, param.range.end);
                const range = containing(offset, body.range, param.range);
                return { t, range, param, body };
            } else {
                const body = disassemble(bytecode, offset + 1);
                const range = containing(offset, body.range);
                return { t, range, body };
            }
        }

        case TypeOp.Fun: {
            const param = disassemble(bytecode, offset + 1);
            const ret = disassemble(bytecode, param.range.end);
            const range = containing(offset, param.range, ret.range);
            return { t: 'fun', range, param, ret };
        }

        case TypeOp.Hole:
        case TypeOp.Ref:
        case TypeOp.Var: {
            let t: 'hole' | 'ref' | 'var';
            if (byte === TypeOp.Hole) t = 'hole';
            else if (byte === TypeOp.Ref) t = 'ref';
            else t = 'var';
            if (offset + 1 >= bytecode.length) {
                throw Error('unexpected end-of-bytecode');
            }
            const id = bytecode[offset + 1]!;
            const range = { start: offset, end: offset + 2 };
            return { t, range, id };
        }

        case TypeOp.Kind: {
            const range = { start: offset, end: offset + 1 };
            return { t: 'kind', range };
        }

        case TypeOp.Constr: {
            let range: Range | undefined;
            let start: number = offset + 1;
            const exprs: Disasm[] = [];
            while (true) {
                const expr = disassemble(bytecode, start);
                start = expr.range.end;
                if (range === undefined) {
                    range = containing(offset, expr.range);
                } else {
                    range = containing(range, expr.range);
                }
                exprs.push(expr);
                if (bytecode[start] !== TypeOp.Constr) {
                    break;
                }
            }
            return { t: 'constr', range, exprs };
        }

        case TypeOp.Apply: {
            const head = disassemble(bytecode, offset + 1);
            const arg = disassemble(bytecode, head.range.end);
            const range = containing(offset, head.range, arg.range);
            return { t: 'apply', range, head, arg };
        }

        default:
            throw Error('unknown opcode');
    }
}

const containing = (...ranges: (Range | number)[]): Range => {
    let start: number = +Infinity;
    let end: number = 0;
    for (const range of ranges) {
        if (typeof range === 'number') {
            start = Math.min(start, range);
        } else {
            start = Math.min(start, range.start);
            end = Math.max(end, range.end);
        }
    }
    return { start, end };
};

export function stringify(ir: Disasm): string {
    return _stringify(ir);
}

function _stringify(ir: Disasm, nested?: boolean): string {
    switch (ir.t) {
        case 'forall':
        case 'exists': {
            const param = ir.param && _stringify(ir.param);
            const body = _stringify(ir.body);
            if (param) {
                return `${ir.t}: ${param}. ${body}`;
            } else {
                return `${ir.t}. ${body}`;
            }
        }

        case 'fun': {
            const param = _stringify(ir.param, true);
            const ret = _stringify(ir.ret);
            const str = `${param} -> ${ret}`;
            return nested ? `(${str})` : str;
        }

        case 'hole':
            return `_${ir.id}`;

        case 'ref':
            return `#${ir.id}`;

        case 'var':
            return `v${ir.id}`;

        case 'kind':
            return '*';

        case 'constr': {
            const terms: string[] = [];
            for (const expr of ir.exprs) {
                terms.push(_stringify(expr, true));
            }
            return terms.join(' ');
        }

        case 'apply': {
            const head = _stringify(ir.head, false);
            const arg = _stringify(ir.arg, true);
            if (nested === false) {
                return `${head} ${arg}`;
            }
            return `(${head} ${arg})`;
        }
    }
}

// const a : Var = {t:'a');
// const x : Var = ('x');
// const T : Ref = (42);

// const ast = Forall([Param(x), Param(a, Fun(Fun(Kind(), Kind()), Kind()))], Apply(a, x, T, T));
// const bytecode = Bytecode.encode(ast);
// print(bytecode);

// const decoded = Bytecode.disassemble(bytecode, 0);
// print(decoded);
// print(Bytecode.stringify(decoded));

// const bytes = u.compile(ast);
// console.log(bytes);
// console.log(u.stringify(bytes).str.join(' '));

// class Context {
//     //
// }
