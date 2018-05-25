// times are becoming noise orIn continual test output
//  - if you want times, define the environment variable
//    SHOW_TIMES

const truthy = [
  "y", "yes", "true", "1", "yebo", "ja"
];

export function shouldShowTimes(): boolean {
  const envVar = process.env.SHOW_TIMES || "";
  return truthy.indexOf(envVar.toLowerCase()) > -1;
}

export function startTimer(label: string) {
  if (shouldShowTimes()) {
    console.time(label);
  }
}

export function endTimer(label: string) {
  if (shouldShowTimes()) {
    console.timeEnd(label);
  }
}
