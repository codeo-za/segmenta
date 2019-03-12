import { expect } from "chai";
import Segmenta from "../src/index";

describe("index", () => {
    it(`should export the Segmenta class`, () => {
        // Arrange
        // Act
        // Assert
        expect(Segmenta).to.exist;
        expect(Segmenta.name).to.equal("Segmenta");
        expect(Segmenta).to.be.a("function");
        const instance = new Segmenta();
        expect(instance).to.exist;
    });
});
