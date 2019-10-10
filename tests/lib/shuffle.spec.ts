import "expect-more-jest";
import "../matchers";
import faker from "faker";
import { repeat } from "../repeat";
import { shuffleUsingFisherYatesMethod } from "../../src/lib/shuffle";

describe(`randomizeInPlace`, () => {
    const
        minCount = 10,
        envValue = parseInt(process.env.RANDOMIZE_CYCLES || "", 10),
        envValueSucks = isNaN(envValue) || envValue < minCount,
        repeatCount = envValueSucks ? minCount : envValue;
    repeat(repeatCount, () => {
        it(`should always return the full set, re-ordered`, async () => {
            // Arrange
            const
                data = makeRandomArrayOfNumbers(),
                expected = clone(data);
            expect(data).toEqual(expected);
            // Act
            shuffleUsingFisherYatesMethod(data);
            // Assert
            expect(data).not.toEqual(expected);
            expect(data).toBeEquivalentTo(expected);
        });
    });

    function clone(numbers: number[]) {
        const result = [] as number[];
        result.length = numbers.length;
        repeat(result.length, i => result[i] = numbers[i]);
        return result;
    }

    function makeRandomArrayOfNumbers(): number[] {
        const
            items = faker.random.number({ min: 10, max: 1024 }),
            result = [] as number[];
        // allocate all the space once
        result.length = items;
        for (let i = 0; i < items; i++) {
            result[i] = faker.random.number();
        }
        return result;
    }
});
