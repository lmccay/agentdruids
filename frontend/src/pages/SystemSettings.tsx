import React, { useState, useEffect } from 'react';
import { 
  Settings,
  Save,
  RefreshCw,
  Database,
  Server,
  Shield,
  Bell,
  Monitor,
  Globe,
  Key,
  AlertTriangle,
  CheckCircle,
  Info
} from 'lucide-react';

interface SystemConfiguration {
  api: {
    port: number;
    timeout: number;
    rateLimit: number;
    cors: boolean;
  };
  mcp: {
    port: number;
    sessionTimeout: number;
    maxConcurrentSessions: number;
    enableSSE: boolean;
  };
  agents: {
    maxConcurrentTasks: number;
    defaultTimeout: number;
    autoRestart: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  database: {
    connectionPool: number;
    queryTimeout: number;
    backupInterval: number;
    retentionDays: number;
  };
  security: {
    enableAuthentication: boolean;
    sessionTimeout: number;
    maxLoginAttempts: number;
    enableAuditLog: boolean;
  };
  notifications: {
    enableEmail: boolean;
    enableSlack: boolean;
    alertThresholds: {
      cpuUsage: number;
      memoryUsage: number;
      errorRate: number;
    };
  };
}

function ConfigSection({ 
  title, 
  icon, 
  children,
  description 
}: { 
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="card">
      <div className="flex items-center space-x-2 mb-4">
        {icon}
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {description && (
            <p className="text-sm text-gray-600">{description}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function ConfigField({ 
  label, 
  value, 
  onChange, 
  type = 'text',
  options,
  description,
  required = false 
}: {
  label: string;
  value: any;
  onChange: (value: any) => void;
  type?: 'text' | 'number' | 'boolean' | 'select';
  options?: { value: any; label: string }[];
  description?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      
      {type === 'boolean' ? (
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <span className="ml-2 text-sm text-gray-900">{value ? 'Enabled' : 'Disabled'}</span>
        </div>
      ) : type === 'select' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(type === 'number' ? parseInt(e.target.value) : e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          required={required}
        />
      )}
      
      {description && (
        <p className="text-xs text-gray-500">{description}</p>
      )}
    </div>
  );
}

export default function SystemSettings() {
  const [config, setConfig] = useState<SystemConfiguration>({
    api: {
      port: 3000,
      timeout: 30000,
      rateLimit: 100,
      cors: true
    },
    mcp: {
      port: 3003,
      sessionTimeout: 300000,
      maxConcurrentSessions: 50,
      enableSSE: true
    },
    agents: {
      maxConcurrentTasks: 10,
      defaultTimeout: 60000,
      autoRestart: true,
      logLevel: 'info'
    },
    database: {
      connectionPool: 10,
      queryTimeout: 5000,
      backupInterval: 24,
      retentionDays: 30
    },
    security: {
      enableAuthentication: false,
      sessionTimeout: 3600000,
      maxLoginAttempts: 5,
      enableAuditLog: true
    },
    notifications: {
      enableEmail: false,
      enableSlack: false,
      alertThresholds: {
        cpuUsage: 80,
        memoryUsage: 85,
        errorRate: 5
      }
    }
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [systemHealth, setSystemHealth] = useState({
    status: 'healthy',
    uptime: '2d 14h 32m',
    version: '1.0.0',
    lastRestart: '2 days ago'
  });

  useEffect(() => {
    fetchConfiguration();
    fetchSystemHealth();
  }, []);

  const fetchConfiguration = async () => {
    try {
      setLoading(true);
      // Mock API call - replace with actual implementation
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Configuration loaded from mock data above
    } catch (error) {
      console.error('Failed to fetch configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemHealth = async () => {
    try {
      // Mock API call - replace with actual implementation
      await new Promise(resolve => setTimeout(resolve, 500));
      // System health loaded from mock data above
    } catch (error) {
      console.error('Failed to fetch system health:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Mock API call - replace with actual implementation
      await new Promise(resolve => setTimeout(resolve, 2000));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save configuration:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (section: keyof SystemConfiguration, field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const updateNestedConfig = (section: keyof SystemConfiguration, nested: string, field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [nested]: {
          ...(prev[section] as any)[nested],
          [field]: value
        }
      }
    }));
  };

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
          <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
          <p className="text-gray-600">Configure system behavior and monitoring</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={fetchConfiguration}
            className="btn-secondary flex items-center"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : saved ? (
              <CheckCircle className="h-4 w-4 mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* System Health Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <Monitor className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">System Status</p>
              <p className="text-lg font-semibold text-green-600 capitalize">{systemHealth.status}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <Server className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Uptime</p>
              <p className="text-lg font-semibold text-gray-900">{systemHealth.uptime}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <Settings className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Version</p>
              <p className="text-lg font-semibold text-gray-900">{systemHealth.version}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <RefreshCw className="h-8 w-8 text-orange-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Last Restart</p>
              <p className="text-lg font-semibold text-gray-900">{systemHealth.lastRestart}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Configuration */}
        <ConfigSection
          title="API Configuration"
          icon={<Server className="h-5 w-5 text-blue-600" />}
          description="REST API server settings"
        >
          <div className="grid grid-cols-2 gap-4">
            <ConfigField
              label="Port"
              value={config.api.port}
              onChange={(value) => updateConfig('api', 'port', value)}
              type="number"
              description="API server port"
              required
            />
            <ConfigField
              label="Timeout (ms)"
              value={config.api.timeout}
              onChange={(value) => updateConfig('api', 'timeout', value)}
              type="number"
              description="Request timeout in milliseconds"
            />
            <ConfigField
              label="Rate Limit"
              value={config.api.rateLimit}
              onChange={(value) => updateConfig('api', 'rateLimit', value)}
              type="number"
              description="Requests per minute per IP"
            />
            <ConfigField
              label="Enable CORS"
              value={config.api.cors}
              onChange={(value) => updateConfig('api', 'cors', value)}
              type="boolean"
              description="Allow cross-origin requests"
            />
          </div>
        </ConfigSection>

        {/* MCP Configuration */}
        <ConfigSection
          title="MCP Server"
          icon={<Globe className="h-5 w-5 text-green-600" />}
          description="Model Context Protocol settings"
        >
          <div className="grid grid-cols-2 gap-4">
            <ConfigField
              label="Port"
              value={config.mcp.port}
              onChange={(value) => updateConfig('mcp', 'port', value)}
              type="number"
              description="MCP server port"
              required
            />
            <ConfigField
              label="Session Timeout (ms)"
              value={config.mcp.sessionTimeout}
              onChange={(value) => updateConfig('mcp', 'sessionTimeout', value)}
              type="number"
              description="Session timeout in milliseconds"
            />
            <ConfigField
              label="Max Sessions"
              value={config.mcp.maxConcurrentSessions}
              onChange={(value) => updateConfig('mcp', 'maxConcurrentSessions', value)}
              type="number"
              description="Maximum concurrent sessions"
            />
            <ConfigField
              label="Enable SSE"
              value={config.mcp.enableSSE}
              onChange={(value) => updateConfig('mcp', 'enableSSE', value)}
              type="boolean"
              description="Server-Sent Events support"
            />
          </div>
        </ConfigSection>

        {/* Agent Configuration */}
        <ConfigSection
          title="Agent System"
          icon={<Monitor className="h-5 w-5 text-purple-600" />}
          description="Agent behavior and limits"
        >
          <div className="grid grid-cols-2 gap-4">
            <ConfigField
              label="Max Concurrent Tasks"
              value={config.agents.maxConcurrentTasks}
              onChange={(value) => updateConfig('agents', 'maxConcurrentTasks', value)}
              type="number"
              description="Per-agent task limit"
            />
            <ConfigField
              label="Default Timeout (ms)"
              value={config.agents.defaultTimeout}
              onChange={(value) => updateConfig('agents', 'defaultTimeout', value)}
              type="number"
              description="Default agent task timeout"
            />
            <ConfigField
              label="Auto Restart"
              value={config.agents.autoRestart}
              onChange={(value) => updateConfig('agents', 'autoRestart', value)}
              type="boolean"
              description="Restart failed agents automatically"
            />
            <ConfigField
              label="Log Level"
              value={config.agents.logLevel}
              onChange={(value) => updateConfig('agents', 'logLevel', value)}
              type="select"
              options={[
                { value: 'debug', label: 'Debug' },
                { value: 'info', label: 'Info' },
                { value: 'warn', label: 'Warning' },
                { value: 'error', label: 'Error' }
              ]}
              description="Agent logging verbosity"
            />
          </div>
        </ConfigSection>

        {/* Database Configuration */}
        <ConfigSection
          title="Database"
          icon={<Database className="h-5 w-5 text-orange-600" />}
          description="Database connection and backup settings"
        >
          <div className="grid grid-cols-2 gap-4">
            <ConfigField
              label="Connection Pool"
              value={config.database.connectionPool}
              onChange={(value) => updateConfig('database', 'connectionPool', value)}
              type="number"
              description="Database connection pool size"
            />
            <ConfigField
              label="Query Timeout (ms)"
              value={config.database.queryTimeout}
              onChange={(value) => updateConfig('database', 'queryTimeout', value)}
              type="number"
              description="Database query timeout"
            />
            <ConfigField
              label="Backup Interval (hours)"
              value={config.database.backupInterval}
              onChange={(value) => updateConfig('database', 'backupInterval', value)}
              type="number"
              description="Automatic backup frequency"
            />
            <ConfigField
              label="Retention Days"
              value={config.database.retentionDays}
              onChange={(value) => updateConfig('database', 'retentionDays', value)}
              type="number"
              description="Data retention period"
            />
          </div>
        </ConfigSection>

        {/* Security Configuration */}
        <ConfigSection
          title="Security"
          icon={<Shield className="h-5 w-5 text-red-600" />}
          description="Authentication and security settings"
        >
          <div className="grid grid-cols-2 gap-4">
            <ConfigField
              label="Enable Authentication"
              value={config.security.enableAuthentication}
              onChange={(value) => updateConfig('security', 'enableAuthentication', value)}
              type="boolean"
              description="Require authentication for API access"
            />
            <ConfigField
              label="Session Timeout (ms)"
              value={config.security.sessionTimeout}
              onChange={(value) => updateConfig('security', 'sessionTimeout', value)}
              type="number"
              description="User session timeout"
            />
            <ConfigField
              label="Max Login Attempts"
              value={config.security.maxLoginAttempts}
              onChange={(value) => updateConfig('security', 'maxLoginAttempts', value)}
              type="number"
              description="Failed login attempt limit"
            />
            <ConfigField
              label="Enable Audit Log"
              value={config.security.enableAuditLog}
              onChange={(value) => updateConfig('security', 'enableAuditLog', value)}
              type="boolean"
              description="Log all system activities"
            />
          </div>
        </ConfigSection>

        {/* Notifications Configuration */}
        <ConfigSection
          title="Notifications"
          icon={<Bell className="h-5 w-5 text-yellow-600" />}
          description="Alert and notification settings"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <ConfigField
                label="Enable Email"
                value={config.notifications.enableEmail}
                onChange={(value) => updateConfig('notifications', 'enableEmail', value)}
                type="boolean"
                description="Send email notifications"
              />
              <ConfigField
                label="Enable Slack"
                value={config.notifications.enableSlack}
                onChange={(value) => updateConfig('notifications', 'enableSlack', value)}
                type="boolean"
                description="Send Slack notifications"
              />
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Alert Thresholds</h4>
              <div className="grid grid-cols-3 gap-4">
                <ConfigField
                  label="CPU Usage (%)"
                  value={config.notifications.alertThresholds.cpuUsage}
                  onChange={(value) => updateNestedConfig('notifications', 'alertThresholds', 'cpuUsage', value)}
                  type="number"
                  description="CPU alert threshold"
                />
                <ConfigField
                  label="Memory Usage (%)"
                  value={config.notifications.alertThresholds.memoryUsage}
                  onChange={(value) => updateNestedConfig('notifications', 'alertThresholds', 'memoryUsage', value)}
                  type="number"
                  description="Memory alert threshold"
                />
                <ConfigField
                  label="Error Rate (%)"
                  value={config.notifications.alertThresholds.errorRate}
                  onChange={(value) => updateNestedConfig('notifications', 'alertThresholds', 'errorRate', value)}
                  type="number"
                  description="Error rate alert threshold"
                />
              </div>
            </div>
          </div>
        </ConfigSection>
      </div>

      {/* Warning Banner */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <div className="flex items-center">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
          <div>
            <h3 className="text-sm font-medium text-yellow-800">Configuration Changes</h3>
            <p className="text-sm text-yellow-700 mt-1">
              Some changes may require a system restart to take effect. Save changes and restart the system when convenient.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}