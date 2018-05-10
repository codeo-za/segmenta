import {RedisOptions} from "ioredis";

export default class Segmenta {
  constructor(options?: RedisOptions) {
  }

  public async get(segment: string): Promise<number[]> {
    return [];
  }
}
