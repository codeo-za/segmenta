import {validate} from "./validation";
import generator from "../debug";
const debug = generator(__filename);

export enum TokenTypes {
    get,
    count,
    oparens,
    cparens,
    exclude,
    include,
    identifier,
    and,
    or,
    negate,
    min,
    max,
    integer,
    skip,
    take
}

class Token {
    public get regex() {
        return this._regex;
    }

    public get type() {
        return this._type;
    }

    private readonly _type: TokenTypes;
    private readonly _regex: RegExp;

    constructor(type: TokenTypes, match: RegExp) {
        this._type = type;
        this._regex = match;
    }

    public static for(type: TokenTypes, match: RegExp) {
        return new Token(type, match);
    }
}

export interface ISimpleToken {
    type: TokenTypes;
    value?: string;
}

export interface IToken extends ISimpleToken {
    line: number;
    char: number;
}

interface ITokenMatch extends IToken {
    match: RegExpMatchArray;
}

const tokenTypes = [
    Token.for(
        // identifiers (segment names), allowing some non alpha-numeric chars & to be quoted
        TokenTypes.identifier,
        /([']{1})\b[a-zA-Z0-9-_:]+\b([']{1})/),
    Token.for(
        TokenTypes.identifier,
        /(["]{1})\b[a-zA-Z0-9-_:]+\b(["]{1})/),

    Token.for(TokenTypes.get, /\bGET\s+WHERE\b/i),            // get the resultset
    Token.for(TokenTypes.count, /\bCOUNT\s+WHERE\b/i),        // count the resultset only
    Token.for(TokenTypes.oparens, /\(/),                // start logical orGroup
    Token.for(TokenTypes.cparens, /\)/),               // end logical orGroup
    Token.for(TokenTypes.exclude, /\bNOT IN\b/i),           // negate segment
    Token.for(TokenTypes.negate, /\bNOT\b/i),
    Token.for(TokenTypes.include, /\bIN\b/i),               // include segment
    Token.for(TokenTypes.and, /\bAND\b/i),
    Token.for(TokenTypes.or, /\bOR\b/i),
    Token.for(TokenTypes.min, /\bMIN\b/i),
    Token.for(TokenTypes.max, /\bMAX\b/i),
    Token.for(TokenTypes.skip, /\bSKIP\b/i),
    Token.for(TokenTypes.take, /\bTAKE\b/i),
    Token.for(TokenTypes.integer, /\b[0-9]+\b/)
];

function sanitizeIdentifier(str: string): string {
    const result = str.replace(/^['"]?/, "").replace(/['"]?$/, "");
    if (result.match(/['"]/)) {
        throw new Error(`Invalid segment identifier: ${result}`);
    }
    return result;
}

function codePos(allCode: string, current: string): number[] {
    const
        absolutePos = allCode.length - current.length,
        lines = allCode.substr(0, absolutePos).split(new RegExp("\\r\\n|\\n|\\r")),
        linePos = lines.length,
        charPos = lines[linePos - 1].length + 1;
    return [linePos, charPos];
}

function generateSyntaxErrorFor(current: string, linePos: number, charPos: number): string {
    const
        partial = current.length > 10 ? current.substr(0, 10) + "..." : current;
    return `Syntax error (line ${linePos}, char ${charPos}): '${partial}'`;
}

export function tokenize(code: string): IToken[] {
    debug(`tokenize ${code}`);
    const result = [] as IToken[];
    let currentCode = code.trim();
    while (currentCode) {
        const [line, char] = codePos(code, currentCode);
        const thisToken = tokenTypes.reduce(
            (acc, cur) => {
                if (acc) {
                    return acc;
                }
                const match = currentCode.match(cur.regex);
                return match && match.index === 0
                    ? {type: cur.type, match, line, char}
                    : acc;
            }, undefined as ITokenMatch | undefined);
        if (thisToken === undefined ||
            thisToken.match === undefined ||
            thisToken.match.index === undefined) {
            throw new Error(generateSyntaxErrorFor(currentCode, line, char));
        } else {
            result.push({
                type: thisToken.type,
                value: sanitize(thisToken.type, thisToken.match[0]),
                line,
                char
            });
            currentCode = currentCode.substr(thisToken.match[0].length).trim();
        }
    }
    validate(result);
    return result;
}

function sanitize(type: TokenTypes, value: string) {
    switch (type) {
        case TokenTypes.identifier:
            return sanitizeIdentifier(value);
        case TokenTypes.integer:
            return value; // should already be correct due to regex
    }
}
