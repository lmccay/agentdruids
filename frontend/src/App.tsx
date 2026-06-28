import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  Users, 
  Brain, 
  Network, 
  Settings, 
  Activity, 
  Play, 
  FileText,
  Home,
  Menu,
  X,
  Library
} from 'lucide-react';

// Import page components
import Dashboard from './pages/Dashboard';
import AgentManagement from './pages/AgentManagement';
import RealmManagement from './pages/RealmManagement';
import ModernCoordinationManagement from './pages/ModernCoordinationManagement';
import ContentBrowser from './pages/ContentBrowser';
import SystemSettings from './pages/SystemSettings';
import ModelManagement from './pages/ModelManagement';
import WorldTreeLibrary from './pages/WorldTreeLibrary';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  description: string;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: Home, description: 'System overview and metrics' },
  { name: 'Agents', href: '/agents', icon: Users, description: 'Manage agents and their capabilities' },
  { name: 'Models', href: '/models', icon: Brain, description: 'Configure LLM model profiles' },
  { name: 'Realms', href: '/realms', icon: Network, description: 'Federated realm management' },
  { name: 'Coordination', href: '/coordination', icon: Activity, description: 'Multi-agent coordination sessions' },
  { name: 'Content', href: '/content', icon: FileText, description: 'Browse and search published content' },
  { name: 'Library', href: '/library', icon: Library, description: 'Browse and search the ingested knowledge corpus' },
  { name: 'Settings', href: '/settings', icon: Settings, description: 'System configuration' },
];

function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (open: boolean) => void }) {
  const location = useLocation();

  return (
    <>
      {/* Mobile sidebar overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-75 lg:hidden z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:inset-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between h-16 px-4 bg-gray-800">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Activity className="h-8 w-8 text-druid-400" />
            </div>
            <div className="ml-3">
              <h1 className="text-lg font-semibold text-white">Druids</h1>
              <p className="text-xs text-gray-400">Multi-Agent System</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <nav className="mt-8 px-4">
          <ul className="space-y-2">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    className={`
                      group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200
                      ${isActive 
                        ? 'bg-gray-800 text-white' 
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      }
                    `}
                    onClick={() => setIsOpen(false)}
                  >
                    <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                    <div>
                      <div>{item.name}</div>
                      <div className="text-xs text-gray-400 group-hover:text-gray-300">
                        {item.description}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* System status */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                <span className="ml-2 text-sm text-gray-300">System Online</span>
              </div>
              <div className="text-xs text-gray-400">v1.0.0</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="ml-4 lg:ml-0">
              <h1 className="text-xl font-semibold text-gray-900">
                Druids Management Console
              </h1>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="h-2 w-2 bg-green-500 rounded-full"></div>
              <span>MCP Server: Online</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="h-2 w-2 bg-green-500 rounded-full"></div>
              <span>Main API: Online</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <Router>
      <div className="flex h-screen bg-gray-50">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        
        <div className="flex flex-col flex-1 overflow-hidden">
          <TopBar onMenuClick={() => setSidebarOpen(true)} />
          
          <main className="flex-1 overflow-y-auto">
            <div className="p-6">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/agents" element={<AgentManagement />} />
                <Route path="/models" element={<ModelManagement />} />
                <Route path="/realms" element={<RealmManagement />} />
                <Route path="/coordination" element={<ModernCoordinationManagement />} />
                <Route path="/content" element={<ContentBrowser />} />
                <Route path="/library" element={<WorldTreeLibrary />} />
                <Route path="/settings" element={<SystemSettings />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;