import { AIProfile } from '../types';

export const obsidianService = {
  async testConnection(config: { baseUrl: string; apiKey: string }) {
    try {
      const response = await fetch(`${config.baseUrl}/`, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Accept': 'application/json'
        }
      });
      return response.ok;
    } catch (error) {
      console.error('Obsidian Connection Error:', error);
      return false;
    }
  },

  async createNote(config: { baseUrl: string; apiKey: string }, path: string, content: string) {
    try {
      const response = await fetch(`${config.baseUrl}/vault/${path}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'text/markdown',
          'Accept': 'application/json'
        },
        body: content
      });
      return response.ok;
    } catch (error) {
      console.error('Obsidian Create Note Error:', error);
      return false;
    }
  },

  async appendToNote(config: { baseUrl: string; apiKey: string }, path: string, content: string) {
    try {
      const response = await fetch(`${config.baseUrl}/vault/${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'text/markdown',
          'Accept': 'application/json'
        },
        body: `\n\n${content}`
      });
      return response.ok;
    } catch (error) {
      console.error('Obsidian Append Error:', error);
      return false;
    }
  }
};
