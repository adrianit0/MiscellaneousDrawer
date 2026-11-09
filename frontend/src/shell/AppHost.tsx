import { useCatalog } from './catalogStore';
import { AppFrame } from './AppFrame';
import { useNav } from './navStore';

/** N-05: las mini apps abiertas siguen montadas; solo la activa se ve. */
export function AppHost({ activeId }: { activeId: string | null }) {
  const open = useNav((s) => s.open);
  const apps = useCatalog((s) => s.apps);
  return (
    <>
      {open.map((id) => {
        const app = apps.find((a) => a.id === id);
        return app ? <AppFrame key={id} app={app} active={id === activeId} /> : null;
      })}
    </>
  );
}
