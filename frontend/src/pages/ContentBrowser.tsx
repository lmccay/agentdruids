import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  FileText, 
  Calendar, 
  Users, 
  Eye, 
  Download,
  Copy,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Grid,
  List,
  Music,
  BookOpen,
  Image,
  Video
} from 'lucide-react';
import { contentApi, PublishedContentItem } from '../services/contentApi';

interface ContentSearchFilters {
  searchTerm: string;
  dateRange: {
    start: string;
    end: string;
  };
  coordinatorFilter: string;
  participantFilter: string;
}

export default function ContentBrowser() {
  const [contentItems, setContentItems] = useState<PublishedContentItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<PublishedContentItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<PublishedContentItem | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [loading, setLoading] = useState(true);
  const [searchFilters, setSearchFilters] = useState<ContentSearchFilters>({
    searchTerm: '',
    dateRange: { start: '', end: '' },
    coordinatorFilter: '',
    participantFilter: ''
  });

  useEffect(() => {
    loadPublishedContent();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [contentItems, searchFilters]);

  const loadPublishedContent = async () => {
    try {
      setLoading(true);
      const content = await contentApi.getPublishedContent();
      setContentItems(content);
    } catch (error) {
      console.error('Failed to load published content:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...contentItems];

    // Search term filter
    if (searchFilters.searchTerm) {
      const term = searchFilters.searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        (item.content || '').toLowerCase().includes(term) ||
        (item.scenarioPrompt || '').toLowerCase().includes(term) ||
        (item.participants || []).some(p => (p.contribution || '').toLowerCase().includes(term))
      );
    }

    // Date range filter
    if (searchFilters.dateRange.start) {
      filtered = filtered.filter(item => 
        new Date(item.publishedAt) >= new Date(searchFilters.dateRange.start)
      );
    }
    if (searchFilters.dateRange.end) {
      filtered = filtered.filter(item => 
        new Date(item.publishedAt) <= new Date(searchFilters.dateRange.end)
      );
    }

    // Coordinator filter
    if (searchFilters.coordinatorFilter) {
      filtered = filtered.filter(item => 
        (item.coordinatorId || '').includes(searchFilters.coordinatorFilter)
      );
    }

    // Participant filter
    if (searchFilters.participantFilter) {
      filtered = filtered.filter(item => 
        (item.participants || []).some(p => (p.agentId || '').includes(searchFilters.participantFilter))
      );
    }

    setFilteredItems(filtered);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadContent = (item: PublishedContentItem) => {
    const blob = new Blob([item.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content_${item.sessionId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FileText className="h-12 w-12 text-blue-600 animate-pulse mx-auto mb-4" />
          <p className="text-gray-600">Loading published content...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Content Browser</h1>
                <p className="text-gray-600">Browse and search published coordination content</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  <List className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  <Grid className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Filters</h3>
                
                {/* Search */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search Content
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search content, scenarios, contributions..."
                      value={searchFilters.searchTerm}
                      onChange={(e) => setSearchFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                      className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Date Range */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date Range
                  </label>
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={searchFilters.dateRange.start}
                      onChange={(e) => setSearchFilters(prev => ({ 
                        ...prev, 
                        dateRange: { ...prev.dateRange, start: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <input
                      type="date"
                      value={searchFilters.dateRange.end}
                      onChange={(e) => setSearchFilters(prev => ({ 
                        ...prev, 
                        dateRange: { ...prev.dateRange, end: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Coordinator Filter */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Coordinator
                  </label>
                  <input
                    type="text"
                    placeholder="Filter by coordinator..."
                    value={searchFilters.coordinatorFilter}
                    onChange={(e) => setSearchFilters(prev => ({ ...prev, coordinatorFilter: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Participant Filter */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Participant
                  </label>
                  <input
                    type="text"
                    placeholder="Filter by participant..."
                    value={searchFilters.participantFilter}
                    onChange={(e) => setSearchFilters(prev => ({ ...prev, participantFilter: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Clear Filters */}
                <button
                  onClick={() => setSearchFilters({
                    searchTerm: '',
                    dateRange: { start: '', end: '' },
                    coordinatorFilter: '',
                    participantFilter: ''
                  })}
                  className="w-full py-2 px-4 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Content List/Grid */}
          <div className="lg:col-span-3">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-gray-600">
                {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'} found
              </p>
            </div>

            {viewMode === 'list' ? (
              <div className="space-y-4">
                {filteredItems.map((item) => (
                  <div key={item.sessionId} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            {item.contentType === 'creative' && item.subType === 'song' && (
                              <Music className="h-4 w-4 text-purple-500" />
                            )}
                            {item.contentType === 'creative' && item.subType === 'story' && (
                              <BookOpen className="h-4 w-4 text-green-500" />
                            )}
                            {item.contentType === 'creative' && item.subType === 'poem' && (
                              <FileText className="h-4 w-4 text-pink-500" />
                            )}
                            {(!item.contentType || item.contentType !== 'creative') && (
                              <FileText className="h-4 w-4 text-gray-500" />
                            )}
                            <h3 className="text-lg font-semibold text-gray-900">
                              {item.title || `Session ${(item.sessionId || '').split('-').pop() || 'Unknown'}`}
                            </h3>
                            {item.contentType === 'creative' && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                {item.subType}
                              </span>
                            )}
                          </div>
                          <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                            {item.title && item.contentType === 'creative' ? 
                              `${item.scenarioPrompt?.substring(0, 100)}...` : 
                              item.scenarioPrompt
                            }
                          </p>
                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <span className="flex items-center space-x-1">
                              <Calendar className="h-3 w-3" />
                              <span>{new Date(item.publishedAt).toLocaleDateString()}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <Users className="h-3 w-3" />
                              <span>{item.participants?.length || 0} participants</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <FileText className="h-3 w-3" />
                              <span>{(item.contentLength || 0).toLocaleString()} chars</span>
                            </span>
                            {item.fileName && (
                              <span className="flex items-center space-x-1">
                                <ExternalLink className="h-3 w-3" />
                                <span>{item.fileName}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => setSelectedItem(item)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="View content"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => copyToClipboard(item.content)}
                            className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                            title="Copy content"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => downloadContent(item)}
                            className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                            title="Download content"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredItems.map((item) => (
                  <div key={item.sessionId} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                    <div className="p-6">
                      <div className="flex items-center space-x-2 mb-2">
                        {item.contentType === 'creative' && item.subType === 'song' && (
                          <Music className="h-4 w-4 text-purple-500" />
                        )}
                        {item.contentType === 'creative' && item.subType === 'story' && (
                          <BookOpen className="h-4 w-4 text-green-500" />
                        )}
                        {item.contentType === 'creative' && item.subType === 'poem' && (
                          <FileText className="h-4 w-4 text-pink-500" />
                        )}
                        {(!item.contentType || item.contentType !== 'creative') && (
                          <FileText className="h-4 w-4 text-gray-500" />
                        )}
                        <h3 className="text-lg font-semibold text-gray-900 flex-1">
                          {item.title || `Session ${(item.sessionId || '').split('-').pop() || 'Unknown'}`}
                        </h3>
                        {item.contentType === 'creative' && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            {item.subType}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 text-sm line-clamp-3 mb-4">
                        {item.title && item.contentType === 'creative' ? 
                          `${item.scenarioPrompt?.substring(0, 150)}...` : 
                          item.scenarioPrompt
                        }
                      </p>
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                        <span>{new Date(item.publishedAt).toLocaleDateString()}</span>
                        <span>{item.participants?.length || 0} participants</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {(item.contentLength || 0).toLocaleString()} chars
                        </span>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setSelectedItem(item)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="View content"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => copyToClipboard(item.content)}
                            className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                            title="Copy content"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filteredItems.length === 0 && (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Content Found</h3>
                <p className="text-gray-600">
                  Try adjusting your search filters or check back later for new content.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Content from Session {(selectedItem.sessionId || '').split('-').pop() || 'Unknown'}
              </h2>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-auto max-h-[calc(90vh-200px)]">
              <div className="mb-6">
                <div className="flex items-center space-x-2 mb-4">
                  {selectedItem.contentType === 'creative' && selectedItem.subType === 'song' && (
                    <Music className="h-5 w-5 text-purple-500" />
                  )}
                  {selectedItem.contentType === 'creative' && selectedItem.subType === 'story' && (
                    <BookOpen className="h-5 w-5 text-green-500" />
                  )}
                  {selectedItem.contentType === 'creative' && selectedItem.subType === 'poem' && (
                    <FileText className="h-5 w-5 text-pink-500" />
                  )}
                  {(!selectedItem.contentType || selectedItem.contentType !== 'creative') && (
                    <FileText className="h-5 w-5 text-gray-500" />
                  )}
                  <h2 className="text-xl font-semibold text-gray-900">
                    {selectedItem.title || `Session ${(selectedItem.sessionId || '').split('-').pop() || 'Unknown'}`}
                  </h2>
                  {selectedItem.contentType === 'creative' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      {selectedItem.subType}
                    </span>
                  )}
                </div>
                
                {selectedItem.title && selectedItem.contentType === 'creative' && (
                  <div className="mb-4">
                    <h3 className="font-medium text-gray-900 mb-2">Scenario</h3>
                    <p className="text-gray-600 text-sm bg-gray-50 p-3 rounded-lg">
                      {selectedItem.scenarioPrompt}
                    </p>
                  </div>
                )}
              </div>
              <div className="mb-6">
                <h3 className="font-medium text-gray-900 mb-2">
                  {selectedItem.contentType === 'creative' ? 
                    `${selectedItem.subType?.charAt(0).toUpperCase()}${selectedItem.subType?.slice(1)} Content` : 
                    'Content'
                  }
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                    {selectedItem.content}
                  </pre>
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="text-xs text-gray-500">
                  Published: {new Date(selectedItem.publishedAt).toLocaleString()}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => copyToClipboard(selectedItem.content)}
                    className="flex items-center space-x-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    <Copy className="h-4 w-4" />
                    <span>Copy</span>
                  </button>
                  <button
                    onClick={() => downloadContent(selectedItem)}
                    className="flex items-center space-x-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}