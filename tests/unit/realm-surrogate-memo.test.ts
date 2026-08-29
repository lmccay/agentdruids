/**
 * Realm Surrogate Memo Invalidation Tests
 *
 * RealmService memoises legacy surrogate UUID -> canonical slug lookups so that
 * callers holding an id issued before migration 020 keep working. The memo is a
 * pure cache over the unique index, which makes it correct only for as long as
 * that index says the same thing.
 *
 * It previously outlived the row it described. A realm deleted and recreated
 * under the same name keeps its slug but receives a *new* surrogate from the
 * column default, so a surviving entry routed a caller holding the old
 * surrogate to the new realm — silently, and past every cache refresh.
 *
 * These tests inject a stand-in repository so the real resolveRealmKey,
 * deleteRealm and refreshRealmCache run. Counting lookups is the point: an
 * assertion on the returned slug alone would pass whether or not the memo was
 * ever consulted.
 */

import { RealmService } from '../../src/services/RealmService';
import { RepositoryManager } from '../../src/services/RepositoryManager';

const LEGACY_UUID = '3f2a9c1e-7b64-4d2f-9a10-5c8e6b0d4471';

/**
 * A repository stand-in over a slug->surrogate table the test controls, so
 * "the row is gone" and "the row has a new surrogate" are expressible.
 */
function fakeRepositoryManager(rows: Map<string, string>) {
  const calls = { resolveSlug: 0, delete: 0 };
  const manager = {
    calls,
    realms: {
      findAll: async () =>
        [...rows.keys()].map((slug) => ({ id: slug, name: slug, type: 'development' })),
      resolveSlug: async (uuid: string) => {
        calls.resolveSlug++;
        for (const [slug, surrogate] of rows) {
          if (surrogate === uuid) return slug;
        }
        return null;
      },
      delete: async (slug: string) => {
        calls.delete++;
        rows.delete(slug);
        return true;
      },
    },
    database: {
      query: async () => ({ rows: [], rowCount: 0 }),
      transaction: async (fn: () => Promise<unknown>) => fn(),
    },
  };
  return manager;
}

/**
 * Stand the service up with the stand-in already in place.
 *
 * RepositoryManager.initialize is mocked rather than the manager being swapped in
 * afterwards, so no Postgres connection is attempted. That is not only about
 * hygiene: the constructor's real initialise path cost ~30s of wall clock per run
 * for ~1s of assertions. Mocking it also means the service loads its realm map
 * through loadFromDatabase, exercising its own initialisation rather than having
 * that state hand-assembled by the test.
 */
async function serviceWith(rows: Map<string, string>) {
  const manager = fakeRepositoryManager(rows);
  jest
    .spyOn(RepositoryManager, 'initialize')
    .mockResolvedValue(manager as unknown as RepositoryManager);

  const service = new RealmService();
  await (service as any).loadingPromise;
  return { service, manager };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Realm surrogate memo', () => {
  it('resolves a legacy surrogate to its slug and then serves it from memory', async () => {
    const { service, manager } = await serviceWith(new Map([['ets', LEGACY_UUID]]));

    expect(await service.resolveRealmKey(LEGACY_UUID)).toBe('ets');
    expect(await service.resolveRealmKey(LEGACY_UUID)).toBe('ets');
    expect(manager.calls.resolveSlug).toBe(1); // second call hit the memo
  });

  it('forgets a surrogate when its realm is deleted', async () => {
    const rows = new Map([['ets', LEGACY_UUID]]);
    const { service, manager } = await serviceWith(rows);

    expect(await service.resolveRealmKey(LEGACY_UUID)).toBe('ets');
    await service.deleteRealm('ets');

    // The row is gone, so the surrogate must now resolve to nothing rather than
    // to the slug it used to name.
    expect(await service.resolveRealmKey(LEGACY_UUID)).toBe(LEGACY_UUID);
    expect(manager.calls.resolveSlug).toBe(2); // it went back to the index
  });

  it('does not route an old surrogate to a realm recreated under the same name', async () => {
    // The defect, concretely: same name, therefore same slug, but a new
    // surrogate from the column default.
    const rows = new Map([['ets', LEGACY_UUID]]);
    const { service } = await serviceWith(rows);

    expect(await service.resolveRealmKey(LEGACY_UUID)).toBe('ets');
    await service.deleteRealm('ets');
    rows.set('ets', 'b81d4f2c-0e57-4a19-8c33-9f6a2d1b7e05'); // recreated

    expect(await service.resolveRealmKey(LEGACY_UUID)).toBe(LEGACY_UUID);
    expect(await service.resolveRealmKey('b81d4f2c-0e57-4a19-8c33-9f6a2d1b7e05')).toBe('ets');
  });

  it('leaves other realms memoised when one is deleted', async () => {
    // Invalidation is by value, since the map is keyed by surrogate. It must
    // drop the deleted realm's entries and only those.
    const other = 'c4e7a90b-2d18-4f6a-b5c2-7e13d09f8a64';
    const rows = new Map([
      ['ets', LEGACY_UUID],
      ['launch-visibility', other],
    ]);
    const { service, manager } = await serviceWith(rows);

    expect(await service.resolveRealmKey(LEGACY_UUID)).toBe('ets');
    expect(await service.resolveRealmKey(other)).toBe('launch-visibility');
    expect(manager.calls.resolveSlug).toBe(2);

    await service.deleteRealm('ets');

    expect(await service.resolveRealmKey(other)).toBe('launch-visibility');
    expect(manager.calls.resolveSlug).toBe(2); // still memoised, no new lookup
  });

  it('drops the memo on a cache refresh', async () => {
    // A refresh exists to pick up another process's changes, which includes a
    // realm having been deleted and recreated behind the same slug.
    const rows = new Map([['ets', LEGACY_UUID]]);
    const { service, manager } = await serviceWith(rows);

    expect(await service.resolveRealmKey(LEGACY_UUID)).toBe('ets');
    expect(manager.calls.resolveSlug).toBe(1);

    await service.refreshRealmCache();

    expect(await service.resolveRealmKey(LEGACY_UUID)).toBe('ets');
    expect(manager.calls.resolveSlug).toBe(2); // re-read rather than trusted
  });
});
