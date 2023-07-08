import { AST } from './ast.js';
import { varis } from './var.js';

export type UnifierExpr = AST.Type.Expr | AST.Type.Partial.Key;

export type UniVar = AST.Type.Param['id'] | AST.Type.Hole['id'];

export class Unifier {
    public left: Map<UniVar, UnifierExpr[]>;
    public right: Map<UniVar, UnifierExpr[]>;
    public bindings: UnifierExpr[][];

    constructor() {
        this.left = new Map();
        this.right = new Map();
        this.bindings = [];
    }

    unify(lhs: AST.Type.Expr, rhs: AST.Type.Expr): boolean {
        return this._unify(lhs, rhs);
    }

    private _unify(lhs: AST.Type.Expr, rhs: AST.Type.Expr, partial?: AST.Type.Partial['id']): boolean {
        if (typeof lhs === 'number') {
            let bindings = this.left.get(lhs);
            if (bindings === undefined) {
                bindings = [];
                this.left.set(lhs, bindings);
                this.bindings.push(bindings);
            }
            if (typeof rhs === 'number' && varis(rhs, ['type:hole'])) {
                if (partial === undefined) throw Error('assertion failed?');
                const key = AST.Type.Partial.pack(partial, rhs);
                bindings.push(key);
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
            if (typeof lhs === 'number' && varis(lhs, ['type:hole'])) {
                if (partial === undefined) throw Error('assertion failed?');
                const key = AST.Type.Partial.pack(partial, lhs);
                bindings.push(key);
            } else {
                bindings.push(lhs);
            }
        }

        if (typeof lhs === 'number' || typeof rhs === 'number') return true;

        if (lhs.t === 'type:forall') {
            this._unify(lhs.type, rhs);
            return true;
        }
        if (rhs.t === 'type:forall') {
            this._unify(lhs, rhs.type);
            return true;
        }

        if (lhs.t === 'type:partial') {
            this._unify(lhs.type, rhs, lhs.id);
            return true;
        }
        if (rhs.t === 'type:partial') {
            this._unify(lhs, rhs.type, rhs.id);
            return true;
        }

        if (lhs.t !== rhs.t) return false;

        switch (lhs.t) {
            case 'type:apply': {
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

            case 'type:tuple': {
                rhs = rhs as AST.Type.Tuple;
                if (lhs.elements.length !== rhs.elements.length) return false;
                for (let i = 0; i < lhs.elements.length; ++i) {
                    if (!this._unify(lhs.elements[i]!, rhs.elements[i]!, partial)) {
                        return false;
                    }
                }
                return true;
            }

            case 'type:fun': {
                rhs = rhs as AST.Type.Fun;
                if (lhs.params.length !== rhs.params.length) return false;
                for (let i = 0; i < lhs.params.length; ++i) {
                    if (!this._unify(lhs.params[i]!, rhs.params[i]!, partial)) {
                        return false;
                    }
                }
                this._unify(lhs.ret, rhs.ret, partial);
                return true;
            }
        }
    }
}
