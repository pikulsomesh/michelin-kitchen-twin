// Referential-integrity checks for the data model. Returns { errors, warnings }.
import { buildIndex, EST } from './mrp.js';

export function validate(data) {
  const errors = [];
  const warnings = [];
  let index;
  try {
    index = buildIndex(data);
  } catch (e) {
    return { errors: [e.message], warnings };
  }
  const { sources, items, products, workCenters, equipment, roles, storage } = index;

  const ids = [...items.keys(), ...products.keys()];
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) errors.push(`Duplicate item ids: ${dupes.join(', ')}`);

  const checkSrc = (where, src) => {
    if (!Array.isArray(src) || src.length === 0) { errors.push(`${where}: missing src`); return; }
    for (const s of src) if (s !== EST && !sources.has(s)) errors.push(`${where}: unknown source "${s}"`);
  };

  for (const it of items.values()) {
    checkSrc(`item ${it.id}`, it.src);
    if (!['g', 'ea'].includes(it.uom)) errors.push(`item ${it.id}: uom must be g or ea`);
    if (!(it.yieldPct > 0 && it.yieldPct <= 1)) errors.push(`item ${it.id}: yieldPct must be in (0, 1]`);
    if (!storage.has(it.storage)) errors.push(`item ${it.id}: unknown storage ${it.storage}`);
  }

  const used = new Set();
  for (const p of products.values()) {
    checkSrc(`product ${p.id}`, p.src);
    if (!(p.batchYield > 0)) errors.push(`product ${p.id}: batchYield must be > 0`);
    if (p.storage && !storage.has(p.storage)) errors.push(`product ${p.id}: unknown storage ${p.storage}`);
    if (!p.bom.length) errors.push(`product ${p.id}: empty BOM`);
    for (const c of p.bom) {
      used.add(c.item);
      if (!items.has(c.item) && !products.has(c.item)) errors.push(`product ${p.id}: BOM references unknown item ${c.item}`);
      if (!(c.qty > 0)) errors.push(`product ${p.id}: BOM qty for ${c.item} must be > 0`);
    }
    if (!p.routing.length) errors.push(`product ${p.id}: empty routing`);
    for (const op of p.routing) {
      const where = `product ${p.id} op ${op.seq}`;
      if (!workCenters.has(op.workCenter)) errors.push(`${where}: unknown work center ${op.workCenter}`);
      if (op.equipment && !equipment.has(op.equipment)) errors.push(`${where}: unknown equipment ${op.equipment}`);
      if (op.role && !roles.has(op.role)) errors.push(`${where}: unknown role ${op.role}`);
      if (!op.wait && !op.role) errors.push(`${where}: active operation needs a role`);
      if (!['unit', 'batch'].includes(op.per)) errors.push(`${where}: per must be unit or batch`);
      if (op.src) checkSrc(where, op.src);
    }
  }
  for (const it of items.values()) if (!used.has(it.id)) warnings.push(`item ${it.id} is not used by any BOM`);
  for (const p of products.values()) if (p.type === 'intermediate' && !used.has(p.id)) warnings.push(`intermediate ${p.id} is not used by any BOM`);

  const menu = data.menu;
  checkSrc('menu price', menu.priceUSD.src);
  const onMenu = new Set();
  for (const c of menu.courses) {
    checkSrc(`course ${c.id}`, c.src);
    if (!workCenters.has(c.fireStation)) errors.push(`course ${c.id}: unknown fire station ${c.fireStation}`);
    const share = c.options.reduce((s, o) => s + o.share, 0);
    if (Math.abs(share - 1) > 1e-9) errors.push(`course ${c.id}: option shares sum to ${share}, expected 1`);
    for (const o of [...c.options, ...(c.supplements ?? []), ...(c.includes ?? [])]) {
      const p = products.get(o.product);
      if (!p) errors.push(`course ${c.id}: unknown product ${o.product}`);
      else if (p.type !== 'finished') errors.push(`course ${c.id}: ${o.product} is not a finished product`);
      onMenu.add(o.product);
    }
  }
  for (const p of products.values()) if (p.type === 'finished' && !onMenu.has(p.id)) warnings.push(`finished ${p.id} is not on the menu`);

  for (const wc of workCenters.values()) {
    if (wc.src) checkSrc(`work center ${wc.id}`, wc.src);
    for (const e of wc.equipment) if (!equipment.has(e)) errors.push(`work center ${wc.id}: unknown equipment ${e}`);
    for (const r of wc.roles) if (!roles.has(r)) errors.push(`work center ${wc.id}: unknown role ${r}`);
  }
  for (const e of equipment.values()) checkSrc(`equipment ${e.id}`, e.src);

  const placed = new Set();
  for (const pl of data.layout.placements) {
    if (!equipment.has(pl.equipment)) errors.push(`layout: unknown equipment ${pl.equipment}`);
    placed.add(pl.equipment);
  }
  for (const e of equipment.values()) if (!placed.has(e.id)) warnings.push(`equipment ${e.id} has no layout placement`);
  for (const z of data.layout.zones) if (!workCenters.has(z.id)) errors.push(`layout zone: unknown work center ${z.id}`);

  return { errors, warnings };
}
