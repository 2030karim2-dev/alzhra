import { supabase } from '../../../lib/supabaseClient';

export interface SuspendedOrderItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  price: number;
}

export const suspendedOrdersService = {
  async getSuspendedOrders(companyId: string, userId: string) {
    const { data, error } = await supabase
      .from('suspended_orders')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .order('suspended_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(order => ({
      id: order.id,
      items: order.items,
      customer: order.customer,
      time: new Date(order.suspended_at).toLocaleTimeString('ar-SA'),
    }));
  },

  async suspendOrder(companyId: string, branchId: string | null, userId: string, items: any[], customer: any) {
    const { data, error } = await supabase
      .from('suspended_orders')
      .insert({
        company_id: companyId,
        branch_id: branchId,
        user_id: userId,
        items: JSON.stringify(items),
        customer: customer ? JSON.stringify(customer) : null,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  },

  async resumeOrder(orderId: string) {
    const { data } = await supabase
      .from('suspended_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (data) {
      await supabase.from('suspended_orders').delete().eq('id', orderId);
    }

    return data ? {
      id: data.id,
      items: typeof data.items === 'string' ? JSON.parse(data.items) : data.items,
      customer: typeof data.customer === 'string' ? JSON.parse(data.customer) : data.customer,
      time: new Date(data.suspended_at).toLocaleTimeString('ar-SA'),
    } : null;
  },

  async removeSuspended(orderId: string) {
    await supabase.from('suspended_orders').delete().eq('id', orderId);
  },
};
