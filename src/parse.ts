import type { Sexpr } from './sexpr';

export type Input = Sexpr[];
export type Parser<T> = (input: Input) => T;

export const atom = (arg: string | RegExp | ((x: string) => boolean)): Parser<string> => {
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

export const list = <T>(parser: Parser<T>): Parser<T> => {
    return (input: Input): T => {
        const sexpr = input.shift();
        if (!Array.isArray(sexpr)) {
            throw Error('expected list');
        }
        const items = sexpr.slice();
        const result = parser(items);
        if (items.length > 0) {
            throw Error('unexpected list item');
        }
        return result;
    };
};

export const star = <T>(parser: Parser<T>): Parser<T[]> => {
    return (input: Input): T[] => {
        const output: T[] = [];
        while (true) {
            if (input.length === 0) {
                break;
            }
            try {
                output.push(parser(input));
            } catch (_) {
                break;
            }
        }
        return output;
    };
};

export const plus = <T>(parser: Parser<T>): Parser<[T, ...T[]]> => {
    return (input: Input): [T, ...T[]] => {
        const output: T[] = [];
        while (true) {
            if (input.length === 0) {
                break;
            }
            try {
                output.push(parser(input));
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

export const none = (input: Input): void => {
    if (input.length !== 0) {
        throw Error('expected empty input');
    }
};

export type AndType<Ps extends Parser<any>[]> = {
    [K in keyof Ps]: Ps[K] extends Parser<infer T> ? T : never;
};

export function and<Ps extends Parser<any>[]>(...parsers: Ps): Parser<AndType<Ps>> {
    return (input: Input): any => {
        const output: any[] = [];
        for (const parser of parsers) {
            output.push(parser(input));
        }
        return output as AndType<Ps>;
    };
}

export type OrType<Ps extends Parser<any>[]> = {
    [K in keyof Ps]: Ps[K] extends Parser<infer T> ? T : never;
}[number];

export const or = <Ps extends Parser<any>[]>(...parsers: Ps): Parser<OrType<Ps>> => {
    if (parsers.length === 0) {
        throw Error('at least one parser required');
    }
    return (input: Input): OrType<Ps> => {
        let error: unknown | undefined;
        for (const parser of parsers) {
            try {
                const clone = input.slice();
                const result = parser(clone);
                input.splice(0, input.length, ...clone);
                return result;
            } catch (e: unknown) {
                error ??= e;
            }
        }
        throw error;
    };
};

export const maybe = <T>(parser: Parser<T>): Parser<T | undefined> => {
    return (input: Input): T | undefined => {
        if (input.length === 0) {
            return;
        }
        try {
            return parser(input);
        } catch (_) {
            return;
        }
    };
};

export const lazy = <T>(thunk: () => Parser<T>): Parser<T> => {
    return (input: Input): T => thunk()(input);
};

export const transform = <I, O>(parser: Parser<I>, transform: (input: I) => O): Parser<O> => {
    return (input: Input): O => transform(parser(input));
};
