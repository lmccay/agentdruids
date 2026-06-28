import React, { useState, useEffect, useCallback } from 'react';
import { Shield, User, Users, Plus, X, RefreshCw } from 'lucide-react';
import {
  identityApi,
  agentApi,
  type UserSummary,
  type GroupSummary,
  type AssumableDruidGrant,
  type Agent,
} from '../services/api';

type Mode = 'users' | 'groups';

export default function AccessManagement() {
  const [mode, setMode] = useState<Mode>('users');

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [druids, setDruids] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  // Selected principal (user id or group key) and its grants.
  const [selected, setSelected] = useState<string | null>(null);
  const [grants, setGrants] = useState<AssumableDruidGrant[]>([]);
  const [loadingGrants, setLoadingGrants] = useState(false);
  const [addDruidId, setAddDruidId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadPrincipals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, g, a] = await Promise.all([
        identityApi.listUsers(),
        identityApi.listGroups(),
        agentApi.getAgents(),
      ]);
      setUsers(u);
      setGroups(g);
      setDruids(a.data.filter((agent) => agent.type === 'druid'));
    } catch {
      setError('Failed to load (admin role required).');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrincipals();
  }, [loadPrincipals]);

  // Reset selection when switching tabs.
  useEffect(() => {
    setSelected(null);
    setGrants([]);
  }, [mode]);

  const loadGrants = useCallback(async (key: string) => {
    setLoadingGrants(true);
    try {
      const list = mode === 'users'
        ? await identityApi.listUserDruids(key)
        : await identityApi.listGroupDruids(key);
      setGrants(list);
    } catch {
      setGrants([]);
    } finally {
      setLoadingGrants(false);
    }
  }, [mode]);

  const select = (key: string) => {
    setSelected(key);
    setAddDruidId('');
    void loadGrants(key);
  };

  const grant = async () => {
    if (!selected || !addDruidId) return;
    if (mode === 'users') await identityApi.grantUserDruid(selected, addDruidId);
    else await identityApi.grantGroupDruid(selected, addDruidId);
    setAddDruidId('');
    await loadGrants(selected);
  };

  const revoke = async (druidId: string) => {
    if (!selected) return;
    if (mode === 'users') await identityApi.revokeUserDruid(selected, druidId);
    else await identityApi.revokeGroupDruid(selected, druidId);
    await loadGrants(selected);
  };

  const druidLabel = (id: string) => druids.find((d) => d.id === id)?.name || id;
  const grantedIds = new Set(grants.map((g) => g.druidId));
  const ungranted = druids.filter((d) => !grantedIds.has(d.id));

  const tab = (m: Mode, label: string, Icon: typeof Shield) => (
    <button
      onClick={() => setMode(m)}
      className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium ${
        mode === m ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <Shield className="h-6 w-6 mr-2 text-blue-600" /> Access Management
              </h1>
              <p className="text-gray-600">Grant users and groups the ability to assume specific druids</p>
            </div>
            <div className="flex items-center space-x-2">
              {tab('users', 'Users', User)}
              {tab('groups', 'Groups', Users)}
              <button onClick={() => void loadPrincipals()} className="text-gray-400 hover:text-gray-600 ml-2">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded">{error}</div>}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Principal list */}
          <div className="lg:col-span-1 space-y-2">
            {mode === 'users'
              ? users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => select(u.id)}
                    className={`w-full text-left bg-white rounded-lg shadow p-3 hover:shadow-md ${
                      selected === u.id ? 'ring-2 ring-blue-500' : ''
                    }`}
                  >
                    <div className="font-medium text-gray-900 truncate">{u.displayName || u.email || u.id}</div>
                    <div className="text-xs text-gray-500 truncate">{u.email}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <span key={r} className={`text-xs px-1.5 py-0.5 rounded ${r === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{r}</span>
                      ))}
                    </div>
                  </button>
                ))
              : groups.map((g) => (
                  <button
                    key={g.groupKey}
                    onClick={() => select(g.groupKey)}
                    className={`w-full text-left bg-white rounded-lg shadow p-3 hover:shadow-md ${
                      selected === g.groupKey ? 'ring-2 ring-blue-500' : ''
                    }`}
                  >
                    <div className="font-medium text-gray-900 truncate">{g.displayName || g.groupKey}</div>
                    <div className="text-xs text-gray-500 truncate">{g.groupKey}</div>
                  </button>
                ))}
            {!loading && mode === 'users' && users.length === 0 && (
              <p className="text-sm text-gray-500">No users yet (users appear after first login).</p>
            )}
            {!loading && mode === 'groups' && groups.length === 0 && (
              <p className="text-sm text-gray-500">No groups seen yet (synced from IdP group claims at login).</p>
            )}
          </div>

          {/* Grants for the selected principal */}
          <div className="lg:col-span-2">
            {selected ? (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-1">Assumable druids</h2>
                <p className="text-sm text-gray-500 mb-4 truncate">
                  {mode === 'users' ? 'User' : 'Group'}: <span className="font-mono">{selected}</span>
                </p>

                {/* Add grant */}
                <div className="flex gap-2 mb-5">
                  <select
                    value={addDruidId}
                    onChange={(e) => setAddDruidId(e.target.value)}
                    className="flex-1 border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">Select a druid to grant…</option>
                    {ungranted.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                    ))}
                  </select>
                  <button
                    onClick={() => void grant()}
                    disabled={!addDruidId}
                    className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" /> <span>Grant</span>
                  </button>
                </div>

                {loadingGrants ? (
                  <p className="text-gray-500">Loading grants…</p>
                ) : grants.length === 0 ? (
                  <p className="text-sm text-gray-500">No druids granted yet.</p>
                ) : (
                  <ul className="divide-y">
                    {grants.map((g) => (
                      <li key={g.druidId} className="flex items-center justify-between py-2">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{druidLabel(g.druidId)}</div>
                          <div className="text-xs text-gray-400 font-mono">{g.druidId}</div>
                        </div>
                        <button
                          onClick={() => void revoke(g.druidId)}
                          className="flex items-center space-x-1 text-sm text-red-500 hover:text-red-700"
                          title="Revoke"
                        >
                          <X className="h-4 w-4" /> <span>Revoke</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
                Select a {mode === 'users' ? 'user' : 'group'} to manage its assumable druids.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
