import { generateAIContent } from './core/provider';

export const aiApi = {
  analyzeFinancials: async (prompt: string) => {
    try {
      return await generateAIContent(prompt, 'حلل البيانات المالية التالية وقدم توصيات مفصلة.', { taskType: 'financial_analysis' });
    } catch {
      return '';
    }
  },

  generateInsight: async (prompt: string, systemPrompt: string) => {
    try {
      return await generateAIContent(prompt, systemPrompt, { taskType: 'insight' });
    } catch {
      return '';
    }
  },

  analyzeData: async (data: any, context: string) => {
    try {
      return await generateAIContent(JSON.stringify(data), context, { jsonMode: true, taskType: 'data_analysis' });
    } catch {
      return {};
    }
  }
};
