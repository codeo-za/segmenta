import CustomMatcherResult = jasmine.CustomMatcherResult;
import SparseBuffer from "../src/lib/sparse-buffer";

(() => {
  function failWith(message: string) {
    return {
      pass: false,
      message: () => message
    };
  }
  function doAssertions(logicFunc: () => void) {
    try {
      logicFunc();
      return { pass: true, message: () => "" };
    } catch (e) {
      return failWith(e.toString());
    }
  }
  function assert(...args: any[]) {
    const condition = !!args[0];
    if (condition) {
      return;
    }
    const message = (args.slice(1) || ["" + condition]).join(" ");
    throw message;
  }

  beforeAll(() => {
    jest.addMatchers({
      toMatchArray: () => {
        return {
          compare: (actual: SparseBuffer, expected: number[]) => {
            return doAssertions(() => {
              assert(actual.length === expected.length,
                `Expected length of ${expected.length} but got ${actual.length}`);
              expected.forEach((byte, idx) => {
                assert(actual.at(idx) === byte, `Expected ${byte} at position ${idx} but got ${actual.at(idx)}`);
              });
            });
          }
        };
      }
    });
  });
})();
