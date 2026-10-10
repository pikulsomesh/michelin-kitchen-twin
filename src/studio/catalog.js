// Seasonal catalogue for the studio: extra raw materials, prep recipes and dishes in the simulation's
// KitchenData shape (see src/sim/data/fallback.js). Dishes are written in the style of a three-star
// California kitchen; quantities and timings are engineering estimates, not any restaurant's recipes.
//
// Every dish carries studio metadata the sim ignores:
//   section   amuse | cold | warm | fish | meat | cheese | dessert | mignardise
//   seasons   seasons it is on the menu (base dishes are year-round)
//   priceUSD  à la carte price
//   eatMin    minutes a guest takes to eat it
//   signature never swapped out when the season changes

export const SEASONS = ['spring', 'summer', 'fall', 'winter'];
export const SEASON_LABEL = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' };

export const SECTIONS = {
  amuse: 'Amuse-bouche', cold: 'Cold starter', warm: 'Warm starter', fish: 'Fish', meat: 'Meat',
  cheese: 'Cheese', dessert: 'Dessert', mignardise: 'Mignardises',
};
// À la carte groups the sections into three courses every guest orders from.
export const CARTE_COURSES = [
  { id: 'c2', name: 'Starter', sections: ['cold', 'warm'], eatMin: 14 },
  { id: 'c6', name: 'Main', sections: ['fish', 'meat'], eatMin: 22 },
  { id: 'c9', name: 'Dessert', sections: ['dessert', 'cheese'], eatMin: 14 },
];

// ---------------------------------------------------------------------------------- raw materials
// cost is $/unit. `seasons` marks produce with a market season; out of season it costs more
// (imported or greenhouse) and ships short more often.
const M = (id, name, unit, storage, cost, seasons = null) => ({ id, name, unit, storage, cost, kind: 'raw', ...(seasons ? { seasons } : {}) });
export const INGREDIENTS = [
  // staples (reused when the base data already has them)
  M('butter', 'Cultured butter', 'g', 'walk-in', 0.014), M('cream', 'Heavy cream', 'ml', 'walk-in', 0.009),
  M('milk', 'Whole milk', 'ml', 'walk-in', 0.003), M('creme_fraiche', 'Crème fraîche', 'g', 'walk-in', 0.022),
  M('egg', 'Eggs', 'ea', 'walk-in', 0.4), M('egg_yolk', 'Egg yolks', 'ea', 'walk-in', 0.45),
  M('shallot', 'Shallot', 'g', 'dry', 0.005), M('chive', 'Chives', 'g', 'walk-in', 0.07),
  M('olive_oil', 'Olive oil', 'ml', 'dry', 0.014), M('sea_salt', 'Maldon salt', 'g', 'dry', 0.02),
  M('sugar', 'Sugar', 'g', 'dry', 0.002), M('flour', 'Flour', 'g', 'dry', 0.002),
  M('white_wine', 'White wine (cooking)', 'ml', 'dry', 0.012), M('microgreens', 'Microgreens', 'g', 'walk-in', 0.12),
  M('lemon', 'Lemon', 'ea', 'dry', 0.5), M('chocolate', 'Chocolate 70%', 'g', 'dry', 0.024),
  M('veal_bones', 'Veal bones', 'g', 'walk-in', 0.009), M('onion', 'Onion', 'g', 'dry', 0.003),
  M('carrot', 'Carrot', 'g', 'dry', 0.003), M('celery', 'Celery', 'g', 'walk-in', 0.004),
  M('halibut', 'Halibut fillet', 'g', 'walk-in', 0.09, ['spring', 'summer']),
  M('english_pea', 'English peas', 'g', 'walk-in', 0.022, ['spring']),
  M('black_truffle', 'Black winter truffle', 'g', 'walk-in', 2.6, ['winter']),
  M('chicken_bones', 'Chicken backs and feet', 'g', 'walk-in', 0.004),
  M('almond_flour', 'Almond flour', 'g', 'dry', 0.018), M('mint', 'Mint', 'g', 'walk-in', 0.06),
  M('basil', 'Opal and Genovese basil', 'g', 'walk-in', 0.07, ['summer']),
  M('saffron', 'Saffron', 'g', 'dry', 9.0), M('arborio', 'Carnaroli rice', 'g', 'dry', 0.009),
  M('parmesan', 'Parmigiano-Reggiano', 'g', 'walk-in', 0.04), M('hazelnut', 'Hazelnuts', 'g', 'dry', 0.03),
  // spring
  M('white_asparagus', 'White asparagus', 'g', 'walk-in', 0.03, ['spring']),
  M('morels', 'Morel mushrooms', 'g', 'walk-in', 0.11, ['spring']),
  M('fava', 'Fava beans', 'g', 'walk-in', 0.018, ['spring']),
  M('ramps', 'Ramps', 'g', 'walk-in', 0.06, ['spring']),
  M('lamb_rack', 'Spring lamb rack', 'g', 'walk-in', 0.075, ['spring']),
  M('rhubarb', 'Rhubarb', 'g', 'walk-in', 0.012, ['spring']),
  M('strawberry', 'Strawberries', 'g', 'walk-in', 0.016, ['spring', 'summer']),
  // summer
  M('heirloom_tomato', 'Heirloom tomatoes', 'g', 'walk-in', 0.012, ['summer']),
  M('burrata', 'Burrata', 'g', 'walk-in', 0.04),
  M('sweet_corn', 'Sweet corn', 'ea', 'walk-in', 0.9, ['summer']),
  M('striped_bass', 'Striped bass fillet', 'g', 'walk-in', 0.07, ['summer', 'fall']),
  M('zucchini_blossom', 'Zucchini blossoms', 'ea', 'walk-in', 1.1, ['summer']),
  M('ribeye', 'Dry-aged ribeye', 'g', 'walk-in', 0.09),
  M('romano_bean', 'Romano and wax beans', 'g', 'walk-in', 0.012, ['summer']),
  M('white_peach', 'White peaches', 'ea', 'walk-in', 1.6, ['summer']),
  M('raspberry', 'Raspberries', 'g', 'walk-in', 0.028, ['summer']),
  // fall
  M('butternut', 'Butternut squash', 'g', 'dry', 0.004, ['fall', 'winter']),
  M('chanterelle', 'Chanterelles', 'g', 'walk-in', 0.07, ['fall']),
  M('white_truffle', 'White Alba truffle', 'g', 'walk-in', 6.5, ['fall']),
  M('venison', 'Venison loin', 'g', 'walk-in', 0.08, ['fall', 'winter']),
  M('huckleberry', 'Huckleberries', 'g', 'walk-in', 0.05, ['fall']),
  M('chestnut', 'Chestnuts', 'g', 'dry', 0.03, ['fall', 'winter']),
  M('black_cod', 'Black cod fillet', 'g', 'walk-in', 0.075, ['fall', 'winter']),
  M('matsutake', 'Matsutake', 'g', 'walk-in', 0.25, ['fall']),
  M('kombu', 'Kombu', 'g', 'dry', 0.05),
  M('bosc_pear', 'Bosc pears', 'ea', 'dry', 0.9, ['fall', 'winter']),
  // winter
  M('dungeness_crab', 'Dungeness crab, picked', 'g', 'walk-in', 0.09, ['winter']),
  M('blood_orange', 'Blood oranges', 'ea', 'dry', 0.8, ['winter']),
  M('celery_root', 'Celery root', 'g', 'dry', 0.005, ['fall', 'winter']),
  M('turbot', 'Turbot fillet', 'g', 'walk-in', 0.11, ['winter']),
  M('parsnip', 'Parsnip', 'g', 'dry', 0.004, ['winter']),
  M('short_rib', 'Bone-in short rib', 'g', 'walk-in', 0.03),
  M('red_wine', 'Red wine (braising)', 'ml', 'dry', 0.012),
];

const C = (id, name, unit, storage) => ({ id, name, unit, storage, cost: 0, kind: 'component', onHand: 0 });
export const COMPONENTS = [
  C('st_chicken_stock', 'Chicken stock', 'ml', 'walk-in'),
  C('sp_pea_veloute', 'Chilled pea velouté', 'ml', 'walk-in'), C('sp_mousseline', 'Sauce mousseline base', 'g', 'walk-in'),
  C('sp_meringue', 'Vacherin meringue shells', 'ea', 'dry'), C('sp_rhubarb_compote', 'Rhubarb compote', 'g', 'walk-in'),
  C('su_corn_agnolotti', 'Sweet corn agnolotti', 'ea', 'walk-in'), C('su_tomato_water', 'Clarified tomato water', 'ml', 'walk-in'),
  C('su_sable', 'Almond sablé', 'ea', 'dry'), C('su_peach_poached', 'Poached white peach', 'ea', 'walk-in'),
  C('fa_squash_soup', 'Butternut velouté', 'ml', 'walk-in'), C('fa_risotto_base', 'Par-cooked risotto', 'g', 'walk-in'),
  C('fa_dashi', 'Matsutake dashi', 'ml', 'walk-in'), C('fa_pear_poached', 'Poached pear', 'ea', 'walk-in'),
  C('fa_chestnut_cream', 'Chestnut cream', 'g', 'walk-in'),
  C('wi_short_rib_braise', 'Braised short rib', 'g', 'walk-in'), C('wi_custard_base', 'Truffle custard base', 'g', 'walk-in'),
  C('wi_souffle_base', 'Chocolate soufflé base', 'g', 'walk-in'), C('wi_celery_root_puree', 'Celery root purée', 'g', 'walk-in'),
];

// --------------------------------------------------------------------------------------- prep
// P(id, name, station, applianceType, role, durSec, handsOnSec, uses, yields, dueHour)
const P = (id, name, station, appliance, role, dur, attend, uses, yields, due) =>
  ({ id, name, station, appliance, role, dur, attend, uses, yields, due: due * 3600 });
export const PREP = [
  P('pp_chicken_stock', 'Simmer chicken stock', 'prep', 'kettle', 'prep', 14400, 900, { chicken_bones: 6000, onion: 500, carrot: 400, celery: 300 }, { st_chicken_stock: 5000 }, 15),
  P('pp_pea_veloute', 'Blanch, blend and chill pea velouté', 'saucier', 'blender', 'prep', 2400, 1500, { english_pea: 2500, st_chicken_stock: 1200, cream: 200, mint: 20 }, { sp_pea_veloute: 3200 }, 16.5),
  P('pp_mousseline', 'Make sauce mousseline base', 'saucier', 'induction', 'prep', 1500, 1200, { egg_yolk: 20, butter: 800, lemon: 4, cream: 200 }, { sp_mousseline: 1100 }, 17),
  P('pp_meringue', 'Pipe and dry vacherin meringues', 'pastry', 'pastry_oven', 'prep', 7200, 1200, { egg: 12, sugar: 600 }, { sp_meringue: 90 }, 16),
  P('pp_rhubarb', 'Roast rhubarb compote', 'pastry', 'pastry_oven', 'prep', 2700, 900, { rhubarb: 2500, sugar: 400 }, { sp_rhubarb_compote: 2400 }, 16.5),
  P('pp_corn_agnolotti', 'Roll and pipe sweet corn agnolotti', 'prep', null, 'prep', 4500, 4200, { sweet_corn: 30, flour: 700, egg_yolk: 28, butter: 150, parmesan: 120 }, { su_corn_agnolotti: 160 }, 16.5),
  P('pp_tomato_water', 'Hang and clarify tomato water', 'garde_manger', null, 'prep', 10800, 600, { heirloom_tomato: 5000, sea_salt: 20, basil: 30 }, { su_tomato_water: 2400 }, 16),
  P('pp_sable', 'Bake almond sablés', 'pastry', 'pastry_oven', 'prep', 3000, 1500, { almond_flour: 400, flour: 300, butter: 300, sugar: 200, egg_yolk: 6 }, { su_sable: 120 }, 16),
  P('pp_peach', 'Poach white peaches in syrup', 'pastry', 'induction', 'prep', 2400, 1200, { white_peach: 40, sugar: 600 }, { su_peach_poached: 40 }, 16.5),
  P('pp_squash_soup', 'Roast squash and blend velouté', 'saucier', 'combi', 'prep', 4200, 1800, { butternut: 5000, st_chicken_stock: 2000, cream: 400, butter: 200 }, { fa_squash_soup: 5000 }, 16.5),
  P('pp_risotto_base', 'Par-cook risotto and spread to chill', 'saucier', 'induction', 'prep', 2100, 1800, { arborio: 1600, st_chicken_stock: 3000, shallot: 150, white_wine: 300 }, { fa_risotto_base: 4000 }, 16.5),
  P('pp_dashi', 'Steep kombu and matsutake dashi', 'poisson', 'induction', 'prep', 3600, 900, { kombu: 80, matsutake: 300 }, { fa_dashi: 3000 }, 16.5),
  P('pp_pear', 'Poach pears in spiced wine', 'pastry', 'induction', 'prep', 3000, 900, { bosc_pear: 40, red_wine: 1500, sugar: 400 }, { fa_pear_poached: 40 }, 16),
  P('pp_chestnut_cream', 'Cook and pass chestnut cream', 'pastry', 'blender', 'prep', 2700, 1500, { chestnut: 1500, cream: 600, sugar: 200 }, { fa_chestnut_cream: 2000 }, 16.5),
  P('pp_short_rib', 'Sear and braise short ribs', 'meat', 'combi', 'prep', 14400, 2400, { short_rib: 12000, red_wine: 2000, veal_bones: 3000, onion: 600, carrot: 600 }, { wi_short_rib_braise: 6500 }, 15.5),
  P('pp_custard', 'Infuse truffle custard base', 'saucier', 'induction', 'prep', 1800, 1200, { cream: 1200, egg: 16, black_truffle: 60, st_chicken_stock: 400 }, { wi_custard_base: 2000 }, 16.5),
  P('pp_souffle', 'Make chocolate soufflé base', 'pastry', null, 'prep', 2400, 2400, { chocolate: 1200, egg: 30, sugar: 400, butter: 200, milk: 600 }, { wi_souffle_base: 3200 }, 17),
  P('pp_celery_root', 'Cook and purée celery root', 'saucier', 'blender', 'prep', 2700, 1200, { celery_root: 3000, butter: 300, cream: 400 }, { wi_celery_root_puree: 3200 }, 16.5),
];

// ------------------------------------------------------------------------------------- dishes
// S(id, name, station, applianceType, role, durSec, handsOnSec, uses, after, batch)
const S = (id, name, station, appliance, role, dur, attend, uses = {}, after = [], batch = 0.35) =>
  ({ id, name, station, appliance, role, dur, attend: attend ?? dur, uses, after, batch });
const PL = (dur, after, uses = {}) => ({ ...S('plate', 'Plate at the pass', 'pass', null, 'expo', dur, dur, uses, after, 0.9), plate: true });
const D = (id, name, section, seasons, priceUSD, eatMin, holdSec, steps, extra = {}) => ({ id, name, section, seasons, priceUSD, eatMin, holdSec, steps, ...extra });

export const DISHES = [
  // ---- spring
  D('sp_pea_veloute', 'Chilled English Pea Velouté, Mint Crème Fraîche', 'cold', ['spring'], 32, 9, 420, [
    S('pour', 'Portion velouté into chilled bowl', 'garde_manger', null, 'garde', 45, 45, { sp_pea_veloute: 110 }, [], 0.5),
    S('garnish', 'Quenelle crème fraîche, pea tendrils', 'garde_manger', null, 'garde', 50, 50, { creme_fraiche: 15, english_pea: 15, microgreens: 2 }, ['pour'], 0.5),
    PL(16, ['garnish'])]),
  D('sp_asparagus', 'White Asparagus, Morels and Sauce Mousseline', 'warm', ['spring'], 38, 11, 150, [
    S('blanch', 'Peel and blanch asparagus', 'saucier', 'range', 'saucier', 240, 90, { white_asparagus: 90, sea_salt: 1 }, [], 0.15),
    S('morels', 'Sauté morels in brown butter', 'saucier', 'induction', 'saucier', 180, 150, { morels: 30, butter: 10, shallot: 5 }, [], 0.25),
    S('sauce', 'Warm and mount mousseline', 'saucier', 'induction', 'saucier', 90, 80, { sp_mousseline: 35 }, [], 0.3),
    PL(24, ['blanch', 'morels', 'sauce'])]),
  D('sp_halibut', 'Pacific Halibut, Fava Beans and Ramp Butter', 'fish', ['spring'], 54, 12, 150, [
    S('sear', 'Sear halibut skin-side', 'poisson', 'range', 'poissonier', 270, 230, { halibut: 115, olive_oil: 5, butter: 10 }, [], 0.08),
    S('finish', 'Finish in combi', 'poisson', 'combi', 'poissonier', 210, 20, {}, ['sear'], 0.05),
    S('favas', 'Double-peel favas, ramp butter', 'saucier', 'induction', 'saucier', 150, 130, { fava: 45, ramps: 12, butter: 12 }, [], 0.3),
    PL(28, ['finish', 'favas'])]),
  D('sp_lamb', 'Rack of Spring Lamb, Morel Jus', 'meat', ['spring'], 68, 14, 200, [
    S('roast', 'Roast lamb rack in combi', 'meat', 'combi', 'rotisseur', 720, 80, { lamb_rack: 160, olive_oil: 5 }, [], 0.1),
    S('rest', 'Rest in warming drawer', 'meat', 'warming_drawer', 'rotisseur', 300, 10, {}, ['roast'], 0.02),
    S('jus', 'Morel jus and English peas', 'saucier', 'range', 'saucier', 170, 140, { morels: 15, english_pea: 35, butter: 10, st_chicken_stock: 60 }, [], 0.3),
    S('carve', 'Carve and slice', 'meat', null, 'rotisseur', 60, 60, {}, ['rest'], 0.4),
    PL(34, ['carve', 'jus'])]),
  D('sp_vacherin', 'Rhubarb and Strawberry Vacherin', 'dessert', ['spring'], 24, 10, 300, [
    S('fill', 'Fill meringue, compote and berries', 'pastry', null, 'patissier', 75, 75, { sp_meringue: 1, sp_rhubarb_compote: 40, strawberry: 35, cream: 30 }, [], 0.45),
    PL(18, ['fill'])]),
  // ---- summer
  D('su_tomato', 'Heirloom Tomato, Burrata and Basil', 'cold', ['summer'], 30, 10, 480, [
    S('slice', 'Slice and season tomatoes', 'garde_manger', null, 'garde', 70, 70, { heirloom_tomato: 140, sea_salt: 1, olive_oil: 8 }, [], 0.4),
    S('build', 'Tear burrata, tomato water, basil', 'garde_manger', null, 'garde', 60, 60, { burrata: 50, su_tomato_water: 40, basil: 3 }, ['slice'], 0.45),
    PL(18, ['build'])]),
  D('su_corn_agnolotti', 'Sweet Corn Agnolotti, Summer Truffle', 'warm', ['summer'], 36, 10, 120, [
    S('boil', 'Cook agnolotti', 'saucier', 'pasta_cooker', 'saucier', 150, 35, { su_corn_agnolotti: 7 }, [], 0.1),
    S('glaze', 'Glaze in brown butter, parmesan', 'saucier', 'induction', 'saucier', 120, 100, { butter: 20, parmesan: 8, chive: 1 }, [], 0.35),
    PL(24, ['boil', 'glaze'])]),
  D('su_bass', 'Striped Bass, Zucchini Blossom and Saffron', 'fish', ['summer'], 52, 12, 150, [
    S('stuff', 'Stuff and fry zucchini blossom', 'poisson', 'fryer', 'poissonier', 180, 120, { zucchini_blossom: 1, burrata: 15, flour: 8 }, [], 0.2),
    S('sear', 'Plancha-sear bass', 'poisson', 'plancha', 'poissonier', 240, 210, { striped_bass: 120, olive_oil: 6 }, [], 0.08),
    S('sauce', 'Saffron beurre blanc', 'saucier', 'induction', 'saucier', 140, 110, { butter: 25, white_wine: 15, saffron: 0.05, shallot: 4 }, [], 0.3),
    PL(28, ['stuff', 'sear', 'sauce'])]),
  D('su_ribeye', 'Dry-Aged Ribeye, Romano Beans and Bordelaise', 'meat', ['summer'], 72, 15, 200, [
    S('sear', 'Plancha-sear ribeye', 'meat', 'plancha', 'rotisseur', 420, 340, { ribeye: 170, butter: 15 }, [], 0.08),
    S('rest', 'Rest in warming drawer', 'meat', 'warming_drawer', 'rotisseur', 300, 10, {}, ['sear'], 0.02),
    S('beans', 'Blanch beans, reduce bordelaise', 'saucier', 'range', 'saucier', 180, 140, { romano_bean: 60, red_wine: 30, shallot: 8, butter: 10 }, [], 0.3),
    PL(34, ['rest', 'beans'])]),
  D('su_peach', 'White Peach Melba, Almond Sablé', 'dessert', ['summer'], 24, 10, 300, [
    S('build', 'Peach, raspberry coulis, sablé', 'pastry', null, 'patissier', 80, 80, { su_peach_poached: 0.5, raspberry: 30, su_sable: 1, cream: 25 }, [], 0.45),
    PL(18, ['build'])]),
  // ---- fall
  D('fa_squash', 'Butternut Squash Velouté, Brown Butter and Sage', 'cold', ['fall'], 28, 9, 240, [
    S('heat', 'Heat and froth velouté', 'saucier', 'induction', 'saucier', 150, 90, { fa_squash_soup: 120 }, [], 0.2),
    S('garnish', 'Brown butter, toasted hazelnut', 'garde_manger', null, 'garde', 45, 45, { butter: 8, hazelnut: 6 }, [], 0.5),
    PL(18, ['heat', 'garnish'])]),
  D('fa_risotto', 'Chanterelle Risotto, Shaved White Truffle', 'warm', ['fall'], 48, 11, 100, [
    S('finish', 'Finish risotto to order', 'saucier', 'induction', 'saucier', 420, 380, { fa_risotto_base: 110, st_chicken_stock: 80, parmesan: 12, butter: 15 }, [], 0.25),
    S('mush', 'Sauté chanterelles', 'saucier', 'range', 'saucier', 180, 150, { chanterelle: 40, shallot: 4, butter: 6 }, [], 0.25),
    S('truffle', 'Shave truffle tableside-ready', 'pass', null, 'expo', 40, 40, { white_truffle: 3 }, ['finish', 'mush'], 0.6),
    PL(22, ['truffle'])]),
  D('fa_cod', 'Black Cod, Matsutake Dashi', 'fish', ['fall'], 50, 12, 180, [
    S('roast', 'Glaze and roast cod in combi', 'poisson', 'combi', 'poissonier', 480, 60, { black_cod: 120 }, [], 0.08),
    S('broth', 'Heat dashi, slice matsutake', 'poisson', 'induction', 'poissonier', 150, 120, { fa_dashi: 90, matsutake: 12 }, [], 0.3),
    PL(26, ['roast', 'broth'])]),
  D('fa_venison', 'Venison Loin, Huckleberry and Chestnut', 'meat', ['fall'], 70, 15, 200, [
    S('sear', 'Sear venison', 'meat', 'plancha', 'rotisseur', 360, 300, { venison: 150, butter: 15 }, [], 0.08),
    S('rest', 'Rest in warming drawer', 'meat', 'warming_drawer', 'rotisseur', 300, 10, {}, ['sear'], 0.02),
    S('sauce', 'Huckleberry jus, glazed chestnuts', 'saucier', 'range', 'saucier', 170, 140, { huckleberry: 20, chestnut: 25, red_wine: 20, butter: 10 }, [], 0.3),
    PL(34, ['rest', 'sauce'])]),
  D('fa_pear', 'Spiced Poached Pear, Chestnut Mont Blanc', 'dessert', ['fall'], 24, 10, 360, [
    S('pipe', 'Pipe chestnut cream over pear', 'pastry', null, 'patissier', 90, 90, { fa_pear_poached: 1, fa_chestnut_cream: 45, cream: 20 }, [], 0.45),
    PL(18, ['pipe'])]),
  // ---- winter
  D('wi_crab', 'Dungeness Crab, Blood Orange and Celery Root', 'cold', ['winter'], 36, 10, 420, [
    S('dress', 'Dress crab, segment oranges', 'garde_manger', null, 'garde', 90, 90, { dungeness_crab: 60, blood_orange: 0.5, creme_fraiche: 10, chive: 1 }, [], 0.45),
    S('puree', 'Spoon celery root purée', 'garde_manger', null, 'garde', 30, 30, { wi_celery_root_puree: 25 }, [], 0.5),
    PL(20, ['dress', 'puree'])]),
  D('wi_custard', 'Black Truffle Custard, Truffle Ragout', 'warm', ['winter'], 46, 9, 150, [
    S('steam', 'Steam custard in combi', 'saucier', 'combi', 'saucier', 600, 40, { wi_custard_base: 70 }, [], 0.05),
    S('ragout', 'Truffle ragout with veal stock', 'saucier', 'induction', 'saucier', 140, 110, { black_truffle: 4, butter: 10, st_chicken_stock: 30 }, [], 0.3),
    PL(22, ['steam', 'ragout'])]),
  D('wi_turbot', 'Roasted Turbot, Parsnip and Brown Butter', 'fish', ['winter'], 58, 12, 150, [
    S('sear', 'Sear turbot on the bone', 'poisson', 'range', 'poissonier', 300, 250, { turbot: 130, butter: 15 }, [], 0.08),
    S('finish', 'Finish in combi', 'poisson', 'combi', 'poissonier', 240, 20, {}, ['sear'], 0.05),
    S('parsnip', 'Roast parsnip, brown butter', 'saucier', 'range', 'saucier', 200, 150, { parsnip: 70, butter: 15, lemon: 0.1 }, [], 0.3),
    PL(28, ['finish', 'parsnip'])]),
  D('wi_short_rib', 'Braised Short Rib, Winter Root Vegetables', 'meat', ['winter'], 64, 15, 240, [
    S('reheat', 'Reheat and glaze short rib', 'meat', 'combi', 'rotisseur', 480, 60, { wi_short_rib_braise: 160 }, [], 0.08),
    S('roots', 'Glaze carrots, parsnip, celery root', 'saucier', 'range', 'saucier', 200, 160, { carrot: 50, parsnip: 40, butter: 12, wi_celery_root_puree: 30 }, [], 0.3),
    PL(32, ['reheat', 'roots'])]),
  D('wi_souffle', 'Bittersweet Chocolate Soufflé', 'dessert', ['winter'], 26, 9, 75, [
    S('fill', 'Butter ramekin, fold and fill', 'pastry', null, 'patissier', 90, 90, { wi_souffle_base: 95, butter: 3, sugar: 5 }, [], 0.4),
    S('bake', 'Bake soufflé to order', 'pastry', 'pastry_oven', 'patissier', 720, 30, {}, ['fill'], 0.05),
    PL(14, ['bake'])], { note: 'Bakes to order and falls within about a minute: the tightest hold time on the menu.' }),
];

// Metadata for the simulation's base (fallback) dishes, so they can sit in the same menu pool.
export const BASE_META = {
  cornet: { section: 'amuse', priceUSD: 0, eatMin: 3, signature: true },
  gougere: { section: 'amuse', priceUSD: 0, eatMin: 3, signature: true },
  oysters_pearls: { section: 'cold', priceUSD: 42, eatMin: 9, signature: true },
  garden_salad: { section: 'cold', priceUSD: 24, eatMin: 10 },
  foie: { section: 'cold', priceUSD: 44, eatMin: 11 },
  lobster: { section: 'fish', priceUSD: 64, eatMin: 11, signature: true },
  agnolotti: { section: 'warm', priceUSD: 38, eatMin: 10 },
  halibut: { section: 'fish', priceUSD: 54, eatMin: 11 },
  scallop: { section: 'fish', priceUSD: 50, eatMin: 11 },
  wagyu: { section: 'meat', priceUSD: 85, eatMin: 13 },
  lamb: { section: 'meat', priceUSD: 62, eatMin: 13 },
  cheese: { section: 'cheese', priceUSD: 22, eatMin: 10 },
  doughnuts: { section: 'dessert', priceUSD: 22, eatMin: 12, signature: true },
  chocolate_pot: { section: 'dessert', priceUSD: 20, eatMin: 10 },
  mignardises: { section: 'mignardise', priceUSD: 0, eatMin: 7, signature: true },
};

// Season facts for Yountville, California (latitude 38.40 N), used for sunlight and mood.
export const SEASON_FACTS = {
  spring: { dayOfYear: 110, dst: true, sunset: '19:47', foliage: 0x7fae5a, blossom: 0xf2c4d6, ground: 0x6d8f4a, weather: 'clear', note: 'Mid-April: peas, asparagus and morels; long evenings.' },
  summer: { dayOfYear: 201, dst: true, sunset: '20:28', foliage: 0x4f7d3a, blossom: 0xf6d36b, ground: 0x7d8b4a, weather: 'clear', note: 'Mid-July: tomatoes, corn and stone fruit; daylight through the first seating.' },
  fall: { dayOfYear: 293, dst: true, sunset: '18:22', foliage: 0xc7752e, blossom: 0xa8442a, ground: 0x7a6a3e, weather: 'clear', note: 'Mid-October: harvest in the valley, white truffle and game; sunset at the first seating.' },
  winter: { dayOfYear: 20, dst: false, sunset: '17:21', foliage: 0x5d6b55, blossom: 0xe9eef2, ground: 0x6b7262, weather: 'overcast', note: 'Mid-January: citrus, crab and black truffle; dark before doors open.' },
};

// How the catalogue's generic names map onto the sourced French Laundry model (src/sim/adapter.js over
// /data). Each entry lists candidates in order; the first that exists in the kitchen being compiled wins,
// and `null` means "no machine needed". Kitchens that already use the generic names need no mapping.
export const KITCHEN_MAP = {
  station: {
    garde_manger: ['WC-GM'], saucier: ['WC-GARNISH'], poisson: ['WC-FISH'], meat: ['WC-MEAT'],
    pastry: ['WC-PASTRY'], pass: ['WC-PASS'], prep: ['WC-ANNEX-PREP', 'WC-STOCK'],
  },
  role: {
    garde: ['cdp-garde-manger'], saucier: ['cdp-garnish'], poissonier: ['cdp-fish'], rotisseur: ['cdp-meat'],
    patissier: ['cdp-pastry', 'commis-pastry'], expo: ['chef-de-cuisine'], prep: ['prep-cook'],
  },
  appliance: {
    range: ['EQ-BONNET-SAVORY', 'EQ-HESTAN-RANGE'], induction: ['EQ-BONNET-SAVORY'], plancha: ['EQ-BONNET-SAVORY'],
    combi: ['EQ-COMBI-KITCHEN'], fryer: ['EQ-FRY-KETTLE'], pasta_cooker: ['EQ-STOCKPOT-RANGE'], kettle: ['EQ-STOCKPOT-RANGE'],
    pastry_oven: ['EQ-BONNET-PASTRY', 'EQ-STONE-OVEN'], blender: ['EQ-VITAMIX'], salamander: ['EQ-SALAMANDER-1'],
    warming_drawer: [null], blast_chiller: [null], sous_vide: [null],
  },
  ingredient: {
    butter: ['RM-BUTTER-UNSALTED'], cream: ['RM-CREAM'], egg: ['RM-EGG'], shallot: ['RM-SHALLOT'],
    sea_salt: ['RM-SALT-FINISHING'], chive: ['RM-CHIVES'], lemon: ['RM-LEMON'], flour: ['RM-FLOUR-AP'],
    sugar: ['RM-SUGAR'], olive_oil: ['RM-OLIVE-OIL'],
  },
};
