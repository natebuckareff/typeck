import type { AST } from './ast.js';

export type PartialKey = AST.Var<'partial-key'>;

export interface PartialMapEntry {
    partial: AST.Type.Partial;
    hole: AST.Type.Hole;
}

export class PartialMap {
    private _partials: Map<number, Map<number, PartialKey>>;
    private _holes: Map<PartialKey, PartialMapEntry>;

    constructor() {
        this._partials = new Map();
        this._holes = new Map();
    }

    get(id: PartialKey): PartialMapEntry | undefined {
        return this._holes.get(id);
    }

    find(partial: AST.Type.Partial, hole: AST.Type.Hole): PartialKey | undefined {
        return this._partials.get(partial.id)?.get(hole.id);
    }

    add(partial: AST.Type.Partial, hole: AST.Type.Hole, id: PartialKey): void {
        let p = this._partials.get(partial.id);
        if (p === undefined) {
            p = new Map();
            this._partials.set(partial.id, p);
        }
        p.set(hole.id, id);
        this._holes.set(id, { partial, hole });
    }

    delete(id: PartialKey): boolean {
        const entry = this.get(id);
        if (entry === undefined) return false;
        const { partial, hole } = entry;
        this._holes.delete(id);
        this._partials.get(partial.id)?.delete(hole.id);
        return true;
    }
}
