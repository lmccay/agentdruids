import React, { useState } from 'react';
import { 
  FileText, 
  Users, 
  Clock, 
  Target, 
  ChevronDown, 
  ChevronRight,
  ExternalLink,
  Copy,
  Download
} from 'lucide-react';

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

interface ContentViewerProps {
  finalResult: FinalResult;
  agentNames?: { [agentId: string]: string };
  onViewContent?: (content: string) => void;
  onNavigateToContent?: () => void;
}

export const ContentViewer: React.FC<ContentViewerProps> = ({ 
  finalResult, 
  agentNames = {},
  onViewContent,
  onNavigateToContent
}) => {
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    summary: true,
    contributions: false,
    analysis: false,
    recommendations: false,
    content: false
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadContent = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SectionHeader = ({ 
    title, 
    icon: Icon, 
    sectionKey, 
    count 
  }: { 
    title: string; 
    icon: any; 
    sectionKey: string;
    count?: number;
  }) => (
    <button
      onClick={() => toggleSection(sectionKey)}
      className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
    >
      <div className="flex items-center space-x-2">
        <Icon className="h-4 w-4 text-blue-600" />
        <span className="font-medium text-gray-900">{title}</span>
        {count !== undefined && (
          <span className="text-sm text-gray-500">({count})</span>
        )}
      </div>
      {expandedSections[sectionKey] ? 
        <ChevronDown className="h-4 w-4 text-gray-400" /> : 
        <ChevronRight className="h-4 w-4 text-gray-400" />
      }
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Summary Section */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SectionHeader 
          title="Summary" 
          icon={Target} 
          sectionKey="summary" 
        />
        {expandedSections.summary && (
          <div className="p-4 bg-white">
            <p className="text-gray-700">{finalResult.summary}</p>
          </div>
        )}
      </div>

      {/* Participant Contributions */}
      {finalResult.participantContributions && finalResult.participantContributions.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <SectionHeader 
            title="Participant Contributions" 
            icon={Users} 
            sectionKey="contributions"
            count={finalResult.participantContributions.length}
          />
          {expandedSections.contributions && (
            <div className="p-4 bg-white space-y-4">
              {finalResult.participantContributions.map((contribution, index) => (
                <div key={index} className="border-l-4 border-blue-200 pl-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">
                      {agentNames[contribution.agentId] || contribution.agentId}
                    </h4>
                    <div className="flex items-center space-x-2">
                      {contribution.weight && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          Weight: {contribution.weight}
                        </span>
                      )}
                      <button
                        onClick={() => copyToClipboard(contribution.contribution)}
                        className="text-gray-400 hover:text-gray-600"
                        title="Copy contribution"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="text-gray-700 whitespace-pre-wrap text-sm">
                    {contribution.contribution}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Coordinator Analysis */}
      {finalResult.coordinatorAnalysis && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <SectionHeader 
            title="Coordinator Analysis" 
            icon={Target} 
            sectionKey="analysis" 
          />
          {expandedSections.analysis && (
            <div className="p-4 bg-white">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900">Analysis</h4>
                <button
                  onClick={() => copyToClipboard(finalResult.coordinatorAnalysis!)}
                  className="text-gray-400 hover:text-gray-600"
                  title="Copy analysis"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="text-gray-700 whitespace-pre-wrap">
                {finalResult.coordinatorAnalysis}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {finalResult.recommendations && finalResult.recommendations.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <SectionHeader 
            title="Recommendations" 
            icon={Target} 
            sectionKey="recommendations"
            count={finalResult.recommendations.length}
          />
          {expandedSections.recommendations && (
            <div className="p-4 bg-white">
              <ul className="space-y-2">
                {finalResult.recommendations.map((recommendation, index) => (
                  <li key={index} className="flex items-start space-x-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></span>
                    <span className="text-gray-700">{recommendation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Integrated Content */}
      {finalResult.integratedContent && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <SectionHeader 
            title="Integrated Content" 
            icon={FileText} 
            sectionKey="content" 
          />
          {expandedSections.content && (
            <div className="p-4 bg-white">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-gray-900">Final Content</h4>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => copyToClipboard(finalResult.integratedContent!)}
                    className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-800"
                    title="Copy content"
                  >
                    <Copy className="h-4 w-4" />
                    <span>Copy</span>
                  </button>
                  <button
                    onClick={() => downloadContent(finalResult.integratedContent!, 'integrated_content.txt')}
                    className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-800"
                    title="Download content"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download</span>
                  </button>
                  {onViewContent && (
                    <button
                      onClick={() => onViewContent(finalResult.integratedContent!)}
                      className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-800"
                      title="View in content browser"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>View</span>
                    </button>
                  )}
                  {onNavigateToContent && (
                    <button
                      onClick={onNavigateToContent}
                      className="flex items-center space-x-1 text-sm text-green-600 hover:text-green-800"
                      title="Browse all content"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>Browse</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg overflow-auto max-h-96">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {finalResult.integratedContent}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Published Content Links */}
      {finalResult.publishedTo && finalResult.publishedTo.length > 0 && (
        <div className="border border-green-200 rounded-lg overflow-hidden bg-green-50">
          <div className="p-3">
            <div className="flex items-center space-x-2">
              <ExternalLink className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-900">Published Content</span>
            </div>
            <div className="mt-2 space-y-1">
              {finalResult.publishedTo.map((location, index) => (
                <div key={index} className="text-sm text-green-700">
                  📍 {location}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};