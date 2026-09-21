const { buildParamsFixture, countDeviations } = require("../fixtures/params");

const MEASUREMENT_PLAN = ["skin", "heart_and_vessels", "vision"];

const BLACK_SQUARE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#000"/></svg>';

const ok = (sessionId, type, payload = {}) => ({
  status: "ok",
  type,
  session_id: sessionId,
  ...payload,
});

const fail = (sessionId, errorCode, errorText) => ({
  status: "fail",
  type: "mock_user_intent",
  session_id: sessionId,
  error_code: errorCode,
  error_text: errorText,
});

const buildTechMessage = (sessionId, overrides = {}) =>
  ok(sessionId, "tech", {
    face_in_area: false,
    mic_on: false,
    mic_in_progress: false,
    i_am_thinking: false,
    ...overrides,
  });

const buildMeasurementResults = (completedMeasurements) =>
  MEASUREMENT_PLAN.map((type) => ({
    type,
    completed: completedMeasurements.includes(type),
  }));

const buildResultsIntro = (completedMeasurements) =>
  MEASUREMENT_PLAN.map((type) => {
    const completed = completedMeasurements.includes(type);

    return {
      type,
      completed,
      deviations_count: completed ? countDeviations(type) : 0,
    };
  });

const buildParamsMessage = (sessionId, completedMeasurements) =>
  ok(sessionId, "params", buildParamsFixture(completedMeasurements));

module.exports = {
  BLACK_SQUARE_SVG,
  MEASUREMENT_PLAN,
  buildMeasurementResults,
  buildParamsMessage,
  buildResultsIntro,
  buildTechMessage,
  fail,
  ok,
};
