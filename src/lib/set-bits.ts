import { Redis } from "ioredis";
export async function setup(redis: Redis) {
  const luaScript = `
local key = nil
local offset = nil
local segmentKeyCount = 1
local segmentKeys = {}
for k, val in ipairs(ARGV) do
    local number = tonumber(val)
    if number == nil then
        if not (val == key) then
            segmentKeys[segmentKeyCount] = val
            segmentKeyCount = segmentKeyCount + 1
        end
        key = val
    else
        if offset == nil then
            offset = number
        else
            redis.call("setbit", key, offset, number)
            offset = nil
        end
    end
end

for k, val in ipairs(segmentKeys) do
    local indexKey = string.format("%s/%s", val:gsub("%/[0-9]+[-][0-9]+$", ""), "index")
    redis.call("sadd", indexKey, val);
end
  `;
  await redis.defineCommand("setbits", {
    numberOfKeys: 0,
    lua: luaScript
  });
}
