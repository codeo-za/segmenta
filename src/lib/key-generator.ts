export class KeyGenerator {
  private readonly _prefix: string;

  constructor(prefix: string) {
    this._prefix = prefix;
  }

  public dataKeyFor(segmentId: string): string {
    return `${this._prefix}/data/${segmentId}`;
  }

  public resultSetKeyFor(resultSetId: string): string {
    return `${this._prefix}/results/${resultSetId}`;
  }
}
