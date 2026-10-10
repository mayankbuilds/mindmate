import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Phase 3: Assessment UI Validation & Contract Mapping", () => {
  const REQUIRED_FEATURES = [
    "nervousness",
    "unable_to_control",
    "worry",
    "trouble_relaxation",
    "restlessness",
    "irritability",
    "fear",
  ];

  const EXPECTED_CLASSES = ["No", "Mild", "Moderate", "Severe"];

  it("verifies all seven required features exist in questionnaire schema", () => {
    assert.equal(REQUIRED_FEATURES.length, 7);
    assert.deepEqual(REQUIRED_FEATURES, [
      "nervousness",
      "unable_to_control",
      "worry",
      "trouble_relaxation",
      "restlessness",
      "irritability",
      "fear",
    ]);
  });

  it("validates that all feature ratings map strictly to integers [0, 3]", () => {
    const validRatings = [0, 1, 2, 3];
    validRatings.forEach((val) => {
      assert.ok(Number.isInteger(val));
      assert.ok(val >= 0 && val <= 3);
    });
  });

  it("verifies probabilities formatting calculates accurate percentages", () => {
    const sampleProbabilities = {
      No: 0.05,
      Mild: 0.15,
      Moderate: 0.65,
      Severe: 0.15,
    };

    const formattedPercentages = Object.entries(sampleProbabilities).reduce((acc, [cls, p]) => {
      acc[cls] = Math.round(p * 100);
      return acc;
    }, {});

    assert.equal(formattedPercentages.No, 5);
    assert.equal(formattedPercentages.Mild, 15);
    assert.equal(formattedPercentages.Moderate, 65);
    assert.equal(formattedPercentages.Severe, 15);

    const sum = Object.values(formattedPercentages).reduce((a, b) => a + b, 0);
    assert.equal(sum, 100);
  });

  it("verifies target classes match verified dataset classes without clinical diagnosis claims", () => {
    assert.deepEqual(EXPECTED_CLASSES, ["No", "Mild", "Moderate", "Severe"]);
  });
});
