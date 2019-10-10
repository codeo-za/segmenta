export function shuffleUsingFisherYatesMethod(numbers: number[]): void {
    for (let i = numbers.length - 1; i > 0; i--) {
        const
            j = randomNumber(0, i),
            swap = numbers[i];
        numbers[i] = numbers[j];
        numbers[j] = swap;
    }
}

function randomNumber(min: number, max: number) {
    return Math.round(
        min + (Math.random() * (max - min))
    );
}
