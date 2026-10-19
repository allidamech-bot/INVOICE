import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvedAppearanceTokens} from '../dist/src/lib/appearance.js';

test('Minimal manual ink is checked against its actual alternating row and preferences stay unchanged',()=>{
  const appearance={templateId:'minimal',paletteMode:'custom',primaryTextColor:'#767676',secondaryTextColor:'#767676',headingTextColor:'#767676'};
  const saved=JSON.stringify(appearance),tokens=resolvedAppearanceTokens(appearance);
  assert.equal(tokens.rowSurface,'#f5f6f8');
  assert.notEqual(tokens.primary,'#767676','white-only contrast validation misses the gray row');
  assert.notEqual(tokens.secondary,'#767676');
  assert.equal(JSON.stringify(appearance),saved);
});
