# Segmenta: a segments api using Redis for storage

## What does it do?

Provides a mechanism for storing and retrieving sets of numbers quickly as well
as performing operations with those sets. Currently (sort-of) supported are:
- `and`: produce the set C of numbers which are in both A and B
    - [ 1, 2, 3 ] and [ 2, 3, 4 ] = [ 2, 3 ]
- `or`: produce the set C of numbers which are in either A or B
    - [ 1, 2, 3 ] or  [ 2, 3, 4 ] = [ 1, 2, 3, 4 ]
- `not`: produce the set C of numbers which are in A excluding those in B
    - [ 1, 2, 3 ] not [ 2, 3, 4 ] = [ 1 ]
  
## How to use?

1. `import` or `require` _segmenta_
    - the only export of the library is the Segmenta class
2. create an instance with options, if required:
    - `const segmenta = new Segmenta()`
    - `const segmenta = new Segmenta(options)`
        - options have the structure:
            ```typescript
            {
              redisOptions?: RedisOptions,
              segmentsPrefix?: string,
              bucketSize?: number,
              resultsTTL?: number,
            }
            ```
            where:
            - `RedisOptions` are the options which would be passed to `ioredis` to initialize (eg `host`, `port`, etc)
            - `segmentsPrefix` is a prefix to apply to all segments keys (defaults to "segments")
            - `bucketSize` is the max size to use when creating buckets (defaults to 50kb)
            - `resultsTTL` is the time you'd like result snapshots to live for when not explicitly released (defaults to 1 day)
3. Populating data
    - `add` adds ids to the segment
        ```javascript
        await segmenta.add("my-segment", [ 1, 2, 3 ]);
        // my-segment now contains [ 1, 2, 3 ]
        ```
    - `del` deletes ids from the segment
        ```javascript
        await segmenta.del("my-segment", [ 2, 3 ]);
        // my-segment now contains just [ 1 ]
        ```
    - `put` takes a sequence of add / del commands and performs them in order (useful for batching streaming data)
        ```javascript
        await segmenta.put("my-segment", [
          { add: 5 },
          { del: 1 },
          { add: 4 },
          { del: 5 },
          { add: 1 }
        ]);
        // my-segment now contains [ 1, 4 ]
        ```
4. Query
    - results are returned as an object with the shape:
        ```typescript
        {
          ids: number[],
          skipped: number,
          count: number,
          resultSetId: string, // used to re-query against snapshot
          total: number
        }
        ```
    - at the moment, only simple queries are supported (entire segments). The client can perform
    `and`, `or`, and `not` operations for now. A DSL is coming.
        1. Simple query, all results returned:
        ```javascript
        await segmenta.add("my-new-segment", [ 10, 20, 30 ]);
        const result = await segmenta.query("my-new-segment");
        /* result looks like:
        {
          ids: [ 10, 20, 30 ],
          skipped: 0,
          count: 3,
          resultSetId: "4deee554-da28-4029-8231-98060fa014dc",
          total: 3
        }
        */
        ```
        2. Paged query:
        ```javascript
        await segmenta.add("paged-results-segment", [ 1, 2, 3, 4, 5 ]);
        const result1 = await segmenta.query({
          query: "paged-results-segment",
          skip: 0,
          take: 2
        });
        /* result1 looks like:
        {
          ids: [ 1, 2 ],
          skipped: 0,
          count: 2,
          resultSetId: "63c6a1f0-8aec-4249-9d80-63c5de13b942",
          total: 5
        }
        */
        // the rest of the results can be obtained with:
        const result2 = await segmenta.query({
          query: "63c6a1f0-8aec-4249-9d80-63c5de13b942",
          skip: 2
        });
        ```
        3. Paged results are snapshot and can be re-queried by using their id (uuid). Snapshots automatically expire
            after 24 hours (or the number of seconds specified by `resultsTTL` in your constructor arguments. You may
            manually dispose of results when you no longer need them:
        ```
        const result = await segmenta.query({ query: "my-set", skip: 0, take: 10 });
        await segmenta.dispose(result.resultSetId);
        ```
        _Snapshots are **only** created when queries are performed with a positive integer `skip` or `take` value_
    - until a query DSL is in place, the consumer can _technically_ do the following to work with logical operators:
        ```
        await segmenta.add("set1", [ 1, 2 ]);
        await segmenta.add("set2", [ 3, 4, 5 ]);
        await segmenta.add("set3", [ 2, 3, 5, 6, 7 ]);
        await segmenta.add("set4", [ 5, 6 ]);
        // ... some time later ...
        const set1 = await segmenta.getBuffer("set1");
        const set2 = await segmenta.getBuffer("set2");
        const set3 = await segmenta.getBuffer("set3");
        const set4 = await segmenta.getBuffer("set4");
        const final = set1          // [ 1, 2 ]
                        .or(set2)   // [ 1, 2, 3, 4, 5 ]
                        .and(set3)  // [ 2, 3, 5 ]
                        .not(set4)  // [ 2, 3 ]
                        .getOnBitPositions(); // returns the numeric array for bit positions
        ```
        These operations are fast, acting on bitfields in memory.
