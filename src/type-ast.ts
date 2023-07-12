export type Expr = Forall | Exists | Hole | Ref | Var | Fun | Apply;

export interface Forall {
    t: 'forall';
    params: Param[];
    expr: Expr;
}

export interface Exists {
    t: 'exists';
    params: Param[];
    expr: Expr;
}

export type Param = ParamConstrained | ParamHigherKinded;

export interface ParamConstrained {
    t: 'param-constrained';
    id: number;
    constraints: Constraint[];
}

export interface Constraint {
    t: 'constraint';
    id: number;
    args: Expr[];
}

export interface ParamHigherKinded {
    t: 'param-higher-kinded';
    id: number;
    kind: FunHKT;
}

export interface FunHKT {
    t: 'fun-hkt';
    params: Kind[];
}

export type Kind = '*' | FunHKT;

export interface Hole {
    t: 'hole';
    id: number;
}

export interface Ref {
    t: 'ref';
    id: number;
}

export interface Var {
    t: 'var';
    id: number;
}

export interface Fun {
    t: 'fun';
    params: Expr[];
}

export interface Apply {
    t: 'apply';
    head: Expr;
    args: Expr[];
}
