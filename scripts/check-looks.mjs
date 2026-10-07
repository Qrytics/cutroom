// Builds one scene from every look's recipes (3 seeds each) and runs `check` on it — catches recipe props that
// produce unreadable or broken frames. Needs the server running.   node scripts/check-looks.mjs
const B = process.env.CUTROOM_URL || 'http://127.0.0.1:4317';
const j = async (p, m = 'GET', body) => { const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }); const t = await r.json(); if (!r.ok) throw new Error(t.error); return t; };
const looks = (await j('/api/catalog')).looks.map((l) => l.key);
for (const look of looks) for (const seed of [1, 2, 3]) {
  const d = await j(`/api/looks/roll?look=${look}&seed=${seed}`);
  const { id } = await j('/api/projects', 'POST', { name: `qa ${look}` });
  const R = d.recipes;
  const ops = [
    { op: 'setMeta', look, background: d.palette.bg },
    { op: 'addClip', id: 'bg', type: 'component', component: 'background', start: 0, duration: 8, trackId: 'bg', props: R.background.props },
    ...(R.particles ? [{ op: 'addClip', id: 'pt', type: 'component', component: R.particles.component, start: 0, duration: 8, trackId: 'fx', props: R.particles.props }] : []),
    { op: 'addClip', id: 'title', type: 'component', component: 'title', start: 0.2, duration: 2.6, trackId: 'text', props: { ...R.title.props, text: 'Launch day', subtitle: 'A short supporting line' } },
    { op: 'addClip', id: 'head', type: 'component', component: 'text', start: 3, duration: 2.5, trackId: 'text', props: { ...R.headline.props, text: 'Ship it faster' } },
    { op: 'addClip', id: 'body', type: 'component', component: 'text', start: 3.3, duration: 2.2, trackId: 'text2', props: { ...R.body.props, text: 'Supporting copy goes here', y: 700 } },
    { op: 'addClip', id: 'lt', type: 'component', component: 'lowerThird', start: 5.6, duration: 2.3, trackId: 'text', props: { ...R.lowerThird.props, text: 'Ada Lovelace', subtitle: 'Founder' } },
    { op: 'addClip', id: 'cap', type: 'component', component: 'captions', start: 5.6, duration: 2.3, trackId: 'text2', props: { ...R.captions.props, text: 'every edit lands live' } },
    ...(R.texture ? [{ op: 'addClip', id: 'tx', type: 'component', component: 'overlay', start: 0, duration: 8, trackId: 'texture', props: R.texture.props }] : []),
    { op: 'addClip', id: 'music', type: 'sfx', component: 'music', start: 0, duration: 8, trackId: 'music', props: R.music.props },
  ];
  const res = await j(`/api/projects/${id}/ops`, 'POST', { ops });
  const warns = res.results.flatMap((r) => r.warnings ?? []);
  const c = await j(`/api/projects/${id}/check`, 'POST', { audio: false });
  const lines = c.text.split('\n').filter((l) => /^[✖⚠]/.test(l));
  if (warns.length || lines.length) console.log(`${look}#${seed}:`, [...warns.map((w) => '⚠op ' + w), ...lines].join('\n    '));
  await fetch(`${B}/api/projects/${id}`, { method: 'DELETE' });
}
console.log('all looks checked');
