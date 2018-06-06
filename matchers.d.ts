/* tslint:disable */
// TODO: figure out why this has to be at the root to be recognised by tsc
declare namespace jest {
    interface Matchers<R> {
        toMatchArray(array: number[]): void;
        // noinspection JSUnusedLocalSymbols
        toBeEquivalentTo<T>(array: T[]): void;
        toBeAFunction(): void;
    }
}
