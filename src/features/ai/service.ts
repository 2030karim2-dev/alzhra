import { aiApi } from './api';

export const aiService = {
  generateReportAnalysis: async (data: any): Promise<any> => {
    return aiApi.analyzeData(data, 'حلل التقرير المالي وقدم أهم الاستنتاجات والتوصيات.');
  },

  generateInventoryAnalysis: async (data: any): Promise<any> => {
    return aiApi.analyzeData(data, 'حلل حالة المخزون وقدم توصيات لإعادة الطلب.');
  },

  generateDailySummary: async (context: string): Promise<string> => {
    return aiApi.generateInsight(context, 'قدم ملخصاً يومياً موجزاً للأداء المالي.');
  },

  generateSmartPricing: async (product: any): Promise<any> => {
    return aiApi.analyzeData(product, 'اقترح سعراً مثالياً لهذا المنتج بناءً على بيانات السوق.');
  },

  generateSalesForecast: async (monthlySales: any[]): Promise<any> => {
    return aiApi.analyzeData({ monthlySales }, 'توقع المبيعات للشهر القادم بناءً على البيانات التاريخية.');
  },

  generateSmartPurchaseOrders: async (lowStockItems: any[]): Promise<any> => {
    if (lowStockItems.length === 0) {
      return { summary: 'لا توجد منتجات تحتاج إعادة طلب حالياً.', items: [] };
    }
    try {
      return await aiApi.analyzeData({ lowStockItems }, 'اقترح كميات طلب مثالية لهذه المنتجات منخفضة المخزون.');
    } catch {
      return {
        summary: `بناءً على تحليل البيانات، نوصي بطلب ${lowStockItems.length} منتجات لتغطية الاحتياجات للشهر القادم.`,
        items: lowStockItems.map(item => ({
          name: item.name,
          suggestedQty: Math.max((item.minStock || 5) * 2, 10),
          priority: (item.quantity || 0) === 0 ? 'عاجل' : 'متوسط'
        }))
      };
    }
  },

  analyzeInvoiceSuspicion: async (_invoice: any): Promise<any> => ({}),

  predictStockDepletion: async (products: any[]): Promise<any> => {
    return aiApi.analyzeData({ products }, 'توقع موعد نفاد المخزون لكل منتج.');
  },

  segmentCustomers: async (_customers: any[]): Promise<any> => ({}),

  suggestCrossSell: async (_currentItems: string[]): Promise<any> => ({}),

  rateSuppliers: async (_suppliers: any[]): Promise<any> => ({}),

  parseInvoiceCommand: async (_command: string): Promise<any> => ({}),

  generateCustomReport: async (_question: string, _context: string): Promise<string> => "",

  suggestJournalEntry: async (description: string, amount: number): Promise<any> => {
    return aiApi.analyzeData({ description, amount }, 'اقترح قيداً محاسبياً مناسباً لهذه العملية.');
  },

  generateMorningBrief: async (_context: string): Promise<string> => "",

  calculateBusinessHealth: async (data: any): Promise<any> => {
    return aiApi.analyzeData(data, 'احسب مؤشرات صحة الأعمال وقدم تقييماً شاملاً.');
  },

  detectAnomalies: async (transactions: any[]): Promise<any> => {
    return aiApi.analyzeData({ transactions }, 'اكتشف المعاملات غير العادية أو المشبوهة.');
  },

  analyzeMarketPosition: async (_data: any): Promise<any> => ({}),
};
