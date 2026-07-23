import { useMemo } from 'react';
import { Product } from '../../../inventory/types';

interface UseProductFilterProps {
    products: Product[] | undefined;
    selectedCategory: string | null;
    inStockOnly: boolean;
}

export function useProductFilter({ products, selectedCategory, inStockOnly }: UseProductFilterProps) {
    return useMemo(() => {
        let result = products?.filter((p) => (selectedCategory ? p.category_id === selectedCategory : true)) ?? [];
        if (inStockOnly) {
            result = result.filter((p) => p.stock_quantity > 0);
        }
        return result;
    }, [products, selectedCategory, inStockOnly]);
}
