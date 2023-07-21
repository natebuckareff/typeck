import { AST } from './ast.js';
import { Repository } from './repository.js';
import { TypeCode, TypeOp, type TypeInstr } from './type-code.js';
import { TypeLang } from './type-lang.js';

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
    private _root: AST.Scope | undefined; // Node that context was created for
    private _parent: Context | undefined; // Parent context
    private _depth: number;
    private _entities: Map<number, AST.Entity>; // Internal definitions
    private _valueNames: Map<string, AST.ValueEntity>; // Secondary definition index
    private _typeNames: Map<string, AST.TypeEntity>; // Secondary definition index
    private _vars: Map<AST, number>; // Resolve variables to referenced IDs
    private _children: Map<AST, Context>; // Contexts created for any child nodes
    // private _checkCache: Map<AST, unknown>;
    private _normalizeCache: Map<AST.Type, TypeCode>;

    private constructor(repo: Repository, root?: AST.Scope, parent?: Context, depth: number = 0) {
        this._repo = repo;
        this._root = root;
        this._parent = parent;
        this._depth = depth;
        this._entities = new Map();
        this._valueNames = new Map();
        this._typeNames = new Map();
        this._vars = new Map();
        this._children = new Map();
        this._normalizeCache = new Map();
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

    define(ast: AST.Entity): void {
        const { name, id } = ast;

        // Already defined
        if (this._entities.get(id) === ast) {
            return;
        }

        switch (ast.t) {
            case 'let':
            case 'param':
                if (this._valueNames.has(name)) {
                    throw Error(`cannot redeclare identifier \`${name}\``);
                }
                this._entities.set(id, ast);
                this._valueNames.set(name, ast);
                this._children.set(ast, this);
                break;

            case 'type-alias':
            case 'type-data':
            case 'type-param-hkt':
            case 'type-param-impl':
                if (this._typeNames.has(name)) {
                    throw Error(`cannot redeclare identifier \`${name}\``);
                }
                this._entities.set(id, ast);
                this._typeNames.set(name, ast);
                this._children.set(ast, this);
                break;
        }
    }

    enter(ast: AST.Scope): Context {
        let ctx = this.findContext(ast);

        if (ctx !== undefined) {
            return ctx;
        }

        switch (ast.t) {
            case 'block':
                ctx = new Context(this._repo, ast, this);
                break;

            case 'fun':
                ctx = new Context(this._repo, ast, this);
                for (const param of ast.generic) {
                    ctx.define(param);
                }
                for (const param of ast.params) {
                    ctx.define(param);
                }
                break;

            case 'forall':
                ctx = new Context(this._repo, ast, this, this._depth + 1);
                for (const param of ast.params) {
                    ctx.define(param);
                }
                break;
        }

        this._children.set(ast, ctx);

        return ctx;
    }

    resolveId(id: number): ResolveResult<AST.Entity> | undefined {
        let parent: Context | undefined = this;
        while (parent !== undefined) {
            const ast = this._entities.get(id);
            const ctx = ast && this.findContext(ast);
            if (ast !== undefined) {
                return { ctx: ctx!, ast };
            }
            parent = parent._parent;
        }
        return;
    }

    resolveValueName(name: string): ResolveResult<AST.ValueEntity> | undefined {
        let parent: Context | undefined = this;
        while (parent !== undefined) {
            const ast = this._valueNames.get(name);
            const ctx = ast && this.findContext(ast);
            if (ast !== undefined) {
                return { ctx: ctx!, ast };
            }
            parent = parent._parent;
        }
        return;
    }

    resolveTypeName(name: string): ResolveResult<AST.TypeEntity> | undefined {
        let parent: Context | undefined = this;
        while (parent !== undefined) {
            const ast = this._typeNames.get(name);
            const ctx = ast && this.findContext(ast);
            if (ast !== undefined) {
                return { ctx: ctx!, ast };
            }
            parent = parent._parent;
        }
        return;
    }

    resolveVar(ast: AST.Var): ResolveResult<AST.ValueEntity> | undefined;
    resolveVar(ast: AST.TypeVar): ResolveResult<AST.TypeEntity> | undefined;
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

    findContext(ast: AST): Context | undefined {
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
        return;
    }

    check(ast: AST): void {
        switch (ast.t) {
            // Define the `let` in the current scope if it wasn't already
            // defined and then check its rhs. The rhs is checked in the scope
            // of the current context
            case 'let':
                this.define(ast);
                this.check(ast.child);
                return;

            // Literals trivally type check
            case 'literal-integer':
                return;

            // Check that the variable name is declared
            case 'var': {
                const result = this.resolveVar(ast);
                if (result === undefined) {
                    throw Error(`identifier \`${ast.name}\` not declared`);
                }
                return;
            }

            // Enter new lexical scope formed by the block and type check each
            // block statement
            case 'block': {
                const ctx = this.enter(ast);
                for (const child of ast.children) {
                    ctx.check(child);
                }
                return;
            }

            // Enter new lexical scope formed by the function. Type check each
            // generic type parameter, each function parameter, the return type,
            // and the function body
            case 'fun': {
                const ctx = this.enter(ast);
                for (const param of ast.generic) {
                    ctx.check(param);
                }
                for (const param of ast.params) {
                    ctx.check(param);
                }
                ctx.check(ast.ret);
                ctx.check(ast.body);
                return;
            }

            // Type check the function parameter's type annotation
            case 'param':
                this.check(ast.type);
                return;

            case 'apply': {
                // Type check the expression being applied
                this.check(ast.head);

                // Infer the type of the applied expression
                const headInferrence = this.infer(ast.head);

                if (TypeLang.is(headInferrence.type, TypeOp.Foral)) headInferrence.type;

                throw Error('todo');

                // if (headTypeOp === TypeOp.Fun) {
                //     /*
                //         unify(paramType, argType)
                //     */

                //     throw Error('todo: concrete function application');
                // } else {
                //     throw Error('todo: generic function application');
                // }

                // for (const arg of ast.args) {
                //     this.check(arg);
                //     const argType = this.infer(arg);
                //     // TODO: unify?
                // }
                // return;
            }

            case 'assert': {
                if (ast.expr !== undefined) {
                    this.check(ast.expr);
                }
                this.check(ast.type);
                // TODO: unify?
                return;
            }
        }
    }

    // private _checkConcreteApply(fun: AST.Fun);

    infer(ast: AST.Expr | AST.Type): { type: TypeLang; params?: Map<number, TypeLang.Param> } {
        switch (ast.t) {
            case 'integer':
                return { type: { op: TypeOp.Ref, id: 1024 } };

            case 'var': {
                const result = this.resolveValueName(ast.name);
                if (result === undefined) {
                    throw Error('identifier not declared');
                }

                if (result.ast.t === 'let') {
                    return result.ctx.infer(result.ast.child);
                } else {
                    return result.ctx.infer(result.ast.type);
                }
            }

            case 'block':
                // Infer type of each `Return` statement and the terminal
                // statement, and then unify all of those
                throw Error('todo');

            case 'fun': {
                const params: TypeLang[] = [];

                for (const { type } of ast.params) {
                    params.push(this.infer(type).type);
                }

                params.push(this.infer(ast.ret).type);

                ast.params;
            }

            case 'apply':
            case 'assert':

            //
        }

        throw Error('todo');
    }

    normalize(ast: AST.Type): TypeCode {
        let code = this._normalizeCache.get(ast);
        if (code === undefined) {
            code = TypeCode.encode(this._normalize(ast));
            this._normalizeCache.set(ast, code);
        }
        return code;
    }

    private *_normalize(ast: AST.Type | AST.HKT): Iterable<TypeInstr> {
        switch (ast.t) {
            // case 'forall': {
            //     const ctx = this.enter(ast);
            //     yield ast.t === 'forall' ? TypeOp.Forall : TypeOp.Exists;
            //     for (const param of ast.params) {
            //         if (param.t === 'type-param-hkt') {
            //             if (param.hkt !== undefined) {
            //                 yield* ctx._normalize(param.hkt);
            //             }
            //         } else {
            //             yield* ctx._normalizeTypeParamImpl(param);
            //         }
            //     }
            //     return;
            // }

            case 'type-var': {
                throw Error('todo');
                // const result = this.resolveVar(ast);

                // if (result === undefined) {
                //     throw Error('variable not bound');
                // }

                // // prettier-ignore
                // if (!AST.is(result.ast, ['type-alias', 'type-data', 'type-param-hkt', 'type-param-impl'])) {
                //     throw Error('expected type binding, got value');
                // }

                // // TODO
                // if (result.ast.t === 'type-data') {
                //     yield TypeOp.Ref;
                //     yield result.ast.id;
                // } else {
                //     yield TypeOp.Var;
                //     yield this._depth - result.ctx._depth;
                // }
                // return;
            }

            case 'concrete-kind':
                yield TypeOp.Concrete;
                return;

            case 'higher-kind':
                yield* this._normalizeFun(TypeOp.Hkt, ast.params);
                return;

            case 'type-fun':
                yield* this._normalizeFun(TypeOp.Fun, ast.params);
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

    private *_normalizeFun(prefix: TypeOp, params: (AST.Type | AST.HKT)[]): Iterable<TypeInstr> {
        /*
            (fun [x y z] w)
            (fun [x] (fun [y] (fun [z] w)))
        */

        while (params.length > 0) {
            if (params.length > 2) {
                yield prefix;
                yield* this._normalize(params.shift()!);
            } else {
                yield prefix;
                yield* this._normalize(params.shift()!);
                yield* this._normalize(params.shift()!);
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

        yield* this._normalize(head);

        for (const arg of args) {
            yield* this._normalize(arg);
        }
    }
}
