import { Language, type AST } from './ast.js';
import { Sexpr } from './sexpr.js';

export class ASTBuilder {
    private _ids: number;

    constructor() {
        this._ids = 0;
    }

    *parse(source: string): Iterable<AST.Language> {
        const sexprs = [...Sexpr.parse(Sexpr.lex(source))];
        while (sexprs.length > 0) {
            yield Language(sexprs, this);
        }
    }

    create<const T extends AST>(ast: T): T {
        if ('id' in ast) {
            ast.id = this._ids++;
        }

        switch (ast.t) {
            case 'let':
                ast.child.parent = ast;
                break;

            case 'block':
                for (const child of ast.children) {
                    child.parent = ast;
                }
                break;

            case 'fun':
                for (const param of ast.params) {
                    param.parent = ast;
                }
                ast.body.parent = ast;
                break;

            case 'apply':
                ast.head.parent = ast;
                for (const arg of ast.args) {
                    arg.parent = ast;
                }
                break;

            case 'assert':
                if (ast.expr !== undefined) {
                    ast.expr.parent = ast;
                }
                ast.type.parent = ast;
                break;

            case 'type-def':
                ast.type.parent = ast;
                break;

            case 'forall':
            case 'exists':
                for (const param of ast.params) {
                    param.parent = ast;
                }
                ast.body.parent = ast;
                break;

            case 'type-param-hkt':
                if (ast.hkt) {
                    ast.hkt.parent = ast;
                }
                break;

            case 'higher-kind':
                for (const param of ast.params) {
                    param.parent = ast;
                }
                break;

            case 'type-param-impl':
                for (const impl of ast.impl) {
                    impl.parent = ast;
                }
                break;

            case 'type-impl':
                for (const arg of ast.args) {
                    ast.parent = ast;
                }
                break;

            case 'type-fun':
                for (const param of ast.params) {
                    param.parent = ast;
                }
                break;

            case 'type-apply':
                ast.head.parent = ast;
                for (const arg of ast.args) {
                    arg.parent = ast;
                }
                break;
        }

        return ast;
    }
}
