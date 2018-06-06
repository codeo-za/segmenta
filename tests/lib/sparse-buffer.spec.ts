import {SparseBuffer} from "../../src/lib/sparse-buffer";
import "expect-more-jest";
import "../matchers";
import {Hunk, IHunk} from "../../src/lib/hunk";
import {startTimer, endTimer} from "../timer";

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
        describe(`binary operators`, () => {
            describe(`acting on Buffers`, () => {
                describe(`or`, () => {
                    describe(`non-intersection`, () => {
                        it(`should initialize with the given buffer when no existing buffer`, () => {
                            // Arrange
                            const sut = create(),
                                buffer = new Buffer([0x03, 0x04]);
                            // Act
                            sut.or(buffer);
                            // Assert
                            expect(sut).toHaveLength(2);
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
                            expect(sut).toHaveLength(4);
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
                            expect(sut).toHaveLength(5);
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
                            expect(sut).toHaveLength(2);
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
                            expect(sut).toHaveLength(1);
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
                            expect(sut).toHaveLength(2);
                            expect(sut.at(0)).toEqual(expected[0]);
                            expect(sut.at(1)).toEqual(expected[1]);
                        });
                        /* tslint:disable */
                        it(`should add the leftover bytes when provided buffer longer than existing virtual space`, () => {
                        /* tslint:enable */
                            // Arrange
                            const
                                sut = create(),
                                buffer1 = new Buffer([0x01]),
                                buffer2 = new Buffer([0x02, 0x04]);
                            // Act
                            sut.or(buffer1)
                                .or(buffer2);
                            // Assert
                            expect(sut).toHaveLength(2);
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
                            expect(sut).toHaveLength(3);
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
                            expect(sut).toHaveLength(2);
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
                            expect(sut).toHaveLength(expected.length);
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
                            expect(sut).toHaveLength(2);
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
                            expect(sut).toHaveLength(4);
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
                            expect(sut).toHaveLength(5);
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
                            expect(sut).toHaveLength(2);
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
                            expect(sut).toHaveLength(1);
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
                            expect(sut).toHaveLength(2);
                            expect(sut.at(0)).toEqual(expected[0]);
                            expect(sut.at(1)).toEqual(expected[1]);
                        });
                        /* tslint:disable */
                        it(`should add the leftover bytes when provided buffer longer than existing virtual space`, () => {
                        /* tslint:enable */
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
                            expect(sut).toHaveLength(2);
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
                            expect(sut.length).toEqual(3);
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
                            expect(sut.length).toEqual(2);
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
                                expected = [
                                    0x01,
                                    0x01,
                                    0x02,
                                    0x02 & 0x01,
                                    0x02 & 0x01,
                                    0x04,
                                    0x01 & 0x04,
                                    0x01 & 0x04,
                                    0x04,
                                    0x04];
                            // Act
                            sut.and(buffer1, offset1)
                                .and(buffer2, offset2)
                                .and(buffer3, offset3)
                                .and(interloper1, interloper1Offset)
                                .and(interloper2, interloper2Offset);
                            // Assert
                            expect(sut.length).toEqual(expected.length);
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
            });

            describe(`acting on SparseBuffers`, () => {
                describe(`or`, () => {
                    it(`should be able to consume simple, not-overlapping SparseBuffer`, () => {
                        // Arrange
                        const
                            sut = create(new Hunk(new Buffer([0x01]), 0)),
                            other = create(new Hunk(new Buffer([0x02]), 1)),
                            expected = [0x01, 0x02];
                        // Act
                        sut.or(other);
                        // Assert
                        expect(sut).toMatchArray(expected);
                    });
                    it(`should be able to consume overlapping SparseBuffer`, () => {
                        // Arrange
                        const
                            sut = create(new Hunk(new Buffer([0x01]), 0)),
                            other = create(new Hunk(new Buffer([0x02]), 0)),
                            expected = [0x03];
                        // Act
                        sut.or(other);
                        // Assert
                        expect(sut).toMatchArray(expected);
                    });
                    it(`should consume all hunks`, () => {
                        // Arrange
                        const
                            sut = create(new Hunk(new Buffer([0x01]), 0), new Hunk(new Buffer([0x01]), 1)),
                            other = create(new Hunk(new Buffer([0x02]), 0), new Hunk(new Buffer([0x02]), 1)),
                            expected = [0x03, 0x03];
                        // Act
                        sut.or(other);
                        // Assert
                        expect(sut).toMatchArray(expected);
                    });
                });
                describe(`and`, () => {
                    it(`should be able to consume simple, non-overlapping SparseBuffer`, () => {
                        // Arrange
                        const
                            sut = create(new Hunk(new Buffer([0x01]), 0)),
                            other = create(new Hunk(new Buffer([0x02]), 1)),
                            expected = [0x01, 0x02];
                        // Act
                        sut.and(other);
                        // Assert
                        expect(sut).toHaveLength(2);
                        expect(sut).toMatchArray(expected);
                    });
                    it(`should be able to consume single overlapping SparseBuffer`, () => {
                        // Arrange
                        const
                            sut = create(new Hunk(new Buffer([0x03]), 0)),
                            other = create(new Hunk(new Buffer([0x01]), 0)),
                            expected = [0x01];
                        // Act
                        sut.and(other);
                        // Assert
                        expect(sut).toMatchArray(expected);
                    });
                    it(`should consume all hunks`, () => {
                        // Arrange
                        const
                            sut = create(new Hunk(new Buffer([0x01]), 0), new Hunk(new Buffer([0x01]), 1)),
                            other = create(new Hunk(new Buffer([0x02]), 0), new Hunk(new Buffer([0x02, 0x03]), 1)),
                            expected = [0x00, 0x00, 0x03];
                        // Act
                        sut.and(other);
                        // Assert
                        expect(sut).toMatchArray(expected);
                    });
                });
            });
        });

        describe(`not`, () => {
            [
                {
                    l: 0b00000001,
                    r: 0b00000001,
                    e: 0b00000000
                },

                {
                    l: 0b00000010,
                    r: 0b00000001,
                    e: 0b00000010
                },

                {
                    l: 0b00000011,
                    r: 0b00000001,
                    e: 0b00000010
                },

                {
                    l: 0b00000011,
                    r: 0b00000010,
                    e: 0b00000001
                },

                {
                    l: 0b10101010,
                    r: 0b01010101,
                    e: 0b10101010
                },

                {
                    l: 0b10101011,
                    r: 0b11011101,
                    e: 0b00100010
                },

            ].forEach(tc => {
                it(`should be able to negate with a single-byte Buffer: ${tc.l} ! ${tc.r} => ${tc.e}`, () => {
                    // Arrange
                    const
                        left = new Buffer([tc.l]),
                        right = new Buffer([tc.r]),
                        expected = [tc.e],
                        sut = create(new Hunk(left, 0));
                    // Act
                    sut.not(right);
                    // Assert
                    expect(sut).toMatchArray(expected);
                });
            });

            [
                (bytes: number[]) => new Buffer(bytes),
                (bytes: number[]) => new Hunk(new Buffer(bytes), 0),
                (bytes: number[]) => new SparseBuffer(new Buffer(bytes))
            ].forEach(generator => {
                it(`should be able to negate with a multi-byte buffer`, () => {
                    // Arrange
                    const
                        l = [0b01011010, 0b10010110],
                        r = [0b10110100, 0b01011010],
                        e = [0b01001010, 0b10000100],
                        left = new SparseBuffer(new Buffer(l)),
                        right = generator(r);
                    // Act
                    left.not(right);
                    // Assert
                    expect(left).toMatchArray(e);
                });
            });
        });

        describe(`getOnBitPositions`, () => {
            it(`should supply empty array when no buffers consumed`, () => {
                // Arrange
                const sut = create();
                // Act
                const result = sut.getOnBitPositions();
                // Assert
                expect(result).toBeEmptyArray();
            });

            it(`should return all numbers in a small contiguous array when all bits on`, () => {
                // Arrange
                const
                    sut = create(),
                    bytes = 1,
                    src = new Buffer(bytes),
                    expected = [0, 1, 2, 3, 4, 5, 6, 7],
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
                expect(result).toEqual(expected);
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
                        fail(`expected ${i + 1} at ${i}, but got ${result[i]}`);
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
                    /* tslint:disable */
                    timeLabel = `get the numbers, sparse array of size ${humanSize(upperBound)} with first and last bytes set`,
                    /* tslint:enable */
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

            describe(`paging`, () => {
                it(`should paginate two numbers on the same byte`, () => {
                    // Arrange
                    const
                        sut = create(),
                        first = new Buffer([64 | 32]),
                        expected1 = [1],
                        expected2 = [2];
                    // Act
                    sut.append(first);
                    const result1 = sut.getOnBitPositions(0, 1);
                    const result2 = sut.getOnBitPositions(1, 1);
                    // Assert
                    expect(result1).toEqual(expected1);
                    expect(result2).toEqual(expected2);
                });
                it(`should paginate two numbers on different hunks`, () => {
                    // Arrange
                    const
                        sut = create(),
                        first = new Buffer([64]),
                        second = new Buffer([32]),
                        expected1 = [1],
                        expected2 = [10];
                    // Act
                    sut.append(first).append(second);
                    const result1 = sut.getOnBitPositions(0, 1);
                    const result2 = sut.getOnBitPositions(1, 1);
                    // Assert
                    expect(result1).toEqual(expected1);
                    expect(result2).toEqual(expected2);
                });
            });
        });
    });

    function create(...initialData: IHunk[]) {
        const result = new SparseBuffer();
        initialData.forEach(hunk => {
            result.or(hunk);
        });
        return result;
    }

    function humanSize(bytes: number) {
        const suffixes = ["b", "kb", "mb"];
        while (bytes > 1024 && suffixes.length > 1) {
            bytes /= 1024;
            suffixes.shift();
        }
        return `${bytes}${suffixes[0]}`;
    }

});
