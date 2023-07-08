import type { AST } from './ast';

export type VarType = AST.Type.Entity | AST.Value.Entity;

export type Var<T extends VarType> = number & { readonly T: T; readonly Var: unique symbol };

export function Var<const T extends VarType>(t: T['t'], id: number): Var<T> {
    return ((id << 4) | (VARTYPE_INDEX[t] >>> 0)) as Var<T>;
}

export function varis<const T extends VarType['t']>(
    id: Var<VarType>,
    ts: T[],
): id is Var<Extract<VarType, { t: T }>> {
    return (ts as VarType['t'][]).includes(vartype(id));
}

export function vartype(id: Var<VarType>): VarType['t'] {
    return INDEX_VARTYPE[id & 0b1111]!;
}

const VARTYPE_INDEX: Record<VarType['t'], number> = {
    ['type:alias']: 0,
    ['type:data']: 1,
    ['type:data-ctor']: 2,
    ['type:trait']: 3,
    ['type:trait-method']: 4,
    ['type:param']: 5,
    ['type:partial']: 6,
    ['type:hole']: 7,
    ['value:impl']: 8,
    ['value:method']: 9,
    ['value:fun-param']: 10,
    ['value:let']: 11,
};

const INDEX_VARTYPE: Record<number, VarType['t']> = {
    0: 'type:alias',
    1: 'type:data',
    2: 'type:data-ctor',
    3: 'type:trait',
    4: 'type:trait-method',
    5: 'type:param',
    6: 'type:partial',
    7: 'type:hole',
    8: 'value:impl',
    9: 'value:method',
    10: 'value:fun-param',
    11: 'value:let',
};
