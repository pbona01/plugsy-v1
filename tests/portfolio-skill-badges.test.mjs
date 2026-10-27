import assert from "node:assert/strict";
import test from "node:test";
import {
  isCustomPortfolioRecord,
  getPortfolioSkillValues,
  validateCustomPortfolioSkills,
} from "../shared/portfolioExtraCategory.js";

test("an unconfigured custom portfolio does not expose its package identifier as a skill", () => {
  assert.deepEqual(getPortfolioSkillValues({ category: "custom_portfolio", categories: [] }), []);
  assert.deepEqual(getPortfolioSkillValues({ category: "Custom Portfolio", categories: null }), []);
  assert.deepEqual(getPortfolioSkillValues({ category: "custom_portfolio", categories: ["custom_portfolio"] }), []);
});

test("custom skills can be changed or left empty, with a strict four-skill limit", () => {
  assert.deepEqual(validateCustomPortfolioSkills([]), []);
  assert.deepEqual(
    validateCustomPortfolioSkills([" Barber ", "Programmer", "Dancer", "Graphic Designer"]),
    ["Barber", "Programmer", "Dancer", "Graphic Designer"],
  );
  assert.throws(() => validateCustomPortfolioSkills(["One", "Two", "Three", "Four", "Five"]));
  assert.throws(() => validateCustomPortfolioSkills(["Barber", " barber "]));
  assert.throws(() => validateCustomPortfolioSkills(["custom_portfolio"]));
  assert.throws(() => validateCustomPortfolioSkills(["<script>"]));
});

test("legacy custom portfolios with manually entered skills remain editable", () => {
  assert.equal(isCustomPortfolioRecord({ category: "custom_portfolio", categories: [] }), true);
  assert.equal(isCustomPortfolioRecord({ category: "Barber", categories: ["Barber", "Programmer", "Dancer"] }), true);
  assert.equal(isCustomPortfolioRecord({ category: "graphic_design", categories: ["graphic_design"] }), false);
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
