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
  negate
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
  Token.for(TokenTypes.oparens, /\(/),                // start logical orGroup
  Token.for(TokenTypes.cparens, /\)/),               // end logical orGroup
  Token.for(TokenTypes.exclude, /\bNOT IN\b/i),           // negate segment
  Token.for(TokenTypes.negate, /\bNOT\b/i),
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

function generateSyntaxErrorFor(allCode: string, current: string): string {
  const
    absolutePos = allCode.length - current.length,
    lines = allCode.substr(0, absolutePos).split(new RegExp("\\r\\n|\\n|\\r")),
    linePos = lines.length,
    charPos = lines[linePos - 1].length + 1,
    partial = current.length > 10 ? current.substr(0, 10) + "..." : current;
  return `Syntax error (line ${linePos}, char ${charPos}): '${partial}'`;
}

export function tokenize(code: string): IToken[] {
  const result = [] as IToken[];
  let currentCode = code.trim();
  while (currentCode) {
    const thisToken = tokenTypes.reduce(
      (acc, cur) => {
        if (acc) {
          return acc;
        }
        const match = currentCode.match(cur.regex);
        return match && match.index === 0
          ? {type: cur.type, match}
          : acc;
      }, undefined as ITokenMatch | undefined);
    if (thisToken === undefined ||
      thisToken.match === undefined ||
      thisToken.match.index === undefined) {
      throw new Error(generateSyntaxErrorFor(code, currentCode));
    } else {
      result.push({
        type: thisToken.type,
        value: thisToken.type === TokenTypes.identifier
          ? sanitizeIdentifier(thisToken.match[0])
          : undefined
      });
      currentCode = currentCode.substr(thisToken.match[0].length).trim();
    }
  }
  return result;
}
