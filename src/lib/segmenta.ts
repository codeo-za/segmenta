import { Redis as IRedis, RedisOptions } from "ioredis";
import { v4 as uuid } from "uuid";
import { isAddOperation as isAdd, isDelOperation as isDel, isNumber, isString, isUUID } from "./type-testers";
import { Hunk, IHunk } from "./hunk";
import _ from "lodash";
import { setup } from "./set-bits";
import { ResultSetHydrator } from "./resultset-hydrator";
import { KeyGenerator } from "./key-generator";
import { DEFAULT_BUCKET_SIZE, DEFAULT_RESULTSET_TTL, MAX_OPERATIONS_PER_BATCH } from "./constants";
import {
    IAddOperation,
    IDelOperation,
    ISanitizedQueryOptions,
    ISegmentaOptions,
    ISegmentaSegmentStats,
    ISegmentaStats,
    ISegmentQueryOptions,
    ISegmentResults
} from "./interfaces";
import { IPositionsResult, SparseBuffer, SparseBufferWithPaging } from "./sparse-buffer";
import { tokenize } from "./dsl/tokenize";
import { parse } from "./dsl/parse";
import generator from "./debug";
import LRU from "lru-cache";
import { Error } from "tslint/lib/error";

const debug = generator(__filename);
const Redis = require("ioredis");

let lruCache: any; // FIXME: typings are being silly

interface IRedisClientCache {
    [key: string]: IRedis;
}

const redisClients: IRedisClientCache = {};

function findOrCreateRedisClientFor(options: RedisOptions | undefined): IRedis {
    const optionsJson = JSON.stringify(options) as string;
    const existing = redisClients[optionsJson];
    if (existing) {
        return existing;
    }
    const client = new Redis(options);
    redisClients[optionsJson] = client;
    return client;
}

export class Segmenta {
    private readonly _redis: IRedis;
    private _luaFunctionsSetup: boolean = false;

    private readonly _prefix: string;
    private readonly _keyGenerator: KeyGenerator;
    private readonly _resultsetHydrator: ResultSetHydrator;

    public get resultsTTL() {
        return this._resultsetHydrator.ttl;
    }

    public get prefix(): string {
        return this._prefix;
    }

    private readonly _bucketSize: number;
    public get bucketSize(): number {
        return this._bucketSize;
    }

    constructor(options?: ISegmentaOptions) {
        this._prefix = _.get(options, "segmentsPrefix") || "segments";
        this._bucketSize = _.get(options, "bucketSize") as number;
        if (isNaN(this._bucketSize) ||
            this._bucketSize < 1) {
            this._bucketSize = DEFAULT_BUCKET_SIZE;
        }
        const mod = this._bucketSize % 8;
        if (mod > 0) {
            this._bucketSize -= mod; // segments must be byte-aligned to avoid confusion
        }
        _.set(options as object, "redisOptions.return_buffers", true);
        this._redis = findOrCreateRedisClientFor(_.get(options, "redisOptions"));
        this._redis.on("connect", async () => {
            await this._setupLuaFunctions();
        });
        this._keyGenerator = new KeyGenerator(this._prefix);
        this._resultsetHydrator = new ResultSetHydrator({
            redis: this._redis,
            keyGenerator: this._keyGenerator,
            ttl: _.get(options, "resultsTTL") || DEFAULT_RESULTSET_TTL
        });
        const lruCacheSize = parseInt(_.get(options, "lruCacheSize") as string | undefined || "1", 10);
        lruCache = lruCache || LRU({
            max: lruCacheSize,
            length(n: any) {
                const
                    bytes = n.values.length * 32;
                return Math.floor(bytes / 1048576);
            }
        });
    }

    public async getBuffer(...segments: string[]): Promise<SparseBufferWithPaging | number> {
        if (segments.length === 1 && looksLikeDSL(segments[0])) {
            debug(`getting buffer for query: ${ segments[0] }`);
            return await this._getBufferForDSL(segments[0]);
        }
        debug(`getting buffer for segment(s): ${ segments.join(",") }`);
        const
            baseKeys = segments.map(s => this._dataKeyForSegment(s)),
            segmentKeys = await this._getSegmentKeys(...baseKeys),
            result = new SparseBufferWithPaging(),
            multiFetched = await this._multiGetBuffers(segmentKeys),
            multiHunkResults = this._makeHunks(multiFetched, segmentKeys),
            hunks = _.orderBy(_.filter(multiHunkResults, h => !!h) as IHunk[], h => h.first);
        _.forEach(hunks, h => result.or(h));
        return result;
    }

    private async _multiGetBuffers(keys: string[]): Promise<Buffer[]> {
        if (keys.length === 0) {
            return [];
        }
        const
            Command = Redis.Command as any, // work around unknown ctor
            send = this._redis.sendCommand as (cmd: any) => void, // work around invalid arg count for sendCommand
            cmd = new Command("mget", keys);
        send.call(this._redis, cmd);
        return cmd.promise;
    }

    private _makeHunks(buffers: Buffer[], keys: string[]): IHunk[] {
        return keys.map((key, idx) => {
            const
                parts = key.split("/"),
                [start] = parts[parts.length - 1].split("-").map(parseInt);
            return new Hunk(buffers[idx], start / 8);
        });
    }

    private async _getBufferForDSL(query: string): Promise<SparseBufferWithPaging | number> {
        const
            tokens = tokenize(query),
            pipeline = parse(tokens, this);
        debug(`Execute pipeline for ${ query }`);
        return await pipeline.exec();
    }

    public async query(qry: ISegmentQueryOptions | string): Promise<ISegmentResults> {
        debug(`query start (${ this._prefix }): `, qry);
        const
            options = sanitizeOptions(qry),
            isReQuery = isUUID(options.query);
        if (isReQuery) {
            const cached = lruCache.get(options.query);
            if (cached) {
                return prepareCachedResult(options, cached);
            }
        }
        const buffer = isReQuery
            ? await this._rehydrate(options.query)
            : await this.getBuffer(options.query);
        if (isNumber(buffer)) {
            return prepareCountResult(buffer);
        }

        return this._prepareNewResultAndCacheIfAppropriate(
            isReQuery,
            options,
            buffer
        );
    }

    private async _prepareNewResultAndCacheIfAppropriate(
        isReQuery: boolean,
        options: ISanitizedQueryOptions,
        buffer: SparseBuffer
    ) {
        const
            paged = expectsPaging(options),
            shouldSnapshot = !isReQuery && paged,
            resultSetId = shouldSnapshot ? uuid() : (isReQuery ? options.query : undefined),
            positionsResult = shouldSnapshot
                ? await this._paginateLocal(buffer, options, resultSetId as string)
                : buffer.getOnBitPositions(options.skip, options.take, options.min, options.max),
            total = positionsResult.total,
            ids = positionsResult.values,
            count = ids.length;
        return {
            ids,
            count,
            skipped: options.skip || 0,
            take: options.take || 0,
            total,
            resultSetId,
            paged
        };
    }

    public async fetchStats(): Promise<ISegmentaStats> {
        const segments = await this.list();
        const result = {
            bytes: 0,
            buckets: 0,
            size: "0 b",
            segments: [] as ISegmentaSegmentStats[]
        } as ISegmentaStats;
        for (const segment of segments) {
            const
                index = await this._fetchIndex(segment),
                buckets = index.map(s => {
                    const parts = s.split("/");
                    return parts[parts.length - 1];
                }).map(idx => idx.split("-").map(p => parseInt(p, 10)))
                    .filter(parts => !isNaN(parts[0]) && !isNaN(parts[1])),
                segmentData = {
                    segment,
                    bytes: 0,
                    buckets: index.length,
                    size: "0 b",
                    index: buckets
                } as ISegmentaSegmentStats;
            buckets.forEach(idx => {
                const [lower, upper] = idx;
                if (isNaN(lower) || isNaN(upper)) {
                    return;
                }
                const
                    totalNumbers = (upper - lower + 1), // range is inclusive
                    bytes = totalNumbers / 8;
                segmentData.bytes += bytes;
            });
            segmentData.size = this._humanReadableSize(segmentData.bytes);
            result.segments.push(segmentData);

            result.buckets += segmentData.buckets;
            result.bytes += segmentData.bytes;
        }
        result.size = this._humanReadableSize(result.bytes);
        return result;
    }

    private _suffixes: string[] = ["b", "Kb", "Mb"];

    private _humanReadableSize(bytes: number): string {
        let idx = 0;
        while (bytes > 1024 && idx < this._suffixes.length - 1) {
            bytes /= 1024;
            idx++;
        }

        const numericPart = `${ bytes.toFixed(2) }`.replace(/\.00$/, "");
        return `${ numericPart } ${ this._suffixes[idx] }`;
    }

    private async _paginateLocal(
        buffer: SparseBuffer,
        options: ISanitizedQueryOptions,
        resultSetId: string): Promise<IPositionsResult> {
        const
            min = this._first(options.min, buffer.minimum),
            max = this._first(options.max, buffer.maximum),
            skip = this._first(options.skip, _.get(buffer, "skip")),
            take = this._first(options.take, _.get(buffer, "take"));
        if (buffer instanceof SparseBufferWithPaging) {
            buffer.clearPaging();
        }
        const
            all = buffer.getOnBitPositions(),
            start = skip === undefined ? 0 : skip,
            end = take === undefined ? all.total : take + start;
        let values = all.values;
        if (min !== undefined || max !== undefined) {
            values = values.filter(i => (min === undefined || i >= min) && (max === undefined || i <= max));
        }
        values = values.slice(start, end);

        lruCache.set(resultSetId, all);
        await this._dehydrate(resultSetId, buffer);
        return {
            values,
            total: all.total
        };
    }

    private _first(...numbers: (number | undefined)[]) {
        return numbers.reduce((acc, cur) =>
            acc === undefined ? cur : acc
        );
    }

    public async put(segmentId: string, operations: (IAddOperation | IDelOperation)[]): Promise<void> {
        await tryDo(() => this._tryPut(segmentId, operations));
    }

    public async add(segmentId: string, ids: number[]): Promise<void> {
        const ops = ids.map(i => ({ add: i }));
        await tryDo(() => this._tryPut(segmentId, ops));
    }

    public async del(segmentId: string, ids: number[]): Promise<void> {
        const ops = ids.map(i => ({ del: i }));
        await tryDo(() => this._tryPut(segmentId, ops));
    }

    public async list(): Promise<string[]> {
        debug(`listing segments under ${ this._prefix }`);
        const indexKeys = await this._redis.keys(`${ this._prefix }/*/index`);
        return indexKeys.map(k => {
            const parts = k.split("/");
            return parts[parts.length - 2];
        }).sort();
    }

    public async dispose(resultSetId?: string): Promise<void> {
        if (!resultSetId) {
            return;
        }
        lruCache.del(resultSetId || "");
        debug(`disposing of resultset ${ resultSetId }`);
        await this._resultsetHydrator.dispose(resultSetId);
    }

    public clearLRUCache() {
        lruCache.reset();
    }

    private async _dehydrate(id: string, data: SparseBuffer): Promise<void> {
        debug(`stashing resultset ${ id } for later...`);
        await this._resultsetHydrator.dehydrate(id, data);
    }

    private async _rehydrate(resultSetId: string): Promise<SparseBuffer> {
        debug(`rehydrating existing resultset: ${ resultSetId }`);
        const result = await this._resultsetHydrator.rehydrate(resultSetId);
        lruCache.set(resultSetId, result.getOnBitPositions()); // ensure it's back in the lru cache too
        return result;
    }

    private async _setupLuaFunctions() {
        if (this._luaFunctionsSetup) {
            return;
        }
        debug("setting up lua functions");
        await setup(this._redis);
    }

    private async _tryPut(segment: string, operations: (IAddOperation | IDelOperation)[]): Promise<void> {
        if (operations.length === 0) {
            return await this._ensureSegmentExists(segment);
        }
        validateMaxOperationLength(operations);
        await this._setupLuaFunctions();
        const
            baseKey = this._dataKeyForSegment(segment),
            cmds = [] as (string | number)[];

        let
            lastSegmentName = null,
            commands = 0;

        for (const op of operations) {
            const [id, val] = isAdd(op)
                ? [op.add, 1]
                : (isDel(op) ? [op.del, 0] : [-1, -1]);
            if (val === 1 && isDel(op)) {
                throw new Error("cannot combine add/del orIn the same operation ");
            }
            if (val < 0) {
                continue; // throw?
            }
            const segmentName = this._generateSegmentNameFor(id);
            if (segmentName !== lastSegmentName) {
                cmds.push(`${ baseKey }/${ segmentName }`);
                lastSegmentName = segmentName;
            }
            const offset = id % this._bucketSize;
            cmds.push(offset, val);
            commands++;
        }
        debug(`setting bits with ${ commands } commands`);
        await (this._redis as any).setbits(cmds);
    }

    private async _ensureSegmentExists(segment: string) {
        const index = await this._fetchIndex(segment);
        if (index.length === 0) {
            await this._tryPut(segment, [{ del: 0 }]);
        }
    }

    private async _fetchIndex(segment: string): Promise<string[]> {
        const indexKey = `${ this._dataKeyForSegment(segment) }/index`;
        return await this._redis.sunion(indexKey);
    }

    private async _getSegmentKeys(...baseKeys: string[]): Promise<string[]> {
        return await this._redis.sunion(...baseKeys.map(bk => `${ bk }/index`)) as string[];
    }

    private _generateSegmentNameFor(id: number): string {
        const
            lower = Math.floor(id / this._bucketSize) * this._bucketSize,
            upper = (lower + this._bucketSize - 1);
        return `${ lower }-${ upper }`;
    }

    private _dataKeyForSegment(segment: string): string {
        return this._keyGenerator.dataKeyFor(segment);
    }
}

function expectsPaging(options: ISanitizedQueryOptions): boolean {
    return options.skip !== undefined ||
        options.take !== undefined ||
        options.min !== undefined ||
        options.max !== undefined ||
        !!options.query.match(/(\sskip\s|\stake\s|\smin\s|\smax\s)/i);
}

function validateMaxOperationLength(ops: (IAddOperation | IDelOperation | number)[]): void {
    if (ops.length > MAX_OPERATIONS_PER_BATCH) {
        throw new Error([
            `Cannot process more than ${ MAX_OPERATIONS_PER_BATCH }`,
            `operations per batch for fear of redis error 'invalid multibulk length'`
        ].join(""));
    }
}

async function tryDo(func: () => Promise<void>, maxAttempts: number = 5) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await func();
            return;
        } catch (e) {
            if (i === maxAttempts - 1) {
                throw e;
            }
        }
    }
}

function sanitizePagingOptions(options: ISanitizedQueryOptions) {
    if (options.skip === null) {
        options.skip = undefined;
    }
    if (options.take === null) {
        options.take = undefined;
    }
    if (options.min === null) {
        options.min = undefined;
    }
    if (options.max === null) {
        options.max = undefined;
    }
}

function sanitizeOptions(opts: ISegmentQueryOptions | string): ISanitizedQueryOptions {
    const options = (isString(opts) ? { query: opts } : opts) as ISanitizedQueryOptions;
    if (!options.query) {
        throw new Error("No query defined");
    }
    sanitizePagingOptions(options);
    return options;
}

function looksLikeDSL(str: string): boolean {
    const parts = (str || "").split(" ");
    // assume dsl query if there are multiple words in the query string
    return parts.length > 1;
}

function prepareCachedResult(
    options: ISanitizedQueryOptions,
    cached: IPositionsResult
) {
    const
        skip = options.skip || 0,
        take = options.take === undefined ? cached.total : options.take,
        slice = cached.values
            .filter((i: number) => (options.min === undefined || i >= options.min) &&
                (options.max === undefined || i <= options.max))
            .slice(skip, take + skip);
    return {
        ids: slice,
        count: slice.length,
        skipped: options.skip || 0,
        take: options.take || 0,
        total: cached.total,
        resultSetId: options.query,
        paged: expectsPaging(options)
    } as ISegmentResults;
}

function prepareCountResult(
    total: number,
) {
    debug("query is count only...");
    return {
        ids: [],
        total,
        skipped: 0,
        take: 0,
        count: total,
        paged: false
    };
}
