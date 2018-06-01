import {Redis as IRedis} from "ioredis";
import {v4 as uuid} from "uuid";
import {isUUID, isString, isNumber, isAddOperation as isAdd, isDelOperation as isDel} from "./type-testers";
import {Hunk, IHunk} from "./hunk";
import _ from "lodash";
import {setup} from "./set-bits";
import {ResultSetHydrator} from "./resultset-hydrator";
import {KeyGenerator} from "./key-generator";
import {MAX_OPERATIONS_PER_BATCH, DEFAULT_BUCKET_SIZE, DEFAULT_RESULTSET_TTL} from "./constants";
import {
  IAddOperation,
  IDelOperation,
  ISanitizedQueryOptions,
  ISegmentaOptions,
  ISegmentQueryOptions,
  ISegmentResults
} from "./interfaces";
import SparseBuffer from "./sparse-buffer";

import {IToken, tokenize} from "./dsl/tokenize";
import {parse} from "./dsl/parse";

const Redis = require("ioredis");

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
    this._redis = new Redis(_.get(options, "redisOptions"));
    this._redis.on("connect", async () => {
      await this._setupLuaFunctions();
    });
    this._keyGenerator = new KeyGenerator(this._prefix);
    this._resultsetHydrator = new ResultSetHydrator({
      redis: this._redis,
      keyGenerator: this._keyGenerator,
      ttl: _.get(options, "resultsTTL") || DEFAULT_RESULTSET_TTL
    });
  }

  public async getBuffer(...segments: string[]): Promise<SparseBuffer | number> {
    if (segments.length === 1 && this._looksLikeDSL(segments[0])) {
      const dslResult = await this._getBufferForDSL(segments[0]);
      return dslResult;
    }
    const
      baseKeys = segments.map(s => this._dataKeyForSegment(s)),
      segmentKeys = await this._getSegmentKeys(...baseKeys),
      result = new SparseBuffer(),
      fetchers = segmentKeys.map(s => this._retrieveBucket(s)),
      hunkResults = await Promise.all(fetchers),
      hunks = _.orderBy(_.filter(hunkResults, h => !!h) as IHunk[], h => h.first);
    _.forEach(hunks, h => result.or(h));
    return result;
  }

  private _looksLikeDSL(str: string): boolean {
    const parts = (str || "").split(" ");
    // assume dsl query if there are multiple words in the query string
    return parts.length > 1;
  }

  private async _getBufferForDSL(query: string): Promise<SparseBuffer | number> {
    const
      tokens = tokenize(query),
      pipeline = parse(tokens, this);
    return await pipeline.exec();
  }

  public async query(qry: ISegmentQueryOptions | string): Promise<ISegmentResults> {
    const
      options = sanitizeOptions(qry),
      isRequery = isUUID(options.query),
      buffer = isRequery
        ? await this._rehydrate(options.query)
        : await this.getBuffer(options.query);
    if (isNumber(buffer)) {
      return {
        ids: [],
        total: buffer,
        skipped: 0,
        take: 0,
        count: buffer,
        paged: false
      };
    }
    const
      shouldSnapshot = options.skip !== undefined || options.take !== undefined,
      skip = options.skip || 0,
      take = options.take || 0,
      resultSetId = shouldSnapshot ? uuid() : undefined,
      ids = buffer.getOnBitPositions(options.skip || 0, take),
      total = ids.length,
      result = {
        ids,
        count: ids.length,
        skipped: skip,
        take,
        total,
        resultSetId,
        paged: shouldSnapshot
      };
    if (!isRequery && resultSetId) {
      await this._dehydrate(resultSetId, buffer);
    }
    return result;
  }

  public async put(segmentId: string, operations: (IAddOperation | IDelOperation)[]): Promise<void> {
    await tryDo(() => this._tryPut(segmentId, operations));
  }

  public async add(segmentId: string, ids: number[]): Promise<void> {
    const ops = ids.map(i => ({add: i}));
    await tryDo(() => this._tryPut(segmentId, ops));
  }

  public async del(segmentId: string, ids: number[]): Promise<void> {
    const ops = ids.map(i => ({del: i}));
    await tryDo(() => this._tryPut(segmentId, ops));
  }

  public async dispose(resultSetId?: string): Promise<void> {
    if (!resultSetId) {
      return;
    }
    await this._resultsetHydrator.dispose(resultSetId);
  }

  private async _dehydrate(id: string, data: SparseBuffer): Promise<void> {
    await this._resultsetHydrator.dehydrate(id, data);
  }

  private async _rehydrate(resultSetId: string): Promise<SparseBuffer> {
    return await this._resultsetHydrator.rehydrate(resultSetId);
  }

  private async _setupLuaFunctions() {
    if (this._luaFunctionsSetup) {
      return;
    }
    await setup(this._redis);
  }

  private async _tryPut(segment: string, operations: (IAddOperation | IDelOperation)[]): Promise<void> {
    validateMaxOperationLength(operations);
    await this._setupLuaFunctions();
    const
      baseKey = this._dataKeyForSegment(segment),
      cmds = [] as (string | number)[];

    let lastSegmentName = null;

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
        cmds.push(`${baseKey}/${segmentName}`);
        lastSegmentName = segmentName;
      }
      const offset = id % this._bucketSize;
      cmds.push(offset, val);
    }
    await (this._redis as any).setbits(cmds);
  }

  private async _retrieveBucket(segmentKey: string): Promise<IHunk | undefined> {
    const buffer = await this._redis.getBuffer(segmentKey);
    if (!buffer) {
      return undefined;
    }
    const
      parts = segmentKey.split("/"),
      [start] = parts[parts.length - 1].split("-").map(parseInt);
    return new Hunk(buffer, start / 8);
  }

  private async _getSegmentKeys(...baseKeys: string[]): Promise<string[]> {
    return await this._redis.sunion(...baseKeys.map(bk => `${bk}/index`)) as string[];
  }

  private _generateSegmentNameFor(id: number): string {
    const
      lower = Math.floor(id / this._bucketSize) * this._bucketSize,
      upper = (lower + this._bucketSize - 1);
    return `${lower}-${upper}`;
  }

  private _dataKeyForSegment(segment: string): string {
    return this._keyGenerator.dataKeyFor(segment);
  }
}

function validateMaxOperationLength(ops: (IAddOperation | IDelOperation | number)[]): void {
  if (ops.length > MAX_OPERATIONS_PER_BATCH) {
    throw new Error([
      `Cannot process more than ${MAX_OPERATIONS_PER_BATCH}`,
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

function sanitizeOptions(opts: ISegmentQueryOptions | string): ISanitizedQueryOptions {
  const options = (isString(opts) ? {query: opts} : opts) as ISanitizedQueryOptions;
  if (!options.query) {
    throw new Error("No query defined");
  }
  return options;
}
