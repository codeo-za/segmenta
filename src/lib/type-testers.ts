import { IAddOperation, IDelOperation } from "./interfaces";

/* tslint:disable-next-line:ban-types */
export function isFunction(x: any): x is Function {
  return typeof x === "function";
}

export function isNumber(x: any): x is number {
  return typeof x === "number";
}

export function isUUID(x: string): boolean {
  return !!(x || "")
        .match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
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
