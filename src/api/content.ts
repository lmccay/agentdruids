import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

interface ContentSearchFilters {
  searchTerm?: string;
  startDate?: string;
  endDate?: string;
  coordinatorId?: string;
  participantId?: string;
  limit?: number;
  offset?: number;
}

// Get published content with filtering and search
router.get('/published', async (req, res) => {
  try {
    const filters: ContentSearchFilters = req.query;
    const contentDir = path.join(process.cwd(), 'data', 'published_content');
    
    // Read all content files from published content directory (recursively)
    let contentItems: any[] = [];
    
    try {
      // Recursive function to find all content files
      async function findContentFiles(dir: string): Promise<string[]> {
        const files: string[] = [];
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...await findContentFiles(fullPath));
          } else if (entry.name.endsWith('.json') || entry.name.endsWith('.md')) {
            files.push(fullPath);
          }
        }
        return files;
      }

      const contentFiles = await findContentFiles(contentDir);
      
      for (const filePath of contentFiles) {
        try {
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const fileName = path.basename(filePath);
          const relativePath = path.relative(contentDir, filePath);
          
          let item;
          if (fileName.endsWith('.json')) {
            item = JSON.parse(fileContent);
          } else if (fileName.endsWith('.md')) {
            // For markdown files, create a structured object
            const stats = await fs.stat(filePath);
            
            // Try to extract metadata from content or filename
            const lines = fileContent.split('\n');
            const titleLine = lines.find(line => line.startsWith('# '));
            const title = titleLine ? titleLine.replace('# ', '') : fileName.replace('.md', '');
            
            // Extract session ID from filename pattern
            const sessionMatch = fileName.match(/session-(\d+)-[a-f0-9-]+-(\d+)/);
            const sessionId = sessionMatch ? `session-${sessionMatch[1]}-${sessionMatch[2]}` : fileName.replace('.md', '');
            
            // Determine content type from directory structure
            const pathParts = relativePath.split(path.sep);
            const contentType = pathParts.length > 1 ? pathParts[0] : 'general';
            const subType = pathParts.length > 2 ? pathParts[1] : undefined;
            
            item = {
              content: fileContent,
              contentLength: fileContent.length,
              fileName: fileName,
              title: title,
              publishedAt: stats.mtime.toISOString(),
              sessionId: sessionId,
              coordinatorId: 'built-in-coordinator', // Default for creative content
              participants: [], // Will be empty for md files, but could be populated from metadata
              scenarioPrompt: title,
              contentType: contentType,
              subType: subType,
              publishPath: `worldtree://public/${relativePath.replace(/\.(md|json)$/, '')}`,
              relativePath: relativePath
            };
          }
          
          contentItems.push({
            ...item,
            fileName: fileName,
            filePath: relativePath
          });
        } catch (error) {
          console.warn(`Failed to read content file ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.warn('Published content directory not found or inaccessible:', error);
    }

    // Apply filters
    let filteredItems = [...contentItems];

    // Search term filter
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filteredItems = filteredItems.filter(item => 
        (item.content && item.content.toLowerCase().includes(term)) ||
        (item.scenarioPrompt && item.scenarioPrompt.toLowerCase().includes(term)) ||
        (item.participants && item.participants.some((p: any) => 
          p.contribution && p.contribution.toLowerCase().includes(term)
        ))
      );
    }

    // Date range filters
    if (filters.startDate) {
      filteredItems = filteredItems.filter(item => 
        item.publishedAt && new Date(item.publishedAt) >= new Date(filters.startDate!)
      );
    }
    if (filters.endDate) {
      filteredItems = filteredItems.filter(item => 
        item.publishedAt && new Date(item.publishedAt) <= new Date(filters.endDate!)
      );
    }

    // Coordinator filter
    if (filters.coordinatorId) {
      filteredItems = filteredItems.filter(item => 
        item.coordinatorId && item.coordinatorId.includes(filters.coordinatorId!)
      );
    }

    // Participant filter
    if (filters.participantId) {
      filteredItems = filteredItems.filter(item => 
        item.participants && item.participants.some((p: any) => 
          p.agentId && p.agentId.includes(filters.participantId!)
        )
      );
    }

    // Sort by published date (most recent first)
    filteredItems.sort((a, b) => {
      const dateA = new Date(a.publishedAt || 0);
      const dateB = new Date(b.publishedAt || 0);
      return dateB.getTime() - dateA.getTime();
    });

    // Apply pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    const paginatedItems = filteredItems.slice(offset, offset + limit);

    res.json({
      content: paginatedItems,
      total: filteredItems.length,
      offset,
      limit
    });

  } catch (error) {
    console.error('Error retrieving published content:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve published content',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get content by session ID
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const contentDir = path.join(process.cwd(), 'data', 'published_content');
    
    // Look for files that contain the session ID
    const files = await fs.readdir(contentDir);
    const matchingFiles = files.filter(file => 
      file.includes(sessionId) && file.endsWith('.json')
    );

    if (matchingFiles.length === 0) {
      return res.status(404).json({ error: 'Content not found for session' });
    }

    // Read the first matching file
    const fileName = matchingFiles[0];
    if (!fileName) {
      return res.status(404).json({ error: 'No matching content file found' });
    }
    
    const filePath = path.join(contentDir, fileName);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const content = JSON.parse(fileContent);

    return res.json({ content });

  } catch (error) {
    console.error('Error retrieving session content:', error);
    return res.status(500).json({ 
      error: 'Failed to retrieve session content',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get creative content by type and filename
router.get('/creative/:type/:date/:filename', async (req, res) => {
  try {
    const { type, date, filename } = req.params;
    const contentDir = path.join(process.cwd(), 'data', 'published_content', 'creative', type, date);
    const filePath = path.join(contentDir, filename);
    
    // Security check: ensure the path is within the expected directory
    const normalizedPath = path.normalize(filePath);
    const expectedBase = path.normalize(path.join(process.cwd(), 'data', 'published_content', 'creative'));
    
    if (!normalizedPath.startsWith(expectedBase)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);
      
      // Check if there's a corresponding metadata file
      const metadataPath = filePath.replace('.md', '-metadata.json');
      let metadata = {};
      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        metadata = JSON.parse(metadataContent);
      } catch (error) {
        // Metadata file doesn't exist, that's ok
      }
      
      // Extract title from content
      const lines = fileContent.split('\n');
      const titleLine = lines.find(line => line.startsWith('# '));
      const title = titleLine ? titleLine.replace('# ', '') : filename.replace('.md', '');
      
      return res.json({
        content: fileContent,
        title: title,
        fileName: filename,
        contentType: type,
        publishedAt: stats.mtime.toISOString(),
        metadata: metadata,
        relativePath: `creative/${type}/${date}/${filename}`
      });
      
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return res.status(404).json({ error: 'Content file not found' });
      }
      throw error;
    }
    
  } catch (error) {
    console.error('Error retrieving creative content:', error);
    return res.status(500).json({ 
      error: 'Failed to retrieve creative content',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get content statistics
router.get('/stats', async (_req, res) => {
  try {
    const contentDir = path.join(process.cwd(), 'data', 'published_content');
    
    let totalItems = 0;
    let totalSize = 0;
    const coordinatorCounts: { [key: string]: number } = {};
    const participantCounts: { [key: string]: number } = {};
    const recentThreshold = new Date();
    recentThreshold.setDate(recentThreshold.getDate() - 7); // Last 7 days
    let recentItems = 0;

    try {
      const files = await fs.readdir(contentDir);
      const contentFiles = files.filter(file => file.endsWith('.json') || file.endsWith('.md'));
      
      for (const file of contentFiles) {
        try {
          const filePath = path.join(contentDir, file);
          const fileContent = await fs.readFile(filePath, 'utf-8');
          
          let item;
          if (file.endsWith('.json')) {
            item = JSON.parse(fileContent);
          } else if (file.endsWith('.md')) {
            const stats = await fs.stat(filePath);
            item = {
              content: fileContent,
              contentLength: fileContent.length,
              publishedAt: stats.mtime.toISOString(),
              coordinatorId: 'built-in-coordinator',
              participants: []
            };
          }
          
          totalItems++;
          totalSize += item.contentLength || fileContent.length;
          
          // Count coordinators
          if (item.coordinatorId) {
            coordinatorCounts[item.coordinatorId] = (coordinatorCounts[item.coordinatorId] || 0) + 1;
          }
          
          // Count participants
          if (item.participants) {
            item.participants.forEach((p: any) => {
              if (p.agentId) {
                participantCounts[p.agentId] = (participantCounts[p.agentId] || 0) + 1;
              }
            });
          }
          
          // Count recent items
          if (item.publishedAt && new Date(item.publishedAt) > recentThreshold) {
            recentItems++;
          }
          
        } catch (error) {
          console.warn(`Failed to process stats for file ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn('Published content directory not found:', error);
    }

    // Sort and get top coordinators/participants
    const topCoordinators = Object.entries(coordinatorCounts)
      .map(([id, count]) => ({ coordinatorId: id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topParticipants = Object.entries(participantCounts)
      .map(([id, count]) => ({ participantId: id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({
      totalItems,
      totalSize,
      recentItems,
      topCoordinators,
      topParticipants
    });

  } catch (error) {
    console.error('Error generating content stats:', error);
    res.status(500).json({ 
      error: 'Failed to generate content statistics',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Search content with full-text search
router.get('/search', async (req, res) => {
  try {
    const { q: query } = req.query as any;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    // Get published content directory
    const contentDir = path.join(process.cwd(), 'data', 'published_content');
    
    let contentItems: any[] = [];
    
    try {
      const files = await fs.readdir(contentDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(contentDir, file);
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const item = JSON.parse(fileContent);
          contentItems.push({
            ...item,
            fileName: file
          });
        } catch (error) {
          console.warn(`Failed to read content file ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn('Published content directory not found:', error);
      return res.json({
        content: [],
        total: 0,
        query
      });
    }

    // Perform search
    const term = query.toLowerCase();
    const searchResults = contentItems.filter(item => 
      (item.content && item.content.toLowerCase().includes(term)) ||
      (item.scenarioPrompt && item.scenarioPrompt.toLowerCase().includes(term)) ||
      (item.participants && item.participants.some((p: any) => 
        p.contribution && p.contribution.toLowerCase().includes(term)
      ))
    ).map(item => ({
      ...item,
      // Add search relevance score (simple implementation)
      relevanceScore: (
        (item.content ? (item.content.toLowerCase().split(term).length - 1) * 2 : 0) +
        (item.scenarioPrompt ? (item.scenarioPrompt.toLowerCase().split(term).length - 1) * 3 : 0) +
        (item.participants ? item.participants.reduce((score: number, p: any) => 
          score + (p.contribution ? (p.contribution.toLowerCase().split(term).length - 1) : 0), 0
        ) : 0)
      )
    }));

    // Sort by relevance
    searchResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return res.json({
      content: searchResults,
      total: searchResults.length,
      query
    });

  } catch (error) {
    console.error('Error searching content:', error);
    return res.status(500).json({ 
      error: 'Failed to search content',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Download content as file
router.get('/download/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const contentDir = path.join(process.cwd(), 'data', 'published_content');
    
    // Look for files that contain the session ID
    const files = await fs.readdir(contentDir);
    const matchingFiles = files.filter(file => 
      file.includes(sessionId) && file.endsWith('.json')
    );

    if (matchingFiles.length === 0) {
      return res.status(404).json({ error: 'Content not found for session' });
    }

    // Read the first matching file
    const fileName = matchingFiles[0];
    if (!fileName) {
      return res.status(404).json({ error: 'No matching content file found' });
    }
    
    const filePath = path.join(contentDir, fileName);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const content = JSON.parse(fileContent);

    // Set download headers
    res.setHeader('Content-Disposition', `attachment; filename="content_${sessionId}.txt"`);
    res.setHeader('Content-Type', 'text/plain');
    
    // Send the content text
    return res.send(content.content || JSON.stringify(content, null, 2));

  } catch (error) {
    console.error('Error downloading content:', error);
    return res.status(500).json({ 
      error: 'Failed to download content',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;