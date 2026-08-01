// Warehouse Service - Handles all warehouse-related operations
import { supabase } from '../../../lib/supabaseClient';
import { inventoryApi } from '../api';

export const warehouseService = {
    /**
     * Get all warehouses for a company
     */
    getWarehouses: async (companyId: string, branchId?: string) => {
        const { data, error } = await inventoryApi.getWarehouses(companyId);
        if (error) throw error;
        const warehouses = data || [];
        // Filter by branch if branchId provided
        if (branchId) {
            return warehouses.filter((wh: any) => !wh.branch_id || wh.branch_id === branchId);
        }
        return warehouses;
    },

    /**
     * Get products for a specific warehouse
     */
    getProductsForWarehouse: async (warehouseId: string) => {
        const { data, error } = await supabase
            .from('product_stock')
            .select(`
                quantity,
                product:products!inner(*),
                warehouse:warehouses(name_ar, location)
            `)
            .eq('warehouse_id', warehouseId)
            .is('products.deleted_at', null);

        if (error) throw error;

        return (data || []).map((item: any) => {
            const product = item.product || {};
            const warehouse = item.warehouse || {};

            // Combine Warehouse Name and Product Shelf Location
            const warehouseName = warehouse.name_ar || '';
            const shelfLocation = product.location || '';
            const compositeLocation = shelfLocation
                ? `${warehouseName} / ${shelfLocation}`
                : warehouseName;

            return {
                ...product,
                stock_quantity: Number(item.quantity) || 0,
                name_ar: product.name_ar || '',
                sale_price: Number(product.sale_price) || 0,
                location: compositeLocation
            };
        });
    }
};

export default warehouseService;
