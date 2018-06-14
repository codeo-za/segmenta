<a name="1.0.24"></a>
### 1.0.24 (2018-06-14)


<a name="1.0.23"></a>
### 1.0.23 (2018-06-14)


#### Features

* add debug logging (set DEBUG=segmenta:*) perf: use custom mget to get multiple b ([c9137ef8](git+https://github.com/codeo-za/segmenta.git/commit/c9137ef8))


<a name="1.0.22"></a>
### 1.0.22 (2018-06-13)


#### Bug Fixes

* total produced from query should reflect total in query without any paging / min ([217a780a](git+https://github.com/codeo-za/segmenta.git/commit/217a780a))


<a name="1.0.21"></a>
### 1.0.21 (2018-06-08)


#### Bug Fixes

* @types/ioredis should be a dev-dependency ([e3e10350](git+https://github.com/codeo-za/segmenta.git/commit/e3e10350))


<a name="1.0.20"></a>
### 1.0.20 (2018-06-08)


<a name="1.0.19"></a>
### 1.0.19 (2018-06-08)


#### Features

* add ability to query which segments exist under a given prefix ([1fd376d4](git+https://github.com/codeo-za/segmenta.git/commit/1fd376d4))
* add coverage reporting task (<3 jest <3) ([985995b0](git+https://github.com/codeo-za/segmenta.git/commit/985995b0))


<a name="1.0.18"></a>
### 1.0.18 (2018-06-05)


#### Features

* allow skip and take via natural language dsl feat: allow min / max via query opt ([88caa9d5](git+https://github.com/codeo-za/segmenta.git/commit/88caa9d5))


<a name="1.0.17"></a>
### 1.0.17 (2018-06-04)


#### Features

* add min/max syntax; does not affect resultset caching ([42b3b6e0](git+https://github.com/codeo-za/segmenta.git/commit/42b3b6e0))


<a name="1.0.16"></a>
### 1.0.16 (2018-06-01)


#### Bug Fixes

* pages 2+ of resultsets should include the correct resultSetId & subsequent page  ([dce3c324](git+https://github.com/codeo-za/segmenta.git/commit/dce3c324))


<a name="1.0.15"></a>
### 1.0.15 (2018-06-01)


#### Features

* add explicit paged property for results ([1c929b24](git+https://github.com/codeo-za/segmenta.git/commit/1c929b24))


<a name="1.0.14"></a>
### 1.0.14 (2018-06-01)


#### Bug Fixes

* include take in all results ([97d32285](git+https://github.com/codeo-za/segmenta.git/commit/97d32285))


<a name="1.0.13"></a>
### 1.0.13 (2018-06-01)


#### Bug Fixes

* should not erroneously categorise query against segment with uuid in the name as ([3b7a5eee](git+https://github.com/codeo-za/segmenta.git/commit/3b7a5eee))


<a name="1.0.12"></a>
### 1.0.12 (2018-05-31)


#### Bug Fixes

* should not throw when asked to dispose a non-existent result-set ([98d31864](git+https://github.com/codeo-za/segmenta.git/commit/98d31864))


<a name="1.0.11"></a>
### 1.0.11 (2018-05-31)


#### Bug Fixes

* invalid dsl query should throw ([e24a022b](git+https://github.com/codeo-za/segmenta.git/commit/e24a022b))


<a name="1.0.10"></a>
### 1.0.10 (2018-05-28)


#### Features

* more validation on queries for clearer error reporting & non-silly results ([af934a18](git+https://github.com/codeo-za/segmenta.git/commit/af934a18))


<a name="1.0.9"></a>
### 1.0.9 (2018-05-28)


<a name="1.0.8"></a>
### 1.0.8 (2018-05-28)


#### Bug Fixes

* bad version value for lodash dependency ([c261ce76](git+https://github.com/codeo-za/segmenta.git/commit/c261ce76))


<a name="1.0.7"></a>
### 1.0.7 (2018-05-28)


<a name="1.0.6"></a>
### 1.0.6 (2018-05-25)


#### Features

* basic DSL is in place! ([00854ac9](git+https://github.com/codeo-za/segmenta.git/commit/00854ac9))


<a name="1.0.5"></a>
### 1.0.5 (2018-05-23)


<a name="1.0.4"></a>
### 1.0.4 (2018-05-23)


#### Bug Fixes

* should depend (not dev-depend) on ioredis ([147598f4](git+https://github.com/codeo-za/segmenta.git/commit/147598f4))


<a name="1.0.3"></a>
### 1.0.3 (2018-05-23)


<a name="1.0.2"></a>
### 1.0.2 (2018-05-23)


#### Features

* guard against put operations having both add and del doc: update doc about manua ([3ebd15b0](git+https://github.com/codeo-za/segmenta.git/commit/3ebd15b0))


<a name="1.0.1"></a>
### 1.0.1 (2018-05-22)


#### Bug Fixes

* only snapshot when the caller specifies paging information (skip /         take) ([9fa32e2a](git+https://github.com/codeo-za/segmenta.git/commit/9fa32e2a))
* exporting in the least unexpected way for a node consumer ([cedd2225](git+https://github.com/codeo-za/segmenta.git/commit/cedd2225))


#### Features

* implement `.not()` for SparseBuffers, aimed at the         id array generation,  ([9a243fe7](git+https://github.com/codeo-za/segmenta.git/commit/9a243fe7))
* allow simple queries with only the segment name refactor: get => query chore: mo ([72434d34](git+https://github.com/codeo-za/segmenta.git/commit/72434d34))
* consumer can actively dispose of a resultset by id wip: build with gulp to get n ([0c8970be](git+https://github.com/codeo-za/segmenta.git/commit/0c8970be))


1.0.0
- Initial release
