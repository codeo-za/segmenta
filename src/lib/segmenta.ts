import {Redis, RedisOptions} from "ioredis";
// import { RedisClient } from "./redis-client";
const RedisClient = require("ioredis");
const MAX_OPERATIONS_PER_BATCH = 200000;
const DEFAULT_BUCKET_SIZE = 41960;
import SparseBuffer from "./sparse-buffer";
import {Hunk, IHunk} from "./hunk";
import * as _ from "lodash";
import {setup} from "./set-bits";

export interface ISegmentaOptions {
  redisOptions?: RedisOptions;
  segmentsPrefix?: string;
  bucketSize?: number;
}

interface IBitGroup {
  [identifier: string]: number[];
}

export interface IAddOperation {
  add: number;
}

export interface IDelOperation {
  del: number;
}

export interface ISegmentResult {
  results: number[];
  next: () => ISegmentResult;
}

export default class Segmenta {
  private readonly _redis: Redis;
  private _luaFunctionsSetup: boolean = false;

  private readonly _prefix: string;
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
    this._redis = new RedisClient(_.get(options, "redisOptions"));
  }

  public async getBuffer(...segments: string[]): Promise<SparseBuffer> {
    const
      baseKeys = segments.map(s => this._keyForSegment(s)),
      segmentKeys = await this._getSegmentKeys(...baseKeys),
      result = new SparseBuffer(),
      fetchers = segmentKeys.map(s => this._retrieveSegment(s)),
      hunkResults = await Promise.all(fetchers),
      hunks = _.orderBy(_.filter(hunkResults, h => !!h) as IHunk[], h => h.first);
    _.forEach(hunks, h => result.or(h));
    return result;
  }

  public async get(segment: string, skip: number = 0, take: number = 100000): Promise<number[]> {
    const
      buffer = await this.getBuffer(segment);
    return buffer.getOnBitPositions(skip, take);
  }

  public async add(segment: string, ids: number[]): Promise<void> {
    const ops = ids.map(i => ({add: i}));
    await this._tryDo(() => this._tryPut(segment, ops));
  }

  public async put(segment: string, operations: (IAddOperation | IDelOperation)[]): Promise<void> {
    await this._tryDo(() => this._tryPut(segment, operations));
  }

  private _validateMaxOperationLength(ops: (IAddOperation | IDelOperation | number)[]): void {
    if (ops.length > MAX_OPERATIONS_PER_BATCH) {
      throw new Error([
        `Cannot process more than ${MAX_OPERATIONS_PER_BATCH}`,
        `operations per batch for fear of redis error 'invalid multibulk length'`
      ].join(""));
    }
  }

  private async _setupLuaFunctions() {
    if (this._luaFunctionsSetup) {
      return;
    }
    await setup(this._redis);
  }

  private async _tryDo(func: () => Promise<void>, maxAttempts: number = 5) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await func();
        return;
      } catch (e) {
        if (i === maxAttempts - 1) {
          throw e;
        }
        console.log("retrying...");
      }
    }
  }

  private _isAdd(op: any): op is IAddOperation {
    return !isNaN(op.add);
  }

  private _isDel(op: any): op is IDelOperation {
    return !isNaN(op.del);
  }

  private async _tryPut(segment: string, operations: (IAddOperation | IDelOperation)[]): Promise<void> {
    await this._setupLuaFunctions();
    const
      baseKey = this._keyForSegment(segment),
      cmds = [] as (string | number)[];

    let lastSegmentName;

    for (const op of operations) {
      const [id, val] = this._isAdd(op)
        ? [op.add, 1]
        : (this._isDel(op) ? [op.del, 0] : [-1, -1]);

      if (val < 0) {
        continue; // throw?
      }
      const segmentName = this._generateSegmentNameFor(id)
      if (segmentName !== lastSegmentName) {
        cmds.push(`${baseKey}/${segmentName}`);
        lastSegmentName = segmentName;
      }
      const offset = id % this._bucketSize;
      cmds.push(offset, val);
    }

    await (this._redis as any).setbits(cmds);

    // let multi = this._redis.multi();
    // for (const op of operations) {
    //   const
    //     isAdd = this._isAdd(op),
    //     id = this._isAdd(op) ? op.add : (this._isDel(op) ? op.del : -1);
    //   if (id < 0) {
    //     continue; // TODO: throw? log?
    //   }
    //   const
    //     segmentName = this._generateSegmentNameFor(id),
    //     key = `${baseKey}/${segmentName}`,
    //     offset = id % this._bucketSize;
    //   multi = multi.setbit(key, offset, isAdd ? 1 : 0);
    //   if (touchedSegments.indexOf(segmentName) === -1) {
    //     touchedSegments.push(segmentName);
    //   }
    // }
    // await multi
    //   .sadd(`${baseKey}/index`, ...touchedSegments.map(s => `${baseKey}/${s}`))
    //   .exec();
  }

  private async _retrieveSegment(segmentKey: string): Promise<IHunk | undefined> {
    const buffer = await this._redis.getBuffer(segmentKey);
    if (!buffer) {
      return undefined;
    }
    const parts = segmentKey.split("/"),
      [start, end] = parts[parts.length - 1].split("-").map(parseInt);
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

  private _keyForSegment(segment: string): string {
    return `${this._prefix}/${segment}`;
  }
}
