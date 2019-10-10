import debugFn from "debug";
import path from "path";

function zp(val: number): string {
    return val < 10 ? `0${val}` : val.toString();
}

function makeTimestamp() {
    const now = new Date();
    return [
        `${now.getFullYear()}-${zp(now.getMonth())}-${zp(now.getDate())}`,
        `${zp(now.getHours())}:${zp(now.getMinutes())}:${zp(now.getSeconds())}.${zp(now.getMilliseconds())} :: `
    ].join(" ");
}

export default function generator(context: string) {
    const
        parts = context.split(path.sep),
        identifier = parts[parts.length - 1].replace(/\.ts$/, ""),
        fullIdentifier = identifier === "segmenta" ? "segmenta:main" : `segmenta:${identifier}`,
        debug = debugFn(fullIdentifier),
        wrapper = (...args: any[]) => {
            if (!debug.enabled) {
                return;
            }
            const timestamp = makeTimestamp();
            if (typeof args[0] === "string") {
                args[0] = `${timestamp}${args[0]}`;
            } else {
                args.unshift(timestamp);
            }
            debug.apply(null, [args[0], ...args.slice(1)]);
        };
    return wrapper;
}
