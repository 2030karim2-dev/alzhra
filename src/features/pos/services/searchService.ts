/**
 * POS Smart Search Service
 * Coordinates server-side RPC, sales history, popular products,
 * and comprehensive search across products, categories, and codes.
 */
import { supabase } from '@/lib/supabaseClient';
import { normalizeSearch, scoreSearchResult } from '@/core/utils/search';

// ── Types ──────────────────────────────────────────────────────────

export interface POSSearchResult {
    id: string;
    type: 'product' | 'category' | 'code';
    name: string;
    name_ar: string;
    sku?: string;
    part_number?: string;
    brand?: string;
    category?: string;
    category_id?: string;
    size?: string;
    selling_price: number;
    cost_price: number;
    stock_quantity: number;
    unit: string;
    image_url?: string | null;
    alternative_numbers?: string | null;
    barcode?: string | null;
    warehouse_distribution?: Array<{
        warehouse_id: string;
        warehouse_name: string;
        quantity: number;
    }>;
    score: number;
    sales_count?: number;
    last_sale_date?: string;
    is_popular?: boolean;
    match_type?: 'exact' | 'fuzzy' | 'alternative' | 'barcode';
}

export interface POSSearchFilters {
    category_id?: string;
    in_stock_only?: boolean;
    min_stock?: number;
    brand?: string;
}

export interface POSSearchResponse {
    results: POSSearchResult[];
    total: number;
    popular_suggestions: string[];
    corrected_query?: string;
    search_time_ms: number;
}

interface StockRow {
    warehouse_id: string;
    warehouses?: { name_ar: string } | null;
    quantity: number | string;
}

interface SearchResultRow {
    id: string;
    name_ar: string;
    sku: string | null;
    part_number: string | null;
    brand: string | null;
    size: string | null;
    sale_price: number | string;
    purchase_price: number | string;
    unit: string;
    image_url: string | null;
    alternative_numbers: string | null;
    barcode: string | null;
    category_id: string | null;
    category?: { name: string } | null;
    stock?: StockRow[];
    product_categories?: { name: string } | null;
    product_stock?: StockRow[];
}

interface PopularProductRow {
    product_id?: string;
    id?: string;
    name_ar?: string;
    name?: string;
    sku?: string | null;
    part_number?: string | null;
    brand?: string | null;
    sale_price?: number | string;
    purchase_price?: number | string;
    stock_quantity?: number | string;
    unit?: string;
    image_url?: string | null;
    sales_count?: number | string;
}

interface RecentSaleRow {
    product_id: string;
    products: {
        id: string;
        name_ar: string;
        sku: string | null;
        part_number: string | null;
        brand: string | null;
        sale_price: number | string;
        purchase_price: number | string;
        unit: string;
        image_url: string | null;
        alternative_numbers: string | null;
    };
    invoices: { created_at: string };
}

interface SalesCountRow {
    product_id: string;
    invoices?: { created_at: string } | null;
}

// ── Cache ──────────────────────────────────────────────────────────

const recentSearchesCache = new Map<string, POSSearchResponse>();
const CACHE_TTL = 30_000;

// ── Helpers ────────────────────────────────────────────────────────

function mapSearchResultRow(row: SearchResultRow, query: string, salesCounts?: Map<string, { count: number; last_date?: string }>): POSSearchResult {
    const stockList: StockRow[] = Array.isArray(row.stock) ? row.stock : [];
    const totalStock = stockList.reduce(
        (sum: number, s: StockRow) => sum + (Number(s.quantity) || 0),
        0
    );
    const salesInfo = salesCounts?.get(row.id);

    return {
        id: row.id,
        type: 'product' as const,
        name: row.name_ar || '',
        name_ar: row.name_ar || '',
        sku: row.sku || '',
        part_number: row.part_number || '',
        brand: row.brand || '',
        category: row.category?.name || '',
        category_id: row.category_id || '',
        size: row.size || '',
        selling_price: Number(row.sale_price) || 0,
        cost_price: Number(row.purchase_price) || 0,
        stock_quantity: totalStock,
        unit: row.unit || 'pcs',
        image_url: row.image_url || null,
        alternative_numbers: row.alternative_numbers || null,
        barcode: row.barcode || null,
        warehouse_distribution: stockList.map((s: StockRow) => ({
            warehouse_id: s.warehouse_id,
            warehouse_name: s.warehouses?.name_ar || '',
            quantity: Number(s.quantity) || 0,
        })),
        score: scoreSearchResult(query, row as any, salesInfo?.count, salesInfo?.last_date),
        sales_count: salesInfo?.count || 0,
        last_sale_date: salesInfo?.last_date || '',
        match_type: 'exact' as const,
    };
}

function mapFallbackResultRow(row: SearchResultRow, query: string): POSSearchResult {
    const stockList: StockRow[] = Array.isArray(row.product_stock) ? row.product_stock : [];
    const totalStock = stockList.reduce(
        (sum: number, s: StockRow) => sum + (Number(s.quantity) || 0), 0
    );

    return {
        id: row.id,
        type: 'product' as const,
        name: row.name_ar || '',
        name_ar: row.name_ar || '',
        sku: row.sku || '',
        part_number: row.part_number || '',
        brand: row.brand || '',
        category: row.product_categories?.name || '',
        category_id: row.category_id || '',
        size: row.size || '',
        selling_price: Number(row.sale_price) || 0,
        cost_price: Number(row.purchase_price) || 0,
        stock_quantity: totalStock,
        unit: row.unit || 'pcs',
        image_url: row.image_url || null,
        alternative_numbers: row.alternative_numbers || null,
        barcode: row.barcode || null,
        warehouse_distribution: stockList.map((s: StockRow) => ({
            warehouse_id: s.warehouse_id,
            warehouse_name: s.warehouses?.name_ar || '',
            quantity: Number(s.quantity) || 0,
        })),
        score: scoreSearchResult(query, row as any),
        match_type: 'exact' as const,
    };
}

// ── Service ────────────────────────────────────────────────────────

export const posSearchService = {
    async search(
        companyId: string,
        query: string,
        filters?: POSSearchFilters,
        limit: number = 20
    ): Promise<POSSearchResponse> {
        const startTime = performance.now();
        const cacheKey = `${companyId}:${query}:${JSON.stringify(filters)}:${limit}`;

        const cached = recentSearchesCache.get(cacheKey);
        if (cached && (Date.now() - cached.search_time_ms < CACHE_TTL)) {
            return cached;
        }

        const normalizedQuery = normalizeSearch(query).trim();

        if (!normalizedQuery) {
            const popular = await this.getPopularProducts(companyId, limit);
            const response: POSSearchResponse = {
                results: popular,
                total: popular.length,
                popular_suggestions: popular.map(p => p.name_ar),
                search_time_ms: performance.now() - startTime,
            };
            recentSearchesCache.set(cacheKey, response);
            return response;
        }

        const [dbResults, popularProducts, salesHistory] = await Promise.all([
            this.searchDatabase(companyId, normalizedQuery, filters, limit),
            this.getPopularProducts(companyId, 5),
            this.getRecentSales(companyId, normalizedQuery, 5),
        ]);

        const seen = new Set<string>();
        const merged: POSSearchResult[] = [];

        for (const item of dbResults) {
            if (!seen.has(item.id)) {
                seen.add(item.id);
                merged.push(item);
            }
        }

        for (const item of salesHistory) {
            if (!seen.has(item.id)) {
                seen.add(item.id);
                merged.push(item);
            }
        }

        if (merged.length < 5) {
            for (const item of popularProducts) {
                if (!seen.has(item.id)) {
                    seen.add(item.id);
                    merged.push(item);
                }
            }
        }

        merged.sort((a, b) => b.score - a.score);

        const popular_suggestions = popularProducts
            .map(p => p.name_ar)
            .slice(0, 5);

        const response: POSSearchResponse = {
            results: merged.slice(0, limit),
            total: merged.length,
            popular_suggestions,
            search_time_ms: performance.now() - startTime,
        };

        recentSearchesCache.set(cacheKey, response);
        if (recentSearchesCache.size > 50) {
            const firstKey = recentSearchesCache.keys().next().value;
            if (firstKey) recentSearchesCache.delete(firstKey);
        }

        return response;
    },

    async searchDatabase(
        companyId: string,
        query: string,
        filters?: POSSearchFilters,
        limit: number = 20
    ): Promise<POSSearchResult[]> {
        try {
            const { data, error } = await supabase.rpc('search_inventory_paginated', {
                p_company_id: companyId,
                p_term: query,
                p_limit: limit,
                p_offset: 0,
                p_sort_key: 'updated_at',
                p_sort_dir: 'desc'
            });

            if (error) {
                console.warn('POS Search RPC error, falling back to ILIKE:', error.message);
                return this.searchDatabaseFallback(companyId, query, filters, limit);
            }

            const salesCounts = new Map<string, { count: number; last_date?: string }>();

            return ((data || []) as SearchResultRow[]).map((row) =>
                mapSearchResultRow(row, query, salesCounts)
            );
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.warn('POS Search failed, using fallback:', error.message);
            return this.searchDatabaseFallback(companyId, query, filters, limit);
        }
    },

    async searchDatabaseFallback(
        companyId: string,
        query: string,
        _filters?: POSSearchFilters,
        limit: number = 20
    ): Promise<POSSearchResult[]> {
        const { data, error } = await supabase
            .from('products')
            .select(`
                id, name_ar, sku, part_number, brand, size, sale_price,
                purchase_price, unit, image_url, alternative_numbers, barcode,
                category_id, product_categories!inner(name),
                product_stock(quantity, warehouse_id, warehouses(name_ar))
            `)
            .eq('company_id', companyId)
            .eq('status', 'active')
            .or(
                `name_ar.ilike.%${query}%,sku.ilike.%${query}%,` +
                `part_number.ilike.%${query}%,alternative_numbers.ilike.%${query}%,` +
                `barcode.ilike.%${query}%`
            )
            .limit(limit);

        if (error) return [];

        return ((data || []) as SearchResultRow[]).map((row) =>
            mapFallbackResultRow(row, query)
        );
    },

    async getPopularProducts(
        companyId: string,
        limit: number = 10
    ): Promise<POSSearchResult[]> {
        try {
            const { data, error } = await supabase.rpc('get_popular_products', {
                p_company_id: companyId,
                p_days: 30,
                p_limit: limit,
            });

            if (error) {
                const { data: fallback } = await supabase
                    .from('products')
                    .select('id, name_ar, sku, part_number, brand, sale_price, purchase_price, unit, image_url')
                    .eq('company_id', companyId)
                    .eq('status', 'active')
                    .order('updated_at', { ascending: false })
                    .limit(limit);

                return ((fallback || []) as PopularProductRow[]).map((row) => ({
                    id: row.id || '',
                    type: 'product' as const,
                    name: row.name_ar || '',
                    name_ar: row.name_ar || '',
                    sku: row.sku || '',
                    part_number: row.part_number || '',
                    brand: row.brand || '',
                    selling_price: Number(row.sale_price) || 0,
                    cost_price: Number(row.purchase_price) || 0,
                    stock_quantity: 0,
                    unit: row.unit || 'pcs',
                    image_url: row.image_url || null,
                    score: 5,
                    is_popular: true,
                }));
            }

            return ((data || []) as PopularProductRow[]).map((row) => ({
                id: row.product_id || row.id || '',
                type: 'product' as const,
                name: row.name_ar || row.name || '',
                name_ar: row.name_ar || row.name || '',
                sku: row.sku || '',
                part_number: row.part_number || '',
                brand: row.brand || '',
                selling_price: Number(row.sale_price) || 0,
                cost_price: Number(row.purchase_price) || 0,
                stock_quantity: Number(row.stock_quantity) || 0,
                unit: row.unit || 'pcs',
                image_url: row.image_url || null,
                score: 10 + (Number(row.sales_count) || 0),
                sales_count: Number(row.sales_count) || 0,
                is_popular: true,
            }));
        } catch {
            return [];
        }
    },

    async getRecentSales(
        companyId: string,
        query: string,
        limit: number = 5
    ): Promise<POSSearchResult[]> {
        try {
            const { data, error } = await supabase
                .from('invoice_items')
                .select(`
                    product_id,
                    products!inner(id, name_ar, sku, part_number, brand, sale_price, purchase_price, unit, image_url, alternative_numbers),
                    invoices!inner(created_at)
                `)
                .eq('invoices.company_id', companyId)
                .eq('invoices.status', 'paid')
                .ilike('products.name_ar', `%${query}%`)
                .order('invoices(created_at)', { ascending: false })
                .limit(limit);

            if (error || !data) return [];

            const seen = new Set<string>();
            const results: POSSearchResult[] = [];

            for (const row of data as RecentSaleRow[]) {
                const product = row.products;
                if (!product || seen.has(product.id)) continue;
                seen.add(product.id);

                results.push({
                    id: product.id,
                    type: 'product' as const,
                    name: product.name_ar || '',
                    name_ar: product.name_ar || '',
                    sku: product.sku || '',
                    part_number: product.part_number || '',
                    brand: product.brand || '',
                    selling_price: Number(product.sale_price) || 0,
                    cost_price: Number(product.purchase_price) || 0,
                    stock_quantity: 0,
                    unit: product.unit || 'pcs',
                    image_url: product.image_url || null,
                    alternative_numbers: product.alternative_numbers || null,
                    score: 15,
                    last_sale_date: row.invoices?.created_at,
                });
            }

            return results;
        } catch {
            return [];
        }
    },

    async getSalesCounts(
        productIds: string[]
    ): Promise<Map<string, { count: number; last_date?: string }>> {
        if (productIds.length === 0) return new Map();

        try {
            const { data, error } = await supabase
                .from('invoice_items')
                .select('product_id, invoices(created_at)')
                .in('product_id', productIds)
                .eq('invoices.status', 'paid')
                .limit(1000);

            if (error || !data) return new Map();

            const map = new Map<string, { count: number; last_date?: string }>();
            for (const row of data as SalesCountRow[]) {
                const existing = map.get(row.product_id);
                const createdAt = row.invoices?.created_at;

                if (existing) {
                    existing.count++;
                    if (createdAt && (!existing.last_date || createdAt > existing.last_date)) {
                        existing.last_date = createdAt;
                    }
                } else {
                    map.set(row.product_id, { count: 1, last_date: createdAt || '' });
                }
            }

            return map;
        } catch {
            return new Map();
        }
    },

    invalidateCache() {
        recentSearchesCache.clear();
    },

    async searchByBarcode(
        companyId: string,
        barcode: string
    ): Promise<POSSearchResult | null> {
        const { data, error } = await supabase
            .from('products')
            .select(`
                id, name_ar, sku, part_number, brand, size, sale_price,
                purchase_price, unit, image_url, alternative_numbers, barcode,
                product_stock(quantity, warehouse_id, warehouses(name_ar))
            `)
            .eq('company_id', companyId)
            .eq('status', 'active')
            .or(`barcode.eq.${barcode},sku.eq.${barcode},part_number.eq.${barcode}`)
            .limit(1)
            .single();

        if (error || !data) return null;

        const row = data as SearchResultRow;
        const stockList: StockRow[] = Array.isArray(row.product_stock)
            ? row.product_stock
            : [];
        const totalStock = stockList.reduce(
            (sum: number, s: StockRow) => sum + (Number(s.quantity) || 0), 0
        );

        return {
            id: row.id,
            type: 'code',
            name: row.name_ar || '',
            name_ar: row.name_ar || '',
            sku: row.sku || '',
            part_number: row.part_number || '',
            brand: row.brand || '',
            size: row.size || '',
            selling_price: Number(row.sale_price) || 0,
            cost_price: Number(row.purchase_price) || 0,
            stock_quantity: totalStock,
            unit: row.unit || 'pcs',
            image_url: row.image_url || null,
            alternative_numbers: row.alternative_numbers || null,
            barcode: row.barcode || null,
            score: 100,
            match_type: 'barcode',
        };
    },
};

export default posSearchService;
