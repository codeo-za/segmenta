import { parse } from "../../../src/lib/dsl/parse";
import "../../matchers";

describe(`parse.ts`, () => {
    it(`should export the parse function`, () => {
        // Arrange
        // Act
        expect(parse).toBeAFunction();
        // Assert
    });
});
