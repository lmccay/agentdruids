import React, { useState, useEffect } from 'react';
import { Copy, ArrowLeft, Send, RefreshCw, Code, Eye } from 'lucide-react';
import plantumlEncoder from 'plantuml-encoder';

interface DiagramEditorProps {
  plantuml: string;
  onPlantUMLChange: (uml: string) => void;
  onBackToText: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
}

export function DiagramEditor({
  plantuml,
  onPlantUMLChange,
  onBackToText,
  onSubmit,
  isSubmitting = false
}: DiagramEditorProps) {
  const [imageUrl, setImageUrl] = useState('');
  const [rendering, setRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSource, setShowSource] = useState(false);

  // Render diagram when PlantUML changes (debounced)
  useEffect(() => {
    setRendering(true);
    const timer = setTimeout(() => {
      try {
        const encoded = plantumlEncoder.encode(plantuml);
        // Use PlantUML.com's public service for MVP
        // TODO: In production, use self-hosted PlantUML server
        const url = `https://www.plantuml.com/plantuml/svg/${encoded}`;
        setImageUrl(url);
      } catch (error) {
        console.error('Error encoding PlantUML:', error);
      } finally {
        setRendering(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [plantuml]);

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(plantuml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Workflow Diagram Editor</h3>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setShowSource(!showSource)}
            className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title={showSource ? 'Hide source code' : 'Show source code'}
          >
            {showSource ? (
              <>
                <Eye className="h-4 w-4" />
                <span>Diagram Only</span>
              </>
            ) : (
              <>
                <Code className="h-4 w-4" />
                <span>Show Source</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onBackToText}
            className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Text</span>
          </button>
        </div>
      </div>

      {/* Dynamic layout based on showSource */}
      <div className={showSource ? "grid grid-cols-2 gap-4" : ""}>
        {/* Left: Editable PlantUML Source - Only shown when showSource is true */}
        {showSource && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                PlantUML Source
              </label>
              <button
                onClick={handleCopyToClipboard}
                className="flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
              >
                <Copy className="h-3 w-3" />
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            <textarea
              value={plantuml}
              onChange={(e) => onPlantUMLChange(e.target.value)}
              className="w-full h-[500px] px-3 py-2 font-mono text-xs border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 resize-none"
              placeholder="@startuml&#10;...&#10;@enduml"
              spellCheck={false}
            />
            <p className="text-xs text-gray-500">
              Edit the PlantUML code above. The diagram will update automatically.
            </p>
          </div>
        )}

        {/* Right: Rendered Diagram Preview - Full width when source is hidden */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              {showSource ? 'Diagram Preview' : 'Workflow Diagram'}
            </label>
            {rendering && (
              <span className="flex items-center space-x-1 text-xs text-gray-500">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>Rendering...</span>
              </span>
            )}
          </div>
          <div className={`${showSource ? 'h-[500px]' : 'h-[600px]'} border border-gray-300 rounded-lg bg-white overflow-auto p-4 flex items-center justify-center`}>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Workflow Diagram"
                className="max-w-full h-auto"
                onError={(e) => {
                  console.error('Error loading diagram image');
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="text-gray-400">
                <p>Diagram will appear here...</p>
              </div>
            )}
          </div>
          {!showSource && (
            <p className="text-xs text-gray-500">
              Click "Show Source" above to edit the PlantUML code.
            </p>
          )}
          {showSource && (
            <p className="text-xs text-gray-500">
              The rendered diagram updates as you type (with 500ms delay).
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
        <button
          onClick={onBackToText}
          type="button"
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Back to Text
        </button>
        <button
          onClick={onSubmit}
          disabled={isSubmitting || !plantuml.includes('@startuml')}
          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Submitting...</span>
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              <span>Submit Workflow</span>
            </>
          )}
        </button>
      </div>

      {/* Help text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">PlantUML Quick Reference</h4>
        <div className="text-xs text-blue-800 space-y-1">
          <p><code className="bg-blue-100 px-1 rounded">-&gt;</code> Action/message arrow</p>
          <p><code className="bg-blue-100 px-1 rounded">--&gt;</code> Return arrow (dashed)</p>
          <p><code className="bg-blue-100 px-1 rounded">activate/deactivate</code> Show processing</p>
          <p><code className="bg-blue-100 px-1 rounded">note over Actor</code> Add annotations</p>
          <p><code className="bg-blue-100 px-1 rounded">loop ... end</code> Repetitive operations</p>
          <p><code className="bg-blue-100 px-1 rounded">alt/else/end</code> Conditional paths</p>
        </div>
      </div>
    </div>
  );
}
