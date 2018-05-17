import {Pipeline, Redis} from "ioredis";
import SparseBuffer from "./sparse-buffer";
import {KeyGenerator} from "./key-generator";
import {DEFAULT_RESULTSET_TTL} from "./constants";

export interface IResultSetHydratorOptions {
  redis: Redis;
  keyGenerator: KeyGenerator;
  ttl?: number;
}

export class ResultSetHydrator {

  public get ttl() {
    return this._ttl;
  }
  private readonly _redis: Redis;
  private readonly _keyGenerator: KeyGenerator;
  private readonly _ttl: number;

  constructor(options: IResultSetHydratorOptions) {
    this._redis = options.redis;
    this._keyGenerator = options.keyGenerator;
    this._ttl = options.ttl || DEFAULT_RESULTSET_TTL;
  }

  public async dehydrate(id: string, data: SparseBuffer): Promise<void> {
    const baseKey = this._keyGenerator.resultSetKeyFor(id);
    let query = this._redis.multi();

    for (const hunk of data.hunks) {
      const key = `${baseKey}/${hunk.first}`;
      query = query.set(key, hunk.buffer).expire(key, this._ttl);
    }
    await this._setExpiresInfo(baseKey, query).exec();
  }

  public async rehydrate(resultSetId: string): Promise<SparseBuffer> {
    const
      baseKey = this._keyGenerator.resultSetKeyFor(resultSetId),
      expires = await this._redis.get(`${baseKey}/expires`);
    if (!expires) {
      throw new Error(`result set ${resultSetId} not found (expired perhaps?)`);
    }
    const
      keys = await this._redis.keys(`${baseKey}/*`),
      result = new SparseBuffer();
    let query = this._redis.multi();
    for (const key of keys) {
      const
        parts = key.split("/"),
        last = parts[parts.length - 1],
        offset = parseInt(last, 10);
      if (isNaN(offset)) {
        continue;
      }
      const buffer = await this._redis.getBuffer(key);
      // accessing the result-set extends the expiry date for that resultset
      query = query.expire(key, this._ttl);
      result.or(buffer, offset);
    }
    await this._setExpiresInfo(baseKey, query).exec();
    return result;
  }

  private _setExpiresInfo(baseKey: string, query: Pipeline) {
    const key = `${baseKey}/expires`,
      expires = new Date();
    expires.setSeconds(expires.getSeconds() + this._ttl);
    return query.set(key, expires).expire(key, this._ttl);
  }
}
