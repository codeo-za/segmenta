import * as faker from "faker";
const Redis = require("ioredis");
import "./matchers";

describe(`ioredis descovery tests`, () => {
  const deleteKeys = [] as string[];
  afterAll(async () => {
    const redis = new Redis();
    for (const deleteKey of deleteKeys) {
      const keys = await redis.keys(deleteKey);
      for (const key of keys) {
        await redis.del(key);
      }
    }
  });
  it(`should allow read/write from/to sets`, async () => {
    // Arrange
    const
      redis = new Redis(),
      key = randomKey(),
      item1 = faker.name.firstName(),
      item2 = faker.name.firstName();
    // Act
    await redis.sadd(key, item1, item2);
    const result = await redis.sunion(key);
    // Assert
    expect(result).toBeEquivalentTo([item1, item2]);
  });

  function randomKey() {
    const result = faker.random.alphaNumeric(32);
    deleteKeys.push(result);
    return result;
  }

});
