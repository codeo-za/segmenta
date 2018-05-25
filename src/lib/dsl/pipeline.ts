import SparseBuffer from "../sparse-buffer";
import {Segmenta} from "../segmenta";
import {isString, isSparseBuffer, isPipeline} from "../type-testers";

export enum SegmentaPipelineOperations {
  none,
  andIn,
  or,
  orIn,
  notIn
}

enum ExecOperations {
  none,
  get,
  count
}

interface ISegmentaPipelineOperation {
  op: SegmentaPipelineOperations;
  segment?: string | SparseBuffer | SegmentaPipeline;
}

let pipelineId = 0;

export class SegmentaPipeline {
  private readonly _parent: SegmentaPipeline | undefined;
  private readonly _segmenta: Segmenta;
  private _execOperation: ExecOperations = ExecOperations.none;
  private _operations: ISegmentaPipelineOperation[] = [];
  public id: number;

  constructor(segmenta: Segmenta, parent?: SegmentaPipeline) {
    this._parent = parent;
    this._segmenta = segmenta;
    this.id = ++pipelineId;
  }

  private _buffer: SparseBuffer = new SparseBuffer();

  public notIn() {
    this._lastOp = SegmentaPipelineOperations.notIn;
    return this;
  }

  private _lastOp: SegmentaPipelineOperations = SegmentaPipelineOperations.none;

  public in() {
    switch (this._lastOp) {
      case SegmentaPipelineOperations.none:
      case SegmentaPipelineOperations.or:
        this._lastOp = SegmentaPipelineOperations.orIn;
        return this;
      case SegmentaPipelineOperations.andIn:
        this._lastOp = SegmentaPipelineOperations.andIn;
        return this;
      case SegmentaPipelineOperations.notIn:
        return this;
      default:
        throw new Error(`Don't know how to "in" after "${SegmentaPipelineOperations[this._lastOp]}"`);
    }
  }

  public segment(id: string) {
    if (this._lastOp === SegmentaPipelineOperations.none) {
      throw new Error("can't call segment() without a preceding operation");
    }
    this._operations.push({op: this._lastOp, segment: id});
    this._lastOp = SegmentaPipelineOperations.none;
    return this;
  }

  public or() {
    this._lastOp = SegmentaPipelineOperations.or;
    return this;
  }

  public not() {
    this._lastOp = SegmentaPipelineOperations.notIn;
    return this;
  }

  public and() {
    this._lastOp = SegmentaPipelineOperations.andIn;
    return this;
  }

  public startGroup(): SegmentaPipeline {
    if (this._lastOp === SegmentaPipelineOperations.none || this._lastOp === SegmentaPipelineOperations.notIn) {
      const next = new SegmentaPipeline(this._segmenta, this).asGet();
      this._operations.push({ op: this._lastOp, segment: next });
      this._lastOp = SegmentaPipelineOperations.none;
      return next;
    }
    return this;
  }

  public completeGroup(): SegmentaPipeline {
    return this._parent || this;
  }

  private async _count(): Promise<number> {
    const results = await this._get();
    return results.getOnBitPositions().length;
  }

  public async exec(): Promise<SparseBuffer | number> {
    if (this._execOperation === ExecOperations.none) {
      throw new Error("No exec operation defined");
    }
    return this._execOperation === ExecOperations.get
      ? this._get()
      : this._count();
  }

  public asGet(): SegmentaPipeline {
    this._execOperation = ExecOperations.get;
    return this;
  }

  public asCount(): SegmentaPipeline {
    this._execOperation = ExecOperations.count;
    return this;
  }

  private async _get(): Promise<SparseBuffer> {
    const result = new SparseBuffer();
    for (const op of this._operations) {
      if (!op.segment) {
        throw new Error(`No segment on ${JSON.stringify({
          op: SegmentaPipelineOperations[op.op]
        })}`);
      }
      if (isPipeline(op.segment)) {
        const opSegment = op.segment as SegmentaPipeline;
        const segmentResults = await opSegment.exec();
        if (!isSparseBuffer(segmentResults)) {
          throw new Error("Invalid operation: nested pipeline can ONLY be a get");
        }
        op.segment = segmentResults;
      }
      if (isString(op.segment)) {
        op.segment = await this._segmenta.getBuffer(op.segment) as SparseBuffer;
      }
      if (!isSparseBuffer(op.segment)) {
        throw new Error(`segment not actualized: ${op.segment}`);
      }
      switch (op.op) {
        case SegmentaPipelineOperations.orIn:
          result.or(op.segment);
          break;
        case SegmentaPipelineOperations.andIn:
          result.and(op.segment);
          break;
        case SegmentaPipelineOperations.notIn:
          result.not(op.segment);
          break;
        case SegmentaPipelineOperations.or:
          result.or(op.segment);
          break;
        default:
          throw new Error(`Unknown SegmentaPipelineOperation: ${SegmentaPipelineOperations[op.op]}`);
      }
    }
    return result;
  }
}
