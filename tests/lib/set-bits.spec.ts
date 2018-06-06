import {setup} from "../../src/lib/set-bits";
import "../matchers";

const Redis = require("ioredis");

describe(`set-bits`, () => {
    it(`should set up a redis command to set multiple bits from cmd pairs`, async () => {
        // Arrange
        const
            redis = new Redis(),
            key1 = "set_bits_test1",
            key2 = "set_bits_test2";
        // Act
        await setup(redis);
        await redis.del(key1);
        await redis.setbits(key1, 0, 1, 1, 0, 2, 1, key2, 0, 0, 1, 1, 2, 0, 3, 1);
        const
            r0 = await redis.getbit(key1, 0),
            r1 = await redis.getbit(key1, 1),
            r2 = await redis.getbit(key1, 2),
            r3 = await redis.getbit(key2, 0),
            r4 = await redis.getbit(key2, 1),
            r5 = await redis.getbit(key2, 2),
            r6 = await redis.getbit(key2, 3);
        // Assert
        expect(r0).toEqual(1);
        expect(r1).toEqual(0);
        expect(r2).toEqual(1);
        expect(r3).toEqual(0);
        expect(r4).toEqual(1);
        expect(r5).toEqual(0);
        expect(r6).toEqual(1);
    });
    afterEach(async () => {
        const redis = new Redis();
        for (const key of [
            "set_bits_test1",
            "set_bits_test1/index", // the lua setbits function will auto-add index refs
            "set_bits_test2",
            "set_bits_test2/index"
        ]) {
            await redis.del(key);
        }
    });
});
