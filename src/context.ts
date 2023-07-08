import { AST } from './ast';
import { Unifier } from './unifier';
import { Var, varis, type VarType } from './var';

// TODO: ContextManager
//
// ContextManager centralizes var generation and manages a cache of context
// query results. Have to figure out what the core queries are first, and what
// they're keyed on. Just get type checking working first

export class Context {
    private _ids?: number;
    private _root: Context;
    private _parent: Context | undefined;
    private _domain: AST.Type.Domain | undefined;
    private _entities: Map<Var<VarType>, VarType>;
    private _names: Map<string, AST.Type.Symbolic>;
    private _impls: Map<AST.Type.Apply['head'], { args: AST.Type.Expr[]; impl: AST.Value.Impl['id'] }[]>;

    private constructor(parent?: Context, domain?: AST.Type.Domain) {
        this._root = parent?._root ?? this;
        this._parent = parent;
        this._domain = domain;
        this._entities = new Map();
        this._names = new Map();
        this._impls = new Map();
    }

    get root(): Context {
        return this._root;
    }

    get parent(): Context | undefined {
        return this._parent;
    }

    get domain(): AST.Type.Domain | undefined {
        return this._domain;
    }

    static empty() {
        return new Context();
    }

    // Create new unique variable
    // TODO: Is decoupling id generation from context (`ContextManager`?) simplier?
    // TODO: Choose between "variable" and "id" terminology
    var<T extends VarType>(t: T['t']): Var<T> {
        // Id generation is managed by the root context so that all ids under a
        // context tree are unique
        this._root._ids ??= 0;
        return Var(t, this._root._ids++);
    }

    // Define type alias or datatype in current scope
    define(def: AST.Type.Definition): void {
        // Cannot reuse names in the same lexical scope
        const { name } = def;
        if (this._names.has(name)) {
            throw Error(`cannot redeclare identifier \`${name}\``);
        }

        // Validate type parameter names
        let names: string[] = [];
        for (const { name } of def.params) {
            if (names.includes(name)) {
                throw Error(`the identifier \${name}\` is used more than once in this parameter list`);
            }
            names.push(name);
        }

        // Validate datatype constructors
        if (def.t === 'type:data') {
            names = [];
            for (const ctor of def.ctors) {
                const name = ctor.name ?? def.name;
                if (names.includes(name)) {
                    throw Error(`the constructor name \`${name}\` is defined multiple times`);
                }
                names.push(name);
            }
        }

        // Validate trait methods
        if (def.t === 'type:trait') {
            names = [];
            for (const { name } of def.methods) {
                if (names.includes(name)) {
                    throw Error(`the method name \`${name}\` is defined multiple times`);
                }
                names.push(name);
            }
        }

        this._entities.set(def.id, def);
        this._names.set(name, def);
    }

    // Enter scope and bind parameters
    enter(domain: AST.Type.Domain): Context {
        const ctx = new Context(this, domain);

        if (domain.t !== 'type:partial') {
            // Put type parameters in scope
            const params = domain.t === 'type:fun' ? domain.tparams : domain.params;
            for (const param of params) {
                this._entities.set(param.id, param);
            }
        } else {
            // Put type holes in scope
            for (const hole of domain.holes) {
                this._entities.set(hole.id, hole);
            }
        }

        // Put datatype constructors in scope
        if (domain.t === 'type:data') {
            for (const ctor of domain.ctors) {
                this._entities.set(ctor.id, ctor);
            }
        }

        // Put trait methods in scope
        if (domain.t === 'type:trait') {
            for (const method of domain.methods) {
                this._entities.set(method.id, method);
            }
        }
        return ctx;
    }

    // Get entity ASTs by id in the current context or one of its ancestor
    // contexts
    resolve<V extends Var<VarType>>(id: V): [Context, V['T']] | [undefined, undefined] {
        let ctx: Context | undefined = this;
        while (ctx !== undefined) {
            const ast = ctx._entities.get(id);
            if (ast !== undefined) {
                return [ctx, ast as V['T']];
            }
            ctx = ctx._parent;
        }
        return [] as any;
    }

    // Utility for checking that a var is valid
    exists<const V extends Var<VarType>>(id: V, t: V['T']['t']): boolean {
        return this.resolve(id)[1]?.t === t;
    }

    // Similiar to `resolve`, but get ASTs by name instead of id
    lookup(name: string): [Context, AST.Type.Symbolic] | [undefined, undefined] {
        let ctx: Context | undefined = this;
        while (ctx !== undefined) {
            const ast = ctx._names.get(name);
            if (ast !== undefined) {
                return [ctx, ast];
            }
            ctx = ctx._parent;
        }
        return [] as any;
    }

    check(ast: AST): void {
        if (AST.istype(ast)) {
            this._checkType(ast);
        } else {
            this._checkValue(ast);
        }
    }

    private _checkType(ast: AST.Type): void {
        if (typeof ast === 'number') {
            const id = ast;
            const [, entity] = this.resolve(id);
            if (entity === undefined) {
                // XXX: Reverse name lookup
                throw Error('identifier not found');
            }
            if (entity.t !== 'type:param' && entity.t !== 'type:hole') {
                throw Error('invalid identifier type');
            }
            return;
        }

        switch (ast.t) {
            case 'type:alias': {
                const ctx = this.enter(ast);
                for (const param of ast.params) ctx.check(param);
                ctx.check(ast.type);
                return;
            }

            case 'type:data': {
                const ctx = this.enter(ast);
                for (const param of ast.params) ctx.check(param);
                for (const ctor of ast.ctors) ctx.check(ctor);
                return;
            }

            case 'type:data-ctor':
                this.check(ast.type);
                return;

            case 'type:trait': {
                // Check that super traits exist
                for (const id of ast.super) {
                    if (!this.exists(id, 'type:trait')) {
                        // XXX: Reverse name lookup
                        throw Error('identifier not found');
                    }
                }
                const ctx = this.enter(ast);
                for (const param of ast.params) ctx.check(param);
                for (const aparam of ast.assoc) ctx.check(aparam);
                for (const method of ast.methods) ctx.check(method);
                return;
            }

            case 'type:trait-method':
                this.check(ast.type);
                return;

            case 'type:param':
                // Check that traits exist
                for (const id of ast.constraints) {
                    if (!this.exists(id, 'type:trait')) {
                        // XXX: Reverse name lookup
                        throw Error('identifier not found');
                    }
                }
                return;

            case 'type:forall': {
                for (const param of ast.params) this.check(param);
                const ctx = this.enter(ast);
                ctx.check(ast.type);
                return;
            }

            case 'type:partial': {
                const ctx = this.enter(ast);
                ctx.check(ast.type);
                return;
            }

            case 'type:apply': {
                if (!varis(ast.head, ['type:alias', 'type:data', 'type:trait'])) {
                    // XXX: reverse name lookup
                    throw Error(`identifier is not a type alias or data type`);
                }

                const head = this.resolve(ast.head);

                if (head[0] === undefined) {
                    // XXX: Reverse name lookup
                    throw Error('identifier not found');
                }

                const [scope, def] = head;

                const { params } = def;
                const { args } = ast;

                if (params.length !== args.length) {
                    const x = params.length;
                    const y = args.length;
                    throw Error(`invalid number of type arguments: expected ${x}, but receive ${y}`);
                }

                for (let i = 0; i < params.length; ++i) {
                    const param = params[i]!;
                    const arg = args[i]!;

                    scope.check(param);
                    this.check(arg);

                    if (param.constraints.length === 0) {
                        continue;
                    }

                    for (let i = 0; i < param.constraints.length; ++i) {
                        // TODO: These resolve/exists checks should just be a utility
                        const [, trait] = this.resolve(param.constraints[i]!);
                        if (trait === undefined) {
                            throw Error('identifier not found');
                        }
                        if (!this.implements(arg, trait)) {
                            throw Error(
                                `the type argument \`${param.name}\` does not implement \`${trait.name}\``,
                            );
                        }
                    }
                }
                return;
            }

            case 'type:tuple':
                for (const e of ast.elements) this.check(e);
                return;

            case 'type:fun': {
                const ctx = this.enter(ast);
                for (const tparam of ast.tparams) ctx.check(tparam);
                for (const param of ast.params) ctx.check(param);
                ctx.check(ast.ret);
                return;
            }
        }
    }

    private _checkValue(_ast: AST.Value): void {
        //
    }

    implements(expr: AST.Type.Expr, trait: AST.Type.Trait): boolean {
        if (typeof expr === 'number') {
            if (!varis(expr, ['type:param', 'type:hole'])) {
                throw Error('invalid type');
            }
            const [, x] = this.resolve(expr);
            if (x === undefined) {
                throw Error('identifier not found');
            }
            return x.t === 'type:param' ? x.constraints.includes(trait.id) : true;
        }

        switch (expr.t) {
            case 'type:forall':
            case 'type:partial': {
                // XXX: Can this be cached?
                const ctx = new Context(this, expr);
                return ctx.implements(expr.type, trait);
            }

            case 'type:apply': {
                const impls = this._impls.get(expr.head);
                if (impls === undefined) return false;
                let match = false;
                outer: for (const { args } of impls) {
                    if (expr.args.length !== args.length) {
                        throw Error('assertion error');
                    }
                    for (let i = 0; i < expr.args.length; ++i) {
                        const x = expr.args[i]!;
                        const y = args[i]!;
                        if (!this.equals(x, y)) {
                            continue outer;
                        }
                    }
                    match = true;
                    break;
                }
                return match;
            }

            // TODO: Builtin traits and impls
            case 'type:tuple':
            case 'type:fun':
                return false;
        }
    }

    equals(lhs: AST.Type.Expr, rhs: AST.Type.Expr): boolean {
        const uni = new Unifier();

        if (!uni.unify(lhs, rhs)) {
            return false;
        }

        throw Error('todo');
    }
}
