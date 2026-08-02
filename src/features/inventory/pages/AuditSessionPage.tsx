
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ClipboardCheck, Save, CheckCircle, Loader2, ScanBarcode, Layers, PackageSearch } from 'lucide-react';
import { useAuditSession, useInventoryMutations, useInventoryCategories } from '@/features/inventory/hooks/useInventoryManagement';
import { useSearchProducts } from '@/features/inventory/hooks/useProducts';
import { useInventorySession } from '@/features/inventory/hooks/useInventorySession';
import MicroHeader from '@/ui/base/MicroHeader';
import Button from '@/ui/base/Button';
import AuditStats from '@/features/inventory/components/audit/AuditStats';
import AuditItemsTable from '@/features/inventory/components/audit/AuditItemsTable';
import { useForm } from 'react-hook-form';
import { useDebounce } from 'use-debounce';
import ScannerOverlay from '@/ui/base/ScannerOverlay';
import SearchInput from '@/ui/components/SearchInput';
import SearchDropdown from '@/ui/components/SearchDropdown';
import { ConfirmModal } from '@/ui/base/ConfirmModal';
import { inventoryService } from '@/features/inventory/service';
import type { Product, warehouseStock } from '@/features/inventory/types';

interface AuditItemEntry {
    id?: string;
    audit_item_id?: string;
    product_id: string;
    name_ar?: string;
    name?: string;
    sku?: string;
    part_number?: string;
    brand?: string;
    size?: string;
    sale_price?: number;
    purchase_price?: number;
    cost_price?: number;
    stock_quantity?: number;
    expected_quantity: number | string;
    counted_quantity: number | string | null;
    unit?: string;
    image_url?: string | null;
    category?: string;
    category_id?: string;
    warehouse_id?: string;
    warehouse_distribution?: warehouseStock[];
}

interface AuditFormValues {
    items: AuditItemEntry[];
}

const AuditSessionPage: React.FC = () => {
    const { sessionId } = useParams<{ sessionId: string }>();
    const navigate = useNavigate();
    const { data, isLoading, isError } = useAuditSession(sessionId);
    const {
        saveAuditProgress,
        isSavingProgress,
        finalizeAudit,
        isFinalizing,
        addItemToAudit,
        isAddingItem,
        removeItemFromAudit,
        isRemovingItem
    } = useInventoryMutations();
    const { data: categories } = useInventoryCategories();

    const [filter, setFilter] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [debouncedFilter] = useDebounce(filter, 300);
    const [showResults, setShowResults] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [isBulkAdding, setIsBulkAdding] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
    const [showBulkConfirm, setShowBulkConfirm] = useState(false);

    const { data: searchResults } = useSearchProducts(debouncedFilter);

    const warehouseId = data?.session?.warehouse_id;

    const {
        items: sessionItems,
        isRestoring: _isRestoring,
        saveStatus,
        updateItems,
        mergeWithServer,
        clearSession,
    } = useInventorySession({
        sessionId: sessionId ?? '',
        ...(typeof warehouseId === 'string' ? { warehouseId } : {}),
        initialItems: Array.isArray(data?.items) ? data.items : [],
    });

    const { register, reset, getValues } = useForm<AuditFormValues>({
        defaultValues: { items: [] },
        shouldUnregister: false,
    });

    const lastSyncedRef = useRef<string>('');
    const isInitialMount = useRef(true);

    useEffect(() => {
        if (isInitialMount.current && data?.items && data.items.length > 0) {
            const serialized = JSON.stringify(data.items);
            lastSyncedRef.current = serialized;
            reset({ items: data.items as AuditItemEntry[] });
            isInitialMount.current = false;
        } else if (isInitialMount.current) {
            isInitialMount.current = false;
        }
    }, [data?.items, reset]);

    useEffect(() => {
        if (!isInitialMount.current && sessionItems.length > 0) {
            const serialized = JSON.stringify(sessionItems);
            if (serialized !== lastSyncedRef.current) {
                lastSyncedRef.current = serialized;
                reset({ items: sessionItems as AuditItemEntry[] });
            }
        }
    }, [sessionItems, reset]);

    useEffect(() => {
        const interval = setInterval(() => {
            const formItems = getValues('items');
            if (formItems && formItems.length > 0) {
                const serialized = JSON.stringify(formItems);
                if (serialized !== lastSyncedRef.current) {
                    lastSyncedRef.current = serialized;
                    updateItems(formItems);
                }
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [getValues, updateItems]);

    useEffect(() => {
        const handleBlur = () => {
            const formItems = getValues('items');
            if (formItems && formItems.length > 0) {
                const serialized = JSON.stringify(formItems);
                if (serialized !== lastSyncedRef.current) {
                    lastSyncedRef.current = serialized;
                    updateItems(formItems);
                }
            }
        };
        window.addEventListener('focusin', handleBlur);
        return () => window.removeEventListener('focusin', handleBlur);
    }, [getValues, updateItems]);

    useEffect(() => {
        const handleBeforeUnload = () => {
            const formItems = getValues('items');
            if (formItems && formItems.length > 0) {
                updateItems(formItems);
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [getValues, updateItems]);

    useEffect(() => {
        if (data?.items && data.items.length > 0 && !isInitialMount.current) {
            mergeWithServer(data.items);
        }
    }, [data?.items, mergeWithServer]);

    const watchedItems = getValues('items');

    const stats = useMemo(() => {
        const sourceItems = sessionItems.length > 0 ? sessionItems : watchedItems;
        const total = sourceItems.length;
        const counted = sourceItems.filter((i: AuditItemEntry) => i.counted_quantity !== null && i.counted_quantity !== undefined && i.counted_quantity !== '').length;
        const discrepancies = sourceItems.filter((i: AuditItemEntry) => {
            const diff = (i.counted_quantity !== null && i.counted_quantity !== undefined && i.counted_quantity !== '') ? Number(i.counted_quantity) - Number(i.expected_quantity) : 0;
            return diff !== 0;
        }).length;
        return { total, counted, pending: total - counted, discrepancies };
    }, [sessionItems, watchedItems]);

    const handleSave = () => {
        const currentItems = getValues('items');
        saveAuditProgress(currentItems);
    };

    const handleFinalize = () => {
        if (stats.pending > 0) {
            if (!window.confirm(`تنبيه: يوجد ${stats.pending} صنف لم يتم جرده. هل تريد المتابعة وإغلاق الجلسة؟`)) {
                return;
            }
        }
        if (sessionId) {
            finalizeAudit({ sessionId, items: sessionItems }, {
                onSuccess: () => {
                    clearSession();
                    navigate('/inventory');
                }
            });
        }
    };

    const handleScan = (barcode: string) => {
        setFilter(barcode);
        setShowResults(true);
        setIsScannerOpen(false);
    };

    const handleAddItem = (product: Product) => {
        if (data?.session?.status === 'completed') return;

        const currentItems = getValues('items');
        const existingIndex = currentItems.findIndex((i) => i.product_id === product.id);

        if (existingIndex >= 0) {
            const newItems = [...currentItems];
            const [existingItem] = newItems.splice(existingIndex, 1);
            newItems.unshift(existingItem);
            lastSyncedRef.current = JSON.stringify(newItems);
            reset({ items: newItems });
            updateItems(newItems);
            setFilter('');
            setShowResults(false);
            return;
        }

        if (!sessionId) return;

        const stockInfo = product.warehouse_distribution?.find((w) => w.warehouse_id === data?.session?.warehouse_id);
        const expectedQuantity = stockInfo ? stockInfo.quantity : 0;

        addItemToAudit({ sessionId, productId: product.id, expectedQuantity }, {
            onSuccess: () => {
                setFilter('');
                setShowResults(false);
            }
        });
    };

    const confirmRemoveItem = () => {
        if (itemToDelete) {
            removeItemFromAudit(itemToDelete, {
                onSuccess: () => {
                    setItemToDelete(null);
                    const current = getValues('items');
                    const filtered = current.filter((i) => i.id !== itemToDelete && i.product_id !== itemToDelete && i.audit_item_id !== itemToDelete);
                    lastSyncedRef.current = JSON.stringify(filtered);
                    reset({ items: filtered });
                    updateItems(filtered);
                }
            });
        }
    };

    const handleBulkAddWarehouseProducts = useCallback(async () => {
        if (!sessionId || !data?.session?.warehouse_id) return;
        const warehouseId_val = data.session.warehouse_id as string;
        const currentItems = getValues('items');
        const existingProductIds = new Set(currentItems.map((i) => i.product_id));

        const result = await inventoryService.getProductsForWarehouse('', warehouseId_val);
        const warehouseProducts: Product[] = Array.isArray(result) ? result : [];

        const newProducts = warehouseProducts.filter((p) => !existingProductIds.has(p.id));
        if (newProducts.length === 0) {
            setShowBulkConfirm(false);
            return;
        }

        setIsBulkAdding(true);
        setBulkProgress({ current: 0, total: newProducts.length });

        if (currentItems.length > 0) saveAuditProgress(currentItems);

        for (let i = 0; i < newProducts.length; i++) {
            const p = newProducts[i];
            const expectedQuantity = p.stock_quantity || 0;
            await new Promise<void>((resolve) => {
                addItemToAudit(
                    { sessionId, productId: p.id, expectedQuantity },
                    { onSuccess: resolve, onError: () => resolve() }
                );
            });
            setBulkProgress({ current: i + 1, total: newProducts.length });
        }

        setIsBulkAdding(false);
        setShowBulkConfirm(false);
        setBulkProgress({ current: 0, total: 0 });
    }, [sessionId, data, getValues, saveAuditProgress, addItemToAudit]);

    if (isLoading || isError) {
        if (isLoading) return <div className="p-20 text-center"><Loader2 className="animate-spin text-blue-500" /></div>;
        return <div>حدث خطأ أثناء تحميل بيانات الجرد.</div>;
    }

    const session = data?.session;

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-950">
            <MicroHeader
                title={(session?.title as string) || "جلسة جرد"}
                icon={ClipboardCheck}
                actions={
                    <div className="flex gap-2">
                        {saveStatus === 'saving' && <span className="text-xs text-amber-500 self-center ml-2">جاري الحفظ...</span>}
                        {saveStatus === 'saved' && <span className="text-xs text-green-500 self-center ml-2">تم الحفظ</span>}
                        {session?.status !== 'completed' && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowBulkConfirm(true)}
                                isLoading={isBulkAdding}
                                leftIcon={isBulkAdding
                                    ? <Loader2 size={14} className="animate-spin" />
                                    : <PackageSearch size={14} />}
                                title="إضافة كل منتجات المستودع للجلسة"
                            >
                                {isBulkAdding
                                    ? `${bulkProgress.current}/${bulkProgress.total}`
                                    : 'جرد كامل'}
                            </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={handleSave} isLoading={isSavingProgress} leftIcon={<Save size={14} />}>
                            حفظ
                        </Button>
                        <Button
                            variant="success"
                            size="sm"
                            onClick={handleFinalize}
                            isLoading={isFinalizing}
                            disabled={session?.status === 'completed'}
                            leftIcon={<CheckCircle size={14} />}
                        >
                            {session?.status === 'completed' ? 'تم الإغلاق' : 'إنهاء وترحيل'}
                        </Button>
                    </div>
                }
            />

            {session?.status !== 'completed' && (
                <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 p-4 sticky top-0 z-40 shadow-sm">
                    <div className="max-w-[1600px] mx-auto relative">
                        <div className="flex gap-2 relative">
                            <SearchInput
                                value={filter}
                                onChange={(val) => {
                                    setFilter(val);
                                    if (val.trim()) setShowResults(true);
                                }}
                                placeholder="ابحث عن صنف لجرده (مسح باركود، رقم قطعة، أو اسم)..."
                                loading={isAddingItem}
                                variant="default"
                                size="md"
                                className="flex-1"
                                onEscape={() => setShowResults(false)}
                            />
                            <button
                                onClick={() => setIsScannerOpen(true)}
                                className="flex items-center justify-center bg-blue-600 text-white w-12 rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all shrink-0"
                            >
                                <ScanBarcode size={22} />
                            </button>
                        </div>

                        <SearchDropdown
                            open={showResults && !!filter.trim()}
                            onClose={() => setShowResults(false)}
                            loading={isAddingItem}
                            hasResults={(searchResults?.length ?? 0) > 0}
                            emptyMessage="لا توجد نتائج مطابقة"
                            className="z-50"
                        >
                            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                                <table className="w-full text-right text-xs border-collapse">
                                    <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                                        <tr className="text-slate-600 dark:text-gray-300">
                                            <th className="py-2 px-4 border-b dark:border-slate-700">الصنف</th>
                                            <th className="py-2 px-4 border-b dark:border-slate-700 w-32 text-center">رقم القطعة/SKU</th>
                                            <th className="py-2 px-4 border-b dark:border-slate-700 w-24 text-center">المقاس</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                        {(searchResults as unknown as Product[])?.map((p: Product) => (
                                            <tr
                                                key={p.id}
                                                onClick={() => {
                                                    handleAddItem(p);
                                                    setShowResults(false);
                                                }}
                                                className="hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                            >
                                                <td className="py-3 px-4 font-bold">{p.name_ar || p.name}</td>
                                                <td className="py-3 px-4 text-center font-mono text-gray-500">{p.part_number || p.sku || '-'}</td>
                                                <td className="py-3 px-4 text-center text-blue-500 font-bold">{p.size || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </SearchDropdown>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 pb-16 custom-scrollbar" onClick={() => setShowResults(false)}>
                <div className="max-w-[1600px] mx-auto space-y-4">
                    <AuditStats stats={stats} session={session} />

                    <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-gray-100 dark:border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-sm">
                        <div className="flex items-center gap-2 px-3 border-l dark:border-slate-800 text-gray-400">
                            <Layers size={16} />
                            <span className="text-[10px] font-bold whitespace-nowrap">تصفية حسب الفئة:</span>
                        </div>
                        <button
                            onClick={() => setSelectedCategory(null)}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${!selectedCategory ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-gray-50 dark:bg-slate-800 text-gray-500'}`}
                        >
                            الكل
                        </button>
                        {categories?.map((cat: { id: string; name: string }) => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.name)}
                                className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${selectedCategory === cat.name ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-gray-50 dark:bg-slate-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>

                    <AuditItemsTable
                        items={sessionItems.length > 0 ? sessionItems : watchedItems}
                        register={register}
                        filter={""}
                        category={selectedCategory}
                        isCompleted={session?.status === 'completed'}
                        onRemoveItem={setItemToDelete}
                    />
                </div>
            </div>

            {isScannerOpen && (
                <ScannerOverlay
                    onScan={handleScan}
                    onClose={() => setIsScannerOpen(false)}
                />
            )}

            <ConfirmModal
                isOpen={!!itemToDelete}
                onClose={() => setItemToDelete(null)}
                onConfirm={confirmRemoveItem}
                title="إزالة الصنف من الجرد"
                message="هل أنت متأكد من رغبتك في إزالة هذا الصنف من جلسة الجرد الميدانية الحالية؟"
                variant="danger"
                confirmLabel="نعم، إزالة الصنف"
                isLoading={isRemovingItem}
            />

            <ConfirmModal
                isOpen={showBulkConfirm}
                onClose={() => setShowBulkConfirm(false)}
                onConfirm={handleBulkAddWarehouseProducts}
                title="جرد كامل المستودع"
                message="سيتم إضافة جميع منتجات هذا المستودع إلى جلسة الجرد الحالية تلقائياً. هذه العملية قد تستغرق بعض الوقت. هل تريد المتابعة؟"
                variant="warning"
                confirmLabel="نعم، أضف كل المنتجات"
            />
        </div>
    );
};

export default AuditSessionPage;
