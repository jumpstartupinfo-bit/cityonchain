import React from 'react';

export function AboutData({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, marginBottom: 32, padding: 0 }}
      >
        ← Back
      </button>
      <h1 style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 28, margin: '0 0 8px' }}>Data Credits</h1>
      <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.7, margin: '0 0 24px' }}>
        CityOnChain uses geographical city data sourced from{' '}
        <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          GeoNames
        </a>
        , licensed under the{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          Creative Commons Attribution 4.0 International License (CC BY 4.0)
        </a>
        .
      </p>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
        <h2 style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Attribution</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0, lineHeight: 1.7 }}>
          City data: GeoNames (<a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>geonames.org</a>),
          licensed under{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
            CC BY 4.0
          </a>
          . Delivered via the{' '}
          <a href="https://www.npmjs.com/package/all-the-cities" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
            all-the-cities
          </a>{' '}
          npm package. Cities with population ≥ 15,000 are included.
        </p>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
        <h2 style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Disclaimer</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0, lineHeight: 1.7 }}>
          CityOnChain is not affiliated with, endorsed by, or connected to any real city, municipality, government, or official body.
          City names and data are used solely for identification purposes within this onchain game.
          Ownership of a CityOnChain NFT does not confer any real-world rights, authority, or connection to the named location.
          No guaranteed returns. This is an experimental blockchain application. Participate at your own risk.
        </p>
      </div>
    </div>
  );
}
