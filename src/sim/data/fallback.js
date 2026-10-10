// Fallback KitchenData: an illustrative ten-course tasting menu in the style of a three-star
// kitchen (inspired by The French Laundry's published tasting-menu structure). Quantities and
// timings are plausible engineering estimates, NOT reproductions of any restaurant's recipes.
// The simulation consumes any object of this shape, so the research thread's data can replace it.
import { explodeRequirements } from '../mrp.js';

const M = (id, name, unit, storage, cost, extra = {}) => ({ id, name, unit, storage, cost, kind: 'raw', ...extra });
const C = (id, name, unit, storage) => ({ id, name, unit, storage, cost: 0, kind: 'component', onHand: 0 });

const RAW = [
  // proteins
  M('oyster', 'Oyster (Island Creek)', 'ea', 'walk-in', 2.4), M('caviar', 'White sturgeon caviar', 'g', 'walk-in', 6),
  M('salmon_belly', 'Salmon belly', 'g', 'walk-in', 0.055), M('foie_torchon', 'Foie gras torchon', 'g', 'walk-in', 0.2),
  M('lobster', 'Maine lobster, live', 'g', 'walk-in', 0.13), M('halibut', 'Halibut fillet', 'g', 'walk-in', 0.09),
  M('scallop', 'Diver scallop', 'g', 'walk-in', 0.12), M('wagyu_strip', 'Wagyu strip loin', 'g', 'walk-in', 0.24),
  M('lamb_saddle', 'Lamb saddle', 'g', 'walk-in', 0.11), M('veal_bones', 'Veal bones', 'g', 'walk-in', 0.009),
  M('egg', 'Eggs', 'ea', 'walk-in', 0.4), M('egg_yolk', 'Egg yolks', 'ea', 'walk-in', 0.45),
  // dairy
  M('butter', 'Cultured butter', 'g', 'walk-in', 0.014), M('cream', 'Heavy cream', 'ml', 'walk-in', 0.009),
  M('milk', 'Whole milk', 'ml', 'walk-in', 0.003), M('creme_fraiche', 'Crème fraîche', 'g', 'walk-in', 0.022),
  M('gruyere', 'Gruyère', 'g', 'walk-in', 0.035), M('cheese_selection', 'Cheese selection', 'g', 'walk-in', 0.08),
  // produce
  M('garden_greens', 'Garden greens', 'g', 'walk-in', 0.035), M('microgreens', 'Microgreens', 'g', 'walk-in', 0.12),
  M('shallot', 'Shallot', 'g', 'dry', 0.005), M('black_truffle', 'Black truffle', 'g', 'walk-in', 2.6),
  M('asparagus', 'Asparagus', 'g', 'walk-in', 0.016), M('english_pea', 'English peas', 'g', 'walk-in', 0.022),
  M('lemon', 'Lemon', 'ea', 'dry', 0.5), M('chive', 'Chives', 'g', 'walk-in', 0.07),
  M('potato', 'Potato', 'g', 'dry', 0.004), M('mushrooms', 'Mushrooms', 'g', 'walk-in', 0.028),
  M('onion', 'Onion', 'g', 'dry', 0.003), M('carrot', 'Carrot', 'g', 'dry', 0.003), M('celery', 'Celery', 'g', 'walk-in', 0.004),
  // dry goods / bar
  M('flour', 'Flour', 'g', 'dry', 0.002), M('sugar', 'Sugar', 'g', 'dry', 0.002), M('tapioca_pearls', 'Tapioca pearls', 'g', 'dry', 0.012),
  M('chocolate', 'Chocolate 70%', 'g', 'dry', 0.024), M('coffee_beans', 'Coffee beans', 'g', 'dry', 0.045),
  M('sea_salt', 'Maldon salt', 'g', 'dry', 0.02), M('olive_oil', 'Olive oil', 'ml', 'dry', 0.014),
  M('fryer_oil', 'Fryer oil', 'ml', 'dry', 0.004), M('white_wine', 'White wine (cooking)', 'ml', 'dry', 0.012),
  M('champagne', 'Champagne (cooking)', 'ml', 'dry', 0.03),
];

const COMP = [
  C('veal_stock', 'Veal stock', 'ml', 'walk-in'), C('veal_jus', 'Veal jus', 'ml', 'walk-in'),
  C('pasta_dough', 'Pasta dough', 'g', 'walk-in'), C('agnolotti_fill', 'Agnolotti filling', 'g', 'walk-in'),
  C('agnolotti', 'Agnolotti (piped)', 'ea', 'walk-in'), C('beurre_monte_base', 'Beurre monté base', 'g', 'walk-in'),
  C('sabayon_base', 'Pearl sabayon base', 'g', 'walk-in'), C('cornet_shell', 'Cornet shells', 'ea', 'dry'),
  C('salmon_tartare', 'Salmon tartare', 'g', 'walk-in'), C('brioche_slice', 'Brioche slices', 'ea', 'dry'),
  C('pea_puree', 'Pea purée', 'g', 'walk-in'), C('vinaigrette', 'Vinaigrette', 'ml', 'walk-in'),
  C('pickled_shallot', 'Pickled shallot', 'g', 'walk-in'), C('lobster_poach_ready', 'Lobster, blanched & shelled', 'g', 'walk-in'),
  C('halibut_portion', 'Halibut, portioned', 'g', 'walk-in'), C('wagyu_portion', 'Wagyu, trimmed', 'g', 'walk-in'),
  C('lamb_portion', 'Lamb, trimmed', 'g', 'walk-in'), C('doughnut_dough', 'Doughnut dough', 'g', 'walk-in'),
  C('cremeux', 'Coffee crémeux', 'g', 'walk-in'), C('truffle', 'Chocolate truffles', 'ea', 'walk-in'),
  C('cheese_portion', 'Cheese, portioned', 'g', 'walk-in'), C('salad_mix', 'Washed salad mix', 'g', 'walk-in'),
  C('gougere', 'Gougères (baked off)', 'ea', 'dry'),
];

const P = (id, name, station, appliance, role, dur, attend, uses, yields, due) =>
  ({ id, name, station, appliance, role, dur, attend, uses, yields, due: due * 3600 });

const PREP = [
  P('p_veal_stock', 'Roast bones & simmer veal stock', 'prep', 'kettle', 'prep', 21600, 1200, { veal_bones: 8000, carrot: 600, onion: 600, celery: 300 }, { veal_stock: 6000 }, 15),
  P('p_veal_jus', 'Reduce veal jus', 'prep', 'kettle', 'prep', 5400, 600, { veal_stock: 3000, shallot: 200, white_wine: 400, butter: 100 }, { veal_jus: 1500 }, 17),
  P('p_pasta_dough', 'Mix & rest pasta dough', 'prep', null, 'prep', 2700, 900, { flour: 600, egg_yolk: 24, olive_oil: 20 }, { pasta_dough: 900 }, 16),
  P('p_agn_fill', 'Cook agnolotti filling', 'saucier', 'induction', 'prep', 2400, 1800, { mushrooms: 800, shallot: 100, cream: 200, gruyere: 150 }, { agnolotti_fill: 1000 }, 16),
  P('p_agnolotti', 'Roll & pipe agnolotti', 'prep', null, 'prep', 3600, 3600, { pasta_dough: 900, agnolotti_fill: 1000 }, { agnolotti: 120 }, 17),
  P('p_beurre_monte', 'Emulsify beurre monté base', 'saucier', 'induction', 'prep', 900, 600, { butter: 1500 }, { beurre_monte_base: 1800 }, 17),
  P('p_sabayon', 'Cook pearl sabayon', 'saucier', 'induction', 'prep', 2400, 1800, { tapioca_pearls: 300, cream: 600, egg_yolk: 24, champagne: 200 }, { sabayon_base: 1200 }, 17),
  P('p_cornet', 'Bake tuile cornet shells', 'pastry', 'pastry_oven', 'prep', 3000, 1500, { flour: 400, butter: 200, egg: 6, sugar: 50 }, { cornet_shell: 160 }, 16.5),
  P('p_tartare', 'Hand-cut salmon tartare', 'garde_manger', null, 'prep', 1800, 1800, { salmon_belly: 3000, shallot: 150, chive: 40, creme_fraiche: 300, lemon: 6 }, { salmon_tartare: 3200 }, 17.25),
  P('p_brioche', 'Bake & slice brioche', 'pastry', 'pastry_oven', 'prep', 5400, 1800, { flour: 500, butter: 250, egg: 8 }, { brioche_slice: 80 }, 16.5),
  P('p_pea_puree', 'Blend pea purée', 'saucier', 'blender', 'prep', 1500, 1200, { english_pea: 2000, butter: 150, cream: 200 }, { pea_puree: 1800 }, 17),
  P('p_vinaigrette', 'Emulsify vinaigrette', 'garde_manger', 'blender', 'prep', 600, 500, { olive_oil: 600, lemon: 8, shallot: 80 }, { vinaigrette: 700 }, 17),
  P('p_pickled_shallot', 'Pickle shallots', 'garde_manger', null, 'prep', 1500, 900, { shallot: 500, white_wine: 400, sugar: 80 }, { pickled_shallot: 600 }, 16.5),
  P('p_lobster', 'Blanch & shell lobster', 'poisson', 'sous_vide', 'prep', 3600, 2700, { lobster: 6000 }, { lobster_poach_ready: 3400 }, 16.5),
  P('p_halibut', 'Skin & portion halibut', 'poisson', null, 'prep', 2400, 2400, { halibut: 7000 }, { halibut_portion: 5200 }, 16.5),
  P('p_wagyu', 'Trim & portion wagyu', 'meat', null, 'prep', 2400, 2400, { wagyu_strip: 9000 }, { wagyu_portion: 6800 }, 16.5),
  P('p_lamb', 'Trim & portion lamb saddle', 'meat', null, 'prep', 2700, 2700, { lamb_saddle: 8000 }, { lamb_portion: 5400 }, 16.5),
  P('p_doughnut', 'Mix & proof doughnut dough', 'pastry', null, 'prep', 5400, 1500, { flour: 1500, milk: 400, egg: 8, butter: 150, sugar: 120 }, { doughnut_dough: 2000 }, 17),
  P('p_cremeux', 'Cook & chill coffee crémeux', 'pastry', 'induction', 'prep', 3600, 1500, { cream: 1000, coffee_beans: 120, sugar: 100, chocolate: 150, egg_yolk: 10 }, { cremeux: 1100 }, 17),
  P('p_truffle', 'Roll chocolate truffles', 'pastry', 'blast_chiller', 'prep', 3600, 2400, { chocolate: 600, cream: 300 }, { truffle: 160 }, 17),
  P('p_cheese', 'Portion cheese course', 'garde_manger', null, 'prep', 1200, 1200, { cheese_selection: 4000 }, { cheese_portion: 3800 }, 17.25),
  P('p_salad', 'Wash & sort salad greens', 'garde_manger', null, 'prep', 1200, 1200, { garden_greens: 3000, microgreens: 400 }, { salad_mix: 3200 }, 17.25),
  P('p_gougere', 'Pipe & bake gougères', 'pastry', 'pastry_oven', 'prep', 3000, 1500, { flour: 300, butter: 200, egg: 10, gruyere: 300 }, { gougere: 150 }, 16.5),
];

// step(id, name, station, appliance, role, dur, attend, uses, after, batch)
const S = (id, name, station, appliance, role, dur, attend, uses = {}, after = [], batch = 0.35, extra = {}) =>
  ({ id, name, station, appliance, role, dur, attend: attend ?? dur, uses, after, batch, ...extra });
const PL = (id, dur, after, uses = {}) => S(id, 'Plate at the pass', 'pass', null, 'expo', dur, dur, uses, after, 0.9, { plate: true });

const DISHES = [
  { id: 'cornet', name: 'Salmon Tartare Cornet', holdSec: 420, steps: [
    S('fill', 'Pipe tartare into cornet', 'garde_manger', null, 'garde', 40, 40, { salmon_tartare: 28, cornet_shell: 1, chive: 0.4 }, [], 0.5),
    PL('plate', 12, ['fill']) ] },
  { id: 'gougere', name: 'Gruyère Gougère', holdSec: 240, steps: [
    S('bake', 'Refire in oven', 'pastry', 'pastry_oven', 'patissier', 330, 35, { gougere: 2 }, [], 0.1),
    PL('plate', 10, ['bake']) ] },
  { id: 'oysters_pearls', name: 'Oysters and Pearls', holdSec: 150, steps: [
    S('shuck', 'Shuck oysters', 'garde_manger', null, 'garde', 45, 45, { oyster: 2 }, [], 0.7),
    S('warm', 'Warm pearl sabayon', 'saucier', 'induction', 'saucier', 150, 70, { sabayon_base: 42 }, [], 0.2),
    S('dress', 'Assemble & caviar', 'garde_manger', null, 'garde', 40, 40, { caviar: 5, sea_salt: 0.1 }, ['shuck', 'warm'], 0.6),
    PL('plate', 16, ['dress']) ] },
  { id: 'garden_salad', name: 'Garden Salad', holdSec: 600, steps: [
    S('dress', 'Dress greens', 'garde_manger', null, 'garde', 90, 90, { salad_mix: 55, vinaigrette: 12, sea_salt: 0.2 }, [], 0.45),
    PL('plate', 22, ['dress']) ] },
  { id: 'foie', name: 'Foie Gras Torchon', holdSec: 360, steps: [
    S('slice', 'Slice & temper torchon', 'garde_manger', null, 'garde', 60, 60, { foie_torchon: 55 }, [], 0.5),
    S('toast', 'Toast brioche', 'pass', 'salamander', 'garde', 100, 40, { brioche_slice: 2 }, [], 0.1),
    S('garnish', 'Garnish', 'garde_manger', null, 'garde', 50, 50, { pickled_shallot: 15, microgreens: 2 }, ['slice'], 0.4),
    PL('plate', 22, ['toast', 'garnish']) ] },
  { id: 'lobster', name: 'Butter-Poached Lobster', holdSec: 180, steps: [
    S('poach', 'Butter-poach lobster', 'saucier', 'induction', 'saucier', 420, 100, { lobster_poach_ready: 110, beurre_monte_base: 70 }, [], 0.25),
    S('puree', 'Pea purée & garnish', 'garde_manger', null, 'garde', 60, 60, { pea_puree: 40, microgreens: 3 }, [], 0.4),
    PL('plate', 24, ['poach', 'puree']) ] },
  { id: 'agnolotti', name: 'Truffle Agnolotti', holdSec: 120, steps: [
    S('boil', 'Cook agnolotti', 'saucier', 'pasta_cooker', 'saucier', 150, 35, { agnolotti: 6 }, [], 0.1),
    S('sauce', 'Mount sauce & shave truffle', 'saucier', 'induction', 'saucier', 130, 100, { beurre_monte_base: 30, veal_jus: 25, black_truffle: 3 }, [], 0.35),
    PL('plate', 26, ['boil', 'sauce']) ] },
  { id: 'halibut', name: 'Pan-Roasted Halibut', holdSec: 150, steps: [
    S('sear', 'Sear halibut', 'poisson', 'range', 'poissonier', 300, 260, { halibut_portion: 120, olive_oil: 6, butter: 10 }, [], 0.2),
    S('finish', 'Finish in combi', 'poisson', 'combi', 'poissonier', 240, 25, {}, ['sear'], 0.05),
    S('sauce', 'Beurre blanc & asparagus', 'saucier', 'range', 'saucier', 150, 110, { beurre_monte_base: 40, white_wine: 10, asparagus: 40 }, [], 0.3),
    PL('plate', 30, ['finish', 'sauce']) ] },
  { id: 'scallop', name: 'Seared Scallop', holdSec: 120, steps: [
    S('sear', 'Sear scallops', 'poisson', 'plancha', 'poissonier', 200, 180, { scallop: 80, butter: 12 }, [], 0.25),
    S('sauce', 'Purée & beurre monté', 'saucier', 'induction', 'saucier', 110, 80, { pea_puree: 40, beurre_monte_base: 30 }, [], 0.3),
    PL('plate', 24, ['sear', 'sauce']) ] },
  { id: 'wagyu', name: 'Wagyu Strip Loin', holdSec: 200, steps: [
    S('sear', 'Plancha sear', 'meat', 'plancha', 'rotisseur', 380, 320, { wagyu_portion: 120, butter: 15 }, [], 0.2),
    S('rest', 'Rest in warming drawer', 'meat', 'warming_drawer', 'rotisseur', 300, 10, {}, ['sear'], 0.02),
    S('garnish', 'Jus, mushrooms & potato', 'saucier', 'range', 'saucier', 160, 130, { veal_jus: 40, mushrooms: 40, potato: 60, butter: 15 }, [], 0.3),
    PL('plate', 36, ['rest', 'garnish']) ] },
  { id: 'lamb', name: 'Roasted Lamb Saddle', holdSec: 200, steps: [
    S('roast', 'Roast in combi', 'meat', 'combi', 'rotisseur', 660, 70, { lamb_portion: 130, olive_oil: 5 }, [], 0.1),
    S('rest', 'Rest in warming drawer', 'meat', 'warming_drawer', 'rotisseur', 300, 10, {}, ['roast'], 0.02),
    S('garnish', 'Jus & English peas', 'saucier', 'range', 'saucier', 160, 130, { veal_jus: 45, english_pea: 40 }, [], 0.3),
    PL('plate', 36, ['rest', 'garnish']) ] },
  { id: 'cheese', name: 'Cheese Course', holdSec: 900, steps: [
    S('assemble', 'Compose cheese plate', 'garde_manger', null, 'garde', 75, 75, { cheese_portion: 50, brioche_slice: 0.5 }, [], 0.45),
    PL('plate', 20, ['assemble']) ] },
  { id: 'doughnuts', name: 'Coffee and Doughnuts', holdSec: 150, steps: [
    S('fry', 'Fry doughnuts', 'pastry', 'fryer', 'patissier', 170, 130, { doughnut_dough: 45, fryer_oil: 30 }, [], 0.25),
    S('cappu', 'Pipe crémeux & steam milk', 'pastry', 'blender', 'patissier', 90, 90, { cremeux: 30, milk: 40 }, [], 0.5),
    PL('plate', 20, ['fry', 'cappu']) ] },
  { id: 'chocolate_pot', name: 'Chocolate Pot de Crème', holdSec: 600, steps: [
    S('pot', 'Fill & garnish pot', 'pastry', null, 'patissier', 85, 85, { cremeux: 50, chocolate: 8 }, [], 0.45),
    PL('plate', 16, ['pot']) ] },
  { id: 'mignardises', name: 'Mignardises', holdSec: 900, steps: [
    S('box', 'Assemble mignardise tray', 'pastry', null, 'patissier', 60, 60, { truffle: 2 }, [], 0.4),
    PL('plate', 26, ['box']) ] },
];

// Each course is a list of "parts"; every guest eats one dish from each part (weights = guest choice).
const O = (dish, weight = 1) => ({ dish, weight });
const COURSES = [
  { id: 'c1', name: 'Amuse-bouche', eatSec: 300, parts: [[O('cornet')], [O('gougere')]] },
  { id: 'c2', name: 'Oysters and Pearls', eatSec: 540, parts: [[O('oysters_pearls')]] },
  { id: 'c3', name: 'Salad', eatSec: 600, parts: [[O('garden_salad')]] },
  { id: 'c4', name: 'Foie Gras or Lobster', eatSec: 660, parts: [[O('foie', 3), O('lobster', 2)]] },
  { id: 'c5', name: 'Pasta', eatSec: 600, parts: [[O('agnolotti')]] },
  { id: 'c6', name: 'Fish', eatSec: 660, parts: [[O('halibut', 3), O('scallop', 2)]] },
  { id: 'c7', name: 'Meat', eatSec: 780, parts: [[O('wagyu', 3), O('lamb', 2)]] },
  { id: 'c8', name: 'Cheese', eatSec: 600, parts: [[O('cheese')]] },
  { id: 'c9', name: 'Dessert', eatSec: 720, parts: [[O('doughnuts', 3), O('chocolate_pot', 2)]] },
  { id: 'c10', name: 'Mignardises', eatSec: 420, parts: [[O('mignardises')]] },
];

const A = (id, type, name, station, capacity, mtbfH, mttrMin, kw) => ({ id, type, name, station, capacity, mtbfH, mttrMin, kw });
const APPLIANCES = [
  A('range_1', 'range', '6-burner gas range (sauce)', 'saucier', 6, 60, 20, 24), A('range_2', 'range', '6-burner gas range (fish)', 'poisson', 6, 60, 20, 24),
  A('plancha_1', 'plancha', 'Plancha / flat-top', 'meat', 3, 45, 25, 12), A('plancha_2', 'plancha', 'Plancha / flat-top', 'poisson', 2, 45, 25, 8),
  A('induction_1', 'induction', 'Induction hob', 'saucier', 3, 80, 15, 7), A('induction_2', 'induction', 'Induction hob', 'garde_manger', 2, 80, 15, 5),
  A('induction_3', 'induction', 'Induction hob', 'pastry', 2, 80, 15, 5), A('induction_4', 'induction', 'Induction hob', 'saucier', 3, 80, 15, 7),
  A('combi_1', 'combi', 'Combi oven (Rational)', 'meat', 4, 30, 40, 18), A('combi_2', 'combi', 'Combi oven (Rational)', 'poisson', 4, 30, 40, 18),
  A('salamander_1', 'salamander', 'Salamander broiler', 'pass', 2, 70, 15, 9),
  A('fryer_1', 'fryer', 'Twin fryer', 'pastry', 2, 50, 30, 14),
  A('pasta_cooker_1', 'pasta_cooker', 'Pasta cooker', 'saucier', 2, 70, 20, 10),
  A('warming_1', 'warming_drawer', 'Warming drawer', 'meat', 6, 120, 15, 3), A('warming_2', 'warming_drawer', 'Warming drawer', 'pass', 6, 120, 15, 3),
  A('pastry_oven_1', 'pastry_oven', 'Convection pastry oven', 'pastry', 4, 40, 35, 11), A('pastry_oven_2', 'pastry_oven', 'Convection pastry oven', 'pastry', 4, 40, 35, 11),
  A('kettle_1', 'kettle', '60 L tilting kettle', 'prep', 1, 90, 30, 15), A('kettle_2', 'kettle', '60 L tilting kettle', 'prep', 1, 90, 30, 15),
  A('blender_1', 'blender', 'High-speed blender', 'prep', 1, 60, 10, 2), A('blender_2', 'blender', 'High-speed blender', 'pastry', 1, 60, 10, 2),
  A('blast_chiller_1', 'blast_chiller', 'Blast chiller', 'prep', 4, 90, 45, 6),
  A('sous_vide_1', 'sous_vide', 'Sous-vide circulator bank', 'prep', 12, 100, 20, 4),
];

const STATIONS = [
  { id: 'pass', name: 'The Pass', x: 6, y: 0, capacity: 5 },
  { id: 'garde_manger', name: 'Garde Manger', x: 1.5, y: 2.5, capacity: 5 },
  { id: 'saucier', name: 'Saucier', x: 4, y: 5.5, capacity: 6 },
  { id: 'poisson', name: 'Poissonier', x: 6.5, y: 5.5, capacity: 5 },
  { id: 'meat', name: 'Rôtisseur', x: 9, y: 5.5, capacity: 5 },
  { id: 'pastry', name: 'Pâtisserie', x: 11.5, y: 2.5, capacity: 5 },
  { id: 'prep', name: 'Prep Kitchen', x: 1.5, y: 7, capacity: 8 },
  { id: 'dish', name: 'Plonge', x: 11.5, y: 7, capacity: 3 },
  { id: 'dining', name: 'Dining room', x: 6, y: -9, capacity: 99 },
];

const ST = (id, name, title, roles, home, shift, skill = 1) => ({ id, name, title, roles, home, shift, skill });
const STAFF = [
  ST('cdc', 'Chef de Cuisine', 'Chef de Cuisine', ['expo'], 'pass', [12, 27], 0.92),
  ST('sous_1', 'Sous Chef 1', 'Sous Chef', ['expo', 'saucier'], 'pass', [12, 27], 0.95),
  ST('sous_2', 'Sous Chef 2', 'Sous Chef', ['rotisseur', 'poissonier'], 'meat', [12, 27], 0.95),
  ST('sauce_1', 'Saucier 1', 'Chef de Partie', ['saucier', 'prep'], 'saucier', [11, 27], 0.97),
  ST('sauce_2', 'Saucier 2', 'Chef de Partie', ['saucier', 'prep'], 'saucier', [11, 27], 1.03),
  ST('fish_1', 'Poissonier 1', 'Chef de Partie', ['poissonier', 'prep'], 'poisson', [11, 27], 0.97),
  ST('fish_2', 'Poissonier 2', 'Demi Chef', ['poissonier', 'prep'], 'poisson', [11, 27], 1.06),
  ST('meat_1', 'Rôtisseur 1', 'Chef de Partie', ['rotisseur', 'prep'], 'meat', [11, 27], 0.98),
  ST('meat_2', 'Rôtisseur 2', 'Demi Chef', ['rotisseur', 'prep'], 'meat', [11, 27], 1.05),
  ST('garde_1', 'Garde Manger 1', 'Chef de Partie', ['garde', 'prep'], 'garde_manger', [11, 27], 0.96),
  ST('garde_2', 'Garde Manger 2', 'Demi Chef', ['garde', 'prep'], 'garde_manger', [11, 27], 1.02),
  ST('pastry_1', 'Pastry Chef', 'Chef de Partie', ['patissier', 'prep'], 'pastry', [10, 27], 0.95),
  ST('pastry_2', 'Pastry 2', 'Demi Chef', ['patissier', 'prep'], 'pastry', [10, 27], 1.04),
  ...[1, 2, 3, 4, 5, 6].map((i) => ST(`prep_${i}`, `Prep Cook ${i}`, 'Commis', ['prep', ...(i <= 2 ? ['garde'] : [])], 'prep', [7, 22], 1 + (i % 3) * 0.04)),
  ...[1, 2, 3, 4, 5].map((i) => ST(`runner_${i}`, `Food Runner ${i}`, 'Runner', ['runner'], 'pass', [16.5, 27], 1 + (i % 2) * 0.05)),
  ...[1, 2].map((i) => ST(`dish_${i}`, `Plongeur ${i}`, 'Dishwasher', ['plonge'], 'dish', [16.5, 27.5], 1)),
];

const TABLES = [
  ...Array.from({ length: 14 }, (_, i) => ({ id: `T${i + 1}`, seats: 2 })),
  ...Array.from({ length: 8 }, (_, i) => ({ id: `T${i + 15}`, seats: 4 })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: `T${i + 23}`, seats: 6 })),
];

/**
 * @param {{stockForCovers?: number}} opts purchasing is sized for N covers (+8% safety); run more
 *        covers than that in the sim to watch the kitchen hit stockouts and 86 dishes.
 */
export function buildFallbackData({ stockForCovers = 90 } = {}) {
  const data = {
    meta: { restaurant: 'Illustrative three-star tasting menu', menuPricePerCover: 495, source: 'fallback' },
    ingredients: [...RAW, ...COMP].map((i) => ({ ...i })),
    prep: PREP, dishes: DISHES, courses: COURSES, appliances: APPLIANCES, stations: STATIONS, staff: STAFF,
    dining: { tables: TABLES, walkSpeed: 1.2 },
  };
  const { raw } = explodeRequirements(data, stockForCovers, 1.08);
  for (const i of data.ingredients) if (i.kind !== 'component') {
    const req = raw[i.id] || 0;
    const step = i.unit === 'ea' ? 1 : i.unit === 'g' ? 100 : 100;
    i.onHand = Math.ceil(req / step) * step;
    i.par = Math.ceil((req * 0.15) / step) * step;
  }
  return data;
}
