import React, { useState, useMemo } from 'react';
import { CITY_PRICE_BY_DISPLAY_TIER, DISTRICT_COUNT_BY_DISPLAY_TIER, computeDistrictPrice, tierLabel } from '@/contracts';

type DisplayTier = 1 | 2 | 3 | 4 | 5 | 6;

// District price = cityPrice * 5% (500 bps), floor $5


// Revenue assumptions (adjustable by user)
interface Assumptions {
  tier: DisplayTier;
  // District
  districtsBought: number;
  // Ad slots
  adSlotsPerDistrict: number;
  adDailyRateUsdc: number;
  adOccupancyDays: number; // days/month booked
  // Storefronts
  unitsPerDistrict: number;
  unitMonthlyRentUsdc: number;
  unitOccupancyPct: number; // 0–100
  // Events
  eventsPerMonth: number;
  ticketPriceUsdc: number;
  ticketsSoldPerEvent: number;
  // Leases
  leasesPerMonth: number;
  leaseFeeUsdc: number;
  // Passes
  cityPassPriceUsdc: number;
  cityPassesSoldPerMonth: number;
  districtPassPriceUsdc: number;
  districtPassesSoldPerMonth: number;
  // Mayor share
  mayorSharePct: number; // 20% default
  districtOwnerSharePct: number; // 15% default
}

const DEFAULTS: Assumptions = {
  tier: 4,
  districtsBought: 2,
  adSlotsPerDistrict: 1, adDailyRateUsdc: 5, adOccupancyDays: 20,
  unitsPerDistrict: 2, unitMonthlyRentUsdc: 50, unitOccupancyPct: 70,
  eventsPerMonth: 1, ticketPriceUsdc: 10, ticketsSoldPerEvent: 50,
  leasesPerMonth: 0, leaseFeeUsdc: 100,
  cityPassPriceUsdc: 20, cityPassesSoldPerMonth: 5,
  districtPassPriceUsdc: 10, districtPassesSoldPerMonth: 3,
  mayorSharePct: 20,
  districtOwnerSharePct: 15,
};

function Row({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
      <div>
        <span className="text-sm text-[var(--text)]">{label}</span>
        {sub && <span className="block text-xs text-[var(--text-muted)]">{sub}</span>}
      </div>
      <span className="text-sm font-semibold text-[var(--green)]">+${value.toFixed(2)}</span>
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, format, onChange }: {
  label: string; value: number; min: number; max: number; step?: number;
  format?: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="font-medium text-[var(--text)]">{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 accent-[var(--green)] cursor-pointer" />
    </div>
  );
}

export function IncomeCalculator() {
  const [a, setA] = useState<Assumptions>(DEFAULTS);
  const set = (k: keyof Assumptions, v: number) =>
    setA(prev => ({ ...prev, [k]: v }));

  const cityPriceRaw = CITY_PRICE_BY_DISPLAY_TIER[a.tier] ?? 400n;
  const cityPrice = typeof cityPriceRaw === 'bigint' ? Number(cityPriceRaw) / 1_000_000 : Number(cityPriceRaw);
  const dPrice = Number(computeDistrictPrice(typeof cityPriceRaw === 'bigint' ? cityPriceRaw : BigInt(cityPriceRaw))) / 1_000_000;
  const districtCount = DISTRICT_COUNT_BY_DISPLAY_TIER[a.tier] ?? 8;

  const calc = useMemo(() => {
    const PLATFORM_FEE = 0.05;
    const MAYOR_SHARE = a.mayorSharePct / 100;
    const DIST_SHARE = a.districtOwnerSharePct / 100;

    // Ad revenue — district owners earn ad revenue directly (slot owner)
    const adMonthly = a.districtsBought * a.adSlotsPerDistrict * a.adDailyRateUsdc * a.adOccupancyDays * (1 - PLATFORM_FEE);

    // Storefront rent — district owners earn rent directly
    const rentMonthly = a.districtsBought * a.unitsPerDistrict * a.unitMonthlyRentUsdc * (a.unitOccupancyPct / 100) * (1 - PLATFORM_FEE);

    // Event ticket revenue — event organizer earns
    const eventRevenue = a.eventsPerMonth * a.ticketPriceUsdc * a.ticketsSoldPerEvent;
    const eventMonthly = eventRevenue * (1 - PLATFORM_FEE);

    // Lease fee — city registry routes to RevenueSplitter, mayor gets mayor share
    const leaseMonthly = a.leasesPerMonth * a.leaseFeeUsdc * MAYOR_SHARE;

    // City pass revenue — city mayor earns 80% directly
    const cityPassMonthly = a.cityPassesSoldPerMonth * a.cityPassPriceUsdc * 0.80;

    // District pass revenue — district owner earns 80%
    const districtPassMonthly = a.districtsBought * a.districtPassesSoldPerMonth * a.districtPassPriceUsdc * 0.80;

    // Revenue splitter share — mayor's % of all platform revenue
    // (simplified: mayor earns mayorSharePct of all revenue flowing through RevenueSplitter)
    const revSplitterMonthly = (adMonthly + rentMonthly + eventMonthly) * MAYOR_SHARE;

    // District owner's share from RevenueSplitter
    const distRevSplitter = (adMonthly + rentMonthly + eventMonthly) * DIST_SHARE;

    const mayorTotal = cityPassMonthly + leaseMonthly + revSplitterMonthly;
    const districtTotal = adMonthly + rentMonthly + eventMonthly + districtPassMonthly + distRevSplitter;
    const total = mayorTotal + districtTotal;

    return { adMonthly, rentMonthly, eventMonthly, leaseMonthly, cityPassMonthly, districtPassMonthly, revSplitterMonthly, distRevSplitter, mayorTotal, districtTotal, total };
  }, [a]);

  const usd = (v: number) => `$${v.toFixed(2)}`;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg, var(--green) 0%, var(--green-dim) 100%)' }}>
        <h2 className="text-xl font-bold mb-1">Income Calculator</h2>
        <p className="text-sm opacity-80">Project your monthly earnings as a city mayor and district owner</p>
        <div className="mt-4 flex gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">${calc.total.toFixed(0)}</div>
            <div className="text-xs opacity-70">Total / month</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">${calc.mayorTotal.toFixed(0)}</div>
            <div className="text-xs opacity-70">Mayor income</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">${calc.districtTotal.toFixed(0)}</div>
            <div className="text-xs opacity-70">District income</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Settings */}
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface)]">
            <h3 className="font-semibold text-sm text-[var(--text)] mb-3">City Setup</h3>
            {/* Tier picker */}
            <div className="mb-3">
              <p className="text-xs text-[var(--text-muted)] mb-1.5">City tier</p>
              <div className="grid grid-cols-3 gap-1">
                {([1,2,3,4,5,6] as DisplayTier[]).map(t => (
                  <button key={t} onClick={() => set('tier', t)}
                    className={`py-1 text-xs rounded-lg border transition-colors font-medium ${a.tier === t ? 'bg-[var(--green)] text-white border-[var(--green)]' : 'bg-transparent text-[var(--text-muted)] border-[var(--border)]'}`}>
                    {tierLabel(t)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Mint price: ${cityPrice} · Districts: {districtCount} · District price: ${dPrice}
              </p>
            </div>
            <Slider label="Districts you own" value={a.districtsBought} min={0} max={districtCount} onChange={v => set('districtsBought', v)} />
            <Slider label="Mayor revenue share" value={a.mayorSharePct} min={5} max={30} format={v => `${v}%`} onChange={v => set('mayorSharePct', v)} />
          </div>

          <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface)] space-y-3">
            <h3 className="font-semibold text-sm text-[var(--text)]">Ad Slots</h3>
            <Slider label="Ad slots per district" value={a.adSlotsPerDistrict} min={0} max={5} onChange={v => set('adSlotsPerDistrict', v)} />
            <Slider label="Daily rate (USDC)" value={a.adDailyRateUsdc} min={1} max={50} format={usd} onChange={v => set('adDailyRateUsdc', v)} />
            <Slider label="Days booked / month" value={a.adOccupancyDays} min={0} max={30} onChange={v => set('adOccupancyDays', v)} />
          </div>

          <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface)] space-y-3">
            <h3 className="font-semibold text-sm text-[var(--text)]">Storefronts</h3>
            <Slider label="Units per district" value={a.unitsPerDistrict} min={0} max={10} onChange={v => set('unitsPerDistrict', v)} />
            <Slider label="Monthly rent (USDC)" value={a.unitMonthlyRentUsdc} min={10} max={500} step={10} format={usd} onChange={v => set('unitMonthlyRentUsdc', v)} />
            <Slider label="Occupancy rate" value={a.unitOccupancyPct} min={0} max={100} format={v => `${v}%`} onChange={v => set('unitOccupancyPct', v)} />
          </div>
        </div>

        {/* Right column settings + breakdown */}
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface)] space-y-3">
            <h3 className="font-semibold text-sm text-[var(--text)]">Events</h3>
            <Slider label="Events per month" value={a.eventsPerMonth} min={0} max={10} onChange={v => set('eventsPerMonth', v)} />
            <Slider label="Ticket price" value={a.ticketPriceUsdc} min={1} max={100} format={usd} onChange={v => set('ticketPriceUsdc', v)} />
            <Slider label="Tickets sold / event" value={a.ticketsSoldPerEvent} min={0} max={500} step={10} onChange={v => set('ticketsSoldPerEvent', v)} />
          </div>

          <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface)] space-y-3">
            <h3 className="font-semibold text-sm text-[var(--text)]">City Passes</h3>
            <Slider label="Pass price (USDC)" value={a.cityPassPriceUsdc} min={1} max={200} step={1} format={usd} onChange={v => set('cityPassPriceUsdc', v)} />
            <Slider label="Passes sold / month" value={a.cityPassesSoldPerMonth} min={0} max={100} onChange={v => set('cityPassesSoldPerMonth', v)} />
            <Slider label="District pass price" value={a.districtPassPriceUsdc} min={1} max={100} format={usd} onChange={v => set('districtPassPriceUsdc', v)} />
            <Slider label="District passes / month" value={a.districtPassesSoldPerMonth} min={0} max={50} onChange={v => set('districtPassesSoldPerMonth', v)} />
          </div>

          {/* Breakdown */}
          <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface)]">
            <h3 className="font-semibold text-sm text-[var(--text)] mb-2">Monthly Breakdown</h3>
            <Row label="Ad revenue" value={calc.adMonthly} sub={`${a.districtsBought} district(s) × ${a.adSlotsPerDistrict} slot(s)`} />
            <Row label="Storefront rent" value={calc.rentMonthly} sub={`${a.unitOccupancyPct}% occupancy`} />
            <Row label="Event tickets" value={calc.eventMonthly} sub={`${a.eventsPerMonth} event(s)`} />
            <Row label="Lease fees" value={calc.leaseMonthly} sub="Mayor's share" />
            <Row label="City passes" value={calc.cityPassMonthly} sub="80% to mayor" />
            <Row label="District passes" value={calc.districtPassMonthly} sub="80% to district owner" />
            <div className="flex items-center justify-between pt-3 mt-1">
              <span className="font-bold text-[var(--text)]">Total</span>
              <span className="font-bold text-lg text-[var(--green)]">${calc.total.toFixed(2)} / mo</span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-[var(--text-muted)] text-center">
        Projections only. Actual earnings depend on market activity, occupancy, and platform fees. Not financial advice.
      </p>
    </div>
  );
}
