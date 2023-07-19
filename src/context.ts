import { AST } from './ast.js';
import { Repository } from './repository.js';
import { TypeOp, type TypeInstr } from './typecode.js';

/*
    How to calculate de bruijn indices for type variables?

    Each context has a `depth` which tracks the level of nesting of lexical
    scopes

    To get the index of a type variable, resolve the variable to get the parent
    context and its depth. The depth can then be used

*/
export interface ResolveResult<T extends AST.Entity> {
    ctx: Context;
    ast: T;
}

export class Context {
    private _repo: Repository;
    private _root: AST | undefined; // Node that context was created for
    private _parent: Context | undefined; // Parent context
    private _depth: number;
    private _entities: Map<number, AST.Entity>; // Internal definitions
    private _valueNames: Map<string, AST.ValueEntity>; // Secondary definition index
    private _typeNames: Map<string, AST.TypeEntity>; // Secondary definition index
    private _vars: Map<AST, number>; // Resolve variables to referenced IDs
    private _children: Map<AST, Context>; // Contexts created for any child nodes
    // private _checkCache: Map<AST, unknown>;

    private constructor(repo: Repository, root?: AST, parent?: Context, depth: number = 0) {
        this._repo = repo;
        this._root = root;
        this._parent = parent;
        this._depth = depth;
        this._entities = new Map();
        this._valueNames = new Map();
        this._typeNames = new Map();
        this._vars = new Map();
        this._children = new Map();
    }

    static empty(repository: Repository) {
        return new Context(repository);
    }

    get repository(): Repository {
        return this._repo;
    }

    get root(): AST | undefined {
        return this._root;
    }

    get parent(): Context | undefined {
        return this._parent;
    }

    define(ast: AST.Let | AST.Block | AST.Fun): Context {
        if (this._root === ast) {
            return this;
        }

        let ctx = this._children.get(ast);
        if (ctx !== undefined) {
            return ctx;
        }

        if (ast.t === 'let') {
            return this.defineLet(ast);
        } else if (ast.t === 'block') {
            return this.defineBlock(ast);
        } else {
            return this.defineFun(ast);
        }
    }

    defineLet(ast: AST.Let): Context {
        const { name, id } = ast;
        if (this._valueNames.has(name)) {
            throw Error(`cannot redeclare identifier \`${name}\``);
        }
        const ctx = new Context(this._repo, ast, this);
        this._entities.set(id, ast);
        this._valueNames.set(name, ast);
        this._children.set(ast, ctx);
        return ctx;
    }

    defineBlock(ast: AST.Block): Context {
        const ctx = new Context(this._repo, ast, this);
        this._children.set(ast, ctx);
        return ctx;
    }

    defineFun(ast: AST.Fun): Context {
        const ctx = new Context(this._repo, ast, this);
        const names: string[] = [];
        for (const param of ast.params) {
            const { id, name } = param;
            if (names.includes(name)) {
                throw Error(`cannot redeclare identifier \`${name}\``);
            }
            names.push(name);
            ctx._valueNames.set(name, param);
            ctx._entities.set(id, param);
        }
        this._children.set(ast, ctx);
        return ctx;
    }

    defineType(ast: AST.Forall | AST.Exists): Context {
        const ctx = new Context(this._repo, ast, this, this._depth + 1);
        const names: string[] = [];
        for (const param of ast.params) {
            const { id, name } = param;
            if (names.includes(name)) {
                throw Error(`cannot redeclare identifier \`${name}\``);
            }
            names.push(name);
            ctx._typeNames.set(name, param);
            ctx._entities.set(id, param);
        }
        this._children.set(ast, ctx);
        return ctx;
    }

    // TODO: defineTrait

    // resolve(idOrName: number | string): ResolveResult | undefined {
    //     if (typeof idOrName === 'number') {
    //         return this.resolveId(idOrName);
    //     } else {
    //         return this.resolveName(idOrName);
    //     }
    // }

    resolveId(id: number): ResolveResult<AST.Entity> | undefined {
        let parent: Context | undefined = this;
        while (parent !== undefined) {
            const ast = this._entities.get(id);
            if (ast !== undefined) {
                const ctx = this.resolveContext(ast);
                return { ctx, ast };
            }
            parent = parent._parent;
        }
        return;
    }

    resolveValueName(name: string): ResolveResult<AST.ValueEntity> | undefined {
        let parent: Context | undefined = this;
        while (parent !== undefined) {
            const ast = this._valueNames.get(name);
            if (ast !== undefined) {
                const ctx = this.resolveContext(ast);
                return { ctx, ast };
            }
            parent = parent._parent;
        }
        return;
    }

    resolveTypeName(name: string): ResolveResult<AST.TypeEntity> | undefined {
        let parent: Context | undefined = this;
        while (parent !== undefined) {
            const ast = this._typeNames.get(name);
            if (ast !== undefined) {
                const ctx = this.resolveContext(ast);
                return { ctx, ast };
            }
            parent = parent._parent;
        }
        return;
    }

    resolveVar(ast: AST.Var | AST.TypeVar): ResolveResult<AST.Entity> | undefined {
        let id = this._vars.get(ast);
        if (id !== undefined) {
            return this.resolveId(id);
        }

        let result: ResolveResult<AST.Entity> | undefined;

        if (ast.t === 'var') result = this.resolveValueName(ast.name);
        if (ast.t === 'type-var') result = this.resolveTypeName(ast.name);

        if (result !== undefined) {
            this._vars.set(ast, result.ast.id);
        }

        return result;
    }

    resolveContext(ast: AST): Context {
        let target: AST | undefined = ast;
        while (target !== undefined) {
            if (target === this._root) {
                return this;
            }
            const ctx = this._children.get(ast);
            if (ctx !== undefined) {
                return ctx;
            }
            target = target.parent;
        }
        throw Error('context not found');
    }

    check(ast: AST): void {
        switch (ast.t) {
            case 'let': {
                const ctx = this.define(ast);
                ctx.check(ast.child);
                return;
            }

            case 'var': {
                const result = this.resolveVar(ast);
                if (result === undefined) {
                    throw Error(`\`${ast.name}\` not defined`);
                }
                return;
            }

            case 'block': {
                const ctx = this.define(ast);
                for (const child of ast.children) {
                    child.parent ??= ast;
                    ctx.check(child);
                }
                return;
            }

            case 'fun': {
                const ctx = this.define(ast);
                ctx.check(ast.body);
                return;
            }

            case 'param':
                return;

            case 'apply': {
                this.check(ast.head);
                const headType = this.infer(ast.head);
                for (const arg of ast.args) {
                    this.check(arg);
                    const argType = this.infer(arg);
                    // TODO: unify?
                }
                return;
            }

            case 'assert': {
                this.check(ast.expr);
                this.check(ast.type);
                // TODO: unify?
                return;
            }
        }
    }

    infer(ast: AST.Expr): unknown {
        throw Error('todo');
    }

    *normalize(ast: AST.Type | AST.HKT): Iterable<TypeInstr> {
        switch (ast.t) {
            case 'forall':
            case 'exists': {
                yield ast.t === 'forall' ? TypeOp.Forall : TypeOp.Exists;
                for (const param of ast.params) {
                    if (param.t === 'type-param-hkt') {
                        if (param.hkt !== undefined) {
                            yield* this.normalize(param.hkt);
                        }
                    } else {
                        yield* this._normalizeTypeParamImpl(param);
                    }
                }
                return;
            }

            case 'type-var': {
                const result = this.resolveVar(ast);

                if (result === undefined) {
                    throw Error('variable not bound');
                }

                if (!AST.is(result.ast, ['type-def', 'type-param-hkt', 'type-param-impl'])) {
                    throw Error('expected type binding, got value');
                }

                if (result.ast.t === 'type-def') {
                    yield TypeOp.Ref;
                    yield result.ast.id;
                } else {
                    yield TypeOp.Var;
                    yield this._depth - result.ctx._depth;
                }
                return;
            }

            case 'concrete-kind':
                yield TypeOp.Kind;
                return;

            case 'type-fun':
                yield* this._normalizeFun(ast.params);
                return;

            case 'type-apply':
                yield* this._normalizeApply(ast.head, ast.args);
                return;
        }
    }

    private *_normalizeTypeParamImpl(param: AST.TypeParamImpl) {
        // TODO: will need to sort the list of constraints to actually do a
        // direct comparison

        for (const impl of param.impl) {
            yield TypeOp.Constr;
            yield* this._normalizeApply(impl.trait, impl.args);
        }
    }

    private *_normalizeFun(params: (AST.Type | AST.HKT)[]): Iterable<TypeInstr> {
        /*
            (fun [x y z] w)
            (fun [x] (fun [y] (fun [z] w)))
        */
        while (params.length > 0) {
            if (params.length > 2) {
                yield TypeOp.Fun;
                yield* this.normalize(params.shift()!);
            } else {
                yield TypeOp.Fun;
                yield* this.normalize(params.shift()!);
                yield* this.normalize(params.shift()!);
            }
        }
    }

    private *_normalizeApply(head: AST.Type, args: AST.Type[]): Iterable<TypeInstr> {
        /*
            (f x y z w)
            ((((f x) y) z) w)
        */

        if (args.length === 0) {
            throw Error('todo: unit/tuple type');
        }

        for (let i = 0; i < args.length; ++i) {
            yield TypeOp.Apply;
        }

        yield* this.normalize(head);

        for (const arg of args) {
            yield* this.normalize(arg);
        }
    }
}
