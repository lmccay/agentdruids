# Druids Management UI

A comprehensive React-based frontend for managing the Druids multi-agent system.

## Features

### 🎛️ Dashboard
- **Real-time System Overview**: Monitor active agents, running scenarios, and system health
- **Activity Feed**: Track recent agent activities and system events
- **Quick Actions**: Rapid access to common operations
- **System Metrics**: Performance indicators and health monitoring

### 🤖 Agent Management
- **Full CRUD Operations**: Create, read, update, and delete agents
- **Agent Types**: Support for all agent types (Druid, Elemental, Gaia, Worldtree)
- **Custom System Prompts**: Configure agent-specific behavior and personality
- **Status Management**: Start, stop, and monitor agent states
- **Capability Tracking**: View and manage agent capabilities and specializations

### 🌍 Realm Management
- **Local & Federated Realms**: Create and manage both local and federated agent realms
- **Configuration Management**: Set realm parameters like max agents, external access
- **Ley Line Integration**: Configure federated realm connections
- **Agent Assignment**: View and manage agents within realms

### 🎭 Coordination Management
- **Scenario Execution**: Execute multi-agent collaboration scenarios
- **Coordinator Oversight**: Manage coordination agents and their configurations
- **Async Support**: Handle long-running scenarios with async mode
- **Result Tracking**: Monitor scenario progress and retrieve results

## Technical Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS + Custom Components
- **Icons**: Lucide React
- **API Integration**: Axios with MCP Protocol Support
- **Development**: Hot Module Replacement (HMR)

## Getting Started

### Prerequisites
- Node.js 16+ 
- npm or yarn
- Running Druids backend system

### Installation

1. **Install Dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```
   The UI will be available at `http://localhost:3004`

3. **Build for Production**
   ```bash
   npm run build
   ```

## Architecture

### Component Structure
```
src/
├── components/           # Reusable UI components
│   ├── Dashboard.tsx    # System overview dashboard
│   └── Navigation.tsx   # Sidebar navigation
├── pages/               # Main application pages
│   ├── AgentManagement.tsx      # Agent CRUD interface
│   ├── RealmManagement.tsx      # Realm configuration
│   └── CoordinationManagement.tsx # Scenario execution
├── services/            # API integration layer
│   └── api.ts          # MCP protocol client + REST APIs
└── styles/             # Global styles and Tailwind config
```

### API Integration

The frontend communicates with the Druids backend through two channels:

1. **REST API** (`/api/*`): Internal system management
   - Agent lifecycle operations
   - Realm configuration
   - System health checks

2. **MCP Protocol** (`/mcp/*`): Agent coordination and scenario execution
   - Multi-agent scenario coordination
   - Result retrieval from agent collaborations
   - Session management for long-running tasks

### Key Features

#### 🔄 Real-time Updates
- Dashboard auto-refreshes system metrics
- Agent status tracking with live updates
- Scenario progress monitoring

#### 📱 Responsive Design
- Mobile-friendly interface
- Adaptive grid layouts
- Touch-optimized interactions

#### 🎨 Custom Theming
- Druids-specific color palette
- Agent type color coding
- Status-based visual indicators

#### 🔐 Session Management
- MCP session handling for stateful operations
- Automatic session cleanup
- Error recovery and retry logic

## Usage Guide

### Creating Agents

1. Navigate to **Agent Management**
2. Click **"Create Agent"**
3. Fill in agent details:
   - **Name**: Unique identifier for the agent
   - **Type**: Choose from Druid, Elemental, Gaia, or Worldtree
   - **Description**: Brief description of the agent's purpose
   - **Domain**: Specialization area (e.g., "research", "analysis")
   - **System Prompt**: Custom instructions for agent behavior

### Setting Up Realms

1. Go to **Realm Management**
2. Click **"Create Realm"**
3. Configure realm settings:
   - **Type**: Local (single-machine) or Federated (distributed)
   - **Max Agents**: Maximum number of agents per realm
   - **External Access**: Whether external clients can access the realm
   - **Ley Line Endpoint**: For federated realms, connection endpoint

### Executing Scenarios

1. Open **Coordination Management**
2. Click **"Execute Scenario"**
3. Set up the collaboration:
   - **Scenario Prompt**: Describe the task for agents to collaborate on
   - **Coordinator**: Choose the coordinating agent
   - **Participants**: Select participating agents
   - **Async Mode**: Enable for long-running scenarios

### Monitoring Results

- **Dashboard**: View high-level system status
- **Agent Cards**: Monitor individual agent status and activities
- **Scenario Progress**: Track multi-agent collaboration progress
- **System Health**: Monitor overall system performance

## Configuration

### Environment Variables
```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_MCP_BASE_URL=http://localhost:3000/mcp
```

### Tailwind Configuration
The UI uses a custom Tailwind config with Druids-specific theming:

```javascript
// Key color palette
primary: {
  50: '#f0f9ff',
  500: '#3b82f6', 
  600: '#2563eb',
  900: '#1e3a8a'
}
```

## Development

### Code Style
- TypeScript strict mode enabled
- ESLint + Prettier for code formatting
- Component-based architecture
- Functional components with hooks

### Testing
```bash
npm run test        # Run unit tests
npm run test:e2e    # Run end-to-end tests
npm run lint        # Code linting
```

### Building
```bash
npm run build      # Production build
npm run preview    # Preview production build
```

## API Reference

### Agent Operations
```typescript
// Create agent
agentApi.createAgent({
  name: string,
  type: 'druid' | 'elemental' | 'gaia' | 'worldtree',
  description: string,
  domain?: string,
  systemPrompt?: string
})

// Get agents
agentApi.getAgents()

// Update agent
agentApi.updateAgent(id, updates)
```

### MCP Scenario Execution
```typescript
// Execute scenario
mcpApi.executeScenario({
  scenario_prompt: string,
  coordinator_id: string,
  participant_ids: string[],
  force_async?: boolean
})

// Get results
mcpApi.getPublishedContent(contentId)
```

## Troubleshooting

### Common Issues

1. **Port Conflicts**: Default port 3004 may conflict with other services
   ```bash
   PORT=3005 npm run dev
   ```

2. **API Connection Issues**: Ensure backend is running on expected ports
   - Main API: `http://localhost:3000`
   - MCP Server: `http://localhost:3000/mcp`

3. **Build Errors**: Clear node_modules and reinstall
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### Debug Mode
Enable verbose logging:
```bash
DEBUG=druids:* npm run dev
```

## Contributing

### Adding New Features

1. **Create Component**: Add to `src/components/` or `src/pages/`
2. **Update API**: Add new endpoints to `src/services/api.ts`
3. **Add Navigation**: Update `src/components/Navigation.tsx`
4. **Style Components**: Use existing Tailwind classes or add custom CSS

### Code Guidelines

- Use TypeScript for all new code
- Follow existing component patterns
- Add proper error handling
- Include loading states for async operations
- Maintain responsive design principles

## License

Part of the Druids multi-agent system. See main project LICENSE for details.