import { useEffect, useRef, useState } from 'react';
import { useBackupActions } from '../hooks';
import { settingsService } from '../service';
import { AutoBackupConfig } from '../types.ts';
import { useFeedbackStore } from '../../feedback/store';
import { GoogleDriveService } from '../services/googleDriveService';

export const useBackupManager = () => {
    const { exportData, importData } = useBackupActions();
    const { showToast } = useFeedbackStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isExporting, setIsExporting] = useState(false);
    const [isExportingToDrive, setIsExportingToDrive] = useState(false);
    const [autoConfig, setAutoConfig] = useState<AutoBackupConfig>({} as AutoBackupConfig);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [stats, setStats] = useState<any>(null);
    const [logs, setLogs] = useState<any[]>([]);

    useEffect(() => {
        settingsService.getAutoBackupConfig().then(setAutoConfig);
        settingsService.getStorageStats().then(setStats);
        settingsService.getBackupLogs().then(setLogs);
    }, []);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            await exportData();
        } finally {
            setIsExporting(false);
        }
    };

    const handleDriveExport = async () => {
        setIsExportingToDrive(true);
        try {
            const token = await GoogleDriveService.authenticateAndGetToken();
            showToast("جاري تجهيز بيانات النظام...", 'info');
            const data = await settingsService.exportSystemData();
            showToast("جاري الرفع إلى Google Drive...", 'info');
            const fileName = `AlZahra_Backup_${new Date().toISOString().split('T')[0]}`;
            await GoogleDriveService.uploadJSONFile(fileName, data, token);
            showToast("تم الرفع إلى حسابك في جوجل درايف بنجاح", "success");
        } catch (error: unknown) {
            const err = error as Error;
            showToast(err.message || "حدث خطأ أثناء الرفع إلى جوجل", "error");
        } finally {
            setIsExportingToDrive(false);
        }
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (window.confirm("تنبيه حرج: استيراد البيانات سيقوم بحذف كافة السجلات الحالية نهائياً واستبدالها بمحتويات الملف. هل تود الاستمرار؟")) {
                importData(file);
            }
        }
        e.target.value = '';
    };

    const saveConfig = () => {
        setIsSavingConfig(true);
        setTimeout(() => {
            settingsService.saveAutoBackupConfig(autoConfig);
            setIsSavingConfig(false);
            showToast("تم حفظ إعدادات النسخ التلقائي", "success");
        }, 600);
    };

    return {
        state: { isExporting, isExportingToDrive, autoConfig, isSavingConfig, stats, logs },
        actions: { setAutoConfig, handleExport, handleDriveExport, handleImportClick, handleFileChange, saveConfig },
        refs: { fileInputRef }
    };
};
