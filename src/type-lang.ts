import assert from 'node:assert';
import { TypeCode, TypeOp } from './type-code';

export type TypeLang =
    | TypeLang.Forall
    | TypeLang.Kind
    | TypeLang.Var
    | TypeLang.Fun
    | TypeLang.Apply;

export namespace TypeLang {
    export interface Forall {
        op: TypeOp.Forall;
        param: Param;
        expr: TypeLang;
    }

    export type Param = Kind | TypeLang[];

    export type Kind = TypeOp.Concrete | Hkt;

    export interface Hkt {
        op: TypeOp.Hkt;
        expr: [Kind, Kind];
    }

    export interface Var {
        op: TypeOp.Hole | TypeOp.Var | TypeOp.Ref;
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
        code: TypeCode;
        offset: number;
    }

    export function isKind(x: TypeLang): x is Kind {
        return x === TypeOp.Concrete || x.op === TypeOp.Hkt;
    }

    export function isFun(x: TypeLang): x is Fun {
        return typeof x !== 'number' && x.op === TypeOp.Fun;
    }

    export type Decoding<T> = [T, number];

    export function decode(span: Span): Decoding<TypeLang> {
        const { code, offset } = span;
        const op = code.codePointAt(offset);

        switch (op) {
            case TypeOp.Forall:
                return decodeForall(span);

            case TypeOp.Hole:
                return [{ op: TypeOp.Hole, id: offset }, offset + 1];

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

    function decodeForall(span: Span): Decoding<TypeLang.Forall> {
        const { code, offset } = span;
        const nextOp = code.codePointAt(offset + 1);

        if (nextOp === TypeOp.Hkt) {
            const [param, paramOffset] = decodeHkt({ code, offset: offset + 1 });
            const [expr, exprOffset] = decode({ code, offset: paramOffset });
            return [{ op: TypeOp.Forall, param, expr }, exprOffset];
        }

        if (nextOp === TypeOp.Impl) {
            let constrOffset = offset + 2;
            const param: TypeLang[] = [];
            do {
                let constr: TypeLang;
                [constr, constrOffset] = decode({ code, offset: constrOffset });
                param.push(constr);
            } while (code.codePointAt(constrOffset) === TypeOp.Impl);
            const [expr, exprOffset] = decode({ code, offset: constrOffset });
            return [{ op: TypeOp.Forall, param, expr }, exprOffset];
        }

        assert(nextOp !== undefined);

        const [expr, exprOffset] = decode({ code, offset: offset + 1 });
        return [{ op: TypeOp.Forall, param: TypeOp.Concrete, expr }, exprOffset];
    }

    function decodeHkt({ code, offset }: Span): Decoding<TypeLang.Hkt> {
        const [param0, offset0] = decodeKind({ code, offset: offset + 1 });
        const [param1, offset1] = decodeKind({ code, offset: offset0 });
        return [{ op: TypeOp.Hkt, expr: [param0, param1] }, offset1];
    }

    function decodeKind(span: Span): Decoding<TypeLang.Kind> {
        const { code, offset } = span;
        const op = code.codePointAt(offset);

        if (op === TypeOp.Concrete) {
            return [op, offset + 1];
        }

        assert(op === TypeOp.Hkt);

        return decodeHkt(span);
    }

    export const stringify = (ast: TypeLang): string => {
        if (ast === TypeOp.Concrete) {
            return '*';
        }

        switch (ast.op) {
            case TypeOp.Forall: {
                if (ast.param === undefined) {
                    return `∀. ${stringify(ast.expr)}`;
                }
                if (Array.isArray(ast.param)) {
                    return `∀ ${ast.param.map(stringify).join(' + ')}. ${stringify(ast.expr)}`;
                }
                return `∀ ${stringify(ast.param)}. ${stringify(ast.expr)}`;
            }

            case TypeOp.Hole:
                return `_${ast.id}`;

            case TypeOp.Hkt:
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

    export interface Datatype {
        name: string;
        params: Param[];
    }

    export class Context {
        private _datatypes: Map<number, Datatype>;
        private _holes: Map<number, TypeLang>;

        constructor() {
            this._datatypes = new Map();
            this._holes = new Map();
        }

        define(id: number, name: string, params: Param[] = []): void {
            this._datatypes.set(id, { name, params });
        }

        // Given an AST of nested forall nodes, extract the first non-forall
        // descendant and returning the parameters of the discarded foralls
        unwrap(ast: TypeLang): [TypeLang, Param[]] {
            if (typeof ast === 'number' || ast.op !== TypeOp.Forall) {
                throw Error('cannot unwrap unquantified expression');
            }
            const params: Param[] = [];
            do {
                params.push(ast.param);
                ast = ast.expr;
            } while (typeof ast !== 'number' && ast.op === TypeOp.Forall);
            return [ast, params];
        }

        // Compute the kind of an arbitrary type AST
        kind(ast: TypeLang, params: Param[]): Kind | undefined {
            if (ast === TypeOp.Concrete || ast.op === TypeOp.Hkt) {
                throw Error('kinds do not have a kind');
            }

            switch (ast.op) {
                // Functions, generic functions, and existential types are
                // concrete
                case TypeOp.Forall:
                case TypeOp.Fun:
                    return TypeOp.Concrete;

                // If a bound variable is constrained, it is concrete, otherwise
                // it has an explicit kind
                case TypeOp.Var: {
                    const param = params[ast.id]!;
                    return this._paramToKind(param);
                }

                // Check if a type hole has been inferred and compute its kind
                case TypeOp.Hole: {
                    const type = this._holes.get(ast.id);
                    return type && this.kind(type, params);
                }

                // Lookup datatype ref and compute its kind from its parameter
                // list. The datatype parameter list can be thought of as the
                // foralls wrapping each constructor
                case TypeOp.Ref: {
                    const datatype = this._datatypes.get(ast.id);
                    if (datatype === undefined) {
                        throw Error('ref not defined');
                    }
                    // Convert datatype parameter list to kind
                    return this._paramsToHkt(datatype.params);
                }

                // HKTs are like type-level functions, so the kind of a type
                // application is the "return type" of the applied HKT. The kind
                // of the HKT's parameter must equal the kind of the argument
                // type
                case TypeOp.Apply: {
                    const head = this.kind(ast.expr[0], params);

                    if (head === undefined) {
                        return;
                    }

                    // Cannot apply a concrete type
                    if (head === TypeOp.Concrete) {
                        throw Error('invalid number of type parameters');
                    }

                    const param = head.expr[0];
                    const arg = this.kind(ast.expr[1], params);

                    if (arg === undefined) {
                        return;
                    }

                    // Ensure that the kind of the first parameter of the
                    // applied HKT is equal to the kind of the applying type
                    // argument
                    const paramTc = TypeCode.encode(TypeCode.compile(param));
                    const argTc = TypeCode.encode(TypeCode.compile(param));

                    if (paramTc !== argTc) {
                        throw Error('kinds not equal');
                    }

                    return head.expr[1];
                }
            }
        }

        // Convert a datatype's parameter list to the corresponding HKT
        private _paramsToHkt(params: TypeLang.Param[]): Hkt {
            if (params.length <= 0) {
                throw Error('invalid datatype parameter list');
            }
            const first = this._paramToKind(params[0]!);
            let second: Kind;
            if (params.length === 1) {
                second = TypeOp.Concrete;
            } else {
                second = this._paramsToHkt(params.slice(1));
            }
            return { op: TypeOp.Hkt, expr: [first, second] };
        }

        // Convert a single datatype type parameter to a kind
        private _paramToKind(param: TypeLang.Param): Kind {
            return Array.isArray(param) ? TypeOp.Concrete : param;
        }

        // Check if `lhs` and `rhs` represent the same type
        unify(lhs: TypeLang, rhs: TypeLang, params: Param[], captured: TypeLang[][]): boolean {
            // If the left-hand side is an unbound variable, attempt to
            // instantiate it with the right-hand side type
            if (typeof lhs !== 'number' && lhs.op === TypeOp.Var && lhs.id < params.length) {
                let instances = captured[lhs.id];

                // Initialize the instance set
                if (instances === undefined) {
                    instances = [];
                    captured[lhs.id] = instances;
                }

                // Get the corresponding unbound parameter
                const param = params[lhs.id]!;

                // Attempt to instantiate the unbound, capturing paramter with
                // the right-hand side type
                if (!this.instantiate(param, rhs)) {
                    return false;
                }

                // Check that the newly captured type unifies with the existing
                // instances. The reason we capture all of them is to maximise
                // type inferrence (type holes)
                for (const x of instances) {
                    if (!this.unify(x, rhs, params, captured)) {
                        return false;
                    }
                }

                instances.push(rhs);

                return true;
            }

            // Kinds are not types so we do not unify them
            if (isKind(lhs) || isKind(rhs)) {
                throw Error('cannot unify higher-kinded types');
            }

            if (lhs.op === TypeOp.Forall || rhs.op === TypeOp.Forall) {
                const [lresult, lparams] = this.unwrap(lhs);
                const [rresult, rparams] = this.unwrap(rhs);

                // If a type is wrapped in a forall its either a generic
                // function or an existential type. Existentials unify with
                // nothing except exactly themselves
                if (!isFun(lresult) || !isFun(rresult)) {
                    // This equality is the "exactly" part. If the same
                    // existential AST node is passed in it should unify with
                    // itself
                    return lresult === rresult;
                }

                /*
                    Function type unity

                        <T, U>(t: T) -> U ~= <X, Y>(x: X) -> Y

                        X ~= T
                        U ~= Y

                    The way to think about function type unity is that the
                    arguments types of the left-hand side will be assinged to
                    the arguments of the right-hand side, and the return type of
                    the right-hand side is assigned to the return type of the
                    left-hand side. The asymmetry is what gives rise to
                    contravariance.
                */

                throw Error('todo');
            }

            if (lhs.op !== rhs.op) {
                return false;
            }

            switch (lhs.op) {
                // Attempt to infer type of hole. If the hole has already been
                // inferred, check that the types unify
                case TypeOp.Hole: {
                    const type = this._holes.get(lhs.id);
                    if (type === undefined) {
                        this._holes.set(lhs.id, rhs);
                        return true;
                    }
                    return this.unify(type, rhs, params, captured);
                }

                // Nominal types and bound variables only unify with themselves
                case TypeOp.Ref:
                case TypeOp.Var:
                    return lhs.id === (rhs as Var).id;

                case TypeOp.Fun:
                    // This is duplicating functionality in the forall path
                    throw Error('todo');

                // Type application is unified structurally
                case TypeOp.Apply: {
                    const [l0, l1] = lhs.expr;
                    const [r0, r1] = (rhs as Fun | Apply).expr;
                    const r = this.unify(l0, r0, params, captured);
                    return r && this.unify(l1, r1, params, captured);
                }
            }
        }

        instantiate(param: Param, type: TypeLang): boolean {
            throw Error('todo');
        }
    }
}
