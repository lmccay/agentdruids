import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Play, 
  Pause, 
  MessageSquare,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Users,
  X,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { agentApi, realmApi, Agent, CreateAgentRequest, UpdateAgentRequest, ModelOption, Realm } from '../services/api';
import { CommaInput } from '../components/CommaInput';

interface AgentFormData {
  name: string;
  type: 'druid' | 'elemental' | 'gaia' | 'worldtree';
  description: string;
  domain: string;
  systemPrompt: string;
  // Realm associations based on agent type
  boundRealmId: string; // For Elementals - single realm binding
  allowedRealms: string[]; // For Druids - multiple realm access
  // Extended fields for full agent configuration
  capabilities: string[];
  expertise: string[];
  knowledgeNamespaces: string[];
  maxConcurrentTasks: number;
  personalityTraits: string[];
  communicationStyle: string;
  decisionMaking: string;
  // Named model configuration
  modelId: string; // Reference to named model like "creative-writer"
  // MCP tool patterns
  mcpTools: string[]; // MCP tool patterns with wildcard support (e.g., "github:*", "github:list_*")
  // Agentic loop configuration
  agenticLoopEnabled: boolean;
  agenticLoopMaxIterations: number;
  agenticLoopTrackCosts: boolean;
  // Prompt composition configuration (NEW)
  usePromptComposition: boolean; // Toggle to use new system
  baseTemplate: 'standard' | 'minimal';
  agentExtension: string;
  disableRealmPrompt: boolean;
  // Resource access configuration (NEW)
  allowedLocations: string; // Newline-separated list of allowed file:// and http(s):// URLs
}

function AgentCard({ 
  agent, 
  onEdit, 
  onDelete, 
  onStart, 
  onStop, 
  onChat,
  onView 
}: { 
  agent: Agent;
  onEdit: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
  onStart: (agent: Agent) => void;
  onStop: (agent: Agent) => void;
  onChat: (agent: Agent) => void;
  onView: (agent: Agent) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const typeColors = {
    druid: 'bg-druid-100 text-druid-800 border-druid-200',
    elemental: 'bg-elemental-100 text-elemental-800 border-elemental-200',
    gaia: 'bg-gaia-100 text-gaia-800 border-gaia-200',
    worldtree: 'bg-primary-100 text-primary-800 border-primary-200'
  };

  const statusColors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    error: 'bg-red-100 text-red-800'
  };

  return (
    <div className="card hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{agent.name}</h3>
            <span className={`px-2 py-1 text-xs font-medium rounded-full border ${typeColors[agent.type]}`}>
              {agent.type}
            </span>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[agent.status]}`}>
              {agent.status}
            </span>
          </div>
          
          <p className="text-sm text-gray-600 mb-3">{agent.description}</p>
          
          <div className="space-y-2">
            <div>
              <span className="text-xs font-medium text-gray-500">Capabilities:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {agent.capabilities.slice(0, 3).map((cap) => (
                  <span key={cap} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                    {cap}
                  </span>
                ))}
                {agent.capabilities.length > 3 && (
                  <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                    +{agent.capabilities.length - 3} more
                  </span>
                )}
              </div>
            </div>
            
            <div>
              <span className="text-xs font-medium text-gray-500">Domain:</span>
              <span className="ml-2 text-xs text-gray-700">{agent.specialization?.domain}</span>
            </div>
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
                  onClick={() => { onView(agent); setIsMenuOpen(false); }}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </button>
                <button
                  onClick={() => { onEdit(agent); setIsMenuOpen(false); }}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </button>
                <button
                  onClick={() => { onChat(agent); setIsMenuOpen(false); }}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Chat
                </button>
                {agent.status === 'active' ? (
                  <button
                    onClick={() => { onStop(agent); setIsMenuOpen(false); }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => { onStart(agent); setIsMenuOpen(false); }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Start
                  </button>
                )}
                <hr className="my-1" />
                <button
                  onClick={() => { onDelete(agent); setIsMenuOpen(false); }}
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
          <span>Created: {new Date(agent.createdAt).toLocaleDateString()}</span>
          <span>{agent.specialization?.maxConcurrentTasks} max tasks</span>
        </div>
      </div>
    </div>
  );
}

function AgentModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  agent, 
  title,
  mode = 'create',
  availableModels,
  modelsLoading,
  availableRealms,
  realmsLoading
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: AgentFormData) => Promise<void>;
  agent?: Agent;
  title: string;
  mode?: 'create' | 'edit' | 'view';
  availableModels: ModelOption[];
  modelsLoading: boolean;
  availableRealms: any[];
  realmsLoading: boolean;
}) {
  
  const [formData, setFormData] = useState<AgentFormData>({
    name: agent?.name || '',
    type: agent?.type || 'druid',
    description: agent?.description || '',
    domain: agent?.specialization?.domain || '',
    systemPrompt: agent?.systemPrompt || '',
    // Initialize realm associations based on agent type and existing data
    boundRealmId: agent?.type === 'elemental' ? (agent?.realmAccess?.boundRealmId || '') : '',
    allowedRealms: agent?.type === 'druid' ? (agent?.realmAccess?.accessibleRealms || []) : [],
    capabilities: agent?.capabilities || [],
    expertise: agent?.specialization?.expertise || [],
    knowledgeNamespaces: agent?.specialization?.knowledgeNamespaces || [],
    maxConcurrentTasks: agent?.specialization?.maxConcurrentTasks || 5,
    personalityTraits: agent?.personality?.traits || [],
    communicationStyle: agent?.personality?.communicationStyle || 'formal',
    decisionMaking: agent?.personality?.decisionMaking || 'analytical',
    // Named model configuration
    modelId: agent?.llmConfig?.modelConfigId || 'analytical-researcher', // Default model
    // MCP tool patterns
    mcpTools: agent?.mcpTools || [],
    // Agentic loop configuration
    agenticLoopEnabled: agent?.llmConfig?.agenticLoop?.enabled || false,
    agenticLoopMaxIterations: agent?.llmConfig?.agenticLoop?.maxIterations || 10,
    agenticLoopTrackCosts: agent?.llmConfig?.agenticLoop?.trackCosts ?? true,
    // Prompt composition config
    usePromptComposition: !!agent?.promptConfig,
    baseTemplate: agent?.promptConfig?.baseTemplate || 'standard',
    agentExtension: agent?.promptConfig?.agentExtension || '',
    disableRealmPrompt: agent?.promptConfig?.disableRealmPrompt || false,
    // Resource access config
    allowedLocations: agent?.resourceAccess?.allowedLocations?.join('\n') || ''
  });

    // Update form data when agent prop changes
  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name || '',
        type: agent.type || 'druid',
        description: agent.description || '',
        domain: agent.specialization?.domain || '',
        systemPrompt: agent.systemPrompt || '',
        boundRealmId: agent.type === 'elemental' ? (agent.realmAccess?.boundRealmId || '') : '',
        allowedRealms: agent.type === 'druid' ? (agent.realmAccess?.accessibleRealms || []) : [],
        capabilities: agent.capabilities || [],
        expertise: agent.specialization?.expertise || [],
        knowledgeNamespaces: agent.specialization?.knowledgeNamespaces || [],
        maxConcurrentTasks: agent.specialization?.maxConcurrentTasks || 5,
        personalityTraits: agent.personality?.traits || [],
        communicationStyle: agent.personality?.communicationStyle || 'formal',
        decisionMaking: agent.personality?.decisionMaking || 'analytical',
        modelId: agent.llmConfig?.modelConfigId || 'analytical-researcher',
        mcpTools: agent.mcpTools || [],
        agenticLoopEnabled: agent.llmConfig?.agenticLoop?.enabled || false,
        agenticLoopMaxIterations: agent.llmConfig?.agenticLoop?.maxIterations || 10,
        agenticLoopTrackCosts: agent.llmConfig?.agenticLoop?.trackCosts ?? true,
        // Prompt composition config
        usePromptComposition: !!agent.promptConfig,
        baseTemplate: agent.promptConfig?.baseTemplate || 'standard',
        agentExtension: agent.promptConfig?.agentExtension || '',
        disableRealmPrompt: agent.promptConfig?.disableRealmPrompt || false,
        // Resource access config
        allowedLocations: agent.resourceAccess?.allowedLocations?.join('\n') || ''
      });
    } else {
      // Reset form for create mode
      setFormData({
        name: '',
        type: 'druid',
        description: '',
        domain: '',
        systemPrompt: '',
        boundRealmId: '',
        allowedRealms: [],
        capabilities: ['reasoning', 'memory'], // Default capabilities required by validation
        expertise: [],
        knowledgeNamespaces: [],
        maxConcurrentTasks: 5,
        personalityTraits: ['helpful'], // Default personality traits
        communicationStyle: 'formal',
        decisionMaking: 'analytical',
        modelId: 'analytical-researcher', // Default model
        mcpTools: [],
        agenticLoopEnabled: false,
        agenticLoopMaxIterations: 10,
        agenticLoopTrackCosts: true,
        // Prompt composition config
        usePromptComposition: true, // Enable by default for new agents
        baseTemplate: 'standard',
        agentExtension: '',
        disableRealmPrompt: false,
        // Resource access config
        allowedLocations: ''
      });
    }
  }, [agent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('📝 Modal submit - mode:', mode, 'formData:', formData);
    if (mode !== 'view') {
      try {
        console.log('🔄 Calling onSubmit...');
        await onSubmit(formData);
        console.log('✅ onSubmit completed successfully');
        // Only close modal if onSubmit succeeds
        console.log('🚪 Closing modal after successful submit');
        onClose();
      } catch (error) {
        console.log('❌ onSubmit failed, keeping modal open');
        // Don't close modal on error - let user see error and try again
      }
    } else {
      // For view mode, always close
      console.log('🚪 Closing modal (view mode)');
      onClose();
    }
  };

  if (!isOpen) return null;

  console.log('🎪 Modal is rendering - mode:', mode, 'agent:', agent?.name);
  const isReadOnly = mode === 'view';

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white mb-20">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto pr-2">
          <form onSubmit={(e) => {
            console.log('🎯 Form onSubmit triggered');
            handleSubmit(e);
          }} className="space-y-4">
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
                <option value="druid">Druid</option>
                <option value="elemental">Elemental</option>
                <option value="gaia">Gaia</option>
                <option value="worldtree">Worldtree</option>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Domain
            </label>
            <input
              type="text"
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="e.g., research, analysis, creative writing"
              disabled={isReadOnly}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              System Prompt (Legacy)
            </label>
            <textarea
              value={formData.systemPrompt}
              onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Custom system prompt to define the agent's behavior and personality..."
              disabled={isReadOnly || formData.usePromptComposition}
            />
            {formData.usePromptComposition && (
              <p className="text-xs text-gray-500 mt-1">
                Disabled when using prompt composition. Use Agent Extension instead.
              </p>
            )}
          </div>

          {/* Prompt Composition Section (NEW) */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-gray-900">Prompt Composition (NEW)</h4>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="usePromptComposition"
                  checked={formData.usePromptComposition}
                  onChange={(e) => setFormData({ ...formData, usePromptComposition: e.target.checked })}
                  disabled={isReadOnly}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="usePromptComposition" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Enable Layered Prompts
                </label>
              </div>
            </div>

            {formData.usePromptComposition && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Base Template
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="baseTemplate"
                        value="standard"
                        checked={formData.baseTemplate === 'standard'}
                        onChange={(e) => setFormData({ ...formData, baseTemplate: 'standard' })}
                        disabled={isReadOnly}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm">
                        <span className="font-medium">Standard</span> - Includes global + agent type + realm context
                      </span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="baseTemplate"
                        value="minimal"
                        checked={formData.baseTemplate === 'minimal'}
                        onChange={(e) => setFormData({ ...formData, baseTemplate: 'minimal' })}
                        disabled={isReadOnly}
                        className="text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm">
                        <span className="font-medium">Minimal</span> - Global + agent type only (no realm)
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      Agent Extension (Markdown)
                    </label>
                    {!isReadOnly && !formData.agentExtension && (
                      <button
                        type="button"
                        onClick={() => {
                          const agentName = formData.name || 'My Agent';
                          const agentDesc = formData.description || 'Custom instructions for this agent';
                          const template = `---
version: 1.0.0
metadata:
  name: "${agentName} Extension"
  description: "${agentDesc}"
---

# Domain Expertise

This agent specializes in...

# Custom Guidelines

- Always...
- Never...`;
                          setFormData({ ...formData, agentExtension: template });
                        }}
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                      >
                        Insert Template
                      </button>
                    )}
                  </div>
                  <textarea
                    value={formData.agentExtension}
                    onChange={(e) => setFormData({ ...formData, agentExtension: e.target.value })}
                    rows={12}
                    className="w-full px-3 py-2 font-mono text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Click 'Insert Template' to start with a template, or write your own Markdown..."
                    disabled={isReadOnly}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Custom Markdown instructions. Frontmatter will be auto-generated from agent name and description.
                  </p>
                </div>

                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id="disableRealmPrompt"
                    checked={formData.disableRealmPrompt}
                    onChange={(e) => setFormData({ ...formData, disableRealmPrompt: e.target.checked })}
                    disabled={isReadOnly}
                    className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div>
                    <label htmlFor="disableRealmPrompt" className="block text-sm font-medium text-gray-900 cursor-pointer">
                      Disable Realm-Specific Prompts
                    </label>
                    <p className="text-xs text-gray-600 mt-1">
                      Skip loading realm context even with standard template. Useful for agents that don't need realm-specific knowledge.
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-sm text-blue-800">
                    <strong>Composition Layers:</strong>
                  </p>
                  <ol className="text-xs text-blue-700 mt-2 space-y-1 ml-4 list-decimal">
                    <li>Global Base (security rules, identity)</li>
                    <li>Agent Type ({formData.type}) base prompts</li>
                    {formData.baseTemplate === 'standard' && !formData.disableRealmPrompt && (
                      <li>Realm Context (if bound/assigned)</li>
                    )}
                    {formData.agentExtension && <li>Your Agent Extension</li>}
                    <li>Security Postamble (always added)</li>
                  </ol>
                </div>
              </div>
            )}
          </div>

          {/* Realm Association Section */}
          <div className="border-t pt-6">
            <h4 className="font-medium text-gray-900 mb-4">Realm Associations</h4>
            
            {formData.type === 'elemental' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bound Realm *
                </label>
                <select
                  value={formData.boundRealmId}
                  onChange={(e) => {
                    console.log('🎯 Elemental realm changed to:', e.target.value);
                    setFormData({ ...formData, boundRealmId: e.target.value });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required={formData.type === 'elemental'}
                  disabled={isReadOnly || realmsLoading}
                >
                  <option value="">Select a realm...</option>
                  {availableRealms.map((realm) => (
                    <option key={realm.id} value={realm.id}>
                      {realm.name}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  Elementals are bound to a specific realm and gain specialized knowledge of that domain.
                </p>
              </div>
            )}
            
            {formData.type === 'druid' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Allowed Realms
                </label>
                <div className="space-y-2">
                  {realmsLoading ? (
                    <div className="text-sm text-gray-500">Loading realms...</div>
                  ) : (
                    availableRealms.map((realm) => (
                      <label key={realm.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.allowedRealms.includes(realm.id)}
                          onChange={(e) => {
                            console.log('🎯 Druid realm checkbox changed:', realm.id, 'checked:', e.target.checked);
                            if (e.target.checked) {
                              const newRealms = [...formData.allowedRealms, realm.id];
                              console.log('🎯 Adding realm, new allowedRealms:', newRealms);
                              setFormData({
                                ...formData,
                                allowedRealms: newRealms
                              });
                            } else {
                              const newRealms = formData.allowedRealms.filter(id => id !== realm.id);
                              console.log('🎯 Removing realm, new allowedRealms:', newRealms);
                              setFormData({
                                ...formData,
                                allowedRealms: newRealms
                              });
                            }
                          }}
                          disabled={isReadOnly}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700">{realm.name}</span>
                        <span className="text-xs text-gray-500">({realm.description || 'No description'})</span>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Druids can travel between multiple realms and coordinate cross-realm activities.
                </p>
              </div>
            )}
            
            {(formData.type === 'gaia' || formData.type === 'worldtree') && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-800">
                  <strong>{formData.type === 'gaia' ? 'Gaia' : 'Worldtree'}</strong> agents have global access to all realms and don't require specific realm associations.
                </p>
              </div>
            )}
          </div>

          {/* Capabilities Section */}
          <div className="border-t pt-6">
            <h4 className="font-medium text-gray-900 mb-4">Capabilities & Skills</h4>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Capabilities
              </label>
              <CommaInput
                value={formData.capabilities}
                onChange={(values) => setFormData({ ...formData, capabilities: values })}
                placeholder="e.g., analysis, research, creative-writing, problem-solving"
                disabled={isReadOnly}
                helpText="Separate capabilities with commas"
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expertise Areas
              </label>
              <CommaInput
                value={formData.expertise}
                onChange={(values) => setFormData({ ...formData, expertise: values })}
                placeholder="e.g., data analysis, natural language processing, technical writing"
                disabled={isReadOnly}
                helpText="Specific areas of expertise, separated by commas"
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Knowledge Namespaces
              </label>
              <CommaInput
                value={formData.knowledgeNamespaces}
                onChange={(values) => setFormData({ ...formData, knowledgeNamespaces: values })}
                placeholder="e.g., worldtree://public/docs, agent://team-lead/private"
                disabled={isReadOnly}
                helpText="Knowledge sources this agent can access, separated by commas"
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                MCP Tool Patterns
              </label>
              <CommaInput
                value={formData.mcpTools}
                onChange={(values) => setFormData({ ...formData, mcpTools: values })}
                placeholder="e.g., github:*, github:list_*, jira:create_issue"
                disabled={isReadOnly}
                helpText="MCP tool patterns with wildcard support. Format: server:tool or server:pattern*"
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Concurrent Tasks
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={formData.maxConcurrentTasks}
                onChange={(e) => setFormData({ ...formData, maxConcurrentTasks: parseInt(e.target.value) || 5 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isReadOnly}
              />
            </div>
          </div>

          {/* Resource Access Section */}
          <div className="border-t pt-6">
            <h4 className="font-medium text-gray-900 mb-4">Resource Access (File & URL Tools)</h4>
            <p className="text-sm text-gray-600 mb-4">
              Configure allowed file paths and URLs for built-in <code className="bg-gray-100 px-1 rounded">read_file</code>, <code className="bg-gray-100 px-1 rounded">write_file</code>, and <code className="bg-gray-100 px-1 rounded">fetch_url</code> tools.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Allowed Locations
              </label>
              <textarea
                value={formData.allowedLocations}
                onChange={(e) => setFormData({ ...formData, allowedLocations: e.target.value })}
                rows={8}
                className="w-full px-3 py-2 font-mono text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={`file:///app/data/**/*
file:///tmp/*.txt
https://api.example.com/**
https://specific.com/endpoint`}
                disabled={isReadOnly}
              />
              <p className="text-xs text-gray-500 mt-1">
                One location per line. Supports wildcards: <code className="bg-gray-100 px-1 rounded">*</code> (single segment), <code className="bg-gray-100 px-1 rounded">**</code> (multiple segments)
              </p>
            </div>

            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-xs font-medium text-blue-900 mb-2">Examples:</p>
              <ul className="text-xs text-blue-800 space-y-1">
                <li><code className="bg-white px-1 rounded">file:///app/data/config.json</code> - Exact file</li>
                <li><code className="bg-white px-1 rounded">file:///app/data/**/*</code> - All files recursively</li>
                <li><code className="bg-white px-1 rounded">https://api.github.com/**</code> - All GitHub API endpoints</li>
                <li><code className="bg-white px-1 rounded">https://example.com/v1/endpoint</code> - Specific URL</li>
              </ul>
            </div>
          </div>

          {/* Personality Section */}
          <div className="border-t pt-6">
            <h4 className="font-medium text-gray-900 mb-4">Personality & Behavior</h4>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Personality Traits
              </label>
              <CommaInput
                value={formData.personalityTraits}
                onChange={(value) => setFormData({ 
                  ...formData, 
                  personalityTraits: value
                })}
                rows={2}
                placeholder="e.g., helpful, analytical, creative, methodical, empathetic"
                helpText="Key personality characteristics, separated by commas"
                disabled={isReadOnly}
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Communication Style
              </label>
              <select
                value={formData.communicationStyle}
                onChange={(e) => setFormData({ ...formData, communicationStyle: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isReadOnly}
              >
                <option value="formal">Formal</option>
                <option value="casual">Casual</option>
                <option value="technical">Technical</option>
                <option value="friendly">Friendly</option>
                <option value="professional">Professional</option>
                <option value="creative">Creative</option>
              </select>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Decision Making Approach
              </label>
              <select
                value={formData.decisionMaking}
                onChange={(e) => setFormData({ ...formData, decisionMaking: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isReadOnly}
              >
                <option value="analytical">Analytical</option>
                <option value="intuitive">Intuitive</option>
                <option value="consensus-seeking">Consensus-seeking</option>
                <option value="directive">Directive</option>
                <option value="collaborative">Collaborative</option>
                <option value="data-driven">Data-driven</option>
              </select>
            </div>
          </div>

          {/* LLM Model Configuration */}
          <div className="border-t pt-6">
            <h4 className="font-medium text-gray-900 mb-4">Language Model Configuration</h4>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model Profile
              </label>
              <select
                value={formData.modelId}
                onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isReadOnly || modelsLoading}
              >
                {modelsLoading ? (
                  <option>Loading models...</option>
                ) : (
                  Array.isArray(availableModels) ? availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.provider}/{model.model}){!model.isActive ? ' [Inactive]' : ''}
                    </option>
                  )) : (
                    <option value="analytical-researcher">No models available</option>
                  )
                )}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {modelsLoading
                  ? "Loading available model profiles..."
                  : "Choose a model profile optimized for your agent's intended tasks"
                }
              </p>
            </div>

            {/* Agentic Loop Configuration */}
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="agenticLoopEnabled"
                  checked={formData.agenticLoopEnabled}
                  onChange={(e) => setFormData({ ...formData, agenticLoopEnabled: e.target.checked })}
                  disabled={isReadOnly}
                  className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div className="flex-1">
                  <label htmlFor="agenticLoopEnabled" className="block text-sm font-medium text-gray-900 cursor-pointer">
                    Enable Agentic Loop (Iterative Tool Usage)
                  </label>
                  <p className="text-xs text-gray-600 mt-1">
                    Allows the agent to autonomously use tools in multiple iterations, seeing results and deciding next actions.
                    Perfect for complex multi-step workflows like code reviews, research, or analysis tasks.
                  </p>
                </div>
              </div>

              {formData.agenticLoopEnabled && (
                <div className="mt-4 space-y-4 pl-8">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Iterations
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={formData.agenticLoopMaxIterations}
                      onChange={(e) => setFormData({ ...formData, agenticLoopMaxIterations: parseInt(e.target.value) || 10 })}
                      className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      disabled={isReadOnly}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Maximum number of LLM calls (default: 10). Higher values allow more complex multi-step tasks.
                    </p>
                  </div>

                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      id="agenticLoopTrackCosts"
                      checked={formData.agenticLoopTrackCosts}
                      onChange={(e) => setFormData({ ...formData, agenticLoopTrackCosts: e.target.checked })}
                      disabled={isReadOnly}
                      className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label htmlFor="agenticLoopTrackCosts" className="text-sm text-gray-700 cursor-pointer">
                      Track total token usage and costs across all iterations
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {agent && mode === 'view' && (
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="font-medium text-gray-900 mb-2">Agent Details</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Status:</span>
                  <span className="ml-2 font-medium">{agent.status}</span>
                </div>
                <div>
                  <span className="text-gray-500">Created:</span>
                  <span className="ml-2">{new Date(agent.createdAt).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="text-gray-500">Updated:</span>
                  <span className="ml-2">{new Date(agent.updatedAt).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="text-gray-500">Max Tasks:</span>
                  <span className="ml-2">{agent.specialization?.maxConcurrentTasks}</span>
                </div>
              </div>
              
              <div className="mt-3">
                <span className="text-gray-500">Capabilities:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {agent.capabilities.map((cap) => (
                    <span key={cap} className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
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
                onClick={() => console.log('🖱️ Submit button clicked')}
              >
                {mode === 'create' ? 'Create Agent' : 'Update Agent'}
              </button>
            )}
          </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AgentManagement() {
  console.log('🚀 AgentManagement component mounted');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit' | 'view';
    agent?: Agent;
  }>({ isOpen: false, mode: 'create' });
  
  // Models state - moved from modal to main component
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  
  // Realms state for agent-realm associations
  const [availableRealms, setAvailableRealms] = useState<any[]>([]);
  const [realmsLoading, setRealmsLoading] = useState(true);

  // Cache refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchAgents();
    loadModels(); // Load models when component mounts
    loadRealms(); // Load realms for agent associations
    
    // Listen for dashboard quick action to open create modal
    const handleOpenCreateModal = () => {
      setModalState({ isOpen: true, mode: 'create' });
    };
    
    window.addEventListener('openCreateAgentModal', handleOpenCreateModal);
    
    return () => {
      window.removeEventListener('openCreateAgentModal', handleOpenCreateModal);
    };
  }, []); // Empty dependency array - only run once on mount

  const loadModels = async () => {
    try {
      setModelsLoading(true);
      console.log('Loading models...');
      const response = await agentApi.getAvailableModels();
      console.log('Models API response:', response);
      // Ensure response.data is an array
      if (Array.isArray(response.data)) {
        console.log(`Loaded ${response.data.length} models:`, response.data);
        setAvailableModels(response.data);
      } else {
        console.error('API response.data is not an array:', response.data);
        setAvailableModels([]);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      // Fallback to default models if API fails
      setAvailableModels([
        { 
          id: 'creative-writer', 
          name: 'Creative Writer', 
          description: 'Optimized for creative and narrative tasks',
          tags: ['creative', 'writing'],
          provider: 'ollama',
          model: 'qwen2.5:1.5b',
          isDefault: false,
          isActive: true
        },
        { 
          id: 'analytical-researcher', 
          name: 'Analytical Researcher', 
          description: 'Best for data analysis and research',
          tags: ['analytical', 'research'],
          provider: 'ollama',
          model: 'qwen2.5:1.5b',
          isDefault: true,
          isActive: true
        },
        { 
          id: 'balanced-assistant', 
          name: 'Balanced Assistant', 
          description: 'General purpose assistant',
          tags: ['general', 'balanced'],
          provider: 'ollama',
          model: 'qwen2.5:1.5b',
          isDefault: false,
          isActive: true
        }
      ]);
    } finally {
      setModelsLoading(false);
    }
  };

  const loadRealms = async () => {
    try {
      setRealmsLoading(true);
      console.log('Loading realms...');
      const response = await realmApi.getRealms();
      console.log('Realms API response:', response);
      // Handle the response data format
      const realmsData = Array.isArray(response.data) ? response.data : response;
      if (Array.isArray(realmsData)) {
        console.log(`Loaded ${realmsData.length} realms:`, realmsData);
        setAvailableRealms(realmsData);
      } else {
        console.error('Realms data is not an array:', realmsData);
        setAvailableRealms([]);
      }
    } catch (error) {
      console.error('Failed to load realms:', error);
      setAvailableRealms([]);
    } finally {
      setRealmsLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const response = await agentApi.getAgents();
      setAgents(response.data);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Auto-wrap agent extension with YAML frontmatter if not present
   */
  const ensureFrontmatter = (extension: string, agentName: string, agentDescription: string): string => {
    if (!extension) return extension;

    // Check if already has frontmatter (starts with ---)
    if (extension.trim().startsWith('---')) {
      return extension;
    }

    // Auto-wrap with frontmatter
    return `---
version: 1.0.0
metadata:
  name: "${agentName} Extension"
  description: "${agentDescription}"
---

${extension}`;
  };

  const handleCreateAgent = async (data: AgentFormData) => {
    try {
      // Map form data to the correct format expected by the backend
      const createPayload: CreateAgentRequest = {
        name: data.name,
        type: data.type,
        description: data.description,
        systemPrompt: data.systemPrompt,
        domain: data.domain, // Backend expects flat domain field
        capabilities: data.capabilities,
        expertise: data.expertise,
        knowledgeNamespaces: data.knowledgeNamespaces,
        maxConcurrentTasks: data.maxConcurrentTasks,
        personalityTraits: data.personalityTraits,
        communicationStyle: data.communicationStyle,
        decisionMaking: data.decisionMaking,
        modelId: data.modelId, // Include the selected model profile
        mcpTools: data.mcpTools, // Include MCP tool patterns
        // Agentic loop configuration
        agenticLoop: {
          enabled: data.agenticLoopEnabled,
          maxIterations: data.agenticLoopMaxIterations,
          trackCosts: data.agenticLoopTrackCosts
        },
        // Prompt composition configuration (NEW)
        promptConfig: data.usePromptComposition ? {
          baseTemplate: data.baseTemplate,
          agentExtension: data.agentExtension
            ? ensureFrontmatter(data.agentExtension, data.name, data.description)
            : undefined,
          disableRealmPrompt: data.disableRealmPrompt
        } : undefined,
        // Map realm associations using proper realmAccess structure
        realmAccess: (() => {
          if (data.type === 'elemental' && data.boundRealmId) {
            return { boundRealmId: data.boundRealmId };
          } else if (data.type === 'druid' && data.allowedRealms.length > 0) {
            return {
              accessibleRealms: data.allowedRealms
              // Druids should NOT have boundRealmId - they can travel between realms
            };
          }
          return undefined; // No realm assignment
        })(),
        // Resource access configuration (NEW)
        resourceAccess: data.allowedLocations.trim() ? {
          allowedLocations: data.allowedLocations
            .split('\n')
            .map(loc => loc.trim())
            .filter(loc => loc.length > 0)
        } : undefined
      };

      await agentApi.createAgent(createPayload);
      await fetchAgents();
    } catch (error: any) {
      console.error('Failed to create agent:', error);

      // Show user-friendly error messages and re-throw to keep modal open
      if (error.response?.status === 409) {
        alert(`Agent name "${data.name}" already exists. Please choose a different name.`);
      } else if (error.response?.status === 400) {
        const message = error.response?.data?.message || 'Invalid agent configuration';
        alert(`Error creating agent: ${message}`);
      } else {
        alert('Failed to create agent. Please check your input and try again.');
      }

      // Re-throw the error so the modal stays open
      throw error;
    }
  };

  const handleUpdateAgent = async (data: AgentFormData) => {
    if (!modalState.agent) return;
    try {
      console.log('🔄 Updating agent:', modalState.agent.id, 'with form data:', {
        type: data.type,
        boundRealmId: data.boundRealmId,
        allowedRealms: data.allowedRealms
      });
      // Map form data to the correct format expected by the backend
      const updatePayload: UpdateAgentRequest = {
        name: data.name,
        description: data.description,
        type: data.type, // Enable type updates
        capabilities: data.capabilities,
        // Map form data to nested specialization structure
        specialization: {
          domain: data.domain,
          expertise: data.expertise,
          knowledgeNamespaces: data.knowledgeNamespaces,
          maxConcurrentTasks: data.maxConcurrentTasks
        },
        personality: {
          traits: data.personalityTraits,
          communicationStyle: data.communicationStyle,
          decisionMaking: data.decisionMaking
        },
        llmConfig: {
          systemPrompt: data.systemPrompt,
          // Agentic loop configuration
          agenticLoop: {
            enabled: data.agenticLoopEnabled,
            maxIterations: data.agenticLoopMaxIterations,
            trackCosts: data.agenticLoopTrackCosts
          }
        },
        modelId: data.modelId, // Include the selected model profile
        mcpTools: data.mcpTools, // Include MCP tool patterns
        // Prompt composition configuration (NEW)
        promptConfig: data.usePromptComposition ? {
          baseTemplate: data.baseTemplate,
          agentExtension: data.agentExtension
            ? ensureFrontmatter(data.agentExtension, data.name, data.description)
            : undefined,
          disableRealmPrompt: data.disableRealmPrompt
        } : undefined,
        // Map realm associations using new realmAccess structure
        realmAccess: (() => {
          if (data.type === 'elemental') {
            return { boundRealmId: data.boundRealmId }; // Always include, even if empty
          } else if (data.type === 'druid') {
            return {
              accessibleRealms: data.allowedRealms
              // Druids should NOT have boundRealmId - they can travel between realms
            };
          }
          return undefined;
        })(),
        // Resource access configuration (NEW)
        resourceAccess: data.allowedLocations.trim() ? {
          allowedLocations: data.allowedLocations
            .split('\n')
            .map(loc => loc.trim())
            .filter(loc => loc.length > 0)
        } : undefined
      };

      console.log('🚀 Computed realmAccess:', updatePayload.realmAccess, 'from type:', data.type);
      console.log('🚀 Sending update payload:', updatePayload);
      await agentApi.updateAgent(modalState.agent.id, updatePayload);
      console.log('✅ Update successful, refreshing agents...');
      // Refresh the agents list to show updated data
      await fetchAgents();
      console.log('🔄 Agents refreshed');
    } catch (error: any) {
      console.error('❌ Failed to update agent:', error);
      
      // Show user-friendly error messages and re-throw to keep modal open
      if (error.response?.status === 409) {
        alert(`Agent name "${data.name}" already exists. Please choose a different name.`);
      } else if (error.response?.status === 400) {
        const message = error.response?.data?.message || 'Invalid agent configuration';
        alert(`Error updating agent: ${message}`);
      } else {
        alert('Failed to update agent. Please check your input and try again.');
      }
      
      // Re-throw the error so the modal stays open
      throw error;
    }
  };

  const handleDeleteAgent = async (agent: Agent) => {
    if (window.confirm(`Are you sure you want to delete "${agent.name}"?`)) {
      try {
        await agentApi.deleteAgent(agent.id);
        fetchAgents();
      } catch (error) {
        console.error('Failed to delete agent:', error);
      }
    }
  };

  const handleStartAgent = async (agent: Agent) => {
    try {
      await agentApi.startAgent(agent.id);
      fetchAgents();
    } catch (error) {
      console.error('Failed to start agent:', error);
    }
  };

  const handleStopAgent = async (agent: Agent) => {
    try {
      await agentApi.stopAgent(agent.id);
      fetchAgents();
    } catch (error) {
      console.error('Failed to stop agent:', error);
    }
  };

  const handleChat = (agent: Agent) => {
    // TODO: Implement chat interface
    console.log('Chat with agent:', agent.name);
  };

  const handleRefreshCache = async () => {
    setIsRefreshing(true);
    try {
      await agentApi.refreshCache();
      // After refreshing cache, reload agents to show updated data
      await fetchAgents();
    } catch (error) {
      console.error('Failed to refresh cache:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredAgents = agents.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         agent.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !typeFilter || agent.type === typeFilter;
    const matchesStatus = !statusFilter || agent.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
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
          <h1 className="text-2xl font-bold text-gray-900">Agent Management</h1>
          <p className="text-gray-600">Create, configure, and manage your intelligent agents</p>
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
            Create Agent
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
              placeholder="Search agents..."
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
            <option value="druid">Druid</option>
            <option value="elemental">Elemental</option>
            <option value="gaia">Gaia</option>
            <option value="worldtree">Worldtree</option>
          </select>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <Users className="h-8 w-8 text-primary-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Agents</p>
              <p className="text-2xl font-semibold text-gray-900">{agents.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <Play className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active</p>
              <p className="text-2xl font-semibold text-gray-900">
                {agents.filter(a => a.status === 'active').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <Pause className="h-8 w-8 text-gray-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Inactive</p>
              <p className="text-2xl font-semibold text-gray-900">
                {agents.filter(a => a.status === 'inactive').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <AlertCircle className="h-8 w-8 text-red-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Errors</p>
              <p className="text-2xl font-semibold text-gray-900">
                {agents.filter(a => a.status === 'error').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Agents Grid */}
      {filteredAgents.length === 0 ? (
        <div className="text-center py-12">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No agents found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm || typeFilter || statusFilter 
              ? 'Try adjusting your filters or search terms.'
              : 'Get started by creating your first agent.'
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onEdit={(agent) => {
                console.log('✏️ Edit button clicked for agent:', agent.name);
                setModalState({ isOpen: true, mode: 'edit', agent });
              }}
              onDelete={handleDeleteAgent}
              onStart={handleStartAgent}
              onStop={handleStopAgent}
              onChat={handleChat}
              onView={(agent) => setModalState({ isOpen: true, mode: 'view', agent })}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      <AgentModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, mode: 'create', agent: undefined })}
        onSubmit={modalState.mode === 'create' ? handleCreateAgent : handleUpdateAgent}
        agent={modalState.agent}
        mode={modalState.mode}
        title={
          modalState.mode === 'create' ? 'Create New Agent' :
          modalState.mode === 'edit' ? 'Edit Agent' :
          'Agent Details'
        }
        availableModels={availableModels}
        modelsLoading={modelsLoading}
        availableRealms={availableRealms}
        realmsLoading={realmsLoading}
      />
    </div>
  );
}