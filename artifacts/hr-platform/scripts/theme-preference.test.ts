import * as assert from "node:assert/strict";

import {
  getNextThemePreference,
  getStoredThemePreference,
  isThemePreference,
  resolveThemePreference,
} from "../src/lib/theme-preference";

function storageReturning(value: string | null): Pick<Storage, "getItem"> {
  return {
    getItem: () => value,
  };
}

assert.equal(isThemePreference("light"), true);
assert.equal(isThemePreference("dark"), true);
assert.equal(isThemePreference("system"), true);
assert.equal(isThemePreference("sepia"), false);

assert.equal(getStoredThemePreference(storageReturning(null)), "system");
assert.equal(getStoredThemePreference(storageReturning("light")), "light");
assert.equal(getStoredThemePreference(storageReturning("dark")), "dark");
assert.equal(getStoredThemePreference(storageReturning("system")), "system");
assert.equal(getStoredThemePreference(storageReturning("sepia")), "system");

assert.equal(resolveThemePreference("system", true), "dark");
assert.equal(resolveThemePreference("system", false), "light");
assert.equal(resolveThemePreference("dark", false), "dark");
assert.equal(resolveThemePreference("light", true), "light");

assert.equal(getNextThemePreference("system"), "light");
assert.equal(getNextThemePreference("light"), "dark");
assert.equal(getNextThemePreference("dark"), "system");
