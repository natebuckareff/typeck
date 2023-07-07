import type { AST } from './ast.js';
import type { PartialKey, PartialMap } from './partial-map.js';

export type UnifierExpr = AST.Type.Expr | PartialKey;

export class Unifier {
    private _pmap: PartialMap | undefined;

    public left: Map<number, UnifierExpr[]>;
    public right: Map<number, UnifierExpr[]>;
    public bindings: UnifierExpr[][];

    constructor(pmap?: PartialMap) {
        this._pmap = pmap;
        this.left = new Map();
        this.right = new Map();
        this.bindings = [];
    }

    unify(lhs: AST.Type.Expr, rhs: AST.Type.Expr): boolean {
        return this._unify(lhs, rhs);
    }

    private _unify(lhs: AST.Type.Expr, rhs: AST.Type.Expr, partial?: AST.Type.Partial): boolean {
        if (typeof lhs === 'number') {
            let bindings = this.left.get(lhs);
            if (bindings === undefined) {
                bindings = [];
                this.left.set(lhs, bindings);
                this.bindings.push(bindings);
            }
            if (typeof rhs !== 'number' && rhs.t === 'type-hole') {
                const id = partial && this._pmap?.find(partial, rhs);
                if (id === undefined) throw Error('assertion failed?');
                bindings.push(id);
            } else {
                bindings.push(rhs);
            }
        }

        if (typeof rhs === 'number') {
            let bindings = this.right.get(rhs);
            if (bindings === undefined) {
                bindings = [];
                this.right.set(rhs, bindings);
                this.bindings.push(bindings);
            }
            if (typeof lhs !== 'number' && lhs.t === 'type-hole') {
                const id = partial && this._pmap?.find(partial, lhs);
                if (id === undefined) throw Error('assertion failed?');
                bindings.push(id);
            } else {
                bindings.push(lhs);
            }
        }

        if (typeof lhs === 'number' || typeof rhs === 'number') return true;
        if (lhs.t !== rhs.t) return false;

        switch (lhs.t) {
            case 'type-partial': {
                rhs = rhs as AST.Type.Partial;
                return this._unify(lhs.type, rhs.type, lhs);
            }

            case 'type-hole':
                return true;

            case 'type-apply': {
                rhs = rhs as AST.Type.Apply;
                if (lhs.head !== rhs.head) return false;
                if (lhs.args.length !== rhs.args.length) return false;
                for (let i = 0; i < lhs.args.length; ++i) {
                    if (!this._unify(lhs.args[i]!, rhs.args[i]!, partial)) {
                        return false;
                    }
                }
                return true;
            }

            case 'type-tuple': {
                rhs = rhs as AST.Type.Tuple;
                if (lhs.elements.length !== rhs.elements.length) return false;
                for (let i = 0; i < lhs.elements.length; ++i) {
                    if (!this._unify(lhs.elements[i]!, rhs.elements[i]!, partial)) {
                        return false;
                    }
                }
                return true;
            }

            case 'type-fun': {
                rhs = rhs as AST.Type.Fun;
                if (lhs.params.length !== rhs.params.length) return false;
                for (let i = 0; i < lhs.params.length; ++i) {
                    if (!this._unify(lhs.params[i]!, rhs.params[i]!, partial)) {
                        return false;
                    }
                }
                return true;
            }
        }
    }
}
