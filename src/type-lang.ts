import assert from 'node:assert';
import { TypeCode, TypeOp } from './type-code.js';

export type TypeLang =
    | TypeLang.Forall
    | TypeLang.Kind
    | TypeLang.Hole
    | TypeLang.Var
    | TypeLang.Ref
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

    export interface Hole {
        op: TypeOp.Hole;
        id: number;
    }

    export interface Var {
        op: TypeOp.Var | TypeOp.Ref;
        id: number;
    }

    export interface Ref {
        op: TypeOp.Ref;
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

    export function isForall(x: TypeLang): x is Forall {
        return typeof x !== 'number' && x.op === TypeOp.Forall;
    }

    export function isKind(x: TypeLang): x is Kind {
        return x === TypeOp.Concrete || x.op === TypeOp.Hkt;
    }

    export function isHole(x: TypeLang): x is Hole {
        return typeof x !== 'number' && x.op === TypeOp.Hole;
    }

    export function isVar(x: TypeLang): x is Var {
        return typeof x !== 'number' && x.op === TypeOp.Var;
    }

    export function isRef(x: TypeLang): x is Ref {
        return typeof x !== 'number' && x.op === TypeOp.Var;
    }

    export function isFun(x: TypeLang): x is Fun {
        return typeof x !== 'number' && x.op === TypeOp.Fun;
    }

    export interface Span {
        code: TypeCode;
        offset: number;
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

    export interface Trait {
        name: string;
        params: Param[];
    }

    export interface TraitImpl {
        // TODO
    }

    // TODO: This and the `unify` method should be a separate `Unifier` class
    export class UnityState {
        constructor(
            public params: { lhs: Param[]; rhs: Param[] },
            public captured: { lhs: TypeLang[][]; rhs: TypeLang[][] },
        ) {}

        static empty(): UnityState {
            return new UnityState({ lhs: [], rhs: [] }, { lhs: [], rhs: [] });
        }

        swap(): UnityState {
            return new UnityState(
                { lhs: this.params.rhs, rhs: this.params.lhs },
                { lhs: this.captured.rhs, rhs: this.captured.lhs },
            );
        }
    }

    export class Context {
        private _datatypes: Map<number, Datatype>;
        private _traits: Map<number, Trait>;
        private _holes: Map<number, TypeLang>;
        private _impls: Map<TypeCode, Map<TypeCode, TraitImpl>>;

        constructor() {
            this._datatypes = new Map();
            this._traits = new Map();
            this._holes = new Map();
            this._impls = new Map();
        }

        defineDatatype(id: number, name: string, params: Param[] = []): void {
            this._datatypes.set(id, { name, params });
        }

        defineTrait(id: number, name: string, params: Param[] = []): void {
            this._traits.set(id, { name, params });
        }

        defineImpl(type: TypeLang, trait: TypeLang, impl: TraitImpl): void {
            const typeTc = TypeCode.encode(TypeCode.compile(type));
            const traitTc = TypeCode.encode(TypeCode.compile(trait));

            let traitImpls = this._impls.get(traitTc);
            if (traitImpls === undefined) {
                traitImpls = new Map();
                this._impls.set(traitTc, traitImpls);
            }
            traitImpls.set(typeTc, impl);
        }

        // Check that the AST is a valid type
        check(ast: TypeLang, params: Param[]): boolean {
            if (ast === TypeOp.Concrete || ast.op === TypeOp.Hkt) {
                return true;
            }

            switch (ast.op) {
                case TypeOp.Forall: {
                    const { param } = ast;
                    if (Array.isArray(param)) {
                        // Check contraints
                        for (const constr of param) {
                            if (!this.check(constr, params)) {
                                return false;
                            }
                        }
                    }
                    return this.check(ast.expr, [param, ...params]);
                }

                case TypeOp.Hole:
                    throw Error('todo');

                case TypeOp.Ref:
                    return this._datatypes.has(ast.id);

                case TypeOp.Var:
                    return ast.id < params.length;

                case TypeOp.Fun: {
                    const [x, y] = ast.expr;
                    return this.check(x, params) && this.check(y, params);
                }

                case TypeOp.Apply:
                    const [h, a] = ast.expr;

                    if (!this.check(h, params) || !this.check(a, params)) {
                        return false;
                    }

                    const headKind = this.kind(h, params);

                    if (headKind === undefined || headKind === TypeOp.Concrete) {
                        return false;
                    }

                    const argKind = this.kind(a, params);

                    if (argKind === undefined) {
                        return false;
                    }

                    const headTc = TypeCode.encode(TypeCode.compile(headKind));
                    const argTc = TypeCode.encode(TypeCode.compile(argKind));

                    return headTc !== argTc;
            }
        }

        // Given an AST of nested forall nodes, extract the first non-forall
        // descendant and returning the parameters of the discarded foralls
        unwrap(ast: TypeLang): [Exclude<TypeLang, Forall>, Param[]] {
            if (!isForall(ast)) {
                throw Error('cannot unwrap unquantified expression');
            }
            const params: Param[] = [];
            do {
                params.push(ast.param);
                ast = ast.expr;
            } while (isForall(ast));
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
                // application is the "return type" of the applied HKT
                case TypeOp.Apply: {
                    // NOTE: We check that the argument can actually be applied
                    // in `check`

                    const head = this.kind(ast.expr[0], params);

                    if (head === undefined) {
                        return;
                    }

                    // Cannot apply a concrete type
                    if (head === TypeOp.Concrete) {
                        throw Error('invalid number of type parameters');
                    }

                    return head.expr[1];
                }
            }
        }

        // Convert a datatype's parameter list to the corresponding HKT
        private _paramsToHkt(params: TypeLang.Param[]): Kind {
            if (params.length === 0) {
                return TypeOp.Concrete;
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
        unify(lhs: TypeLang, rhs: TypeLang, state: UnityState): boolean {
            // If the left-hand side is an unbound variable, attempt to
            // instantiate it with the right-hand side type
            if (isVar(lhs) && lhs.id < state.params.lhs.length) {
                let instances = state.captured.lhs[lhs.id];

                // Initialize the instance set
                if (instances === undefined) {
                    instances = [];
                    state.captured.lhs[lhs.id] = instances;
                }

                // Get the corresponding unbound parameter
                const param = state.params.lhs[lhs.id]!;

                // Attempt to instantiate the unbound, capturing paramter with
                // the right-hand side type
                if (!this.instantiate(param, rhs, state.params.rhs)) {
                    console.log('ERROR: failed to insatiate');
                    return false;
                }

                // Check that the newly captured type unifies with the existing
                // instances. The reason we capture all of them is to maximise
                // type inferrence (type holes)
                for (const x of instances) {
                    if (!this.unify(x, rhs, UnityState.empty())) {
                        console.log('ERROR: failed to unify captures');
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

            // Unify generic function types
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
                    if (lresult !== rresult) {
                        console.log('ERROR: failed to unify existential types');
                        return false;
                    }
                    return true;
                }

                // Merge the unwrapped parameters
                const nextState = new UnityState(
                    {
                        lhs: [...state.params.lhs, ...lparams],
                        rhs: [...state.params.rhs, ...rparams],
                    },
                    state.captured,
                );

                // Unify the function types
                return this.unify(lresult, rresult, nextState);
            }

            // Fill type holes
            if (lhs.op === TypeOp.Hole || rhs.op === TypeOp.Hole) {
                // If both the left-hand and right-hand side are type holes,
                // type inferrence information should propogate between the two
                // holes
                if (lhs.op === TypeOp.Hole && rhs.op === TypeOp.Hole) {
                    // It's the same hole
                    if (lhs.id === rhs.id) {
                        return true;
                    }

                    const lhole = this._holes.get(lhs.id);
                    const rhole = this._holes.get(rhs.id);

                    if (lhole === undefined && rhole === undefined) {
                        // If both holes are undefined, then we're unifying
                        // bottom/never with itself
                        console.log('ERROR: ⊥ ~= ⊥');
                        return false;
                    }

                    if (lhole === undefined) this._holes.set(lhs.id, rhole!);
                    if (rhole === undefined) this._holes.set(rhs.id, lhole!);

                    return true;
                }

                // Type hole inferrence needs more work
                throw Error('todo');
            }

            if (lhs.op !== rhs.op) {
                console.log('ERROR: type error');
                return false;
            }

            switch (lhs.op) {
                // Nominal types and bound variables only unify with themselves
                case TypeOp.Ref:
                    if (lhs.id !== (rhs as Var).id) {
                        console.log('ERROR: failed to unify nominal types');
                        return false;
                    }
                    return true;

                case TypeOp.Var:
                    console.log(
                        'ERROR: type parameters can be instatiated with arbitrary, unrelated types',
                    );
                    return false;

                case TypeOp.Fun: {
                    // Function type unity
                    //
                    // (fun x y) ~= (fun a b)
                    //
                    //     a ~= x
                    //     y ~= b
                    //
                    // The way to think about function type unity is that the
                    // arguments types of the left-hand side will be assinged to
                    // the arguments of the right-hand side when the function is
                    // called, and the return type of the right-hand side is
                    // assigned to the return type of the left-hand side when
                    // the function returns. The asymmetry is what gives rise to
                    // contravariance.
                    const [x, y] = lhs.expr;
                    const [a, b] = (rhs as Fun).expr;
                    const r = this.unify(a, x, state.swap());
                    return r && this.unify(y, b, state);
                }

                // Type application is unified structurally
                case TypeOp.Apply: {
                    const [l0, l1] = lhs.expr;
                    const [r0, r1] = (rhs as Apply).expr;
                    const r = this.unify(l0, r0, state);
                    return r && this.unify(l1, r1, state);
                }
            }
        }

        // Check if the type parameter `param` can be instantiated with the type
        // `type` which has variables bound to `params`
        instantiate(param: Param, type: TypeLang, params: Param[]): boolean {
            // Check if the parameter is constrained
            if (Array.isArray(param)) {
                // Check if the type implements the trait
                const typeTc = TypeCode.encode(TypeCode.compile(type));
                for (const constr of param) {
                    const traitTc = TypeCode.encode(TypeCode.compile(constr));
                    const impl = this._impls.get(traitTc)?.get(typeTc);
                    if (impl === undefined) {
                        return false;
                    }
                }
                return true;
            }

            const kind = this.kind(type, params);

            if (kind === undefined) {
                throw Error('invalid type expression');
            }

            // If the parameter and type's kinds match, then the parameter can
            // be instantiated with that type

            const paramTc = TypeCode.encode(TypeCode.compile(param));
            const typeTc = TypeCode.encode(TypeCode.compile(kind));

            return paramTc === typeTc;
        }
    }
}
