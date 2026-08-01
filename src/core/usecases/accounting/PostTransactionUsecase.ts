import { journalEntrySchema } from '../../validators';
import { journalsApi } from '../../../features/accounting/api/journalsApi';
import { PostTransactionInput } from '../../types/financial';

export class PostTransactionUsecase {
  static async execute(data: PostTransactionInput, companyId: string, userId: string): Promise<string> {
    // 1. التحقق من صحة البيانات (Client-Side Validation)
    const validatedData = journalEntrySchema.parse(data);

    // 2. الترحيل عبر المحرك المركزي (Server-Side Execution)
    // نستخدم RPC الآن بدلاً من الإدخال المباشر لضمان الـ Atomicity
    const journalId = await journalsApi.postJournalEntryRPC(
      companyId,
      userId,
      {
        date: validatedData.date,
        description: validatedData.description,
        lines: validatedData.lines.map((line) => ({
          account_id: line.account_id,
          debit: line.debit_amount ?? 0,
          credit: line.credit_amount ?? 0,
          description: line.description,
        })),
        reference_type: validatedData.reference_type || 'manual',
      }
    );

    return journalId;
  }
}