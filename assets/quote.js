// GreenState Tree Service — ballpark quote engine
// Produces an AVERAGE estimate range only. Final price is always confirmed on-site.
// Internal rate figures below are used to calibrate the math only — never shown
// to the visitor as itemized line items, per Alex's request to keep the real
// per-job rate card private. Note: this is a static, client-side-only site, so
// "private" means not displayed on the page — anyone reading the JS source could
// still find these numbers. True privacy would require a server-side calculator.

const RATES = {
  removal: { base: 350, perFoot: 14 },      // height-driven, full-service (cleanup included)
  pruning: { base: 150, perFoot: 6 },       // height-driven, lighter labor than removal
  permit:  { flat: 225 },                    // removal & replant permit handling
  cleanup: { perHourLow: 300, perHourHigh: 400 }  // storm cleanup labor — real hourly rate
};
// Storm risk assessment is bundled into the free-estimate visit, same as any
// other on-site look — not a separately billed service.

const COMPLEXITY_MULT = {
  open:   1.0,   // open yard, easy access
  tight:  1.35,  // tight space / near structures
  hazard: 1.7    // hazardous / high-risk removal
};

// Customer hauls their own wood instead of full cleanup — typically 1/3 to 1/2 of full cost.
// This is sized for REMOVAL specifically, where hauling an entire tree's wood is a huge
// share of the job. Pruning's "cleanup" is just branch debris — a much smaller share of
// the total labor — so it gets its own, much more modest discount below.
const NO_CLEANUP_MULT = { low: 0.33, high: 0.5 };
const PRUNING_NO_CLEANUP_MULT = { low: 0.85, high: 0.90 };
// Storm Cleanup self-haul: confirmed real discount, same 35% off both ends,
// still subject to the $250 floor below.
const CLEANUP_NO_CLEANUP_MULT = { low: 0.65, high: 0.65 };

const SENIOR_DISCOUNT = 0.10;

// Tree height now slides continuously from 25ft to 150ft (Portland's average
// mature fir) instead of Small/Medium/Large buckets. Manlift is a flat add-on;
// buck-to-rounds and keep-the-wood both scale with actual height instead of
// jumping between fixed tiers — a real $200 job and a real $600 job shouldn't
// get treated the same just because they're both "large."
const HEIGHT_MIN = 25, HEIGHT_MAX = 150;

// Only a tree at or above this height has enough trunk to make bucking rounds
// or keeping the wood meaningful — below it, neither option is offered at all.
const TRUNK_THRESHOLD = 45;

function interp(height, vLow, vHigh) {
  const t = (Math.max(TRUNK_THRESHOLD, Math.min(HEIGHT_MAX, height)) - TRUNK_THRESHOLD) / (HEIGHT_MAX - TRUNK_THRESHOLD);
  return vLow + t * (vHigh - vLow);
}

const ADDONS = {
  manlift: { low: 450, high: 450 }  // flat — not height-dependent
};

// Canopy width (spread) — a secondary sizing dimension alongside height.
// Default (25ft) is calibrated to produce NO change from the existing
// height-only pricing, so nothing already reviewed shifts unless the
// customer actually moves this slider away from the default.
const WIDTH_MIN = 10, WIDTH_MAX = 60, WIDTH_DEFAULT = 25;
function widthMultiplier(width) {
  const w = width || WIDTH_DEFAULT;
  if (w <= WIDTH_DEFAULT) {
    const t = (w - WIDTH_MIN) / (WIDTH_DEFAULT - WIDTH_MIN);
    return 0.9 + t * (1.0 - 0.9);
  }
  const t = (w - WIDTH_DEFAULT) / (WIDTH_MAX - WIDTH_DEFAULT);
  return 1.0 + t * (1.3 - 1.0);
}

// Pruning foliage load — how much of the LIVE canopy is being thinned.
// Fixed customer-facing options only: 10 / 20 / 30, plus 50 as an explicit
// above-standard request (see the warning modal in the UI). 20% is treated
// as the calibrated baseline — matches the existing, already-reviewed
// pruning numbers exactly, so nothing shifts unless the customer picks a
// different amount.
const FOLIAGE_MULT = { 10: 0.75, 20: 1.0, 30: 1.25, 50: 1.6 };

// Deadwood removal is NOT subject to the live-canopy limit at all (dead
// wood isn't living tissue) — flat add-on, independent of the thinning %.
const DEADWOOD_ADDON = { low: 75, high: 150 };

// No billable job should price out under roughly one hour of real labor —
// even a quick site visit has drive time, setup, and a minimum trip charge.
// This is the FINAL floor, applied after every other adjustment including
// discounts, so nothing (including the senior discount) can undercut it.
// Storm Risk Assessment is exempt — it's explicitly free, not a billed job.
const MIN_PRICE = 250;

// A 25ft "tree" is often really just a large bush — quick, easy work that
// shouldn't carry the same base cost as a real removal job. The formula
// blends smoothly from the $250 floor at 25ft back to the normal per-foot
// rate by 35ft, so nothing above 35ft changes at all — only the smallest
// end softens.
const SMALL_BLEND_MIN = 25, SMALL_BLEND_MAX = 35;

function removalRaw(height) {
  const normal = RATES.removal.base + RATES.removal.perFoot * height;
  if (height >= SMALL_BLEND_MAX) return normal;
  const targetAt25 = MIN_PRICE / 0.85; // raw value that makes the low end land exactly on the floor
  const blendAt35 = RATES.removal.base + RATES.removal.perFoot * SMALL_BLEND_MAX;
  const t = (height - SMALL_BLEND_MIN) / (SMALL_BLEND_MAX - SMALL_BLEND_MIN);
  return targetAt25 + t * (blendAt35 - targetAt25);
}

function computeEstimate(state) {
  const { service, size, complexity, hours, noCleanup, addons, keepWood, senior, width, foliagePct, deadwood } = state;

  // free, no matter what else is selected — bundled into the estimate visit
  if (service === 'storm') return { low: 0, high: 0 };

  let low = 0, high = 0;
  const height = size || 45;

  if (service === 'removal') {
    const base = removalRaw(height);
    low = base * 0.85;
    high = base * 1.25;
    const wMult = widthMultiplier(width);
    low *= wMult; high *= wMult;
    if (noCleanup) {
      low *= NO_CLEANUP_MULT.low;
      high *= NO_CLEANUP_MULT.high;
    }
  } else if (service === 'pruning') {
    const base = RATES.pruning.base + RATES.pruning.perFoot * height;
    low = base * 0.85;
    high = base * 1.2;
    const wMult = widthMultiplier(width);
    low *= wMult; high *= wMult;
    const fMult = FOLIAGE_MULT[foliagePct] || FOLIAGE_MULT[20];
    low *= fMult; high *= fMult;
    if (deadwood) {
      low += DEADWOOD_ADDON.low; high += DEADWOOD_ADDON.high;
    }
    if (noCleanup) {
      low *= PRUNING_NO_CLEANUP_MULT.low;
      high *= PRUNING_NO_CLEANUP_MULT.high;
    }
  } else if (service === 'permit') {
    low = RATES.permit.flat * 0.9;
    high = RATES.permit.flat * 1.1;
  } else if (service === 'cleanup') {
    const h = hours || 3;
    low = RATES.cleanup.perHourLow * h;
    high = RATES.cleanup.perHourHigh * h;
    if (noCleanup) {
      low *= CLEANUP_NO_CLEANUP_MULT.low;
      high *= CLEANUP_NO_CLEANUP_MULT.high;
    }
  }

  const mult = COMPLEXITY_MULT[complexity] || 1.0;
  low *= mult;
  high *= mult;

  // add-ons fold into the total silently — no per-item breakdown shown to the visitor
  if (addons && addons.length) {
    addons.forEach(key => {
      const a = ADDONS[key];
      if (a) { low += a.low; high += a.high; }
    });
    if (addons.includes('buckRounds') && service === 'removal' && height >= TRUNK_THRESHOLD) {
      const amt = interp(height, 200, 400);
      low += amt; high += amt;
    }
  }

  // keeping the wood only makes sense for a Tree Removal with real trunk —
  // pruning doesn't bring down a trunk at all
  if (keepWood && service === 'removal' && !noCleanup && height >= TRUNK_THRESHOLD) {
    const savings = interp(height, 200, 600);
    low -= savings;
    high -= savings;
  }

  if (senior) {
    low *= (1 - SENIOR_DISCOUNT);
    high *= (1 - SENIOR_DISCOUNT);
  }

  // absolute final floor — nothing below this, even after discounts
  low = Math.max(low, MIN_PRICE);
  high = Math.max(high, low);

  return {
    low: Math.round(low / 5) * 5,
    high: Math.round(high / 5) * 5
  };
}

function fmt(n) {
  return '$' + n.toLocaleString('en-US');
}
