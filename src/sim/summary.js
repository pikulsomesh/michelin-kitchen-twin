// End-of-service summary: the shift report's headline numbers, shaped for the on-screen card.
// Each row carries both vocabularies (PRD section 2) so the card follows the Kitchen / Factory toggle.
import { avgOee } from './scenarios.js';

const pct = (x) => `${Math.round(x * 100)}%`;
const mins = (s) => (s ? `${Math.round(s / 60)} min` : '–');
const clock = (t) => `${String(Math.floor(t / 3600) % 24).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}`;

/**
 * state: a final sim snapshot; config: the sim config (doorsOpen); endT: when the kitchen closed.
 * Returns { headline: [kitchen, factory], tiles: [{ id, label: [k, f], value, note?, tone? }], bottleneck }.
 */
export function serviceSummary(state, config, endT = state.endT ?? state.t) {
  const k = state.kpis;
  const c = state.covers;
  const expected = c.booked - c.noShows;
  const oee = avgOee(state);
  const tiles = [
    { id: 'covers', label: ['Covers served', 'Units shipped'], value: `${c.finished} / ${expected}`,
      note: c.noShows ? `${c.noShows} no-show${c.noShows > 1 ? 's' : ''}` : 'no no-shows', tone: c.finished >= expected ? 'good' : 'warn' },
    { id: 'close', label: ['Kitchen closed', 'Shift ended'], value: clock(endT), note: `${(Math.max(0, endT - config.doorsOpen) / 3600).toFixed(1)} h after doors` },
    { id: 'ticket', label: ['Ticket time p90', 'Lead time p90'], value: mins(k.ticketP90), note: `avg ${mins(k.ticketAvg)}` },
    { id: 'wait', label: ['Guest wait p90', 'Customer wait p90'], value: mins(k.guestWaitP90) },
    { id: 'plates', label: ['Plates / hour', 'Throughput / hour'], value: String(Math.round(k.avgPortionsHr)), note: `${k.portionsServed} plates` },
    { id: 'fpy', label: ['First-pass yield', 'First-pass yield'], value: pct(k.firstPassYield), note: k.remakes ? `${k.remakes} re-fired` : 'nothing re-fired', tone: k.firstPassYield >= 0.97 ? 'good' : 'warn' },
    { id: 'oee', label: ['Avg appliance OEE', 'Avg machine OEE'], value: pct(oee) },
    { id: 'labor', label: ['Line utilization', 'Labor utilization'], value: pct(k.lineUtil) },
    { id: 'food', label: ['Food cost', 'Material cost'], value: k.revenue ? pct(k.foodCostPct) : `$${Math.round(k.foodCost)}`, note: `$${Math.round(k.wasteCost)} wasted` },
    { id: 'stockouts', label: ['86s', 'Stockouts'], value: String(k.stockoutCount), tone: k.stockoutCount ? 'warn' : 'good' },
    { id: 'energy', label: ['Energy', 'Energy'], value: `${Math.round(k.kwh)} kWh` },
  ];
  const served = c.finished >= expected;
  return {
    headline: [
      served ? `Service complete: all ${c.finished} guests fed.` : `Service complete: ${c.finished} of ${expected} guests fed.`,
      served ? `Shift complete: ${c.finished} of ${expected} units shipped.` : `Shift complete: ${c.finished} of ${expected} units shipped, plan missed.`,
    ],
    tiles,
    bottleneck: k.bottleneck?.text || null,
  };
}
