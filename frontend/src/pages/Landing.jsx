import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppWindow, Badge, Brand, Button, CompareColumns, CtaBand, FeatureGrid, GradientText, LandingHero, LandingNav, LandingSection, SectionHeading, SiteFooter, StepList } from '../ui-kit';
import { AlertTriangle, Clock3, FileSearch, GitCompare, Route as RouteIcon, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import Timeline from '../components/Timeline';

/** The hero shows the real timeline of the first synthetic demo case, fetched from the API. If there is no case yet it says so. */
function LivePreview() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const cases = (await api.cases()).items;
        const demo = cases.find((c) => /Intersection collision/.test(c.title) && c.designation === 'synthetic') || cases.find((c) => c.designation === 'synthetic');
        if (!demo) return setErr('No demo case yet. Run scripts/seed_demo.py to create the synthetic demo cases.');
        const tl = await api.timeline(demo.id);
        setData({ tl, caseId: demo.id, title: demo.title });
      } catch (e) {
        setErr(e.code === 'NO_RECONSTRUCTION' ? 'The demo case has no reconstruction yet.' : 'The API is not reachable. Start the backend on port 8000.');
      }
    })();
  }, []);
  return (
    <AppWindow title="traceline / demo case · synthetic data">
      {data ? (
        <>
          <p className="t-caption mb-3 text-fg-3">{data.title} · rendered from the API, not an illustration</p>
          <Timeline tl={data.tl} gaps={[]} compact currentMs={0} onSelect={() => {}} activeId={null} />
          <Link to={`/cases/${data.caseId}`} className="t-small mt-4 inline-block text-accent-text">Open this case →</Link>
        </>
      ) : (
        <p className="t-small text-fg-2">{err || 'Loading the demo case…'}</p>
      )}
    </AppWindow>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <LandingNav
        brand={<Brand name="TraceLine" />}
        links={[{ label: 'Platform', href: '#platform' }, { label: 'How it works', href: '#how' }, { label: 'Principles', href: '#principles' }]}
        actions={<Button as={Link} to="/dashboard" size="sm">Launch workspace</Button>}
      />
      <LandingHero
        badge="Investigation support · never a verdict"
        title={<>Every second matters.<br /><GradientText>Reconstruct what the evidence shows.</GradientText></>}
        description="TraceLine lines up dashcam and CCTV footage, witness statements and vehicle sensor logs on one timeline, shows where they agree and disagree, and says plainly where evidence is missing."
        actions={<><Button as={Link} to="/dashboard" size="lg">Launch investigation workspace</Button><Button as="a" href="#platform" size="lg" variant="outline">Explore the platform</Button></>}
        bullets={['Observations kept apart from inferences', 'Uncertainty shown on every time', 'Every statement traces to its evidence', 'Runs on a laptop; no GPU needed']}
        visual={<LivePreview />}
      />
      <LandingSection id="platform">
        <SectionHeading eyebrow="Platform" title="From fragmented evidence to a checkable timeline" description="Each capability is built so an investigator can see why the system says what it says." />
        <FeatureGrid
          items={[
            { icon: Clock3, title: 'Clock-aware timeline', description: 'Sources join one clock only through a recorded relation. Anything else stays visibly separate instead of being guessed into order.' },
            { icon: GitCompare, title: 'Contradictions and agreement', description: 'Witness claims are compared with video and sensor data for the same confirmed vehicle. Independent agreement is listed too.' },
            { icon: AlertTriangle, title: 'Gaps, not guesses', description: 'Missing frames, sensor gaps, unsynchronized sources and unconfirmed identities become findings with a suggested next step.' },
            { icon: RouteIcon, title: 'Trajectories with limits', description: 'Pixel paths for every camera; ground-plane paths only where a camera is calibrated, with per-point uncertainty.' },
            { icon: FileSearch, title: 'Traceable summaries', description: 'Each event summary separates observations, detections, claims, sensor readings and inferences, with source references.' },
            { icon: ShieldCheck, title: 'Validated report', description: 'A sixteen-section report that refuses language assigning fault, with a checklist of what was verified.' },
          ]}
        />
      </LandingSection>
      <LandingSection id="how">
        <SectionHeading eyebrow="How it works" title="Four steps, each reviewable" />
        <StepList items={[
          { title: 'Upload', description: 'Videos, statements and sensor files are stored unchanged with a hash. Originals are never edited.' },
          { title: 'Extract', description: 'Detections, tracks, claims and sensor events are produced by pinned models and deterministic rules.' },
          { title: 'Correlate', description: 'Sources are placed on one clock where the relation is known; the rules compare what can be compared.' },
          { title: 'Review', description: 'The investigator confirms identities, reviews findings and exports the report.' },
        ]} />
      </LandingSection>
      <LandingSection id="principles">
        <SectionHeading eyebrow="Principles" title="Why this matters" />
        <CompareColumns
          left={{ title: 'Fragmented evidence', items: ['Clips and notes in separate folders', 'Clocks that disagree, unnoticed', 'Statements remembered, not checked', 'Gaps discovered late'] }}
          right={{ title: 'Synchronized reconstruction', items: ['One timeline where relations are known', 'Offsets and uncertainty shown', 'Claims checked against what was recorded', 'Gaps listed with what to obtain next'] }}
        />
      </LandingSection>
      <CtaBand title="Turn fragmented evidence into a clearer timeline." description="The demo cases are synthetic and labelled as such everywhere." actions={<Button as={Link} to="/dashboard" size="lg" variant="outline">Start an investigation</Button>} />
      <SiteFooter
        brand={<Brand name="TraceLine" />}
        description="Evidence reconstruction for investigators. Not a fault-finding system."
        groups={[{ title: 'Product', links: [{ label: 'Workspace', href: '/dashboard' }] }]}
        copyright="TraceLine · built for the CBIT Hacktoberfest '26 hackathon · demo data is synthetic"
        legal={[{ label: 'Investigation support only' }]}
      />
    </div>
  );
}
