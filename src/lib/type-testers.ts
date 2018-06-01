import { IAddOperation, IDelOperation } from "./interfaces";
import {ISparseBuffer, default as SparseBuffer} from "./sparse-buffer";
import {Hunk, IHunk} from "./hunk";
import {types} from "util";
import {SegmentaPipeline} from "./dsl/pipeline";

/* tslint:disable-next-line:ban-types */
export function isFunction(x: any): x is Function {
  return typeof x === "function";
}

export function isNumber(x: any): x is number {
  return typeof x === "number";
}

export function isUUID(x: string): boolean {
  return !!(x || "")
        .match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
}

export function isAddOperation(op: any): op is IAddOperation {
  return !isNaN(op.add);
}

export function isDelOperation(op: any): op is IDelOperation {
  return !isNaN(op.del);
}

export function isString(x: any): x is string {
  return typeof x === "string";
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

export function isPipeline(x: any): x is SegmentaPipeline {
  return x instanceof SegmentaPipeline;
}
