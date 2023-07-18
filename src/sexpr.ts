const WHITESPACE_REGEX = /\s/;

const OPEN_PAREN = '({[<';
const CLOSE_PAREN = ')}]>';
const PAREN = OPEN_PAREN + CLOSE_PAREN;

export type Sexpr = string | Sexpr[];

export namespace Sexpr {
    export function Parser(source: string): Sexpr[] {
        return [...parse(lex(source))];
    }

    export function* lex(source: string): IterableIterator<string> {
        let token: string = '';
        for (let i = 0; i < source.length; ++i) {
            const char = source[i]!;

            if (WHITESPACE_REGEX.test(char)) {
                if (token.length > 0) {
                    yield token;
                    token = '';
                }
            } else if (PAREN.includes(char)) {
                if (token.length > 0) {
                    yield token;
                    token = '';
                }
                yield char;
            } else {
                token += char;
            }
        }

        if (token.length > 0) {
            yield token;
        }
    }

    export function* parse(tokens: IterableIterator<string>): IterableIterator<Sexpr> {
        while (true) {
            const next = tokens.next();

            if (next.done === true) {
                return true;
            }

            const i = OPEN_PAREN.indexOf(next.value);

            if (i !== -1) {
                yield [...parseList(tokens, CLOSE_PAREN[i]!)];
            } else if (CLOSE_PAREN.includes(next.value)) {
                throw Error('invalid token');
            } else {
                yield next.value;
            }
        }
    }

    export function* parseList(
        tokens: IterableIterator<string>,
        close: string
    ): IterableIterator<Sexpr> {
        while (true) {
            const next = tokens.next();

            if (next.done === true) {
                throw Error('unexpected end-of-input');
            }

            const i = OPEN_PAREN.indexOf(next.value);

            if (i !== -1) {
                yield [...parseList(tokens, CLOSE_PAREN[i]!)];
            } else if (next.value === close) {
                return;
            } else {
                yield next.value;
            }
        }
    }
}
