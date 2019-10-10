import { SparseBuffer, SparseBufferWithPaging } from "../sparse-buffer";
import { Segmenta } from "../segmenta";
import { isString, isSparseBuffer, isPipeline } from "../type-testers";

export enum SegmentaPipelineOperations {
    none,
    andIn,
    or,
    orIn,
    notIn,
    min,
    max,
    skip,
    take
}

enum ExecOperations {
    none,
    get,
    count,
    random
}

interface ISegmentaPipelineOperation {
    op: SegmentaPipelineOperations;
    segment?: string | SparseBuffer | SegmentaPipeline;
    value?: number;
}

let pipelineId = 0;

interface ISpecialOpsHandlers {
    [index: string]: (r: SparseBufferWithPaging, op: ISegmentaPipelineOperation) => void;
}

const NumericOpsHandlers: ISpecialOpsHandlers = {
    [SegmentaPipelineOperations[SegmentaPipelineOperations.min]]:
        (r: SparseBufferWithPaging, op: ISegmentaPipelineOperation) => r.minimum = op.value,
    [SegmentaPipelineOperations[SegmentaPipelineOperations.max]]:
        (r: SparseBufferWithPaging, op: ISegmentaPipelineOperation) => r.maximum = op.value,
    [SegmentaPipelineOperations[SegmentaPipelineOperations.skip]]:
        (r: SparseBufferWithPaging, op: ISegmentaPipelineOperation) => r.skip = op.value,
    [SegmentaPipelineOperations[SegmentaPipelineOperations.take]]:
        (r: SparseBufferWithPaging, op: ISegmentaPipelineOperation) => r.take = op.value,
};

export class SegmentaPipeline {
    private readonly _parent: SegmentaPipeline | undefined;
    private readonly _segmenta: Segmenta;
    private _execOperation: ExecOperations = ExecOperations.none;
    private _operations: ISegmentaPipelineOperation[] = [];
    public id: number;

    private static operationLookup = {
        [ExecOperations.get]: (pipeline: SegmentaPipeline) => pipeline._get(),
        [ExecOperations.count]: (pipeline: SegmentaPipeline) => pipeline._count(),
        [ExecOperations.random]: (pipeline: SegmentaPipeline) => pipeline._random()
    };

    constructor(segmenta: Segmenta, parent?: SegmentaPipeline) {
        this._parent = parent;
        this._segmenta = segmenta;
        this.id = ++pipelineId;
    }

    private _lastOp: SegmentaPipelineOperations = SegmentaPipelineOperations.none;

    public in() {
        switch (this._lastOp) {
            case SegmentaPipelineOperations.none:
            case SegmentaPipelineOperations.or:
                return this._setLastOp(SegmentaPipelineOperations.orIn);
            case SegmentaPipelineOperations.andIn:
                return this._setLastOp(SegmentaPipelineOperations.andIn);
            case SegmentaPipelineOperations.notIn:
                return this;
            default:
                throw new Error(`Don't know how to "in" after "${ SegmentaPipelineOperations[this._lastOp] }"`);
        }
    }

    public segment(id: string) {
        if (this._lastOp === SegmentaPipelineOperations.none) {
            throw new Error("can't call segment() without a preceding operation");
        }
        this._operations.push({ op: this._lastOp, segment: id });
        return this._setNoneOp();
    }

    public notIn() {
        return this._setLastOp(SegmentaPipelineOperations.notIn);
    }

    public or() {
        return this._setLastOp(SegmentaPipelineOperations.or);
    }

    public not() {
        return this._setLastOp(SegmentaPipelineOperations.notIn);
    }

    public and() {
        return this._setLastOp(SegmentaPipelineOperations.andIn);
    }

    public min() {
        return this._setLastOp(SegmentaPipelineOperations.min);
    }

    public max() {
        return this._setLastOp(SegmentaPipelineOperations.max);
    }

    public skip() {
        return this._setLastOp(SegmentaPipelineOperations.skip);
    }

    public take() {
        return this._setLastOp(SegmentaPipelineOperations.take);
    }

    private _setLastOp(op: SegmentaPipelineOperations) {
        this._lastOp = op;
        return this;
    }

    private _setNoneOp() {
        return this._setLastOp(SegmentaPipelineOperations.none);
    }

    public int(str: string) {
        const value = parseInt(str, 10);
        if (isNaN(value)) {
            throw new Error(`Invalid number value: ${ str }`);
        }
        this._operations.push({ op: this._lastOp, value });
        return this._setNoneOp();
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
        return results.getOnBitPositions().total;
    }

    public async exec(): Promise<SparseBufferWithPaging | number> {
        if (this._execOperation === ExecOperations.none) {
            throw new Error("No exec operation defined");
        }
        const operator = SegmentaPipeline.operationLookup[this._execOperation];
        if (!operator) {
            throw new Error(`No operator defined for exec operation ${ [ExecOperations[this._execOperation]] }`);
        }
        return operator(this);
    }

    public asGet(): SegmentaPipeline {
        this._execOperation = ExecOperations.get;
        return this;
    }

    public asRandom(): SegmentaPipeline {
        this._execOperation = ExecOperations.random;
        return this;
    }

    public asCount(): SegmentaPipeline {
        this._execOperation = ExecOperations.count;
        return this;
    }

    private async _random(): Promise<SparseBufferWithPaging> {
        const result = await this._get();
        result.ordered = false;
        return result;
    }

    private async _get(): Promise<SparseBufferWithPaging> {
        const result = new SparseBufferWithPaging();
        for (const op of this._operations) {

            const handler = NumericOpsHandlers[SegmentaPipelineOperations[op.op]];
            if (handler) {
                handler(result, op);
                continue;
            }

            if (!op.segment) {
                throw new Error(`No segment on ${ JSON.stringify({
                    op: SegmentaPipelineOperations[op.op]
                }) }`);
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
                throw new Error(`segment not actualized: ${ op.segment }`);
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
                    throw new Error(`Unknown SegmentaPipelineOperation: ${ SegmentaPipelineOperations[op.op] }`);
            }
        }
        return result;
    }
}
