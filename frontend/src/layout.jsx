import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AppShell, Brand, Button, CommandPaletteProvider, MobileNav, Sidebar, ThemeSwitcher, Topbar, useCommandPalette } from './ui-kit';
import { FilePlus2, FolderSearch, LayoutDashboard, Search } from 'lucide-react';
import { api } from './api';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, mobile: true },
  { id: 'new', label: 'New investigation', to: '/new', icon: FilePlus2, mobile: true },
];

function Frame({ crumbs, wide, children, actions }) {
  const { pathname } = useLocation();
  const palette = useCommandPalette();
  return (
    <AppShell
      sidebar={<Sidebar brand={<Brand name="TraceLine" to="/" />} items={NAV} activePath={pathname}
                        actions={<Button as={Link} to="/new" size="sm" variant="primary" block icon={FilePlus2}>New investigation</Button>}
                        footer={<p className="t-caption text-fg-3">Investigation support. No fault determination.</p>} />}
      topbar={<Topbar brand={<Brand name="TraceLine" to="/" />} breadcrumbs={crumbs} onSearch={palette.open} searchPlaceholder="Jump to a case or action…" right={<>{actions}<ThemeSwitcher align="right" /></>} />}
      mobileNav={<MobileNav items={NAV} activePath={pathname} />}
      contentClassName={wide ? 'max-w-none !pt-4 lg:!pt-5 !pb-24 lg:!pb-8' : undefined}
    >
      {children}
    </AppShell>
  );
}

/** App frame for every page except the landing page. Loads the case list once for the command palette (real cases only). */
export default function Shell({ crumbs = [], wide = false, actions, children }) {
  const nav = useNavigate();
  const [cases, setCases] = useState([]);
  useEffect(() => { api.cases().then((r) => setCases(r.items)).catch(() => setCases([])); }, []);
  const commands = useMemo(() => [
    { id: 'go-dash', group: 'Navigate', label: 'Dashboard', icon: LayoutDashboard, run: () => nav('/dashboard') },
    { id: 'go-new', group: 'Navigate', label: 'New investigation', icon: FilePlus2, run: () => nav('/new') },
    ...cases.flatMap((c) => [
      { id: `open-${c.id}`, group: 'Cases', label: `Open ${c.title}`, icon: FolderSearch, keywords: [c.code, c.designation], run: () => nav(`/cases/${c.id}`) },
      { id: `rep-${c.id}`, group: 'Reports', label: `Report: ${c.title}`, icon: Search, keywords: [c.code], run: () => nav(`/cases/${c.id}/report`) },
    ]),
  ], [cases, nav]);
  return (
    <CommandPaletteProvider commands={commands} placeholder="Jump to a case, report or action…">
      <Frame crumbs={[{ label: 'TraceLine', to: '/dashboard' }, ...crumbs]} wide={wide} actions={actions}>{children}</Frame>
    </CommandPaletteProvider>
  );
}
