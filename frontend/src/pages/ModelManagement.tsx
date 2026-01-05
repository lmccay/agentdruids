import React, { useState, useEffect } from 'react';
import { 
  Brain, 
  Plus, 
  Edit, 
  Trash2, 
  Power, 
  PowerOff,
  Tag,
  Settings,
  AlertCircle,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { modelApi, ModelConfiguration, CreateModelRequest } from '../services/api';

interface ModelFormData {
  id: string;
  name: string;
  description: string;
  provider: 'ollama' | 'openai' | 'anthropic';
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPromptPrefix?: string;
  tags: string[];
  isDefault?: boolean;
  isActive?: boolean;
}

interface ModalState {
  isOpen: boolean;
  model: ModelConfiguration | null;
  mode: 'create' | 'edit' | 'view';
}

export default function ModelManagement() {
  const [models, setModels] = useState<ModelConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    model: null,
    mode: 'create'
  });

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      setLoading(true);
      const response = await modelApi.getModels();
      setModels(response.data);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setError('Failed to load model configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateModel = async (data: ModelFormData) => {
    try {
      const createPayload: CreateModelRequest = {
        ...data,
        tags: data.tags.filter(tag => tag.trim() !== '')
      };
      
      await modelApi.createModel(createPayload);
      fetchModels();
      setModalState({ isOpen: false, model: null, mode: 'create' });
    } catch (error) {
      console.error('Failed to create model:', error);
    }
  };

  const handleUpdateModel = async (data: ModelFormData) => {
    if (!modalState.model) return;
    try {
      const updates = {
        ...data,
        tags: data.tags.filter(tag => tag.trim() !== '')
      };
      
      await modelApi.updateModel(modalState.model.id, updates);
      fetchModels();
      setModalState({ isOpen: false, model: null, mode: 'create' });
    } catch (error) {
      console.error('Failed to update model:', error);
    }
  };

  const handleDeleteModel = async (id: string) => {
    if (!confirm('Are you sure you want to delete this model configuration?')) return;
    
    try {
      await modelApi.deleteModel(id);
      fetchModels();
    } catch (error) {
      console.error('Failed to delete model:', error);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await modelApi.toggleModelActive(id, !currentActive);
      fetchModels();
    } catch (error) {
      console.error('Failed to toggle model status:', error);
    }
  };

  const openModal = (mode: 'create' | 'edit' | 'view', model?: ModelConfiguration) => {
    setModalState({
      isOpen: true,
      model: model || null,
      mode
    });
  };

  const closeModal = () => {
    setModalState({ isOpen: false, model: null, mode: 'create' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="text-gray-600">Loading model configurations...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <Brain className="mr-3 h-8 w-8 text-blue-600" />
                Model Management
              </h1>
              <p className="mt-2 text-gray-600">
                Configure and manage LLM model profiles for agent creation
              </p>
            </div>
            <button
              onClick={() => openModal('create')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Model Profile
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
              <span className="text-red-800">{error}</span>
            </div>
          </div>
        )}

        {/* Models Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <div
              key={model.id}
              className={`bg-white rounded-lg shadow-sm border-2 transition-all ${
                model.isActive 
                  ? 'border-green-200 hover:border-green-300' 
                  : 'border-gray-200 hover:border-gray-300 opacity-75'
              }`}
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{model.name}</h3>
                      {model.isDefault && (
                        <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{model.description}</p>
                  </div>
                </div>

                {/* Model Details */}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Provider:</span>
                    <span className="font-medium capitalize">{model.provider}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Model:</span>
                    <span className="font-medium">{model.model}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Temperature:</span>
                    <span className="font-medium">{model.temperature}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Max Tokens:</span>
                    <span className="font-medium">{model.maxTokens.toLocaleString()}</span>
                  </div>
                </div>

                {/* Tags */}
                {model.tags && model.tags.length > 0 && (
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-1">
                      {model.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full"
                        >
                          <Tag className="mr-1 h-3 w-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    {model.isActive ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 mr-2" />
                    ) : (
                      <Clock className="h-4 w-4 text-gray-400 mr-2" />
                    )}
                    <span className={`text-sm font-medium ${
                      model.isActive ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {model.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => openModal('view', model)}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                      title="View details"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openModal('edit', model)}
                      className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded"
                      title="Edit"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    {!model.isDefault && (
                      <button
                        onClick={() => handleDeleteModel(model.id)}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggleActive(model.id, model.isActive || false)}
                    className={`p-2 rounded transition-colors ${
                      model.isActive
                        ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                        : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                    }`}
                    title={model.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {model.isActive ? (
                      <PowerOff className="h-4 w-4" />
                    ) : (
                      <Power className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {models.length === 0 && !loading && (
          <div className="text-center py-12">
            <Brain className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No model configurations</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating your first model profile.
            </p>
            <div className="mt-6">
              <button
                onClick={() => openModal('create')}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center mx-auto"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Model Profile
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Model Form Modal */}
      <ModelModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        onSubmit={modalState.mode === 'create' ? handleCreateModel : handleUpdateModel}
        model={modalState.model}
        mode={modalState.mode}
        title={
          modalState.mode === 'create' 
            ? 'Create Model Profile'
            : modalState.mode === 'edit'
            ? 'Edit Model Profile'
            : 'View Model Profile'
        }
      />
    </div>
  );
}

// Model Modal Component
function ModelModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  model, 
  title,
  mode = 'create'
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ModelFormData) => void;
  model?: ModelConfiguration | null;
  title: string;
  mode?: 'create' | 'edit' | 'view';
}) {
  const [formData, setFormData] = useState<ModelFormData>({
    id: '',
    name: '',
    description: '',
    provider: 'ollama',
    model: '',
    temperature: 0.7,
    maxTokens: 2000,
    topP: 0.9,
    frequencyPenalty: undefined,
    presencePenalty: undefined,
    systemPromptPrefix: '',
    tags: [],
    isDefault: false,
    isActive: true
  });

  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (isOpen && model) {
      setFormData({
        id: model.id,
        name: model.name,
        description: model.description,
        provider: model.provider,
        model: model.model,
        temperature: model.temperature,
        maxTokens: model.maxTokens,
        topP: model.topP,
        frequencyPenalty: model.frequencyPenalty,
        presencePenalty: model.presencePenalty,
        systemPromptPrefix: model.systemPromptPrefix || '',
        tags: model.tags || [],
        isDefault: model.isDefault || false,
        isActive: model.isActive !== false
      });
    } else if (isOpen && mode === 'create') {
      // Reset form for create mode
      setFormData({
        id: '',
        name: '',
        description: '',
        provider: 'ollama',
        model: 'qwen2.5:1.5b',
        temperature: 0.7,
        maxTokens: 2000,
        topP: 0.9,
        frequencyPenalty: undefined,
        presencePenalty: undefined,
        systemPromptPrefix: '',
        tags: [],
        isDefault: false,
        isActive: true
      });
    }
  }, [isOpen, model, mode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  if (!isOpen) return null;

  const isReadOnly = mode === 'view';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model ID
              </label>
              <input
                type="text"
                value={formData.id}
                onChange={(e) => setFormData(prev => ({ ...prev, id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., creative-writer"
                required
                disabled={isReadOnly || mode === 'edit'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., Creative Writer"
                required
                disabled={isReadOnly}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              rows={3}
              placeholder="Describe this model's purpose and optimizations"
              required
              disabled={isReadOnly}
            />
          </div>

          {/* Provider Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Provider
              </label>
              <select
                value={formData.provider}
                onChange={(e) => setFormData(prev => ({ ...prev, provider: e.target.value as any }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
                disabled={isReadOnly}
              >
                <option value="ollama">Ollama</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model Name
              </label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., qwen2.5:1.5b"
                required
                disabled={isReadOnly}
              />
            </div>
          </div>

          {/* LLM Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Temperature
              </label>
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={formData.temperature}
                onChange={(e) => setFormData(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
                disabled={isReadOnly}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Tokens
              </label>
              <input
                type="number"
                min="1"
                max="100000"
                value={formData.maxTokens}
                onChange={(e) => setFormData(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
                disabled={isReadOnly}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Top P (optional)
              </label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={formData.topP || ''}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  topP: e.target.value ? parseFloat(e.target.value) : undefined 
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="0.9"
                disabled={isReadOnly}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequency Penalty (optional)
              </label>
              <input
                type="number"
                min="-2"
                max="2"
                step="0.1"
                value={formData.frequencyPenalty || ''}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  frequencyPenalty: e.target.value ? parseFloat(e.target.value) : undefined 
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="0.0"
                disabled={isReadOnly}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Presence Penalty (optional)
              </label>
              <input
                type="number"
                min="-2"
                max="2"
                step="0.1"
                value={formData.presencePenalty || ''}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  presencePenalty: e.target.value ? parseFloat(e.target.value) : undefined 
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="0.0"
                disabled={isReadOnly}
              />
            </div>
          </div>

          {/* System Prompt Prefix */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              System Prompt Prefix (optional)
            </label>
            <textarea
              value={formData.systemPromptPrefix}
              onChange={(e) => setFormData(prev => ({ ...prev, systemPromptPrefix: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              rows={2}
              placeholder="Optional prefix to add to all agent system prompts using this model"
              disabled={isReadOnly}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tags
            </label>
            <div className="space-y-2">
              {!isReadOnly && (
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Add a tag and press Enter"
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  >
                    Add
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                  >
                    {tag}
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="ml-2 text-blue-600 hover:text-blue-800"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Flags */}
          <div className="flex space-x-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isDefault}
                onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                className="mr-2"
                disabled={isReadOnly}
              />
              <span className="text-sm text-gray-700">Default model</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                className="mr-2"
                disabled={isReadOnly}
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              {isReadOnly ? 'Close' : 'Cancel'}
            </button>
            {!isReadOnly && (
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {mode === 'create' ? 'Create Model' : 'Update Model'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}