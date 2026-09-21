const assert = require("node:assert/strict");
const test = require("node:test");

const {
  HEART_PARAMETER_KEYS,
  HEART_SOURCE_KEYS,
  PARAMS_FIXTURE,
  SKIN_PARAMETER_KEYS,
  VISION_PARAMETER_KEYS,
  buildParamsFixture,
} = require("../fixtures/params");

test("fixture точно совпадает по количеству ключей UI registry", () => {
  assert.equal(HEART_PARAMETER_KEYS.length, 16);
  assert.equal(HEART_SOURCE_KEYS.length, 17);
  assert.equal(SKIN_PARAMETER_KEYS.length, 11);
  assert.deepEqual(VISION_PARAMETER_KEYS, [
    "near_vision",
    "color_sensitivity",
    "central_retina",
  ]);
  assert.equal(Object.keys(PARAMS_FIXTURE).length, 31);
  assert.deepEqual(
    new Set(Object.keys(PARAMS_FIXTURE)),
    new Set([
      ...HEART_SOURCE_KEYS,
      ...SKIN_PARAMETER_KEYS,
      ...VISION_PARAMETER_KEYS,
    ]),
  );
});

test("fixture содержит нормы, отклонения и корректные step_values", () => {
  const params = Object.values(PARAMS_FIXTURE);
  const statuses = new Set(params.map(({ status }) => status));

  assert.equal(statuses.has("normal"), true);
  assert.equal(statuses.has("deviation"), true);
  assert.equal(
    params.every(
      ({ step_values: steps }) =>
        Array.isArray(steps) &&
        steps.every(
          ({ from, to, status }) =>
            Number.isFinite(from) &&
            Number.isFinite(to) &&
            ["normal", "deviation"].includes(status),
        ),
    ),
    true,
  );
});

test("buildParamsFixture отдаёт только накопленные категории и новые объекты", () => {
  const skin = buildParamsFixture(["skin"]);
  const skinAgain = buildParamsFixture(["skin"]);

  assert.deepEqual(Object.keys(skin), SKIN_PARAMETER_KEYS);
  assert.notStrictEqual(skin.oily_shine, skinAgain.oily_shine);
  assert.notStrictEqual(
    skin.oily_shine.step_values,
    skinAgain.oily_shine.step_values,
  );
});
