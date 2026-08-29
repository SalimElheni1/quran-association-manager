import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '@renderer/components/Sidebar';
import MenuIcon from '@renderer/components/icons/MenuIcon';
import '@renderer/styles/Layout.css';
import OnboardingGuide from '@renderer/components/OnboardingGuide';

function MainLayout() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === '1',
  );

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  return (
    <div className="app-container">
      {/* Direction contract (seed 4fefdb29) — woven workspace.
          THESIS: restrained, handcrafted workspace drawn from North African
          warp-and-weft weaving — honest geometric bands, natural wool palette,
          disciplined rule-lines — replacing the generic Bootstrap admin
          without sacrificing task efficiency.
          OWN-WORLD (palette shifted under user direction to the Royal calm
          line): warm off-white ground #F9F8F3, deep sage-green dyed-wool
          sidebar, muted gold action accent, hairline woven section bands,
          Cairo type, collapsible icon-only ↔ icon+label rail.
          STORY: staff open a warm, ordered, trustworthy workspace.
          FIRST VIEWPORT: Login split — sage identity panel + ivory form,
          gold primary.
          FORM: replacement visual world, candidate 5 of grounded list,
          raised by orizuru/zine/doujin.
          FINISH: unreviewed and undocumented is unfinished; this build ends
          with the finish review, the verdict, DESIGN.md, and every shipping
          raster carrying its provenance. */}
      <Sidebar collapsed={collapsed} />
      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="collapse-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
            aria-expanded={!collapsed}
          >
            <MenuIcon />
          </button>
          <span className="topbar-title">منصة الرابطة — إدارة القرآن الكريم</span>
        </header>
        <main className="content-area">
          <Outlet />
          <OnboardingGuide />
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
