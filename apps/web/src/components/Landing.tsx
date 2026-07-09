const STEPS: { title: string; body: string }[] = [
  {
    title: 'Clarify',
    body: 'The agent asks a few questions to pin down size, style, and intent before spending a generation.',
  },
  {
    title: 'Generate',
    body: 'Your description is turned into a 3D mesh via a generation provider — you own the outcome, not the model.',
  },
  {
    title: 'Validate',
    body: 'An automated printability pipeline checks the mesh: watertightness, manifold edges, orientation, wall thickness.',
  },
  {
    title: 'Repair',
    body: 'Cheap defects are fixed in place. If a mesh is beyond light repair, the agent regenerates instead of doing surgery.',
  },
  {
    title: 'Export',
    body: 'You get a print-ready file plus a report that explains exactly why it will print on the first try.',
  },
];

const EXAMPLE: { role: 'you' | 'drukar'; text: string }[] = [
  { role: 'you', text: 'A low-poly fox figurine, about 6cm tall, sitting.' },
  {
    role: 'drukar',
    text: 'Got it. Should it be a solid print (heavier, sturdier) or hollowed to save filament? And do you want a flat base so it stands without supports?',
  },
  { role: 'you', text: 'Hollowed, flat base, no supports.' },
  {
    role: 'drukar',
    text: 'Generating… validating printability… mesh was watertight after filling 2 small holes. Exported fox.glb — printable, no supports needed. Report attached.',
  },
];

function Bubble({ role, text }: { role: 'you' | 'drukar'; text: string }) {
  const isUser = role === 'you';
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <span className="mb-0.5 px-1 text-[10px] uppercase tracking-wide text-neutral-500">
        {isUser ? 'You' : 'Drukar'}
      </span>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
          isUser ? 'bg-sky-700' : 'bg-neutral-800'
        }`}
      >
        {text}
      </div>
    </div>
  );
}

export function Landing() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-16 px-6 py-16">
        {/* Hero */}
        <header className="flex flex-col gap-6">
          <span className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            друкар — printer / printmaker
          </span>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            Describe it in words.
            <br />
            Get a <span className="text-sky-400">print-ready</span> 3D model.
          </h1>
          <p className="max-w-2xl text-lg text-neutral-400">
            Drukar is an AI agent that turns a plain-text description into a 3D file that prints
            successfully on the first try. The bet isn&rsquo;t generation quality — it&rsquo;s the
            guarantee that what you download actually prints.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="#/app"
              className="rounded-md bg-sky-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              Open the workbench →
            </a>
            <span className="text-xs text-neutral-500">
              Runs fully offline with the mock provider — no API key needed.
            </span>
          </div>
        </header>

        {/* Pipeline */}
        <section className="flex flex-col gap-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            How it works
          </h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
              >
                <span className="text-xs font-mono text-sky-400">{`0${i + 1}`}</span>
                <span className="font-medium">{step.title}</span>
                <span className="text-xs leading-relaxed text-neutral-400">{step.body}</span>
              </li>
            ))}
          </ol>
          <p className="max-w-2xl text-sm text-neutral-500">
            If a mesh can&rsquo;t be fixed cheaply, Drukar regenerates with an adjusted prompt rather
            than attempting heavy repair — regeneration is cheaper than surgery.
          </p>
        </section>

        {/* Example run */}
        <section className="flex flex-col gap-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            An example run
          </h2>
          <div className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
            {EXAMPLE.map((m, i) => (
              <Bubble key={i} role={m.role} text={m.text} />
            ))}
          </div>
        </section>

        {/* Footer CTA */}
        <section className="flex flex-col items-start gap-4 border-t border-neutral-800 pt-10">
          <h2 className="text-2xl font-semibold">Ready to make something?</h2>
          <a
            href="#/app"
            className="rounded-md bg-sky-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-500"
          >
            Open the workbench →
          </a>
        </section>
      </div>
    </div>
  );
}
