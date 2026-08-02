export interface SharedProduct {
  id: string;
  name_ar: string;
  sku: string;
  part_number?: string;
  brand?: string;
  sale_price: number;
  cost_price: number;
  unit: string;
  image_url?: string;
  barcode?: string;
}
