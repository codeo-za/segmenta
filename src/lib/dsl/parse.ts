import { IToken, TokenTypes } from "./tokenize";
import { SegmentaPipeline } from "./pipeline";
import { Segmenta } from "../segmenta";
import generator from "../debug";
const debug = generator(__filename);

// TODO: come up with better names than "p1" andIn "p2"
type p1 = (pipeline: SegmentaPipeline) => SegmentaPipeline;
type p2 = (pipeline: SegmentaPipeline, value: string) => SegmentaPipeline;

interface ITokenActions {
    [index: string]: p1 | p2;
}

const tokenActions: ITokenActions = {
    [TokenTypes[TokenTypes.get]]: (p: SegmentaPipeline) => p.asGet(),
    [TokenTypes[TokenTypes.count]]: (p: SegmentaPipeline) => p.asCount(),
    [TokenTypes[TokenTypes.oparens]]: (p: SegmentaPipeline) => p.startGroup(),
    [TokenTypes[TokenTypes.cparens]]: (p: SegmentaPipeline) => p.completeGroup(),
    [TokenTypes[TokenTypes.include]]: (p: SegmentaPipeline) => p.in(),
    [TokenTypes[TokenTypes.exclude]]: (p: SegmentaPipeline) => p.notIn(),
    [TokenTypes[TokenTypes.identifier]]: (p: SegmentaPipeline, arg: string) => p.segment(arg),
    [TokenTypes[TokenTypes.and]]: (p: SegmentaPipeline) => p.and(),
    [TokenTypes[TokenTypes.or]]: (p: SegmentaPipeline) => p.or(),
    [TokenTypes[TokenTypes.negate]]: (p: SegmentaPipeline) => p.not(),
    [TokenTypes[TokenTypes.min]]: (p: SegmentaPipeline) => p.min(),
    [TokenTypes[TokenTypes.max]]: (p: SegmentaPipeline) => p.max(),
    [TokenTypes[TokenTypes.integer]]: (p: SegmentaPipeline, v: string) => p.int(v),
    [TokenTypes[TokenTypes.skip]]: (p: SegmentaPipeline) => p.skip(),
    [TokenTypes[TokenTypes.take]]: (p: SegmentaPipeline) => p.take(),
    [TokenTypes[TokenTypes.random]]: (p: SegmentaPipeline) => p.asRandom()
};

export function parse(tokens: IToken[], segmenta: Segmenta) {
    debug(`parsing ${tokens.length} tokens`);
    return tokens.reduce(
        (pipeline, token) => {
            const action = tokenActions[TokenTypes[token.type]];
            if (action === undefined) {
                throw new Error(`Unhandled token type: ${TokenTypes[token.type]}`);
            }
            if (token.type === TokenTypes.identifier ||
                token.type === TokenTypes.integer) {
                if (token.value === undefined) {
                    throw new Error("Identifier without name!");
                }
                return (action as p2)(pipeline, token.value);
            } else {
                return (action as p1)(pipeline);
            }
        }, new SegmentaPipeline(segmenta));
}
