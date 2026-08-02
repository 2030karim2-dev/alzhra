import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNotificationStore, useSoundStore } from './store';
import { logger } from '../../core/utils/logger';

vi.mock('../../core/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Notification Store', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [], unreadCount: 0 });
  });

  describe('addNotification', () => {
    it('should add a notification with generated id and timestamp', () => {
      useNotificationStore.getState().addNotification({
        companyId: 'company-1',
        title: 'Test Title',
        message: 'Test Message',
        type: 'info',
      });

      const { notifications } = useNotificationStore.getState();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].id).toBeTruthy();
      expect(notifications[0].title).toBe('Test Title');
      expect(notifications[0].message).toBe('Test Message');
      expect(notifications[0].type).toBe('info');
      expect(notifications[0].companyId).toBe('company-1');
      expect(notifications[0].isRead).toBe(false);
      expect(typeof notifications[0].timestamp).toBe('number');
    });

    it('should increment unreadCount when adding a notification', () => {
      useNotificationStore.getState().addNotification({
        companyId: 'company-1',
        title: 'T1',
        message: 'M1',
        type: 'info',
      });

      expect(useNotificationStore.getState().unreadCount).toBe(1);
    });

    it('should prepend notifications (newest first)', () => {
      useNotificationStore.getState().addNotification({
        companyId: 'c1', title: 'First', message: 'M1', type: 'info',
      });
      useNotificationStore.getState().addNotification({
        companyId: 'c1', title: 'Second', message: 'M2', type: 'warning',
      });

      const { notifications } = useNotificationStore.getState();
      expect(notifications).toHaveLength(2);
      expect(notifications[0].title).toBe('Second');
      expect(notifications[1].title).toBe('First');
    });

    it('should cap notifications at 100', () => {
      for (let i = 0; i < 110; i++) {
        useNotificationStore.getState().addNotification({
          companyId: 'c1',
          title: `N${i}`,
          message: `M${i}`,
          type: 'info',
        });
      }

      const { notifications } = useNotificationStore.getState();
      expect(notifications.length).toBeLessThanOrEqual(100);
    });

    it('should skip adding notification without companyId', () => {
      useNotificationStore.getState().addNotification({
        companyId: '',
        title: 'No Company',
        message: 'M',
        type: 'info',
      });

      const { notifications } = useNotificationStore.getState();
      expect(notifications).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        'Notifications',
        'addNotification called without companyId — skipping',
      );
    });

    it('should support different notification types', () => {
      useNotificationStore.getState().addNotification({
        companyId: 'c1', title: 'Warning', message: 'W', type: 'warning',
      });
      useNotificationStore.getState().addNotification({
        companyId: 'c1', title: 'Error', message: 'E', type: 'error',
      });
      useNotificationStore.getState().addNotification({
        companyId: 'c1', title: 'Success', message: 'S', type: 'success',
      });
      useNotificationStore.getState().addNotification({
        companyId: 'c1', title: 'Info', message: 'I', type: 'info',
      });

      const { notifications } = useNotificationStore.getState();
      expect(notifications).toHaveLength(4);
    });
  });

  describe('getCompanyNotifications', () => {
    it('should filter notifications by companyId', () => {
      useNotificationStore.setState({
        notifications: [
          { id: '1', companyId: 'c1', title: 'A', message: 'M', type: 'info' as const, timestamp: 100, isRead: false },
          { id: '2', companyId: 'c2', title: 'B', message: 'M', type: 'info' as const, timestamp: 200, isRead: false },
          { id: '3', companyId: 'c1', title: 'C', message: 'M', type: 'warning' as const, timestamp: 300, isRead: false },
        ],
      });

      const result = useNotificationStore.getState().getCompanyNotifications('c1');
      expect(result).toHaveLength(2);
      expect(result.map((n) => n.id)).toEqual(['1', '3']);
    });

    it('should return empty array for company with no notifications', () => {
      useNotificationStore.setState({
        notifications: [{ id: '1', companyId: 'c1', title: 'A', message: 'M', type: 'info' as const, timestamp: 100, isRead: false }],
      });

      const result = useNotificationStore.getState().getCompanyNotifications('c2');
      expect(result).toEqual([]);
    });
  });

  describe('getCompanyUnreadCount', () => {
    it('should count only unread notifications for a company', () => {
      useNotificationStore.setState({
        notifications: [
          { id: '1', companyId: 'c1', title: 'A', message: 'M', type: 'info' as const, timestamp: 100, isRead: false },
          { id: '2', companyId: 'c1', title: 'B', message: 'M', type: 'info' as const, timestamp: 200, isRead: true },
          { id: '3', companyId: 'c1', title: 'C', message: 'M', type: 'info' as const, timestamp: 300, isRead: false },
        ],
      });

      const count = useNotificationStore.getState().getCompanyUnreadCount('c1');
      expect(count).toBe(2);
    });

    it('should return 0 when all notifications are read', () => {
      useNotificationStore.setState({
        notifications: [{ id: '1', companyId: 'c1', title: 'A', message: 'M', type: 'info' as const, timestamp: 100, isRead: true }],
      });

      expect(useNotificationStore.getState().getCompanyUnreadCount('c1')).toBe(0);
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', () => {
      useNotificationStore.setState({
        notifications: [{ id: 'n1', companyId: 'c1', title: 'T', message: 'M', type: 'info' as const, timestamp: 100, isRead: false }],
        unreadCount: 1,
      });

      useNotificationStore.getState().markAsRead('n1');

      const { notifications, unreadCount } = useNotificationStore.getState();
      expect(notifications[0].isRead).toBe(true);
      expect(unreadCount).toBe(0);
    });

    it('should not affect other notifications', () => {
      useNotificationStore.setState({
        notifications: [
          { id: 'n1', companyId: 'c1', title: 'A', message: 'M', type: 'info' as const, timestamp: 100, isRead: false },
          { id: 'n2', companyId: 'c1', title: 'B', message: 'M', type: 'info' as const, timestamp: 200, isRead: false },
        ],
        unreadCount: 2,
      });

      useNotificationStore.getState().markAsRead('n1');

      const { notifications, unreadCount } = useNotificationStore.getState();
      expect(notifications[0].isRead).toBe(true);
      expect(notifications[1].isRead).toBe(false);
      expect(unreadCount).toBe(1);
    });

    it('should not throw for non-existent notification id', () => {
      expect(() => useNotificationStore.getState().markAsRead('nonexistent')).not.toThrow();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', () => {
      useNotificationStore.setState({
        notifications: [
          { id: '1', companyId: 'c1', title: 'A', message: 'M', type: 'info' as const, timestamp: 100, isRead: false },
          { id: '2', companyId: 'c1', title: 'B', message: 'M', type: 'info' as const, timestamp: 200, isRead: false },
        ],
        unreadCount: 2,
      });

      useNotificationStore.getState().markAllAsRead();

      const { notifications, unreadCount } = useNotificationStore.getState();
      expect(notifications.every((n) => n.isRead)).toBe(true);
      expect(unreadCount).toBe(0);
    });

    it('should mark only company notifications as read when companyId provided', () => {
      useNotificationStore.setState({
        notifications: [
          { id: '1', companyId: 'c1', title: 'A', message: 'M', type: 'info' as const, timestamp: 100, isRead: false },
          { id: '2', companyId: 'c2', title: 'B', message: 'M', type: 'info' as const, timestamp: 200, isRead: false },
          { id: '3', companyId: 'c1', title: 'C', message: 'M', type: 'info' as const, timestamp: 300, isRead: false },
        ],
        unreadCount: 3,
      });

      useNotificationStore.getState().markAllAsRead('c1');

      const { notifications, unreadCount } = useNotificationStore.getState();
      expect(notifications[0].isRead).toBe(true);
      expect(notifications[1].isRead).toBe(false);
      expect(notifications[2].isRead).toBe(true);
      expect(unreadCount).toBe(1);
    });
  });

  describe('deleteNotification', () => {
    it('should delete a notification by id', () => {
      useNotificationStore.setState({
        notifications: [
          { id: 'n1', companyId: 'c1', title: 'A', message: 'M', type: 'info' as const, timestamp: 100, isRead: false },
          { id: 'n2', companyId: 'c1', title: 'B', message: 'M', type: 'info' as const, timestamp: 200, isRead: false },
        ],
        unreadCount: 2,
      });

      useNotificationStore.getState().deleteNotification('n1');

      const { notifications, unreadCount } = useNotificationStore.getState();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].id).toBe('n2');
      expect(unreadCount).toBe(1);
    });

    it('should handle deleting non-existent notification', () => {
      useNotificationStore.setState({
        notifications: [{ id: 'n1', companyId: 'c1', title: 'A', message: 'M', type: 'info' as const, timestamp: 100, isRead: false }],
        unreadCount: 1,
      });

      expect(() => useNotificationStore.getState().deleteNotification('nonexistent')).not.toThrow();
      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });
  });

  describe('clearAll', () => {
    it('should clear all notifications', () => {
      useNotificationStore.setState({
        notifications: [
          { id: '1', companyId: 'c1', title: 'A', message: 'M', type: 'info' as const, timestamp: 100, isRead: false },
          { id: '2', companyId: 'c2', title: 'B', message: 'M', type: 'info' as const, timestamp: 200, isRead: false },
        ],
        unreadCount: 2,
      });

      useNotificationStore.getState().clearAll();

      const { notifications, unreadCount } = useNotificationStore.getState();
      expect(notifications).toHaveLength(0);
      expect(unreadCount).toBe(0);
    });

    it('should clear only company notifications when companyId provided', () => {
      useNotificationStore.setState({
        notifications: [
          { id: '1', companyId: 'c1', title: 'A', message: 'M', type: 'info' as const, timestamp: 100, isRead: false },
          { id: '2', companyId: 'c2', title: 'B', message: 'M', type: 'info' as const, timestamp: 200, isRead: false },
          { id: '3', companyId: 'c1', title: 'C', message: 'M', type: 'info' as const, timestamp: 300, isRead: false },
        ],
        unreadCount: 3,
      });

      useNotificationStore.getState().clearAll('c1');

      const { notifications, unreadCount } = useNotificationStore.getState();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].id).toBe('2');
      expect(unreadCount).toBe(1);
    });
  });
});

describe('Sound Store', () => {
  beforeEach(() => {
    useSoundStore.setState({ isSoundEnabled: true, hasUserInteracted: false });
  });

  it('should initialize with sound enabled and no user interaction', () => {
    const { isSoundEnabled, hasUserInteracted } = useSoundStore.getState();
    expect(isSoundEnabled).toBe(true);
    expect(hasUserInteracted).toBe(false);
  });

  it('should toggle sound enabled', () => {
    useSoundStore.getState().toggleSound();

    const { isSoundEnabled, hasUserInteracted } = useSoundStore.getState();
    expect(isSoundEnabled).toBe(false);
    expect(hasUserInteracted).toBe(true);
  });

  it('should toggle sound back and forth', () => {
    useSoundStore.setState({ hasUserInteracted: true });

    expect(useSoundStore.getState().isSoundEnabled).toBe(true);

    useSoundStore.getState().toggleSound();
    expect(useSoundStore.getState().isSoundEnabled).toBe(false);

    useSoundStore.getState().toggleSound();
    expect(useSoundStore.getState().isSoundEnabled).toBe(true);
  });

  it('should set user interacted', () => {
    useSoundStore.getState().setUserInteracted();

    expect(useSoundStore.getState().hasUserInteracted).toBe(true);
  });

  it('should not play sound when sound is disabled', async () => {
    useSoundStore.setState({ isSoundEnabled: false, hasUserInteracted: true });

    await expect(useSoundStore.getState().playNotificationSound()).resolves.toBeUndefined();
  });

  it('should not play sound when user has not interacted', async () => {
    useSoundStore.setState({ isSoundEnabled: true, hasUserInteracted: false });

    await expect(useSoundStore.getState().playNotificationSound()).resolves.toBeUndefined();
  });
});
