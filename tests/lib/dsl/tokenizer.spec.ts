import {tokenize, TokenTypes} from "../../../src/lib/dsl/tokenize";
import "../../matchers";

describe(`tokenizer`, () => {
  it(`should export the tokenize function`, () => {
    // Arrange
    // Act
    expect(tokenize).toBeAFunction();
    // Assert
  });
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
      const result = tokenize(code);
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
      const result = tokenize(code);
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
        const result = tokenize(code);
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
        const result = tokenize(code);
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
        const result = tokenize(code);
        // Assert
        expect(result).toEqual(expected);
      });

      it(`should pick up AND`, () => {
        // Arrange
        const
          code = "GET where (in('x') AND in ('y'))",
          expected = [
            { type: TokenTypes.get },
            { type: TokenTypes.oparens },
            { type: TokenTypes.include },
            { type: TokenTypes.oparens },
            { type: TokenTypes.identifier, value: "x" },
            { type: TokenTypes.cparens },
            { type: TokenTypes.and },
            { type: TokenTypes.include },
            { type: TokenTypes.oparens },
            { type: TokenTypes.identifier, value: "y" },
            { type: TokenTypes.cparens },
            { type: TokenTypes.cparens }
          ];
        // Act
        const result = tokenize(code);
        // Assert
        expect(result).toEqual(expected);
      });

      it(`should pick up OR`, () => {
        // Arrange
        const
          code = "GET where (in('x') OR in ('y'))",
          expected = [
            { type: TokenTypes.get },
            { type: TokenTypes.oparens },
            { type: TokenTypes.include },
            { type: TokenTypes.oparens },
            { type: TokenTypes.identifier, value: "x" },
            { type: TokenTypes.cparens },
            { type: TokenTypes.or },
            { type: TokenTypes.include },
            { type: TokenTypes.oparens },
            { type: TokenTypes.identifier, value: "y" },
            { type: TokenTypes.cparens },
            { type: TokenTypes.cparens }
          ];
        // Act
        const result = tokenize(code);
        // Assert
        expect(result).toEqual(expected);
      });
    });
  });
});
