import { useEffect, useState } from 'react';
import { useAppState, useMiniApp } from '../../platform';
import { Confirm } from './Confirm';
import styles from './processes.module.css';
import { ProfileForm } from './ProfileForm';
import { ProfileView } from './ProfileView';
import { errorMessage, type Profile } from './types';

/** «Cerrar procesos» (CP-30 a CP-34): cierra un programa colgado y los procesos de sus puertos, según los perfiles. */
export function ProcessesApp() {
  const { api, notify, setSubtitle } = useMiniApp();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** CP-30: el perfil elegido se recuerda. */
  const [selectedId, setSelectedId] = useAppState<number | null>('profile', null);
  /** CP-34: 'new', el identificador del perfil que se edita o null. */
  const [editing, setEditing] = useState<'new' | number | null>(null);
  const [deleting, setDeleting] = useState<Profile | null>(null);

  useEffect(() => {
    api
      .get<{ profiles: Profile[] }>('/profiles')
      .then((r) => {
        setProfiles(r.profiles);
        setError(null);
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [api]);

  // CP-30: si el elegido ya no existe, el primero.
  const selected = profiles?.find((p) => p.id === selectedId) ?? profiles?.[0] ?? null;
  const edited = typeof editing === 'number' ? (profiles?.find((p) => p.id === editing) ?? null) : null;

  useEffect(() => {
    setSubtitle(selected?.name ?? null);
    return () => setSubtitle(null);
  }, [selected?.name, setSubtitle]);

  const saved = (profile: Profile) => {
    setProfiles((list) => {
      const current = list ?? [];
      return current.some((p) => p.id === profile.id) ? current.map((p) => (p.id === profile.id ? profile : p)) : [...current, profile];
    });
    setSelectedId(profile.id);
    setEditing(null);
  };

  const remove = async (profile: Profile) => {
    setDeleting(null);
    try {
      await api.delete(`/profiles/${profile.id}`);
      setProfiles((list) => (list ?? []).filter((p) => p.id !== profile.id));
      notify('Perfil eliminado.');
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  };

  return (
    <div className={styles.app}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {!profiles && !error && <p className={styles.muted}>Cargando…</p>}
      {profiles && (
        <div className={styles.layout}>
          <nav className={styles.profiles} aria-label="Perfiles">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-current={editing === null && p === selected ? 'true' : undefined}
                onClick={() => {
                  setSelectedId(p.id);
                  setEditing(null);
                }}
              >
                {p.name}
              </button>
            ))}
            <button type="button" className={styles.add} onClick={() => setEditing('new')}>
              Nuevo perfil
            </button>
          </nav>
          <div className={styles.main}>
            {editing !== null && (editing === 'new' || edited) ? (
              <ProfileForm key={editing} profile={edited} onSaved={saved} onCancel={() => setEditing(null)} />
            ) : selected ? (
              <ProfileView key={selected.id} profile={selected} onEdit={() => setEditing(selected.id)} onDelete={() => setDeleting(selected)} />
            ) : (
              <p className={styles.muted}>No hay ningún perfil. Crea uno con «Nuevo perfil» para decir qué procesos cerrar.</p>
            )}
          </div>
        </div>
      )}
      {deleting && (
        <Confirm title="Eliminar perfil" action="Eliminar" onAnswer={(yes) => (yes ? void remove(deleting) : setDeleting(null))}>
          <p>Se eliminará el perfil «{deleting.name}». No se cierra ningún proceso.</p>
        </Confirm>
      )}
    </div>
  );
}
