import { ScenarioService } from './ScenarioService';
import { AgentService } from './AgentService';
import { CoordinationService } from './CoordinationService';

/**
 * Service container to manage singleton instances
 * This ensures all parts of the application use the same service instances
 */
class ServiceContainer {
  private static instance: ServiceContainer;
  private _scenarioService?: ScenarioService;
  private _agentService?: AgentService;
  private _coordinationService?: CoordinationService;

  private constructor() {}

  public static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  public getScenarioService(): ScenarioService {
    if (!this._scenarioService) {
      // Always create with AgentService dependency
      const agentService = this.getAgentService();
      this._scenarioService = new ScenarioService(agentService);
    }
    return this._scenarioService;
  }

  public getAgentService(): AgentService {
    if (!this._agentService) {
      this._agentService = new AgentService();
    }
    return this._agentService;
  }

  public getCoordinationService(): CoordinationService {
    if (!this._coordinationService) {
      this._coordinationService = new CoordinationService();
    }
    return this._coordinationService;
  }

  /**
   * Wire up dependencies between services
   */
  public initializeServices(): void {
    // Services are automatically wired when created
    this.getAgentService();
    this.getScenarioService();
    this.getCoordinationService();
    
    console.log('🔗 Service dependencies initialized');
  }
}

export default ServiceContainer;