import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Clock,
  CheckCircle,
  XCircle,
  Users,
  Search,
  Filter,
  Eye,
  RefreshCw,
  Plus,
  Activity,
  FileText,
  AlertCircle,
  ChevronRight,
  Trash2,
  RotateCcw,
  Eraser,
  Edit
} from 'lucide-react';
import { agentApi, Agent } from '../services/api';
import coordinationRestApi from '../services/coordinationRestApi';
import { ContentViewer } from '../components/ContentViewer';

// Define types for coordination functionality
interface ParticipantContribution {
  agentId: string;
  contribution: string;
  weight?: number;
}

interface FinalResult {
  summary: string;
  integratedContent?: string;
  participantContributions?: ParticipantContribution[];
  coordinatorAnalysis?: string;
  recommendations?: string[];
  publishedTo?: string[];
}

interface CoordinationSession {
  id: string; // Changed from sessionId to id to match backend
  coordinatorId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  scenarioPrompt: string;
  participantIds: string[];
  startTime?: string; // Made optional since backend uses startedAt
  startedAt?: string; // Added to match backend
  endTime?: string;
  completedAt?: string; // Added to match backend
  results?: any;
  publishedContent?: PublishedContent[];
  // Optional properties that may not be available initially
  participantTasks?: Array<{
    agentId: string;
    status: string;
    result?: string;
  }>;
  finalResult?: FinalResult;
}

interface CoordinationRequest {
  coordinatorId: string;
  scenarioPrompt: string;
  participantIds: string[];
  timeoutMinutes?: number;
  coordinationStyle?: string;
  publishTo?: string;
}

interface ConcurrencyMetrics {
  totalSessions: number;
  activeSessions: number;
  maxConcurrent: number;
  coordinators: Array<{
    id: string;
    activeSessions: number;
    maxSessions: number;
  }>;
}

interface PublishedContent {
  id: string;
  sessionId: string;
  title: string;
  path: string;
  contentType: 'text' | 'markdown' | 'json';
  createdAt: string;
  tags?: string[];
  content?: string; // Add content property
}

export default function ModernCoordinationManagement() {
  const navigate = useNavigate();
  const [activeSessions, setActiveSessions] = useState<CoordinationSession[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [metrics, setMetrics] = useState<ConcurrencyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewSessionForm, setShowNewSessionForm] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionDetails, setSessionDetails] = useState<CoordinationSession | null>(null);
  const [publishedContent, setPublishedContent] = useState<PublishedContent[]>([]);
  const [initialFormData, setInitialFormData] = useState<CoordinationRequest | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [sessionsData, agentsData, metricsData] = await Promise.all([
        coordinationRestApi.getActiveSessions(),
        agentApi.getAgents(),
        coordinationRestApi.getConcurrencyMetrics()
      ]);

      setActiveSessions(sessionsData.sessions || []);
      setAgents(agentsData.data);
      setMetrics(metricsData);
    } catch (error) {
      console.error('Failed to load coordination data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSessionDetails = async (sessionId: string) => {
    try {
      const [sessionData, contentData] = await Promise.all([
        coordinationRestApi.getCoordinationSession(sessionId),
        coordinationRestApi.getSessionContent(sessionId)
      ]);

      setSessionDetails(sessionData);
      setPublishedContent(contentData?.publishedContent || []);
    } catch (error) {
      console.error('Failed to load session details:', error);
    }
  };

  const handleSessionClick = (sessionId: string) => {
    setSelectedSession(sessionId);
    loadSessionDetails(sessionId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading coordination data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Coordination Management</h1>
              <p className="mt-2 text-gray-600">Manage multi-agent coordination sessions with concurrent session support</p>
            </div>
            <button
              onClick={() => {
                setInitialFormData(null);
                setShowNewSessionForm(true);
              }}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors flex items-center space-x-2"
            >
              <Plus className="h-5 w-5" />
              <span>New Session</span>
            </button>
          </div>

          {/* Metrics Cards */}
          {metrics && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <Activity className="h-8 w-8 text-blue-600" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">Active Sessions</p>
                    <p className="text-2xl font-semibold text-gray-900">{metrics.activeSessions}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <Users className="h-8 w-8 text-green-600" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">Available Agents</p>
                    <p className="text-2xl font-semibold text-gray-900">{agents.filter(a => a.status === 'active').length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <AlertCircle className="h-8 w-8 text-yellow-600" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">Max Concurrent</p>
                    <p className="text-2xl font-semibold text-gray-900">{metrics.maxConcurrent}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <FileText className="h-8 w-8 text-purple-600" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-500">Total Content</p>
                    <p className="text-2xl font-semibold text-gray-900">{publishedContent.length}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Active Sessions List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Active Coordination Sessions</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {activeSessions.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Sessions</h3>
                    <p className="text-gray-500 mb-4">Start a new coordination session to begin multi-agent collaboration.</p>
                    <button
                      onClick={() => setShowNewSessionForm(true)}
                      className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
                    >
                      Start New Session
                    </button>
                  </div>
                ) : (
                  activeSessions.map((session) => (
                    <SessionCard 
                      key={session.id} 
                      session={session} 
                      onClick={() => handleSessionClick(session.id)}
                      isSelected={selectedSession === session.id}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Session Details Panel */}
          <div className="lg:col-span-1">
            {selectedSession && sessionDetails ? (
              <SessionDetailsPanel
                session={sessionDetails}
                content={publishedContent}
                onRefresh={() => loadSessionDetails(selectedSession)}
                agents={agents}
                onNavigateToContent={() => navigate('/content')}
                onEdit={() => {
                  // Pre-populate form with session configuration
                  setInitialFormData({
                    coordinatorId: sessionDetails.coordinatorId,
                    scenarioPrompt: sessionDetails.scenarioPrompt,
                    participantIds: sessionDetails.participantIds,
                    timeoutMinutes: 30, // Default, as original timeout isn't stored
                    coordinationStyle: 'collaborative' // Default, as original style isn't stored
                  });
                  setShowNewSessionForm(true);
                }}
                onRerun={async () => {
                  try {
                    const result = await coordinationRestApi.rerunExecution(selectedSession);
                    alert(`Session restarted successfully! New session ID: ${result.newExecutionId}`);
                    loadData(); // Refresh the data
                    setSelectedSession(result.newExecutionId); // Switch to new session
                    loadSessionDetails(result.newExecutionId);
                  } catch (error: any) {
                    alert(`Failed to rerun session: ${error.message}`);
                  }
                }}
                onDelete={async () => {
                  if (confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
                    try {
                      await coordinationRestApi.deleteExecution(selectedSession);
                      alert('Session deleted successfully');
                      setSelectedSession(null);
                      setSessionDetails(null);
                      loadData(); // Refresh the data
                    } catch (error: any) {
                      alert(`Failed to delete session: ${error.message}`);
                    }
                  }
                }}
                onPurgeResults={async () => {
                  if (confirm('Are you sure you want to purge the results? This will remove all output data but keep the session record.')) {
                    try {
                      await coordinationRestApi.purgeExecutionResults(selectedSession);
                      alert('Session results purged successfully');
                      loadSessionDetails(selectedSession); // Refresh to show updated session
                    } catch (error: any) {
                      alert(`Failed to purge results: ${error.message}`);
                    }
                  }
                }}
              />
            ) : (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-center text-gray-500">
                  <Eye className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Session</h3>
                  <p>Click on a session to view details and progress</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* New Session Form Modal */}
        {showNewSessionForm && (
          <NewSessionForm
            agents={agents}
            initialData={initialFormData}
            onClose={() => {
              setShowNewSessionForm(false);
              setInitialFormData(null);
            }}
            onSubmit={async (request, useNaturalLanguage = false) => {
              try {
                if (useNaturalLanguage) {
                  // Use natural language API that defaults to built-in coordinator
                  await coordinationRestApi.startNaturalCoordination({
                    scenarioPrompt: request.scenarioPrompt,
                    participantIds: request.participantIds,
                    coordinatorId: request.coordinatorId === 'built-in-coordinator' ? undefined : request.coordinatorId,
                    timeoutMinutes: request.timeoutMinutes,
                    coordinationStyle: request.coordinationStyle,
                    publishTo: request.publishTo,
                    metadata: { 
                      mode: 'natural_language',
                      uiGenerated: true 
                    }
                  });
                } else {
                  // Use explicit coordinator API
                  await coordinationRestApi.startCoordination(request.coordinatorId, {
                    scenarioPrompt: request.scenarioPrompt,
                    participantIds: request.participantIds,
                    timeoutMinutes: request.timeoutMinutes,
                    coordinationStyle: request.coordinationStyle,
                    publishTo: request.publishTo
                  });
                }
                setShowNewSessionForm(false);
                loadData(); // Refresh the data
              } catch (error) {
                console.error('Failed to start coordination:', error);
                alert('Failed to start coordination session');
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

// Session Card Component
function SessionCard({ 
  session, 
  onClick, 
  isSelected 
}: { 
  session: CoordinationSession;
  onClick: () => void;
  isSelected: boolean;
}) {
  const statusIcons = {
    pending: <Clock className="h-5 w-5 text-blue-600" />,
    running: <Clock className="h-5 w-5 text-blue-600" />,
    completed: <CheckCircle className="h-5 w-5 text-green-600" />,
    failed: <XCircle className="h-5 w-5 text-red-600" />
  };

  const statusColors = {
    pending: 'bg-gray-100 text-gray-800 border-gray-200',
    running: 'bg-blue-100 text-blue-800 border-blue-200',
    completed: 'bg-green-100 text-green-800 border-green-200',
    failed: 'bg-red-100 text-red-800 border-red-200'
  };

  return (
    <div 
      className={`px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors ${
        isSelected ? 'bg-primary-50 border-l-4 border-primary-600' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            {statusIcons[session.status]}
            <h3 className="text-sm font-semibold text-gray-900">
              Session {session.id.split('-').pop()}
            </h3>
            <span className={`px-2 py-1 text-xs rounded-full border ${statusColors[session.status]}`}>
              {session.status.replace('_', ' ')}
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-2 line-clamp-2">
            {session.scenarioPrompt}
          </p>
          <div className="flex items-center space-x-4 text-xs text-gray-500">
            <span className="flex items-center space-x-1">
              <Users className="h-3 w-3" />
              <span>{session.participantIds.length} participants</span>
            </span>
            <span>Started {new Date(session.startedAt || session.startTime || '').toLocaleTimeString()}</span>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-400" />
      </div>
    </div>
  );
}

// Session Details Panel Component
function SessionDetailsPanel({
  session,
  content,
  onRefresh,
  agents,
  onNavigateToContent,
  onEdit,
  onRerun,
  onDelete,
  onPurgeResults
}: {
  session: CoordinationSession;
  content: PublishedContent[];
  onRefresh: () => void;
  agents: Agent[];
  onNavigateToContent: () => void;
  onEdit: () => void;
  onRerun: () => void;
  onDelete: () => void;
  onPurgeResults: () => void;
}) {
  // Create agent name lookup
  const agentNames = agents.reduce((acc, agent) => {
    acc[agent.id] = agent.name;
    return acc;
  }, {} as { [agentId: string]: string });

  const isCompleted = session.status === 'completed' || session.status === 'failed';

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Session Details</h3>
        <button
          onClick={onRefresh}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      {/* Action Buttons for Completed Sessions */}
      {isCompleted && (
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Actions</h4>
          <div className="flex flex-col space-y-2">
            <button
              onClick={onEdit}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <Edit className="h-4 w-4" />
              <span>Edit & Rerun</span>
            </button>
            <button
              onClick={onRerun}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Rerun Session</span>
            </button>
            <button
              onClick={onPurgeResults}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
            >
              <Eraser className="h-4 w-4" />
              <span>Purge Results</span>
            </button>
            <button
              onClick={onDelete}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete Session</span>
            </button>
          </div>
        </div>
      )}

      <div className="px-6 py-4 space-y-6">
        {/* Session Info */}
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-2">Scenario Prompt</h4>
          <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">{session.scenarioPrompt}</p>
        </div>

        {/* Session Metadata */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-2">Session ID</h4>
            <p className="text-sm text-gray-600 font-mono">{session.id}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-2">Coordinator</h4>
            <p className="text-sm text-gray-600">{session.coordinatorId}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-2">Started</h4>
            <p className="text-sm text-gray-600">
              {new Date(session.startedAt || session.startTime || '').toLocaleString()}
            </p>
          </div>
          {session.completedAt && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">Completed</h4>
              <p className="text-sm text-gray-600">
                {new Date(session.completedAt).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {/* Participants */}
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-2">Participants ({session.participantIds.length})</h4>
          <div className="grid grid-cols-1 gap-2">
            {session.participantIds.map((participantId) => {
              const agent = agents.find(a => a.id === participantId);
              return (
                <div key={participantId} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      {agent?.name || participantId}
                    </span>
                    {agent?.specialization?.domain && (
                      <span className="ml-2 text-xs text-gray-500">
                        ({agent.specialization.domain})
                      </span>
                    )}
                  </div>
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                    Active
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tasks Progress */}
        {session.participantTasks && session.participantTasks.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-2">Task Progress</h4>
            <div className="space-y-2">
              {session.participantTasks.map((task, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">
                      {agentNames[task.agentId] || task.agentId}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      task.status === 'completed' ? 'bg-green-100 text-green-800' :
                      task.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                      task.status === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {task.status}
                    </span>
                  </div>
                  {task.result && (
                    <p className="text-sm text-gray-600">{task.result}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Final Results with ContentViewer */}
        {session.finalResult && (
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-4">Final Results</h4>
            <ContentViewer 
              finalResult={session.finalResult} 
              agentNames={agentNames}
              onViewContent={(content) => {
                // TODO: Navigate to content browser with specific content
                console.log('View content:', content);
              }}
              onNavigateToContent={onNavigateToContent}
            />
          </div>
        )}

        {/* Published Content */}
        {content.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-2">Published Content ({content.length})</h4>
            <div className="space-y-2">
              {content.map((item) => (
                <div key={item.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{item.title}</span>
                    <span className="text-xs text-gray-500">{item.contentType}</span>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">{item.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// New Session Form Component
function NewSessionForm({
  agents,
  initialData,
  onClose,
  onSubmit
}: {
  agents: Agent[];
  initialData?: CoordinationRequest | null;
  onClose: () => void;
  onSubmit: (request: CoordinationRequest, useNaturalLanguage?: boolean) => Promise<void>;
}) {
  const [formData, setFormData] = useState<CoordinationRequest>(
    initialData || {
      coordinatorId: 'built-in-coordinator',
      scenarioPrompt: '',
      participantIds: [],
      timeoutMinutes: 30,
      coordinationStyle: 'collaborative'
    }
  );

  const [naturalLanguageMode, setNaturalLanguageMode] = useState(true); // Default to natural mode
  const activeAgents = agents.filter(agent => agent.status === 'active');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.scenarioPrompt.trim() && formData.participantIds.length > 0) {
      // In natural language mode, don't auto-include coordinator in participants 
      // The backend will handle coordination automatically
      let finalParticipantIds = [...formData.participantIds];
      
      if (!naturalLanguageMode) {
        // Only auto-include druid coordinator in explicit mode
        const coordinator = activeAgents.find(agent => agent.id === formData.coordinatorId);
        if (coordinator && coordinator.type === 'druid' && !finalParticipantIds.includes(coordinator.id)) {
          finalParticipantIds.push(coordinator.id);
        }
      }
      
      await onSubmit({
        ...formData,
        participantIds: finalParticipantIds
      }, naturalLanguageMode);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-screen overflow-y-auto">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">
          {initialData ? 'Edit & Start New Session' : 'Start New Coordination Session'}
        </h2>
        
        {/* Natural Language Mode Toggle */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-blue-900">Smart Coordination Mode</h3>
              <p className="text-xs text-blue-700 mt-1">
                {naturalLanguageMode 
                  ? "System automatically selects the best coordinator for your request"
                  : "You manually specify which coordinator to use"}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={naturalLanguageMode}
                onChange={(e) => setNaturalLanguageMode(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Coordinator Selection - Only show in manual mode */}
          {!naturalLanguageMode && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Coordinator
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              value={formData.coordinatorId}
              onChange={(e) => setFormData(prev => ({ ...prev, coordinatorId: e.target.value }))}
              required
            >
              <option value="built-in-coordinator">Built-in Coordinator</option>
              {activeAgents.filter(agent => agent.type === 'druid').map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} (Druid)
                </option>
              ))}
            </select>
          </div>
          )}

          {/* Scenario Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Scenario Prompt
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              rows={4}
              placeholder="Describe the coordination scenario and what you want the agents to accomplish..."
              value={formData.scenarioPrompt}
              onChange={(e) => setFormData(prev => ({ ...prev, scenarioPrompt: e.target.value }))}
              required
            />
          </div>

          {/* Participant Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Participants ({formData.participantIds.length} selected)
            </label>
            <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-lg p-3 space-y-2">
              {activeAgents.map((agent) => (
                <label key={agent.id} className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    checked={formData.participantIds.includes(agent.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData(prev => ({
                          ...prev,
                          participantIds: [...prev.participantIds, agent.id]
                        }));
                      } else {
                        setFormData(prev => ({
                          ...prev,
                          participantIds: prev.participantIds.filter(id => id !== agent.id)
                        }));
                      }
                    }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                    <p className="text-xs text-gray-500">{agent.specialization.domain}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    agent.type === 'druid' ? 'bg-purple-100 text-purple-800' :
                    agent.type === 'elemental' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {agent.type}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Coordination Style
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                value={formData.coordinationStyle}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  coordinationStyle: e.target.value as 'collaborative' | 'consultative' | 'directive'
                }))}
              >
                <option value="collaborative">Collaborative</option>
                <option value="consultative">Consultative</option>
                <option value="directive">Directive</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Timeout (minutes)
              </label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                min="5"
                max="180"
                value={formData.timeoutMinutes}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  timeoutMinutes: parseInt(e.target.value) || 30
                }))}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!formData.scenarioPrompt.trim() || formData.participantIds.length === 0}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Start Coordination
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}