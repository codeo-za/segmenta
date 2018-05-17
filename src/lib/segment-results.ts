export interface ISegmentResults {
  ids: number[];
  skipped: number;
  count: number;
  resultSetId: string;
  total: number;
}

export class SegmentResults implements ISegmentResults {
  public get resultSetId() {
    return this._resultSetId;
  }

  public get ids() {
    return this._ids;
  }

  public get skipped() {
    return this._skipped;
  }

  public get count() {
    return this._ids.length;
  }

  public get total() {
    return this._total;
  }

  private readonly _resultSetId: string;
  private readonly _ids: number[];
  private readonly _skipped: number;
  private readonly _total: number;

  constructor(resultSetId: string, ids: number[], skipped: number, total: number) {
    this._resultSetId = resultSetId;
    this._ids = ids;
    this._skipped = skipped;
    this._total = total;
  }
}
