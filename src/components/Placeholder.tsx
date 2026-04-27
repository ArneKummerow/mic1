/**
 * Stub component used during scaffolding for panels not yet implemented.
 * Each panel renders its title in the panel header and a hint in the body.
 */
export function Placeholder({ title, hint }: { title: string; hint?: string }): JSX.Element {
  return (
    <div className="panel">
      <div className="panel-header">{title}</div>
      <div className="panel-body">
        <p className="placeholder">{hint ?? 'Not yet implemented.'}</p>
      </div>
    </div>
  );
}
