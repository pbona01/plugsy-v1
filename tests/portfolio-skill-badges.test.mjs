import assert from "node:assert/strict";
import test from "node:test";
import { getPortfolioSkillValues } from "../shared/portfolioExtraCategory.js";

test("an unconfigured custom portfolio does not expose its package identifier as a skill", () => {
  assert.deepEqual(getPortfolioSkillValues({ category: "custom_portfolio", categories: [] }), []);
  assert.deepEqual(getPortfolioSkillValues({ category: "Custom Portfolio", categories: null }), []);
  assert.deepEqual(getPortfolioSkillValues({ category: "custom_portfolio", categories: ["custom_portfolio"] }), []);
});

test("custom skills and standard categories remain visible", () => {
  assert.deepEqual(
    getPortfolioSkillValues({ category: "custom_portfolio", categories: ["Graphic Designer", "Video Editing"] }),
    ["Graphic Designer", "Video Editing"],
  );
  assert.deepEqual(
    getPortfolioSkillValues({ category: "graphic_design", categories: [] }),
    ["graphic_design"],
  );
  assert.deepEqual(
    getPortfolioSkillValues({ category: '["video_editing","motion_graphics"]' }),
    ["video_editing", "motion_graphics"],
  );
});
