import { IToken, ISimpleToken, tokenize, TokenTypes } from "../../../src/lib/dsl/tokenize";
import "../../matchers";
import _ = require("lodash");

describe(`tokenizer`, () => {
    it(`should export the tokenize function`, () => {
        // Arrange
        // Act
        expect(tokenize).toBeAFunction();
        // Assert
    });

    function simplify(tokens: IToken[]): ISimpleToken[] {
        return tokens.map(o => _.pick(o, ["type", "value"]) as ISimpleToken);
    }

    describe(`behavior`, () => {
        it(`should retrieve simplest GET WHERE IN('x')`, () => {
            // Arrange
            const
                code = "GET WHERE IN('x')",
                expected = [{
                    type: TokenTypes.get
                }, {
                    type: TokenTypes.include
                }, {
                    type: TokenTypes.oparens
                }, {
                    type: TokenTypes.identifier,
                    value: "x"
                }, {
                    type: TokenTypes.cparens
                }];
            // Act
            const result = simplify(tokenize(code));
            // Assert
            expect(result).toEqual(expected);
        });

        it(`should retrieve simplest COUNT WHERE IN ("y")`, () => {
            // Arrange
            const
                code = "COUNT  WHERE IN (\"y\")",
                expected = [{
                    type: TokenTypes.count
                }, {
                    type: TokenTypes.include
                }, {
                    type: TokenTypes.oparens
                }, {
                    type: TokenTypes.identifier,
                    value: "y"
                }, {
                    type: TokenTypes.cparens
                }];
            // Act
            const result = simplify(tokenize(code));
            // Assert
            expect(result).toEqual(expected);
        });

        it(`should retrieve simplest RANDOM WHERE IN ('y')`, async () => {
            // Arrange
            const
                code = "RANDOM WHERE IN ('y')",
                expected = [{
                    type: TokenTypes.random
                }, {
                    type: TokenTypes.include
                }, {
                    type: TokenTypes.oparens
                }, {
                    type: TokenTypes.identifier,
                    value: "y"
                }, {
                    type: TokenTypes.cparens
                }];
            // Act
            const result = simplify(tokenize(code));
            // Assert
            expect(result).toEqual(expected);
        });

        [{
            name: "kebab-identifiers",
            eg: "x-y"
        }, {
            name: "snake_case_identifiers",
            eg: "x_y"
        }, {
            name: "colon:separated:identifiers",
            eg: "x:y:z"
        }].forEach(tc => {
            it(`should understand ${tc.name}`, () => {
                // Arrange
                const
                    code = `COUNT
           WHERE
           IN (
            "${tc.eg}"
           )`,
                    expected = [{
                        type: TokenTypes.count
                    }, {
                        type: TokenTypes.include
                    }, {
                        type: TokenTypes.oparens
                    }, {
                        type: TokenTypes.identifier,
                        value: tc.eg
                    }, {
                        type: TokenTypes.cparens
                    }];
                // Act
                const result = simplify(tokenize(code));
                // Assert
                expect(result).toEqual(expected);
            });
        });
        ["\"", "'"].forEach(q => {
            it(`should understand identifiers quoted with ${q}, but unquote them in the result`, () => {
                // Arrange
                const
                    code = `COUNT WHERE  IN  (${q}x${q})`,
                    expected = [{
                        type: TokenTypes.count
                    }, {
                        type: TokenTypes.include
                    }, {
                        type: TokenTypes.oparens
                    }, {
                        type: TokenTypes.identifier,
                        value: "x"
                    }, {
                        type: TokenTypes.cparens
                    }];
                // Act
                const result = simplify(tokenize(code));
                // Assert
                expect(result).toEqual(expected);
            });

            it(`should not appreciate quotes within identifiers (${q})`, () => {
                // Arrange
                const code = `GET WHERE in (${q}x${q}y${q})`;
                // Act
                expect(() => tokenize(code)).toThrow();
                // Assert
            });

            it(`should not appreciate incomplete quotes`, () => {
                // Arrange
                const
                    code1 = `GET WHERE in (${q}x)`,
                    code2 = `COUNT where in (x${q})`;
                // Act
                expect(() => tokenize(code1)).toThrow();
                expect(() => tokenize(code2)).toThrow();
                // Assert
            });

            it(`should not appreciate mismatched quotes`, () => {
                // Arrange
                const
                    code1 = `count where in ('x")`,
                    code2 = `get where in ("moo')`;
                // Act
                expect(() => tokenize(code1)).toThrow();
                expect(() => tokenize(code2)).toThrow();
                // Assert
            });

            it(`should pick up syntax words in quotes as identifiers`, () => {
                // Arrange
                const
                    code = "get where in ('count')",
                    expected = [
                        {type: TokenTypes.get},
                        {type: TokenTypes.include},
                        {type: TokenTypes.oparens},
                        {type: TokenTypes.identifier, value: "count"},
                        {type: TokenTypes.cparens}
                    ];

                // Act
                const result = simplify(tokenize(code));
                // Assert
                expect(result).toEqual(expected);
            });

            it(`should pick up AND`, () => {
                // Arrange
                const
                    code = "GET where (in('x') AND in ('y'))",
                    expected = [
                        {type: TokenTypes.get},
                        {type: TokenTypes.oparens},
                        {type: TokenTypes.include},
                        {type: TokenTypes.oparens},
                        {type: TokenTypes.identifier, value: "x"},
                        {type: TokenTypes.cparens},
                        {type: TokenTypes.and},
                        {type: TokenTypes.include},
                        {type: TokenTypes.oparens},
                        {type: TokenTypes.identifier, value: "y"},
                        {type: TokenTypes.cparens},
                        {type: TokenTypes.cparens}
                    ];
                // Act
                const result = simplify(tokenize(code));
                // Assert
                expect(result).toEqual(expected);
            });

            it(`should pick up OR`, () => {
                // Arrange
                const
                    code = "GET where (in('x') OR in ('y'))",
                    expected = [
                        {type: TokenTypes.get},
                        {type: TokenTypes.oparens},
                        {type: TokenTypes.include},
                        {type: TokenTypes.oparens},
                        {type: TokenTypes.identifier, value: "x"},
                        {type: TokenTypes.cparens},
                        {type: TokenTypes.or},
                        {type: TokenTypes.include},
                        {type: TokenTypes.oparens},
                        {type: TokenTypes.identifier, value: "y"},
                        {type: TokenTypes.cparens},
                        {type: TokenTypes.cparens}
                    ];
                // Act
                const result = simplify(tokenize(code));
                // Assert
                expect(result).toEqual(expected);
            });
        });
        it(`should throw error for invalid token at start`, () => {
            // Arrange
            // Act
            expect(() => tokenize("GOT WHERE"))
                .toThrow("Syntax error (line 1, char 1): 'GOT WHERE'");
            // Assert
        });
        it(`should throw error with valid line / char value`, () => {
            // Arrange
            // Act
            expect(() => tokenize(`GET
WHAT IN 'x'`)).toThrow("Syntax error (line 1, char 1): 'GET\nWHAT I...'");
            // Assert
        });
        it(`should throw an error when query is empty`, () => {
            // Arrange
            // Act
            expect(() => tokenize(""))
                .toThrow("Syntax error: empty query");
            // Assert
        });
        it(`should throw an error when query does not start with "COUNT WHERE" or "GET WHERE"`, () => {
            // Arrange
            // Act
            expect(() => tokenize("IN GET WHERE IN 'x'"))
                .toThrow("Syntax error: query must start with 'GET WHERE' or 'COUNT WHERE'");
            // Assert
        });
        it(`should throw an error when the initial query is an exclusion (infinite set)`, () => {
            // Arrange
            // Act
            expect(() => tokenize("GET WHERE NOT IN 'x'"))
                .toThrow(/may not start query with 'not in': result set is infinite/);
            // Assert
        });
        it(`should throw an error when there is no initial 'IN'`, () => {
            // Arrange
            // Act
            expect(() => tokenize("GET WHERE 'X'")).toThrow(
                "Syntax error: 'GET WHERE' / 'COUNT WHERE' / 'RANDOM WHERE' requires at least initial 'IN'"
            );
            // Assert
        });
        it(`should throw an error when there is no initial 'IN' (2)`, () => {
            // Arrange
            // Act
            expect(() => tokenize("GET WHERE 'X' OR IN 'Y'")).toThrow(
                "Syntax error: 'GET WHERE' / 'COUNT WHERE' / 'RANDOM WHERE' requires at least initial 'IN'"
            );
            // Assert
        });
        it(`should throw an error when there are no identifiers`, () => {
            // Arrange
            // Act
            expect(() => tokenize("GET WHERE IN OR AND AND")).toThrow(
                "Syntax error: no segment id specified (must be single- or double-quoted)"
            );
            // Assert
        });
        [
            {q: "GET WHERE IN 'X' AND AND IN 'Y'", e: /may not run and into and/i},
            {q: "GET WHERE IN 'X' OR OR IN 'Y'", e: /may not run or into or/i},
            {q: "GET WHERE IN 'X' and OR IN 'Y'", e: /may not run and into or/i},
            {q: "GET WHERE IN 'X' or and IN 'Y'", e: /may not run or into and/i},
            {q: "GET WHERE IN 'X' or not not in 'y'", e: /may not run not into not in/i},
            {q: "GET WHERE IN 'X' or not in not 'y'", e: /may not run not in into not/i},
        ].forEach(tc => {
            it(`should throw for adjacent, non-sensical syntax`, () => {
                // Arrange
                // Act
                expect(() => tokenize(tc.q)).toThrow(tc.e);
                // Assert
            });
        });
    });
});
