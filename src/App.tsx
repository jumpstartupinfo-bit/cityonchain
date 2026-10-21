import React, { useState, useEffect } from 'react';
import { Nav } from './components/Nav';
import { WorldMap } from './components/WorldMap';
import { CityPageTabs } from './components/CityPageTabs';
import { Marketplace } from './components/Marketplace';
import { MyAssets } from './components/MyAssets';
import { AdminDashboard } from './components/AdminDashboard';
import { Leaderboards } from './components/Leaderboards';
import { AboutData } from './components/AboutData';
import { IncomeCalculator } from './components/IncomeCalculator';
import BridgePanel from './components/BridgePanel';
import ContractSetup from './components/ContractSetup';
import type { City } from './lib/merkle';

type Page = 'world' | 'marketplace' | 'myassets' | 'city' | 'admin' | 'leaderboards' | 'about-data' | 'setup' | 'calculator' | 'bridge';

export default function App() {
  const [page, setPage] = useState<Page>('world');
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [initialTab, setInitialTab] = useState<string | undefined>(undefined);

  // Persist ?ref= param to localStorage so it survives navigation
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && /^0x[0-9a-fA-F]{40}$/.test(ref)) {
      localStorage.setItem('cityonchain:ref', ref);
    }
  }, []);

  function handleSelectCity(city: City, tab?: string) {
    // Special sentinel used by footer "Data credits" link
    if (city.id === -1 && city.name === '__about_data__') {
      setPage('about-data');
      return;
    }
    setSelectedCity(city);
    setInitialTab(tab);
    setPage('city');
  }

  function handleNav(p: Page) {
    setPage(p);
    if (p !== 'city') setSelectedCity(null);
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        backgroundImage: 'var(--bg-gradient)',
      }}
    >
      <Nav page={page} onNav={handleNav} />

      {page === 'world' && <WorldMap onSelectCity={handleSelectCity} />}
      {page === 'city' && selectedCity && (
        <CityPageTabs city={selectedCity} onBack={() => handleNav('world')} initialTab={initialTab} />
      )}
      {page === 'marketplace' && <Marketplace />}
      {page === 'myassets' && <MyAssets onSelectCity={handleSelectCity} />}
      {page === 'leaderboards' && <Leaderboards />}
      {page === 'admin' && <AdminDashboard />}
      {page === 'setup' && <ContractSetup />}
      {page === 'calculator' && <IncomeCalculator />}
      {page === 'bridge' && <BridgePanel />}
      {page === 'about-data' && <AboutData onBack={() => handleNav('world')} />}
    </div>
  );
}
