import SparseBuffer from "../../src/lib/sparse-buffer";
import "jasmine-expect";

describe("sparse-buffer", () => {
  it(`should export the SparseBuffer class as default`, () => {
    // Arrange
    // Act
    expect(SparseBuffer).toBeFunction();
    expect(() => new SparseBuffer()).not.toThrow();
    // Assert
  });

  describe(`construction`, () => {
    it(`should have a length property, defaulting to 0`, () => {
      // Arrange
      const sut = create();
      // Act
      const result = sut.length;
      // Assert
      expect(result).toEqual(0);
    });
  });

  describe(`functionality`, () => {
    describe(`or`, () => {
      it(`should initialize with the given buffer when no existing buffer`, () => {
        // Arrange
        const
          sut = create(),
          buffer = new Buffer([0x03, 0x04]);
        // Act
        sut.or(buffer);
        // Assert
        expect(sut.length).toEqual(2);
        expect(sut.at(0)).toEqual(0x03);
        expect(sut.at(1)).toEqual(0x04);
      });

      it(`should add another buffer which is immediately adjacent`, () => {
        // Arrange
        const
          sut = create(),
          buffer1 = new Buffer([0x01, 0x02]),
          buffer2 = new Buffer([0x03, 0x04]);
        // Act
        sut.or(buffer1).or(buffer2, 2);
        // Assert
        expect(sut.length).toEqual(4);
        // expect(sut.at(0)).toEqual(0x01);
        // expect(sut.at(1)).toEqual(0x02);
        expect(sut.at(2)).toEqual(0x03);
        // expect(sut.at(3)).toEqual(0x04);
      });
    });
  });

  function create() {
    return new SparseBuffer();
  }
});
