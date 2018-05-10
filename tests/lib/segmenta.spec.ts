import Segmenta from "../../src/lib/segmenta";
import { RedisOptions } from "ioredis";
import * as faker from "faker";
import "expect-more-jest";

describe("Segmenta", () => {
  describe("construction", () => {
    it(`should construct without config, defaulting to localhost:6379`, () => {
      // Arrange
      // Act
      expect(() => new Segmenta()).not.toThrow();
      // Assert
    });
    it(`should construct with redis ClientOpts`, () => {
      // Arrange
      // Act
      expect(() => new Segmenta({} as RedisOptions)).not.toThrow();
      // Assert
    });
  });

  describe("get", () => {
    describe(`when no segment data defined`, () => {
      it(`should return an empty array`, async () => {
        // Arrange
        const
          sut = create(),
          segment = faker.random.alphaNumeric(5);
        // Act
        const result = await sut.get(segment);
        // Assert
        expect(result).toBeDefined();
        expect(result).toBeEmptyArray();
      });
    });
  });

  function create(config?: RedisOptions) {
    return new Segmenta(config);
  }
});
