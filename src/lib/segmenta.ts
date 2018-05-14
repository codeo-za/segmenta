import {Redis, RedisOptions} from "ioredis";
// import { RedisClient } from "./redis-client";
const RedisClient = require("ioredis");
import SparseBuffer from "./sparse-buffer";
import {Hunk, IHunk} from "./hunk";
import * as _ from "lodash";

export interface ISegmentaOptions {
  redisOptions?: RedisOptions;
  segmentsPrefix?: string;
  segmentSize?: number;
}

export default class Segmenta {
  private _redis: Redis;

  private _prefix: string;
  public get prefix(): string {
    return this._prefix;
  }

  private _segmentSize: number;
  public get segmentSize(): number {
    return this._segmentSize;
  }

  constructor(options?: ISegmentaOptions) {
    this._prefix = _.get(options, "segmentsPrefix") || "segments";
    this._segmentSize = _.get(options, "segmentSize") as number;
    if (isNaN(this._segmentSize) ||
      this._segmentSize < 1) {
      this._segmentSize = 41960;
    }
    const mod = this._segmentSize % 8;
    if (mod > 0) {
      this._segmentSize -= mod; // segments must be byte-aligned to avoid confusion
    }
    _.set(options as object, "redisOptions.return_buffers", true);
    this._redis = new RedisClient(_.get(options, "redisOptions"));
  }

  public async get(segment: string): Promise<number[]> {
    const
      buffer = await this.getBuffer(segment);
    return buffer.getOnBitPositions();
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

  public async add(segment: string, ids: number[]): Promise<void> {
    const
      baseKey = this._keyForSegment(segment),
      commands = [] as string[][],
      touchedSegments = [] as string[];
    // TODO: use multi to place into a transaction
    for (const id of ids) {
      const
        segmentName = this._generateSegmentNameFor(id),
        key = `${baseKey}/${segmentName}`,
        offset = id % this._segmentSize;
      commands.push(["send_command", "BITFIELD", key, "set", "u1", (offset).toString(), "1"]);
      if (touchedSegments.indexOf(segmentName) === -1) {
        touchedSegments.push(segmentName);
      }
    }
    commands.push(["sadd", `${baseKey}/index`].concat(touchedSegments.map(s => `${baseKey}/${s}`)));
    (global as any)["commands"] = commands;
    await this._redis.multi(commands).exec();
  }

  private _generateSegmentNameFor(id: number): string {
    const
      lower = Math.floor(id / this._segmentSize) * this._segmentSize,
      upper = (lower + this._segmentSize - 1);
    return `${lower}-${upper}`;
  }

  private _keyForSegment(segment: string): string {
    return `${this._prefix}/${segment}`;
  }
}
