export type VoidFunc = ((...args: any[]) => void);

export function repeat(
    howManyTimes: number,
    activity: VoidFunc) {
    for (let i = 0; i < howManyTimes; i++) {
        activity.call(null, [ i ]);
    }
}
