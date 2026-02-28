import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, ArrowRight, Clock } from 'lucide-react';
import plantumlEncoder from 'plantuml-encoder';

interface OrchestrationStep {
  stepId: string;
  stepNumber: number;
  description: string;
  agentId: string;
  actionType: string;
  parameters: any;
  status: string;
}

interface PlanApprovalProps {
  sessionId: string;
  plan: {
    steps: OrchestrationStep[];
    planId: string;
    originalScenario: string;
    plantuml?: string;  // Optional PlantUML diagram source
  };
  onApprove: () => void;
  onCancel: () => void;
  isApproving?: boolean;
}

export function PlanApproval({
  sessionId,
  plan,
  onApprove,
  onCancel,
  isApproving = false
}: PlanApprovalProps) {
  const [diagramUrl, setDiagramUrl] = useState('');

  // Render PlantUML diagram if available
  useEffect(() => {
    if (plan.plantuml) {
      try {
        const encoded = plantumlEncoder.encode(plan.plantuml);
        const url = `https://www.plantuml.com/plantuml/svg/${encoded}`;
        setDiagramUrl(url);
      } catch (error) {
        console.error('Error encoding PlantUML:', error);
      }
    }
  }, [plan.plantuml]);

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Workflow Plan Review</h2>
        <p className="text-sm text-gray-600">
          Review the execution plan before starting the workflow. You can approve to proceed or cancel to go back.
        </p>
      </div>

      {/* PlantUML Diagram (if available) */}
      {diagramUrl && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Workflow Diagram</h3>
          <div className="flex justify-center overflow-x-auto">
            <img
              src={diagramUrl}
              alt="Workflow Diagram"
              className="max-w-none"
              style={{ maxHeight: '600px' }}
            />
          </div>
        </div>
      )}

      {/* Original Scenario */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Original Request</h3>
        <p className="text-sm text-blue-800 whitespace-pre-wrap">{plan.originalScenario}</p>
      </div>

      {/* Execution Steps */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Execution Plan ({plan.steps.length} {plan.steps.length === 1 ? 'step' : 'steps'})
        </h3>

        <div className="space-y-4">
          {plan.steps.map((step, index) => (
            <div key={step.stepId} className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors">
              {/* Step Header */}
              <div className="flex items-start space-x-3 mb-3">
                <div className="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-primary-700 font-semibold text-sm">{step.stepNumber}</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{step.description}</h4>
                  <div className="mt-1 flex items-center space-x-4 text-xs text-gray-500">
                    <span className="flex items-center">
                      <span className="font-medium mr-1">Agent:</span>
                      {step.agentId}
                    </span>
                    <span className="flex items-center">
                      <span className="font-medium mr-1">Action:</span>
                      {step.actionType.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Step Parameters */}
              {Object.keys(step.parameters).length > 0 && (
                <div className="ml-11 p-3 bg-gray-50 rounded border border-gray-200">
                  <div className="text-xs font-medium text-gray-700 mb-2">Parameters:</div>
                  <div className="space-y-1 text-xs text-gray-600">
                    {step.parameters.realmId && (
                      <div><span className="font-medium">Realm ID:</span> {step.parameters.realmId}</div>
                    )}
                    {step.parameters.realmName && (
                      <div><span className="font-medium">Realm:</span> {step.parameters.realmName}</div>
                    )}
                    {step.parameters.taskPrompt && (
                      <div><span className="font-medium">Task:</span> {step.parameters.taskPrompt}</div>
                    )}
                    {step.parameters.collaborationTargets && step.parameters.collaborationTargets.length > 0 && (
                      <div>
                        <span className="font-medium">Collaborators:</span>
                        <ul className="ml-4 mt-1">
                          {step.parameters.collaborationTargets.map((target: any, idx: number) => (
                            <li key={idx}>• {target.agentName} ({target.role})</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Arrow to next step */}
              {index < plan.steps.length - 1 && (
                <div className="ml-4 mt-3 flex items-center text-gray-400">
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{plan.steps.length}</div>
          <div className="text-xs text-gray-600">Total Steps</div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">
            {new Set(plan.steps.map(s => s.agentId)).size}
          </div>
          <div className="text-xs text-gray-600">Agents Involved</div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">
            {new Set(plan.steps.map(s => s.parameters.realmId).filter(Boolean)).size}
          </div>
          <div className="text-xs text-gray-600">Realms Accessed</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
        <button
          onClick={onCancel}
          disabled={isApproving}
          className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center space-x-2">
            <XCircle className="h-4 w-4" />
            <span>Cancel</span>
          </span>
        </button>
        <button
          onClick={onApprove}
          disabled={isApproving}
          className="px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isApproving ? (
            <span className="flex items-center space-x-2">
              <Clock className="h-4 w-4 animate-spin" />
              <span>Approving...</span>
            </span>
          ) : (
            <span className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4" />
              <span>Approve & Execute</span>
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
