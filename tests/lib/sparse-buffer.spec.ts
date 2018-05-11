import SparseBuffer from "../../src/lib/sparse-buffer";
import "expect-more-jest";

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
      const result = sut.size;
      // Assert
      expect(result).toEqual(0);
    });
  });

  describe(`functionality`, () => {
    describe(`or`, () => {
      describe(`non-intersection`, () => {
        it(`should initialize with the given buffer when no existing buffer`, () => {
          // Arrange
          const sut = create(),
            buffer = new Buffer([0x03, 0x04]);
          // Act
          sut.or(buffer);
          // Assert
          expect(sut.size).toEqual(2);
          expect(sut.at(0)).toEqual(0x03);
          expect(sut.at(1)).toEqual(0x04);
        });

        it(`should add another buffer which is immediately adjacent`, () => {
          // Arrange
          const sut = create(),
            buffer1 = new Buffer([0x01, 0x02]),
            buffer2 = new Buffer([0x03, 0x04]);
          // Act
          sut.or(buffer1).or(buffer2, 2);
          // Assert
          expect(sut.size).toEqual(4);
          expect(sut.at(0)).toEqual(0x01);
          expect(sut.at(1)).toEqual(0x02);
          expect(sut.at(2)).toEqual(0x03);
          expect(sut.at(3)).toEqual(0x04);
        });

        it(`should add another buffer which is one byte offset`, () => {
          // Arrange
          const sut = create(),
            buffer1 = new Buffer([0x01, 0x02]),
            buffer2 = new Buffer([0x03, 0x04]);
          // Act
          sut.or(buffer1).or(buffer2, 3);
          // Assert
          expect(sut.size).toEqual(5);
          expect(sut.at(0)).toEqual(0x01);
          expect(sut.at(1)).toEqual(0x02);
          expect(sut.at(2)).toEqual(0x00);
          expect(sut.at(3)).toEqual(0x03);
          expect(sut.at(4)).toEqual(0x04);
        });

        it(`should be able to add buffers out of order`, () => {
          // Arrange
          const sut = create(),
            buffer1 = new Buffer([0x01]),
            buffer2 = new Buffer([0x02]);
          // Act
          sut.or(buffer2, 1).or(buffer1, 0);
          // Assert
          expect(sut.size).toEqual(2);
          expect(sut.at(0)).toEqual(buffer1[0]);
          expect(sut.at(1)).toEqual(buffer2[0]);
        });
      });

      describe(`intersections`, () => {
        it(`should intersect one byte with one other byte`, () => {
          // Arrange
          const
            sut = create(),
            buffer1 = new Buffer([0x01]),
            buffer2 = new Buffer([0x02]);
          // Act
          sut.or(buffer1).or(buffer2);
          // Assert
          expect(sut.size).toEqual(1);
          expect(sut.at(0)).toEqual(0x03);
        });
        it(`should intersect two bytes over two existing non-sparse byte hunks`, () => {
          // Arrange
          const
            sut = create(),
            buffer1 = new Buffer([0x01]),
            buffer2 = new Buffer([0x02]),
            interloper = new Buffer([0x02, 0x04]),
            expected = [0x03, 0x06];
          // Act
          sut.or(buffer1, 0)
            .or(buffer2, 1)
            .or(interloper, 0);
          // Assert
          expect(sut.size).toEqual(2);
          expect(sut.at(0)).toEqual(expected[0]);
          expect(sut.at(1)).toEqual(expected[1]);
        });
        it(`should add the leftover bytes when provided buffer longer than existing virtual space`, () => {
          // Arrange
          const
            sut = create(),
            buffer1 = new Buffer([0x01]),
            buffer2 = new Buffer([0x02, 0x04]);
          // Act
          sut.or(buffer1)
            .or(buffer2);
          // Assert
          expect(sut.size).toEqual(2);
          expect(sut.at(0)).toEqual(0x03);
          expect(sut.at(1)).toEqual(0x04);
        });
        it(`should insert non-overlapping bytes`, () => {
          // Arrange
          const
            sut = create(),
            buffer1 = new Buffer([0x01]),
            buffer2 = new Buffer([0x04]),
            interloper = new Buffer([0x02, 0x02, 0x02]);
          // Act
          sut.or(buffer1, 0)
            .or(buffer2, 2)
            .or(interloper, 0);
          // Assert
          expect(sut.size).toEqual(3);
          expect(sut.at(0)).toEqual(0x03);
          expect(sut.at(1)).toEqual(0x02);
          expect(sut.at(2)).toEqual(0x06);
        });
        it(`should prepend non-overlapped bytes`, () => {
          // Arrange
          const
            sut = create(),
            buffer1 = new Buffer([0x02]),
            interloper = new Buffer([0x01]);
          // Act
          sut.or(buffer1, 1)
            .or(interloper, 0);
          // Assert
          expect(sut.size).toEqual(2);
          expect(sut.at(0)).toEqual(0x01);
          expect(sut.at(1)).toEqual(0x02);
        });
        it(`the whole enchilada`, () => {
          // Arrange
          const
            sut = create(),
            buffer1 = new Buffer([0x01, 0x01]),
            offset1 = 0,
            buffer2 = new Buffer([0x01, 0x01]),
            offset2 = 3,
            buffer3 = new Buffer([0x01, 0x01]),
            offset3 = 6,
            interloper1 = new Buffer([0x02, 0x02, 0x02]),
            interloper1Offset = 2,
            interloper2 = new Buffer([0x04, 0x04, 0x04, 0x04, 0x04]),
            interloper2Offset = 5,
            expected = [0x01, 0x01, 0x02, 0x03, 0x03, 0x04, 0x05, 0x05, 0x04, 0x04];
          // Act
          sut.or(buffer1, offset1)
            .or(buffer2, offset2)
            .or(buffer3, offset3)
            .or(interloper1, interloper1Offset)
            .or(interloper2, interloper2Offset);
          // Assert
          expect(sut.size).toEqual(expected.length);
          expect(sut.at(0)).toEqual(expected[0]);
          expect(sut.at(1)).toEqual(expected[1]);
          expect(sut.at(2)).toEqual(expected[2]);
          expect(sut.at(3)).toEqual(expected[3]);
          expect(sut.at(4)).toEqual(expected[4]);
          expect(sut.at(5)).toEqual(expected[5]);
          expect(sut.at(6)).toEqual(expected[6]);
          expect(sut.at(7)).toEqual(expected[7]);
          expect(sut.at(8)).toEqual(expected[8]);
        });
      });
    });

    describe(`and`, () => {
      describe(`non-intersection`, () => {
        it(`should initialize with the given buffer when no existing buffer`, () => {
          // Arrange
          const sut = create(),
            buffer = new Buffer([0x03, 0x04]);
          // Act
          sut.and(buffer);
          // Assert
          expect(sut.size).toEqual(2);
          expect(sut.at(0)).toEqual(0x03);
          expect(sut.at(1)).toEqual(0x04);
        });

        it(`should add another buffer which is immediately adjacent`, () => {
          // Arrange
          const sut = create(),
            buffer1 = new Buffer([0x01, 0x02]),
            buffer2 = new Buffer([0x03, 0x04]);
          // Act
          sut.and(buffer1)
            .and(buffer2, 2);
          // Assert
          expect(sut.size).toEqual(4);
          expect(sut.at(0)).toEqual(0x01);
          expect(sut.at(1)).toEqual(0x02);
          expect(sut.at(2)).toEqual(0x03);
          expect(sut.at(3)).toEqual(0x04);
        });

        it(`should add another buffer which is one byte offset`, () => {
          // Arrange
          const sut = create(),
            buffer1 = new Buffer([0x01, 0x02]),
            buffer2 = new Buffer([0x03, 0x04]);
          // Act
          sut.and(buffer1)
            .and(buffer2, 3);
          // Assert
          expect(sut.size).toEqual(5);
          expect(sut.at(0)).toEqual(0x01);
          expect(sut.at(1)).toEqual(0x02);
          expect(sut.at(2)).toEqual(0x00);
          expect(sut.at(3)).toEqual(0x03);
          expect(sut.at(4)).toEqual(0x04);
        });

        it(`should be able to add buffers out of order`, () => {
          // Arrange
          const sut = create(),
            buffer1 = new Buffer([0x01]),
            buffer2 = new Buffer([0x02]);
          // Act
          sut.and(buffer2, 1)
            .and(buffer1, 0);
          // Assert
          expect(sut.size).toEqual(2);
          expect(sut.at(0)).toEqual(buffer1[0]);
          expect(sut.at(1)).toEqual(buffer2[0]);
        });
      });

      describe(`intersections`, () => {
        it(`should intersect one byte with one other byte`, () => {
          // Arrange
          const
            sut = create(),
            buffer1 = new Buffer([0x01]),
            buffer2 = new Buffer([0x02]),
            expected = 0x01 & 0x02;
          // Act
          sut.and(buffer1)
            .and(buffer2);
          // Assert
          expect(sut.size).toEqual(1);
          expect(sut.at(0)).toEqual(expected);
        });
        it(`should intersect two bytes over two existing non-sparse byte hunks`, () => {
          // Arrange
          const
            sut = create(),
            buffer1 = new Buffer([0x01]),
            buffer2 = new Buffer([0x02]),
            interloper = new Buffer([0x02, 0x03]),
            expected = [0x01 & 0x02, 0x02 & 0x03];
          // Act
          sut.and(buffer1, 0)
            .and(buffer2, 1)
            .and(interloper, 0);
          // Assert
          expect(sut.size).toEqual(2);
          expect(sut.at(0)).toEqual(expected[0]);
          expect(sut.at(1)).toEqual(expected[1]);
        });
        it(`should add the leftover bytes when provided buffer longer than existing virtual space`, () => {
          // Arrange
          const
            sut = create(),
            buffer1 = new Buffer([0x01]),
            buffer2 = new Buffer([0x02, 0x04]),
            expected = [0x01 & 0x02, 0x04];
          // Act
          sut.and(buffer1)
            .and(buffer2);
          // Assert
          expect(sut.size).toEqual(2);
          expect(sut.at(0)).toEqual(expected[0]);
          expect(sut.at(1)).toEqual(expected[1]);
        });
        it(`should insert non-overlapping bytes`, () => {
          // Arrange
          const
            sut = create(),
            buffer1 = new Buffer([0x01]),
            buffer2 = new Buffer([0x04]),
            interloper = new Buffer([0x02, 0x02, 0x02]),
            expected = [0x01 & 0x02, 0x02, 0x04 & 0x02];
          // Act
          sut.and(buffer1, 0)
            .and(buffer2, 2)
            .and(interloper, 0);
          // Assert
          expect(sut.size).toEqual(3);
          expect(sut.at(0)).toEqual(expected[0]);
          expect(sut.at(1)).toEqual(expected[1]);
          expect(sut.at(2)).toEqual(expected[2]);
        });
        it(`should prepend non-overlapped bytes`, () => {
          // Arrange
          const
            sut = create(),
            buffer1 = new Buffer([0x02]),
            interloper = new Buffer([0x01]),
            expected = [0x01, 0x02];
          // Act
          sut.and(buffer1, 1)
            .and(interloper, 0);
          // Assert
          expect(sut.size).toEqual(2);
          expect(sut.at(0)).toEqual(expected[0]);
          expect(sut.at(1)).toEqual(expected[1]);
        });
        it(`the whole enchilada`, () => {
          // Arrange
          const
            sut = create(),
            buffer1 = new Buffer([0x01, 0x01]),
            offset1 = 0,
            buffer2 = new Buffer([0x01, 0x01]),
            offset2 = 3,
            buffer3 = new Buffer([0x01, 0x01]),
            offset3 = 6,
            interloper1 = new Buffer([0x02, 0x02, 0x02]),
            interloper1Offset = 2,
            interloper2 = new Buffer([0x04, 0x04, 0x04, 0x04, 0x04]),
            interloper2Offset = 5,
            expected = [0x01, 0x01, 0x02, 0x02 & 0x01, 0x02 & 0x01, 0x04, 0x01 & 0x04, 0x01 & 0x04, 0x04, 0x04];
          // Act
          sut.and(buffer1, offset1)
            .and(buffer2, offset2)
            .and(buffer3, offset3)
            .and(interloper1, interloper1Offset)
            .and(interloper2, interloper2Offset);
          // Assert
          expect(sut.size).toEqual(expected.length);
          expect(sut.at(0)).toEqual(expected[0]);
          expect(sut.at(1)).toEqual(expected[1]);
          expect(sut.at(2)).toEqual(expected[2]);
          expect(sut.at(3)).toEqual(expected[3]);
          expect(sut.at(4)).toEqual(expected[4]);
          expect(sut.at(5)).toEqual(expected[5]);
          expect(sut.at(6)).toEqual(expected[6]);
          expect(sut.at(7)).toEqual(expected[7]);
          expect(sut.at(8)).toEqual(expected[8]);
        });
      });
    });

    describe(`getOnBits`, () => {
      it(`should supply empty array when no buffers consumed`, () => {
        // Arrange
        const sut = create();
        // Act
        const result = sut.getOnBitPositions();
        // Assert
        expect(result).toBeEmptyArray();
      });
      it(`should return all numbers in a large contiguous array when all bits on`, () => {
        // Arrange
        const
          sut = create(),
          bytes = 1024 * 1024,
          src = new Buffer(bytes),
          bits = bytes * 8,
          timeLabel = `get the numbers: contiguous source of size ${humanSize(bytes)}`;
        for (let i = 0; i < bytes; i++) {
          src[i] = 0xFF;
        }
        sut.or(src);
        // Act
        startTimer(timeLabel);
        const result = sut.getOnBitPositions();
        endTimer(timeLabel);
        // Assert
        expect(result).toHaveLength(bits);
        for (let i = 0; i < bits; i++) {
          if (result[i] !== i) {
            fail(`expected ${i} at ${i}, but got ${result[i]}`);
            console.log({result});
            return;
          }
        }
      });

      it(`should return all numbers in a small contiguous array when all bits on`, () => {
        // Arrange
        const
          sut = create(),
          bytes = 1,
          src = new Buffer(bytes),
          bits = bytes * 8,
          timeLabel = `get the numbers: contiguous source of size ${humanSize(bytes)}`;
        for (let i = 0; i < bytes; i++) {
          src[i] = 0xFF;
        }
        sut.or(src);
        // Act
        startTimer(timeLabel);
        const result = sut.getOnBitPositions();
        endTimer(timeLabel);
        // Assert
        expect(result).toHaveLength(bits);
        for (let i = 0; i < bits; i++) {
          if (result[i] !== i) {
            fail(`expected ${i} at ${i}, but got ${result[i]}`);
            console.log({result});
            return;
          }
        }
      });

      it(`should return all numbers in a large sparse array with only the ends set all-on`, () => {
        // Arrange
        const
          sut = create(),
          upperBound = 1024 * 1024 * 1024,
          bits = upperBound * 8,
          timeLabel = `get the numbers, sparse array of size ${humanSize(upperBound)} with first and last bytes set`,
          allOn = new Buffer([0xFF]);
        sut.or(allOn, 0)
          .or(allOn, upperBound - 1);
        // Act
        startTimer(timeLabel);
        const result = sut.getOnBitPositions();
        endTimer(timeLabel);
        // Assert
        expect(result).toHaveLength(16);
        for (let i = 0; i < 8; i++) {
          if (result[i] !== i) {
            fail(`expected ${i} at ${i}, but got ${result[i]}`);
            console.log({result});
            return;
          }
        }
        for (let i = 8; i < 16; i++) {
          const expected = (bits - 16) + i;
          if (result[i] !== expected) {
            fail(`expected ${expected} at ${i}, but got ${result[i]}`);
            console.log({result});
            return;
          }
        }
      });

      function humanSize(bytes: number) {
        const suffixes = ["b", "kb", "mb"];
        while (bytes > 1024 && suffixes.length > 1) {
          bytes /= 1024;
          suffixes.shift();
        }
        return `${bytes}${suffixes[0]}`;
      }

      // times are becoming noise in continual test output
      //  - if you want times, define the environment variable
      //    SHOW_TIMES
      function startTimer(label: string) {
        if (process.env.SHOW_TIMES) {
          console.time(label);
        }
      }
      function endTimer(label: string) {
        if (process.env.SHOW_TIMES) {
          console.timeEnd(label);
        }
      }
    });
  });

  function create() {
    return new SparseBuffer();
  }
});
