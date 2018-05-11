/* tslint:disable-next-line:ban-types */
export function isFunction(x: any): x is Function {
  return typeof x === "function";
}

export function isNumber(x: any): x is number {
  return typeof x === "number";
}
