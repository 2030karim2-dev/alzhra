import React from 'react';
import { Package, Hash, Eye, Layers } from 'lucide-react';
import { cn, formatCurrency, formatNumberDisplay } from '../../../../core/utils';
import { Product } from '../../../inventory/types';

interface ProductCardProps {
    product: Product;
    searchTerm: string;
    onAddToCart: (product: Product) => void;
    onViewDetails?: (product: Product) => void;
    playNotificationSound: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = React.memo(({
    product,
    searchTerm,
    onAddToCart,
    onViewDetails,
    playNotificationSound,
}) => {
    const hasStock = product.stock_quantity > 0;
    const isSearching = searchTerm.trim().length > 0;
    const isMatchedByAlternative =
        isSearching &&
        product.alternative_numbers?.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const isLowStock = hasStock && product.stock_quantity <= (product.min_stock_level || 5);

    return (
        <div
            onClick={() => {
                if (!hasStock) return;
                playNotificationSound();
                onAddToCart(product);
            }}
            className={cn(
                'relative bg-white dark:bg-slate-900 p-2 rounded-2xl border transition-all active:scale-95 text-right flex flex-col h-48 md:h-52 group select-none',
                hasStock
                    ? 'border-gray-100 dark:border-slate-800 hover:border-blue-500 shadow-sm hover:shadow-md cursor-pointer'
                    : 'bg-gray-50 dark:bg-slate-900/50 opacity-60 cursor-not-allowed'
            )}
            role="button"
            tabIndex={hasStock ? 0 : -1}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (hasStock) {
                        playNotificationSound();
                        onAddToCart(product);
                    }
                }
            }}
        >
            {/* Image */}
            <div className="relative w-full h-20 md:h-24 bg-slate-50 dark:bg-slate-800/40 rounded-xl mb-1.5 flex items-center justify-center overflow-hidden border border-slate-100/50 dark:border-slate-700/30 shrink-0">
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                ) : (
                    <Package size={28} strokeWidth={1.5} className="text-slate-300 dark:text-slate-600 transition-transform group-hover:scale-110 duration-300" />
                )}

                {/* View Details Icon - Top Left */}
                {onViewDetails && hasStock && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onViewDetails(product);
                        }}
                        className="absolute top-1.5 left-1.5 w-7 h-7 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-blue-500 hover:text-white text-slate-500 dark:text-slate-300 shadow-md border border-slate-200 dark:border-slate-700 hover:border-blue-500 z-10"
                        title="عرض التفاصيل"
                    >
                        <Eye size={14} />
                    </button>
                )}

                {/* Stock Badge Overlay */}
                {isLowStock && hasStock && (
                    <span className="absolute top-1 right-1 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                        شحيح
                    </span>
                )}
            </div>

            <div className="flex-1 flex flex-col justify-between">
                <div>
                    {/* Product Name */}
                    <h3 className="font-bold text-gray-800 dark:text-slate-100 line-clamp-2 text-xs md:text-sm leading-snug mb-1.5">
                        {product.name}
                    </h3>

                    {/* Match badges */}
                    <div className="flex flex-wrap gap-1.5">
                        {isMatchedByAlternative && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] md:text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded-full font-bold">
                                <Hash size={8} />
                                بديل
                            </span>
                        )}
                        {isSearching && product.part_number && product.part_number !== '---' && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] md:text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full font-mono">
                                {product.part_number}
                            </span>
                        )}
                        {isSearching && product.brand && (
                            <span className="text-[9px] md:text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-bold truncate max-w-[90px]">
                                {product.brand}
                            </span>
                        )}
                    </div>
                </div>

                {/* Price + Stock Row */}
                <div className="mt-2.5 flex justify-between items-end w-full">
                    <span dir="ltr" className="font-black text-blue-600 dark:text-blue-400 text-xs md:text-base tracking-tighter">
                        {formatCurrency(product.sale_price ?? product.selling_price ?? 0)}
                    </span>
                    <span
                        dir="ltr"
                        className={cn(
                            'text-[10px] md:text-xs font-bold uppercase px-2 py-0.5 rounded-lg flex items-center gap-1',
                            hasStock
                                ? isLowStock
                                    ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400'
                                    : 'text-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/20 dark:text-emerald-400'
                                : 'text-red-500 bg-red-50 dark:bg-red-900/20 dark:text-red-400'
                        )}
                    >
                        <Layers size={11} />
                        {hasStock ? `${formatNumberDisplay(product.stock_quantity)}` : 'نفذ'}
                    </span>
                </div>
            </div>

            {!hasStock && (
                <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-[1.5px] rounded-2xl flex items-center justify-center z-10">
                    <span className="bg-rose-500 text-white text-xs font-black px-4 py-1.5 rounded-full shadow-lg">نفذت الكمية</span>
                </div>
            )}
        </div>
    );
});

ProductCard.displayName = 'ProductCard';
