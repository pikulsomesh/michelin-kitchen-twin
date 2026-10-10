// Bundles the /data JSON for the browser, in the same shape scripts/load-data.mjs gives Node.
import sources from '../data/sources.json';
import restaurant from '../data/restaurant.json';
import items from '../data/items.json';
import products from '../data/products.json';
import resources from '../data/resources.json';
import menu from '../data/menu.json';
import service from '../data/service.json';
import layout from '../data/layout.json';

export const data = { sources, restaurant, items, products, resources, menu, service, layout };
