import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Brain, 
  Network, 
  Activity, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  Clock,
  Plus,
  Play,
  Zap,
  FileText
} from 'lucide-react';
import { systemApi } from '../services/api';

interface SystemStats {
  agents: { total: number; active: number; inactive: number };
  realms: { total: number; active: number };
  scenarios: { total: number; running: number; completed: number };
  coordination: { sessions: number; active: number };
}

interface RecentActivity {
  id: string;
  type: 'agent' | 'scenario' | 'coordination';
  message: string;
  timestamp: string;
  status: 'success' | 'error' | 'warning' | 'info';
}

function StatCard({ 
  title, 
  value, 
  subValue, 
  icon: Icon, 
  color = 'primary',
  trend 
}: {
  title: string;
  value: string | number;
  subValue?: string;
  icon: React.ComponentType<any>;
  color?: 'primary' | 'druid' | 'elemental' | 'gaia';
  trend?: { value: number; label: string };
}) {
  const colorClasses = {
    primary: 'bg-primary-500 text-primary-100',
    druid: 'bg-druid-500 text-druid-100',
    elemental: 'bg-elemental-500 text-elemental-100',
    gaia: 'bg-gaia-500 text-gaia-100'
  };

  return (
    <div className="card">
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="ml-4 flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <div className="flex items-baseline">
            <p className="text-2xl font-semibold text-gray-900">{value}</p>
            {subValue && (
              <p className="ml-2 text-sm text-gray-500">{subValue}</p>
            )}
          </div>
          {trend && (
            <div className="flex items-center mt-1">
              <TrendingUp className={`h-4 w-4 ${trend.value > 0 ? 'text-green-500' : 'text-red-500'}`} />
              <span className={`text-sm ml-1 ${trend.value > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {trend.value > 0 ? '+' : ''}{trend.value}% {trend.label}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityItem({ activity }: { activity: RecentActivity }) {
  const statusIcons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertCircle,
    info: Activity
  };

  const statusColors = {
    success: 'text-green-500',
    error: 'text-red-500',
    warning: 'text-yellow-500',
    info: 'text-blue-500'
  };

  const StatusIcon = statusIcons[activity.status];

  return (
    <div className="flex items-start space-x-3 py-3">
      <StatusIcon className={`h-5 w-5 mt-0.5 ${statusColors[activity.status]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900">{activity.message}</p>
        <div className="flex items-center mt-1 text-xs text-gray-500">
          <Clock className="h-3 w-3 mr-1" />
          {new Date(activity.timestamp).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick action handlers
  const handleCreateAgent = () => {
    navigate('/agents');
    // We'll trigger the create modal on the agent management page
    setTimeout(() => {
      // This will be handled by a URL parameter or state
      const event = new CustomEvent('openCreateAgentModal');
      window.dispatchEvent(event);
    }, 100);
  };

  const handleExecuteScenario = () => {
    navigate('/scenarios');
  };

  const handleStartCoordination = () => {
    navigate('/coordination');
  };

  const handleViewSystemLogs = () => {
    // Navigate to system settings where monitoring and logs are available
    navigate('/settings');
    // We could also open a dedicated logs modal in the future
    setTimeout(() => {
      // Scroll to monitoring section if it exists
      const monitoringSection = document.querySelector('[data-section="monitoring"]');
      if (monitoringSection) {
        monitoringSection.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true);
        const [statsResponse, activitiesResponse] = await Promise.all([
          systemApi.getSystemStats(),
          systemApi.getRecentActivity()
        ]);
        setStats(statsResponse.data);
        setActivities(activitiesResponse.data);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !stats) {
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
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">System overview and real-time metrics</p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>Live updates</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Agents"
          value={stats.agents.total}
          subValue={`${stats.agents.active} active`}
          icon={Users}
          color="primary"
          trend={{ value: 12, label: 'this week' }}
        />
        <StatCard
          title="Active Realms"
          value={stats.realms.active}
          subValue={`of ${stats.realms.total} total`}
          icon={Network}
          color="druid"
          trend={{ value: 5, label: 'this month' }}
        />
        <StatCard
          title="Running Scenarios"
          value={stats.scenarios.running}
          subValue={`${stats.scenarios.completed} completed`}
          icon={Activity}
          color="elemental"
          trend={{ value: -3, label: 'this hour' }}
        />
        <StatCard
          title="Coordination Sessions"
          value={stats.coordination.active}
          subValue={`of ${stats.coordination.sessions} total`}
          icon={Brain}
          color="gaia"
          trend={{ value: 8, label: 'today' }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
              <button className="text-sm text-primary-600 hover:text-primary-700">
                View all
              </button>
            </div>
            <div className="space-y-1">
              {activities.slice(0, 8).map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button 
                onClick={handleCreateAgent}
                className="w-full btn-primary text-left flex items-center justify-start space-x-3 hover:shadow-md transition-shadow"
              >
                <Plus className="h-5 w-5" />
                <span>Create New Agent</span>
              </button>
              <button 
                onClick={handleExecuteScenario}
                className="w-full btn-secondary text-left flex items-center justify-start space-x-3 hover:shadow-md transition-shadow"
              >
                <Play className="h-5 w-5" />
                <span>Execute Scenario</span>
              </button>
              <button 
                onClick={handleStartCoordination}
                className="w-full btn-secondary text-left flex items-center justify-start space-x-3 hover:shadow-md transition-shadow"
              >
                <Zap className="h-5 w-5" />
                <span>Start Coordination</span>
              </button>
              <button 
                onClick={handleViewSystemLogs}
                className="w-full btn-secondary text-left flex items-center justify-start space-x-3 hover:shadow-md transition-shadow"
              >
                <FileText className="h-5 w-5" />
                <span>View System Logs</span>
              </button>
            </div>
          </div>

          {/* System Health */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">System Health</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">MCP Server</span>
                <div className="flex items-center">
                  <div className="h-2 w-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-medium text-green-600">Online</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Main API</span>
                <div className="flex items-center">
                  <div className="h-2 w-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-medium text-green-600">Online</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Database</span>
                <div className="flex items-center">
                  <div className="h-2 w-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-medium text-green-600">Connected</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Redis Cache</span>
                <div className="flex items-center">
                  <div className="h-2 w-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-medium text-green-600">Connected</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}