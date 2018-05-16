import Segmenta, {ISegmentaOptions} from "../../src/lib/segmenta";
const Redis = require("ioredis");
import * as faker from "faker";
import "expect-more-jest";
import {endTimer, startTimer} from "../timer";
import SparseBuffer from "../../src/lib/sparse-buffer";
import "../matchers";

describe("Segmenta", () => {
  const keyPrefixes = [] as string[];
  afterAll(async () => {
    await clearTestKeys();
  });
  beforeAll(async () => {
    await clearTestKeys();
  });
  async function clearTestKeys() {
    const redis = new Redis();
    for (const prefix of keyPrefixes) {
      const keys = await redis.keys(`${prefix}/*`);
      for (const key of keys) {
        await redis.del(key);
      }
    }
  }
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

  describe(`put`, () => {
    it(`should be able to add and remove as one atomic operation`, async () => {
      // Arrange
      const
        segment = segmentName(),
        sut = create(),
        operations = [
          { add: 2 },
          { add: 3 },
          { del: 4 },
        ],
        expected = [2, 3];
      await sut.add(segment, [4]);
      // Act
      await sut.put(segment, operations);
      const result = await sut.get(segment);
      // Assert
      expect(result).toBeEquivalentTo(expected);
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
      it(`after adding id 2, should be able to get back id 2`, async () => {
        // Arrange
        const
          sut = create(),
          segment = segmentName();
        // Act
        await sut.add(segment, [2]);
        const result = await sut.get(segment);
        // Assert
        expect(result).toEqual([2]);
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
        const sparse2 = new SparseBuffer().or(buffer.hunks[1].buffer, sut.bucketSize / 8);
        expect(sparse1.getOnBitPositions()).toEqual(values.filter(v => v < sut.bucketSize));
        expect(sparse2.getOnBitPositions()).toEqual(values.filter(v => v >= sut.bucketSize));
      });

      it(`should return ids for small segments, one id per segment`, async () => {
        // Arrange
        const
          sut = create({
            bucketSize: 8
          }),
          source = [1, 11],
          segment = "smallSets";
        // Act
        await sut.add(segment, source);
        const result = await sut.get(segment);
        // Assert
        expect(result).toEqual(source);
      });

      it(`speed test: +- 1 000 000 ids over 5 000 000`, async () => {
        // only run this if you have around 5 minutes to waste
        //  -> populating the +- 1 000 000 ids takes around 250s
        //  -> querying takes around 0.2s
        jest.setTimeout(600000);
        // Arrange
        const
          sut = create(),
          segment = "large-speed-test",
          range5 = { min: 1, max: 2 },
          accept = (i: number) => faker.random.number(range5) === 1,
          source1 = createIdSource(1, 10000, accept),
          source2 = createIdSource(500000, 1500000, accept),
          source3 = createIdSource(3000000, 4000000, accept),
          source = source1.concat(source2).concat(source3),
          expectedCount = source1.length + source2.length + source3.length,
          label1 = `populating ${expectedCount} ids`,
          label2 = `retrieving ids`;
        // Act
        startTimer(label1);
        const copy = source.slice(0);
        while (copy.length) {
          await sut.add(segment, copy.splice(0, 200000));
        }
        // await sut.add(segment, copy);
        endTimer(label1);
        startTimer(label2);
        const result = await sut.get(segment);
        endTimer(label2);
        // Assert

        expect(result.length).toEqual(expectedCount);
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

  function create(config?: ISegmentaOptions)  {
    const result = new Segmenta(config);
    keyPrefixes.push(result.prefix);
    return result;
  }
});
