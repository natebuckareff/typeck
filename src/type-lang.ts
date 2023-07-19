import assert from 'node:assert';
import { TypeOp, type TypeCodeString } from './type-code';

export type TypeLang =
    | TypeLang.Quantifier
    | TypeLang.Hole
    | TypeLang.Var
    | TypeLang.Fun
    | TypeLang.Apply;

export namespace TypeLang {
    export interface Quantifier {
        op: TypeOp.Forall | TypeOp.Exists;
        param?: KindFun | TypeLang[];
        expr: TypeLang;
    }

    export type HKT = TypeOp.Kind | KindFun;

    export interface KindFun {
        op: TypeOp.KindFun;
        expr: [HKT, HKT];
    }

    export type Hole = TypeOp.Hole;

    export interface Var {
        op: TypeOp.Var | TypeOp.Ref;
        id: number;
    }

    export interface Fun {
        op: TypeOp.Fun;
        expr: [TypeLang, TypeLang];
    }

    export interface Apply {
        op: TypeOp.Apply;
        expr: [TypeLang, TypeLang];
    }

    export interface Span {
        code: TypeCodeString;
        offset: number;
    }

    export type Decoding<T> = [T, number];

    export function decode(span: Span): Decoding<TypeLang> {
        const { code, offset } = span;
        const op = code.codePointAt(offset);

        switch (op) {
            case TypeOp.Forall:
            case TypeOp.Exists:
                return decodeQuantifier(op, span);

            case TypeOp.Hole:
                return [op, offset + 1];

            case TypeOp.Var:
            case TypeOp.Ref: {
                const id = code.codePointAt(offset + 1);
                assert(id !== undefined);
                return [{ op, id }, offset + 2];
            }

            case TypeOp.Fun:
            case TypeOp.Apply: {
                const [param0, offset0] = decode({ code, offset: offset + 1 });
                const [param1, offset1] = decode({ code, offset: offset0 });
                return [{ op, expr: [param0, param1] }, offset1];
            }

            default:
                throw Error('invalid type op');
        }
    }

    type QOp = TypeOp.Forall | TypeOp.Exists;

    function decodeQuantifier(op: QOp, span: Span): Decoding<TypeLang.Quantifier> {
        const { code, offset } = span;
        const nextOp = code.codePointAt(offset + 1);

        if (nextOp === TypeOp.KindFun) {
            const [param, paramOffset] = decodeKindFun({ code, offset: offset + 1 });
            const [expr, exprOffset] = decode({ code, offset: paramOffset });
            return [{ op, param, expr }, exprOffset];
        }

        if (nextOp === TypeOp.Constr) {
            let constrOffset = offset + 2;
            const param: TypeLang[] = [];
            do {
                let constr: TypeLang;
                [constr, constrOffset] = decode({ code, offset: constrOffset });
                param.push(constr);
            } while (code.codePointAt(constrOffset) === TypeOp.Constr);
            const [expr, exprOffset] = decode({ code, offset: constrOffset });
            return [{ op, param, expr }, exprOffset];
        }

        assert(nextOp !== undefined);

        const [expr, exprOffset] = decode({ code, offset: offset + 1 });
        return [{ op, expr }, exprOffset];
    }

    function decodeKindFun({ code, offset }: Span): Decoding<TypeLang.KindFun> {
        const [param0, offset0] = decodeKind({ code, offset: offset + 1 });
        const [param1, offset1] = decodeKind({ code, offset: offset0 });
        return [{ op: TypeOp.KindFun, expr: [param0, param1] }, offset1];
    }

    function decodeKind(span: Span): Decoding<TypeLang.HKT> {
        const { code, offset } = span;
        const op = code.codePointAt(offset);

        if (op === TypeOp.Kind) {
            return [op, offset + 1];
        }

        assert(op === TypeOp.KindFun);

        return decodeKindFun(span);
    }

    export const stringify = (ast: TypeLang | TypeLang.HKT): string => {
        if (ast === TypeOp.Kind) {
            return '*';
        }

        if (ast === TypeOp.Hole) {
            return '_';
        }

        switch (ast.op) {
            case TypeOp.Forall:
            case TypeOp.Exists: {
                const h = ast.op === TypeOp.Forall ? '∀' : '∃';
                if (ast.param === undefined) {
                    return `${h}. ${stringify(ast.expr)}`;
                }
                if (Array.isArray(ast.param)) {
                    return `${h} ${ast.param.map(stringify).join(' + ')}. ${stringify(ast.expr)}`;
                }
                return `${h} ${stringify(ast.param)}. ${stringify(ast.expr)}`;
            }

            case TypeOp.KindFun:
            case TypeOp.Fun: {
                const [x, y] = ast.expr;
                return `(${stringify(x)} -> ${stringify(y)})`;
            }

            case TypeOp.Var:
                return ast.id + '';

            case TypeOp.Ref:
                return `@${ast.id}`;

            case TypeOp.Apply:
                const [x, y] = ast.expr;
                return `(${stringify(x)} ${stringify(y)})`;
        }
    };
}
