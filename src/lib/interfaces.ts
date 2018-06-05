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

export interface ISegmentQueryOptions {
  query?: string;
  skip?: number;
  take?: number;
  min?: number;
  max?: number;
}

export interface ISanitizedQueryOptions extends ISegmentQueryOptions {
  query: string;
}

export interface ISegmentResults {
  ids: number[];
  skipped: number;
  take: number;
  count: number;
  total: number;
  resultSetId?: string;
  paged: boolean;
}
