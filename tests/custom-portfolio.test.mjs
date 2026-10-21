import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

test("custom portfolio is first, supports typed skills, and has a ₦3,500 base price", () => {
  const page = read("src/pages/CreatePortfolio.tsx");
  const customCard = page.indexOf('key="custom-portfolio"');
  const pairedCards = page.indexOf("{PAIRED_CATEGORIES.map");

  assert.notEqual(customCard, -1);
  assert.ok(customCard < pairedCards, "custom offer should be first in the selector");
  assert.match(page, /Add your own skill/);
  assert.match(page, /customSkillNames/);
  assert.match(page, /selectedCategories\.length >= 4/);
  assert.match(page, /price: 3500/);
});

test("custom portfolio price, category limit, and debit are enforced by the server RPC", () => {
  const api = read("api/_walletCommerce.js");
  const migration = read("supabase/migrations/20261020110000_custom_portfolio_package_v1.sql");

  assert.match(api, /normalizeCustomPortfolioSkills/);
  assert.match(api, /customSkillNames/);
  assert.match(api, /customPortfolio \? "purchase_custom_portfolio_wallet_v1"/);
  assert.match(migration, /values \('custom_portfolio', 'Custom Portfolio', 3500, true\)/);
  assert.match(migration, /'custom_portfolio' = any\(p_categories\)/);
  assert.match(migration, /from public\.profiles where clerk_id = p_actor_user_id for update/);
  assert.match(migration, /update public\.profiles set balance = v_balance_after/);
  assert.match(migration, /wallet_operation_idempotency_v2/);
  assert.match(migration, /grant execute on function public\.purchase_custom_portfolio_wallet_v1[\s\S]*to service_role/);
});

test("public portfolio rendering opts into a dark theme independent of the site theme", () => {
  const page = read("src/pages/PublicPortfolio.tsx");
  const themes = read("src/utils/verification.ts");
  assert.match(page, /id="vp-root"[\s\S]{0,100}className="dark"[\s\S]{0,100}colorScheme: "dark"/);
  assert.match(themes, /noir_editorial: \{ name: "Noir Editorial"/);
  assert.match(themes, /electric_blue: \{ name: "Electric Blue"/);
  assert.match(themes, /rose_studio: \{ name: "Rose Studio"/);
  assert.match(themes, /solar_flare: \{ name: "Solar Flare"/);
  assert.match(themes, /midnight_chrome: \{ name: "Midnight Chrome"/);
  assert.doesNotMatch(themes, /bg: "#fff(?:fff)?"/i);
});
