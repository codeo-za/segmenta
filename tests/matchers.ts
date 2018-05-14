import CustomMatcherResult = jasmine.CustomMatcherResult;
import SparseBuffer from "../src/lib/sparse-buffer";
import CustomMatcherFactories = jasmine.CustomMatcherFactories;

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
      return {pass: true, message: () => ""};
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

  beforeAll(
    () => {
      jest.addMatchers({
        toMatchArray: () => {
          return {
            compare: (actual: SparseBuffer, expected: number[]) => {
              return doAssertions(() => {
                assert(actual.length === expected.length,
                  `Expected length of ${expected.length}   but got ${actual.length}`);
                expected.forEach((byte, idx) => {
                  assert(actual.at(idx) === byte,
                    `Expected ${byte} at position ${idx} but got ${actual.at(idx)}`);
                });
              });
            }
          };
        },
        toBeEquivalentTo: () => {
          return {
            compare: (actual: any[], expected: any[]) => {
              return doAssertions(() => {
                assert(Array.isArray(actual), `${JSON.stringify(actual)} is not an array`);
                assert(Array.isArray(expected), `${JSON.stringify(expected)} is not an array`);
                assert(actual.length === expected.length,
                  `expected length of ${expected.length} but got ${actual.length}`);
                const copy = expected.slice(0);
                actual.forEach(a => {
                  const matchIndex = copy.indexOf(a);
                  if (matchIndex > -1) {
                    copy.splice(matchIndex, 1);
                  }
                });
                assert(copy.length === 0,
                  `expected\n${actual}\nto be equivalent to\n${expected}`);
              });
            }
          };
        },
      });
    });
})();
