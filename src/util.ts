import { inspect } from 'node:util';

export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export function expect<T>(x: T, error: any): NonNullable<T> {
    if (x == null) {
        throw error;
    }
    return x;
}

export function print(...args: unknown[]) {
    console.log(
        ...args.map(x =>
            inspect(x, {
                showHidden: false,
                depth: null,
                colors: true,
            }),
        ),
    );
}
