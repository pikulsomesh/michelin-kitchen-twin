// Loads every JSON file in /data for the Node scripts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = (name) => JSON.parse(readFileSync(join(dataDir, `${name}.json`), 'utf8'));

export function loadData() {
  return {
    sources: read('sources'),
    restaurant: read('restaurant'),
    items: read('items'),
    products: read('products'),
    resources: read('resources'),
    menu: read('menu'),
    service: read('service'),
    layout: read('layout'),
  };
}
