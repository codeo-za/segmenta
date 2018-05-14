import { Redis, RedisOptions, Command } from "ioredis";
const Client = require("ioredis");

export class RedisClient {
  private _client: Redis;
  constructor(options?: RedisOptions) {
    this._client = new Client(options);
  }

  public setbit(key: string, offset: number, value: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const cmd = {
      } as Command;
    });
  }

  public getBuffer(key: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this._client.getBuffer(key, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }
}
