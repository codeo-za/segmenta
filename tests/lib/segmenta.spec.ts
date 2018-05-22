import {Segmenta} from "../../src/lib/segmenta";
import {ISegmentaOptions} from "../../src/lib/interfaces";

import * as faker from "faker";
import "expect-more-jest";
import {endTimer, startTimer, shouldShowTimes} from "../timer";
import SparseBuffer from "../../src/lib/sparse-buffer";
import "../matchers";
import {v4 as uuid} from "uuid";
import {isUUID} from "../../src/lib/type-testers";
import {KeyGenerator} from "../../src/lib/key-generator";
import {Redis as IRedis} from "ioredis";
import * as _ from "lodash";

const Redis = require("ioredis");

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

  function segmentId() {
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

  describe(`add`, () => {
    it(`should add bit values in first hunk`, async () => {
      // Arrange
      const
        segment = segmentId(),
        ids = [1, 5, 7],
        expected = 69,
        sut = create(),
        keyGenerator = new KeyGenerator(sut.prefix),
        redis = new Redis();
      // Act
      await sut.add(segment, ids);
      const
        key = (await getHunkKeys(redis, keyGenerator.dataKeyFor(segment)))[0],
        buffer = await redis.getBuffer(key);
      // Assert
      expect(buffer).toHaveLength(1);
      expect(buffer[0]).toEqual(expected);
    });
  });

  describe(`del`, () => {
    it(`should remove values from the segment`, async () => {
      // Arrange
      const
        segment = segmentId(),
        addIds = [1, 5, 7],
        removeIds = [5, 7],
        expected = 64,
        sut = create(),
        keyGenerator = new KeyGenerator(sut.prefix),
        redis = new Redis();
      // Act
      await sut.add(segment, addIds);
      await sut.del(segment, removeIds);
      const
        key = (await getHunkKeys(redis, keyGenerator.dataKeyFor(segment)))[0],
        buffer = await redis.getBuffer(key);
      // Assert
      expect(buffer).toHaveLength(1);
      expect(buffer[0]).toEqual(expected);
    });
  });

  async function getHunkKeys(redis: IRedis, baseKey: string): Promise<string[]> {
    const all = await redis.keys(`${baseKey}/*`);
    return all.filter(k => !!k.match(/.*\/[0-9]+[-][0-9]+$/));
  }

  describe(`query`, () => {
    describe(`when no segment data defined`, () => {
      it(`should return an empty array`, async () => {
        // Arrange
        const
          sut = create(),
          query = segmentId();
        // Act
        const result = await sut.query({query});
        // Assert
        expect(result.ids).toBeDefined();
        expect(result.ids).toBeEmptyArray();
      });
    });
    describe(`when have data`, () => {
      it(`after adding id 2, should be able to get back id 2`, async () => {
        // Arrange
        const
          sut = create(),
          query = segmentId();
        // Act
        await sut.add(query, [2]);
        const result = await sut.query({query});
        // Assert
        expect(result.ids).toEqual([2]);
      });
      it(`after adding id 1 & 7, should be able to get back id 1 & 7 ('A')`, async () => {
        // Arrange
        const
          sut = create(),
          query = segmentId();
        // Act
        await sut.add(query, [1, 7]);
        const result = await sut.query({query});
        // Assert
        expect(result.ids).toEqual([1, 7]);
      });
      it(`after adding 0, 1, 3, 5, 7, 9, 13, should get that back`, async () => {
        // Arrange
        const
          sut1 = create(),
          sut2 = create(),
          ids = [0, 1, 3, 5, 7, 9, 13],
          query = segmentId();
        // Act
        await sut1.add(query, ids);
        const result = await sut2.query({query});
        // Assert
        expect(result.ids).toEqual(ids);
      });

      it(`should store segments in chunks of 41960 by default`, async () => {
        // Arrange
        const
          sut = create(),
          values = [0, 1, 1025, 41960, 41961],
          query = "defaultChunkSize";
        // Act
        await sut.add(query, values);
        const result = await sut.query({query});
        const buffer = await sut.getBuffer(query);
        // Assert
        expect(result.ids).toEqual(values);
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
          query = "smallSets";
        // Act
        await sut.add(query, source);
        const result = await sut.query({query});
        // Assert
        expect(result.ids).toEqual(source);
      });

      it(`should allow simple fetch-all query with only the segment id`, async () => {
        // Arrange
        const
          sut = create(),
          source = [3, 17],
          id = segmentId();
        // Act
        await sut.add(id, source);
        const result = await sut.query(id);
        // Assert
        expect(result.ids).toEqual(source);
      });

      it(`speed test: +- 1 000 000 ids over 5 000 000`, async () => {
        if (!shouldShowTimes()) {
          console.debug("speed test only enabled when SHOW_TIMES is environment variable is set to a truthy value");
          return;
        }
        jest.setTimeout(15000);
        // Arrange
        const
          sut = create(),
          query = "large-speed-test",
          range5 = {min: 1, max: 2},
          accept = () => faker.random.number(range5) === 1,
          label0 = "generating +- 1 000 000 ids";
        startTimer(label0);
        const
          source1 = createIdSource(1, 10000, accept),
          source2 = createIdSource(500000, 1500000, accept),
          source3 = createIdSource(3000000, 4000000, accept),
          source = source1.concat(source2).concat(source3),
          expectedCount = source1.length + source2.length + source3.length,
          label1 = `populating ${expectedCount} ids`,
          label2 = `retrieving ids`;
        endTimer(label0);
        // Act
        startTimer(label1);
        const copy = source.slice(0);
        while (copy.length) {
          await sut.add(query, copy.splice(0, 200000));
        }
        // await sut.add(segment, copy);
        endTimer(label1);
        startTimer(label2);
        const result = await sut.query({query});
        endTimer(label2);
        // Assert

        expect(result.ids.length).toEqual(expectedCount);
        expect(result.total).toEqual(expectedCount);
      });

      describe(`snapshot resultsets`, () => {
        it(`should recognise a uuid`, () => {
          // Arrange
          const id = uuid();
          // Act
          const result = isUUID(id);
          // Assert
          expect(result).toBeTrue();
        });
        it(`should snapshot the single result when skip > 0`, async () => {
          // Arrange
          const
            sut1 = create(),
            sut2 = create(),
            id = segmentId(),
            expected = [1, 3];
          await sut1.add(id, expected);
          // Act
          const result1 = await sut1.query({query: id, skip: 1});
          await sut1.add(id, [5]);
          const result2 = await sut2.query({query: result1.resultSetId});
          // Assert
          expect(result1.ids).toEqual([3]);
          expect(result2.ids).toEqual(expected);
        });

        it(`should snapshot the result when the result page-size is < total`, async () => {
          // Arrange
          const
            sut1 = create(),
            sut2 = create(),
            id = segmentId(),
            data = [ 1, 3, 5, 7 ],
            addData = [ 10, 12 ];
          await sut1.add(id, data);
          // Act
          const result1 = await sut1.query({ query: id, take: 2 });
          await sut1.add(id, addData);
          const result2 = await sut2.query({ query: result1.resultSetId });
          // Assert
          expect(result1.ids).toEqual([ 1, 3]);
          expect(result2.ids).toEqual(data);
        });

        it(`should expire the snapshot based on provided ttl`, async () => {
          // Arrange
          const
            sut = create({resultsTTL: 1}),
            id = segmentId();
          await sut.add(id, [3, 5]);
          const originalResults = await sut.query({query: id, skip: 1});
          await sleep(1100);
          // Act
          await expect(sut.query({query: originalResults.resultSetId})).rejects.toThrow(
            `result set ${originalResults.resultSetId} not found (expired perhaps?)`
          );
          // Assert
        });

        it(`should allow deliberate disposal of snapshots`, async () => {
          // Arrange
          const
            sut = create(),
            id = segmentId();
          await sut.add(id, [4, 7]);
          // Act
          const results1 = await sut.query({query: id, skip: 0});
          const results2 = await sut.query({ query: results1.resultSetId });
          expect(results1.ids).toEqual(results2.ids);
          await sut.dispose(results1.resultSetId);
          await expect(sut.query({query: results1.resultSetId}))
            .rejects.toThrow(`result set ${results1.resultSetId} not found (expired perhaps?)`);
          // Assert
        });

        it(`should not create snapshots for queries without a skip or take specified`, async () => {
          // client already gets all the results -- no need to snapshot for paging
          // Arrange
          const
            sut = create(),
            id = segmentId(),
            daBirthday = [ 1952, 3, 11 ],
            redis = new Redis();
          await clearTestKeys(); // ensure that there are no left-over snapshots
          await sut.add(id, daBirthday);
          // Act
          const result = await sut.query({ query: id });
          expect(result.ids).toBeEquivalentTo(daBirthday);
          expect(result.resultSetId).not.toBeDefined();
          const keys = await redis.keys(`${sut.prefix}/results/*`);
          expect(keys).toBeEmptyArray();
          // Assert
        });

        it(`should default expiry to one day`, () => {
          // Arrange
          const
            oneDay = 86400,
            sut = create();
          // Act
          const result = sut.resultsTTL;
          // Assert
          expect(result).toEqual(oneDay);
        });

        async function sleep(ms: number): Promise<void> {
          return new Promise<void>((resolve) => {
            setTimeout(() => resolve(), ms);
          });
        }
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

  describe(`put`, () => {
    it(`should be able to add and remove as one atomic operation`, async () => {
      // Arrange
      const
        query = segmentId(),
        sut = create(),
        operations = [
          {add: 2},
          {add: 3},
          {del: 4},
        ],
        expected = [2, 3];
      await sut.add(query, [4]);
      // Act
      await sut.put(query, operations);
      const result = await sut.query({query});
      // Assert
      expect(result.ids).toBeEquivalentTo(expected);
    });
    it(`should facilitate multiple add / del commands, in order`, async () => {
      // Arrange
      const
        segment = segmentId(),
        commands = [
          {add: 1},
          {add: 3},
          {add: 9},
          {del: 1},
          {add: 12},
          {del: 3}
        ],
        expected = [9, 12],
        sut1 = create();
      // Act
      await sut1.put(segment, commands);
      const result = await sut1.query({query: segment});
      // Assert
      expect(result.ids).toEqual(expected);
    });
  });

  function create(config?: ISegmentaOptions) {
    const result = new Segmenta(_.assign({}, {
      segmentsPrefix: "segmenta-tests"
    }, config));
    keyPrefixes.push(result.prefix);
    return result;
  }
});
