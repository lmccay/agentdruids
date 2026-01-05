import React, { useState, useEffect } from 'react';
import { 
  Search,
  Download,
  Eye,
  Filter,
  FileText,
  Image,
  Video,
  File,
  Calendar,
  User,
  Tag,
  ExternalLink
} from 'lucide-react';

interface ContentItem {
  id: string;
  title: string;
  type: 'text' | 'image' | 'video' | 'document' | 'data';
  content: string;
  summary: string;
  author: string;
  createdAt: string;
  tags: string[];
  scenario?: string;
  size?: string;
  format?: string;
}

function ContentCard({ 
  item, 
  onView, 
  onDownload 
}: { 
  item: ContentItem;
  onView: (item: ContentItem) => void;
  onDownload: (item: ContentItem) => void;
}) {
  const typeIcons = {
    text: <FileText className="h-5 w-5 text-blue-600" />,
    image: <Image className="h-5 w-5 text-green-600" />,
    video: <Video className="h-5 w-5 text-purple-600" />,
    document: <File className="h-5 w-5 text-red-600" />,
    data: <File className="h-5 w-5 text-orange-600" />
  };

  const typeColors = {
    text: 'bg-blue-100 text-blue-800 border-blue-200',
    image: 'bg-green-100 text-green-800 border-green-200',
    video: 'bg-purple-100 text-purple-800 border-purple-200',
    document: 'bg-red-100 text-red-800 border-red-200',
    data: 'bg-orange-100 text-orange-800 border-orange-200'
  };

  return (
    <div className="card hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          {typeIcons[item.type]}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
            <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full border ${typeColors[item.type]}`}>
              {item.type}
            </span>
          </div>
        </div>
        
        <div className="flex space-x-1">
          <button
            onClick={() => onView(item)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
            title="View Content"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDownload(item)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-gray-600 line-clamp-3">{item.summary}</p>
        
        <div className="flex items-center space-x-4 text-xs text-gray-500">
          <div className="flex items-center">
            <User className="h-3 w-3 mr-1" />
            {item.author}
          </div>
          <div className="flex items-center">
            <Calendar className="h-3 w-3 mr-1" />
            {new Date(item.createdAt).toLocaleDateString()}
          </div>
          {item.size && (
            <div>{item.size}</div>
          )}
        </div>

        {item.scenario && (
          <div className="text-xs text-gray-500">
            <span className="font-medium">Scenario:</span> {item.scenario}
          </div>
        )}

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                <Tag className="h-2 w-2 mr-1" />
                {tag}
              </span>
            ))}
            {item.tags.length > 3 && (
              <span className="text-xs text-gray-500">+{item.tags.length - 3} more</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ContentRetrieval() {
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    try {
      setLoading(true);
      // Mock data - replace with actual API call
      const mockContent: ContentItem[] = [
        {
          id: 'content-001',
          title: 'Renewable Energy Market Analysis',
          type: 'document',
          content: 'Comprehensive analysis of renewable energy trends...',
          summary: 'A detailed analysis of renewable energy market trends, including solar, wind, and hydroelectric power adoption rates, market size projections, and key growth drivers.',
          author: 'Research Team Alpha',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          tags: ['renewable energy', 'market analysis', 'sustainability'],
          scenario: 'Energy Research Collaboration',
          size: '2.3 MB',
          format: 'PDF'
        },
        {
          id: 'content-002',
          title: 'Product Marketing Strategy',
          type: 'text',
          content: 'Strategic recommendations for sustainable product marketing...',
          summary: 'Marketing strategy document outlining target demographics, messaging frameworks, and channel recommendations for sustainable product lines.',
          author: 'Marketing Strategy Team',
          createdAt: new Date(Date.now() - 7200000).toISOString(),
          tags: ['marketing', 'strategy', 'sustainability', 'products'],
          scenario: 'Marketing Strategy Development',
          size: '156 KB'
        },
        {
          id: 'content-003',
          title: 'Financial Trends Visualization',
          type: 'image',
          content: 'Data visualization of Q4 financial trends...',
          summary: 'Interactive charts and graphs showing financial market trends, sector performance, and predictive analytics for Q4 market movements.',
          author: 'Data Visualization Team',
          createdAt: new Date(Date.now() - 10800000).toISOString(),
          tags: ['finance', 'visualization', 'trends', 'Q4'],
          scenario: 'Financial Analysis Project',
          size: '847 KB',
          format: 'PNG'
        },
        {
          id: 'content-004',
          title: 'Agent Collaboration Dataset',
          type: 'data',
          content: 'Raw data from multi-agent collaboration sessions...',
          summary: 'Structured dataset containing interaction logs, decision trees, and outcome metrics from recent agent collaboration scenarios.',
          author: 'System Analytics',
          createdAt: new Date(Date.now() - 14400000).toISOString(),
          tags: ['data', 'collaboration', 'analytics', 'agents'],
          size: '5.7 MB',
          format: 'JSON'
        }
      ];
      setContent(mockContent);
    } catch (error) {
      console.error('Failed to fetch content:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (item: ContentItem) => {
    // Create a blob and download
    const blob = new Blob([item.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title}.${item.format?.toLowerCase() || 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredContent = content.filter(item => {
    const matchesSearch = 
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = !typeFilter || item.type === typeFilter;
    return matchesSearch && matchesType;
  });

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
          <h1 className="text-2xl font-bold text-gray-900">Content Retrieval</h1>
          <p className="text-gray-600">Browse and download content generated by agent collaborations</p>
        </div>
        <button
          onClick={fetchContent}
          className="btn-secondary flex items-center"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Refresh Content
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search content by title, author, tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        
        <div className="flex gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Types</option>
            <option value="text">Text</option>
            <option value="document">Document</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="data">Data</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <FileText className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Text</p>
              <p className="text-2xl font-semibold text-gray-900">
                {content.filter(c => c.type === 'text').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <File className="h-8 w-8 text-red-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Documents</p>
              <p className="text-2xl font-semibold text-gray-900">
                {content.filter(c => c.type === 'document').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <Image className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Images</p>
              <p className="text-2xl font-semibold text-gray-900">
                {content.filter(c => c.type === 'image').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <Video className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Videos</p>
              <p className="text-2xl font-semibold text-gray-900">
                {content.filter(c => c.type === 'video').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <File className="h-8 w-8 text-orange-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Data</p>
              <p className="text-2xl font-semibold text-gray-900">
                {content.filter(c => c.type === 'data').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      {filteredContent.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No content found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm || typeFilter 
              ? 'Try adjusting your filters or search terms.'
              : 'Content from agent collaborations will appear here.'
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredContent.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              onView={setSelectedContent}
              onDownload={handleDownload}
            />
          ))}
        </div>
      )}

      {/* Content Details Modal */}
      {selectedContent && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{selectedContent.title}</h3>
              <button
                onClick={() => setSelectedContent(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <ExternalLink className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Type</label>
                  <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full border ${
                    selectedContent.type === 'text' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                    selectedContent.type === 'document' ? 'bg-red-100 text-red-800 border-red-200' :
                    selectedContent.type === 'image' ? 'bg-green-100 text-green-800 border-green-200' :
                    selectedContent.type === 'video' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                    'bg-orange-100 text-orange-800 border-orange-200'
                  }`}>
                    {selectedContent.type}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Author</label>
                  <p className="text-sm text-gray-900">{selectedContent.author}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Summary</label>
                <p className="mt-1 text-sm text-gray-900 bg-gray-50 p-3 rounded-md">
                  {selectedContent.summary}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Content</label>
                <div className="mt-1 text-sm text-gray-900 bg-gray-50 p-3 rounded-md max-h-64 overflow-auto">
                  {selectedContent.content}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Created</label>
                  <p className="text-sm text-gray-900">
                    {new Date(selectedContent.createdAt).toLocaleString()}
                  </p>
                </div>
                {selectedContent.scenario && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Scenario</label>
                    <p className="text-sm text-gray-900">{selectedContent.scenario}</p>
                  </div>
                )}
              </div>

              {selectedContent.tags.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tags</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedContent.tags.map((tag) => (
                      <span key={tag} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={() => setSelectedContent(null)}
                className="btn-secondary"
              >
                Close
              </button>
              <button
                onClick={() => handleDownload(selectedContent)}
                className="btn-primary"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}