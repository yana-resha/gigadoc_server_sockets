const HEART_PARAMETER_KEYS = [
  "cardiac_age",
  "fatigue",
  "wellness_score",
  "stress",
  "heart_rate",
  "upper_ap",
  "saturation",
  "respiratory",
  "sdnn",
  "rmssd",
  "rigidity",
  "cardiac_risk",
  "atherosclerosis_risk",
  "ag_risk",
  "hypoxia_risk",
  "anemia_risk",
];
const HEART_SOURCE_KEYS = [...HEART_PARAMETER_KEYS, "lower_ap"];

const SKIN_PARAMETER_KEYS = [
  "oily_shine",
  "skin_uniformity",
  "pores",
  "wrinkles",
  "dark_circles",
  "scars",
  "redness",
  "comedons",
  "dehydration",
  "elasticity",
  "dullness",
];

const VISION_PARAMETER_KEYS = [
  "near_vision",
  "color_sensitivity",
  "central_retina",
];

const SKIN_PHOTO_URL =
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80";

const numeric = (value, status, from = 0, normalFrom = 40, normalTo = 70, to = 100) => ({
  value,
  status,
  step_values: [
    { from, to: normalFrom, status: "deviation" },
    { from: normalFrom, to: normalTo, status: "normal" },
    { from: normalTo, to, status: "deviation" },
  ],
});

const skin = (value, status) => ({
  ...numeric(value, status),
  photo: SKIN_PHOTO_URL,
});

const PARAMS_FIXTURE = {
  cardiac_age: numeric(46, "deviation", 18, 25, 40, 80),
  fatigue: numeric(3, "normal", 0, 0, 4, 10),
  wellness_score: { value: 82, status: "normal", step_values: [] },
  stress: numeric(72, "deviation"),
  heart_rate: numeric(68, "normal", 40, 60, 80, 140),
  upper_ap: numeric(138, "deviation", 80, 100, 130, 200),
  lower_ap: numeric(88, "normal", 45, 60, 85, 130),
  saturation: numeric(98, "normal", 80, 95, 100, 100),
  respiratory: numeric(17, "normal", 8, 12, 20, 35),
  sdnn: numeric(52, "normal", 0, 40, 80, 120),
  rmssd: numeric(24, "deviation", 0, 25, 65, 100),
  rigidity: numeric(7.8, "normal", 0, 5, 10, 20),
  cardiac_risk: numeric(18, "normal", 0, 0, 25, 100),
  atherosclerosis_risk: numeric(41, "deviation"),
  ag_risk: numeric(22, "normal"),
  hypoxia_risk: numeric(12, "normal"),
  anemia_risk: numeric(36, "deviation"),

  oily_shine: skin(63, "normal"),
  skin_uniformity: skin(31, "deviation"),
  pores: skin(78, "deviation"),
  wrinkles: skin(54, "normal"),
  dark_circles: skin(74, "deviation"),
  scars: skin(22, "deviation"),
  redness: skin(48, "normal"),
  comedons: skin(67, "normal"),
  dehydration: skin(29, "deviation"),
  elasticity: skin(58, "normal"),
  dullness: skin(45, "normal"),

  near_vision: numeric(90, "normal", 0, 80, 100, 100),
  color_sensitivity: numeric(67, "deviation"),
  central_retina: numeric(94, "normal", 0, 85, 100, 100),
};

const PARAMETER_KEYS_BY_MEASUREMENT = {
  skin: SKIN_PARAMETER_KEYS,
  heart_and_vessels: HEART_SOURCE_KEYS,
  vision: VISION_PARAMETER_KEYS,
};

const cloneParam = (param) => ({
  ...param,
  step_values: param.step_values.map((step) => ({ ...step })),
});

const buildParamsFixture = (measurements = Object.keys(PARAMETER_KEYS_BY_MEASUREMENT)) =>
  measurements.reduce((params, measurement) => {
    const keys = PARAMETER_KEYS_BY_MEASUREMENT[measurement] ?? [];

    keys.forEach((key) => {
      params[key] = cloneParam(PARAMS_FIXTURE[key]);
    });

    return params;
  }, {});

const countDeviations = (measurement) =>
  (PARAMETER_KEYS_BY_MEASUREMENT[measurement] ?? []).filter(
    (key) => PARAMS_FIXTURE[key].status !== "normal",
  ).length;

module.exports = {
  HEART_PARAMETER_KEYS,
  HEART_SOURCE_KEYS,
  PARAMETER_KEYS_BY_MEASUREMENT,
  PARAMS_FIXTURE,
  SKIN_PARAMETER_KEYS,
  VISION_PARAMETER_KEYS,
  buildParamsFixture,
  countDeviations,
};
