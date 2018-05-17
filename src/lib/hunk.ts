import {types} from "util";
import {isFunction} from "./type-testers";

export interface IHunk {
  // raw access to the buffer
  buffer: Buffer;
  // the virtual position of the first byte covered by this hunk
  first: number;
  // the virtual position of the last byte covered by this hunk
  last: number;
  // gets the number of bytes in this buffer
  length: number;

  // set a value at virtual address idx
  set(idx: number, value: number): void;

  // get a value at virtual address idx
  at(idx: number): number;

  // determines if this hunk covers the virtual address idx
  covers(idx: number): boolean;

  // gets you a slice of the buffer (as a new buffer)
  slice(start: number, end?: number): Buffer;
}

export class Hunk implements IHunk {
  private readonly _buffer: Buffer;
  private readonly _offset: number;

  get buffer() {
    return this._buffer;
  }

  get first() {
    return this._offset;
  }

  get last() {
    return this._offset + this._buffer.length - 1;
  }

  get length() {
    return this._buffer.length;
  }

  constructor(buffer: Buffer, offset: number = 0) {
    this._buffer = buffer;
    this._offset = offset || 0;
  }

  public set(idx: number, value: number): void {
    this._buffer[idx - this._offset] = value;
  }

  public at(idx: number): number {
    return this._buffer[idx - this._offset];
  }

  public covers(idx: number): boolean {
    return idx >= this.first && idx <= this.last;
  }

  public slice(start: number, end?: number): Buffer {
    const sliceStart = start - this._offset;
    return end === undefined
      ? this._buffer.slice(sliceStart)
      : this._buffer.slice(sliceStart, end - this._offset);
  }
}

export function isHunk(obj: any): obj is IHunk {
  if (obj instanceof Hunk) {
    return true;
  }
  return obj.buffer &&
    obj.buffer instanceof Buffer &&
    types.isNumberObject(obj.first === "number") &&
    types.isNumberObject(obj.last) &&
    types.isNumberObject(obj.length) &&
    isFunction(obj.set) &&
    isFunction(obj.at) &&
    isFunction(obj.covers) &&
    isFunction(obj.slice);
}
