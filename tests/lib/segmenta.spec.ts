import "expect-more-jest";
import "../matchers";
import { Segmenta } from "../../src/lib/segmenta";
import { ISegmentaOptions, ISegmentResults } from "../../src/lib/interfaces";
import faker from "faker";
import { endTimer, startTimer, shouldShowTimes } from "../timer";
import { SparseBuffer } from "../../src/lib/sparse-buffer";
import { v4 as uuid } from "uuid";
import { isUUID } from "../../src/lib/type-testers";
import { KeyGenerator } from "../../src/lib/key-generator";
import { Redis as IRedis } from "ioredis";
import _ from "lodash";

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
            const keys = await redis.keys(`${ prefix }/*`);
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
        const all = await redis.keys(`${ baseKey }/*`);
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
                const result = await sut.query({ query });
                // Assert
                expect(result.ids).toBeDefined();
                expect(result.ids).toBeEmptyArray();
            });
        });
        describe(`when have data`, () => {
            it(`should be able to get back id 2 after adding id 2`, async () => {
                // Arrange
                const
                    sut = create(),
                    query = segmentId();
                // Act
                await sut.add(query, [2]);
                const result = await sut.query({ query });
                // Assert
                expect(result.ids).toEqual([2]);
            });
            it(`should be able to get back id 1 & 7 ('A') after adding id 1 & 7`, async () => {
                // Arrange
                const
                    sut = create(),
                    query = segmentId();
                // Act
                await sut.add(query, [1, 7]);
                const result = await sut.query({ query });
                // Assert
                expect(result.ids).toEqual([1, 7]);
            });
            it(`should get back all after adding 0, 1, 3, 5, 7, 9, 13`, async () => {
                // Arrange
                const
                    sut1 = create(),
                    sut2 = create(),
                    ids = [0, 1, 3, 5, 7, 9, 13],
                    query = segmentId();
                // Act
                await sut1.add(query, ids);
                const result = await sut2.query({ query });
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
                const result = await sut.query({ query });
                const buffer = await sut.getBuffer(query) as SparseBuffer;
                // Assert
                expect(result.ids).toEqual(values);
                expect(buffer.hunks).toHaveLength(2);
                const sparse1 = new SparseBuffer().or(buffer.hunks[0].buffer, 0);
                const sparse2 = new SparseBuffer().or(buffer.hunks[1].buffer, sut.bucketSize / 8);
                expect(sparse1.getOnBitPositions().values).toEqual(values.filter(v => v < sut.bucketSize));
                expect(sparse2.getOnBitPositions().values).toEqual(values.filter(v => v >= sut.bucketSize));
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
                const result = await sut.query({ query });
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
            describe(`speed test`, () => {
                beforeEach(() => {
                    jest.setTimeout(15000);
                });
                afterEach(() => {
                    jest.setTimeout(5000);
                });
                it(`should be reasonably fast to query: +- 1 000 000 ids over 5 000 000 range`, async () => {
                    if (!shouldShowTimes()) {
                        console.debug([
                            "speed test only enabled when SHOW_TIMES is ",
                            "environment variable is set to a truthy value"
                        ].join(""));
                        return;
                    }
                    // Arrange
                    const
                        sut = create(),
                        query = "large-speed-test",
                        range5 = { min: 1, max: 2 },
                        accept = () => faker.random.number(range5) === 1,
                        label0 = "generating +- 1 000 000 ids";
                    startTimer(label0);
                    const
                        source1 = createIdSource(1, 10000, accept),
                        source2 = createIdSource(500000, 1500000, accept),
                        source3 = createIdSource(3000000, 4000000, accept),
                        source = source1.concat(source2).concat(source3),
                        expectedCount = source1.length + source2.length + source3.length,
                        label1 = `populating ${ expectedCount } ids`,
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
                    const result = await sut.query({ query });
                    endTimer(label2);
                    // Assert

                    expect(result.ids.length).toEqual(expectedCount);
                    expect(result.total).toEqual(expectedCount);
                });

            });
            describe(`snapshot result-sets`, () => {
                it(`should recognise a uuid`, () => {
                    // Arrange
                    const id = uuid();
                    // Act
                    const result = isUUID(id);
                    // Assert
                    expect(result).toBeTrue();
                });
                it(`should not get confused about a segment with a uuid in the name`, async () => {
                    // Arrange
                    const query = `get where in '${ uuid() }'`;
                    // Act
                    const result = isUUID(query);
                    // Assert
                    expect(result).toBeFalse();
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
                    const result1 = await sut1.query({ query: id, skip: 1 });
                    await sut1.add(id, [5]);
                    const result2 = await sut2.query({ query: result1.resultSetId });
                    // Assert
                    expect(result1.ids).toEqual([3]);
                    expect(result2.ids).toEqual(expected);
                });

                it(`should re-query with skip and take correctly`, async () => {
                    // Arrange
                    const
                        sut = create(),
                        id = segmentId(),
                        all = [1, 2, 3, 4, 5],
                        expected = [3];
                    await sut.add(id, all);
                    // Act
                    const first = await sut.query(`get where in "${ id }" skip 0 take 1`);
                    const second = await sut.query({
                        query: first.resultSetId,
                        skip: 2,
                        take: 1
                    });
                    // Assert
                    expect(second.ids).toEqual(expected);
                });

                it(`should re-query with the min and max correctly`, async () => {
                    // Arrange
                    const
                        sut = create(),
                        id = segmentId(),
                        all = [1, 2, 3, 4, 5],
                        expected = [3];
                    await sut.add(id, all);
                    // Act
                    const first = await sut.query(`get where in "${ id }" skip 0 take 1`);
                    const second = await sut.query({
                        query: first.resultSetId,
                        min: 3,
                        max: 3
                    });
                    // Assert
                    expect(second.ids).toEqual(expected);
                });

                it(`should re-query with the min, max, skip and take correctly`, async () => {
                    // Arrange
                    const
                        sut = create(),
                        id = segmentId(),
                        all = [1, 2, 3, 4, 5],
                        expected = [3];
                    await sut.add(id, all);
                    // Act
                    const first = await sut.query(`get where in "${ id }" skip 0 take 1`);
                    const second = await sut.query({
                        query: first.resultSetId,
                        min: 2,
                        max: 4,
                        skip: 1,
                        take: 1
                    });
                    // Assert
                    expect(second.ids).toEqual(expected);
                });

                it(`should snapshot the result when the result page-size is < total`, async () => {
                    // Arrange
                    const
                        sut1 = create(),
                        sut2 = create(),
                        id = segmentId(),
                        data = [1, 3, 5, 7],
                        addData = [10, 12];
                    await sut1.add(id, data);
                    // Act
                    const result1 = await sut1.query({ query: id, take: 2 });
                    await sut1.add(id, addData);
                    const result2 = await sut2.query({ query: result1.resultSetId });
                    // Assert
                    expect(result1.ids).toEqual([1, 3]);
                    expect(result2.ids).toEqual(data);
                });

                it(`should expire the snapshot based on provided ttl`, async () => {
                    // Arrange
                    const
                        sut = create({ resultsTTL: 1 }),
                        id = segmentId();
                    await sut.add(id, [3, 5]);
                    const originalResults = await sut.query({ query: id, skip: 1 });
                    sut.clearLRUCache();
                    await sleep(1100);
                    // Act
                    await expect(sut.query({ query: originalResults.resultSetId })).rejects.toThrow(
                        `result set ${ originalResults.resultSetId } not found (expired perhaps?)`
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
                    const results1 = await sut.query({ query: id, skip: 0, take: 123 });
                    const results2 = await sut.query({ query: results1.resultSetId });
                    const results3 = await sut.query({ query: results1.resultSetId, skip: 0, take: 42 });
                    expect(results2.ids).toEqual(results1.ids);
                    expect(results1.skipped).toEqual(0);
                    expect(results1.take).toEqual(123);
                    expect(results1.paged).toBeTrue();
                    expect(results2.resultSetId).toEqual(results1.resultSetId);
                    expect(results3.resultSetId).toEqual(results1.resultSetId);
                    await sut.dispose(results1.resultSetId);
                    await expect(sut.query({ query: results1.resultSetId }))
                        .rejects.toThrow(`result set ${ results1.resultSetId } not found (expired perhaps?)`);
                    // Assert
                });

                it(`should not create snapshots for queries without a skip or take specified`, async () => {
                    // client already gets all the results -- no need to snapshot for paging
                    // Arrange
                    const
                        sut = create(),
                        id = segmentId(),
                        daBirthday = [1952, 3, 11],
                        redis = new Redis();
                    await clearTestKeys(); // ensure that there are no left-over snapshots
                    await sut.add(id, daBirthday);
                    // Act
                    const result = await sut.query({ query: id });
                    expect(result.ids).toBeEquivalentTo(daBirthday);
                    expect(result.paged).toBeFalse();
                    expect(result.resultSetId).not.toBeDefined();
                    const keys = await redis.keys(`${ sut.prefix }/results/*`);
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

                it(`should throw if the result-set is not found by id`, async () => {
                    // Arrange
                    const
                        sut = create(),
                        id = uuid();
                    // Act
                    await expect(sut.query({ query: id }))
                        .rejects.toThrow(`result set ${ id } not found (expired perhaps?)`);
                    // Assert
                });

                describe(`dispose`, () => {
                    it(`should not throw if the given resultset does not exist`, async () => {
                        // Arrange
                        const
                            sut = create(),
                            id = uuid();
                        // Act
                        await expect(sut.dispose(id)).resolves.not.toThrow();
                        // Assert
                    });
                });

                async function sleep(ms: number): Promise<void> {
                    return new Promise<void>((resolve) => {
                        setTimeout(() => resolve(), ms);
                    });
                }
            });

            describe(`ranges`, () => {
                it(`should return only the items within range`, async () => {
                    // Arrange
                    const
                        sut = create(),
                        id = segmentId(),
                        all = [1, 3, 5, 7, 9],
                        min = 5,
                        max = 25,
                        expected = [5, 7, 9];
                    await sut.add(id, all);
                    // Act
                    const result = await sut.query(`get where in '${ id }' min ${ min } max ${ max }`);
                    // Assert
                    expect(result.ids).toEqual(expected);
                });
            });

            describe(`paging`, () => {
                it(`should set the total to the total number matching the query, irrespective of paging`, async () => {
                    // Arrange
                    const
                        sut = create(),
                        id = segmentId(),
                        all = [1, 2, 3, 4, 5];
                    await sut.add(id, all);
                    // Act
                    const result = await sut.query(`get where in "${ id }" skip 0 take 1`);
                    // Assert
                    expect(result.ids).toEqual([1]);
                    expect(result.paged).toBeTrue();
                    expect(result.count).toEqual(1);
                    expect(result.total).toEqual(all.length);
                });

                const missingValues = [null, undefined];
                missingValues.forEach(missing => {
                    it(`should not store paged results when skip is ${ missing }`, async () => {
                        // Arrange
                        const
                            sut = create(),
                            id = segmentId(),
                            all = [1, 2, 3, 4, 5];
                        await sut.add(id, all);
                        const qry = {
                            query: `get where in "${ id }"`
                        };
                        (qry as any).skip = missing;
                        // Act
                        const result = await sut.query(qry);
                        // Assert
                        expect(result.resultSetId).not.toExist();
                    });

                    it(`should not store paged results when take is ${ missing }`, async () => {
                        // Arrange
                        const
                            sut = create(),
                            id = segmentId(),
                            all = [1, 2, 3, 4, 5];
                        await sut.add(id, all);
                        const qry = {
                            query: `get where in "${ id }"`
                        };
                        (qry as any).take = missing;
                        // Act
                        const result = await sut.query(qry);
                        // Assert
                        expect(result.resultSetId).not.toExist();
                    });

                    it(`should not store paged results when min is ${ missing }`, async () => {
                        // Arrange
                        const
                            sut = create(),
                            id = segmentId(),
                            all = [1, 2, 3, 4, 5];
                        await sut.add(id, all);
                        const qry = {
                            query: `get where in "${ id }"`
                        };
                        (qry as any).min = missing;
                        // Act
                        const result = await sut.query(qry);
                        // Assert
                        expect(result.resultSetId).not.toExist();
                    });

                    it(`should not store paged results when max is ${ missing }`, async () => {
                        // Arrange
                        const
                            sut = create(),
                            id = segmentId(),
                            all = [1, 2, 3, 4, 5];
                        await sut.add(id, all);
                        const qry = {
                            query: `get where in "${ id }"`
                        };
                        (qry as any).max = missing;
                        // Act
                        const result = await sut.query(qry);
                        // Assert
                        expect(result.resultSetId).not.toExist();
                    });
                });
            });

            describe(`DSL query`, () => {
                beforeEach(async () => {
                    await clearTestKeys();
                });
                afterEach(async () => {
                    await clearTestKeys();
                });
                it(`should return for "GET WHERE IN('x')"`, async () => {
                    // Arrange
                    const
                        id = "x",
                        data = [1, 3, 7],
                        sut = create();
                    await sut.add(id, data);
                    // Act
                    const result = await sut.query({ query: "GET WHERE IN('x')" });
                    // Assert
                    expect(result.ids).toEqual(data);
                });
                it(`should return for "GET WHERE IN('x') AND IN('y')`, async () => {
                    // Arrange
                    const
                        id1 = "x",
                        id2 = "y",
                        data1 = [1, 3, 5],
                        data2 = [3, 5, 7],
                        expected = [3, 5],
                        sut = create();
                    await sut.add(id1, data1);
                    await sut.add(id2, data2);
                    // Act
                    const result = await sut.query({ query: "GET WHERE IN('x') AND IN('y')" });
                    // Assert
                    expect(result.ids).toEqual(expected);
                });

                it(`should throw for invalid syntax`, async () => {
                    // Arrange
                    const sut = create();
                    // Act
                    await expect(sut.query({ query: "select * from 'moo-cows'" })).rejects.toThrow(
                        /syntax error/i
                    );
                    // Assert
                });

                it(`should return for "GET WHERE IN('x') OR IN ('y')`, async () => {
                    // Arrange
                    const
                        id1 = "x",
                        id2 = "y",
                        data1 = [1, 3, 5, 7],
                        data2 = [2, 4, 5, 6, 8],
                        expected = [1, 2, 3, 4, 5, 6, 7, 8],
                        sut = create();
                    await sut.add(id1, data1);
                    await sut.add(id2, data2);
                    // Act
                    const result = await sut.query("get where in ('x') or in ('y')");
                    // Assert
                    expect(result.ids).toEqual(expected);
                });

                it(`should return for "GET WHERE IN 'x' OR IN 'y'`, async () => {
                    // Arrange
                    const
                        id1 = "x",
                        id2 = "y",
                        data1 = [1, 3, 5, 7],
                        data2 = [2, 4, 5, 6, 8],
                        expected = [1, 2, 3, 4, 5, 6, 7, 8],
                        sut = create();
                    await sut.add(id1, data1);
                    await sut.add(id2, data2);
                    // Act
                    const result = await sut.query("get where in 'x' or in 'y'");
                    // Assert
                    expect(result.ids).toEqual(expected);
                });

                it(`should return for "GET WHERE IN 'x' and (in 'y' or in 'z')`, async () => {
                    // Arrange
                    const
                        xData = [1, 2, 3, 4, 5],
                        yData = [2],
                        zData = [4],
                        expected = [2, 4],
                        sut = create();
                    await sut.add("x", xData);
                    await sut.add("y", yData);
                    await sut.add("z", zData);
                    // Act
                    const result = await sut.query("get where in 'x' and (in 'y' or in 'z')");
                    // Assert
                    expect(result.ids).toEqual(expected);
                });

                it(`should return for "GET WHERE IN 'x' and not (in 'y' or in 'z')`, async () => {
                    // Arrange
                    const
                        xData = [1, 2, 3, 4, 5],
                        yData = [2],
                        zData = [4],
                        expected = [1, 3, 5],
                        sut = create();
                    await sut.add("x", xData);
                    await sut.add("y", yData);
                    await sut.add("z", zData);

                    // Act
                    const result = await sut.query("get where in 'x' and not (in 'y' or in 'z')");
                    // Assert
                    expect(result.ids).toEqual(expected);
                });

                it(`should return for "GET WHERE IN 'x' and not (in 'y' and in 'z')`, async () => {
                    // Arrange
                    const
                        xData = [1, 2, 3, 4, 5],
                        yData = [1, 3],
                        zData = [3, 5],
                        expected = [1, 2, 4, 5],
                        sut = create();
                    await sut.add("x", xData);
                    await sut.add("y", yData);
                    await sut.add("z", zData);
                    // Act
                    const result = await sut.query("get where in 'x' and not in (in 'y' and in 'z')");
                    // Assert
                    expect(result.ids).toEqual(expected);
                });

                it(`should return for "GET WHERE IN 'x' and 'y' and not (in 'z')"`, async () => {
                    // Arrange
                    const
                        xData = [1, 2, 3, 4, 5],
                        yData = [3, 4, 5],
                        zData = [5],
                        expected = [3, 4],
                        sut = create();
                    await sut.add("x", xData);
                    await sut.add("y", yData);
                    await sut.add("z", zData);
                    // Act
                    const result = await sut.query("get where in 'x' and 'y' and not (in 'z')");
                    // Assert
                    expect(result.ids).toEqual(expected);
                });

                it(`should return for "GET WHERE IN 'a' or 'b' and not (in 'x' or 'y')"`, async () => {
                    // Arrange
                    const
                        aData = [1, 2, 3],
                        bData = [4, 5, 6],
                        xData = [4, 5],
                        yData = [3, 6],
                        expected = [1, 2],
                        sut = create();
                    await sut.add("a", aData);
                    await sut.add("b", bData);
                    await sut.add("x", xData);
                    await sut.add("y", yData);
                    // Act
                    const result = await sut.query("get where in 'a' or 'b' and not (in 'x' or 'y')");
                    // Assert
                    expect(result.ids).toEqual(expected);
                });

                it(`should return for "GET WHERE IN 'a' and 'b' and not (in 'x' or 'y')"`, async () => {
                    // Arrange
                    const
                        aData = [1, 2, 3, 4, 5, 6],
                        bData = [0, 1, 2, 3, 4, 5, 6, 7],
                        xData = [4, 5],
                        yData = [3, 6],
                        expected = [1, 2],
                        sut = create();
                    await sut.add("a", aData);
                    await sut.add("b", bData);
                    await sut.add("x", xData);
                    await sut.add("y", yData);
                    // Act
                    const result = await sut.query("get where in 'a' and 'b' and not (in 'x' or 'y')");
                    // Assert
                    expect(result.ids).toEqual(expected);
                });

                it(`should return for "GET WHERE IN 'a' and in 'b' and not (in 'x' or 'y')"`, async () => {
                    // Arrange
                    const
                        aData = [1, 2, 3, 4, 5, 6],
                        bData = [0, 1, 2, 3, 4, 5, 6, 7],
                        xData = [4, 5],
                        yData = [3, 6],
                        expected = [1, 2],
                        sut = create();
                    await sut.add("a", aData);
                    await sut.add("b", bData);
                    await sut.add("x", xData);
                    await sut.add("y", yData);
                    // Act
                    const result = await sut.query("get where in 'a' and in 'b' and not (in 'x' or 'y')");
                    // Assert
                    expect(result.ids).toEqual(expected);
                });

                it(`should allow skip and take via natural language`, async () => {
                    // Arrange
                    const
                        data = [1, 2, 3, 4, 5],
                        segment = segmentId(),
                        sut = create();
                    await sut.add(segment, data);
                    // Act
                    const result = await sut.query(`get where in '${ segment }' skip 1 take 2`);
                    // Assert
                    expect(result.ids).toEqual([2, 3]);
                });

                it(`should prefer skip and take from query options`, async () => {
                    // Arrange
                    const
                        data = [1, 2, 3, 4, 5],
                        segment = segmentId(),
                        sut = create();
                    await sut.add(segment, data);
                    // Act
                    const result = await sut.query({
                        query: `get where in '${ segment }' skip 0 take 1000`,
                        skip: 1,
                        take: 2
                    });
                    // Assert
                    expect(result.ids).toEqual([2, 3]);
                });

                it(`should allow using MIN and TAKE for a different paging strategy`, async () => {
                    // Arrange
                    const
                        data = [3, 5, 7, 9],
                        segment = segmentId(),
                        sut = create();
                    await sut.add(segment, data);
                    // Act
                    const result = await sut.query(`get where in '${ segment }' min 5 take 2`);
                    // Assert
                    expect(result.ids).toEqual([5, 7]);
                });

                it(`should allow min & max from query options`, async () => {
                    // Arrange
                    const
                        data = [2, 4, 5, 6, 8],
                        segment = segmentId(),
                        sut = create();
                    await sut.add(segment, data);
                    // Act
                    const result = await sut.query({ query: `get where in '${ segment }'`, min: 4, max: 6 });
                    // Assert
                    expect(result.ids).toEqual([4, 5, 6]);
                });

                it(`should prefer min & max from query options`, async () => {
                    // Arrange
                    const
                        data = [2, 4, 5, 6, 8],
                        segment = segmentId(),
                        sut = create();
                    await sut.add(segment, data);
                    // Act
                    const result = await sut.query({
                        query: `get where in '${ segment }' min 0 max 1000`,
                        min: 4,
                        max: 6
                    });
                    // Assert
                    expect(result.ids).toEqual([4, 5, 6]);
                });

                it(`should not allow doubly-quoted identifiers (')`, async () => {
                    // Arrange
                    const
                        data = [2, 4, 5, 6, 8],
                        segment = segmentId(),
                        sut = create();
                    await sut.add(segment, data);
                    // Act
                    await expect(sut.query({ query: `get where in ''${ segment }''` }))
                        .rejects.toThrow(/^Syntax error/);
                    // Assert
                });

                it(`should not allow doubly-quoted identifiers (")`, async () => {
                    // Arrange
                    const
                        data = [2, 4, 5, 6, 8],
                        segment = segmentId(),
                        sut = create();
                    await sut.add(segment, data);
                    // Act
                    await expect(sut.query({ query: `get where in ""${ segment }""` }))
                        .rejects.toThrow(/^Syntax error/);
                    // Assert
                });

                describe(`RANDOM`, () => {
                    it(`should return items from single segment in random order`, async () => {
                        // Arrange
                        const
                            data = [1, 3, 7, 9, 15, 17, 23, 30, 71],
                            segment = segmentId(),
                            qry = { query: `random where in '${ segment }'` },
                            sut = create();
                        await sut.add(segment, data);
                        // Act
                        const results = [
                            await sut.query(qry),
                            await sut.query(qry),
                            await sut.query(qry),
                            await sut.query(qry)
                        ].map(r => r.ids);
                        // Assert
                        // all should be equivalent
                        results.forEach(
                            result => expect(result).toBeEquivalentTo(data)
                        );
                        // at least 2 should not be equal
                        const identicalCount = results.map(result =>
                            areIdentical(result, data)
                        ).reduce((acc, cur) => acc + (cur ? 1 : 0), 0);
                        expect(identicalCount)
                            .toBeLessThan(3);
                    });

                    it(`should have repeatable read on random result-sets`, async () => {
                        // Arrange
                        const
                            data = [1, 3, 7, 9, 15, 17, 23, 30, 71],
                            segment = segmentId(),
                            sut = create();
                        await sut.add(segment, data);
                        const initialResult = await retrieveDefinitelyRandomizedResult(
                            sut,
                            segment,
                            data
                        );
                        // Act
                        const newResult = await sut.query({
                            query: initialResult.resultSetId
                        });
                        // Assert
                        expect(newResult.ids).toEqual(initialResult.ids);
                        expect(newResult.ids).toBeEquivalentTo(data);
                        expect(newResult.ids).not.toEqual(data);
                    });

                    async function retrieveDefinitelyRandomizedResult(
                        segmenta: Segmenta,
                        segment: string,
                        rawData: number[]): Promise<ISegmentResults> {
                        let result: ISegmentResults;
                        do {
                            result = await segmenta.query({
                                query: `random where in '${ segment }' skip 0 take 1000`
                            });
                        } while (areIdentical(rawData, result.ids));
                        return result;
                    }

                    function areIdentical(
                        array1: number[],
                        array2: number[]) {
                        if (!array1 || !array2) {
                            throw new Error(`one or more inputs were null or undefined`);
                        }
                        return array1.length === array2.length &&
                            array1.reduce((acc, cur, idx) =>
                                acc && cur === array2[idx]
                                , true);
                    }
                });

            });

            describe(`count`, () => {
                it(`should return zero for a non-existant segment`, async () => {
                    // Arrange
                    const
                        segment = segmentId(),
                        sut = create();
                    // Act
                    const result = await sut.query(`count where in '${ segment }'`);
                    // Assert
                    expect(result.ids).toBeEmptyArray();
                    expect(result.total).toEqual(0);
                });
                it(`should return count of items in entire segment with no limits`, async () => {
                    // Arrange
                    const
                        segment = segmentId(),
                        data = [1, 3, 4, 5, 6, 8, 9],
                        sut = create();
                    await sut.add(segment, data);
                    // Act
                    const result = await sut.query(`count where in '${ segment }'`);
                    // Assert
                    expect(result.ids).toBeEmptyArray();
                    expect(result.total).toEqual(data.length);
                });
                it(`should return count of items in entire segment and not another with no limits`, async () => {
                    // Arrange
                    const
                        segment1 = segmentId(),
                        segment2 = segmentId(),
                        data1 = [1, 3, 4, 5, 6, 8, 9],
                        data2 = [1, 3, 12],
                        sut = create(),
                        expected = data1.filter(i => data2.indexOf(i) === -1).length;
                    await sut.add(segment1, data1);
                    await sut.add(segment2, data2);
                    // Act
                    const result = await sut.query(`count where in '${ segment1 }' and not in '${ segment2 }'`);
                    // Assert
                    expect(result.ids).toBeEmptyArray();
                    expect(result.total).toEqual(expected);
                });
            });

            describe(`list`, () => {
                it(`should return empty when no segments added`, async () => {
                    // Arrange
                    const
                        segmentsPrefix = "list-1",
                        sut = create({ segmentsPrefix });
                    // Act
                    const result = await sut.list();
                    // Assert
                    expect(result).toBeEmptyArray();
                });
                it(`should return the single segment name`, async () => {
                    // Arrange
                    const
                        segmentsPrefix = "list-2",
                        segment = segmentId(),
                        sut = create({ segmentsPrefix });
                    await sut.add(segment, [1, 2, 3]);
                    // Act
                    const result = await sut.list();
                    // Assert
                    expect(result).toEqual([segment]);
                });
                it(`should return all known segments`, async () => {
                    // Arrange
                    const
                        segmentsPrefix = "list-3",
                        segment1 = segmentId(),
                        segment2 = segmentId(),
                        creator = create({ segmentsPrefix }),
                        sut = create({ segmentsPrefix });
                    await creator.add(segment1, [5, 6, 7]);
                    await creator.add(segment2, []);
                    // Act
                    const result = await sut.list();
                    // Assert
                    expect(result).toEqual([segment1, segment2].sort());
                });
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
                    { add: 2 },
                    { add: 3 },
                    { del: 4 },
                ],
                expected = [2, 3];
            await sut.add(query, [4]);
            // Act
            await sut.put(query, operations);
            const result = await sut.query({ query });
            // Assert
            expect(result.ids).toBeEquivalentTo(expected);
        });

        it(`should facilitate multiple add / del commands, in order`, async () => {
            // Arrange
            const
                segment = segmentId(),
                commands = [
                    { add: 1 },
                    { add: 3 },
                    { add: 9 },
                    { del: 1 },
                    { add: 12 },
                    { del: 3 }
                ],
                expected = [9, 12],
                sut1 = create();
            // Act
            await sut1.put(segment, commands);
            const result = await sut1.query({ query: segment });
            // Assert
            expect(result.ids).toEqual(expected);
        });
        it(`should throw for add/del combined`, async () => {
            // consider that the order operations may notIn be what the user intends,
            //  such that the put object { add: 1, del: 1 } could have 1 of two meanings:
            //  1. delete 1 andIn then add 1: leaves 1 orIn the segment
            //  2. add 1 andIn then delete 1: never has 1 orIn the segment
            // Arrange
            const
                segment = segmentId(),
                commands = [
                    { add: 1, del: 1 }
                ],
                sut = create();
            // Act
            await expect(sut.put(segment, commands)).rejects.toThrow();
            // Assert
        });
    });

    describe(`stats`, () => {
        // this is experimental, but the tests pass, so far
        beforeEach(async () => {
            await clearTestKeys();
        });

        it(`should return empty when no items within prefix`, async () => {
            // Arrange
            const
                sut = create();
            // Act
            const result = await sut.fetchStats();
            // Assert
            expect(result).toExist();
            expect(result.bytes).toEqual(0);
            expect(result.buckets).toEqual(0);
            expect(result.size).toEqual("0 b");
            expect(result.segments).toBeEmptyArray();
        });

        it(`should return stats for a single number in a single segment`, async () => {
            // Arrange
            const
                bucketSize = 8,
                segment = segmentId(),
                sut = create({ bucketSize });
            await sut.put(segment, [{ add: 1 }]);
            // Act
            const result = await sut.fetchStats();
            // Assert
            expect(result.bytes).toEqual(1);
            expect(result.size).toEqual("1 b");
            expect(result.buckets).toEqual(1);
            expect(result.segments).toBeArray();
            expect(result.segments).toHaveLength(1);
            const segmentData = result.segments[0];
            expect(segmentData.bytes).toEqual(1);
            expect(segmentData.size).toEqual("1 b");
            expect(segmentData.buckets).toEqual(1);
            expect(segmentData.segment).toEqual(segment);
        });

        it(`should return stats for a single number in a two segments`, async () => {
            // Arrange
            const
                bucketSize = 8,
                segment1 = segmentId(),
                segment2 = segmentId(),
                sut = create({ bucketSize });
            await sut.put(segment1, [{ add: 1 }]);
            await sut.put(segment2, [{ add: 12 }]);
            // Act
            const result = await sut.fetchStats();
            // Assert
            expect(result.bytes).toEqual(2);
            expect(result.size).toEqual("2 b");
            expect(result.buckets).toEqual(2);
            expect(result.segments).toBeArray();
            expect(result.segments).toHaveLength(2);

            const segmentData1 = result.segments.find(s => s.segment === segment1);
            if (segmentData1 === undefined) {
                throw new Error(`Can't find segment data for '${ segment1 }'`);
            }
            expect(segmentData1.bytes).toEqual(1);
            expect(segmentData1.size).toEqual("1 b");
            expect(segmentData1.buckets).toEqual(1);
            expect(segmentData1.segment).toEqual(segment1);

            const segmentData2 = result.segments.find(s => s.segment === segment2);
            if (segmentData2 === undefined) {
                throw new Error(`Can't find segment data for '${ segment2 }'`);
            }
            expect(segmentData2.bytes).toEqual(1);
            expect(segmentData2.size).toEqual("1 b");
            expect(segmentData2.buckets).toEqual(1);
            expect(segmentData2.segment).toEqual(segment2);
        });

        it(`should return stats for a two numbers in a single segment, same bucket`, async () => {
            // Arrange
            const
                bucketSize = 8,
                segment1 = segmentId(),
                sut = create({ bucketSize });
            await sut.put(segment1, [{ add: 1 }, { add: 5 }]);
            // Act
            const result = await sut.fetchStats();
            // Assert
            expect(result.bytes).toEqual(1);
            expect(result.size).toEqual("1 b");
            expect(result.buckets).toEqual(1);
            expect(result.segments).toBeArray();
            expect(result.segments).toHaveLength(1);

            const segmentData1 = result.segments[0];
            expect(segmentData1.bytes).toEqual(1);
            expect(segmentData1.size).toEqual("1 b");
            expect(segmentData1.buckets).toEqual(1);
            expect(segmentData1.segment).toEqual(segment1);

        });

        it(`should return stats for a two numbers in a single segment, different buckets`, async () => {
            // Arrange
            const
                bucketSize = 8,
                segment1 = segmentId(),
                sut = create({ bucketSize });
            await sut.put(segment1, [{ add: 1 }, { add: 32 }]);
            // Act
            const result = await sut.fetchStats();
            // Assert
            expect(result.bytes).toEqual(2);
            expect(result.size).toEqual("2 b");
            expect(result.buckets).toEqual(2);
            expect(result.segments).toBeArray();
            expect(result.segments).toHaveLength(1);

            const segmentData1 = result.segments[0];
            expect(segmentData1.bytes).toEqual(2);
            expect(segmentData1.size).toEqual("2 b");
            expect(segmentData1.buckets).toEqual(2);
            expect(segmentData1.segment).toEqual(segment1);

        });

    });

    function create(config?: ISegmentaOptions) {
        const result = new Segmenta(_.assign({}, {
            segmentsPrefix: "segmenta-tests"
        }, config));
        if (keyPrefixes.indexOf(result.prefix) === -1) {
            keyPrefixes.push(result.prefix);
        }
        return result;
    }
})
;
