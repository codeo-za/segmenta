export enum TokenTypes {
  get,
  count,
  oparens,
  cparens,
  exclude,
  include,
  identifier,
  and,
  or
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

export interface IToken {
  type: TokenTypes;
  value?: string;
}

interface ITokenMatch {
  type: TokenTypes;
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
  Token.for(TokenTypes.oparens, /\(/),                // start logical group
  Token.for(TokenTypes.cparens, /\)/),               // end logical group
  Token.for(TokenTypes.exclude, /\bNOT IN\b/i),           // negate segment
  Token.for(TokenTypes.include, /\bIN\b/i),               // include segment
  Token.for(TokenTypes.and, /\bAND\b/i),
  Token.for(TokenTypes.or, /\bOR\b/i)
];

function sanitizeIdentifier(str: string): string {
  const result = str.replace(/^['"]?/, "").replace(/['"]?$/, "");
  if (result.match(/['"]/)) {
    throw new Error(`Invalid segment identifier: ${result}`);
  }
  return result;
}

export function tokenize(code: string): IToken[] {
  const result = [] as IToken[];
  code = code.trim();
  while (code) {
    const thisToken = tokenTypes.reduce(
      (acc, cur) => {
        if (acc) {
          return acc;
        }
        const match = code.match(cur.regex);
        return match && match.index === 0
          ? {type: cur.type, match}
          : acc;
      }, undefined as ITokenMatch | undefined);
    if (thisToken === undefined ||
      thisToken.match === undefined ||
      thisToken.match.index === undefined) {
      throw new Error(`Invalid token at or near: ${code.substr(0, 10)}`);
    } else {
      result.push({
        type: thisToken.type,
        value: thisToken.type === TokenTypes.identifier
          ? sanitizeIdentifier(thisToken.match[0])
          : undefined
      });
      code = code.substr(thisToken.match[0].length).trim();
    }
  }
  return result;
}
