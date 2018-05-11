import {IHunk, Hunk, isHunk} from "./hunk";
import {isFunction, isNumber} from "./type-testers";

export interface ISparseBuffer {
  // raw access to internal hunks
  hunks: IHunk[];
  // overall virtual length
  length: number;

  // produces segment ids for the entire virtual space
  getOnBitPositions(): number[];

  // consumes the provided buffer, OR-ing it with any existing hunks
  //  and filling in gaps where it doesn't cover any existing hunks
  or(buffer: Buffer, offset?: number): void;

  // dumps the current full virtual context as a byte arra
  dump(): number[];

  // returns the byte value at the provided offset
  // - if the offset is within a hunk, you get the hunk's mapped value
  // - if the offset is between hunks (ie in the virtual space), you get zero
  // - if the offset is outside of the virtual space, you get undefined
  at(index: number): number | undefined;
}

function or(a: number, b: number): number {
  return a | b;
}

function and(a: number, b: number): number {
  return a & b;
}

export function isSparseBuffer(obj: any): obj is ISparseBuffer {
  if (obj instanceof SparseBuffer) {
    return true;
  }
  return isNumber(obj.length) &&
    isFunction(obj.getOnBitPositions) &&
    isFunction(obj.or) &&
    isFunction(obj.dump) &&
    isFunction(obj.at) &&
    Array.isArray(obj.hunks) &&
    (obj.hunks as IHunk[]).reduce((acc, cur) => acc && isHunk(cur), true);
}

export default class SparseBuffer implements ISparseBuffer {
  private _size: number = 0;

  public get length(): number {
    return this._size;
  }

  public get hunks(): IHunk[] {
    return this._hunks;
  }

  private _hunks: IHunk[] = [];

  public or(
    source: Buffer | IHunk | ISparseBuffer,
    offset?: number): SparseBuffer {
    return this._consume(source, offset || 0, or);
  }

  public and(
    source: Buffer | IHunk | ISparseBuffer,
    offset?: number): SparseBuffer {
    return this._consume(source, offset || 0, and);
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
    throw new Error(`'${transform.name || "transform"}' supports types: Buffer, Hunk, SparseBuffer`);
  }

  public getOnBitPositions(): number[] {
    const result = [] as number[];
    this._hunks.forEach(hunk => {
      for (let i = hunk.first; i <= hunk.last; i++) {
        addOnBitPositionsFor(result, this.at(i) as number, i);
      }
    });
    return result;
  }

  public dump(): number[] {
    const result = [];
    for (let i = 0; i < this._size; i++) {
      result.push(this.at(i) as number);
    }
    return result;
  }

  public at(index: number): number | undefined {
    const hunk = this._findHunkAt(index);
    if (!hunk) {
      return index < this._size ? 0 : undefined;
    }
    return hunk.buffer[index - hunk.first];
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
        intersection.set(idx, overlapTransform(hunk.at(idx), intersection.at(idx)));
        if (intersection.last === idx) {
          intersection = intersections.shift();
        }
        if (!intersection) {
          this._appendRemainingBytes(hunk, idx + 1);
          break;
        }
      }
    } else {
      this._addHunk(hunk);
    }
    this._recalculateLength();
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
    if (hunk.size === 0) {
      return;
    }
    if (insertBefore !== undefined) {
      this._hunks.splice(insertBefore, 0, hunk);
    } else {
      // -> instead of pushing and sorting, we could splice()
      this._hunks.push(hunk);
      this._hunks = this._hunks.sort(
        (a, b) => (a.first < b.first ? -1 : 1)
      );
    }
    // TODO: optimise this
    // -> only re-calculate length if it's changed (ie, not an insert into empty space)
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
  result: number[],
  src: number,
  offset: number): void {
  const bitOffset = offset * 8;
  for (let i = 0; i < 8; i++) {
    if (src & 0x01) {
      result.push(bitOffset + i);
    }
    src >>= 1;
  }
}
