import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Globe, 
  Users,
  Search,
  MoreVertical,
  Eye,
  Network,
  X,
  RefreshCw
} from 'lucide-react';
import { realmApi, agentApi, Realm, CreateRealmRequest, Agent } from '../services/api';

interface RealmFormData {
  name: string;
  description: string;
  type: 'development' | 'testing' | 'staging' | 'production' | 'monitoring';
  configuration: {
    maxAgents: number;
    allowExternalAccess: boolean;
    leyLineEndpoint?: string;
  };
  mcpServers?: string[];
}

function RealmCard({ 
  realm, 
  onEdit, 
  onDelete,
  onView 
}: { 
  realm: Realm;
  onEdit: (realm: Realm) => void;
  onDelete: (realm: Realm) => void;
  onView: (realm: Realm) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const typeColors = {
    development: 'bg-blue-100 text-blue-800 border-blue-200',
    testing: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    staging: 'bg-orange-100 text-orange-800 border-orange-200',
    production: 'bg-red-100 text-red-800 border-red-200',
    monitoring: 'bg-purple-100 text-purple-800 border-purple-200'
  };

  const statusColors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    suspended: 'bg-yellow-100 text-yellow-800',
    maintenance: 'bg-blue-100 text-blue-800',
    error: 'bg-red-100 text-red-800'
  };

  return (
    <div className="card hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <Globe className="h-5 w-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">{realm.name}</h3>
            <span className={`px-2 py-1 text-xs font-medium rounded-full border ${typeColors[realm.type]}`}>
              {realm.type}
            </span>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[realm.status]}`}>
              {realm.status}
            </span>
          </div>
          
          <p className="text-sm text-gray-600 mb-3">{realm.description}</p>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Agents:</span>
              <span className="text-xs text-gray-700">
                {realm.agents?.length || 0} / {realm.configuration.maxAgents}
              </span>
            </div>

            {realm.configuration.leyLineEndpoint && (
              <div>
                <span className="text-xs font-medium text-gray-500">Ley Line:</span>
                <span className="ml-2 text-xs text-gray-700 font-mono">
                  {realm.configuration.leyLineEndpoint}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">External Access:</span>
              <span className={`text-xs px-2 py-1 rounded ${
                realm.configuration.allowExternalAccess
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {realm.configuration.allowExternalAccess ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            {realm.mcpServers && realm.mcpServers.length > 0 && (
              <div>
                <span className="text-xs font-medium text-gray-500">MCP Servers:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {realm.mcpServers.map((serverId) => (
                    <span key={serverId} className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded">
                      {serverId}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-10">
              <div className="py-1">
                <button
                  onClick={() => { onView(realm); setIsMenuOpen(false); }}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </button>
                <button
                  onClick={() => { onEdit(realm); setIsMenuOpen(false); }}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </button>
                <hr className="my-1" />
                <button
                  onClick={() => { onDelete(realm); setIsMenuOpen(false); }}
                  className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Created: {realm.createdAt ? new Date(realm.createdAt).toLocaleDateString() : 'Unknown'}</span>
          <span>Updated: {realm.updatedAt ? new Date(realm.updatedAt).toLocaleDateString() : 'Unknown'}</span>
        </div>
      </div>
    </div>
  );
}

function RealmModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  realm, 
  title,
  mode = 'create'
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: RealmFormData) => void;
  realm?: Realm;
  title: string;
  mode?: 'create' | 'edit' | 'view';
}) {
  const [formData, setFormData] = useState<RealmFormData>({
    name: realm?.name || '',
    description: realm?.description || '',
    type: realm?.type || 'development',
    configuration: {
      maxAgents: realm?.configuration.maxAgents || 10,
      allowExternalAccess: realm?.configuration.allowExternalAccess || false,
      leyLineEndpoint: realm?.configuration.leyLineEndpoint || ''
    },
    mcpServers: realm?.mcpServers || []
  });

  // Update form data when realm prop changes
  useEffect(() => {
    if (realm) {
      setFormData({
        name: realm.name || '',
        description: realm.description || '',
        type: realm.type || 'development',
        configuration: {
          maxAgents: realm.configuration?.maxAgents || 10,
          allowExternalAccess: realm.configuration?.allowExternalAccess || false,
          leyLineEndpoint: realm.configuration?.leyLineEndpoint || ''
        },
        mcpServers: realm.mcpServers || []
      });
    } else {
      // Reset form for create mode
      setFormData({
        name: '',
        description: '',
        type: 'development',
        configuration: {
          maxAgents: 10,
          allowExternalAccess: false,
          leyLineEndpoint: ''
        },
        mcpServers: []
      });
    }
  }, [realm]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode !== 'view') {
      onSubmit(formData);
    }
    onClose();
  };

  if (!isOpen) return null;

  const isReadOnly = mode === 'view';

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
                disabled={isReadOnly}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type *
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
                disabled={isReadOnly}
              >
                <option value="development">Development</option>
                <option value="testing">Testing</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
                <option value="monitoring">Monitoring</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
              disabled={isReadOnly}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Agents
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={formData.configuration.maxAgents}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  configuration: { 
                    ...formData.configuration, 
                    maxAgents: parseInt(e.target.value) 
                  }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isReadOnly}
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="allowExternalAccess"
                checked={formData.configuration.allowExternalAccess}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  configuration: { 
                    ...formData.configuration, 
                    allowExternalAccess: e.target.checked 
                  }
                })}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                disabled={isReadOnly}
              />
              <label htmlFor="allowExternalAccess" className="ml-2 block text-sm text-gray-900">
                Allow External Access
              </label>
            </div>
          </div>

          {formData.configuration.allowExternalAccess && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ley Line Endpoint
              </label>
              <input
                type="url"
                value={formData.configuration.leyLineEndpoint || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  configuration: {
                    ...formData.configuration,
                    leyLineEndpoint: e.target.value
                  }
                })}
                placeholder="https://example.com/leyline"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isReadOnly}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              MCP Servers
            </label>
            <div className="space-y-2 border border-gray-300 rounded-md p-3">
              {/* Available MCP servers - hardcoded for now, can be fetched from API later */}
              {['github'].map((serverId) => (
                <div key={serverId} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`mcp-${serverId}`}
                    checked={formData.mcpServers?.includes(serverId) || false}
                    onChange={(e) => {
                      const currentServers = formData.mcpServers || [];
                      const newServers = e.target.checked
                        ? [...currentServers, serverId]
                        : currentServers.filter(id => id !== serverId);
                      setFormData({ ...formData, mcpServers: newServers });
                    }}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    disabled={isReadOnly}
                  />
                  <label htmlFor={`mcp-${serverId}`} className="ml-2 block text-sm text-gray-900">
                    {serverId === 'github' ? 'GitHub MCP Server' : serverId}
                  </label>
                </div>
              ))}
              {formData.mcpServers?.length === 0 && (
                <p className="text-xs text-gray-500 italic">No MCP servers selected</p>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Select which MCP servers this realm can access
            </p>
          </div>

          {realm && mode === 'view' && (
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="font-medium text-gray-900 mb-2">Realm Details</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Status:</span>
                  <span className="ml-2 font-medium">{realm.status}</span>
                </div>
                <div>
                  <span className="text-gray-500">Agents:</span>
                  <span className="ml-2">{realm.agents?.length || 0}</span>
                </div>
                <div>
                  <span className="text-gray-500">Created:</span>
                  <span className="ml-2">{realm.createdAt ? new Date(realm.createdAt).toLocaleDateString() : 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Updated:</span>
                  <span className="ml-2">{realm.updatedAt ? new Date(realm.updatedAt).toLocaleDateString() : 'Unknown'}</span>
                </div>
              </div>
              
              {realm.agents && realm.agents.length > 0 && (
                <div className="mt-3">
                  <span className="text-gray-500">Agents:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {realm.agents.map((agent) => (
                      <span key={agent.id} className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded">
                        {agent.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              {mode === 'view' ? 'Close' : 'Cancel'}
            </button>
            {mode !== 'view' && (
              <button
                type="submit"
                className="btn-primary"
              >
                {mode === 'create' ? 'Create Realm' : 'Update Realm'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RealmManagement() {
  const [realms, setRealms] = useState<Realm[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit' | 'view';
    realm?: Realm;
  }>({ isOpen: false, mode: 'create' });

  // Cache refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchRealms();
  }, []);

  const fetchRealms = async () => {
    try {
      setLoading(true);
      const response = await realmApi.getRealms();
      setRealms(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Failed to fetch realms:', error);
      setRealms([]); // Ensure we always have an empty array on error
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRealm = async (data: RealmFormData) => {
    try {
      await realmApi.createRealm(data);
      fetchRealms();
    } catch (error) {
      console.error('Failed to create realm:', error);
    }
  };

  const handleUpdateRealm = async (data: RealmFormData) => {
    if (!modalState.realm) return;
    try {
      await realmApi.updateRealm(modalState.realm.id, data as any);
      fetchRealms();
    } catch (error) {
      console.error('Failed to update realm:', error);
    }
  };

  const handleDeleteRealm = async (realm: Realm) => {
    if (window.confirm(`Are you sure you want to delete "${realm.name}"? This will also remove all agents and related data in this realm.`)) {
      try {
        await realmApi.deleteRealm(realm.id);
        await fetchRealms();
      } catch (error) {
        console.error('Failed to delete realm:', error);
        alert(`Failed to delete realm: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleRefreshCache = async () => {
    setIsRefreshing(true);
    try {
      await realmApi.refreshCache();
      // After refreshing cache, reload realms to show updated data
      await fetchRealms();
    } catch (error) {
      console.error('Failed to refresh cache:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredRealms = (realms || []).filter(realm => {
    const matchesSearch = realm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         realm.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !typeFilter || realm.type === typeFilter;
    return matchesSearch && matchesType;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Realm Management</h1>
          <p className="text-gray-600">Manage development, testing, staging, production, and monitoring realms for your agent ecosystem</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefreshCache}
            className="btn-secondary flex items-center"
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={() => setModalState({ isOpen: true, mode: 'create' })}
            className="btn-primary flex items-center"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Realm
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search realms..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        
        <div className="flex gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Types</option>
            <option value="development">Development</option>
            <option value="testing">Testing</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
            <option value="monitoring">Monitoring</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <Globe className="h-8 w-8 text-primary-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Realms</p>
              <p className="text-2xl font-semibold text-gray-900">{(realms || []).length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <Network className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Development</p>
              <p className="text-2xl font-semibold text-gray-900">
                {(realms || []).filter(r => r.type === 'development').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <Network className="h-8 w-8 text-red-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Production</p>
              <p className="text-2xl font-semibold text-gray-900">
                {(realms || []).filter(r => r.type === 'production').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <Users className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Agents</p>
              <p className="text-2xl font-semibold text-gray-900">
                {realms.reduce((total, realm) => total + (realm.agents?.length || 0), 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Realms Grid */}
      {filteredRealms.length === 0 ? (
        <div className="text-center py-12">
          <Globe className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No realms found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm || typeFilter 
              ? 'Try adjusting your filters or search terms.'
              : 'Get started by creating your first realm.'
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRealms.map((realm) => (
            <RealmCard
              key={realm.id}
              realm={realm}
              onEdit={(realm) => setModalState({ isOpen: true, mode: 'edit', realm })}
              onDelete={handleDeleteRealm}
              onView={(realm) => setModalState({ isOpen: true, mode: 'view', realm })}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      <RealmModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, mode: 'create' })}
        onSubmit={modalState.mode === 'create' ? handleCreateRealm : handleUpdateRealm}
        realm={modalState.realm}
        mode={modalState.mode}
        title={
          modalState.mode === 'create' ? 'Create New Realm' :
          modalState.mode === 'edit' ? 'Edit Realm' :
          'Realm Details'
        }
      />
    </div>
  );
}