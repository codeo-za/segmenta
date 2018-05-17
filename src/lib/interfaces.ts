import {RedisOptions} from "ioredis";
export interface ISegmentaOptions {
  redisOptions?: RedisOptions;
  segmentsPrefix?: string;
  bucketSize?: number;
  resultsTTL?: number;
}

export interface IAddOperation {
  add: number;
}

export interface IDelOperation {
  del: number;
}

export interface ISegmentGetOptions {
  query: string;
  skip?: number;
  take?: number;
}
