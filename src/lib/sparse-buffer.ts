interface IBuffer {
  buffer: Buffer;
  offset: number;
}
export default class SparseBuffer {
  private _length: number = 0;
  public get length(): number {
    return this._length;
  }

  private _buffers: IBuffer[] = [];
  public or(buffer: Buffer, offset?: number): SparseBuffer {
    this._buffers.push({ buffer, offset: offset || 0 });
    this._recalculateLength();
    return this;
  }

  private _recalculateLength() {
    this._length = this._buffers.reduce((acc, cur) =>
      acc + cur.buffer.length
    , 0);
  }

  public at(index: number): number | undefined {
    const buffer = this._findBufferAt(index);
    if (!buffer) {
      return undefined;
    }
    return buffer.buffer[index - buffer.offset];
  }

  private _findBufferAt(index: number): IBuffer | undefined {
    return this._buffers.reduce((acc: IBuffer | undefined, cur) =>
      acc || (this._covers(cur, index) ? cur : undefined),
      undefined);
  }

  private _covers(buffer: IBuffer, index: number): boolean {
    return buffer.offset <= index &&
            buffer.buffer.length + buffer.offset > index;
  }
}
