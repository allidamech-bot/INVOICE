import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(path,'utf8');

test('Operations current metric markup has a matching visual owner',async()=>{
  const component=await read('src/components/OperationsPage.tsx');
  const css=await read('src/styles/tailadmin-operations-v320.css');
  assert.match(component,/className="ta-ops-metrics"/);
  assert.match(css,/\.ta-ops-metrics/);
  assert.match(css,/\.ta-ops-metric-icon/);
  assert.match(css,/:is\(\.ta-ops-metrics,\.ta-ops-summary\)>div/);
});

test('Operations current editor and panel classes are styled',async()=>{
  const component=await read('src/components/OperationsPage.tsx');
  const css=await read('src/styles/tailadmin-operations-v320.css');
  for(const className of ['ta-ops-editor','ta-ops-editor-head','ta-ops-panel-head']){
    assert.ok(component.includes(className),`component missing ${className}`);
    assert.ok(css.includes(`.${className}`),`visual owner missing ${className}`);
  }
});

test('mobile business workspaces retain the 44px touch floor',async()=>{
  const css=await read('src/styles/tailadmin-design-mobile-priority-v323.css');
  for(const selector of ['ta-customers-search button','ta-customer-row-actions button','ta-product-search button','ta-product-row-menu-wrap>button','ta-ops-row-actions>button','ta-report-presets>button','ta-search-clear']){
    assert.ok(css.includes(selector),`missing mobile touch selector ${selector}`);
  }
  assert.match(css,/\.ta-customers-search button\{width:44px!important;height:44px!important/);
  assert.match(css,/\.ta-product-search button\{width:44px!important;height:44px!important/);
  assert.match(css,/\.ta-search-clear\{width:44px!important;height:44px!important/);
});

test('phone overview grids stay compact without collapsing information',async()=>{
  const css=await read('src/styles/tailadmin-design-mobile-priority-v323.css');
  assert.match(css,/\.ta-customers-summary\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(css,/\.ta-products-overview\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/\.ta-product-metrics\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/\.ta-finance-kpi-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
});
