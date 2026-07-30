import { useMemo } from 'react';
import { Product } from '../../../inventory/types';

interface UseProductFilterProps {
    products: Product[] | undefined;
    selectedCategory: string | null;
    inStockOnly: boolean;
    selectedWarehouseId?: string | null;
}

export function useProductFilter({ products, selectedCategory, inStockOnly, selectedWarehouseId }: UseProductFilterProps) {
    return useMemo(() => {
        let result = Array.isArray(products) ? products.filter((p) => (selectedCategory ? p.category_id === selectedCategory : true)) : [];
        if (inStockOnly) {
            result = result.filter((p) => p.stock_quantity > 0);
        }
        if (selectedWarehouseId) {
            result = result.filter((p) => {
                const dist = p.warehouse_distribution || [];
                const whStock = dist.find(w => w.warehouse_id === selectedWarehouseId);
                return whStock && whStock.quantity > 0;
            });
        }
        return result;
    }, [products, selectedCategory, inStockOnly, selectedWarehouseId]);
}
