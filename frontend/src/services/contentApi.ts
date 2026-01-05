import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3000/api'
});

export interface PublishedContentItem {
  sessionId: string;
  scenarioPrompt: string;
  participants: Array<{
    agentId: string;
    contribution: string;
  }>;
  coordinatorId: string;
  publishedAt: string;
  content: string;
  contentLength: number;
  publishPath: string;
  fileName?: string;
  title?: string;
  contentType?: string;
  subType?: string;
  relativePath?: string;
}

export interface ContentSearchFilters {
  searchTerm?: string;
  startDate?: string;
  endDate?: string;
  coordinatorId?: string;
  participantId?: string;
  limit?: number;
  offset?: number;
}

class ContentApiService {
  async getPublishedContent(filters: ContentSearchFilters = {}): Promise<PublishedContentItem[]> {
    const response = await api.get('/content/published', { params: filters });
    return response.data.content || [];
  }

  async getContentBySessionId(sessionId: string): Promise<PublishedContentItem | null> {
    try {
      const response = await api.get(`/content/session/${sessionId}`);
      return response.data.content;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async getContentStats(): Promise<{
    totalItems: number;
    totalSize: number;
    recentItems: number;
    topCoordinators: Array<{ coordinatorId: string; count: number }>;
    topParticipants: Array<{ participantId: string; count: number }>;
  }> {
    const response = await api.get('/content/stats');
    return response.data;
  }

  async searchContent(query: string, filters: ContentSearchFilters = {}): Promise<PublishedContentItem[]> {
    const response = await api.get('/content/search', { 
      params: { ...filters, q: query } 
    });
    return response.data.content || [];
  }

  async downloadContent(sessionId: string): Promise<Blob> {
    const response = await api.get(`/content/download/${sessionId}`, {
      responseType: 'blob'
    });
    return response.data;
  }

  async getCreativeContent(type: string, date: string, filename: string): Promise<{
    content: string;
    title: string;
    fileName: string;
    contentType: string;
    publishedAt: string;
    metadata: any;
    relativePath: string;
  }> {
    const response = await api.get(`/content/creative/${type}/${date}/${filename}`);
    return response.data;
  }
}

export const contentApi = new ContentApiService();