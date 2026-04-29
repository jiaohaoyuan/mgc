const { readDb } = require('./localDb');
const { validateSkuCode } = require('./skuRules');
const { DAIRY_CATEGORY_DEFINITIONS, LEGACY_CATEGORY_CODES } = require('./dairyCategoryCatalog');

const db = readDb();
const failures = [];

const rows = (value) => (Array.isArray(value) ? value : []);
const active = (row) => Number(row.status ?? 1) !== 0;
const codeOf = (row, key) => String(row?.[key] || '').trim();
const byCode = (list, key) => new Map(rows(list).map((row) => [codeOf(row, key), row]));
const fail = (message) => failures.push(message);

const categoryRows = rows(db.master?.category).filter(active);
const categoryByCode = byCode(categoryRows, 'category_code');
const skuRows = rows(db.master?.sku).filter(active);
const spuRows = rows(db.master?.spu).filter(active);
const warehouseRows = rows(db.master?.warehouse).filter(active);
const categoryCodes = new Set(categoryRows.map((row) => codeOf(row, 'category_code')));
const skuCodes = new Set(skuRows.map((row) => codeOf(row, 'sku_code')));

const expectedCategories = DAIRY_CATEGORY_DEFINITIONS.map(([code, name, level, parentCode]) => [code, name, level, parentCode]);

expectedCategories.forEach(([code, name, level, parentCode]) => {
  const row = categoryByCode.get(code);
  if (!row) {
    fail(`Missing active category ${code} (${name})`);
    return;
  }
  if (row.category_name !== name) fail(`${code} name should be ${name}, got ${row.category_name}`);
  if (Number(row.level) !== level) fail(`${code} level should be ${level}, got ${row.level}`);
  if ((row.parent_code || null) !== parentCode) fail(`${code} parent should be ${parentCode || 'null'}, got ${row.parent_code || 'null'}`);
});

[...LEGACY_CATEGORY_CODES].forEach((code) => {
  const row = categoryByCode.get(code);
  if (row) fail(`Legacy category ${code} should not be active`);
});

categoryRows.forEach((row) => {
  const code = codeOf(row, 'category_code');
  const level = Number(row.level);
  if (![1, 2, 3].includes(level)) fail(`${code} has invalid level ${row.level}`);
  if (level === 1 && row.parent_code) fail(`${code} is level 1 but has parent ${row.parent_code}`);
  if (level > 1 && !categoryCodes.has(codeOf(row, 'parent_code'))) fail(`${code} parent ${row.parent_code} is missing`);
});

skuRows.forEach((row) => {
  const skuCode = codeOf(row, 'sku_code');
  const categoryCode = codeOf(row, 'category_code');
  if (!categoryCodes.has(categoryCode)) fail(`SKU ${skuCode} points to missing category ${categoryCode}`);
  const result = validateSkuCode(skuCode, rows(db.platform?.dict_items));
  if (!result.ok) fail(`SKU ${skuCode} violates standard: ${result.errors.join('; ')}`);
});

spuRows.forEach((row) => {
  const spuCode = codeOf(row, 'spu_code');
  const categoryCode = codeOf(row, 'category_code');
  const category = categoryByCode.get(categoryCode);
  if (!category) fail(`SPU ${spuCode} points to missing category ${categoryCode}`);
  if (category && row.category_name !== category.category_name) {
    fail(`SPU ${spuCode} category_name should be ${category.category_name}, got ${row.category_name}`);
  }
  if (!row.product_line) fail(`SPU ${spuCode} missing product_line`);
  if (!row.process_type) fail(`SPU ${spuCode} missing process_type`);
  if (!row.storage_type) fail(`SPU ${spuCode} missing storage_type`);
});

rows(db.master?.rltn_warehouse_sku).filter(active).forEach((row) => {
  if (!skuCodes.has(codeOf(row, 'sku_code'))) fail(`Warehouse-SKU relation points to missing SKU ${row.sku_code}`);
});

rows(db.master?.reseller_relation).filter(active).forEach((row) => {
  if (!skuCodes.has(codeOf(row, 'sku_code'))) fail(`Reseller relation points to missing SKU ${row.sku_code}`);
});

rows(db.master?.rltn_product_sku).filter(active).forEach((row) => {
  if (!skuCodes.has(codeOf(row, 'sku_code'))) fail(`Product-SKU relation points to missing SKU ${row.sku_code}`);
});

rows(db.biz?.products).filter(active).forEach((row) => {
  if (!categoryCodes.has(codeOf(row, 'category_code'))) fail(`Biz product ${row.product_code} points to missing category ${row.category_code}`);
});

rows(db.biz?.orders).forEach((row) => {
  if (!skuCodes.has(codeOf(row, 'sku_id'))) fail(`Order ${row.order_id} points to missing SKU ${row.sku_id}`);
});

rows(db.biz?.inventory_stock).forEach((row) => {
  if (!warehouseRows.some((warehouse) => codeOf(warehouse, 'warehouse_code') === codeOf(row, 'warehouse_code'))) {
    fail(`Inventory stock points to missing warehouse ${row.warehouse_code}`);
  }
  if (!skuCodes.has(codeOf(row, 'sku_code'))) fail(`Inventory stock points to missing SKU ${row.sku_code}`);
});

rows(db.biz?.warehouse_capabilities).forEach((row) => {
  rows(row.supported_skus).forEach((skuCode) => {
    if (!skuCodes.has(String(skuCode))) fail(`Warehouse capability ${row.warehouse_code} supports missing SKU ${skuCode}`);
  });
  rows(row.supported_categories).forEach((categoryCode) => {
    if (!categoryCodes.has(String(categoryCode))) fail(`Warehouse capability ${row.warehouse_code} supports missing category ${categoryCode}`);
  });
});

if (failures.length) {
  console.error(`Dairy category validation failed with ${failures.length} issue(s):`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Dairy category validation passed: ${categoryRows.length} categories, ${skuRows.length} SKUs, ${spuRows.length} SPUs.`);
