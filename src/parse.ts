import type { Sexpr } from './sexpr';

export type Input = Sexpr[];
export type Parser<T, S> = (input: Input, state: S) => T;

export const atom = (arg: string | RegExp | ((x: string) => boolean)): Parser<string, any> => {
    if (typeof arg === 'string') {
        return (input: Input): string => {
            const sexpr = input.shift();
            if (typeof sexpr !== 'string') {
                throw Error('expected atom');
            }
            if (sexpr !== arg) {
                throw Error(`expected atom ${JSON.stringify(arg)}, got ${JSON.stringify(sexpr)}`);
            }
            return sexpr;
        };
    } else if (arg instanceof RegExp) {
        return (input: Input): string => {
            const sexpr = input.shift();
            if (typeof sexpr !== 'string') {
                throw Error('expected atom');
            }
            if (!arg.test(sexpr)) {
                throw Error('atom did not match pattern');
            }
            return sexpr;
        };
    } else {
        return (input: Input): string => {
            const sexpr = input.shift();
            if (typeof sexpr !== 'string') {
                throw Error('expected atom');
            }
            if (!arg(sexpr)) {
                throw Error('atom did not match predicate');
            }
            return sexpr;
        };
    }
};

export const list = <T, S>(parser: Parser<T, S>): Parser<T, S> => {
    return (input, state): T => {
        const sexpr = input.shift();
        if (!Array.isArray(sexpr)) {
            throw Error('expected list');
        }
        const items = sexpr.slice();
        const result = parser(items, state);
        if (items.length > 0) {
            throw Error('unexpected list item');
        }
        return result;
    };
};

export const star = <T, S>(parser: Parser<T, S>): Parser<T[], S> => {
    return (input, state): T[] => {
        const output: T[] = [];
        while (true) {
            if (input.length === 0) {
                break;
            }
            try {
                output.push(parser(input, state));
            } catch (_) {
                break;
            }
        }
        return output;
    };
};

export const plus = <T, S>(parser: Parser<T, S>): Parser<[T, ...T[]], S> => {
    return (input, state): [T, ...T[]] => {
        const output: T[] = [];
        while (true) {
            if (input.length === 0) {
                break;
            }
            try {
                output.push(parser(input, state));
            } catch (_) {
                break;
            }
        }
        if (output.length < 1) {
            throw Error('exepected at least one item');
        }
        return output as [T, ...T[]];
    };
};

export const none: Parser<void, any> = (input: Input): void => {
    if (input.length !== 0) {
        throw Error('expected empty input');
    }
};

export type AndType<Ps extends Parser<any, any>[]> = {
    [K in keyof Ps]: Ps[K] extends Parser<infer T, any> ? T : never;
};

export function and<Ps extends Parser<any, any>[], S>(...parsers: Ps): Parser<AndType<Ps>, S> {
    return (input, state): any => {
        const output: any[] = [];
        for (const parser of parsers) {
            output.push(parser(input, state));
        }
        return output as AndType<Ps>;
    };
}

export type OrType<Ps extends Parser<any, any>[]> = {
    [K in keyof Ps]: Ps[K] extends Parser<infer T, any> ? T : never;
}[number];

export const or = <Ps extends Parser<any, any>[], S>(...parsers: Ps): Parser<OrType<Ps>, S> => {
    if (parsers.length === 0) {
        throw Error('at least one parser required');
    }
    return (input, state): OrType<Ps> => {
        let error: unknown | undefined;
        for (const parser of parsers) {
            try {
                const clone = input.slice();
                const result = parser(clone, state);
                input.splice(0, input.length, ...clone);
                return result;
            } catch (e: unknown) {
                error ??= e;
            }
        }
        throw error;
    };
};

export const maybe = <T, S>(parser: Parser<T, S>): Parser<T | undefined, S> => {
    return (input, state): T | undefined => {
        if (input.length === 0) {
            return;
        }
        try {
            const clone = input.slice();
            const result = parser(clone, state);
            input.splice(0, input.length, ...clone);
            return result;
        } catch (_) {
            return;
        }
    };
};

export const lazy = <T, S>(thunk: () => Parser<T, S>): Parser<T, S> => {
    return (input, state): T => thunk()(input, state);
};

export const transform = <I, O, S>(
    parser: Parser<I, S>,
    transform: (input: I, state: S) => O,
): Parser<O, S> => {
    return (input, state): O => transform(parser(input, state), state);
};
