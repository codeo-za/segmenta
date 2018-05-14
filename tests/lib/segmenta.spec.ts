import Segmenta, {ISegmentaOptions} from "../../src/lib/segmenta";
const Redis = require("ioredis");
import * as faker from "faker";
import "expect-more-jest";
import {endTimer, startTimer} from "../timer";
import SparseBuffer from "../../src/lib/sparse-buffer";

describe("Segmenta", () => {
  const keyPrefixes = [] as string[];
  afterAll(async () => {
    const redis = new Redis();
    for (const prefix of keyPrefixes) {
      const keys = await redis.keys(`${prefix}/*`);
      for (const key of keys) {
        await redis.del(key);
      }
    }
  });
  function segmentName() {
    return faker.random.alphaNumeric(32);
  }
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
      expect(() => new Segmenta({} as ISegmentaOptions)).not.toThrow();
      // Assert
    });
  });

  describe("get", () => {
    describe(`when no segment data defined`, () => {
      it(`should return an empty array`, async () => {
        // Arrange
        const
          sut = create(),
          segment = segmentName();
        // Act
        const result = await sut.get(segment);
        // Assert
        expect(result).toBeDefined();
        expect(result).toBeEmptyArray();
      });
    });
    describe(`when have data`, () => {
      it(`after adding id 1, should be able to get back id 1`, async () => {
        // Arrange
        const
          sut = create(),
          segment = segmentName();
        // Act
        await sut.add(segment, [1]);
        const result = await sut.get(segment);
        // Assert
        expect(result).toEqual([1]);
      });
      it(`after adding id 1 & 7, should be able to get back id 1 & 7 ('A')`, async () => {
        // Arrange
        const
          sut = create(),
          segment = segmentName();
        // Act
        await sut.add(segment, [1, 7]);
        const result = await sut.get(segment);
        // Assert
        expect(result).toEqual([1, 7]);
      });
      it(`after adding 0, 1, 3, 5, 7, 9, 13, should get that back`, async () => {
        // Arrange
        const
          sut1 = create(),
          sut2 = create(),
          ids = [0, 1, 3, 5, 7, 9, 13],
          segment = segmentName();
        // Act
        await sut1.add(segment, ids);
        const result = await sut2.get(segment);
        // Assert
        expect(result).toEqual(ids);
      });
      it(`should store segments in chunks of 41960 by default`, async () => {
        // Arrange
        const
          sut = create(),
          values = [ 0, 1, 1025, 41960, 41961],
          segment = "defaultChunkSize";
        // Act
        await sut.add(segment, values);
        const ids = await sut.get(segment);
        const buffer = await sut.getBuffer(segment);
        // Assert
        expect(ids).toEqual(values);
        expect(buffer.hunks).toHaveLength(2);
        const sparse1 = new SparseBuffer().or(buffer.hunks[0].buffer, 0);
        const sparse2 = new SparseBuffer().or(buffer.hunks[1].buffer, sut.segmentSize / 8);
        expect(sparse1.getOnBitPositions()).toEqual(values.filter(v => v < sut.segmentSize));
        expect(sparse2.getOnBitPositions()).toEqual(values.filter(v => v >= sut.segmentSize));
      });

      it(`should return ids for small segments, one id per segment`, async () => {
        // Arrange
        const
          sut = create({
            segmentSize: 8
          }),
          source = [1, 11],
          segment = "smallSets";
        // Act
        await sut.add(segment, source);
        const result = await sut.get(segment);
        // Assert
        expect(result).toEqual(source);
      });

      it(`speed test: +- 1 00 000 ids over 5 000 000`, async () => {
        // Arrange
        const
          sut = create(),
          segment = segmentName(),
          range5 = { min: 1, max: 2 },
          accept = (i: number) => faker.random.number(range5) === 1,
          source1 = createIdSource(1, 10000, accept),
          source2 = createIdSource(50000, 150000, accept),
          source3 = createIdSource(3000000, 3200000, accept),
          source = source1.concat(source2).concat(source3),
          label1 = `populating ${source.length} ids`,
          label2 = `retrieving ids`,
          label3 = `verifiying ids`;
        // Act
        startTimer(label1);
        await sut.add(segment, source);
        endTimer(label1);
        startTimer(label2);
        const result = await sut.get(segment);
        endTimer(label2);
        // Assert
        startTimer(label3);
        expect(result.length).toEqual(source.length);
        const mismatches = result.reduce((acc, cur, idx) => {
          if (source.indexOf(cur) === -1) {
            acc.push(cur);
          }
          return acc;
        }, [] as number[]);
        endTimer(label3);
        expect(mismatches).toBeEmptyArray();
      });

      function createIdSource(
        min: number,
        max: number,
        numberSelector: (i: number) => boolean): number[] {
        const result = [];
        for (let i = min; i < max; i++) {
          if (numberSelector(i)) {
            result.push(i);
          }
        }
        return result;
      }
    });
  });

  function create(config?: ISegmentaOptions) {
    const result = new Segmenta(config);
    keyPrefixes.push(result.prefix);
    return result;
  }
});
