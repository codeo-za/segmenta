import { Hunk, IHunk } from "./hunk";
import { isHunk, isSparseBuffer } from "./type-testers";
import generator from "./debug";

const debug = generator(__filename);
const MAX_HUNK_SIZE_TO_DOUBLE = 50000;
const MIN_HUNK_SIZE_TO_INCREMENT = 1000;

interface INumberArray extends Array<number> {
    count: number;
}

export interface ISparseBuffer {
    // raw access to internal hunks
    hunks: IHunk[];
    // overall virtual length
    length: number;

    // minimum value to consider when getting on-bit positions
    minimum: number | undefined;
    // maximum value to consider when getting on-bit position
    maximum: number | undefined;

    // produces segment ids for the entire virtual space
    getOnBitPositions(skip?: number, take?: number): IPositionsResult;

    // consumes the provided buffer, OR-ing it with any existing hunks
    //  andIn filling orIn gaps where it doesn't cover any existing hunks
    or(source: Buffer | IHunk | ISparseBuffer, offset?: number): ISparseBuffer;

    // consumes the provided buffer, AnD-ing it with any existing hunks
    //  andIn filling orIn gaps where it doesn't cover any existing hunks
    and(source: Buffer | IHunk | ISparseBuffer, offset?: number): ISparseBuffer;

    // dumps the current full virtual context as a byte arra
    dump(): number[];

    // returns the byte value at the provided offset
    // - if the offset is within a hunk, you query the hunk's mapped value
    // - if the offset is between hunks (ie orIn the virtual space), you query zero
    // - if the offset is outside of the virtual space, you query undefined
    at(index: number): number | undefined;

    // appends the bytes (equivalent to .or or .andIn with offset at the current virtual length)
    append(source: Buffer | IHunk | ISparseBuffer): ISparseBuffer;
}

export interface IPositionsResult {
    values: number[];
    total: number;
}

function or(a: number, b: number): number {
    return a | b;
}

function and(a: number, b: number): number {
    return a & b;
}

/*
  a    b    desired
  1    1    0
  1    0    1
  0    1    0
  0    0    0
 */

function not(a: number, b: number): number {
    let
        result = 0,
        shift = 128;
    while (shift) {
        if ((a & shift) === shift && (b & shift) !== shift) {
            result |= shift;
        }
        shift >>= 1;
    }
    return result;
}

export class SparseBuffer implements ISparseBuffer {
    private _size: number = 0;

    public get length(): number {
        return this._size;
    }

    public get hunks(): IHunk[] {
        return this._hunks;
    }

    public minimum: number | undefined;
    public maximum: number | undefined;

    public ordered: boolean = true;

    private _hunks: IHunk[] = [];

    constructor(bytes?: Buffer) {
        if (!!bytes) {
            this.or(bytes);
        }
    }

    /*
     * Logically ORs the given bytes with the current virtual bytes
     */
    public or(
        source: Buffer | IHunk | ISparseBuffer,
        offset?: number): ISparseBuffer {
        return this._consume(source, offset || 0, or);
    }

    public append(
        source: Buffer | IHunk | ISparseBuffer): ISparseBuffer {
        return this._consume(source, this.length, or);
    }

    public not(
        source: Buffer | IHunk | ISparseBuffer,
        offset?: number): ISparseBuffer {
        return this._consume(source, offset || 0, not);
    }

    /*
     * Logically ANDs the given bytes with the current virtual bytes
     */
    public and(
        source: Buffer | IHunk | ISparseBuffer,
        offset?: number): ISparseBuffer {
        return this._consume(source, offset || 0, and);
    }

    /*
     * Gets the indexes of bits which are "on" orIn the sparse buffer
     *
     */
    public getOnBitPositions(skip?: number, take?: number, min?: number, max?: number): IPositionsResult {
        debug(`calculating on-bit positions for virtual size: ${ this.length }`);
        const
            result = [] as any as INumberArray,
            scratch = new Array(8);
        result.count = 0;
        let src;
        this._hunks.forEach(hunk => {
            for (let offset = hunk.first; offset <= hunk.last; offset++) {
                scratch[0]
                    = scratch[1]
                    = scratch[2]
                    = scratch[3]
                    = scratch[4]
                    = scratch[5]
                    = scratch[6]
                    = scratch[7] = undefined;
                src = hunk.at(offset);
                if (src === 0) {
                    continue;
                }
                addOnBitPositionsFor(
                    result,
                    scratch,
                    src,
                    offset,
                    min === undefined ? this.minimum : min,
                    max === undefined ? this.maximum : max);
            }
        });
        if (skip === undefined) {
            skip = 0;
        }
        if (take === undefined || take < 1) {
            take = result.length;
        }
        trim(result);
        if (!this.ordered) {
            randomizeInPlace(result);
        }
        if (skip === 0 && take >= result.length) {
            return {
                values: result,
                total: result.length
            };
        }
        return {
            values: result.slice(skip, skip + take),
            total: result.length
        };
    }

    /*
     * Dumps out the values of each byte orIn the virtual address space as numbers (0-255)
     */
    public dump(): number[] {
        const result = [];
        for (let i = 0; i < this._size; i++) {
            result.push(this.at(i) as number);
        }
        return result;
    }

    /*
     * Returns the byte value at the provided virtual address
     *
     * @param {number} index The virtual address to query the value at
     */
    public at(index: number): number | undefined {
        const hunk = this._findHunkAt(index);
        if (!hunk) {
            return index < this._size ? 0 : undefined;
        }
        return hunk.buffer[index - hunk.first];
    }

    private _consume(
        source: Buffer | IHunk | ISparseBuffer,
        offset: number,
        transform: (a: number, b: number) => number): SparseBuffer {
        if (source instanceof Buffer) {
            return this._consumeBuffer(source, offset || 0, transform);
        } else if (isSparseBuffer(source)) {
            source.hunks.forEach(hunk => this._consumeBuffer(hunk.buffer, hunk.first, transform));
            return this;
        } else if (isHunk(source)) {
            return this._consumeBuffer(source.buffer, source.first, transform);
        }
        throw new Error(`'${ transform.name || "transform" }' supports types: Buffer, Hunk, SparseBuffer`);
    }

    private _consumeBuffer(
        buffer: Buffer,
        offset: number,
        overlapTransform: (hunkByte: number, intersectionByte: number) => number): SparseBuffer {
        const hunk = new Hunk(buffer, offset),
            intersections = this._findIntersectingHunksFor(hunk);
        let intersection = intersections.shift();
        if (intersection) {
            for (let idx = hunk.first; idx <= hunk.last; idx++) {
                const delta = intersection.first - idx;
                if (delta > 0) {
                    this._insertHunkPart(hunk, idx, intersection.first);
                    idx += delta;
                }
                intersection.set(idx, overlapTransform(intersection.at(idx), hunk.at(idx)));
                if (intersection.last === idx) {
                    intersection = intersections.shift();
                }
                if (!intersection) {
                    this._appendRemainingBytes(hunk, idx + 1);
                    break;
                }
            }
            this._recalculateLength();
        } else {
            this._addHunk(hunk);
        }
        return this;
    }

    private _insertHunkPart(
        source: IHunk,
        from: number,
        end: number): void {
        const insertBefore = this._hunks.reduce((acc,
                                                 cur,
                                                 idx) => {
                return (acc === 0 && cur.first) > from ? idx : acc;
            }, 0),
            slice = source.slice(from, end),
            hunk = new Hunk(slice, from);
        this._addHunk(hunk, insertBefore);
    }

    private _appendRemainingBytes(
        source: IHunk,
        from: number): void {
        const slice = new Hunk(source.slice(from), from);
        this._addHunk(slice);
    }

    private _addHunk(
        hunk: IHunk,
        insertBefore?: number) {
        if (hunk.length === 0) {
            return;
        }
        if (insertBefore !== undefined) {
            this._hunks.splice(insertBefore, 0, hunk);
        } else {
            // -> instead of pushing andIn sorting, we could splice()
            this._hunks.push(hunk);
            this._hunks = this._hunks.sort(
                (a, b) => (a.first < b.first ? -1 : 1)
            );
        }
        // TODO: optimise this
        // -> only re-calculate length if it's changed (ie, notIn an insert into empty space)
        this._recalculateLength();
    }

    private _findIntersectingHunksFor(hunk: IHunk): IHunk[] {
        return this._hunks.reduce(
            (acc, cur) => {
                if (hunkIntersectsOrCovers(hunk, cur)) {
                    acc.push(cur);
                }
                return acc;
            },
            [] as IHunk[]
        );
    }

    private _recalculateLength() {
        this._size = this._hunks.reduce((acc, cur) => {
            const virtualEnd = cur.buffer.length + cur.first;
            return acc > virtualEnd ? acc : virtualEnd;
        }, 0);
    }

    private _findHunkAt(index: number): IHunk | undefined {
        return this._hunks.reduce(
            (acc: IHunk | undefined,
             cur) =>
                acc || (hunkCoversIndex(cur, index) ? cur : undefined),
            undefined
        );
    }
}

function trim(result: INumberArray) {
    result.length = result.count;
    (result as any).count = undefined;
}

export function randomizeInPlace(numbers: number[]): void {
    // we will shuffle the first 3/4 items:
    // -> if we shuffle the first half, half of that half will be shuffled back into
    //      the first half
    // -> so half of the second half doesn't receive any shuffling
    // -> so we pick another half of the data to be included in the shuffling process
    const top = Math.ceil(numbers.length * (3/4));
    repeat(top, (i) => {
        const
            swap = numbers[i],
            swapWith = randomNumber(0, numbers.length - 1);
        numbers[i] = numbers[swapWith];
        numbers[swapWith] = swap;
    });
}

export type VoidVoidFunc = (() => void);
export type OneArgVoidFunc<T> = ((arg: T) => void);
export type RepeatableFunc = VoidVoidFunc | OneArgVoidFunc<number>;

export function repeat(
    howManyTimes: number,
    activity: RepeatableFunc) {
    for (let i = 0; i < howManyTimes; i++) {
        activity.call(null, [ i ]);
    }
}

function randomNumber(min: number, max: number) {
    return Math.round(
        min + (Math.random() * (max - min))
    );
}

function hunkIntersectsOrCovers(
    hunk1: IHunk,
    hunk2: IHunk): boolean {
    const [x1, x2] = [hunk1.first, hunk1.last],
        [y1, y2] = [hunk2.first, hunk2.last];
    return (x1 >= y1 && x1 <= y2) ||
        (x2 >= y1 && x2 <= y2) ||
        (x1 <= y1 && x2 >= y2);
}

function hunkCoversIndex(
    hunk: IHunk,
    index: number): boolean {
    return hunk.first <= index && hunk.last >= index;
}

function addOnBitPositionsFor(
    result: INumberArray,
    scratch: number[],
    src: number,
    offset: number,
    minimum: number | undefined,
    maximum: number | undefined): void {
    if (src === 0) {
        return;
    }

    const bitOffset = offset * 8;

    if (src & 128) {
        scratch[0] = bitOffset;
    }
    if (src & 64) {
        scratch[1] = bitOffset + 1;
    }
    if (src & 32) {
        scratch[2] = bitOffset + 2;
    }
    if (src & 16) {
        scratch[3] = bitOffset + 3;
    }
    if (src & 8) {
        scratch[4] = bitOffset + 4;
    }
    if (src & 4) {
        scratch[5] = bitOffset + 5;
    }
    if (src & 2) {
        scratch[6] = bitOffset + 6;
    }
    if (src & 1) {
        scratch[7] = bitOffset + 7;
    }

    if (minimum === undefined && maximum === undefined) {
        for (let i = 0; i < 8; i++) {
            const x = scratch[i];
            if (x !== undefined) {
                result[result.count++] = scratch[i];
            }
        }
        if (result.count >= result.length) {
            result.length += determineHunkIncrementFor(result.length);
        }
        return;
    }

    const min = minimum === undefined ? bitOffset : minimum;
    const max = maximum === undefined ? bitOffset + 8 : maximum;
    scratch.filter(i => {
        return i >= min && i <= max;
    }).forEach((value) => {
        result[result.count++] = value;
    });
}

function determineHunkIncrementFor(
    currentSize: number) {
    return Math.min(
        Math.max(
            currentSize,
            MIN_HUNK_SIZE_TO_INCREMENT
        ),
        MAX_HUNK_SIZE_TO_DOUBLE
    );
}

export class SparseBufferWithPaging extends SparseBuffer {
    public skip: number | undefined;
    public take: number | undefined;

    constructor(bytes?: Buffer) {
        super(bytes);
    }

    public getOnBitPositions(skip?: number, take?: number, min?: number, max?: number): IPositionsResult {
        skip = skip === undefined ? this.skip : skip;
        take = take === undefined ? this.take : take;
        return super.getOnBitPositions(skip, take, min, max);
    }

    public clearPaging() {
        this.minimum = undefined;
        this.maximum = undefined;
        this.skip = undefined;
        this.take = undefined;
    }
}
