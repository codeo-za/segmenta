import { ClientOpts } from "redis";

export default class Segmenta {
  constructor(options?: ClientOpts) {
  }

  public async get(segment: string): Promise<number[]> {
    return [];
  }
}
