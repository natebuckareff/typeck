import { AST } from './ast.js';
import { Unifier } from './unifier.js';
import { print } from './util.js';
import { Var } from './var.js';

const v = {
    A: Var<AST.Type.Param>('type:param', 0),
    T: Var<AST.Type.Param>('type:param', 1),
    U: Var<AST.Type.Param>('type:param', 2),
};

const f: AST.Type.Expr = {
    t: 'type:fun',
    tparams: [{ t: 'type:param', id: v.A, name: 'A', constraints: [] }],
    params: [v.A, v.A],
    ret: v.A,
};

const g: AST.Type.Expr = {
    t: 'type:fun',
    tparams: [
        { t: 'type:param', id: v.T, name: 'T', constraints: [] },
        { t: 'type:param', id: v.U, name: 'U', constraints: [] },
    ],
    params: [v.T, v.U],
    ret: v.U,
};

const u = new Unifier();
print(u.unify(f, g));
print(u);

/*
const ids = {
    Int: Var<'type-data'>(0),
    List: Var<'type-data'>(1),
    list_hole: Var<'type-hole'>(2),
    push_T: Var<'type-param'>(3),
};

const list: AST.Type.Expr = {
    t: 'type-apply',
    head: ids.List,
    args: [{ t: 'type-hole', id: ids.list_hole }],
};

const value: AST.Type.Expr = {
    t: 'type-apply',
    head: ids.Int,
    args: [],
};

const push: AST.Type.Expr = {
    t: 'type-fun',
    tparams: [{ t: 'type-param', id: ids.push_T, name: 'T', constraints: [] }],
    params: [{ t: 'type-apply', head: ids.List, args: [ids.push_T] }, ids.push_T],
    ret: { t: 'type-apply', head: ids.List, args: [ids.push_T] },
};

const u = new Unification();
u.unify(push.params[0]!, list);
u.unify(push.params[1]!, value);
print(u);
*/
