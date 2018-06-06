import {IToken, TokenTypes} from "./tokenize";

declare type TokenCollectionValidator = (tokens: IToken[]) => void;

function syntaxError(message: string, line?: number, char?: number): Error {
    if (line !== undefined && char !== undefined) {
        return new Error(`Syntax error (line ${line}, char ${char}): ${message}`);
    }
    return new Error(`Syntax error: ${message}`);
}

function shouldNotBeEmpty(tokens: IToken[]) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
        throw syntaxError("empty query");
    }
}

function shouldStartWithGetOrCount(tokens: IToken[]): void {
    const
        first = tokens[0].type,
        allowed = [TokenTypes.get, TokenTypes.count];
    if (allowed.indexOf(first) === -1) {
        throw syntaxError("query must start with 'GET WHERE' or 'COUNT WHERE'");
    }
}

function shouldHaveInitialIn(tokens: IToken[]) {
    const
        types = tokens.map(t => t.type),
        initialGet = types.indexOf(TokenTypes.get),
        initialCount = types.indexOf(TokenTypes.count),
        initial = initialGet === -1 ? initialCount : initialGet,
        firstIn = types.indexOf(TokenTypes.include, initial),
        firstIdentifier = types.indexOf(TokenTypes.identifier),
        mustBeBefore = firstIdentifier === -1 ? types.length : firstIdentifier;
    if (tokens.length < 2 ||
        (firstIn === -1 || firstIn > mustBeBefore)) {
        throw syntaxError("'GET WHERE' / 'COUNT WHERE' requires at least initial 'IN'");
    }
}

function shouldHaveSomeSegmentId(tokens: IToken[]) {
    const pos = tokens.findIndex(o => o.type === TokenTypes.identifier);
    if (pos < 0) {
        throw syntaxError("no segment id specified (must be single- or double-quoted)");
    }
}

function shouldNotRunTokens(tokens: IToken[], op1: TokenTypes, op2: TokenTypes) {
    const translations: { [index: number]: string } = {
        [TokenTypes.negate]: "not",
        [TokenTypes.exclude]: "not in"
    };

    tokens.reduce((acc, cur) => {
        if (acc.type === op1 && cur.type === op2) {
            throw syntaxError([
                    `May not run ${translations[acc.type] || TokenTypes[acc.type]}`,
                    ` into ${translations[cur.type] || TokenTypes[cur.type]}`
                ].join(""),
                acc.line, acc.char);
        }
        return cur;
    });
}

function shouldNotRun(t1: TokenTypes, t2: TokenTypes): TokenCollectionValidator {
    return (tokens) => {
        shouldNotRunTokens(tokens, t1, t2);
    };
}

function shouldNotStartNegated(tokens: IToken[]) {
    const
        firstInclude = tokens.findIndex(o => o.type === TokenTypes.include),
        firstExclude = tokens.findIndex(o => o.type === TokenTypes.exclude);
    if (firstExclude > -1 && (firstInclude === -1 || firstInclude > firstExclude)) {
        throw syntaxError(
            "may not start query with 'not in': result set is infinite",
            tokens[firstExclude].line, tokens[firstExclude].char
        );
    }
}

export function validate(tokens: IToken[]) {
    // must be defined here otherwise TokenTypes may not be
    //  defined at compile time
    const validators: TokenCollectionValidator[] = [
        shouldNotBeEmpty,
        shouldStartWithGetOrCount,
        shouldNotStartNegated,
        shouldHaveInitialIn,
        shouldHaveSomeSegmentId,
        shouldNotRun(TokenTypes.and, TokenTypes.and),
        shouldNotRun(TokenTypes.or, TokenTypes.or),
        shouldNotRun(TokenTypes.and, TokenTypes.or),
        shouldNotRun(TokenTypes.or, TokenTypes.and),
        shouldNotRun(TokenTypes.negate, TokenTypes.exclude),
        shouldNotRun(TokenTypes.exclude, TokenTypes.negate)
    ];

    const error = validators.reduce((acc: undefined | Error, cur: TokenCollectionValidator) => {
        try {
            return acc || cur(tokens);
        } catch (e) {
            return e;
        }
    }, undefined);
    if (error) {
        throw error;
    }
}
