// times are becoming noise in continual test output
//  - if you want times, define the environment variable
//    SHOW_TIMES

export function startTimer(label: string) {
  if (process.env.SHOW_TIMES) {
    console.time(label);
  }
}

export function endTimer(label: string) {
  if (process.env.SHOW_TIMES) {
    console.timeEnd(label);
  }
}
